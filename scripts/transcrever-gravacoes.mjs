#!/usr/bin/env node
/**
 * Worker de transcricao de gravacoes de chamadas (launchd).
 *
 * Fluxo (corre a cada ~3 min via com.somnium.transcrever-gravacoes):
 *   1. GET  /crm/gravacoes/pendentes        -> lista + signed URL do audio
 *   2. POST /crm/gravacoes/:id/iniciar-transcricao  (lock optimista)
 *   3. download do audio -> ficheiro temporario
 *   4. Whisper LOCAL (whisper.cpp ou whisper python) -> texto
 *   5. POST /crm/gravacoes/:id/transcricao   { transcricao, duracao_seg }
 *      (o backend dispara a analise comercial por Claude automaticamente)
 *   6. em caso de erro -> POST /crm/gravacoes/:id/falha
 *
 * Sem dependencias npm: usa fetch nativo (Node 18+) + ffmpeg/whisper via CLI.
 *
 * Configuracao (variaveis de ambiente, definidas no plist):
 *   SOMNIUM_API_BASE   base das Edge Functions (default: projecto Somnium)
 *   SUPABASE_ANON_KEY  chave anon para o gateway das functions
 *   WHISPER_MODEL      caminho para o modelo ggml (.bin) do whisper.cpp
 *   WHISPER_BIN        binario whisper.cpp (default: whisper-cli)
 *   WHISPER_PY         binario do whisper python (fallback, default: whisper)
 *   WHISPER_PY_MODEL   modelo do whisper python (default: medium)
 *   FFMPEG_BIN/FFPROBE_BIN  (default: ffmpeg/ffprobe no PATH)
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const API_BASE = (process.env.SOMNIUM_API_BASE || 'https://mjgusjuougzoeiyavsor.supabase.co/functions/v1').replace(/\/$/, '')
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ''
const WHISPER_MODEL = process.env.WHISPER_MODEL || ''
const WHISPER_BIN = process.env.WHISPER_BIN || 'whisper-cli'
const WHISPER_PY = process.env.WHISPER_PY || 'whisper'
const WHISPER_PY_MODEL = process.env.WHISPER_PY_MODEL || 'medium'
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_BIN || 'ffprobe'

// Sob launchd, o fd de log redireccionado pode devolver EAGAIN/UNKNOWN numa
// escrita; sem listener de 'error' isso emite um 'error' nao tratado e mata o
// worker a meio (deixando a gravacao presa em a_transcrever). Tornamos a escrita
// resiliente: ignoramos erros de escrita no stdout/stderr.
process.stdout.on('error', () => {})
process.stderr.on('error', () => {})
const safeWrite = (stream, ...a) => {
  try { stream.write(`[${new Date().toISOString()}] ${a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}\n`) } catch { /* ignore */ }
}
const log = (...a) => safeWrite(process.stdout, ...a)
const err = (...a) => safeWrite(process.stderr, ...a)

function apiHeaders(extra = {}) {
  const h = { ...extra }
  // O crm aceita a INTERNAL_API_KEY (x-api-key) nas rotas /gravacoes.
  if (INTERNAL_API_KEY) h['x-api-key'] = INTERNAL_API_KEY
  // apikey/anon: opcional, util se o gateway das functions a exigir.
  if (ANON_KEY) { h['apikey'] = ANON_KEY; h['Authorization'] = `Bearer ${ANON_KEY}` }
  return h
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: apiHeaders(opts.headers) })
  const txt = await res.text()
  let body
  try { body = txt ? JSON.parse(txt) : null } catch { body = txt }
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${typeof body === 'string' ? body : (body?.error || txt)}`)
  return body
}

// Corre um comando e devolve { code, stdout, stderr }. Nunca lanca.
function run(cmd, args, { timeoutMs = 30 * 60_000 } = {}) {
  return new Promise((resolve) => {
    let stdout = '', stderr = ''
    let child
    try { child = spawn(cmd, args) } catch (e) { return resolve({ code: -1, stdout, stderr: String(e.message) }) }
    const t = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, timeoutMs)
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', e => { clearTimeout(t); resolve({ code: -1, stdout, stderr: String(e.message) }) })
    child.on('close', code => { clearTimeout(t); resolve({ code, stdout, stderr }) })
  })
}

async function binExists(bin) {
  const r = await run('command', ['-v', bin], { timeoutMs: 5000 })
  if (r.code === 0 && r.stdout.trim()) return true
  // command -v pode nao existir como binario: tenta `which`
  const w = await run('which', [bin], { timeoutMs: 5000 })
  return w.code === 0 && !!w.stdout.trim()
}

async function getDuracaoSeg(file) {
  const r = await run(FFPROBE, ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeoutMs: 60_000 })
  const v = parseFloat((r.stdout || '').trim())
  return Number.isFinite(v) ? Math.round(v) : null
}

// Transcreve um ficheiro de audio -> texto. Tenta whisper.cpp (rapido no Mac),
// com fallback para o whisper python. Lanca se nenhum estiver disponivel.
async function transcrever(audioFile, workDir) {
  const useCpp = WHISPER_MODEL && existsSync(WHISPER_MODEL) && await binExists(WHISPER_BIN)
  if (useCpp) {
    if (!await binExists(FFMPEG)) throw new Error('ffmpeg em falta (necessario para whisper.cpp). Instala: brew install ffmpeg')
    const wav = join(workDir, 'audio16k.wav')
    const conv = await run(FFMPEG, ['-y', '-i', audioFile, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], { timeoutMs: 10 * 60_000 })
    if (conv.code !== 0 || !existsSync(wav)) throw new Error(`ffmpeg falhou: ${conv.stderr.slice(-300)}`)
    const outBase = join(workDir, 'out')
    const r = await run(WHISPER_BIN, ['-m', WHISPER_MODEL, '-l', 'pt', '-nt', '-otxt', '-of', outBase, wav])
    if (r.code !== 0) throw new Error(`whisper.cpp falhou: ${r.stderr.slice(-300)}`)
    const txtPath = `${outBase}.txt`
    if (!existsSync(txtPath)) throw new Error('whisper.cpp nao gerou .txt')
    return readFileSync(txtPath, 'utf8').trim()
  }

  // Fallback: whisper python (gere mp3/m4a directamente via ffmpeg interno).
  if (await binExists(WHISPER_PY)) {
    const r = await run(WHISPER_PY, [
      audioFile, '--model', WHISPER_PY_MODEL, '--language', 'Portuguese',
      '--task', 'transcribe', '--output_format', 'txt', '--output_dir', workDir, '--verbose', 'False',
    ])
    if (r.code !== 0) throw new Error(`whisper python falhou: ${r.stderr.slice(-300)}`)
    // O whisper python nomeia o output pelo basename do input.
    const base = audioFile.split('/').pop().replace(/\.[^.]+$/, '')
    const txtPath = join(workDir, `${base}.txt`)
    if (!existsSync(txtPath)) throw new Error('whisper python nao gerou .txt')
    return readFileSync(txtPath, 'utf8').trim()
  }

  throw new Error('Nenhum motor Whisper disponivel. Instala whisper.cpp (brew install whisper-cpp + modelo ggml) e define WHISPER_MODEL, ou whisper python (pip install openai-whisper).')
}

async function processarUma(g) {
  log(`Gravacao ${g.id} (consultor: ${g.consultor_nome || g.consultor_id})`)
  // Lock: so prossegue se conseguiu marcar a_transcrever.
  const lock = await api(`/crm/gravacoes/${g.id}/iniciar-transcricao`, { method: 'POST' })
  if (!lock?.ok) { log('  ja esta a ser processada por outro worker, salto.'); return }

  const work = mkdtempSync(join(tmpdir(), 'somnium-grav-'))
  try {
    if (!g.audio_url) throw new Error('sem signed URL para o audio')
    // Download do audio.
    const r = await fetch(g.audio_url)
    if (!r.ok) throw new Error(`download audio HTTP ${r.status}`)
    const ext = (g.ficheiro_nome?.match(/\.[a-z0-9]+$/i)?.[0] || '.mp3').toLowerCase()
    const audioFile = join(work, `audio${ext}`)
    writeFileSync(audioFile, Buffer.from(await r.arrayBuffer()))
    log('  audio descarregado, a transcrever...')

    const duracao = await getDuracaoSeg(audioFile)
    const transcricao = await transcrever(audioFile, work)
    if (!transcricao) throw new Error('transcricao vazia')
    log(`  transcrito (${transcricao.length} chars, ${duracao ?? '?'}s). A enviar + analise IA...`)

    await api(`/crm/gravacoes/${g.id}/transcricao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcricao, duracao_seg: duracao }),
    })
    log('  concluido (transcrito + analisado).')
  } catch (e) {
    err(`  ERRO: ${e.message}`)
    try { await api(`/crm/gravacoes/${g.id}/falha`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ erro: e.message }) }) } catch {}
  } finally {
    try { rmSync(work, { recursive: true, force: true }) } catch {}
  }
}

async function main() {
  let pendentes
  try { pendentes = await api('/crm/gravacoes/pendentes') } catch (e) { err(`Falha a obter pendentes: ${e.message}`); process.exit(1) }
  if (!Array.isArray(pendentes) || pendentes.length === 0) { log('Sem gravacoes pendentes.'); return }
  log(`${pendentes.length} gravacao(oes) pendente(s).`)
  for (const g of pendentes) await processarUma(g)
  log('Ciclo concluido.')
}

main().catch(e => { err(e?.stack || e?.message || String(e)); process.exit(1) })
