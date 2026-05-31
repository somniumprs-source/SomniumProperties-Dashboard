#!/usr/bin/env node
// Cria uma analise na "Moradia Candal" que junta os comparaveis das duas
// fraccoes (Apartamento T2 RC + Apartamento T3 1andar) preservando a separacao
// por tipologia (T2 / T3). Idempotente: se a Moradia ja tiver analises, sai.
//
// Requer: backend dev a correr (npm run dev) em http://localhost:3001
// Uso: node scripts/copy-comparaveis-to-moradia-candal.mjs

const BASE = process.env.API_BASE || 'http://localhost:3001'
const HEADERS = { 'Content-Type': 'application/json', 'X-Regiao': 'AMP' }
const NOMES = {
  // Aceita qualquer um destes nomes (o imovel-alvo pode ter sido renomeado).
  alvoCandidatos: ['Moradia Candal', 'Imovel com duas frações'],
  fraccoes: ['Apartamento T2 RC', 'Apartamento T3 1andar'],
}

async function getJson(url, opts = {}) {
  const res = await fetch(`${BASE}${url}`, { headers: HEADERS, ...opts })
  const text = await res.text()
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${url} falhou ${res.status}: ${text}`)
  return JSON.parse(text)
}

async function imovelByName(nome) {
  const body = await getJson(`/api/crm/imoveis?regiao=AMP&limit=500`)
  const imovel = (body.data || []).find(i => i.nome === nome)
  if (!imovel) throw new Error(`Imovel "${nome}" nao encontrado`)
  return imovel
}

async function imovelByAnyName(nomes) {
  const body = await getJson(`/api/crm/imoveis?regiao=AMP&limit=500`)
  for (const nome of nomes) {
    const imovel = (body.data || []).find(i => i.nome === nome)
    if (imovel) return imovel
  }
  throw new Error(`Nenhum imovel encontrado para: ${nomes.join(' | ')}`)
}

async function analiseActivaDoImovel(imovelId, nomeImovel) {
  const analises = await getJson(`/api/crm/imoveis/${imovelId}/analises`)
  const activa = analises.find(a => a.activa) || analises[0]
  if (!activa) throw new Error(`Imovel "${nomeImovel}" nao tem analises`)
  return getJson(`/api/crm/analises/${activa.id}`)
}

const moradia = await imovelByAnyName(NOMES.alvoCandidatos)
console.log(`Imovel-alvo: "${moradia.nome}" (id=${moradia.id})`)
const existentes = await getJson(`/api/crm/imoveis/${moradia.id}/analises`)
const existenteActiva = existentes.find(a => a.activa) || existentes[0] || null
if (existenteActiva) {
  const cExist = typeof existenteActiva.comparaveis === 'string'
    ? JSON.parse(existenteActiva.comparaveis || '{}')
    : (existenteActiva.comparaveis || {})
  const tipsExist = (cExist.tipologias || []).filter(t => (t.comparaveis || []).some(c => c && (c.preco || c.area || c.link)))
  if (tipsExist.length > 0) {
    console.log(`Analise activa (id=${existenteActiva.id}) ja tem ${tipsExist.length} tipologia(s) com comparaveis. Nada a fazer.`)
    process.exit(0)
  }
}

const [t2Imovel, t3Imovel] = await Promise.all(NOMES.fraccoes.map(imovelByName))
const [t2Analise, t3Analise] = await Promise.all([
  analiseActivaDoImovel(t2Imovel.id, t2Imovel.nome),
  analiseActivaDoImovel(t3Imovel.id, t3Imovel.nome),
])

const t2Tipologia = (t2Analise.comparaveis?.tipologias || []).find(t => t.tipologia === 'T2')
  || t2Analise.comparaveis?.tipologias?.[0]
const t3Tipologia = (t3Analise.comparaveis?.tipologias || []).find(t => t.tipologia === 'T3')
  || t3Analise.comparaveis?.tipologias?.[0]
if (!t2Tipologia) throw new Error('Nao encontrei tipologia T2 na analise da fraccao RC')
if (!t3Tipologia) throw new Error('Nao encontrei tipologia T3 na analise da fraccao 1andar')

// Merge meta: prioriza T3 (tem alfredo_imagem); junta raio_pesquisa_km maximo;
// data_recolha = max; conclusao_estudo regista a origem.
const metaT2 = t2Analise.comparaveis?.meta || {}
const metaT3 = t3Analise.comparaveis?.meta || {}
const meta = {
  ...metaT2,
  ...metaT3,
  raio_pesquisa_km: Math.max(metaT2.raio_pesquisa_km || 0, metaT3.raio_pesquisa_km || 0) || undefined,
  data_recolha: (metaT2.data_recolha || '') > (metaT3.data_recolha || '') ? metaT2.data_recolha : metaT3.data_recolha,
  conclusao_estudo: [
    metaT2.conclusao_estudo, metaT3.conclusao_estudo,
    `Comparaveis agregados: T2 da fraccao "${t2Imovel.nome}" + T3 da fraccao "${t3Imovel.nome}".`,
  ].filter(Boolean).join('\n'),
}

const comparaveis = {
  _version: 2,
  meta,
  tipologias: [t2Tipologia, t3Tipologia],
}

let resultado
if (existenteActiva) {
  resultado = await getJson(`/api/crm/analises/${existenteActiva.id}`, {
    method: 'PUT',
    body: JSON.stringify({ comparaveis }),
  })
  console.log('Analise actualizada (PUT):')
} else {
  resultado = await getJson(`/api/crm/imoveis/${moradia.id}/analises`, {
    method: 'POST',
    body: JSON.stringify({
      nome: 'Cenário Base',
      compra: moradia.ask_price || 215000,
      comparaveis,
    }),
  })
  console.log('Analise criada (POST):')
}

const cFinal = typeof resultado.comparaveis === 'string'
  ? JSON.parse(resultado.comparaveis || '{}')
  : (resultado.comparaveis || {})
console.log('  analise_id:', resultado.id)
console.log('  activa:', resultado.activa)
console.log('  tipologias:', (cFinal.tipologias || []).map(t => `${t.tipologia} (${(t.comparaveis||[]).length} comparaveis)`).join(', '))
