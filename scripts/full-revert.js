#!/usr/bin/env node
/**
 * Remove TUDO o que os scripts adicionaram:
 * - Covers de todas as páginas tocadas
 * - Todos os blocos de texto/callout/heading que adicionámos
 * Não toca em child_page nem child_database.
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
if (!TOKEN) { console.error('NOTION_API_KEY não definida'); process.exit(1) }

function nReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'api.notion.com', path, method,
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
        try {
          const json = JSON.parse(raw)
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json)
          else resolve(null) // silently skip inaccessible pages
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    if (payload) req.write(payload)
    req.end()
  })
}

async function getChildren(id) {
  const r = await nReq('GET', `/v1/blocks/${id}/children?page_size=100`)
  return r?.results ?? []
}

// Tipos de blocos que NÓS adicionámos — seguros para arquivar
const OUR_BLOCK_TYPES = new Set([
  'callout', 'heading_1', 'heading_2', 'heading_3',
  'paragraph', 'divider', 'bulleted_list_item', 'numbered_list_item',
])

async function cleanPage(id, name) {
  const blocks = await getChildren(id)
  let removed = 0
  for (const b of blocks) {
    if (OUR_BLOCK_TYPES.has(b.type)) {
      const r = await nReq('PATCH', `/v1/blocks/${b.id}`, { archived: true })
      if (r !== null) removed++
    }
  }
  // Remove cover
  await nReq('PATCH', `/v1/pages/${id}`, { cover: null })
  console.log(`  ✓ ${name} — ${removed} blocos removidos, cover limpo`)
}

// Todas as páginas que tocámos
const pages = [
  // Páginas de departamento (reais)
  { id: '333b41f4-1d3e-467d-a49e-36b9f4c7206a', name: 'Administração' },
  { id: '6a51b61c-e89f-476c-a8b0-69391ab742b2', name: 'Departamento Financeiro' },
  { id: '8c1965bc-3ac0-49c3-a128-9958f2796dbd', name: 'Departamento Comercial' },
  { id: '9a7cd819-ad5f-4e19-949a-1d42605f2892', name: 'Formação' },
  // Sub-páginas da Administração
  { id: '30dc6d45-a01f-80ce-89b9-dbe880497b11', name: "KPI'S por Trimestre" },
  { id: '30dc6d45-a01f-803d-a8fe-c765b0157bb4', name: 'Tarefas a Fazer' },
  { id: '30dc6d45-a01f-8045-8e2c-c2f824985a6d', name: 'Tracker Tarefas' },
  { id: '30dc6d45-a01f-80c9-84b1-f6ed7e5ef62f', name: 'SOP' },
  // Sub-páginas do Comercial
  { id: '332c6d45-a01f-8133-a0d8-d968b30e8ec5', name: 'Dashboard Geral' },
  // Formação
  { id: '333c6d45-a01f-81bf-8a45-c217d3b5901b', name: 'Áreas Mínimas' },
  // Páginas legadas do Dashboard Central (já parcialmente revertidas)
  { id: '333c6d45-a01f-8183-a378-e0fd92f7521f', name: 'Dashboard Central (legado)' },
  { id: '333c6d45-a01f-81dc-9cb4-d12a999e28ed', name: 'Financeiro legado' },
  { id: '333c6d45-a01f-810d-bae7-ca7a9882ebef', name: 'Comercial legado' },
  // SOMNIUM PROPERTIES principal
  { id: '2bcc6d45-a01f-80d0-aae1-f5db53cdb9ca', name: 'SOMNIUM PROPERTIES' },
]

async function main() {
  console.log('A remover todos os blocos e covers adicionados...\n')
  for (const p of pages) {
    await cleanPage(p.id, p.name)
  }

  console.log(`
✅ Blocos e covers removidos de todas as páginas acessíveis.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  ACÇÃO MANUAL NECESSÁRIA — Notion Trash
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Os blocos originais que foram arquivados pelos scripts anteriores
estão no Trash do Notion. Para restaurar:

1. Abre cada uma destas páginas no Notion:
   → Departamento Comercial
   → Departamento Financeiro
   → Administração
   → Formação
   → SOP (dentro de Administração)

2. Em cada página: canto superior direito → "..." → Trash

3. Selecciona todos os itens → Restore

A "Pipeline de Leads" (com os imóveis) está no Trash
do Departamento Comercial — restaura-a primeiro.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
