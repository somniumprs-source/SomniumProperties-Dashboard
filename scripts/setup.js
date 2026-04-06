import 'dotenv/config'
import { Client } from '@notionhq/client'

const notion = new Client({ auth: process.env.NOTION_API_KEY })

const DBS = {
  faturacao:  process.env.NOTION_DB_FATURACAO,
  custos:     process.env.NOTION_DB_CUSTOS,
  pipeline:   process.env.NOTION_DB_PIPELINE,
  clientes:   process.env.NOTION_DB_CLIENTES,
  campanhas:  process.env.NOTION_DB_CAMPANHAS,
  obras:      process.env.NOTION_DB_OBRAS,
}

async function checkDB(name, id) {
  if (!id) {
    console.error(`[setup] ERRO: ID da base de dados "${name}" não definido no .env`)
    return false
  }
  try {
    const db = await notion.databases.retrieve({ database_id: id })
    console.log(`[setup] OK: ${name} — "${db.title?.[0]?.plain_text ?? id}"`)
    return true
  } catch (err) {
    console.error(`[setup] ERRO ao aceder a "${name}" (${id}): ${err.message}`)
    return false
  }
}

async function main() {
  console.log('\n=== Somnium Properties — Verificação das Bases de Dados ===\n')

  if (!process.env.NOTION_API_KEY || process.env.NOTION_API_KEY === 'secret_xxxxxxxxxxxxxxxxxxxx') {
    console.error('[setup] ERRO: NOTION_API_KEY não configurada no .env')
    process.exit(1)
  }

  let ok = 0
  let total = Object.keys(DBS).length
  for (const [name, id] of Object.entries(DBS)) {
    const result = await checkDB(name, id)
    if (result) ok++
  }

  console.log(`\n=== Resultado: ${ok}/${total} bases de dados acessíveis ===\n`)
  if (ok < total) {
    console.log('Configura o ficheiro .env com os IDs corretos do Notion.')
    process.exit(1)
  }
  console.log('Tudo pronto! Corre `npm run dev` para iniciar o dashboard.\n')
}

main()
