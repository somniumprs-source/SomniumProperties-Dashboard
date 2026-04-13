/**
 * Integração Fireflies.ai → CRM
 * Puxa transcrições de reuniões e guarda na base de dados.
 * Liga automaticamente a investidores/consultores pelo nome.
 */
import pool from './pg.js'

const FIREFLIES_API = 'https://api.fireflies.ai/graphql'
const API_KEY = process.env.FIREFLIES_API_KEY || ''

async function gql(query, variables = {}) {
  if (!API_KEY) throw new Error('FIREFLIES_API_KEY não configurada')
  const r = await fetch(FIREFLIES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ query, variables }),
  })
  const data = await r.json()
  if (data.errors) throw new Error(data.errors[0].message)
  return data.data
}

/**
 * Buscar transcrições do Fireflies
 */
export async function fetchTranscripts(limit = 50) {
  const data = await gql(`{
    transcripts(limit: ${limit}) {
      id title date duration
      organizer_email participants
      summary { overview keywords action_items }
      sentences { text speaker_name start_time end_time }
    }
  }`)
  return data.transcripts || []
}

/**
 * Buscar uma transcrição completa por ID
 */
export async function fetchTranscript(id) {
  const data = await gql(`{
    transcript(id: "${id}") {
      id title date duration
      organizer_email participants
      summary { overview keywords action_items outline shorthand_bullet }
      sentences { text speaker_name start_time end_time }
    }
  }`)
  return data.transcript
}

/**
 * Sync: importar transcrições novas para a BD
 */
export async function syncFireflies() {
  const transcripts = await fetchTranscripts(50)
  let created = 0, skipped = 0

  for (const t of transcripts) {
    // Verificar se já existe
    const { rows: [existing] } = await pool.query(
      'SELECT id FROM reunioes WHERE fireflies_id = $1', [t.id]
    )
    if (existing) { skipped++; continue }

    const id = (await import('crypto')).randomUUID()
    const now = new Date().toISOString()
    const data = new Date(t.date).toISOString()
    const duracao = Math.round((t.duration || 0) / 60)

    // Construir transcrição completa
    const transcricao = (t.sentences || []).map(s =>
      `[${s.speaker_name}]: ${s.text}`
    ).join('\n')

    // Resumo
    const resumo = t.summary?.overview || ''
    const keywords = Array.isArray(t.summary?.keywords) ? t.summary.keywords.join(', ') : (t.summary?.keywords || '')
    const actionItems = Array.isArray(t.summary?.action_items) ? t.summary.action_items.join('\n') : (t.summary?.action_items || '')

    // Tentar ligar a investidor/consultor pelo nome no título
    const { entidade_tipo, entidade_id } = await matchEntity(t.title, t.participants)

    await pool.query(
      `INSERT INTO reunioes (id, fireflies_id, titulo, data, duracao_min, participantes,
       resumo, keywords, action_items, transcricao, entidade_tipo, entidade_id,
       organizador, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [id, t.id, t.title, data, duracao, JSON.stringify(t.participants || []),
       resumo, keywords, actionItems, transcricao, entidade_tipo, entidade_id,
       t.organizer_email, now, now]
    )
    created++
  }

  return { created, skipped, total: transcripts.length }
}

/**
 * Tenta ligar uma reunião a um investidor ou consultor pelo nome
 */
async function matchEntity(title, participants) {
  if (!title) return { entidade_tipo: null, entidade_id: null }

  // Extrair nomes do título (ex: "Francisco Martin e alexandre mendes")
  const names = title.split(/\s+e\s+/i).map(n => n.trim()).filter(n => n.length > 2)

  for (const name of names) {
    // Ignorar nomes da equipa Somnium
    if (/alexandre|mendes|jo[aã]o|abreu|somnium/i.test(name)) continue

    // Procurar investidor
    const { rows: [inv] } = await pool.query(
      "SELECT id FROM investidores WHERE nome ILIKE $1 LIMIT 1",
      [`%${name}%`]
    )
    if (inv) return { entidade_tipo: 'investidores', entidade_id: inv.id }

    // Procurar consultor
    const { rows: [cons] } = await pool.query(
      "SELECT id FROM consultores WHERE nome ILIKE $1 LIMIT 1",
      [`%${name}%`]
    )
    if (cons) return { entidade_tipo: 'consultores', entidade_id: cons.id }
  }

  return { entidade_tipo: null, entidade_id: null }
}

export function isConfigured() {
  return !!API_KEY
}
