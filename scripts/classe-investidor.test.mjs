// Testes da regra de classificação A–D de investidores (SOP 23, secção 4.10).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularClasseDiscovery, classeDoTotal, podeSerApresentado, validarDecisao, validacaoAtrasada,
  temApresentacaoMarcada, precisaDesmarcarApresentacao, ErroClassificacao, CHAVES_DISCOVERY, STATUS_APOS_VALIDACAO,
  fundirScorecard,
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

const CEOS = ['Alexandre Mendes', 'João Abreu']

test('validação: basta o outro CEO; quem propôs não valida', () => {
  assert.throws(() => validarDecisao({ proposta: 'B', propostaPor: 'Alexandre Mendes', decisao: { por: 'Alexandre Mendes' }, ceos: CEOS }), /outro CEO/)
  const e = validarDecisao({ proposta: 'B', propostaPor: 'Alexandre Mendes', decisao: { por: 'João Abreu' }, ceos: CEOS })
  assert.equal(e.classe, 'B')
  assert.equal(e.alterada, false)
  assert.equal(STATUS_APOS_VALIDACAO.B, 'Investidor Qualificado em Carteira')
  assert.throws(() => validarDecisao({ proposta: 'B', propostaPor: 'Comercial', decisao: { por: 'Outra Pessoa' }, ceos: CEOS }), /CEO/)
  // Proposta feita por quem não é CEO: qualquer CEO valida.
  assert.equal(validarDecisao({ proposta: 'A', propostaPor: 'Comercial', decisao: { por: 'Alexandre Mendes' }, ceos: CEOS }).classe, 'A')
})

test('validação: alterar guarda a proposta e obriga a motivo', () => {
  assert.throws(() => validarDecisao({ proposta: 'B', propostaPor: 'João Abreu', decisao: { por: 'Alexandre Mendes', classe: 'A' }, ceos: CEOS }), /motivo/)
  const e = validarDecisao({ proposta: 'B', propostaPor: 'João Abreu', decisao: { por: 'Alexandre Mendes', classe: 'A', motivo: 'Capital já transferido' }, ceos: CEOS })
  assert.deepEqual([e.proposta, e.classe, e.alterada, e.motivo], ['B', 'A', true, 'Capital já transferido'])
})

test('validação: C exige 30/60/90 dias e D exige motivo', () => {
  const base = { proposta: 'C', propostaPor: 'João Abreu', ceos: CEOS }
  assert.throws(() => validarDecisao({ ...base, decisao: { por: 'Alexandre Mendes' } }), /30, 60 ou 90/)
  assert.equal(validarDecisao({ ...base, decisao: { por: 'Alexandre Mendes', follow_up_dias: 90 } }).follow_up_dias, 90)
  const d = { proposta: 'D', propostaPor: 'João Abreu', ceos: CEOS }
  assert.throws(() => validarDecisao({ ...d, decisao: { por: 'Alexandre Mendes' } }), /motivo/)
  assert.equal(validarDecisao({ ...d, decisao: { por: 'Alexandre Mendes', motivo_inactivo: 'Sem capital' } }).motivo_inactivo, 'Sem capital')
})

test('prazo de 24 horas', () => {
  const agora = new Date('2026-11-17T12:00:00Z')
  assert.equal(validacaoAtrasada({ classificacao_estado: 'proposta', classificacao_proposta_em: '2026-11-16T11:00:00Z' }, agora), true)
  assert.equal(validacaoAtrasada({ classificacao_estado: 'proposta', classificacao_proposta_em: '2026-11-16T13:00:00Z' }, agora), false)
  assert.equal(validacaoAtrasada({ classificacao_estado: 'validada', classificacao_proposta_em: '2026-11-01T00:00:00Z' }, agora), false)
})

test('apresentação marcada: campo da ficha ou tarefa aberta com o nome', () => {
  const inv = { nome: 'Élsio Mota', classificacao: 'C', classificacao_origem: 'discovery', classificacao_estado: 'validada' }
  assert.equal(temApresentacaoMarcada({ ...inv, data_apresentacao_negocio: '2026-11-20' }), true)
  assert.equal(temApresentacaoMarcada(inv, [{ tarefa: 'Apresentação negócio Elsio Mota', status: 'A fazer' }]), true)
  assert.equal(temApresentacaoMarcada(inv, [{ tarefa: 'Apresentação negócio Elsio Mota', status: 'Concluída' }]), false)
  assert.equal(temApresentacaoMarcada(inv, [{ tarefa: 'Apresentação negócio Pedro Vieira', status: 'A fazer' }]), false)
  assert.equal(precisaDesmarcarApresentacao({ ...inv, data_apresentacao_negocio: '2026-11-20' }), true)
  assert.equal(precisaDesmarcarApresentacao({ ...inv, classificacao: 'B', data_apresentacao_negocio: '2026-11-20' }), false)
})

test('fundirScorecard: só muda critérios com prova e não recua no tempo', () => {
  const a = fundirScorecard({}, { capital: { nota: 2, evidencia: 'tenho hoje' }, via: null }, { data: '2026-11-10', tipo: 'gravacao', id: 'g1' })
  assert.deepEqual(a.alterados, ['capital'])
  assert.equal(a.scorecard.capital.nota, 2)
  assert.equal(a.scorecard.via, undefined)
  // contacto seguinte baixa o capital e define a via
  const b = fundirScorecard(a.scorecard, { capital: 0, via: { nota: 2 } }, { data: '2026-11-15', tipo: 'reuniao', id: 'r1' })
  assert.equal(b.scorecard.capital.nota, 0)
  assert.equal(b.scorecard.via.nota, 2)
  assert.deepEqual(b.alterados.sort(), ['capital', 'via'])
  // contacto mais antigo processado depois não sobrepõe
  const c = fundirScorecard(b.scorecard, { capital: 2 }, { data: '2026-11-12', tipo: 'gravacao', id: 'g0' })
  assert.equal(c.scorecard.capital.nota, 0)
  assert.deepEqual(c.alterados, [])
  // nota inválida é ignorada
  const d = fundirScorecard(b.scorecard, { capital: 5 }, { data: '2026-11-20' })
  assert.equal(d.scorecard.capital.nota, 0)
})

test('fundirScorecard + calcular: classe muda entre contactos (A depois C)', () => {
  const todos2 = Object.fromEntries(CHAVES_DISCOVERY.map(k => [k, 2]))
  const um = fundirScorecard({}, todos2, { data: '2026-11-10' })
  assert.equal(calcularClasseDiscovery(um.scorecard).classe, 'A')
  const dois = fundirScorecard(um.scorecard, { capital: 0, urgencia: 0, decisor: 1 }, { data: '2026-11-17' })
  assert.equal(calcularClasseDiscovery(dois.scorecard).total, 7)
  assert.equal(calcularClasseDiscovery(dois.scorecard).classe, 'C')
})
