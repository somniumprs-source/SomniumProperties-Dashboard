import 'dotenv/config'
import { Client } from '@notionhq/client'

const notion = new Client({ auth: process.env.NOTION_API_KEY })

const DRY_RUN = process.argv.includes('--dry-run')
const log = (action, detail) => console.log(`${DRY_RUN ? '[DRY-RUN]' : '[OK]'} ${action}: ${detail}`)

// ── Helpers ──────────────────────────────────────────────────
function heading2(text) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: text } }], color: 'default' } }
}
function divider() {
  return { object: 'block', type: 'divider', divider: {} }
}
function callout(icon, text, color = 'gray_background') {
  return {
    object: 'block', type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: icon },
      color,
      rich_text: [{ type: 'text', text: { content: text } }],
    }
  }
}
function paragraph(text) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: text ? [{ type: 'text', text: { content: text } }] : [] } }
}
function linkText(text, url) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text, link: { url } } }] } }
}
function bulletItem(text) {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } }
}

async function getChildren(blockId) {
  const results = []
  let cursor
  do {
    const res = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 })
    results.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return results
}

async function clearPlaceholderBlocks(pageId, pageName) {
  const children = await getChildren(pageId)
  // Remove only the generic placeholder sections (Visão Geral, Objetivos, Recursos with generic text)
  // Keep databases, callouts with real content, and structured blocks
  const PLACEHOLDER_HEADINGS = ['Visão Geral', 'Visao Geral', 'Objetivos', 'Recursos']

  let inPlaceholderSection = false
  const toDelete = []

  for (const block of children) {
    const text = block[block.type]?.rich_text?.map(t => t.plain_text).join('') ?? ''

    if (block.type === 'heading_2' || block.type === 'heading_3') {
      inPlaceholderSection = PLACEHOLDER_HEADINGS.some(h => text.includes(h))
      if (inPlaceholderSection) toDelete.push(block.id)
      continue
    }

    if (inPlaceholderSection) {
      // Delete paragraphs/bullets in placeholder sections
      if (['paragraph', 'bulleted_list_item'].includes(block.type)) {
        toDelete.push(block.id)
      } else {
        inPlaceholderSection = false // Hit non-text block, stop
      }
    }
  }

  if (toDelete.length > 0) {
    log('CLEAR', `${pageName}: ${toDelete.length} blocos placeholder`)
    if (!DRY_RUN) {
      for (const id of toDelete) {
        try { await notion.blocks.delete({ block_id: id }) } catch {}
      }
    }
  }
  return toDelete.length
}

// ── Layout padrão ────────────────────────────────────────────
// Layout unificado por departamento:
// 1. Callout header (emoji + nome + descrição)
// 2. Link dashboard web
// 3. Divider
// 4. (manter DBs inline existentes)

async function ensureStandardHeader(pageId, pageName, config) {
  const children = await getChildren(pageId)

  // Check if header callout already exists
  const hasCallout = children.some(b => {
    if (b.type !== 'callout') return false
    const text = b.callout?.rich_text?.map(t => t.plain_text).join('') ?? ''
    return text.includes(config.headerText)
  })

  // Check if dashboard link exists
  const hasDashboardLink = children.some(b => {
    const text = b[b.type]?.rich_text?.map(t => t.plain_text).join('') ?? ''
    return text.includes('Dashboard Web') || text.includes('somniumproperties-dashboard')
  })

  const blocksToAdd = []

  if (!hasDashboardLink && config.dashboardUrl) {
    blocksToAdd.push(
      callout('🖥️', `Dashboard Web — ${config.dashboardUrl}`)
    )
  }

  if (blocksToAdd.length > 0) {
    log('ADD HEADER', `${pageName}: ${blocksToAdd.length} blocos`)
    if (!DRY_RUN) {
      // Prepend at start
      await notion.blocks.children.append({ block_id: pageId, children: blocksToAdd })
    }
  }
}

// ── Main ─────────────────────────────────────────────────────
async function run() {
  console.log(`\n=== UNIFICAÇÃO DE LAYOUTS ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`)

  // Encontrar departamentos
  const deptDB = 'd1490f1e-cc03-464d-94ef-11d2f0eaab90'
  let depts
  try {
    const res = await notion.databases.query({ database_id: deptDB })
    depts = res.results
  } catch {
    // Fallback: search
    const search = await notion.search({ query: 'Departamentos', filter: { property: 'object', value: 'database' } })
    const db = search.results[0]
    if (db) {
      const res = await notion.databases.query({ database_id: db.id })
      depts = res.results
    }
  }

  if (!depts) {
    console.error('Não encontrei a DB Departamentos')
    return
  }

  const DEPT_CONFIG = {
    'Administracao': {
      headerText: 'ADMINISTRACAO',
      dashboardUrl: 'somniumproperties-dashboard.onrender.com',
    },
    'Departamento Financeiro': {
      headerText: 'FINANCEIRO',
      dashboardUrl: 'somniumproperties-dashboard.onrender.com/financeiro',
    },
    'Departamento Comercial': {
      headerText: 'COMERCIAL',
      dashboardUrl: 'somniumproperties-dashboard.onrender.com/comercial',
    },
    'Formacao': {
      headerText: 'FORMACAO',
      dashboardUrl: null,
    },
  }

  for (const dept of depts) {
    const title = Object.values(dept.properties).find(v => v.type === 'title')?.title?.map(t => t.plain_text).join('') ?? ''
    console.log(`\n--- ${title} ---`)

    const config = DEPT_CONFIG[title]
    if (!config) {
      console.log(`  (sem configuração, a saltar)`)
      continue
    }

    // 1. Limpar blocos placeholder
    const removed = await clearPlaceholderBlocks(dept.id, title)

    // 2. Garantir header padrão
    await ensureStandardHeader(dept.id, title, config)
  }

  // ── Formação: limpar se for só placeholder ──
  console.log('\n--- Formação: verificar conteúdo ---')
  const formacao = depts.find(d => {
    const t = Object.values(d.properties).find(v => v.type === 'title')?.title?.map(t => t.plain_text).join('') ?? ''
    return t.includes('Formacao') || t.includes('Formação')
  })
  if (formacao) {
    const children = await getChildren(formacao.id)
    const hasOnlyPlaceholders = children.every(b => {
      if (b.type === 'callout') return true
      if (b.type === 'heading_2' || b.type === 'heading_3') {
        const text = b[b.type]?.rich_text?.map(t => t.plain_text).join('') ?? ''
        return ['Conteudos', 'Conteúdos', 'Objetivos', 'Recursos', 'Visão', 'Visao'].some(h => text.includes(h))
      }
      if (b.type === 'paragraph' || b.type === 'bulleted_list_item') return true
      return false
    })

    if (children.length > 0) {
      const childPages = children.filter(b => b.type === 'child_page')
      log('INFO', `Formação: ${children.length} blocos, ${childPages.length} sub-páginas`)
      // Don't delete if it has child pages (Áreas Mínimas might still be there)
    }
  }

  console.log('\n=== UNIFICAÇÃO CONCLUÍDA ===\n')
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
