#!/usr/bin/env node
// Cria o imovel "Moradia Candal" (AMP, Wholesaling) como agregado das fraccoes
// "Apartamento T2 RC" e "Apartamento T3 1andar" (Candal). Idempotente: se ja
// existir um imovel com este nome em AMP, sai sem criar duplicado.
//
// Requer: backend dev a correr (npm run dev) em http://localhost:3001
// Uso: node scripts/create-moradia-candal.mjs

const BASE = process.env.API_BASE || 'http://localhost:3001'
const HEADERS = { 'Content-Type': 'application/json', 'X-Regiao': 'AMP' }

const payload = {
  nome: 'Moradia Candal',
  tipologia: 'Moradia',
  estado: 'Pendentes',
  modelo_negocio: 'Wholesaling',
  nome_consultor: 'Sofia',
  freguesia: 'Candal',
  zona: 'Candal',
  ask_price: 215000,
  notas: 'Agregado das fraccoes: Apartamento T2 RC + Apartamento T3 1andar.',
}

async function existing() {
  const res = await fetch(`${BASE}/api/crm/imoveis?limit=500&regiao=AMP`, { headers: HEADERS })
  if (!res.ok) throw new Error(`GET imoveis falhou: ${res.status} ${await res.text()}`)
  const body = await res.json()
  return (body.data || []).find(i => i.nome === payload.nome)
}

const dup = await existing()
if (dup) {
  console.log(`Ja existe (id=${dup.id}). Nada a fazer.`)
  process.exit(0)
}

const res = await fetch(`${BASE}/api/crm/imoveis`, {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify(payload),
})
const text = await res.text()
if (!res.ok) {
  console.error(`POST falhou ${res.status}: ${text}`)
  process.exit(1)
}
const created = JSON.parse(text)
console.log('Criado:', { id: created.id, nome: created.nome, regiao: created.regiao, ask_price: created.ask_price })
