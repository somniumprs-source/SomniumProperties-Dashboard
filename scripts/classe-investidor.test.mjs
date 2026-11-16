// Testes da regra de classificação A–D de investidores (SOP 23, secção 4.10).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularClasseDiscovery, classeDoTotal, podeSerApresentado, registarValidacao, estadoValidacao,
  ErroClassificacao, CHAVES_DISCOVERY, STATUS_APOS_VALIDACAO,
} from '../supabase/functions/_shared/classeInvestidor.js'

// Constrói notas com o total pedido (enche critérios a 2 pela ordem).
function notasComTotal(total) {
  const notas = {}
  let resto = total
  for (const k of CHAVES_DISCOVERY) { const n = Math.min(2, resto); notas[k] = n; resto -= n }
  return notas
}

test('limites da conversão 0–12 → A–D', () => {
  const esperado = { 0: 'D', 6: 'D', 7: 'C', 8: 'C', 9: 'B', 10: 'B', 11: 'A', 12: 'A' }
  for (const [total, classe] of Object.entries(esperado)) {
    const r = calcularClasseDiscovery(notasComTotal(Number(total)))
    assert.equal(r.total, Number(total))
    assert.equal(r.classe, classe, `total ${total}`)
    assert.equal(classeDoTotal(Number(total)), classe)
  }
})

test('critério com valor 3 é rejeitado', () => {
  assert.throws(() => calcularClasseDiscovery({ ...notasComTotal(10), capital: 3 }), ErroClassificacao)
  assert.throws(() => calcularClasseDiscovery({ ...notasComTotal(10), via: -1 }), ErroClassificacao)
  assert.throws(() => calcularClasseDiscovery({ ...notasComTotal(10), via: 1.5 }), ErroClassificacao)
})

test('critério em falta: sem classe', () => {
  const notas = notasComTotal(12)
  delete notas.decisor
  const r = calcularClasseDiscovery(notas)
  assert.equal(r.classe, null)
  assert.equal(r.total, null)
  assert.deepEqual(r.em_falta, ['decisor'])
  assert.equal(calcularClasseDiscovery({ ...notasComTotal(12), urgencia: '' }).classe, null)
})

test('aceita notas em texto e no formato { nota }', () => {
  const notas = Object.fromEntries(CHAVES_DISCOVERY.map((k) => [k, { nota: '2', origem: 'manual' }]))
  assert.equal(calcularClasseDiscovery(notas).classe, 'A')
})

test('elegibilidade: C e D nunca; proposta nunca; legado A/B sim', () => {
  assert.equal(podeSerApresentado({ classificacao: 'A', classificacao_origem: 'discovery', classificacao_estado: 'validada' }), true)
  assert.equal(podeSerApresentado({ classificacao: 'B', classificacao_origem: 'legado' }), true)
  assert.equal(podeSerApresentado({ classificacao: 'A', classificacao_origem: 'legado', classificacao_estado: 'proposta' }), false)
  assert.equal(podeSerApresentado({ classificacao: 'A', classificacao_origem: 'discovery', classificacao_estado: null }), false)
  assert.equal(podeSerApresentado({ classificacao: 'C', classificacao_origem: 'discovery', classificacao_estado: 'validada' }), false)
  assert.equal(podeSerApresentado({ classificacao: 'D', classificacao_origem: 'legado' }), false)
  assert.equal(podeSerApresentado({ classificacao: null }), false)
})

test('validação: precisa dos dois CEO', () => {
  const ceos = ['Alexandre Mendes', 'João Abreu']
  const r1 = registarValidacao('B', [], { por: 'Alexandre Mendes', classe: 'B' }, ceos)
  assert.equal(r1.estado.definitiva, false)
  assert.throws(() => registarValidacao('B', r1.log, { por: 'Alexandre Mendes', classe: 'B' }, ceos), /falta o outro CEO/)
  const r2 = registarValidacao('B', r1.log, { por: 'João Abreu', classe: 'B' }, ceos)
  assert.equal(r2.estado.definitiva, true)
  assert.equal(r2.estado.classe, 'B')
  assert.equal(STATUS_APOS_VALIDACAO.B, 'Investidor Qualificado em Carteira')
  assert.throws(() => registarValidacao('B', [], { por: 'Outra Pessoa', classe: 'B' }, ceos), /dois CEO/)
})

test('validação: alterar obriga a motivo e repõe a validação do outro CEO', () => {
  const ceos = ['Alexandre Mendes', 'João Abreu']
  const r1 = registarValidacao('B', [], { por: 'Alexandre Mendes', classe: 'B' }, ceos)
  assert.throws(() => registarValidacao('B', r1.log, { por: 'João Abreu', classe: 'C' }, ceos), /motivo/)
  const r2 = registarValidacao('B', r1.log, { por: 'João Abreu', classe: 'C', motivo: 'Capital depende de venda' }, ceos)
  assert.deepEqual(r2.estado, { classe: 'C', validadores: ['João Abreu'], alterada: true, definitiva: false })
  assert.throws(() => registarValidacao('B', r2.log, { por: 'Alexandre Mendes', classe: 'C' }, ceos), /30, 60 ou 90/)
  const r3 = registarValidacao('B', r2.log, { por: 'Alexandre Mendes', classe: 'C', follow_up_dias: 60 }, ceos)
  assert.equal(r3.estado.definitiva, true)
  assert.equal(estadoValidacao('B', r3.log).classe, 'C')
})

test('validação: D exige motivo para Inactivo', () => {
  const ceos = ['Alexandre Mendes', 'João Abreu']
  const r1 = registarValidacao('D', [], { por: 'João Abreu', classe: 'D' }, ceos)
  assert.throws(() => registarValidacao('D', r1.log, { por: 'Alexandre Mendes', classe: 'D' }, ceos), /motivo/)
  const r2 = registarValidacao('D', r1.log, { por: 'Alexandre Mendes', classe: 'D', motivo_inactivo: 'Sem capital' }, ceos)
  assert.equal(r2.estado.definitiva, true)
})
