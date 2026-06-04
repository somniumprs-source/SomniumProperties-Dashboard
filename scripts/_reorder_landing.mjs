import { promises as fs } from 'node:fs'

const path = 'somnium-investidores.html'
const content = await fs.readFile(path, 'utf8')

// Marcadores de seccao (comentarios no inicio de linha, coluna 0), por ordem no ficheiro.
const markers = [
  'HERO',
  'TRUST STRIP',
  'IDENTIFICAÇÃO · 3 AVATARES ESPECÍFICOS',
  'TABELA COMPARATIVA',
  'ACOMPANHAMENTO PROFISSIONAL (DASHBOARD)',
  'COMO FUNCIONA',
  'CTA INLINE · após Processo',
  'MODELOS',
  'TESTEMUNHO',
  'VALUE STACK',
  'CTA INLINE · após Value Stack',
  'PORQUE SOMNIUM',
  'NÚMEROS / SOCIAL PROOF',
  'PROJETO EM CURSO · FOTOS',
  'GEOGRAFIA',
  'O NOSSO COMPROMISSO · GARANTIAS',
  'CTA INLINE · após Garantias',
  'RISCO · HONESTIDADE',
  'FAQ · REORDENADO POR IMPACTO',
  'SCARCITY STRIP',
  'CTA FINAL',
]

// Localizar cada marcador exactamente uma vez.
const positions = markers.map((m) => {
  const tag = `<!-- ${m} -->`
  const idx = content.indexOf(tag)
  if (idx === -1) throw new Error(`Marcador nao encontrado: ${tag}`)
  if (content.indexOf(tag, idx + 1) !== -1) throw new Error(`Marcador duplicado: ${tag}`)
  return { m, idx }
})

const head = content.slice(0, positions[0].idx)
const chunks = {}
for (let i = 0; i < positions.length; i++) {
  const start = positions[i].idx
  const end = i + 1 < positions.length ? positions[i + 1].idx : content.length
  chunks[positions[i].m] = content.slice(start, end)
}

// Nova ordem (arco: gancho -> quem -> oferta -> diferenciacao -> prova -> confianca -> fecho)
const order = [
  'HERO',
  'TRUST STRIP',
  'IDENTIFICAÇÃO · 3 AVATARES ESPECÍFICOS',
  'MODELOS',
  'CTA INLINE · após Processo',
  'TABELA COMPARATIVA',
  'PORQUE SOMNIUM',
  'NÚMEROS / SOCIAL PROOF',
  'PROJETO EM CURSO · FOTOS',
  'ACOMPANHAMENTO PROFISSIONAL (DASHBOARD)',
  'VALUE STACK',
  'CTA INLINE · após Value Stack',
  'O NOSSO COMPROMISSO · GARANTIAS',
  'RISCO · HONESTIDADE',
  'TESTEMUNHO',
  'CTA INLINE · após Garantias',
  'GEOGRAFIA',
  'COMO FUNCIONA',
  'FAQ · REORDENADO POR IMPACTO',
  'SCARCITY STRIP',
  'CTA FINAL',
]

// Invariante: a nova ordem tem de conter exactamente os mesmos marcadores.
if (order.length !== markers.length) throw new Error('order != markers length')
for (const m of markers) if (!order.includes(m)) throw new Error(`order falta: ${m}`)

const out = head + order.map((m) => chunks[m]).join('')

// Invariante forte: permutacao -> comprimento identico.
if (out.length !== content.length) {
  throw new Error(`Comprimento mudou: ${content.length} -> ${out.length}`)
}

await fs.writeFile(path, out, 'utf8')
console.log('OK reordenado. Comprimento preservado:', out.length)
