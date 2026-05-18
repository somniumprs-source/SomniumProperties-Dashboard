#!/usr/bin/env node
/**
 * Smoke tests para a área Projetos.
 * Executa contra produção (PUBLIC_URL) ou local (default http://localhost:3001).
 * Uso: node scripts/smoke-projetos.mjs
 *      BASE=https://somniumproperties-dashboard.onrender.com node scripts/smoke-projetos.mjs
 *
 * Não usa frameworks — fetch + assert nativo.
 */
import assert from 'node:assert/strict'

const BASE = process.env.BASE || 'http://localhost:3001'

let pass = 0, fail = 0
async function test(nome, fn) {
  try {
    await fn()
    console.log(`  ✓ ${nome}`)
    pass++
  } catch (e) {
    console.error(`  ✗ ${nome}: ${e.message}`)
    fail++
  }
}

async function get(path) {
  const r = await fetch(`${BASE}${path}`)
  return { status: r.status, body: r.ok ? await r.json().catch(() => null) : null, raw: r }
}

console.log(`\nSmoke tests Projetos — base: ${BASE}\n`)

// 1. Endpoints de leitura (CRM público, esperado 200)
console.log('Leitura de projetos:')
await test('GET /api/crm/negocios devolve lista', async () => {
  const r = await get('/api/crm/negocios?limit=5')
  assert.equal(r.status, 200)
  assert.ok(Array.isArray(r.body?.data), 'data deve ser array')
})

await test('GET /api/crm/projetos/portfolio/kpis devolve totais', async () => {
  const r = await get('/api/crm/projetos/portfolio/kpis')
  assert.equal(r.status, 200)
  assert.ok(r.body?.totais, 'deve ter chave totais')
})

await test('GET /api/crm/projetos/calendario com from/to', async () => {
  const r = await get('/api/crm/projetos/calendario?from=2026-01-01&to=2026-12-31')
  assert.equal(r.status, 200)
  assert.ok(Array.isArray(r.body?.eventos))
})

await test('GET /api/crm/projetos/templates devolve default', async () => {
  const r = await get('/api/crm/projetos/templates')
  assert.equal(r.status, 200)
  assert.ok(Array.isArray(r.body?.templates))
  assert.ok(r.body.templates.some(t => t.id === '__default__'), 'deve haver template default')
})

// 2. Buscar um projecto existente para testar endpoints específicos
const { body: negociosBody } = await get('/api/crm/negocios?limit=1')
const projecto = negociosBody?.data?.[0]
if (projecto?.id) {
  console.log(`\nEndpoints específicos do projecto ${projecto.movimento}:`)

  await test('GET fases retorna array', async () => {
    const r = await get(`/api/crm/projetos/${projecto.id}/fases`)
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body?.fases))
  })

  await test('GET resumo retorna negocio', async () => {
    const r = await get(`/api/crm/projetos/${projecto.id}/resumo`)
    assert.equal(r.status, 200)
    assert.ok(r.body?.negocio)
  })

  await test('GET forecast retorna eventos', async () => {
    const r = await get(`/api/crm/projetos/${projecto.id}/forecast`)
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body?.eventos))
    assert.ok(r.body?.totais)
  })

  await test('GET audit retorna array', async () => {
    const r = await get(`/api/crm/projetos/${projecto.id}/audit`)
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body?.eventos))
  })

  await test('GET fracoes retorna array', async () => {
    const r = await get(`/api/crm/projetos/${projecto.id}/fracoes`)
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body?.fracoes))
  })

  await test('GET documentos retorna array', async () => {
    const r = await get(`/api/crm/projetos/${projecto.id}/documentos`)
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body?.documentos))
  })

  await test('GET investidores retorna array', async () => {
    const r = await get(`/api/crm/projetos/${projecto.id}/investidores`)
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body?.investidores))
  })

  await test('GET despesas retorna array', async () => {
    const r = await get(`/api/crm/projetos/${projecto.id}/despesas`)
    assert.equal(r.status, 200)
    assert.ok(Array.isArray(r.body?.despesas))
  })
} else {
  console.log('\n(Sem projectos para testar endpoints específicos)')
}

// 3. Validação de erros
console.log('\nValidação de erros:')
await test('GET /api/crm/projetos/inexistente/resumo retorna 404', async () => {
  const r = await get('/api/crm/projetos/nao-existe-xyz/resumo')
  assert.equal(r.status, 404)
})

console.log(`\n${pass} pass · ${fail} fail`)
process.exit(fail > 0 ? 1 : 0)
