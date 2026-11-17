// Dados FICTÍCIOS para testar a preparação de chamada (SOP 23). Nenhum é real.
export const AGORA = new Date('2026-11-17T15:00:00Z') // 15:00 em Lisboa

const base = {
  telemovel: '+351 910 000 000', email: 'teste@exemplo.pt', capital_min: null, capital_max: null,
  experiencia_imobiliario: null, decisores: null, motivacao: null, scorecard_discovery: null,
}

export const CASOS = {
  // 1. Lead do formulário só com nome e contacto, entrou há 2 horas (o webhook põe-na em Pendente de Aprovação).
  formulario_curto: {
    investidor: { ...base, id: 'f1', nome: 'Rui Teste', status: 'Pendente de Aprovação', origem: 'Landing Page', created_at: '2026-11-17T13:00:00Z' },
    interacoes: [], gravacoes: [], reunioes: [], blocos: [], ocupados: [], oportunidades: [], proximaTarefa: null,
  },

  // 2. Follow Up, Chamada 1 feita, montante de 50 a 200 mil.
  follow_up_passivo: {
    investidor: {
      ...base, id: 'f2', nome: 'Carla Exemplo', status: 'Follow Up', origem: 'Skool', created_at: '2026-09-10T10:00:00Z',
      capital_min: 80000, capital_max: 120000, experiencia_imobiliario: 'Nunca investiu', decisores: 'Decide sozinha',
      capital_disponivel_em: 'Depende da venda de um apartamento, sem data', data_follow_up: '2026-11-16',
      data_ultimo_contacto: '2026-09-17',
      scorecard_discovery: { capital: { nota: 0, evidencia: 'Capital depende da venda de um apartamento sem data' }, experiencia: { nota: 1, evidencia: 'Nunca investiu, mostrou abertura' }, decisor: { nota: 2, evidencia: 'Decide sozinha' }, preenchido_em: '2026-09-18T09:00:00Z', preenchido_por: 'João Abreu' },
    },
    interacoes: [
      { canal: 'Chamada', direcao: 'Enviado', data_hora: '2026-09-17T14:00:00Z', resultado: 'Feito', autor: 'João Abreu', notas: 'Chamada 1. Disse: "Só consigo avançar quando vender o apartamento de Leiria." Follow Up intermédio.' },
    ],
    gravacoes: [{ tipo_chamada: 'cold_call', data_chamada: '2026-09-17T14:00:00Z', resultado: 'atendeu', temperatura: 'intermedio', realizada_por: 'João Abreu', proximo_passo: 'follow_up_agendado' }],
    reunioes: [], blocos: [], ocupados: [], oportunidades: [], proximaTarefa: null,
  },

  // 3. Discovery marcada, outro decisor identificado.
  discovery_decisor: {
    investidor: {
      ...base, id: 'f3', nome: 'Pedro Ficticio', status: 'Discovery call marcada', origem: 'Eventos Networking', created_at: '2026-11-05T10:00:00Z',
      capital_min: 250000, capital_max: 300000, experiencia_imobiliario: '1 a 2 imóveis', decisores: 'Partilhado com a mulher (Marta)',
      capital_disponivel_em: 'Disponível hoje', tipo_principal: 'Ativo',
    },
    interacoes: [
      { canal: 'Chamada', direcao: 'Enviado', data_hora: '2026-11-14T11:00:00Z', resultado: 'Feito', autor: 'Alexandre Mendes', notas: 'Chamada 1 feita. Disse: "Tenho de falar com a minha mulher antes de decidir qualquer coisa." Discovery marcada para 18/11 às 10:00, ficou de confirmar se a mulher vem.' },
    ],
    gravacoes: [], reunioes: [], blocos: [], ocupados: [], oportunidades: [],
    proximaTarefa: { inicio: '2026-11-18T10:00', tarefa: 'Discovery Call com Pedro Ficticio' },
  },

  // 4. Negociação de Deal: fora do SOP 23.
  negociacao: {
    investidor: { ...base, id: 'f4', nome: 'Ana Ficticia', status: 'Negociação de Deal', origem: 'Referenciação', created_at: '2026-10-01T10:00:00Z' },
    interacoes: [], gravacoes: [], reunioes: [], blocos: [], ocupados: [], oportunidades: [], proximaTarefa: null,
  },
}
