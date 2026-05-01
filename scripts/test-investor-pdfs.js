/**
 * Smoke test: gera os 3 PDFs investidor (relatorio_investimento, dossier_investidor,
 * proposta_investimento_anonima) com dados reais do T2 Sub-Cave Lages.
 * Valida que o estilo investor + secção pontos+localização não rebenta.
 */
import { generateDoc } from '../src/db/pdfImovelDocs.js'
import { writeFileSync, createWriteStream } from 'fs'
import pg from 'pg'

const client = new pg.Client({ connectionString: 'postgresql://postgres.mjgusjuougzoeiyavsor:alexandre.joao.25@aws-0-eu-west-1.pooler.supabase.com:6543/postgres' })
await client.connect()
const im = (await client.query("SELECT * FROM imoveis WHERE id = '68d423f8-f72b-46aa-9fea-c75784c39212'")).rows[0]
const an = (await client.query("SELECT * FROM analises WHERE imovel_id = $1 ORDER BY versao DESC LIMIT 1", [im.id])).rows[0]
await client.end()

// Simular conteúdo dos campos novos para validar render
im.pontos_fortes = 'Off-market via referência directa\nIMT zero (isenção Lei 56/2023)\nMargem 19,9% antes de break-even\n€/m² alinhado com mediana, não P90'
im.pontos_fracos = 'Áreas (área útil/bruta) não confirmadas\nAmostra de comparáveis com CV de 23,6%\nSem financiamento bancário previsto'
im.riscos = 'Atraso de obra >6 meses reduz RA significativamente\nCondições de venda do mercado podem deteriorar\nDependência de empreiteiro único'
im.localizacao_imagem = null  // nenhuma para já — testa sem imagem

const tipos = ['relatorio_investimento', 'dossier_investidor', 'proposta_investimento_anonima']
for (const tipo of tipos) {
  const out = `/tmp/test-${tipo}.pdf`
  const doc = generateDoc(tipo, im, an)
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(out)
    doc.pipe(ws)
    ws.on('finish', resolve)
    ws.on('error', reject)
  })
  console.log(`✓ ${tipo} → ${out}`)
}
