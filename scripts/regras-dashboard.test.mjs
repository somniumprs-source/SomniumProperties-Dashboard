// Testes das regras de medição do Dashboard e da integridade do catálogo.
// Os casos replicam a situação real de 03/11/2026; são fotografia, não constantes da app.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ehParceria, ehConsultorParceiro, contagemParceria, capacidadeDeclarada, ehChamada, imoveisPorContactar,
  negocioFechado, escrituraRegistada, imoveisContactados, motivosPerda, cumprimentoTarefas, contribuicaoSomnium, capitalConfirmado, faltaFinanciamento, resumoBloqueios, respostas24h, VALIDADE_CONFIRMACAO_DIAS, resumoFases, custoRealObra, mediana, diasNaFase, resumoAnalisesNegocios, resumoProjetos,
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
  assert.equal(escrituraRegistada([condeixa, lages]), false, 'sem coluna não há leitura')
  assert.equal(escrituraRegistada([{ ...condeixa, dataEscrituraVenda: null }]), true)
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

// Plano de 70, menos F04 e F05 eliminados pelo CEO (G33 e G38 são gerais).
test('catálogo: inclui os 68 indicadores do plano que ficaram', () => {
  const plano = { A: 11, C: 16, I: 10, P: 10, O: 11, F: 6, W: 4 }
  for (const [p, n] of Object.entries(plano)) assert.equal(CATALOGO.filter(x => x.id.startsWith(p)).length, n, p)
})

test('núcleo: 26 indicadores, todos em uso e sem Marketing', () => {
  assert.equal(new Set(NUCLEO).size, 26)
  for (const id of NUCLEO) {
    assert.ok(metrica(id), id)
    assert.notEqual(metrica(id).estado, 'inativo', id)
    assert.notEqual(metrica(id).departamento, 'marketing', id)
  }
})

test('pesquisa: encontra por sigla, nomes e sem acentos', () => {
  assert.ok(pesquisar('cac').some(x => x.id === 'A01'))
  assert.ok(pesquisar('PROFIT EROSION').some(x => x.id === 'P07'))
  assert.ok(pesquisar('erosao de lucro').some(x => x.id === 'P07'))
  for (const id of ['F04', 'F05', 'G33', 'G38']) assert.equal(metrica(id), undefined, id)
  assert.ok(pesquisar('negocios fechados').some(x => x.id === 'G30'))
  assert.equal(pesquisar('').length, CATALOGO.length)
})

test('contacto efetivo: fase pós-contacto atual ou no histórico', () => {
  const im = [
    { id: 'a', estado: 'Visita Marcada' },
    { id: 'b', estado: 'Chamada Não Atendida' },
    { id: 'c', estado: 'Não interessa' },
    { id: 'd', estado: 'Adicionado' },
    { id: 'e', estado: 'Pendentes' },
  ]
  const hist = [
    { entidade_id: 'c', alteracoes: JSON.stringify([{ campo: 'estado', antes: 'Adicionado', depois: 'Necessidade de Visita' }]) },
    { entidade_id: 'd', alteracoes: [{ campo: 'estado', antes: 'Adicionado', depois: 'Chamada Não Atendida' }] },
  ]
  assert.deepEqual([...imoveisContactados(im, hist)].sort(), ['a', 'c'])
})

test('motivos de perda: separa por ";" e conta os sem motivo', () => {
  const r = motivosPerda([
    { estado: 'Não interessa', motivoNaoInteressa: 'Preço elevado; Proprietário difícil' },
    { estado: 'Não interessa', motivoNaoInteressa: 'Preço elevado' },
    { estado: 'Descartado', motivoDescarte: '' },
    { estado: 'CAEP', motivoNaoInteressa: 'ignorado' },
  ])
  assert.equal(r.perdas, 3)
  assert.equal(r.comMotivo, 2)
  assert.deepEqual(r.motivos[0], { motivo: 'Preço elevado', total: 2 })
})

test('cumprimento de tarefas: conta o prazo original e ignora por aprovar', () => {
  const ini = new Date('2026-11-01T00:00:00'), fim = new Date('2026-11-30T23:59:59'), agora = new Date('2026-11-10T12:00:00')
  const r = cumprimentoTarefas([
    { prazo_original: '2026-11-03', concluida_em: '2026-11-03T18:00:00' },
    { prazo_original: '2026-11-04', concluida_em: '2026-11-08T10:00:00' },
    { prazo_original: '2026-11-05', concluida_em: null },
    { prazo_original: '2026-11-20', concluida_em: null },
    { prazo_original: '2026-11-05', por_aprovar: true },
    { prazo_original: '2026-10-20', concluida_em: '2026-10-19T10:00:00' },
  ], ini, fim, agora)
  assert.deepEqual(r, { vencidas: 3, noPrazo: 1, pct: 33.33 })
})

test('contribuição da Somnium: Lages 40% tudo Somnium; sem parte não calcula', () => {
  assert.equal(contribuicaoSomnium({ categoria: 'CAEP', quotaSomnium: 18032.9, parteSomniumPct: 100 }), 18032.9)
  assert.equal(contribuicaoSomnium({ categoria: 'CAEP', quotaSomnium: 15000, parteSomniumPct: 66.67 }), 10000.5)
  assert.equal(contribuicaoSomnium({ categoria: 'Wholesaling', lucroEstimado: 3000, lucroReal: 1500, parteSomniumPct: 100 }), 3000)
  assert.equal(contribuicaoSomnium({ categoria: 'CAEP', quotaSomnium: 15000 }), null)
})

test('capital confirmado: vale 30 dias e só com valor', () => {
  assert.equal(VALIDADE_CONFIRMACAO_DIAS, 30)
  const hoje = new Date('2026-11-03T12:00:00')
  const r = capitalConfirmado([
    { capitalConfirmado: 100000, capitalConfirmadoEm: '2026-10-20' },
    { capitalConfirmado: 50000, capitalConfirmadoEm: '2026-09-01' },
    { capitalConfirmado: 0, capitalConfirmadoEm: '2026-11-01' },
    { capitalConfirmado: 70000 },
  ], hoje)
  assert.deepEqual(r, { valido: 100000, confirmacoes: 2, validas: 1, pctValidas: 50 })
})

test('falta de financiamento: só imóveis em fase de proposta', () => {
  const im = [{ id: 'a', estado: 'Proposta aceite' }, { id: 'b', estado: 'Estudo de VVR' }, { id: 'c', estado: 'Enviar proposta ao investidor' }]
  const an = [{ imovel_id: 'a', capital_necessario: 150000 }, { imovel_id: 'b', capital_necessario: 999999 }, { imovel_id: 'c', capital_necessario: 50000 }]
  assert.deepEqual(faltaFinanciamento(im, an, 120000), { operacoes: 2, necessidade: 200000, falta: 80000, cobertura: 60 })
  assert.equal(faltaFinanciamento([], [], 0).cobertura, null)
})

test('bloqueios e prazos: só abertos, com dias e vencidos', () => {
  const hoje = new Date('2026-11-03T12:00:00')
  const r = resumoBloqueios([
    { id: 1, tipo: 'bloqueio', descricao: 'Certidão ARU', aberto_em: '2026-10-01' },
    { id: 2, tipo: 'bloqueio', descricao: 'resolvido', aberto_em: '2026-09-01', resolvido_em: '2026-10-01' },
    { id: 3, tipo: 'prazo', descricao: 'CPCV', data_limite: '2026-11-20' },
    { id: 4, tipo: 'prazo', descricao: 'Cedência', data_limite: '2026-11-01' },
  ], hoje)
  assert.equal(r.maiorBloqueioDias, 33)
  assert.equal(r.bloqueios.length, 1)
  assert.equal(r.prazosVencidos, 1)
  assert.equal(r.prazos30Dias, 1)
  assert.equal(r.prazos[0].descricao, 'Cedência')
})

test('resposta em 24 h: nos dois sentidos, conversa nova fora', () => {
  const r = respostas24h([
    { consultor_id: 'x', direcao: 'Enviado', data_hora: '2026-11-01T10:00:00Z' },
    { consultor_id: 'x', direcao: 'Enviado', data_hora: '2026-11-01T12:00:00Z' },
    { consultor_id: 'x', direcao: 'Recebido', data_hora: '2026-11-01T20:00:00Z' },
    { consultor_id: 'x', direcao: 'Enviado', data_hora: '2026-11-03T08:00:00Z' },
    { consultor_id: 'y', direcao: 'Recebido', data_hora: '2026-10-01T10:00:00Z' },
    { consultor_id: 'y', direcao: 'Enviado', data_hora: '2026-10-20T10:00:00Z' },
    { consultor_id: 'y', direcao: 'Nota', data_hora: '2026-10-20T11:00:00Z' },
  ])
  assert.deepEqual(r.consultor, { amostra: 1, pct: 100 })
  assert.deepEqual(r.somnium, { amostra: 1, pct: 0 })
})

test('custo final previsto: previsão manual só em rubricas que acumulam', async () => {
  const { custoFinalPrevisto, erosaoLucro } = await import('../supabase/functions/_shared/rubricasAnalise.js')
  const analise = { compra: 100000, obra_com_iva: 50000, imt: 2000, escritura: null, lucro_bruto: 30000 }
  const despesas = [
    { rubrica_analise: 'compra', custo_mensal: 100000 },
    { rubrica_analise: 'imt', custo_mensal: 2500 },
    { fase_id: 'f1', custo_mensal: 10000 },
    { rubrica_analise: 'extra', custo_mensal: 1000 },
  ]
  const semPrevisao = custoFinalPrevisto(analise, despesas)
  assert.equal(semPrevisao.orcamento, 152000)
  assert.equal(semPrevisao.previsto, 153500, 'obra fica no estimado, IMT na fatura, extra soma')
  assert.equal(semPrevisao.desvio, -1500)
  const comPrevisao = custoFinalPrevisto(analise, despesas, { obra: 58000, imt: 1 })
  assert.equal(comPrevisao.previsto, 161500, 'IMT não acumula: previsão ignorada')
  assert.equal(custoFinalPrevisto(analise, despesas, { obra: 5000 }).previsto, 113500, 'nunca abaixo do faturado')
  const e = erosaoLucro({ lucro_bruto: 35000 }, analise, comPrevisao)
  assert.deepEqual(e, { lucroReferencia: 35000, lucroPrevisto: 20500, erosao: 14500 })
  assert.equal(erosaoLucro(null, analise, comPrevisao), null)
})

// O build do Vite não lê o servidor: um erro de sintaxe em routes.js só
// aparecia ao arrancar, com a API do CRM desligada.
test('servidor: ficheiros sem erros de sintaxe', async () => {
  const { spawnSync } = await import('node:child_process')
  for (const f of ['server.js', 'src/db/routes.js', 'src/db/contactoPessoa.js', 'src/db/queries.js', 'src/db/analiseRoutes.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${f}: ${r.stderr}`)
  }
})
