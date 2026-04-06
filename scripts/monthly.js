import 'dotenv/config'
import { Client } from '@notionhq/client'

const notion = new Client({ auth: process.env.NOTION_API_KEY })

// Importações das DBs (versão Node.js com process.env)
async function listFaturacao(mes, ano) {
  const res = await notion.databases.query({
    database_id: process.env.NOTION_DB_FATURACAO,
    filter: { and: [
      { property: 'Mês', select: { equals: mes } },
      { property: 'Ano', number: { equals: ano } },
    ]},
  })
  return res.results.map(p => ({
    receitaFaturada: p.properties['Receita Faturada €']?.number ?? 0,
    margemBruta:     p.properties['Margem Bruta €']?.number ?? 0,
  }))
}

async function listCustos(ano, month) {
  const start = `${ano}-${String(month).padStart(2,'0')}-01`
  const end   = `${ano}-${String(month).padStart(2,'0')}-31`
  const res = await notion.databases.query({
    database_id: process.env.NOTION_DB_CUSTOS,
    filter: { and: [
      { property: 'Data', date: { on_or_after: start } },
      { property: 'Data', date: { on_or_before: end } },
    ]},
  })
  return res.results.map(p => ({ valor: p.properties['Valor €']?.number ?? 0 }))
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

async function main() {
  const now = new Date()
  // Mês anterior
  const targetMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  const targetYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const mesNome     = MESES[targetMonth]

  console.log(`\n=== calcKPIs — Mês: ${mesNome} ${targetYear} ===\n`)

  const [faturacoes, custos] = await Promise.all([
    listFaturacao(mesNome, targetYear),
    listCustos(targetYear, targetMonth + 1),
  ])

  const faturacaoTotal  = faturacoes.reduce((s, f) => s + f.receitaFaturada, 0)
  const margemBrutaTotal= faturacoes.reduce((s, f) => s + f.margemBruta, 0)
  const custoOperacional= custos.reduce((s, c) => s + c.valor, 0)
  const ebitda          = faturacaoTotal - custoOperacional
  const margemBrutaPct  = faturacaoTotal > 0 ? Math.round(margemBrutaTotal / faturacaoTotal * 10000) / 100 : 0

  const kpis = { faturacaoTotal, margemBrutaPct, custoOperacional, ebitda, mes: mesNome, ano: targetYear }
  console.log('KPIs calculados:', JSON.stringify(kpis, null, 2))
  console.log('\nDone. Para escrever no Notion, integra este script com a DB de KPIs mensais.\n')
}

main().catch(err => {
  console.error('[monthly] Erro:', err.message)
  process.exit(1)
})
