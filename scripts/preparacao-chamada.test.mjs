// npm run test:preparacao — regras puras da preparação de chamada (SOP 23). Dados fictícios.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tipoChamada, montarEntradas, validarDocumento, escalaoMontante, montante, preparacaoValida, respostasFormulario,
  calendarioLivre, notasETranscricoes, ALERTA_RETORNO, ALERTA_INCOMPLETO, LINHA_FORA_SOP23, SEM_DADOS, LIMITE_NOTAS,
} from '../supabase/functions/_shared/preparacaoChamadaRegras.js'
import { CASOS, AGORA } from './preparacao-chamada.fixtures.mjs'

test('tipo de chamada pela etapa', () => {
  assert.equal(tipoChamada(CASOS.formulario_curto), 'qualificacao') // Landing Page sem conversa
  assert.equal(tipoChamada(CASOS.follow_up_passivo), 'recontacto')
  assert.equal(tipoChamada(CASOS.discovery_decisor), 'discovery')
  assert.equal(tipoChamada(CASOS.negociacao), 'fora_sop23')
  assert.equal(tipoChamada({ investidor: { status: 'Marcar call' } }), 'qualificacao')
  // Landing Page com conversa feita segue a etapa.
  const comConversa = { ...CASOS.formulario_curto, interacoes: [{ canal: 'Chamada', resultado: 'Feito' }] }
  assert.equal(tipoChamada(comConversa), 'fora_sop23')
})

test('escalões de montante: o limite conta no escalão de cima', () => {
  assert.equal(escalaoMontante(49_999), 'menos de 50 mil €')
  assert.equal(escalaoMontante(50_000), '50 mil a menos de 200 mil €')
  assert.equal(escalaoMontante(200_000), '200 a 300 mil €')
  assert.equal(escalaoMontante(300_001), 'mais de 300 mil €')
  assert.equal(montante({}).texto, SEM_DADOS)
  assert.match(montante({ capital_min: 100, capital_max: 100 }).texto, /milhares/)
  assert.match(montante({ capital_min: 150000, capital_max: 250000 }).texto, /atravessa escalões/)
})

test('campo inexistente passa como "sem dados" e nunca há ROI nas entradas', () => {
  const e = montarEntradas(CASOS.formulario_curto, { quemConduz: 'Alexandre Mendes', agora: AGORA })
  assert.match(e.ficha_investidor, /Permissão de gravação: sem dados/)
  assert.match(e.calendario, /sem dados/)
  assert.match(e.oportunidades_disponiveis, /sem dados/)
  assert.match(e.data_hoje, /17\/11\/2026 15:00/)
  assert.match(e.etapa_crm, /tratar como "Marcar call"/)
  const tudo = Object.values(montarEntradas(CASOS.follow_up_passivo, { quemConduz: 'João Abreu', agora: AGORA })).join('\n')
  assert.doesNotMatch(tudo, /roi|%/i)
})

test('respostas do formulário sem retornos', () => {
  const r = respostasFormulario([{ canal: 'Nota', data_hora: '2026-11-17T13:00:00Z', notas: 'Submissão Landing Page · 17/11/2026\nObjetivo: Rendimento\nRetorno total pretendido: 20%\nROI anualizado pretendido: 12%' }])
  assert.match(r, /13:00/)
  assert.doesNotMatch(r, /20%|12%/)
  assert.match(r, /Retorno total pretendido: \(omitido: retorno\)/)
})

test('notas: limite total e as mais recentes primeiro', () => {
  const grande = 'x'.repeat(9000)
  const dados = { investidor: {}, interacoes: [1, 2, 3, 4].map((d) => ({ canal: 'Nota', data_hora: `2026-11-0${d}T10:00:00Z`, notas: grande })), gravacoes: [], reunioes: [] }
  const t = notasETranscricoes(dados)
  assert.ok(t.length < LIMITE_NOTAS + 200)
  assert.ok(t.indexOf('04/11/2026') < t.indexOf('03/11/2026'))
  assert.match(t, /omitido/)
})

test('calendário: blocos menos ocupados', () => {
  const t = calendarioLivre({ agora: AGORA, blocos: [{ data: '2026-11-18', hora_inicio: '09:00', hora_fim: '12:00' }], ocupados: [{ data: '2026-11-18', hora_inicio: '10:00', hora_fim: '11:00' }] })
  assert.match(t, /18\/11 das 09:00 às 10:00/)
  assert.match(t, /18\/11 das 11:00 às 12:00/)
})

test('validação: números de retorno', () => {
  const ok = 'PARTE 1 – PLANEAMENTO\nScorecard\nPARTE 2 – GUIÃO\nPARTE 3 – FECHO\nPróximo passo'
  assert.deepEqual(validarDocumento(ok, 'discovery'), [])
  assert.deepEqual(validarDocumento(`${ok}\nRende cerca de 8%`, 'discovery'), [ALERTA_RETORNO])
  assert.deepEqual(validarDocumento(`${ok}\nUm retorno de 15 mil`, 'discovery'), [ALERTA_RETORNO])
  assert.deepEqual(validarDocumento(`${ok}\nOs retornos estão no dossiê.`, 'discovery'), [])
  assert.deepEqual(validarDocumento(`${ok}\n- Perguntou retornos: resposta da secção 5 do SOP, sem números (Chamada 1).`, 'discovery'), [])
  assert.deepEqual(validarDocumento(`${ok}\nQuer um rendimento de 1000 € por mês`, 'discovery'), [ALERTA_RETORNO])
})

test('validação: secções obrigatórias', () => {
  assert.deepEqual(validarDocumento('PARTE 1 - PLANEAMENTO\nScorecard', 'discovery'), [ALERTA_INCOMPLETO])
  assert.deepEqual(validarDocumento('Primeiro contacto sem contexto\n...\nPróximo passo: discovery', 'qualificacao'), [])
  assert.deepEqual(validarDocumento(LINHA_FORA_SOP23, 'fora_sop23'), [])
  assert.deepEqual(validarDocumento('', 'qualificacao'), [ALERTA_INCOMPLETO])
})

test('preparação válida: 24 horas e sem contactos novos', () => {
  const prep = { gerado_em: '2026-11-17T10:00:00Z' }
  assert.equal(preparacaoValida(prep, '2026-11-17T09:00:00Z', AGORA), true)
  assert.equal(preparacaoValida(prep, '2026-11-17T11:00:00Z', AGORA), false)
  assert.equal(preparacaoValida({ gerado_em: '2026-11-16T14:00:00Z' }, null, AGORA), false)
  assert.equal(preparacaoValida(null, null, AGORA), false)
})
