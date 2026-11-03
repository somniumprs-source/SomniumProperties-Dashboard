// Catálogo de indicadores: fonte única do Glossário e das fichas abertas a partir
// de cada número do Dashboard. O estado diz o que é realmente medido hoje; só
// passa a "medido" com fórmula aprovada, fonte real e valor conferido.
// `interna: true` = sigla criada pela Somnium, não é um termo de mercado.

export const ESTADOS = {
  medido:      { label: 'Medido',      descricao: 'Fórmula definida, dados reais e valor conferido com a fonte.' },
  parcial:     { label: 'Parcial',     descricao: 'Há dados reais, mas estão incompletos ou a regra ainda não está fechada.' },
  sem_registo: { label: 'Sem registo', descricao: 'Ainda não existe registo que permita medir. Não mostra número.' },
  inativo:     { label: 'Inativo',     descricao: 'Definido, mas não usado nesta fase.' },
}

export const DEPARTAMENTOS = {
  comercial:  'Departamento Comercial',
  obras:      'Departamento de Obras',
  financeiro: 'Departamento Financeiro',
  marketing:  'Departamento de Marketing',
  geral:      'Geral',
}

// Núcleo aprovado em 03/11/2026: os indicadores a pôr a medir primeiro.
export const NUCLEO = [
  'C01', 'C02', 'C03', 'C11', 'C12', 'C15', 'C16', 'I01', 'I09', 'I10',
  'O01', 'O02', 'O04', 'O07', 'O09', 'W04',
  'F02', 'F04', 'F05', 'F07', 'W01', 'I02', 'I03', 'I04', 'P03', 'P04', 'P05', 'P07',
]

const m = (id, sigla, nome, nomeEn, departamento, estado, explicacao, formula, interpretar, extra = {}) =>
  ({ id, sigla, nome, nomeEn, departamento, estado, explicacao, formula, interpretar, interna: true, ...extra })
const consagrada = { interna: false }

export const CATALOGO = [
  // ── Atividade e funil de imóveis ─────────────────────────────────────────
  m('G01', 'IA', 'Imóveis adicionados', 'Properties added', 'comercial', 'medido', 'Imóveis que entraram na plataforma no período.', 'Imóveis com data de adição no período', 'Mede o volume de entrada, não a qualidade.'),
  m('G02', 'CI', 'Chamadas a imóveis', 'Property calls', 'comercial', 'parcial', 'Imóveis com chamada registada no período.', 'Imóveis com data de chamada no período', 'Conta imóveis, não tentativas. Muitos imóveis ainda não têm a chamada registada.', { falta: 'Registar a chamada em todos os imóveis contactados.' }),
  m('G03', 'VIS', 'Visitas', 'Viewings', 'comercial', 'medido', 'Imóveis com visita registada no período.', 'Imóveis com data de visita no período', 'Uma visita agendada ainda não é uma visita realizada.'),
  m('G04', 'EM', 'Estudos de mercado', 'Market studies', 'comercial', 'medido', 'Imóveis com estudo de mercado feito no período.', 'Imóveis com data de estudo no período', 'Mostra quantos imóveis chegam a análise séria.'),
  m('G05', 'PROP', 'Propostas', 'Offers', 'comercial', 'medido', 'Imóveis com proposta feita no período.', 'Imóveis com data de proposta no período', 'Conta imóveis, não versões da mesma proposta.'),
  m('G06', 'PC', 'Por contactar', 'Uncontacted properties', 'comercial', 'medido', 'Imóveis no estado Adicionado ainda sem chamada.', 'Estado Adicionado e sem data de chamada', 'Deve manter-se baixo. Imóveis em fases avançadas ou fora do funil não contam.'),
  m('G07', 'AA', 'Aprovação em análise', 'Underwriting pass rate', 'comercial', 'medido', 'Dos imóveis estudados, quantos chegam a proposta.', 'Com proposta ÷ com estudo de mercado, na coorte do período', 'Muito baixa indica seleção fraca; muito alta pode indicar pouco rigor.'),
  m('G08', 'CP', 'Chegam a proposta', 'Offer rate', 'comercial', 'medido', 'Dos imóveis adicionados no período, quantos tiveram proposta.', 'Com proposta ÷ adicionados no período', 'Coortes recentes ainda estão a amadurecer.'),
  m('G09', 'TPA', 'Taxa de propostas aceites', 'Accepted offer rate', 'comercial', 'medido', 'Dos imóveis adicionados no período, quantos tiveram proposta aceite.', 'Com proposta aceite ÷ adicionados no período', 'Proposta aceite não é negócio fechado: fechado exige escritura de venda.'),
  m('G10', 'DM', 'Desconto médio', 'Average discount', 'comercial', 'parcial', 'Diferença média entre o preço pedido e o valor proposto.', '(Preço pedido − valor proposto) ÷ preço pedido', 'Mede a capacidade de negociação.', { falta: 'Ter mais propostas com preço pedido e valor proposto.' }),
  m('G11', 'ORI', 'Origem do imóvel', 'Property source', 'comercial', 'medido', 'De onde vieram os imóveis adicionados no período.', 'Contagem por origem', 'Mostra volume por canal, não rentabilidade.'),
  m('G12', 'DPA', 'Dias até proposta aceite', 'Days to accepted offer', 'comercial', 'parcial', 'Tempo médio entre adicionar o imóvel e ter a proposta aceite.', 'Média de dias entre as duas datas', 'Só inclui imóveis que chegaram a proposta aceite.', { falta: 'Confirmar as datas: o único caso mostra 0 dias.' }),
  m('G13', 'RF', 'Ritmo de fecho', 'Deal throughput', 'comercial', 'medido', 'Negócios fechados por mês.', 'Negócios com escritura de venda ÷ meses do período', 'Só conta com escritura de venda. Sem escrituras no período, o valor é 0.'),
  m('G14', 'PP', 'Pipeline ponderado', 'Weighted pipeline', 'comercial', 'parcial', 'Lucro potencial dos imóveis ativos, ajustado pela fase de cada um.', 'Soma de lucro estimado × probabilidade da fase', 'Não é receita garantida. As probabilidades são hipóteses, ainda sem calibração.', { falta: 'Calibrar as probabilidades com dados reais.' }),

  // ── Relação com investidores e consultores ───────────────────────────────
  m('G15', 'DC', 'Discovery calls', 'Discovery calls', 'comercial', 'medido', 'Primeiras chamadas com investidores novos.', 'Chamadas com finalidade discovery no período', 'Só conta chamadas registadas na ficha do investidor com a finalidade discovery.'),
  m('G16', 'FUC', 'Follow-up calls', 'Follow-up calls', 'comercial', 'parcial', 'Chamadas com investidores já existentes.', 'Chamadas com finalidade follow-up no período', 'Emails e notas não contam. As gravações de chamadas ainda não entram.', { falta: 'Ligar as chamadas gravadas a este indicador.' }),
  m('G17', 'NI', 'Novos investidores', 'New investors', 'comercial', 'medido', 'Investidores com primeiro contacto no período.', 'Investidores com data de primeiro contacto no período', 'Mede entrada, não capital.'),
  m('G18', 'CINV', 'Conversão de investidores', 'Investor conversion', 'comercial', 'medido', 'Investidores em parceria face ao total de investidores.', 'Em parceria ÷ total de investidores', 'Taxa acumulada, não do período.'),
  m('G19', 'REI', 'Reinvestimento', 'Reinvestment rate', 'comercial', 'medido', 'Investidores em parceria que já entraram em mais de um negócio.', 'Com mais de um negócio ÷ em parceria', 'Ainda há poucos ciclos concluídos para concluir tendência.'),
  m('G20', 'SAI', 'Saída de investidores', 'Investor churn', 'comercial', 'medido', 'Investidores que declararam não reinvestir no período.', 'Com declaração no período ÷ em parceria', 'Ausência de oportunidade não é saída.'),
  m('G22', 'CCS', 'Chamadas feitas pela Somnium', 'Outbound consultant calls', 'comercial', 'medido', 'Chamadas com consultores iniciadas pela Somnium.', 'Chamadas com direção Enviado no período', 'Mostra a iniciativa da equipa.'),
  m('G23', 'NC', 'Novos consultores', 'New consultants', 'comercial', 'medido', 'Consultores com início de relação no período.', 'Consultores com data de início no período', 'Mede rede, não negócio.'),
  m('G24', 'TCC', 'Conversão de consultores', 'Consultant conversion', 'comercial', 'medido', 'Imóveis trazidos por consultores que chegaram a proposta aceite.', 'Com proposta aceite ÷ imóveis com consultor', 'Mostra a qualidade do que os consultores enviam.'),
  m('G25', 'ATV', 'Ativação de consultores', 'Consultant activation', 'comercial', 'medido', 'Consultores que já enviaram pelo menos um imóvel.', 'Com imóveis enviados ÷ total de consultores', 'Mede quantos passam do contacto à ação.'),
  m('G26', 'PI', 'Parceiros inativos', 'Inactive partners', 'comercial', 'medido', 'Parceiros sem enviar imóveis há mais de 60 dias.', 'Sem imóvel há mais de 60 dias ÷ parceiros', 'Conta só o estatuto Consultores em Parceria.'),
  m('G27', 'R24', 'Resposta em 24 horas', '24-hour response rate', 'comercial', 'medido', 'Mensagens respondidas em até 24 horas, nos dois sentidos: consultores à Somnium e Somnium aos consultores.', 'Respondidas até 24 h ÷ com resposta, para cada sentido', 'Meta do SOP 1: pelo menos 80%. Só conta contactos com «Quem contactou» registado; resposta depois de 7 dias já é conversa nova.'),
  m('G28', 'LPR', 'Lista Premium', 'Premium partner list', 'comercial', 'parcial', 'Parceiros ordenados pelo valor gerado e pelos imóveis enviados.', 'Ranking por lucro gerado e imóveis enviados', 'Enquanto o lucro não estiver ligado, ordena só por imóveis enviados.', { falta: 'Ligar o lucro dos negócios a cada consultor.' }),
  m('G29', 'LFO', 'Lucro por fonte', 'Profit by source', 'comercial', 'medido', 'Lucro dos negócios fechados por canal de origem.', 'Soma do lucro por origem do imóvel', 'Só conta com escritura de venda. Sem escrituras, fica vazio.'),
  m('G47', 'IAB', 'Investidores classe A/B', 'A/B-rated investors', 'comercial', 'medido', 'Investidores classificados com A ou B na avaliação.', 'Contagem de classes A e B', 'Classe alta não significa capital confirmado.'),

  // ── Financeiro e capital ─────────────────────────────────────────────────
  m('G30', 'NF', 'Negócios fechados', 'Closed deals', 'financeiro', 'medido', 'Negócios com escritura de venda feita.', 'Negócios com escritura de venda no período', 'Regra do CEO: sem escritura não há fecho. Compra, cedência ou pagamento não contam. A data regista-se na ficha do projeto.'),
  m('G31', 'LMN', 'Lucro médio por negócio', 'Average profit per deal', 'financeiro', 'medido', 'Lucro médio dos negócios fechados.', 'Lucro dos fechados ÷ número de fechados', 'Alvo: 15 000 a 20 000 € por negócio. Conta o lucro do negócio; a parte da Somnium é a P05.'),
  m('G32', 'MM', 'Margem média', 'Average margin', 'financeiro', 'medido', 'Lucro dos negócios fechados face ao capital.', 'Lucro ÷ capital, média dos fechados', 'Com poucos negócios, mostrar sempre o número de casos.'),
  m('G33', 'CPN', 'Custo por negócio', 'Cost per deal', 'financeiro', 'sem_registo', 'Custo da estrutura por negócio fechado.', 'Custos de estrutura classificados ÷ negócios fechados', 'O valor anterior tratava despesas únicas como mensais e foi retirado.', { falta: 'Classificar as despesas e aprovar a regra.' }),
  m('G38', 'FLC', 'Fluxo líquido de capital', 'Net capital flow', 'financeiro', 'sem_registo', 'Capital que entrou menos capital que saiu no período.', 'Entradas − capital perdido', 'Positivo significa mais capital a entrar do que a sair.', { falta: 'Registar a data de transferência do capital.' }),
  m('G39', 'RC', 'Rotação de capital', 'Capital turnover', 'financeiro', 'medido', 'Quantas vezes por ano o capital completa um negócio.', 'Capital realizado ÷ capital investido, anualizado', 'Só conta com escritura de venda. Sem escrituras, o valor é 0.'),
  m('G40', 'TMS', 'Investimento médio por participação', 'Average ticket per slot', 'financeiro', 'medido', 'Valor médio de cada participação de investidor num negócio.', 'Capital das participações ÷ número de participações', 'Ajuda a estimar quantos investidores cada negócio precisa.'),
  m('G42', 'CAP', 'Capital perdido', 'Capital churn', 'financeiro', 'medido', 'Capital dos investidores que declararam não reinvestir.', 'Soma do montante desses investidores no período', 'Mostrar também em percentagem do capital investido.'),
  m('G43', 'LPV', 'Lucro previsto', 'Expected profit', 'financeiro', 'parcial', 'Lucro estimado de todos os negócios ativos e vendidos.', 'Soma do lucro estimado', 'É previsão. O T2 Condeixa tem uma parte variável: 2,5% do valor final do negócio.', { falta: 'Registar o valor final do T2 Condeixa, de que dependem os 2,5%.' }),
  m('G45', 'AR', 'A receber', 'Pending receipts', 'financeiro', 'parcial', 'Diferença entre o lucro estimado e o já recebido.', 'Lucro estimado − recebido', 'Não é dívida vencida. Inclui valores que dependem da venda.', { falta: 'Registar o valor final do T2 Condeixa, de que dependem os 2,5%.' }),
  m('G51', 'CN', 'Capital necessário', 'Required capital', 'financeiro', 'medido', 'Capital pedido nas análises dos negócios reais.', 'Soma do capital necessário das análises', 'Não inclui a comissão de mediação.'),
  m('G52', 'IR', 'Imóveis com risco', 'Properties at risk', 'financeiro', 'inativo', 'Análises com prejuízo no pior cenário.', 'Análises com lucro negativo no cenário pessimista', 'Retirado do ecrã: contava também imóveis apenas estudados.'),
  m('G53', 'RA', 'Retorno anualizado médio', 'Average annualised return', 'financeiro', 'parcial', 'Retorno anualizado das análises dos negócios reais.', 'Média ponderada pelo capital', 'É previsto.', { falta: 'Separar previsto de realizado.' }),

  // ── Obras ────────────────────────────────────────────────────────────────
  m('G46', 'NA', 'Negócios ativos', 'Active deals', 'obras', 'medido', 'Negócios ainda sem escritura de venda.', 'Negócios sem escritura de venda', 'Não significa obra em curso: a obra pode ainda não ter começado.'),

  // ── Indicadores gerais retirados ─────────────────────────────────────────
  m('G49', 'ROIC', 'Retorno sobre o capital investido', 'Return on invested capital', 'geral', 'inativo', 'Lucro face ao capital investido. Foi a North Star antiga.', 'Lucro ÷ capital investido, anualizado', 'Os investidores financiam 100%, por isso não mede o retorno da Somnium.', consagrada),
  m('G50', 'SN', 'Saúde do negócio', 'Business health score', 'geral', 'inativo', 'Pontuação antiga de 0 a 100 baseada em atividade e alertas.', 'Base 50, com somas e descontos fixos', 'Retirada: não tinha metas aprovadas e dava "bom" a uma semana sem atividade.'),

  // ── Aquisição e canais (Marketing em espera) ─────────────────────────────
  m('A01', 'CAC', 'Custo de aquisição de cliente', 'Customer Acquisition Cost', 'marketing', 'inativo', 'Quanto custa conquistar um cliente de Wholesaling.', 'Custos de marketing e vendas ÷ novos clientes', 'Mais baixo só é melhor se a qualidade se mantiver. Zero clientes: não aplicável.', consagrada),
  m('A02', 'CAI', 'Custo de aquisição de investidor', 'Investor Acquisition Cost', 'comercial', 'inativo', 'Quanto custa conseguir um investidor com primeiro aporte.', 'Custos de captação ÷ investidores com primeiro aporte', 'Avaliar junto com o capital captado e o tempo até ao aporte.'),
  m('A03', 'COA', 'Custo de originação por aquisição', 'Origination cost per acquisition', 'comercial', 'inativo', 'Custo comercial de encontrar e negociar um imóvel comprado.', 'Custos de prospeção e negociação ÷ aquisições', 'Exclui o preço de compra e a obra.'),
  m('A04', 'CAC-D/FL', 'CAC direto e total', 'Direct and fully loaded CAC', 'marketing', 'inativo', 'CAC só com despesas diretas e CAC com pessoal, ferramentas e rateios.', 'Direto = despesas identificáveis; total = direto + rateios aprovados', 'Comparar canais sempre na mesma base.'),
  m('A05', 'CPL', 'Custo por lead', 'Cost per Lead', 'marketing', 'inativo', 'Custo de cada lead válido.', 'Custo atribuível ÷ leads válidos únicos', 'Leads baratos e fracos podem sair caros no fim.', consagrada),
  m('A06', 'CPQL', 'Custo por lead qualificado', 'Cost per Qualified Lead', 'marketing', 'inativo', 'Custo de cada lead que passa a qualificação.', 'Custo atribuível ÷ leads qualificados', 'Depende de critérios estáveis.', consagrada),
  m('A07', 'CPM-R', 'Custo por reunião realizada', 'Cost per Held Meeting', 'marketing', 'inativo', 'Custo de cada reunião que aconteceu mesmo.', 'Custo atribuível ÷ reuniões realizadas', 'Reuniões marcadas que não acontecem não contam.'),
  m('A08', 'ROAS', 'Retorno do investimento publicitário', 'Return on Ad Spend', 'marketing', 'inativo', 'Receita atribuída por cada euro de publicidade.', 'Receita atribuída ÷ publicidade', 'Não é lucro, nem prova que o canal causou a receita.', consagrada),
  m('A09', 'CPP', 'Tempo de recuperação do CAC', 'CAC Payback Period', 'marketing', 'inativo', 'Tempo até o cliente devolver o custo da sua aquisição.', 'Tempo até a contribuição acumulada cobrir o CAC', 'Se não recuperou, mostrar o saldo, não uma projeção.'),
  m('A10', 'CLV', 'Valor do cliente realizado', 'Customer Lifetime Value', 'marketing', 'inativo', 'Contribuição acumulada de um cliente até hoje.', 'Soma da contribuição por cliente', 'Com pouco histórico é valor observado, não previsão.', consagrada),
  m('A11', 'CAINV', 'Contribuição associada ao investidor', 'Investor-attributed contribution', 'comercial', 'inativo', 'Parte da contribuição das operações atribuída a cada investidor.', 'Contribuição × participação do investidor', 'Serve para avaliar a relação; não é receita paga pelo investidor.'),

  // ── Funis e eficiência comercial ─────────────────────────────────────────
  m('C01', 'L2C', 'Taxa de contacto efetivo', 'Lead-to-Contact Rate', 'comercial', 'medido', 'Imóveis com contacto real, com alguém a atender.', 'Imóveis adicionados no período que chegaram a uma fase pós-contacto ÷ imóveis adicionados no período', 'Chamada Não Atendida, Pendentes e saídas diretas para Não interessa não contam como contacto.'),
  m('C02', 'C2V', 'Taxa de contacto para visita', 'Contact-to-Visit Rate', 'comercial', 'parcial', 'Dos imóveis contactados, quantos foram visitados.', 'Com visita ÷ com chamada, na coorte do período', 'Valor baixo pode indicar seleção fraca ou acesso difícil.', { falta: 'Registar a chamada em todos os imóveis contactados.' }),
  m('C03', 'V2O', 'Taxa de visita para proposta', 'Visit-to-Offer Rate', 'comercial', 'medido', 'Dos imóveis visitados, quantos tiveram proposta.', 'Com proposta ÷ com visita, na coorte do período', 'Nem toda a visita deve gerar proposta.'),
  m('C04', 'OAR', 'Taxa de aceitação de propostas', 'Offer Acceptance Rate', 'comercial', 'inativo', 'Propostas aceites entre as que tiveram decisão.', 'Aceites ÷ com decisão', 'Muito alta pode indicar propostas demasiado generosas.'),
  m('C05', 'DDPR', 'Taxa de aprovação em due diligence', 'Due Diligence Pass Rate', 'comercial', 'inativo', 'Oportunidades aprovadas na verificação.', 'Aprovadas ÷ com decisão', 'Reprovação alta pode ser rigor saudável.'),
  m('C06', 'AWR', 'Taxa de ganho de aquisição', 'Acquisition Win Rate and End-to-End', 'comercial', 'inativo', 'Aquisições conseguidas face às oportunidades decididas e às entradas.', 'Aquisições ÷ ganhas ou perdidas; aquisições ÷ entradas válidas', 'Não misturar denominadores.'),
  m('C07', 'IQR', 'Taxa de qualificação de investidores', 'Investor Qualification Rate', 'comercial', 'inativo', 'Leads de investidores que passam a qualificados.', 'Qualificados ÷ leads elegíveis', 'Mede adequação e rigor.'),
  m('C08', 'MBSR', 'Marcação e comparência em reuniões', 'Meeting Booking and Show Rate', 'comercial', 'inativo', 'Leads com reunião marcada e reuniões que aconteceram.', 'Marcadas ÷ contactados; realizadas ÷ devidas', 'Queda na comparência indica falhas de confirmação.'),
  m('C09', 'Q2C', 'Qualificado para compromisso e ativação', 'Qualification-to-Commitment and Activation', 'comercial', 'inativo', 'Qualificados que se comprometem e que financiam.', 'Comprometidos ÷ qualificados; financiados ÷ qualificados', 'Interesse e contrato não são financiamento.'),
  m('C10', 'STL', 'Rapidez de resposta ao lead', 'Speed to Lead', 'comercial', 'inativo', 'Tempo até à primeira tentativa humana e ao primeiro contacto real.', 'Tempo entre entrada e contacto; mediana e percentil 90', 'Email automático não conta.'),
  m('C11', 'AGE', 'Dias na fase atual', 'Stage Aging', 'comercial', 'medido', 'Há quantos dias os imóveis estão parados na fase em que se encontram.', 'Mediana de dias desde a última mudança de estado', 'Valor alto revela estagnação. Só inclui imóveis com histórico.'),
  m('C12', 'FUCP', 'Cumprimento de prazos das tarefas', 'Follow-up Compliance', 'comercial', 'medido', 'Tarefas concluídas dentro do prazo.', 'Concluídas até ao prazo original ÷ tarefas cujo prazo original venceu no período', 'Adiar o prazo não melhora o indicador. Tarefas por aprovar ou arquivadas ficam de fora; as concluídas antes desta medição não contam.'),
  m('C13', 'SLP', 'Derrapagem do pipeline', 'Pipeline Slippage', 'comercial', 'inativo', 'Negócios previstos para fechar que foram adiados.', 'Adiados ÷ previstos no início do período', 'Sem fotografias periódicas não se reconstrói.'),
  m('C14', 'PCV', 'Cobertura do pipeline', 'Pipeline Coverage', 'comercial', 'inativo', 'Contribuição em pipeline face à meta.', 'Contribuição elegível ÷ meta', 'Não é receita garantida.'),
  m('C15', 'LRD', 'Motivos de perda', 'Loss Reason Distribution', 'comercial', 'medido', 'Porque se perdem os imóveis.', 'Perdas por motivo ÷ perdas com motivo', 'Um imóvel pode ter vários motivos. Mostrar sempre quantas perdas têm motivo preenchido.'),
  m('C16', 'CSLA', 'Chamadas e SLA de resposta', 'Calls and Response SLA', 'comercial', 'parcial', 'Chamadas por finalidade e resultado, e pedidos respondidos a tempo.', 'Chamadas por tipo; respondidos no limite ÷ devidos', 'Emails não são chamadas.', { falta: 'Registar finalidade, resultado e respostas recebidas.' }),

  // ── Capital e investidores ───────────────────────────────────────────────
  m('I01', 'ICC', 'Capacidade declarada', 'Indicative Capital Capacity', 'comercial', 'medido', 'Capital que investidores em carteira ou parceria dizem poder investir, descontado o já investido.', 'Soma de (capital máximo − investido)', 'É potencial. Não autoriza nenhuma compra.'),
  m('I02', 'CCD', 'Capital confirmado disponível', 'Confirmed Available Capital', 'financeiro', 'medido', 'Capital que o investidor confirmou ter disponível, dentro da validade.', 'Soma das confirmações com menos de 30 dias', 'Só este capital serve para avançar com um negócio. A confirmação regista-se na ficha do investidor.'),
  m('I03', 'RCF', 'Capital reservado, comprometido e recebido', 'Reserved, Committed and Funded Capital', 'financeiro', 'parcial', 'Capital por estado: reservado, contratado e efetivamente recebido.', 'Soma por estado, sem contar duas vezes', 'Hoje só existe o capital por participação.', { falta: 'Registar reservas, compromissos e a data de entrada.' }),
  m('I04', 'FG', 'Falta de financiamento e cobertura', 'Funding Gap and Coverage', 'financeiro', 'parcial', 'Quanto falta para financiar as operações em fase de proposta.', 'Capital necessário das operações em proposta − capital confirmado válido; confirmado ÷ necessário', 'Cobertura reservada é diferente de cobertura recebida.', { falta: 'Reservar o capital confirmado a cada operação; por agora conta todo para todas.' }),
  m('I05', 'TTF', 'Tempo até financiar', 'Time to Fund', 'financeiro', 'inativo', 'Dias entre abrir a captação e ter a operação financiada.', 'Dias entre as duas datas', 'Não esconder operações que nunca financiaram.'),
  m('I06', 'CCR', 'Taxa de conversão de capital', 'Capital Conversion Rate', 'financeiro', 'inativo', 'Compromissos exigíveis que entraram mesmo.', 'Aportes recebidos ÷ compromissos exigíveis', 'Compromissos futuros não são falhas.'),
  m('I07', 'RIR', 'Reinvestimento e retenção de capital', 'Repeat Investment and Capital Retention', 'comercial', 'inativo', 'Pessoas e capital que voltam a investir.', 'Reinvestem ÷ elegíveis; capital reinvestido ÷ devolvido', 'Não haver oportunidade não é saída.'),
  m('I08', 'CON', 'Concentração de investidores', 'Investor Concentration', 'financeiro', 'medido', 'Peso dos maiores investidores no capital.', 'Capital dos 3 maiores ÷ capital investido', 'Exposição relevante mesmo com poucos investidores.'),
  m('I09', 'CFR', 'Validade das confirmações', 'Confirmation Freshness', 'comercial', 'medido', 'Capital confirmado que continua dentro da validade.', 'Confirmações com menos de 30 dias ÷ confirmações', 'Carteira antiga não é financiamento mobilizável. Validade: 30 dias.'),
  m('I10', 'IEP', 'Investidores em parceria', 'Investors in Partnership', 'comercial', 'medido', 'Quantos estão em parceria, por estado e com capital efetivamente investido.', 'Contagem por estado e contagem com aporte', 'Os dois números podem ser diferentes e estar ambos certos.'),

  // ── Investimento e underwriting ──────────────────────────────────────────
  m('P01', 'GDV', 'Valor bruto de venda', 'Gross Development Value', 'financeiro', 'inativo', 'Venda bruta esperada do projeto.', 'Soma do valor de venda previsto', 'Não é receita da Somnium.', consagrada),
  m('P02', 'TDC', 'Custo total do projeto', 'Total Development Cost', 'financeiro', 'inativo', 'Todos os custos: compra, impostos, obra, técnicos e venda.', 'Soma das rubricas de custo', 'Excluir custos aumenta artificialmente o retorno.', consagrada),
  m('P03', 'DP', 'Lucro previsto do projeto', 'Development Profit', 'financeiro', 'parcial', 'Lucro líquido previsto nas análises dos negócios reais, antes de repartir.', 'Soma do lucro líquido das análises', 'É do projeto, não é a parcela da Somnium.', { falta: 'Separar previsto de realizado.' }),
  m('P04', 'POC', 'Retorno total sobre o custo', 'Profit on Cost', 'financeiro', 'parcial', 'Retorno total das análises dos negócios reais. Alvo: 20% a 25%.', 'Lucro ÷ capital necessário, não anualizado', '25% sobre o custo não é o mesmo que 25% sobre a venda.', { falta: 'Confirmar o denominador do ROI total.' }),
  m('P05', 'SDC', 'Contribuição da Somnium por negócio', 'Somnium Deal Contribution', 'financeiro', 'parcial', 'O que cabe à Somnium em cada negócio.', 'Quota da Somnium (CAEP) ou fee (restantes) × parte da Somnium', 'CAEP normal: 2/3 para a Somnium e 1/3 para o Luís Pedro. Lages e Condeixa: 100%.', { falta: 'Descontar os custos diretos da Somnium (vem com a classificação das despesas).' }),
  m('P06', 'BESP', 'Preço de equilíbrio', 'Break-even Sale Price', 'financeiro', 'inativo', 'Preço de venda que cobre todos os custos.', 'Preço em que o resultado é zero', 'Não é o preço mínimo comercial.'),
  m('P07', 'PE', 'Erosão de lucro', 'Profit Erosion', 'financeiro', 'sem_registo', 'Quanto lucro se perdeu face à previsão inicial.', 'Lucro de referência − previsão atual', 'Rever o orçamento não pode apagar a referência.', { falta: 'Manter uma previsão atual por negócio.' }),
  m('P08', 'HP', 'Prazo do negócio', 'Holding Period', 'financeiro', 'inativo', 'Tempo entre compra e venda, e entre aporte e distribuição.', 'Dias entre as datas', 'Atrasos reduzem o retorno anualizado.'),
  m('P09', 'XIRR', 'Taxa interna de retorno e múltiplo', 'XIRR and Equity Multiple', 'financeiro', 'inativo', 'Retorno do investidor segundo as datas reais dos fluxos.', 'XIRR dos fluxos; distribuições ÷ aportes', 'Sem fluxos reais não se calcula.', consagrada),
  m('P10', 'SEN', 'Sensibilidade e cenários', 'Sensitivity and Scenarios', 'financeiro', 'inativo', 'Efeito de vender mais barato, gastar mais ou atrasar.', 'Recalcular o resultado por cenário', 'São testes, não previsões.'),

  // ── Operações e construção ───────────────────────────────────────────────
  m('O01', 'CB', 'Orçamento de referência', 'Cost Baseline', 'obras', 'parcial', 'Negócios com análise final congelada como referência.', 'Negócios com análise final ÷ negócios', 'Evita esconder derrapagens redefinindo a meta.', { falta: 'Congelar o orçamento de obra por rubrica.' }),
  m('O02', 'AC', 'Custo real', 'Actual Cost', 'obras', 'medido', 'Custo já registado nas faturas dos negócios.', 'Soma das despesas ligadas a negócios', 'Custo registado não é o mesmo que custo final previsto.', consagrada),
  m('O03', 'OC', 'Compromissos por executar', 'Outstanding Commitments', 'obras', 'inativo', 'Parte contratada ainda não executada.', 'Contratado − incorrido', 'Não somar faturas já incluídas no contrato.'),
  m('O04', 'EAC', 'Custo final previsto', 'Estimate at Completion', 'obras', 'sem_registo', 'Quanto a obra vai custar no fim, e o desvio face ao orçamento.', 'ETC = custo restante; EAC = custo real + ETC; VAC = orçamento − EAC', 'VAC negativo prevê ultrapassagem.', { ...consagrada, falta: 'Manter a previsão do custo restante por rubrica.' }),
  m('O05', 'CU', 'Utilização da contingência', 'Contingency Utilisation', 'obras', 'inativo', 'Contingência já consumida.', 'Consumida ÷ aprovada', 'Mostrar a reserva que resta.'),
  m('O06', 'COE', 'Exposição a trabalhos a mais', 'Change Order Exposure', 'obras', 'inativo', 'Alterações propostas, aprovadas, executadas e pagas.', 'Valores por estado', 'Pendências podem ser custo ainda não previsto.'),
  m('O07', 'MCV', 'Atraso de fases', 'Milestone and Completion Variance', 'obras', 'parcial', 'Fases em atraso face à data prevista.', 'Data atual − fim previsto, nas fases por concluir', 'Atrasos de fases não se somam num atraso global.', { falta: 'Preencher as datas previstas e reais de todas as fases.' }),
  m('O08', 'WPP', 'Avanço físico ponderado', 'Weighted Physical Progress', 'obras', 'inativo', 'Avanço real da obra, ponderado por atividade.', 'Soma de avanço × peso', 'Não medir pelo orçamento consumido.'),
  m('O09', 'BA', 'Antiguidade dos bloqueios', 'Blocker Aging', 'obras', 'medido', 'Há quantos dias um bloqueio está aberto, como a certidão ARU.', 'Dias desde a abertura do bloqueio', 'Sem registo não significa sem problemas. Os bloqueios registam-se na ficha do projeto.'),
  m('O10', 'CPI/SPI', 'Eficiência de custo e prazo', 'Cost and Schedule Performance Index', 'obras', 'inativo', 'Relação entre valor executado, planeado e custo real.', 'CPI = EV ÷ AC; SPI = EV ÷ PV', 'Só com orçamento faseado e medição física credível.', consagrada),
  m('O11', 'PLC', 'Cobertura de liquidez do projeto', 'Project Liquidity Coverage', 'obras', 'inativo', 'Fundos do projeto face aos pagamentos restantes.', 'Fundos afetos ÷ pagamentos restantes', 'Só relevante se o custo final ultrapassar o capital recebido.'),

  // ── Financeiro, cobrança e Wholesaling ───────────────────────────────────
  m('F01', 'ROG', 'Resultado operacional de gestão', 'Management Operating Result', 'financeiro', 'inativo', 'Contribuições reconhecidas menos custos de estrutura.', 'Contribuições − estrutura', 'Não é EBITDA nem lucro líquido.'),
  m('F02', 'CFM', 'Custos fixos mensais', 'Corporate Overheads', 'financeiro', 'parcial', 'Custos recorrentes da empresa por mês.', 'Mensais + anuais ÷ 12', 'Valor registado, sem garantia de estar completo.', { falta: 'Confirmar se todos os custos fixos estão registados.' }),
  m('F03', 'BFV', 'Desvio face a orçamento e previsão', 'Budget and Forecast Variance', 'financeiro', 'inativo', 'Diferença entre realizado, orçamento e previsão.', 'Realizado − orçamento; realizado − previsão', 'Favorável depende da métrica, não do sinal.'),
  m('F04', 'CL', 'Caixa livre e folga', 'Unrestricted Cash and Liquidity Headroom', 'financeiro', 'sem_registo', 'Dinheiro realmente livre da empresa, acima da reserva.', 'Saldo − fundos afetos; folga = caixa livre − reserva', 'Capital de investidores não é caixa livre.', { falta: 'Registar o saldo da CGD e as afetações (pendente por decisão do CEO).' }),
  m('F05', 'RW', 'Autonomia financeira', 'Runway', 'financeiro', 'sem_registo', 'Quantos meses a empresa aguenta com a caixa livre.', 'Caixa livre ÷ consumo mensal', 'Sem saldo não há runway. O valor anterior usava lucro por receber.', { ...consagrada, falta: 'Registar o saldo da CGD e as afetações (pendente por decisão do CEO).' }),
  m('F06', '13W', 'Previsão de tesouraria a 13 semanas', '13-Week Cash Flow Forecast', 'financeiro', 'inativo', 'Saldo previsto semana a semana.', 'Saldo inicial + entradas − saídas', 'Não usado: a previsão acordada é mensal.'),
  m('F07', 'VEN', 'Recebimentos vencidos', 'Overdue Receivables', 'financeiro', 'parcial', 'Valores que já deviam ter sido recebidos.', 'Soma das tranches vencidas e não recebidas', 'Componentes ainda não exigíveis não são dívida.', { falta: 'Registar o valor final do T2 Condeixa e a data da escritura.' }),
  m('F08', 'CFV', 'Desvio da previsão de caixa', 'Cash Forecast Variance', 'financeiro', 'inativo', 'Diferença entre saldo efetivo e previsto.', 'Saldo efetivo − previsto', 'Desvios repetidos revelam factos por registar.'),
  m('W01', 'FEE', 'Faturação real', 'Fee Received', 'financeiro', 'parcial', 'O que a Somnium já recebeu em tranches.', 'Soma das tranches recebidas', 'Não é lucro líquido.', { falta: 'Separar fee prevista, contratada e recebida.' }),
  m('W02', 'FCR', 'Taxa de cobrança de fees', 'Fee Collection Rate', 'financeiro', 'inativo', 'Parte dos valores exigíveis que foi recebida.', 'Recebido ÷ exigível', 'Usar universos compatíveis.'),
  m('W03', 'ACR', 'Ciclo e conclusão de cedências', 'Assignment Cycle and Completion Rate', 'obras', 'inativo', 'Prazo de cedência e cedências concluídas.', 'Dias entre eventos; concluídas ÷ com desfecho', 'Cedência concluída não é negócio fechado.'),
  m('W04', 'CEE', 'Exposição a prazos contratuais', 'Contract Expiry Exposure', 'obras', 'medido', 'Operações com prazos próximos e condições por cumprir.', 'Prazos abertos vencidos e nos próximos 30 dias', 'Priorizar pela consequência contratual. Os prazos registam-se na ficha do projeto.'),
]

// Onde cada indicador por medir aparece, por departamento e subdivisão.
export const POR_MEDIR = {
  comercial:  {},
  obras:      { projetos: ['O04'] },
  financeiro: { caixa: ['F04', 'F05', 'G33'], capital: ['G38'], rentabilidade: ['P07'] },
}

const POR_ID = new Map(CATALOGO.map(x => [x.id, x]))
export const metrica = (id) => POR_ID.get(id)

export function pesquisar(texto) {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = norm(texto).trim()
  if (!q) return CATALOGO
  return CATALOGO.filter(x => norm(`${x.id} ${x.sigla} ${x.nome} ${x.nomeEn} ${x.explicacao}`).includes(q))
}
