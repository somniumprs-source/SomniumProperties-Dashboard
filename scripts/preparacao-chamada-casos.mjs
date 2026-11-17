// Corre os 4 casos de aceitação da preparação de chamada (SOP 23) com dados
// FICTÍCIOS, pelo mesmo caminho da produção: entradas -> prompt -> claude -p
// (como o worker da fila IA) -> validação no código.
//   node scripts/preparacao-chamada-casos.mjs <pasta-de-saída> [caso...]
// Não toca na BD.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  montarEntradas, preencherPrompt, limparResposta, validarDocumento, LINHA_FORA_SOP23, VERSAO_PROMPT, FICHEIRO_ANEXO_A,
} from '../supabase/functions/_shared/preparacaoChamadaRegras.js'
import { CASOS, AGORA } from './preparacao-chamada.fixtures.mjs'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const prompts = path.join(raiz, 'supabase/functions/crm/prompts')
const [saida = path.join(raiz, 'tmp-casos'), ...filtro] = process.argv.slice(2)
const CLAUDE = process.env.CLAUDE_BIN || 'claude'

function claude(prompt) {
  return new Promise((resolve, reject) => {
    const c = spawn(CLAUDE, ['-p', '--output-format', 'text', '--model', 'sonnet', '--tools', ''], { cwd: saida })
    let out = '', err = ''
    c.stdout.on('data', (d) => { out += d }); c.stderr.on('data', (d) => { err += d })
    c.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.slice(0, 300) || `claude saiu com ${code}`))))
    c.stdin.end(prompt)
  })
}

const QUEM = { formulario_curto: 'Alexandre Mendes', follow_up_passivo: 'João Abreu', discovery_decisor: 'Alexandre Mendes', negociacao: 'João Abreu' }

await mkdir(saida, { recursive: true })
const template = await readFile(path.join(prompts, VERSAO_PROMPT), 'utf8')
const anexoA = await readFile(path.join(prompts, FICHEIRO_ANEXO_A), 'utf8')
const nomes = Object.keys(CASOS).filter((n) => !filtro.length || filtro.includes(n))

await Promise.all(nomes.map(async (nome) => {
  const entradas = montarEntradas(CASOS[nome], { quemConduz: QUEM[nome], agora: AGORA })
  const prompt = preencherPrompt(template, anexoA, entradas)
  await writeFile(path.join(saida, `${nome}.prompt.md`), prompt)
  const conteudo = entradas.tipo === 'fora_sop23' ? LINHA_FORA_SOP23 : limparResposta(await claude(prompt))
  const alertas = validarDocumento(conteudo, entradas.tipo)
  await writeFile(path.join(saida, `${nome}.md`), conteudo)
  console.log(`${nome}: tipo=${entradas.tipo} alertas=${JSON.stringify(alertas)} (${conteudo.length} caracteres)`)
}))
