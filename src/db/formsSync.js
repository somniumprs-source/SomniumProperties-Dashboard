/**
 * Sync Google Forms (respostas de investidores) → CRM.
 * Lê respostas do Google Sheet, verifica duplicados, cria/actualiza investidores.
 */
import { google } from 'googleapis'
import pool from './pg.js'
import { Investidores } from './crud.js'
import { getGoogleAuth, isGoogleConfigured } from './googleAuth.js'
import { mapRoi, mapExperiencia, mapTipoImovel, mapLocalizacao, mapEquipa } from './investidorMappers.js'

const SHEET_ID = process.env.GOOGLE_FORMS_SHEET_ID || '1NxsPoLBwLuoCh6SvBOrr_sph8BugwJPuZ4vihriIA1s'

function getAuth() {
  return getGoogleAuth()
}

export function isConfigured() {
  return !!SHEET_ID && isGoogleConfigured()
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
    const tipoImovel = mapTipoImovel(row[6])
    const localizacao = mapLocalizacao(row[7])
    const equipaObras = mapEquipa(row[8])
    const roi = mapRoi(row[9])
    const { capital_min, capital_max } = parseCapital(row[10])
    const roiAnualizado = (row[11] || '').trim()
    const tipoInvestidor = parseTipoInvestidor(row[12])
    const experiencia = mapExperiencia(row[13])
    const origem = parseOrigem(row[14])
    const timestamp = (row[0] || '').trim()

    // Verificar duplicados por nome, email OU telefone
    const normNome = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    const phoneLast9 = telemovel.replace(/[^\d]/g, '').slice(-9)

    // Build parameterized query dynamically
    const params = [nome, normNome]
    const conditions = [
      'LOWER(TRIM(nome)) = LOWER($1)',
      "LOWER(TRANSLATE(TRIM(nome), 'áàâãéèêíìîóòôõúùûçñ', 'aaaaeeeiiioooouuucn')) = $2",
    ]
    if (email) {
      params.push(email)
      conditions.push(`LOWER(TRIM(email)) = LOWER($${params.length})`)
    }
    if (phoneLast9.length === 9) {
      params.push(phoneLast9)
      conditions.push(`RIGHT(REGEXP_REPLACE(telemovel, '[^0-9]', '', 'g'), 9) = $${params.length}`)
    }

    const { rows: candidates } = await pool.query(
      `SELECT id, nome, email, telemovel, capital_min, capital_max, estrategia, tipo_investidor, tipo_principal,
              preferencia_contacto, tipo_imovel_preferido, localizacao_preferida, equipa_obras,
              roi_pretendido, experiencia_imobiliario, perfil_risco, origem, notas
       FROM investidores
       WHERE ${conditions.join('\n          OR ')}
       LIMIT 1`,
      params
    )
    let existing = candidates[0]

    // Derivar tipo_principal a partir do tipo_investidor
    const tipoPrincipal = derivarTipoPrincipal(tipoInvestidor)

    if (existing) {
      // Actualizar apenas campos vazios
      const updates = {}
      if (!existing.email && email) updates.email = email
      if (!existing.telemovel && telemovel) updates.telemovel = telemovel
      if (!existing.capital_min && capital_min) updates.capital_min = capital_min
      if (!existing.capital_max && capital_max) updates.capital_max = capital_max
      if (!existing.estrategia && estrategia) updates.estrategia = estrategia
      if (!existing.tipo_investidor && tipoInvestidor) updates.tipo_investidor = tipoInvestidor
      if (!existing.tipo_principal && tipoPrincipal) updates.tipo_principal = tipoPrincipal
      if (!existing.preferencia_contacto && prefContacto) updates.preferencia_contacto = prefContacto
      if (!existing.tipo_imovel_preferido && tipoImovel) updates.tipo_imovel_preferido = tipoImovel
      if (!existing.localizacao_preferida && localizacao) updates.localizacao_preferida = localizacao
      if (!existing.equipa_obras && equipaObras && equipaObras !== 'Não') updates.equipa_obras = equipaObras
      if (!existing.roi_pretendido && roi && roi !== '.') updates.roi_pretendido = roi
      if (!existing.experiencia_imobiliario && experiencia) updates.experiencia_imobiliario = experiencia
      if (!existing.origem && origem) updates.origem = origem
      if (!existing.perfil_risco) {
        const perfil = derivarPerfilRisco(roi, roiAnualizado)
        if (perfil) updates.perfil_risco = perfil
      }

      if (Object.keys(updates).length > 0) {
        await Investidores.update(existing.id, updates)
        updated++
      } else {
        skipped++
      }
    } else {
      // Criar novo investidor
      const data = {
        nome,
        status: 'Potencial Investidor',
        data_primeiro_contacto: parseTimestamp(timestamp),
      }
      if (origem) data.origem = origem
      if (email) data.email = email
      if (telemovel) data.telemovel = telemovel
      if (capital_min) data.capital_min = capital_min
      if (capital_max) data.capital_max = capital_max
      if (estrategia) data.estrategia = estrategia
      if (tipoInvestidor) data.tipo_investidor = tipoInvestidor
      if (tipoPrincipal) data.tipo_principal = tipoPrincipal
      if (prefContacto) data.preferencia_contacto = prefContacto
      if (tipoImovel) data.tipo_imovel_preferido = tipoImovel
      if (localizacao) data.localizacao_preferida = localizacao
      if (equipaObras && equipaObras !== 'Não') data.equipa_obras = equipaObras
      if (roi && roi !== '.') data.roi_pretendido = roi
      if (experiencia) data.experiencia_imobiliario = experiencia
      const perfil = derivarPerfilRisco(roi, roiAnualizado)
      if (perfil) data.perfil_risco = perfil
      // Auto-detectar `regioes_preferidas` a partir da string localização
      // (campo livre do Google Forms). Procura por palavras-chave de cada
      // região; default ["Coimbra"] se nada bater. Permite múltiplas regiões.
      data.regioes_preferidas = JSON.stringify(detectarRegioes(localizacao))

      await Investidores.create(data)
      created++
    }
  }

  return { created, updated, skipped, total: rows.length - 1 }
}

// ── Detecção regional a partir de texto livre ────────────────
// Map: palavras-chave (lowercased, sem acentos) → região.
// Permite múltiplas regiões se o investidor escreveu, ex: "Coimbra e Porto".
const REGIAO_KEYWORDS = {
  AMP: [
    'porto', 'gaia', 'vila nova de gaia', 'amp', 'area metropolitana do porto',
    'matosinhos', 'maia', 'gondomar', 'valongo', 'espinho', 'feira',
    'santa maria da feira', 'santo tirso', 'trofa', 'povoa de varzim',
    'aveiro',
  ],
  Coimbra: [
    'coimbra', 'condeixa', 'mealhada', 'cantanhede', 'lousa', 'lousã',
    'penacova', 'miranda do corvo', 'montemor', 'figueira da foz', 'pampilhosa',
    'tabua', 'tábua', 'soure', 'mira', 'gois', 'góis', 'arganil', 'penela',
  ],
}
function detectarRegioes(texto) {
  if (!texto || typeof texto !== 'string') return ['Coimbra']
  const norm = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const found = new Set()
  for (const [regiao, words] of Object.entries(REGIAO_KEYWORDS)) {
    if (words.some(w => norm.includes(w))) found.add(regiao)
  }
  return found.size > 0 ? [...found] : ['Coimbra']
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

const ORIGENS_CANONICAS = ['Skool', 'Grupos Whatsapp', 'Referenciação', 'LinkedIn', 'Eventos Networking', 'Outro']

function normalizeOrigem(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function parseOrigem(raw) {
  if (!raw) return null
  const norm = normalizeOrigem(raw)
  if (!norm) return null
  for (const canon of ORIGENS_CANONICAS) {
    if (normalizeOrigem(canon) === norm) return canon
  }
  // Tolerar variações comuns
  if (norm.includes('whats')) return 'Grupos Whatsapp'
  if (norm.includes('referenc') || norm.includes('indica')) return 'Referenciação'
  if (norm.includes('linkedin')) return 'LinkedIn'
  if (norm.includes('skool')) return 'Skool'
  if (norm.includes('event') || norm.includes('network')) return 'Eventos Networking'
  return null
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

function derivarTipoPrincipal(tipoInvestidorJson) {
  if (!tipoInvestidorJson) return 'Passivo'
  try {
    const tipos = JSON.parse(tipoInvestidorJson)
    if (tipos.includes('Ativo')) return 'Ativo'
    return 'Passivo'
  } catch { return 'Passivo' }
}

function derivarPerfilRisco(roi, roiAnualizado) {
  const roiText = (roi || roiAnualizado || '').toLowerCase()
  const numMatch = roiText.match(/(\d+)/)
  if (!numMatch) return null
  const val = parseInt(numMatch[1])
  if (val >= 30) return 'Agressivo'
  if (val >= 15) return 'Moderado'
  if (val > 0) return 'Conservador'
  return null
}
