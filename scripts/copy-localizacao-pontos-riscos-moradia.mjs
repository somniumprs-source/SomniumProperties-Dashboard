#!/usr/bin/env node
// Copia informacao das abas "Localização" e "Pontos & Riscos" das duas fraccoes
// (Apartamento T2 RC + Apartamento T3 1andar) para o "Imovel com duas frações".
// Para cada campo: usa o valor da fraccao T3 se existir, caso contrario o da T2.
// Idempotente: se o imovel-alvo ja tiver tese_investimento ou pois_distancias
// populados, sai sem sobrescrever.
//
// Requer: backend dev a correr (npm run dev) em http://localhost:3001
// Uso: node scripts/copy-localizacao-pontos-riscos-moradia.mjs

const BASE = process.env.API_BASE || 'http://localhost:3001'
const HEADERS = { 'Content-Type': 'application/json', 'X-Regiao': 'AMP' }
const NOMES_ALVO = ['Moradia Candal', 'Imovel com duas frações']
const NOMES_FRACCOES = ['Apartamento T2 RC', 'Apartamento T3 1andar']

const CAMPOS_LOCALIZACAO = ['localizacao_imagem', 'pois_distancias', 'morada', 'zona', 'freguesia', 'distrito', 'coordenadas_lat', 'coordenadas_lng']
const CAMPOS_PONTOS_RISCOS = ['tese_investimento', 'pontos_fortes', 'pontos_fracos', 'riscos', 'mitigacao_riscos']
const CAMPOS = [...CAMPOS_LOCALIZACAO, ...CAMPOS_PONTOS_RISCOS]

async function getJson(url, opts = {}) {
  const res = await fetch(`${BASE}${url}`, { headers: HEADERS, ...opts })
  const text = await res.text()
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${url} falhou ${res.status}: ${text}`)
  return JSON.parse(text)
}

function isVazio(v) {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v).length === 0
  return false
}

async function imovelByAnyName(nomes) {
  const body = await getJson(`/api/crm/imoveis?regiao=AMP&limit=500`)
  for (const nome of nomes) {
    const imovel = (body.data || []).find(i => i.nome === nome)
    if (imovel) return imovel
  }
  throw new Error(`Nenhum imovel encontrado para: ${nomes.join(' | ')}`)
}

async function imovelByName(nome) {
  return imovelByAnyName([nome])
}

const moradia = await imovelByAnyName(NOMES_ALVO)
console.log(`Imovel-alvo: "${moradia.nome}" (id=${moradia.id})`)

const moradiaFull = await getJson(`/api/crm/imoveis/${moradia.id}`)
if (!isVazio(moradiaFull.tese_investimento) || !isVazio(moradiaFull.pois_distancias)) {
  console.log('Alvo ja tem tese_investimento ou pois_distancias preenchidos. Nada a fazer (idempotente).')
  process.exit(0)
}

const [t2, t3] = await Promise.all(NOMES_FRACCOES.map(imovelByName))
const [t2Full, t3Full] = await Promise.all([
  getJson(`/api/crm/imoveis/${t2.id}`),
  getJson(`/api/crm/imoveis/${t3.id}`),
])

// Para cada campo: T3 tem prioridade; T2 e fallback.
const updates = {}
for (const k of CAMPOS) {
  const v = !isVazio(t3Full[k]) ? t3Full[k] : (!isVazio(t2Full[k]) ? t2Full[k] : null)
  if (v !== null) updates[k] = v
}

console.log(`A actualizar ${Object.keys(updates).length} campos:`, Object.keys(updates).join(', '))

const updated = await getJson(`/api/crm/imoveis/${moradia.id}`, {
  method: 'PUT',
  body: JSON.stringify(updates),
})

console.log('OK. Confirmacao do estado final:')
for (const k of CAMPOS) {
  const v = updated[k]
  const display = isVazio(v) ? '(vazio)' : (typeof v === 'object' ? JSON.stringify(v).slice(0, 80) + '...' : String(v).slice(0, 80) + (String(v).length > 80 ? '...' : ''))
  console.log(`  ${k}: ${display}`)
}
