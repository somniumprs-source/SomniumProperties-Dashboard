#!/usr/bin/env node
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

function notionGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.notion.com', path, method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2022-06-28' },
    }
    const req = https.request(options, res => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => resolve(JSON.parse(raw)))
    })
    req.on('error', reject)
    req.end()
  })
}

async function getPage(pageId) {
  return notionGet(`/v1/pages/${pageId}`)
}

async function getChildren(blockId) {
  const res = await notionGet(`/v1/blocks/${blockId}/children?page_size=100`)
  return res.results ?? []
}

function getTitle(page) {
  const props = page.properties
  if (!props) return '(sem título)'
  for (const key of ['title', 'Title', 'Name', 'Nome']) {
    const p = props[key]
    if (p?.title?.[0]?.plain_text) return p.title[0].plain_text
  }
  return '(sem título)'
}

const deptPages = [
  { name: 'ADMINISTRAÇÃO',   id: '333b41f4-1d3e-467d-a49e-36b9f4c7206a' },
  { name: 'FINANCEIRO',      id: '6a51b61c-e89f-476c-a8b0-69391ab742b2' },
  { name: 'COMERCIAL',       id: '8c1965bc-3ac0-49c3-a128-9958f2796dbd' },
  { name: 'FORMAÇÃO',        id: '9a7cd819-ad5f-4e19-949a-1d42605f2892' },
]

for (const dept of deptPages) {
  console.log(`\n── ${dept.name} (${dept.id})`)
  const blocks = await getChildren(dept.id)
  for (const b of blocks) {
    if (b.type === 'child_page') {
      console.log(`  child_page  "${b.child_page.title}"  ${b.id}`)
    } else if (b.type === 'child_database') {
      console.log(`  child_db    "${b.child_database.title}"  ${b.id}`)
    }
  }
}
