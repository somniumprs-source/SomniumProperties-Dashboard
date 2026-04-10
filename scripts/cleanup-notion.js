import 'dotenv/config'
import { Client } from '@notionhq/client'

const notion = new Client({ auth: process.env.NOTION_API_KEY })

const DRY_RUN = process.argv.includes('--dry-run')
const log = (action, detail) => console.log(`${DRY_RUN ? '[DRY-RUN]' : '[OK]'} ${action}: ${detail}`)

async function archivePage(id, label) {
  log('ARCHIVE', label)
  if (!DRY_RUN) {
    await notion.pages.update({ page_id: id, archived: true })
  }
}

async function deleteBlock(id, label) {
  log('DELETE BLOCK', label)
  if (!DRY_RUN) {
    await notion.blocks.delete({ block_id: id })
  }
}

async function run() {
  console.log(`\n=== LIMPEZA DO NOTION ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`)

  // 1. Apagar as 5 páginas vazias do .env (não são usadas — conteúdo real está nos Departamentos DB)
  const emptyPages = [
    { id: '333c6d45-a01f-8183-a378-e0fd92f7521f', name: 'Dashboard (vazia)' },
    { id: '333c6d45-a01f-81dc-9cb4-d12a999e28ed', name: 'Financeiro (vazia)' },
    { id: '333c6d45-a01f-810d-bae7-ca7a9882ebef', name: 'Comercial (vazia)' },
    { id: '333c6d45-a01f-81a8-a434-c243884b54fa', name: 'Marketing (vazia)' },
    { id: '333c6d45-a01f-81a4-a63e-e6096e9932d9', name: 'Operações (vazia)' },
  ]
  console.log('--- 1. Páginas vazias do .env ---')
  for (const p of emptyPages) {
    try { await archivePage(p.id, p.name) } catch (e) { console.error(`  ERRO ${p.name}: ${e.message}`) }
  }

  // 2. Apagar SOP 5 duplicado (placeholder)
  console.log('\n--- 2. SOP 5 duplicado ---')
  // Procurar o SOP 5 placeholder
  const search = await notion.search({ query: 'SOP 5', filter: { property: 'object', value: 'page' } })
  const sop5Pages = search.results.filter(p => {
    const title = p.properties?.title?.title?.map(t => t.plain_text).join('') ??
                  p.properties?.Name?.title?.map(t => t.plain_text).join('') ?? ''
    return title.includes('Pendente')
  })
  for (const p of sop5Pages) {
    const title = Object.values(p.properties).find(v => v.type === 'title')?.title?.map(t => t.plain_text).join('') ?? p.id
    await archivePage(p.id, `SOP 5 placeholder: "${title}"`)
  }

  // 3. Apagar entrada "tester" no Pipeline Imóveis
  console.log('\n--- 3. Entrada "tester" no Pipeline ---')
  const pipelineDB = process.env.NOTION_DB_PIPELINE_IMOVEIS
  const pipelineRows = await notion.databases.query({ database_id: pipelineDB })
  for (const row of pipelineRows.results) {
    const nome = row.properties['Nome do Imóvel']?.title?.map(t => t.plain_text).join('') ?? ''
    if (nome.toLowerCase() === 'tester') {
      await archivePage(row.id, `Pipeline: "${nome}"`)
    }
  }

  // 4. Apagar entradas sem nome nos Investidores
  console.log('\n--- 4. Entradas sem nome (Investidores) ---')
  const invDB = process.env.NOTION_DB_INVESTIDORES
  const invRows = await notion.databases.query({ database_id: invDB })
  for (const row of invRows.results) {
    const nome = row.properties['Nome']?.title?.map(t => t.plain_text).join('').trim() ?? ''
    if (!nome) {
      await archivePage(row.id, `Investidor sem nome (${row.id.slice(0,8)})`)
    }
  }

  // 5. Apagar DB Lista de Consultores duplicada (0 entradas)
  console.log('\n--- 5. DB Consultores duplicada ---')
  try {
    await archivePage('33ac6d45-a01f-81d1-84e6-dc40e96e13a2', 'Lista Consultores duplicada (0 entradas)')
  } catch (e) {
    // Try alternative: search for it
    const searchCons = await notion.search({ query: 'Lista de Consultores', filter: { property: 'object', value: 'database' } })
    for (const db of searchCons.results) {
      if (db.id.startsWith('33ac6d45')) {
        await archivePage(db.id, 'Lista Consultores duplicada (via search)')
      }
    }
  }

  // 6. Apagar Tracker de Tarefas standalone (0 entradas)
  console.log('\n--- 6. Tracker de Tarefas (0 entradas) ---')
  try {
    await archivePage('2e3c6d45-a01f-80c2-b062-f9358aa515b5', 'Tracker de Tarefas standalone (vazio)')
  } catch (e) { console.error(`  ERRO: ${e.message}`) }

  // 7. Apagar Formação > Áreas Mínimas (stub)
  console.log('\n--- 7. Áreas Mínimas placeholder ---')
  try {
    await archivePage('333c6d45-a01f-81bf-b66e-c43c09db07f2', 'Áreas Mínimas por Tipologia (stub)')
  } catch (e) {
    // Try with search
    const searchAreas = await notion.search({ query: 'Areas Minimas', filter: { property: 'object', value: 'page' } })
    for (const p of searchAreas.results) {
      const title = Object.values(p.properties).find(v => v.type === 'title')?.title?.map(t => t.plain_text).join('') ?? ''
      if (title.includes('Minimas') || title.includes('Mínimas')) {
        await archivePage(p.id, `Áreas Mínimas: "${title}"`)
      }
    }
  }

  console.log('\n=== LIMPEZA CONCLUÍDA ===\n')
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
