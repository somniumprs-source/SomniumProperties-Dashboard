#!/usr/bin/env node
/**
 * Remove os blocos novos adicionados pelo unify-notion.js e limpa covers.
 * Os blocos originais arquivados têm de ser restaurados via Notion Trash (UI).
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
        const json = JSON.parse(raw)
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json)
        else reject(new Error(`Notion ${res.statusCode}: ${raw.slice(0, 200)}`))
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function getChildren(id) {
  const r = await nReq('GET', `/v1/blocks/${id}/children?page_size=100`)
  return r.results ?? []
}

const pages = [
  { id: '2bcc6d45-a01f-80d0-aae1-f5db53cdb9ca', name: 'SOMNIUM PROPERTIES' },
  { id: '333c6d45-a01f-8183-a378-e0fd92f7521f', name: 'Dashboard Central' },
  { id: '333c6d45-a01f-81dc-9cb4-d12a999e28ed', name: 'Legacy Financeiro' },
  { id: '333c6d45-a01f-810d-bae7-ca7a9882ebef', name: 'Legacy Comercial' },
]

async function main() {
  for (const page of pages) {
    console.log(`\n── ${page.name}`)

    // Remove all non-structural blocks (callouts, dividers, paragraphs, headings we added)
    const active = await getChildren(page.id)
    let removed = 0
    for (const b of active) {
      if (b.type !== 'child_page' && b.type !== 'child_database') {
        try { await nReq('PATCH', `/v1/blocks/${b.id}`, { archived: true }); removed++ } catch {}
      }
    }
    console.log(`  ✓ Removidos ${removed} blocos adicionados`)

    // Remove cover
    try {
      await nReq('PATCH', `/v1/pages/${page.id}`, { cover: null })
      console.log(`  ✓ Cover removido`)
    } catch (e) {
      console.log(`  (sem cover ou erro: ${e.message.slice(0, 60)})`)
    }
  }

  console.log(`
✅ Blocos novos removidos e covers limpos.

⚠️  Os conteúdos originais foram para o Trash do Notion quando foram arquivados.
    Para restaurar completamente:
    1. Abre cada página no Notion
    2. Clica em "..." no canto superior direito
    3. Escolhe "Trash" (ou procura pelo nome dos blocos)
    4. Clica "Restore" em cada bloco/página
  `)
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
