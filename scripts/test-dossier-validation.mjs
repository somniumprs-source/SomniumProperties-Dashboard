#!/usr/bin/env node
// Validacao automatica do Dossier de Investimento + Proposta Anonima.
//
// Executa:
//   node scripts/test-dossier-validation.mjs
//
// Sem dependencias externas. Cobre:
//   1. Smoke test puro de metrics.js / contentHash.js
//   2. Smoke test de dataResolver.js (fonte unica via calcAnalise)
//   3. Geracao real de Dossier + Anonima e inspeccao dos bytes
//   4. Coerencia cross-doc (Dossier e Anonima leem o mesmo deal)
//   5. Anonimato (nome do imovel nao aparece na Anonima nem na metadata)
//   6. Metadata do PDF (Title, Author)
//   7. Presenca de MOIC e Pressupostos no Dossier

// Necessario antes de importar qualquer coisa que traga pg.js:
//   pg.js faz process.exit(1) sem DATABASE_URL.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://localhost:5432/dummy_for_validation'
}

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

import { computeMOIC, computePayback, formatMOIC, formatPayback } from '../src/db/dossier/metrics.js'
import { computeContentHash, shortHash } from '../src/db/dossier/contentHash.js'
import { resolveDealData } from '../src/db/dossier/dataResolver.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'tmp')

let passed = 0
let failed = 0
const fails = []

function test(name, fn) {
  try {
    const r = fn()
    if (r && typeof r.then === 'function') {
      // Async — caller resolves manually with await
      throw new Error(`test "${name}" e async — usar testAsync`)
    }
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
    fails.push({ name, error: e })
  }
}

async function testAsync(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
    fails.push({ name, error: e })
  }
}

// ─────────────────────────────────────────────────────────────
// 1. metrics.js
// ─────────────────────────────────────────────────────────────
console.log('\n[1] metrics.js')

test('computeMOIC: lucro positivo', () => {
  const m = computeMOIC(100000, 40000)
  assert.strictEqual(Math.round(m * 100) / 100, 1.4)
})
test('computeMOIC: lucro zero', () => {
  assert.strictEqual(computeMOIC(100000, 0), 1)
})
test('computeMOIC: lucro negativo', () => {
  assert.strictEqual(computeMOIC(100000, -20000), 0.8)
})
test('computeMOIC: capital invalido devolve null', () => {
  assert.strictEqual(computeMOIC(0, 10000), null)
  assert.strictEqual(computeMOIC(null, 10000), null)
  assert.strictEqual(computeMOIC(-5, 10000), null)
})
test('computePayback: lucro positivo devolve meses', () => {
  assert.strictEqual(computePayback({ meses: 6, lucroLiquido: 25000 }), 6)
})
test('computePayback: lucro zero ainda devolve meses', () => {
  assert.strictEqual(computePayback({ meses: 6, lucroLiquido: 0 }), 6)
})
test('computePayback: lucro negativo devolve null', () => {
  assert.strictEqual(computePayback({ meses: 6, lucroLiquido: -10 }), null)
})
test('computePayback: meses invalidos devolve null', () => {
  assert.strictEqual(computePayback({ meses: 0, lucroLiquido: 1000 }), null)
  assert.strictEqual(computePayback({ meses: null, lucroLiquido: 1000 }), null)
})
test('formatMOIC e formatPayback', () => {
  assert.strictEqual(formatMOIC(1.42), '1.42x')
  assert.strictEqual(formatMOIC(null), '—')
  assert.strictEqual(formatPayback(6), '6 meses')
  assert.strictEqual(formatPayback(null), '—')
})

// ─────────────────────────────────────────────────────────────
// 2. contentHash.js
// ─────────────────────────────────────────────────────────────
console.log('\n[2] contentHash.js')

const baseDeal = {
  compra: 150000, obra: 30000, vvr: 250000,
  capital_necessario: 200000, lucro_bruto: 50000, lucro_liquido: 40000,
  retorno_anualizado: 30, moic: 1.2, payback_meses: 6,
  regime_fiscal: 'Empresa', meses: 6, perc_financiamento: 0, modo_obra: 'calculado',
}

test('hash determinista (mesmo input = mesmo output)', () => {
  const h1 = computeContentHash(baseDeal, 1)
  const h2 = computeContentHash(baseDeal, 1)
  assert.strictEqual(h1, h2)
})
test('hash muda quando muda compra', () => {
  const h1 = computeContentHash(baseDeal, 1)
  const h2 = computeContentHash({ ...baseDeal, compra: 150001 }, 1)
  assert.notStrictEqual(h1, h2)
})
test('hash muda quando muda version', () => {
  const h1 = computeContentHash(baseDeal, 1)
  const h2 = computeContentHash(baseDeal, 2)
  assert.notStrictEqual(h1, h2)
})
test('shortHash devolve 12 chars hex', () => {
  const h = computeContentHash(baseDeal, 1)
  const s = shortHash(h)
  assert.strictEqual(s.length, 12)
  assert.match(s, /^[0-9a-f]{12}$/)
})

// ─────────────────────────────────────────────────────────────
// 3. dataResolver.js
// ─────────────────────────────────────────────────────────────
console.log('\n[3] dataResolver.js')

const imovelMock = {
  id: null, // null evita preloadOrcamentoObra (queries a BD)
  nome: 'Apartamento Quinta da Boavista',
  zona: 'Coimbra',
  tipologia: 'T2',
  modelo_negocio: 'CAEP 50/50',
  fotos: '[]',
  area_bruta: 75,
  pontos_fortes: '',
  pontos_fracos: '',
  riscos: '',
  mitigacao_riscos: '',
}

const analiseMock = {
  compra: 150000,
  obra: 30000,
  vvr: 250000,
  meses: 6,
  pmo_perc: 65,
  aru: true,
  perc_financiamento: 0,
  regime_fiscal: 'Empresa',
  derrama_perc: 1.5,
  comissao_perc: 2.5,
  modo_obra: 'calculado',
  // Stress tests com schema correcto
  stress_tests: {
    veredicto: 'resiliente',
    pior:   { lucro_liquido: 8000,  retorno_anualizado: 6 },
    base:   { lucro_liquido: 32000, retorno_anualizado: 28 },
    melhor: { lucro_liquido: 48000, retorno_anualizado: 45 },
  },
  // Comparaveis com shape novo {meta, tipologias} para testar deteccao
  comparaveis: {
    meta: { desconto_negocial_pct: 5 },
    tipologias: [
      {
        tipologia: 'T2',
        area: 75,
        comparaveis: [
          { preco: 240000, area: 70, ajustes: { estado_pct: -5, piso_pct: 2 } },
          { preco: 260000, area: 80, ajustes: { estado_pct: 0, piso_pct: 0 } },
          { preco: 245000, area: 72, ajustes: { estado_pct: -3, idade: -2 } },
        ],
      },
    ],
  },
}

let resolved
test('resolveDealData devolve objecto com campos canonicos', () => {
  resolved = resolveDealData(imovelMock, analiseMock)
  assert.ok(resolved.compra > 0, 'compra > 0')
  assert.ok(resolved.vvr > 0, 'vvr > 0')
  assert.ok(resolved.capital_necessario > 0, 'capital_necessario > 0')
  assert.ok(resolved.lucro_liquido != null, 'lucro_liquido nao e null')
  assert.ok(resolved.moic != null, 'moic calculado')
  assert.ok(resolved.payback_meses != null, 'payback_meses calculado')
})

test('capital_necessario inclui custos alem de compra+obra (gap B resolvido)', () => {
  // Se simplesmente fosse compra+obra, daria 180000.
  // calcAnalise inclui IMT, IS, escritura, IVA, detencao, comissao —
  // o resultado deve ser >= 180000.
  // Nota: com finalidade Empresa_isencao default, IMT=0, mas IVA da obra
  // (ARU 6%), escritura, comissao venda contam.
  assert.ok(resolved.capital_necessario >= 180000,
    `capital_necessario (${resolved.capital_necessario}) deve incluir mais que compra+obra`)
})

test('quando capital_necessario gravado e null, dataResolver recalcula', () => {
  // Forcar `capital_necessario: null` na analise — o codigo antigo
  // teria caido para `compra + obra` = 180000, subestimando.
  // O resolver deve recalcular via calcAnalise.
  const r2 = resolveDealData(imovelMock, { ...analiseMock, capital_necessario: null })
  assert.ok(r2.capital_necessario >= 180000,
    `capital_necessario (${r2.capital_necessario}) recalculado deve incluir custos completos`)
  assert.strictEqual(r2.capital_necessario, resolved.capital_necessario,
    'mesmo input ⇒ mesmo capital_necessario')
})

test('com inputs ausentes, fallback aos agregados gravados', () => {
  const ag = {
    capital_necessario: 200000,
    lucro_liquido: 40000,
    retorno_anualizado: 30,
    meses: 6,
  }
  const r = resolveDealData({ id: null, nome: 'X' }, ag)
  assert.strictEqual(r.capital_necessario, 200000)
  assert.strictEqual(r.lucro_liquido, 40000)
  // MOIC ainda calculado (1.2x)
  assert.ok(Math.abs(r.moic - 1.2) < 0.01)
})

// ─────────────────────────────────────────────────────────────
// 4. Geracao real de PDFs (Dossier + Anonima)
// ─────────────────────────────────────────────────────────────
console.log('\n[4] Geracao real de PDFs')

// Importacao tardia para nao trazer pg.js antes da var de ambiente.
const { generateDoc } = await import('../src/db/pdfImovelDocs.js')

async function streamToBuffer(doc) {
  const chunks = []
  return new Promise((resolve, reject) => {
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

// PDFKit comprime streams com FlateDecode. Para procurar texto no conteudo,
// extrair todas as zonas `stream...endstream`, inflacionar, e descodificar
// strings hex dentro dos operadores TJ/Tj. PDFKit emite texto como
// `[<hex1> kerning <hex2> ...] TJ` ou `<hex> Tj`.
function extractInflatedText(pdfBuf) {
  const out = []
  let i = 0
  while (i < pdfBuf.length) {
    const sIdx = pdfBuf.indexOf(Buffer.from('stream\n'), i)
    if (sIdx === -1) break
    const eIdx = pdfBuf.indexOf(Buffer.from('\nendstream'), sIdx)
    if (eIdx === -1) break
    const blob = pdfBuf.slice(sIdx + 7, eIdx)
    let inflated = null
    try { inflated = zlib.inflateSync(blob) } catch {}
    if (!inflated || inflated.length > 200000) {
      i = eIdx + 10
      continue
    }
    const text = inflated.toString('latin1')
    // Descodificar TJ arrays inteiros (joining hex chunks sem espaco)
    // PDFKit emite: [<hex1> kerning <hex2> ...] TJ
    // Concatenamos hex1+hex2+... para reconstruir a palavra inteira.
    const tjArrayRe = /\[([^\]]+)\]\s*TJ/g
    let arrM
    while ((arrM = tjArrayRe.exec(text)) !== null) {
      const inner = arrM[1]
      const hexes = [...inner.matchAll(/<([0-9a-fA-F]+)>/g)]
      if (hexes.length > 0) {
        const joined = hexes.map(h => {
          try { return Buffer.from(h[1], 'hex').toString('latin1') } catch { return '' }
        }).join('')
        out.push(joined)
      }
    }
    // Tj individual: <hex> Tj
    const tjSingleRe = /<([0-9a-fA-F]+)>\s*Tj/g
    let sM
    while ((sM = tjSingleRe.exec(text)) !== null) {
      try { out.push(Buffer.from(sM[1], 'hex').toString('latin1')) } catch {}
    }
    out.push(text) // texto raw para apanhar tambem footer e outros
    i = eIdx + 10
  }
  return out.join('\n')
}

// Resolve uma metadata referenciada como `/Title 35 0 R` lendo o objecto
// indirecto referenciado. PDFKit usa literais `(...)` com prefixo BOM
// `\xfe\xff` para Unicode (UTF-16BE) ou `<hex>` em alguns casos.
function readPdfInfoString(pdfBuf, key) {
  const text = pdfBuf.toString('latin1')
  const refRe = new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`)
  const m = text.match(refRe)
  if (!m) return null
  const objNum = m[1]
  const objRe = new RegExp(`\\b${objNum}\\s+0\\s+obj\\b([\\s\\S]*?)endobj`)
  const om = text.match(objRe)
  if (!om) return null
  const body = om[1]
  // Hex string?
  const hexMatch = body.match(/<\s*([0-9a-fA-F\s]+)\s*>/)
  if (hexMatch) {
    const hex = hexMatch[1].replace(/\s/g, '')
    if (hex.toLowerCase().startsWith('feff')) {
      const buf = Buffer.from(hex.slice(4), 'hex')
      const swapped = Buffer.alloc(buf.length)
      for (let k = 0; k < buf.length; k += 2) {
        swapped[k] = buf[k + 1]
        swapped[k + 1] = buf[k]
      }
      return swapped.toString('utf16le')
    }
    return Buffer.from(hex, 'hex').toString('latin1')
  }
  // Literal (...) — pode comecar com BOM \xfe\xff para UTF-16BE.
  // Bytes podem ter parens escapados \( \) e nao-printable como \nnn octal.
  // Para o nosso teste, basta lidar com o caso simples: `(\xFE\xFF chars)`.
  const litMatch = body.match(/\(([\s\S]*?)\)/)
  if (litMatch) {
    const raw = litMatch[1]
    // Resolver escapes octais \nnn e \\, \(, \)
    const buf = Buffer.alloc(raw.length * 4)
    let pos = 0
    for (let k = 0; k < raw.length; k++) {
      if (raw[k] === '\\' && /[0-7]/.test(raw[k + 1])) {
        let oct = ''
        let kk = k + 1
        while (kk < raw.length && oct.length < 3 && /[0-7]/.test(raw[kk])) {
          oct += raw[kk]; kk++
        }
        buf[pos++] = parseInt(oct, 8)
        k = kk - 1
      } else if (raw[k] === '\\' && (raw[k + 1] === '(' || raw[k + 1] === ')' || raw[k + 1] === '\\')) {
        buf[pos++] = raw.charCodeAt(k + 1)
        k++
      } else if (raw[k] === '\\' && raw[k + 1] === 'n') {
        buf[pos++] = 0x0a; k++
      } else if (raw[k] === '\\' && raw[k + 1] === 'r') {
        buf[pos++] = 0x0d; k++
      } else if (raw[k] === '\\' && raw[k + 1] === 't') {
        buf[pos++] = 0x09; k++
      } else {
        buf[pos++] = raw.charCodeAt(k) & 0xff
      }
    }
    const decoded = buf.slice(0, pos)
    if (decoded.length >= 2 && decoded[0] === 0xfe && decoded[1] === 0xff) {
      // UTF-16BE
      const body16 = decoded.slice(2)
      const swapped = Buffer.alloc(body16.length)
      for (let k = 0; k < body16.length; k += 2) {
        swapped[k] = body16[k + 1]
        swapped[k + 1] = body16[k]
      }
      return swapped.toString('utf16le')
    }
    return decoded.toString('utf8')
  }
  return body.trim()
}

const imForRender = {
  ...imovelMock,
  _orcamento: null,             // skip preloadOrcamentoObra
  _version: 1,
  _generatedAt: new Date().toISOString(),
  _documentId: 'test1234-dossier-v1',
  _tipoLabel: 'Dossier de Investimento',
  _pdfHashShort: 'abcdef012345',
}

let dossierBuf, anonimaBuf

await testAsync('gerar Dossier de Investimento (PDF binario)', async () => {
  const doc = await generateDoc('dossier_investidor', imForRender, analiseMock)
  assert.ok(doc, 'generateDoc retornou doc')
  dossierBuf = await streamToBuffer(doc)
  assert.ok(dossierBuf.length > 1000, `PDF tem ${dossierBuf.length} bytes`)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUT_DIR, 'dossier.pdf'), dossierBuf)
})

await testAsync('gerar Proposta Investimento Anonima (PDF binario)', async () => {
  const imAnonima = {
    ...imForRender,
    _tipoLabel: 'Proposta de Investimento',
    _documentId: 'test1234-anonima-v1',
  }
  const doc = await generateDoc('proposta_investimento_anonima', imAnonima, analiseMock)
  assert.ok(doc, 'generateDoc retornou doc')
  anonimaBuf = await streamToBuffer(doc)
  assert.ok(anonimaBuf.length > 1000, `PDF tem ${anonimaBuf.length} bytes`)
  fs.writeFileSync(path.join(OUT_DIR, 'anonima.pdf'), anonimaBuf)
})

// Inflacionar streams comprimidos para procurar texto.
const dossierText = extractInflatedText(dossierBuf)
const anonimaText = extractInflatedText(anonimaBuf)

// ─────────────────────────────────────────────────────────────
// 5. Coerencia cross-doc (mesmo deal resolvido)
// ─────────────────────────────────────────────────────────────
console.log('\n[5] Coerencia cross-doc')

test('resolveDealData estavel para mesmo input (Dossier e Anonima leem o mesmo)', () => {
  const r1 = resolveDealData(imovelMock, analiseMock)
  const r2 = resolveDealData(imovelMock, analiseMock)
  assert.strictEqual(r1.capital_necessario, r2.capital_necessario)
  assert.strictEqual(r1.lucro_liquido, r2.lucro_liquido)
  assert.strictEqual(r1.retorno_anualizado, r2.retorno_anualizado)
  assert.strictEqual(r1.moic, r2.moic)
  assert.strictEqual(r1.payback_meses, r2.payback_meses)
})

// ─────────────────────────────────────────────────────────────
// 6. Anonimato da Proposta Anonima (busca em conteudo descomprimido)
// ─────────────────────────────────────────────────────────────
console.log('\n[6] Anonimato da Proposta Anonima')

const dossierSubject = readPdfInfoString(dossierBuf, 'Subject') || ''
const anonimaSubject = readPdfInfoString(anonimaBuf, 'Subject') || ''
const dossierTitle = readPdfInfoString(dossierBuf, 'Title') || ''
const anonimaTitle = readPdfInfoString(anonimaBuf, 'Title') || ''

test('nome APARECE no conteudo do Dossier (sanity)', () => {
  // Para confirmar que o teste de anonimato nao passa trivialmente.
  // PDFKit escreve `Tj` operadores com texto em parenteses dentro
  // do stream. Apos inflacionar, o nome (ou parte dele) deve aparecer.
  const found = dossierText.includes(imovelMock.nome) ||
                dossierText.includes('Quinta da Boavista') ||
                dossierText.includes('Apartamento')
  assert.ok(found, `Sanity: nome do imovel deve estar no conteudo do Dossier (encontrado: ${found})`)
})

test('nome NAO aparece no conteudo da Anonima', () => {
  // Verificacao significativa: o nome real do imovel nao pode estar
  // no conteudo descomprimido da Proposta Anonima.
  const fragments = [
    imovelMock.nome,
    'Apartamento Quinta',
    'Quinta da Boavista',
  ]
  for (const f of fragments) {
    assert.ok(!anonimaText.includes(f),
      `Anonima contem "${f}" no conteudo`)
  }
})

test('nome NAO aparece em qualquer string da metadata da Anonima', () => {
  assert.ok(!anonimaSubject.includes(imovelMock.nome),
    `Subject da Anonima contem nome: "${anonimaSubject}"`)
  assert.ok(!anonimaTitle.includes(imovelMock.nome),
    `Title da Anonima contem nome: "${anonimaTitle}"`)
  // Procurar tambem em Keywords
  const kw = readPdfInfoString(anonimaBuf, 'Keywords') || ''
  assert.ok(!kw.includes(imovelMock.nome),
    `Keywords da Anonima contem nome: "${kw}"`)
})

// ─────────────────────────────────────────────────────────────
// 7. Metadata do PDF (lida via Info dict / objectos indirectos)
// ─────────────────────────────────────────────────────────────
console.log('\n[7] Metadata do PDF')

test('Dossier: Title = "Dossier de Investimento"', () => {
  assert.ok(dossierTitle.includes('Dossier de Investimento'),
    `Title actual: "${dossierTitle}"`)
})
test('Dossier: Author = "Somnium Properties"', () => {
  const author = readPdfInfoString(dossierBuf, 'Author') || ''
  assert.ok(author.includes('Somnium Properties'), `Author actual: "${author}"`)
})
test('Dossier: Subject contem nome do imovel (nao-anonimo)', () => {
  assert.ok(dossierSubject.includes(imovelMock.nome) ||
            dossierSubject.includes('Quinta'),
    `Subject actual: "${dossierSubject}"`)
})
test('Anonima: Title = "Proposta de Investimento"', () => {
  assert.ok(anonimaTitle.includes('Proposta de Investimento'),
    `Title actual: "${anonimaTitle}"`)
})
test('Anonima: Subject usa nome stripped "OPORTUNIDADE DE INVESTIMENTO"', () => {
  assert.ok(anonimaSubject.includes('OPORTUNIDADE DE INVESTIMENTO'),
    `Subject actual: "${anonimaSubject}"`)
})

// ─────────────────────────────────────────────────────────────
// 8. Conteudo do Dossier (MOIC + Pressupostos descomprimidos)
// ─────────────────────────────────────────────────────────────
console.log('\n[8] Conteudo do Dossier')

test('Dossier menciona MOIC nos big numbers', () => {
  assert.ok(dossierText.includes('MOIC'), 'Dossier nao tem MOIC')
})
test('Dossier menciona Payback', () => {
  assert.ok(dossierText.includes('Payback'), 'Dossier nao tem Payback')
})
test('Dossier inclui Estudo de Comparaveis (SUMARIO EXECUTIVO)', () => {
  // renderEstudoComparaveis comeca com "SUMÁRIO EXECUTIVO"
  assert.ok(dossierText.includes('SUM') && dossierText.includes('EXECUTIVO'),
    'Dossier nao tem SUMARIO EXECUTIVO dos comparaveis')
})
test('Dossier inclui Analise de Rentabilidade integral (CUSTOS DE AQUISICAO)', () => {
  assert.ok(dossierText.includes('CUSTOS DE AQUISI'), 'Dossier nao tem CUSTOS DE AQUISICAO')
})
test('Dossier menciona PRESSUPOSTOS (seccao do glossario)', () => {
  assert.ok(dossierText.includes('PRESSUPOSTOS'), 'Dossier nao tem PRESSUPOSTOS')
})
test('Dossier menciona GLOSSARIO ou GLOSSARIO E FORMULAS', () => {
  assert.ok(dossierText.includes('GLOSS'), 'Dossier nao tem GLOSSARIO')
})
test('Anonima menciona MOIC', () => {
  assert.ok(anonimaText.includes('MOIC'), 'Anonima nao tem MOIC')
})
test('Anonima menciona PRESSUPOSTOS (mesmo glossario partilhado)', () => {
  assert.ok(anonimaText.includes('PRESSUPOSTOS'), 'Anonima nao tem PRESSUPOSTOS')
})

// ─────────────────────────────────────────────────────────────
// 9. Footer (versao, ID, hash) presentes em todas as paginas
// ─────────────────────────────────────────────────────────────
console.log('\n[9] Footer auditavel')

test('Dossier tem versao e ID injectados no footer', () => {
  assert.ok(dossierText.includes('v1'), 'footer nao tem v1')
  assert.ok(dossierText.includes('test1234-dossier-v1'), 'footer nao tem documentId')
  assert.ok(dossierText.includes('abcdef012345'), 'footer nao tem hash short')
})
test('Anonima tem versao e ID injectados no footer', () => {
  assert.ok(anonimaText.includes('v1'), 'footer nao tem v1')
  assert.ok(anonimaText.includes('test1234-anonima-v1'), 'footer nao tem documentId')
})

// ─────────────────────────────────────────────────────────────
// Resumo
// ─────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────')
console.log(`  ${passed} passou · ${failed} falhou · total ${passed + failed}`)
console.log(`  PDFs em: ${OUT_DIR}`)
if (failed > 0) {
  console.log('\nFalhas:')
  for (const f of fails) console.log(`  - ${f.name}: ${f.error.message}`)
}
console.log('────────────────────────────────────────────\n')

process.exit(failed > 0 ? 1 : 0)
