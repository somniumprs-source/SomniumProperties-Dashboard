/**
 * Pesquisa diária de imóveis no Idealista via Apify (actor
 * sian.agency/smart-idealista-scraper) — automatiza o Passo 1/2 do SOP 1
 * (Procura de Negócios Imobiliários, secção 5.2.1).
 * Port de supabase/functions/_shared/apifyIdealista.ts — ver ali as notas
 * completas sobre a corrida real de validação (2026-09-03): modo `locationName`
 * (não `searchUrl`, que exige tier pago), sem campo `year`, condição em
 * `propertyStatus`, custo real $0.03/imóvel extraído.
 */
import pool from './pg.js'

export const CONCELHOS_ALVO = [
  { concelho: 'Coimbra', distrito: 'Coimbra', zona: 'coimbra' },
  { concelho: 'Condeixa-a-Nova', distrito: 'Coimbra', zona: 'coimbra' },
  { concelho: 'Porto', distrito: 'Porto', zona: 'porto' },
  { concelho: 'Matosinhos', distrito: 'Porto', zona: 'porto' },
  { concelho: 'Maia', distrito: 'Porto', zona: 'porto' },
  { concelho: 'Gondomar', distrito: 'Porto', zona: 'porto' },
  { concelho: 'Vila Nova de Gaia', distrito: 'Porto', zona: 'porto' },
]

export const PRECO_MAXIMO = 250000
const TIPOS_CASA_ACEITES = /moradia|chalet|casa|vivenda/i

async function chamarActorApify(locationName) {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('APIFY_TOKEN não configurado')
  const r = await fetch(
    `https://api.apify.com/v2/acts/sian.agency~smart-idealista-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        country: 'pt',
        operation: 'sale',
        locationName,
        maxPrice: PRECO_MAXIMO,
        language: 'pt',
        // "T" (24h) só existe para arrendamento; para venda o mais próximo é
        // "Y" (48h) — evita re-pagar todos os dias por anúncios já vistos.
        sinceDate: 'Y',
        numPages: 1,
      }),
    }
  )
  if (!r.ok) throw new Error(`Apify respondeu ${r.status}: ${await r.text().catch(() => '')}`)
  const data = await r.json()
  return Array.isArray(data) ? data : []
}

function tipologiaDe(rooms, propertyType) {
  if (propertyType && TIPOS_CASA_ACEITES.test(propertyType)) return 'Moradia'
  if (rooms == null) return null
  if (rooms >= 6) return 'T6'
  if (rooms >= 1) return `T${rooms}`
  return null
}

async function precoM2Referencia(concelho) {
  const { rows } = await pool.query(
    `SELECT preco_m2_medio FROM preco_m2_referencia WHERE concelho = $1`, [concelho]
  )
  return rows[0] ? Number(rows[0].preco_m2_medio) : null
}

export async function normalizarItem(raw, concelho, distrito, zona) {
  const tipologia = tipologiaDe(raw.rooms, raw.propertyType)
  if (!tipologia) return null // fora do critério T1-T6/Moradias — descartar

  const referencia = await precoM2Referencia(concelho)
  // Sem `year` disponível nesta API/tier — sinal fica sempre false.
  const sinalEquityAno = typeof raw.year === 'number' && raw.year > 0 && raw.year < 2000
  const sinalEquityPrecoM2 = referencia != null && typeof raw.pricePerSqm === 'number' && raw.pricePerSqm < referencia
  const sinalObras = raw.propertyStatus === 'renew'

  return {
    property_code: String(raw.propertyCode || raw.id || raw.url || crypto.randomUUID()),
    link: raw.url ?? null,
    concelho,
    zona,
    preco: raw.price ?? null,
    preco_m2: raw.pricePerSqm ?? null,
    area: raw.size ?? null,
    quartos: raw.rooms ?? null,
    casas_banho: raw.bathrooms ?? null,
    morada: raw.address ?? null,
    distrito,
    freguesia: raw.district ?? raw.municipality ?? null,
    tipologia,
    predio_tipo: raw.propertyType ?? null,
    ano_construcao: raw.year ?? null,
    condicao: raw.propertyStatus ?? null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    thumbnail: raw.thumbnail ?? null,
    fotos_urls: JSON.stringify(raw.images ?? []),
    agencia_nome: raw.agencyName ?? null,
    agencia_telefone: raw.agentPhone ?? null,
    agencia_url: raw.agencyUrl ?? null,
    sinal_equity_ano: sinalEquityAno,
    sinal_equity_preco_m2: sinalEquityPrecoM2,
    preco_m2_referencia_usado: referencia,
    sinal_obras: sinalObras,
    raw: JSON.stringify(raw),
  }
}

export async function buscarOportunidadesIdealista() {
  const candidatos = []
  const erros = []
  for (const { concelho, distrito, zona } of CONCELHOS_ALVO) {
    try {
      const items = await chamarActorApify(concelho)
      for (const raw of items) {
        const item = await normalizarItem(raw, concelho, distrito, zona)
        if (item) candidatos.push(item)
      }
    } catch (e) {
      erros.push(`${concelho}: ${e.message}`)
      console.error(`[apify-idealista] Erro em ${concelho}:`, e.message)
    }
  }
  return { candidatos, erros }
}
