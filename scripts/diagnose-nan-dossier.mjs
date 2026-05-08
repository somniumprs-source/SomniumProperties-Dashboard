#!/usr/bin/env node
// Diagnostico exaustivo: encontra o imovel que falha a gerar Dossier
// e identifica a calculacao exacta que produz NaN.
//
// Estrategia:
//   1. Conecta a BD via DATABASE_URL (.env)
//   2. Lista imoveis em "Enviar proposta ao investidor" + os que tem analise activa
//   3. Para cada imovel, tenta gerar o Dossier
//   4. Patch agressivo do PDFObject.number para LOGAR a stack trace quando NaN
//      aparece (em vez de converter silenciosamente para 0)
//   5. Relatorio final: lista imoveis com problema + lista de calculos NaN

import 'dotenv/config'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

// ──────────────────────────────────────────────────────────
// PATCH AGRESSIVO: capturar stack trace de cada NaN
// ──────────────────────────────────────────────────────────
const PDFDocument = (await import('pdfkit')).default

// O patch ja aplicado em pdfImovelDocs.js converte NaN -> 0. Para diagnostico,
// queremos VER cada vez que isso acontece. Vamos interceptar PDFObject internamente.
// Truque: PDFObject.number e chamado dentro do pdfkit.js, nao temos acesso directo.
// MAS — podemos interceptar o serialise via doc._write override.
// Em vez disso, vamos confiar no log [pdfkit-guard] ja em pdfkit.js.

// Activar instrumentacao tambem ao nivel dos metodos PDFKit
const ops = ['rect', 'roundedRect', 'circle', 'moveTo', 'lineTo', 'image', 'fontSize', 'lineWidth']
for (const op of ops) {
  const orig = PDFDocument.prototype[op]
  if (typeof orig !== 'function') continue
  PDFDocument.prototype[op] = function(...args) {
    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] === 'number' && !isFinite(args[i])) {
        const stack = new Error().stack.split('\n').slice(2, 6).join(' | ')
        nanEvents.push({ op, argIdx: i, value: args[i], stack: stack.replace(/file:\/\/[^)]+\//g, '') })
        args[i] = 0
      }
    }
    return orig.apply(this, args)
  }
}
const nanEvents = []

// Carregar generator
const { generateDoc } = await import('../src/db/pdfImovelDocs.js')

// ──────────────────────────────────────────────────────────
// Listar imoveis a testar
// ──────────────────────────────────────────────────────────
console.log('\n[1] Listando imoveis em "Enviar proposta ao investidor" + com analise activa...')
const { rows: imoveis } = await pool.query(`
  SELECT i.id, i.nome, i.estado
  FROM imoveis i
  WHERE i.estado = 'Enviar proposta ao investidor'
     OR EXISTS (SELECT 1 FROM analises a WHERE a.imovel_id = i.id AND a.activa = true)
  ORDER BY i.estado DESC, i.nome
`)
console.log(`Encontrados: ${imoveis.length} imoveis`)
for (const im of imoveis) console.log(`  · ${im.id.slice(0,8)} | "${im.nome}" | ${im.estado}`)

// ──────────────────────────────────────────────────────────
// Para cada imovel: gerar Dossier e capturar NaN
// ──────────────────────────────────────────────────────────
const results = []

async function streamToBuffer(doc) {
  const chunks = []
  return new Promise((resolve, reject) => {
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

console.log('\n[2] Gerando Dossier para cada imovel...')
for (const imRow of imoveis) {
  // Reset NaN events
  nanEvents.length = 0
  const r = { id: imRow.id, nome: imRow.nome, estado: imRow.estado, pdfBytes: 0, error: null, nanEvents: [] }

  try {
    const { rows: [imovel] } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [imRow.id])
    const { rows: [analise] } = await pool.query(
      'SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1',
      [imRow.id]
    ).catch(() => ({ rows: [null] }))

    const imForRender = {
      ...imovel,
      _orcamento: undefined, // deixa preload tentar
      _version: 1,
      _generatedAt: new Date().toISOString(),
      _documentId: 'diag-' + imRow.id.slice(0,8),
      _tipoLabel: 'Dossier de Investimento',
      _pdfHashShort: 'diagnostic',
    }
    const doc = await generateDoc('dossier_investidor', imForRender, analise)
    const buf = await streamToBuffer(doc)
    r.pdfBytes = buf.length
    r.nanEvents = [...nanEvents]
  } catch (e) {
    r.error = e.message
    r.errorStack = e.stack?.split('\n').slice(0, 4).join('\n')
    r.nanEvents = [...nanEvents]
  }
  results.push(r)
}

// ──────────────────────────────────────────────────────────
// Relatorio
// ──────────────────────────────────────────────────────────
console.log('\n[3] Relatorio:\n')
console.log('| imovel id | nome | estado | bytes | NaN events | erro |')
console.log('|---|---|---|---|---|---|')
for (const r of results) {
  console.log(`| ${r.id.slice(0,8)} | ${r.nome?.slice(0,30)} | ${r.estado?.slice(0,20)} | ${r.pdfBytes} | ${r.nanEvents.length} | ${r.error || '—'} |`)
}

const problematicos = results.filter(r => r.nanEvents.length > 0 || r.error)
console.log(`\n[4] Problematicos (${problematicos.length}):\n`)
for (const r of problematicos) {
  console.log(`──────────────────────────────────────`)
  console.log(`IMOVEL: "${r.nome}" (${r.id})`)
  if (r.error) {
    console.log(`ERRO: ${r.error}`)
    console.log(r.errorStack || '')
  }
  console.log(`NaN events (${r.nanEvents.length}):`)
  // Agrupar por (op, argIdx)
  const grouped = {}
  for (const ev of r.nanEvents) {
    const key = `${ev.op}#${ev.argIdx}`
    grouped[key] = (grouped[key] || 0) + 1
  }
  for (const [k, count] of Object.entries(grouped)) {
    console.log(`  · ${k}: ${count}x`)
  }
  // Stack do primeiro
  if (r.nanEvents[0]) {
    console.log('Stack do primeiro:')
    console.log(`  ${r.nanEvents[0].stack}`)
  }
}

await pool.end()
console.log('\n[5] Diagnostico completo.')
