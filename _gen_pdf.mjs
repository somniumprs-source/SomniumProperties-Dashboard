import { readFileSync, writeFileSync } from 'fs'
import pg from 'pg'

const envText = readFileSync('/tmp/somnium.env', 'utf8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const ID = '3b7cd883-9dc0-4cf0-bce8-aacffeba6b32'
const { rows: [imovel] } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [ID])
const { rows: [analise] } = await pool.query('SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1', [ID])

console.log('IMOVEL keys:', Object.keys(imovel).length)
console.log('ANALISE keys:', analise ? Object.keys(analise).length : 'NULL')
console.log('analise.compra:', analise?.compra)
console.log('analise.lucro_liquido:', analise?.lucro_liquido)
console.log('analise.imt:', analise?.imt)
console.log('analise.imposto_selo:', analise?.imposto_selo)
console.log('analise.escritura:', analise?.escritura)
console.log('analise.total_aquisicao:', analise?.total_aquisicao)
console.log('analise.total_manutencao:', analise?.total_manutencao)
console.log('analise.comissao_com_iva:', analise?.comissao_com_iva)
console.log('analise.impostos:', analise?.impostos)
console.log('analise.lucro_bruto:', analise?.lucro_bruto)
console.log('analise.retorno_total:', analise?.retorno_total)
console.log('analise.cash_on_cash:', analise?.cash_on_cash)
console.log('analise.regime_fiscal:', analise?.regime_fiscal)
console.log('analise.meses:', analise?.meses)
console.log('analise.modelo_negocio:', imovel?.modelo_negocio)
console.log('analise.caep type:', typeof analise?.caep, '— length:', analise?.caep ? (typeof analise.caep === 'string' ? analise.caep.length : JSON.stringify(analise.caep).length) : 'null')
console.log('analise.stress_tests type:', typeof analise?.stress_tests)
console.log('imovel.fotos preview:', typeof imovel.fotos, '— sample:', JSON.stringify(imovel.fotos).slice(0, 200))

const { generateCompiledReport } = await import('./src/db/pdfImovelDocs.js')
const doc = generateCompiledReport(imovel, analise || null, ['dossier_investidor'])

const chunks = []
doc.on('data', c => chunks.push(c))
doc.on('end', () => {
  const buf = Buffer.concat(chunks)
  writeFileSync('/tmp/dossier_t2_cave_lages.pdf', buf)
  console.log('\nPDF gerado:', buf.length, 'bytes')
})
doc.end()

await pool.end()
