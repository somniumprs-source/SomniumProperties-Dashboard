/**
 * sync-calendar.js
 * Lê eventos do Google Calendar e cria tarefas em "Tarefas a fazer" no Notion.
 * Corre: node scripts/sync-calendar.js
 * Corre com --days=60 para buscar 60 dias (default 30)
 */

import 'dotenv/config'
import { google } from 'googleapis'
import { Client } from '@notionhq/client'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')

// ── Config ────────────────────────────────────────────────────────
const CALENDAR_ID    = process.env.GOOGLE_CALENDAR_ID ?? 'somniumprs@gmail.com'
const NOTION_DB_ID   = '2e3c6d45-a01f-80b9-a649-e436f8506364'
const DAYS_AHEAD     = parseInt(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] ?? '30')
const DRY_RUN        = process.argv.includes('--dry-run')

// ── Auth ──────────────────────────────────────────────────────────
const credPath  = join(ROOT, 'google-credentials.json')
const creds     = JSON.parse(readFileSync(credPath, 'utf8'))
const auth      = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
})
const calendar  = google.calendar({ version: 'v3', auth })
const notion    = new Client({ auth: process.env.NOTION_API_KEY })

// ── Helpers ───────────────────────────────────────────────────────
function toISO(dateObj) {
  return dateObj?.dateTime ?? dateObj?.date ?? null
}

// Notion não aceita offset UTC quando time_zone é fornecido — strip do offset
function stripOffset(iso) {
  if (!iso) return null
  // Remove +HH:MM ou -HH:MM no fim, mantém formato YYYY-MM-DDTHH:MM:SS
  return iso.replace(/([+-]\d{2}:\d{2}|Z)$/, '')
}

function formatDate(iso) {
  if (!iso) return '?'
  const d = new Date(iso)
  return d.toLocaleString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ── Buscar eventos existentes no Notion (para evitar duplicados) ──
async function getExistingGCalIds() {
  const existing = new Set()
  let cursor
  do {
    const res = await notion.databases.query({
      database_id: NOTION_DB_ID,
      filter: { property: 'Tarefa', title: { is_not_empty: true } },
      start_cursor: cursor,
      page_size: 100,
    })
    for (const page of res.results) {
      const gcalId = page.properties['GCal ID']
      // Guardamos o ID do evento no campo Notas se existir (ver abaixo)
      // Para simplicidade: comparamos pelo título + data de início
      const title  = page.properties['Tarefa']?.title?.[0]?.plain_text ?? ''
      const inicio = page.properties['Início da tarefa']?.date?.start ?? ''
      existing.add(`${title}__${inicio.slice(0, 16)}`)
    }
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return existing
}

// ── Criar tarefa no Notion ────────────────────────────────────────
async function createTask(event) {
  const start = toISO(event.start)
  const end   = toISO(event.end)
  const isAllDay = !!event.start?.date && !event.start?.dateTime

  const props = {
    'Tarefa': {
      title: [{ text: { content: event.summary ?? '(sem título)' } }],
    },
    'Status': {
      status: { name: 'A fazer' },
    },
  }

  if (start) {
    if (isAllDay) {
      const endDate = event.end?.date
      props['Início da tarefa'] = {
        date: endDate && endDate !== event.start.date
          ? { start: event.start.date, end: endDate }
          : { start: event.start.date },
      }
    } else {
      const s = stripOffset(start)
      const e = stripOffset(toISO(event.end))
      props['Início da tarefa'] = {
        date: e ? { start: s, end: e, time_zone: 'Europe/Lisbon' }
                : { start: s, time_zone: 'Europe/Lisbon' },
      }
    }
  }

  await notion.pages.create({
    parent: { database_id: NOTION_DB_ID },
    properties: props,
  })
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📅 A sincronizar Google Calendar → Notion`)
  console.log(`   Calendário: ${CALENDAR_ID}`)
  console.log(`   Período:    próximos ${DAYS_AHEAD} dias`)
  if (DRY_RUN) console.log(`   Modo:       DRY RUN (não cria tarefas)`)
  console.log()

  // Intervalo de tempo
  const now    = new Date()
  const until  = new Date(now)
  until.setDate(until.getDate() + DAYS_AHEAD)

  // Buscar eventos do Google Calendar
  let events
  try {
    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: now.toISOString(),
      timeMax: until.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    })
    events = res.data.items ?? []
  } catch (err) {
    if (err.message?.includes('Not Found') || err.message?.includes('forbidden') || err.code === 404 || err.code === 403) {
      console.error('❌ Sem acesso ao calendário.')
      console.error('   Confirma que partilhaste o calendário com:')
      console.error('   somnium-calendar@somnium-properties.iam.gserviceaccount.com')
      console.error('   (Settings and sharing → Share with specific people → See all event details)')
      process.exit(1)
    }
    throw err
  }

  console.log(`✅ ${events.length} evento(s) encontrados no Google Calendar`)

  if (events.length === 0) {
    console.log('   Nada a sincronizar.')
    return
  }

  // Buscar tarefas já existentes (para não duplicar)
  const existing = await getExistingGCalIds()
  console.log(`   ${existing.size} tarefa(s) já existem no Notion\n`)

  let criadas = 0
  let ignoradas = 0

  for (const event of events) {
    const title = event.summary ?? '(sem título)'
    const start = toISO(event.start)
    const key   = `${title}__${stripOffset(start)?.slice(0, 16)}`

    if (existing.has(key)) {
      ignoradas++
      continue
    }

    console.log(`  + ${formatDate(start)}  ${title}`)

    if (!DRY_RUN) {
      try {
        await createTask(event)
        criadas++
      } catch (err) {
        console.error(`    ⚠️  Erro ao criar "${title}": ${err.message}`)
      }
    } else {
      criadas++
    }
  }

  console.log(`\n✅ Concluído: ${criadas} criada(s), ${ignoradas} já existia(m)`)
  if (DRY_RUN) console.log('   (dry run — nada foi escrito no Notion)')
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1) })
