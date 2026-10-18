/**
 * Passa o campo livre «Notas» de consultores, investidores e parceiros para a linha do
 * tempo (tabelas de interações, canal 'Nota'), uma nota por data escrita.
 *
 *   node scripts/migrar_notas_pessoas.mjs            → só mostra o que faria
 *   node scripts/migrar_notas_pessoas.mjs --aplicar  → grava (uma transação)
 *
 * Regras:
 *   - cada linha que começa por uma data («23/3,10h:», «17/04/26:», «27 Janeiro:»,
 *     «[2026-03-12]», «Reunião 12/03», «Submissão Landing Page · dd/mm/aaaa, hh:mm»)
 *     abre uma nota nova com essa data; as linhas seguintes juntam-se a ela;
 *   - sem ano escrito: o ano mais recente que não fique no futuro;
 *   - texto antes da primeira data: uma nota com a data de criação da ficha;
 *   - blocos «[Google Form]» dos investidores não são notas: preenchem as
 *     colunas próprias que estiverem vazias e saem;
 *   - consultor cuja nota é só um link: vai para «Link da equipa», se estiver vazio;
 *   - o texto mantém-se tal como foi escrito; no fim o campo «Notas» fica vazio.
 */
import pg from 'pg'
import 'dotenv/config'
import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'

const APLICAR = process.argv.includes('--aplicar')
const HOJE = new Date()
const MESES = { janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 }
const FORM = {
  'Experiência': 'experiencia_imobiliario', 'Pref. contacto': 'preferencia_contacto', 'Tipo imóvel': 'tipo_imovel_preferido',
  'Localização': 'localizacao_preferida', 'Equipa obras': 'equipa_obras', 'ROI pretendido': 'roi_pretendido', 'ROI anualizado': 'roi_anualizado_pretendido',
}
const pad = n => String(n).padStart(2, '0')

function anoProvavel(d, m) {
  const y = HOJE.getFullYear()
  return new Date(y, m - 1, d) > HOJE ? y - 1 : y
}
function quando(y, m, d, h, mi) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  const dia = `${y}-${pad(m)}-${pad(d)}`
  return h != null && h !== '' ? `${dia}T${pad(+h)}:${pad(+(mi || 0))}` : dia
}

// Devolve { q, texto } se a linha abre uma nota com data; senão null.
function dataNoInicio(l) {
  let m
  if ((m = l.match(/^\[(\d{4})-(\d{2})-(\d{2})\]\s*(.*)$/))) return { q: quando(+m[1], +m[2], +m[3]), texto: m[4] }
  if ((m = l.match(/^Submissão Landing Page · (\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})/))) return { q: quando(+m[3], +m[2], +m[1], m[4], m[5]), texto: l }
  if ((m = l.match(/^Reunião (\d{1,2})\/(\d{1,2})\b/))) return { q: quando(anoProvavel(+m[1], +m[2]), +m[2], +m[1]), texto: l }
  if ((m = l.match(/^(\d{1,2}) (?:de )?([A-Za-zçÇ]+)\s*[:.]\s*(.*)$/)) && MESES[m[2].toLowerCase()]) {
    const mes = MESES[m[2].toLowerCase()]
    return { q: quando(anoProvavel(+m[1], mes), mes, +m[1]), texto: m[3] }
  }
  if ((m = l.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:,\s*|\s+)?(?:(\d{1,2})\s*[hH:]\s*(\d{2})?)?\s*[:.\-–]\s*(.*)$/))) {
    const d = +m[1], mes = +m[2]
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : anoProvavel(d, mes)
    const q = quando(y, mes, d, m[4], m[5])
    return q ? { q, texto: m[6] } : null
  }
  return null
}

function partir(notas, dataFicha) {
  const notasOut = [], form = {}
  let atual = null
  const fechar = () => { if (atual && atual.texto.trim()) notasOut.push({ q: atual.q, texto: atual.texto.trim() }); atual = null }
  const linhas = String(notas).replace(/\r/g, '').split('\n')
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim()
    if (/^---\s*Nova submissão Landing Page\s*---$/.test(l)) { fechar(); continue }
    if (l === '[Google Form]') {
      fechar()
      while (i + 1 < linhas.length) {
        const m = linhas[i + 1].trim().match(/^([^:]+):\s*(.*)$/)
        if (!m || !FORM[m[1]]) break
        if (m[2]) form[FORM[m[1]]] = m[2]
        i++
      }
      continue
    }
    const d = dataNoInicio(l)
    if (d) { fechar(); atual = { q: d.q, texto: d.texto }; continue }
    if (!atual) atual = { q: dataFicha, texto: '' }
    atual.texto += (atual.texto ? '\n' : '') + linhas[i].replace(/\s+$/, '')
  }
  fechar()
  return { notas: notasOut, form }
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query(APLICAR ? 'BEGIN' : 'BEGIN READ ONLY')
const backup = {}
let total = 0
try {
  for (const [tipo, tabela, inter, fk] of [['consultor', 'consultores', 'consultor_interacoes', 'consultor_id'], ['investidor', 'investidores', 'investidor_interacoes', 'investidor_id'], ['parceiro', 'parceiros', 'parceiro_interacoes', 'parceiro_id']]) {
    const extra = tipo === 'consultor' ? ', link_perfil' : tipo === 'investidor' ? `, ${Object.values(FORM).join(', ')}` : ''
    const { rows } = await c.query(`SELECT id, nome, notas, created_at${extra} FROM ${tabela} WHERE COALESCE(TRIM(notas), '') <> '' ORDER BY nome`)
    backup[tabela] = rows.map(r => ({ id: r.id, nome: r.nome, notas: r.notas }))
    for (const r of rows) {
      const dataFicha = String(r.created_at || '').slice(0, 10) || HOJE.toISOString().slice(0, 10)
      const sets = {}
      let notas
      if (tipo === 'consultor' && /^https?:\/\/\S+$/.test(r.notas.trim())) {
        notas = r.link_perfil ? [{ q: dataFicha, texto: r.notas.trim() }] : []
        if (!r.link_perfil) sets.link_perfil = r.notas.trim()
      } else {
        const p = partir(r.notas, dataFicha)
        notas = p.notas
        for (const [col, v] of Object.entries(p.form)) if (!r[col]) sets[col] = v
      }
      console.log(`\n${tipo} · ${r.nome}`)
      for (const n of notas) console.log(`   ${n.q.padEnd(16)} ${n.texto.replace(/\n/g, ' ⏎ ').slice(0, 110)}`)
      for (const [k, v] of Object.entries(sets)) console.log(`   ↳ ${k} = ${v}`)
      total += notas.length
      if (!APLICAR) continue
      const agora = new Date().toISOString()
      for (const n of notas) {
        await c.query(
          `INSERT INTO ${inter} (id, ${fk}, data_hora, canal, direcao, notas, autor, created_at, updated_at) VALUES ($1, $2, $3, 'Nota', 'Nota', $4, 'Notas da ficha', $5, $5)`,
          [randomUUID(), r.id, n.q, n.texto, agora]
        )
      }
      const cols = Object.keys(sets)
      await c.query(
        `UPDATE ${tabela} SET notas = NULL${cols.map((k, i) => `, ${k} = $${i + 2}`).join('')} WHERE id = $1`,
        [r.id, ...cols.map(k => sets[k])]
      )
    }
  }
  if (APLICAR) {
    const f = `/tmp/notas_pessoas_backup_${Date.now()}.json`
    writeFileSync(f, JSON.stringify(backup, null, 2))
    await c.query('COMMIT')
    console.log(`\nGravado: ${total} notas. Cópia do texto original em ${f}`)
  } else {
    await c.query('ROLLBACK')
    console.log(`\nSimulação: ${total} notas. Nada gravado (usa --aplicar).`)
  }
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  throw e
} finally {
  await c.end()
}
