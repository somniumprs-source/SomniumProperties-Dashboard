// @ts-nocheck
/**
 * Templates profissionais de fases e tarefas para projetos Fix and Flip.
 * Usados na auto-criação quando um negócio é criado com categoria = "Fix and Flip".
 * Ordem reflete sequência real de obra de reabilitação em Portugal (ARU/IVA 6%).
 */

export const FASES_FIX_FLIP = [
  {
    key: 'aquisicao',
    nome: 'Aquisição',
    icon: '🔑',
    cor: '#6366f1',
    descricao: 'Escritura, registos, capital de investidores, encargos e seguros',
    tarefas: [
      'Confirmação da transferência de capital dos investidores para a compra',
      'Verificação de certificado energético existente',
      'Confirmação de ónus e encargos / distrate de hipoteca',
      'Levantamento de dívidas associadas (condomínio, IMI, água, luz)',
      'Pagamento IMT/IS e taxas',
      'Escritura de compra e venda',
      'Registo predial e fiscal',
      'Transferência de titularidade dos contratos de serviços (água, luz, gás)',
      'Contratação de seguro multirriscos do imóvel',
    ],
  },
  {
    key: 'projeto_licenca',
    nome: 'Projeto & Licença',
    icon: '📐',
    cor: '#0ea5e9',
    descricao: 'Levantamento, arquitetura, especialidades, comunicação prévia/licença',
    tarefas: [
      'Levantamento dimensional do imóvel',
      'Pedido de plantas ao arquivo municipal',
      'Contratar arquitetura (proposta + ARU se aplicável)',
      'Projeto de arquitetura aprovado pelo cliente',
      'Projetos de especialidades (térmico, acústico, eléctrico, ITED, gás, AQS)',
      'Submeter pedido na câmara (comunicação prévia ou licença)',
      'Pagamento de taxas municipais',
      'Designação do TRO (Técnico Responsável de Obra)',
      'Alvará/aceitação emitido',
      'Apresentar livro de obra',
    ],
  },
  {
    key: 'demolicoes',
    nome: 'Demolições',
    icon: '🔨',
    cor: '#ef4444',
    descricao: 'Fotos estado zero, estaleiro, picagens, RCD, limpezas',
    tarefas: [
      'Fotografias do estado zero (todas as divisões)',
      'Montagem de estaleiro (vedação, contentor WC, sinalização, placa)',
      'Ligações provisórias (água + luz)',
      'Plano de gestão de RCD (DL 102-D/2020)',
      'Picagem de paredes e tetos',
      'Demolição de divisórias',
      'Remoção de pavimentos antigos',
      'Remoção de canalizações e cablagens obsoletas',
      'Transporte de entulho por operador licenciado (guias)',
      'Limpeza geral pós-demolição',
    ],
  },
  {
    key: 'estrutura_especialidades',
    nome: 'Estrutura & Especialidades',
    icon: '⚡',
    cor: '#f59e0b',
    descricao: 'Tosco, alvenarias, eléctrica, canalização, AVAC, gás, ITED',
    tarefas: [
      'Reforço/alterações estruturais (lajes, vigas, pilares)',
      'Alvenarias novas e remates',
      'Rede eléctrica completa + quadro',
      'Rede de águas (fria, AQS, esgotos)',
      'Pré-instalação AVAC (splits) e VMC',
      'Rede de gás (se aplicável)',
      'Pré-instalação ITED (rede dados)',
      'Isolamentos térmicos e acústicos (REH)',
      'Impermeabilizações (terraços, WC, muros)',
      'Ensaio de pressão de águas',
    ],
  },
  {
    key: 'acabamentos',
    nome: 'Acabamentos',
    icon: '🎨',
    cor: '#10b981',
    descricao: 'Rebocos, betonilhas, pladur, pavimentos, WC, cozinhas, pinturas',
    tarefas: [
      'Rebocos e estuques',
      'Betonilhas de regularização',
      'Pladur de tetos',
      'Aplicação de pavimentos',
      'Cerâmicos e louças em casas de banho',
      'Móveis e bancada de cozinha + electrodomésticos',
      'Carpintarias (rodapés, aros, roupeiros)',
      'Portas interiores',
      'Serralharias interiores',
      'Pintura interior (preparação + acabamento)',
    ],
  },
  {
    key: 'exterior_fecho',
    nome: 'Exterior & Fecho',
    icon: '🏠',
    cor: '#8b5cf6',
    descricao: 'Capoto, cobertura, caixilharias, ensaios, licença utilização',
    tarefas: [
      'Capoto / ETICS exterior',
      'Cobertura (estrutura + telha + remates)',
      'Caixilharias exteriores',
      'Pintura exterior',
      'Serralharias exteriores (gradeamentos, guardas, portões)',
      'Ensaios finais (gás, água, eléctrica, infiltrometria)',
      'Certificação energética final (SCE)',
      'Ficha Técnica da Habitação (FTH)',
      'Telas finais (as-built)',
      'Vistoria final da câmara',
      'Licença de utilização emitida',
      'Limpeza pós-obra',
    ],
  },
  {
    key: 'comercializacao',
    nome: 'Comercialização',
    icon: '📣',
    cor: '#ec4899',
    descricao: 'Staging, fotos profissionais, marketing, mediação',
    tarefas: [
      'Home staging (mobiliário/decoração)',
      'Sessão fotográfica profissional',
      'Tour virtual / vídeo',
      'Memória descritiva de acabamentos',
      'Listing em portais (Idealista, Imovirtual, Casa Sapo)',
      'Plano de marketing digital',
      'Visitas e qualificação de propostas',
      'Negociação e CPCV',
    ],
  },
  {
    key: 'vendido',
    nome: 'Vendido',
    icon: '✅',
    cor: '#22c55e',
    descricao: 'Escritura, distribuição CAEP, relatório final',
    tarefas: [
      'Escritura de venda',
      'Liquidação de despesas pendentes (empreiteiros, fornecedores)',
      'Reconciliação financeira final',
      'Cálculo de TIR realizada',
      'Distribuição de capital + lucro a investidores CAEP',
      'Relatório de saída para investidores',
      'Arquivo do dossier completo',
    ],
  },
]

export const FASE_KEYS = FASES_FIX_FLIP.map(f => f.key)

export function getFaseConfig(key) {
  return FASES_FIX_FLIP.find(f => f.key === key)
}

// CAEP partilha o mesmo workflow operacional do Fix and Flip
export const FASES_CAEP = FASES_FIX_FLIP

// Fluxo Wholesalling: alinhar investidor antes de comprometer a compra.
// Procurar Investidor → Negociação → CPCV de Compra → CPCV de Cedência → Fee Recebido
export const FASES_WHOLESALLING = [
  {
    key: 'procurar_investidor',
    nome: 'Procurar Investidor Ativo',
    icon: '🔎',
    cor: '#5F4D20',
    descricao: 'Match com pool de investidores Somnium',
    tarefas: [
      'Filtrar investidores activos compatíveis',
      'Preparar dossier do deal (compra c/ fee + análise completa)',
      'Apresentar oportunidade',
      'Recolher manifestações de interesse',
    ],
  },
  {
    key: 'negociacao_investidor',
    nome: 'Negociação Investidor Ativo',
    icon: '💬',
    cor: '#C9A84C',
    descricao: 'Termos, fee, calendarização',
    tarefas: [
      'Negociar/definir fee de cedência (Somnium)',
      'Formalizar acordo de intenção/reserva',
      'Acordar timing da escritura',
      'Confirmar capacidade financeira do investidor',
    ],
  },
  {
    key: 'cpcv_compra',
    nome: 'CPCV de Compra',
    icon: '📝',
    cor: '#7C2D40',
    descricao: 'Contrato promessa com o proprietário',
    tarefas: [
      'Redigir CPCV',
      'Validar cláusulas (prazo, sinal, cessão)',
      'Pagamento de sinal',
      'Assinatura CPCV com vendedor',
    ],
  },
  {
    key: 'cpcv_cedencia',
    nome: 'CPCV de Cedência',
    icon: '✍️',
    cor: '#D5B65A',
    descricao: 'Cessão de posição contratual ao investidor',
    tarefas: [
      'Redigir cessão de posição',
      'Assinatura tripartida (Somnium + vendedor + investidor)',
      'Registo da cessão',
      'Recebimento do investidor (reembolso de sinal + fee)',
    ],
  },
  {
    key: 'fee_recebido',
    nome: 'Fee Recebido',
    icon: '💰',
    cor: '#0d0d0d',
    descricao: 'Finder fee liquidada',
    tarefas: [
      'Emitir factura',
      'Confirmar recebimento do fee',
      'Reconciliar com financeiro',
      'Arquivo do dossier',
    ],
  },
]

export const FASES_MEDIACAO = [
  {
    key: 'captacao',
    nome: 'Captação',
    icon: '📋',
    cor: '#475569',
    descricao: 'Angariação do imóvel e contrato de mediação',
    tarefas: [
      'Visita de captação',
      'Avaliação comercial (CMA)',
      'Assinatura contrato de mediação',
      'Validar documentação (CE, FTH, planta)',
    ],
  },
  {
    key: 'preparacao_imovel',
    nome: 'Preparação do Imóvel',
    icon: '🛠️',
    cor: '#1F4E5F',
    descricao: 'Limpeza, home staging, preparação para visitas',
    tarefas: [
      'Limpeza / arranjos pré-fotos',
      'Home staging (se aplicável)',
      'Sessão fotográfica profissional',
      'Memória descritiva e ficha técnica',
    ],
  },
  {
    key: 'publicacao',
    nome: 'Publicação & Divulgação',
    icon: '🌐',
    cor: '#5F4D20',
    descricao: 'Anúncios em portais e marketing digital',
    tarefas: [
      'Publicar Idealista / Imovirtual / Casa Sapo',
      'Listing no site Somnium',
      'Campanha redes sociais',
      'Partilha com rede de consultores',
    ],
  },
  {
    key: 'visitas',
    nome: 'Visitas',
    icon: '👀',
    cor: '#866B2D',
    descricao: 'Agendamento e qualificação de interessados',
    tarefas: [
      'Triagem de pedidos',
      'Agendar visitas',
      'Acompanhar visitas',
      'Follow-up pós-visita',
    ],
  },
  {
    key: 'propostas',
    nome: 'Propostas',
    icon: '💬',
    cor: '#C9A84C',
    descricao: 'Recepção e negociação de ofertas',
    tarefas: [
      'Recolher proposta formal',
      'Validar capacidade financeira',
      'Negociar valor e condições',
      'Aceitação pelo vendedor',
    ],
  },
  {
    key: 'cpcv',
    nome: 'CPCV',
    icon: '📝',
    cor: '#D5B65A',
    descricao: 'Contrato promessa entre comprador e vendedor',
    tarefas: [
      'Redigir CPCV',
      'Pagamento de sinal',
      'Assinatura CPCV',
      'Notificar entidades fiscais (se aplicável)',
    ],
  },
  {
    key: 'escritura',
    nome: 'Escritura',
    icon: '🔑',
    cor: '#0d0d0d',
    descricao: 'Fecho do negócio e liquidação da comissão',
    tarefas: [
      'Marcação de escritura',
      'Assinatura escritura',
      'Emissão factura de comissão',
      'Recebimento e arquivo',
    ],
  },
]

// Mapa de categoria → template de fases
export const FASES_POR_CATEGORIA = {
  'Fix and Flip': FASES_FIX_FLIP,
  'CAEP': FASES_CAEP,
  'Wholesalling': FASES_WHOLESALLING,
  'Mediação Imobiliária': FASES_MEDIACAO,
}

export function getTemplateFases(categoria) {
  return FASES_POR_CATEGORIA[categoria] || null
}

// Lookup global de uma fase em qualquer template (para emails, notificações, etc.)
export function getFaseConfigGlobal(key) {
  for (const tpl of Object.values(FASES_POR_CATEGORIA)) {
    const f = tpl.find(x => x.key === key)
    if (f) return f
  }
  return null
}
