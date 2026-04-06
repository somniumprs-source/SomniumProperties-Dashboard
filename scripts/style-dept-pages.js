#!/usr/bin/env node
/**
 * Aplica layout de marca dentro de cada página de departamento no Notion.
 * Arquiva blocos existentes (exceto sub-páginas) e adiciona layout branded.
 * Usage: node scripts/style-dept-pages.js
 */
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envPath = path.join(__dirname, '../.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
loadEnv()

const TOKEN = process.env.NOTION_API_KEY
if (!TOKEN) { console.error('NOTION_API_KEY not set'); process.exit(1) }

// ── Notion API helpers ─────────────────────────────────────────────────────
function notionRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'api.notion.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }
    const req = https.request(options, res => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        const json = JSON.parse(raw)
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json)
        else reject(new Error(`Notion ${res.statusCode}: ${raw}`))
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function getChildBlocks(blockId) {
  const res = await notionRequest('GET', `/v1/blocks/${blockId}/children?page_size=100`)
  return res.results ?? []
}

async function archiveBlock(blockId) {
  await notionRequest('PATCH', `/v1/blocks/${blockId}`, { archived: true })
}

async function appendBlocks(pageId, children) {
  await notionRequest('PATCH', `/v1/blocks/${pageId}/children`, { children })
}

// ── Layout builder ─────────────────────────────────────────────────────────
function rt(text, bold = false, color = 'default') {
  return [{ type: 'text', text: { content: text }, annotations: { bold, color } }]
}

function buildLayout({ name, subtitle, emoji, sections }) {
  const blocks = []

  // ── Header callout ──
  blocks.push({
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: [
        { type: 'text', text: { content: `${name}\n` }, annotations: { bold: true, color: 'default' } },
        { type: 'text', text: { content: subtitle }, annotations: { bold: false, color: 'gray' } },
      ],
      icon: { type: 'emoji', emoji },
      color: 'gray_background',
    },
  })

  blocks.push({ object: 'block', type: 'divider', divider: {} })

  // ── Sections ──
  for (const s of sections) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: rt(`${s.icon}  ${s.title}`, false, 'orange'),
        color: 'orange',
      },
    })

    for (const line of s.lines) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: rt(line, false, 'gray'),
        },
      })
    }

    blocks.push({ object: 'block', type: 'divider', divider: {} })
  }

  // ── Footer ──
  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        { type: 'text', text: { content: 'SOMNIUM PROPERTIES' }, annotations: { bold: true, color: 'gray' } },
        { type: 'text', text: { content: '  ·  Todos os direitos reservados' }, annotations: { color: 'gray' } },
      ],
    },
  })

  return blocks
}

// ── Department definitions ─────────────────────────────────────────────────
const depts = [
  {
    pageId: '333b41f4-1d3e-467d-a49e-36b9f4c7206a',
    name: 'ADMINISTRAÇÃO',
    subtitle: 'Gestão & Estratégia Empresarial',
    emoji: '🏛️',
    sections: [
      { icon: '📋', title: 'Visão Geral', lines: ['Coordenação dos departamentos, estratégia e tomada de decisão.'] },
      { icon: '🎯', title: 'Objetivos', lines: ['Crescimento sustentável, eficiência operacional e consolidação de marca.'] },
      { icon: '🔗', title: 'Recursos', lines: ['Aceder às bases de dados e relatórios nos links abaixo.'] },
    ],
  },
  {
    pageId: '6a51b61c-e89f-476c-a8b0-69391ab742b2',
    name: 'FINANCEIRO',
    subtitle: 'Controlo Financeiro & Orçamental',
    emoji: '💰',
    sections: [
      { icon: '📊', title: 'KPIs Principais', lines: ['Faturação, Margem Bruta, EBITDA e Custo Operacional.'] },
      { icon: '📅', title: 'Frequência', lines: ['Atualização mensal — dia 1 a 3 de cada mês.'] },
      { icon: '🔗', title: 'Bases de Dados', lines: ['Faturação e Custos disponíveis nos links abaixo.'] },
    ],
  },
  {
    pageId: '8c1965bc-3ac0-49c3-a128-9958f2796dbd',
    name: 'COMERCIAL & VENDAS',
    subtitle: 'Pipeline · Investidores · Empreiteiros',
    emoji: '🏡',
    sections: [
      { icon: '📈', title: 'Pipeline de Imóveis', lines: ['Gestão de oportunidades desde o lead até ao fecho.'] },
      { icon: '🤝', title: 'Investidores', lines: ['Base de investidores A/B/C/D com histórico de contacto.'] },
      { icon: '🔨', title: 'Empreiteiros', lines: ['Rede de empreiteiros qualificados por especialidade.'] },
    ],
  },
  {
    pageId: '9a7cd819-ad5f-4e19-949a-1d42605f2892',
    name: 'FORMAÇÃO',
    subtitle: 'Desenvolvimento & Capacitação',
    emoji: '🎓',
    sections: [
      { icon: '📚', title: 'Conteúdos', lines: ['Materiais de formação interna e desenvolvimento de competências.'] },
      { icon: '🏆', title: 'Objetivos', lines: ['Capacitação da equipa e melhoria contínua dos processos.'] },
      { icon: '🔗', title: 'Recursos', lines: ['Consultar materiais e calendário de formações abaixo.'] },
    ],
  },
]

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  for (const dept of depts) {
    console.log(`\nProcessing: ${dept.name}`)

    // Get existing blocks
    const existing = await getChildBlocks(dept.pageId)
    console.log(`  Found ${existing.length} existing blocks`)

    // Archive non-page blocks (preserve child_page and child_database)
    let archived = 0
    for (const block of existing) {
      if (block.type !== 'child_page' && block.type !== 'child_database') {
        await archiveBlock(block.id)
        archived++
      }
    }
    console.log(`  Archived ${archived} blocks`)

    // Append branded layout
    const blocks = buildLayout(dept)
    await appendBlocks(dept.pageId, blocks)
    console.log(`  ✓ Applied branded layout (${blocks.length} blocks)`)
  }

  console.log('\n✓ All department pages updated.')
  console.log('  Nota: arrasta o header callout para o topo de cada página se necessário.')
}

main().catch(e => { console.error(e); process.exit(1) })
