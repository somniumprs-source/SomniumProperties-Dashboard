/**
 * Sync Google Forms (respostas de investidores) → CRM.
 * Lê respostas do Google Sheet, verifica duplicados, cria/actualiza investidores.
 */
import { google } from 'googleapis'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from './pg.js'
import { Investidores } from './crud.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OAUTH_PATH = path.join(ROOT, 'google-oauth.json')
const TOKEN_PATH = path.join(ROOT, 'google-token.json')

const SHEET_ID = process.env.GOOGLE_FORMS_SHEET_ID || '1NxsPoLBwLuoCh6SvBOrr_sph8BugwJPuZ4vihriIA1s'

function getAuth() {
  if (!existsSync(OAUTH_PATH) || !existsSync(TOKEN_PATH)) return null
  const creds = JSON.parse(readFileSync(OAUTH_PATH, 'utf8'))
  const { client_id, client_secret } = creds.installed || creds.web
  const oauth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333')
  oauth2.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, 'utf8')))
  return oauth2
}

export function isConfigured() {
  return !!SHEET_ID && existsSync(OAUTH_PATH) && existsSync(TOKEN_PATH)
}

/**
 * Sync respostas do Google Forms → investidores no CRM
 */
export async function syncForms() {
  const auth = getAuth()
  if (!auth) throw new Error('Google OAuth não configurado')

  const sheets = google.sheets({ version: 'v4', auth })
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'A:O',
  })

  const rows = r.data.values || []
  if (rows.length < 2) return { created: 0, updated: 0, skipped: 0, total: 0 }

  const headers = rows[0]
  let created = 0, updated = 0, skipped = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[1]?.trim()) continue // sem nome

    const nome = row[1].trim()
    const email = (row[2] || '').trim().toLowerCase()
    const telemovel = (row[3] || '').trim()
    const prefContacto = (row[4] || '').trim()
    const estrategia = parseEstrategia(row[5])
    const tipoImovel = (row[6] || '').trim()
    const localizacao = (row[7] || '').trim()
    const equipaObras = (row[8] || '').trim()
    const roi = (row[9] || '').trim()
    const { capital_min, capital_max } = parseCapital(row[10])
    const roiAnualizado = (row[11] || '').trim()
    const tipoInvestidor = parseTipoInvestidor(row[12])
    const experiencia = (row[13] || '').trim()
    const timestamp = (row[0] || '').trim()

    // Verificar duplicados por nome, email OU telefone
    const normNome = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    const phoneLast9 = telemovel.replace(/[^\d]/g, '').slice(-9)

    const { rows: candidates } = await pool.query(
      `SELECT id, nome, email, telemovel, capital_min, capital_max, estrategia, tipo_investidor, notas FROM investidores
       WHERE LOWER(TRIM(nome)) = LOWER($1)
          OR LOWER(TRANSLATE(TRIM(nome), 'áàâãéèêíìîóòôõúùûçñ', 'aaaaeeeiiioooouuucn')) = $2
          ${email ? "OR LOWER(TRIM(email)) = LOWER('" + email.replace(/'/g, "''") + "')" : ''}
          ${phoneLast9.length === 9 ? "OR RIGHT(REGEXP_REPLACE(telemovel, '[^0-9]', '', 'g'), 9) = '" + phoneLast9 + "'" : ''}
       LIMIT 1`,
      [nome, normNome]
    )
    let existing = candidates[0]

    if (existing) {
      // Actualizar apenas campos vazios
      const updates = {}
      if (!existing.email && email) updates.email = email
      if (!existing.telemovel && telemovel) updates.telemovel = telemovel
      if (!existing.capital_min && capital_min) updates.capital_min = capital_min
      if (!existing.capital_max && capital_max) updates.capital_max = capital_max
      if (!existing.estrategia && estrategia) updates.estrategia = estrategia
      if (!existing.tipo_investidor && tipoInvestidor) updates.tipo_investidor = tipoInvestidor

      // Adicionar info do form às notas se não existir
      const formNote = buildFormNote(prefContacto, tipoImovel, localizacao, equipaObras, roi, roiAnualizado, experiencia)
      if (formNote && (!existing.notas || !existing.notas.includes('[Google Form]'))) {
        updates.notas = existing.notas ? existing.notas + '\n\n' + formNote : formNote
      }

      if (Object.keys(updates).length > 0) {
        await Investidores.update(existing.id, updates)
        updated++
      } else {
        skipped++
      }
    } else {
      // Criar novo investidor
      const formNote = buildFormNote(prefContacto, tipoImovel, localizacao, equipaObras, roi, roiAnualizado, experiencia)
      const data = {
        nome,
        status: 'Potencial Investidor',
        origem: 'Google Forms',
        data_primeiro_contacto: parseTimestamp(timestamp),
      }
      if (email) data.email = email
      if (telemovel) data.telemovel = telemovel
      if (capital_min) data.capital_min = capital_min
      if (capital_max) data.capital_max = capital_max
      if (estrategia) data.estrategia = estrategia
      if (tipoInvestidor) data.tipo_investidor = tipoInvestidor
      if (formNote) data.notas = formNote

      await Investidores.create(data)
      created++
    }
  }

  return { created, updated, skipped, total: rows.length - 1 }
}

// ── Parsers ─────────────────────────────────────────────────

function parseCapital(raw) {
  if (!raw) return { capital_min: null, capital_max: null }
  const s = raw.toLowerCase().replace(/\s/g, '').replace(/€/g, '').replace(/euros?/g, '')

  // "50k-100k" or "50K-100K"
  const range = s.match(/(\d+)k?\s*[-a]\s*(\d+)k/i)
  if (range) {
    const min = parseInt(range[1]) * (range[1].length <= 3 ? 1000 : 1)
    const max = parseInt(range[2]) * (range[2].length <= 3 ? 1000 : 1)
    return { capital_min: min, capital_max: max }
  }

  // "Até 50K" or "até 50k"
  const ate = s.match(/at[eé](\d+)k?/i)
  if (ate) {
    const val = parseInt(ate[1]) * (ate[1].length <= 3 ? 1000 : 1)
    return { capital_min: null, capital_max: val }
  }

  // "100k" or "100K" or "100.000"
  const single = s.match(/(\d+)k/i)
  if (single) {
    return { capital_min: null, capital_max: parseInt(single[1]) * 1000 }
  }

  // Plain number
  const num = parseInt(s.replace(/[^\d]/g, ''))
  if (num > 1000) return { capital_min: null, capital_max: num }

  return { capital_min: null, capital_max: null }
}

function parseEstrategia(raw) {
  if (!raw) return null
  const strategies = []
  const s = raw.toLowerCase()
  if (s.includes('caep')) strategies.push('CAEP')
  if (s.includes('ced') || s.includes('posição') || s.includes('posicao')) strategies.push('Cedência de posição')
  if (s.includes('fix') || s.includes('flip')) strategies.push('Fix & Flip')
  if (s.includes('wholesal')) strategies.push('Wholesaling')
  if (s.includes('media') || s.includes('mediação')) strategies.push('Mediação')
  if (s.includes('arrend')) strategies.push('Arrendamento')
  if (strategies.length === 0) strategies.push(raw.trim())
  return JSON.stringify(strategies)
}

function parseTipoInvestidor(raw) {
  if (!raw) return null
  const s = raw.toLowerCase()
  const tipos = []
  if (s.includes('passivo')) tipos.push('Passivo')
  if (s.includes('ativo') || s.includes('activo')) tipos.push('Ativo')
  if (tipos.length === 0) tipos.push(raw.trim())
  return JSON.stringify(tipos)
}

function parseTimestamp(ts) {
  if (!ts) return new Date().toISOString().slice(0, 10)
  // "2026/02/02 15:33:49" → "2026-02-02"
  return ts.replace(/\//g, '-').slice(0, 10)
}

function buildFormNote(prefContacto, tipoImovel, localizacao, equipaObras, roi, roiAnualizado, experiencia) {
  const parts = ['[Google Form]']
  if (experiencia) parts.push(`Experiência: ${experiencia}`)
  if (prefContacto) parts.push(`Pref. contacto: ${prefContacto}`)
  if (tipoImovel) parts.push(`Tipo imóvel: ${tipoImovel}`)
  if (localizacao) parts.push(`Localização: ${localizacao}`)
  if (equipaObras && equipaObras !== 'Não') parts.push(`Equipa obras: ${equipaObras}`)
  if (roi && roi !== '.') parts.push(`ROI pretendido: ${roi}`)
  if (roiAnualizado && roiAnualizado !== '.') parts.push(`ROI anualizado: ${roiAnualizado}`)
  return parts.length > 1 ? parts.join('\n') : null
}
