// Testes das regras de medição do Dashboard e da integridade do catálogo.
// Os casos replicam a situação real de 03/11/2026; são fotografia, não constantes da app.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ehParceria, ehConsultorParceiro, contagemParceria, capacidadeDeclarada, ehChamada, imoveisPorContactar,
  negocioFechado, haEscrituras, resumoFases, custoRealObra, mediana, diasNaFase, resumoAnalisesNegocios, resumoProjetos,
} from '../supabase/functions/_shared/regrasDashboard.js'
import { CATALOGO, NUCLEO, POR_MEDIR, ESTADOS, DEPARTAMENTOS, metrica, pesquisar } from '../src/lib/catalogoMetricas.js'

test('parceria: reconhece o estado real e separa estado de aporte', () => {
  const inv = [
    { status: 'Investidor em parceria', montanteInvestido: 120500 },
    { status: 'Investidor em parceria', montanteInvestido: 95500 },
    { status: 'Investidor em parceria', montanteInvestido: 0 },
    { status: 'Potencial Investidor', montanteInvestido: 0 },
  ]
  assert.equal(inv.filter(ehParceria).length, 3)
  assert.deepEqual(contagemParceria(inv), { porEstado: 3, comAporte: 2 })
})

test('consultores: só Consultores em Parceria contam como parceiros', () => {
  assert.equal(ehConsultorParceiro({ estatuto: 'Consultores em Parceria' }), true)
  assert.equal(ehConsultorParceiro({ estatuto: 'Aberto Parcerias' }), false)
})

test('capacidade declarada: exclui potenciais, inativos e quem não reinveste', () => {
  const inv = [
    { status: 'Investidor Qualificado em Carteira', capitalMax: 80000 },
    { status: 'Investidor em parceria', capitalMax: 145000, montanteInvestido: 120500 },
    { status: 'Investidor em parceria', capitalMax: 10000, montanteInvestido: 20000 },
    { status: 'Potencial Investidor', capitalMax: 500000 },
    { status: 'Inactivo', capitalMax: 500000 },
    { status: 'Investidor em parceria', capitalMax: 90000, naoReinveste: true },
  ]
  assert.equal(capacidadeDeclarada(inv), 104500)
})

test('chamadas: emails e WhatsApp não contam', () => {
  assert.ok(ehChamada('Chamada'))
  assert.ok(ehChamada('telefone'))
  for (const c of ['Email', 'WhatsApp', 'Nota', null]) assert.equal(ehChamada(c), false)
})

test('por contactar: só Adicionado sem chamada', () => {
  const im = [
    { estado: 'Adicionado' }, { estado: 'Adicionado', dataChamada: '2026-10-01' },
    { estado: 'Não interessa' }, { estado: 'Pendentes' }, { estado: 'Visita Marcada' }, { estado: 'Wholesaling' },
  ]
  assert.equal(imoveisPorContactar(im).length, 1)
})

test('negócio fechado: só com escritura; Condeixa e Lages não contam', () => {
  const condeixa = { fase: 'Vendido', dataVenda: '2026-04-17', dataCompra: '2026-04-17' }
  const lages = { fase: 'Fase de obras', dataCompra: '2026-09-21' }
  assert.equal(negocioFechado(condeixa), false)
  assert.equal(negocioFechado(lages), false)
  assert.equal(haEscrituras([condeixa, lages]), false)
  assert.equal(negocioFechado({ dataEscrituraVenda: '2027-03-21' }), true)
})

test('fases: atraso real de Lages em 03/11/2026', () => {
  const r = resumoFases([
    { data_fim_prevista: '2026-10-21' }, { data_fim_prevista: '2026-10-20' },
    { data_fim_prevista: '2026-10-01', data_fim_real: '2026-10-05' }, {},
  ], new Date('2026-11-03T12:00:00Z'))
  assert.deepEqual(r, { total: 4, comPrevisao: 3, atrasadas: 2, maiorAtrasoDias: 14 })
})

test('custo real: só despesas dos negócios indicados', () => {
  const d = [{ negocioId: 'a', custoMensal: 100 }, { negocioId: 'x', custoMensal: 50 }, { negocioId: null, custoMensal: 9 }]
  assert.equal(custoRealObra(d, new Set(['a'])), 100)
})

test('dias na fase: usa a última mudança real e ignora imóveis fora do funil', () => {
  const hoje = new Date('2026-11-03T00:00:00Z')
  const imoveis = [{ id: '1', estado: 'Adicionado' }, { id: '2', estado: 'Não interessa' }, { id: '3', estado: 'Follow UP' }]
  const hist = [
    { entidade_id: '1', created_at: '2026-10-01', alteracoes: [{ campo: 'estado', antes: 'x', depois: 'y' }] },
    { entidade_id: '1', created_at: '2026-10-24', alteracoes: JSON.stringify([{ campo: 'estado', antes: 'y', depois: 'Adicionado' }]) },
    { entidade_id: '1', created_at: '2026-11-01', alteracoes: [{ campo: 'notas', antes: 'a', depois: 'b' }] },
    { entidade_id: '2', created_at: '2026-01-01', alteracoes: [{ campo: 'estado', antes: 'x', depois: 'y' }] },
  ]
  assert.deepEqual(diasNaFase(imoveis, hist, hoje), { mediana: 10, amostra: 1 })
  assert.equal(mediana([]), null)
  assert.equal(mediana([1, 3]), 2)
})

test('análises: só negócios reais, com retorno ponderado', () => {
  const r = resumoAnalisesNegocios([
    { imovel_estado: 'CAEP', lucro_liquido: 45082, capital_necessario: 190877, retorno_anualizado: 50 },
    { imovel_estado: 'Não interessa', lucro_liquido: -900000, capital_necessario: 400000, retorno_anualizado: -50 },
    { imovel_estado: 'Adicionado', lucro_liquido: -300000, capital_necessario: 300000, retorno_anualizado: -20 },
  ])
  assert.deepEqual(r, { total: 1, lucro: 45082, capital: 190877, retornoTotal: 23.62, retornoAnualizado: 50 })
  assert.equal(resumoAnalisesNegocios(undefined).total, 0)
})

test('catálogo: todos os indicadores têm sigla, dois nomes e explicação', () => {
  for (const x of CATALOGO) {
    for (const c of ['id', 'sigla', 'nome', 'nomeEn', 'explicacao', 'formula', 'interpretar']) assert.ok(x[c], `${x.id} sem ${c}`)
    assert.ok(ESTADOS[x.estado], `${x.id} com estado inválido`)
    assert.ok(DEPARTAMENTOS[x.departamento], `${x.id} com departamento inválido`)
    if (x.estado === 'parcial' || x.estado === 'sem_registo') assert.ok(x.falta, `${x.id} não diz o que falta`)
  }
})

test('projetos: mantém negócios sem escritura e calcula prazo e custo', () => {
  const r = resumoProjetos(
    [{ id: 'a', movimento: 'Lages', categoria: 'CAEP', dataEstimada: '2027-03-21' }, { id: 'b', movimento: 'Fechado', dataEscrituraVenda: '2026-10-01' }],
    [{ negocio_id: 'a', nome: 'Aquisição', estado: 'em_curso', data_fim_prevista: '2026-10-21' }, { negocio_id: 'a', nome: 'Demolições', estado: 'pendente' }],
    [{ negocioId: 'a', custoMensal: 960.9 }],
    new Date('2026-11-03T12:00:00Z'),
  )
  assert.equal(r.length, 1)
  assert.deepEqual(r[0].fasesEmCurso, ['Aquisição'])
  assert.equal(r[0].prazos.maiorAtrasoDias, 13)
  assert.equal(r[0].custoReal, 960.9)
})

test('por medir: cada indicador sem registo tem um sítio único', () => {
  const ids = Object.values(POR_MEDIR).flatMap(d => Object.values(d).flat())
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual([...ids].sort(), CATALOGO.filter(x => x.estado === 'sem_registo').map(x => x.id).sort())
})

test('catálogo: IDs e siglas sem repetições', () => {
  assert.equal(new Set(CATALOGO.map(x => x.id)).size, CATALOGO.length)
  const siglas = CATALOGO.map(x => x.sigla)
  assert.deepEqual(siglas.filter((s, i) => siglas.indexOf(s) !== i), [])
})

test('catálogo: inclui os 70 indicadores do plano', () => {
  const plano = { A: 11, C: 16, I: 10, P: 10, O: 11, F: 8, W: 4 }
  for (const [p, n] of Object.entries(plano)) assert.equal(CATALOGO.filter(x => x.id.startsWith(p)).length, n, p)
})

test('núcleo: 28 indicadores, todos em uso e sem Marketing', () => {
  assert.equal(new Set(NUCLEO).size, 28)
  for (const id of NUCLEO) {
    assert.ok(metrica(id), id)
    assert.notEqual(metrica(id).estado, 'inativo', id)
    assert.notEqual(metrica(id).departamento, 'marketing', id)
  }
})

test('pesquisa: encontra por sigla, nomes e sem acentos', () => {
  assert.ok(pesquisar('cac').some(x => x.id === 'A01'))
  assert.ok(pesquisar('RUNWAY').some(x => x.id === 'F05'))
  assert.ok(pesquisar('autonomia financeira').some(x => x.id === 'F05'))
  assert.ok(pesquisar('negocios fechados').some(x => x.id === 'G30'))
  assert.equal(pesquisar('').length, CATALOGO.length)
})
