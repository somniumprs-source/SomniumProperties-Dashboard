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

// CAEP: começa com Pré-aquisição (documentação, contrato CAEP e capital dos
// investidores) e uma Aquisição própria (da marcação da escritura à mudança
// de titulares). O CPCV fica no Departamento Comercial: o projeto só nasce com
// proposta aceite e CPCV alinhado. Segue-se a Pré-obra (tarefas opcionais =
// blocos que o Comercial marca) e, das Demolições em diante, o workflow do Fix and Flip.
export const FASES_CAEP = [
  {
    key: 'pre_aquisicao',
    nome: 'Pré-aquisição',
    icon: '📋',
    cor: '#1F4E5F',
    descricao: 'Documentação do imóvel, plano de venda, contrato CAEP e capital dos investidores',
    tarefas: [
      { t: 'Verificação final da documentação do imóvel', checklist: [
        { k: 'caderneta', t: 'Caderneta Predial Urbana', slot: 'caderneta_predial' },
        { k: 'certidao', t: 'Certidão Permanente do Registo Predial', slot: 'certidao_permanente' },
        { k: 'condominio', t: 'Declaração de dívidas do condomínio' },
        { k: 'imi', t: 'Comprovativo de IMI', slot: 'comprovativo_imi' },
        { k: 'agua_luz', t: 'Água e luz sem dívidas' },
        { k: 'ce', t: 'Certificado Energético', slot: 'certificado_energetico' },
        { k: 'licenca', t: 'Licença de Utilização ou isenção', slot: 'licenca_utilizacao' },
      ] },
      // PEV (SOP 14): fecha-se antes da minuta, porque segue para o advogado como Anexo V.
      { t: 'Plano Estratégico de Venda (Anexo V do CAEP)', checklist: [
        { k: 'vvr', t: 'VVR validado com o consultor parceiro' },
        { k: 'precos', t: 'Preço de Lançamento, Preço de Reserva e Limite de Corte definidos' },
        { k: 'escada', t: 'Escada de Preço e prazos definidos' },
        { k: 'kpi', t: 'KPI de procura confirmados com o consultor' },
        { k: 'comissao', t: 'Teto da comissão de mediação fixado' },
        { k: 'aprovacao', t: 'Plano aprovado pelos dois CEO' },
        { k: 'anexo_v', t: 'Plano enviado ao advogado como Anexo V do CAEP' },
      ] },
      { t: 'Recolha e envio da documentação dos investidores ao advogado para a minuta do CAEP', porInvestidor: true, checklist: [
        { k: 'cc', t: 'Cartão de cidadão' },
        { k: 'nif', t: 'NIF' },
        { k: 'morada', t: 'Comprovativo de morada' },
        { k: 'iban', t: 'IBAN' },
        { k: 'origem_fundos', t: 'Declaração de origem dos fundos' },
        { k: 'nda', t: 'NDA' },
        { k: 'risco', t: 'Declaração de risco' },
      ] },
      { t: 'Revisão da minuta do CAEP', checklist: [
        { k: 'parecer', t: 'Parecer do advogado externo arquivado' },
        { k: 'versao', t: 'Versão final da minuta registada' },
        { k: 'investidores', t: 'Minuta revista enviada aos investidores, com recomendação de apreciação jurídica própria' },
      ] },
      'Assinatura do CAEP por todos os intervenientes',
      { t: 'Transferência do capital dos investidores', porInvestidor: true, checklist: [
        { k: 'recebido', t: 'Capital recebido na conta do projeto' },
        { k: 'confirmacao', t: 'Confirmação escrita da receção enviada ao investidor' },
      ] },
      // SOP 12, 8.7: fecha o ciclo de entrada e arranca os reportes periódicos.
      { t: 'Dossiê de Investidor e comunicação de boas-vindas', porInvestidor: true, checklist: [
        { k: 'dossie', t: 'Dossiê consolidado (KYC, NDA, declaração de risco, minutas, parecer, contrato assinado e comprovativo)' },
        { k: 'arquivo', t: 'Dossiê arquivado no CRM com acesso restrito' },
        { k: 'boas_vindas', t: 'Email de boas-vindas com o calendário de reportes e o ponto de contacto' },
        { k: 'rgpd', t: 'Prazo de conservação do dossiê definido (RGPD)' },
      ] },
      'Calendário de obrigações declarativas enviado à contabilista',
    ],
  },
  {
    key: 'aquisicao',
    nome: 'Aquisição',
    icon: '🔑',
    cor: '#6366f1',
    descricao: 'Escritura, impostos, registo e mudança de titulares',
    tarefas: [
      'Marcação da escritura e confirmação do local e hora',
      { t: 'Confirmação da documentação do imóvel no dia da escritura', checklist: [
        { k: 'caderneta', t: 'Caderneta Predial Urbana', slot: 'caderneta_predial' },
        { k: 'certidao', t: 'Certidão Permanente do Registo Predial', slot: 'certidao_permanente' },
        { k: 'ce', t: 'Certificado Energético', slot: 'certificado_energetico' },
        { k: 'licenca', t: 'Licença de Utilização ou isenção', slot: 'licenca_utilizacao' },
        { k: 'condominio', t: 'Declaração de dívidas do condomínio' },
        { k: 'ficha_tecnica', t: 'Ficha Técnica de Habitação', slot: 'ficha_tecnica', obrigatoria: false },
        { k: 'imt_is', t: 'Comprovativos de pagamento do IMT e do IS' },
        { k: 'distrate', t: 'Distrate da hipoteca presente (banco do vendedor ou documento)', obrigatoria: false },
      ] },
      'Pagamento do IMT e do Imposto do Selo',
      'Escritura de compra e venda',
      'Pagamento dos honorários do solicitador ou advogado',
      { t: 'Confirmação do registo predial e fiscal', checklist: [
        { k: 'escritura', t: 'Cópia da escritura' },
        { k: 'certidao', t: 'Certidão permanente: aquisição registada e ónus cancelados (usar o código já comprado)', slot: 'certidao_permanente' },
        { k: 'caderneta', t: 'Caderneta atualizada', slot: 'caderneta_predial' },
      ] },
      { t: 'Mudança de titular dos contratos', checklist: [
        { k: 'agua', t: 'Água' },
        { k: 'eletricidade', t: 'Eletricidade' },
        { k: 'condominio', t: 'Condomínio', obrigatoria: false },
      ] },
    ],
  },
  {
    key: 'pre_obra',
    nome: 'Pré-obra',
    icon: '🧭',
    cor: '#5F4D20',
    descricao: 'Tudo o que tem de estar resolvido antes de a obra começar',
    tarefas: [
      { t: 'Retificação de áreas', opcional: true, checklist: [
        { k: 'modelo1', t: 'Modelo 1 do IMI entregue' },
        { k: 'averbamento', t: 'Averbamento na certidão permanente' },
      ] },
      { t: 'ARU: vistoria inicial do estado de conservação', opcional: true, checklist: [
        { k: 'certidao_aru', t: 'Pedir à solicitadora que inicie o processo de obtenção da certidão ARU e indique o custo associado' },
        { k: 'certidao_emitida', t: 'Certidão ARU emitida', slot: 'certidao_aru' },
        { k: 'pedido', t: 'Pedido de vistoria à câmara' },
        { k: 'auto', t: 'Auto de vistoria com o nível de conservação inicial (antes de qualquer obra)' },
      ] },
      { t: 'Autorização do condomínio', opcional: true, checklist: [
        { k: 'assembleia', t: 'Assembleia de condóminos' },
        { k: 'ata', t: 'Ata com a aprovação' },
      ] },
      { t: 'Legalização: projeto submetido', opcional: true, checklist: [
        { k: 'levantamento', t: 'Levantamento do existente' },
        { k: 'projeto', t: 'Projeto de legalização com o estado final depois da obra' },
        { k: 'submissao', t: 'Submissão na câmara dentro do prazo do PIP' },
        { k: 'taxas', t: 'Pagamento das taxas' },
      ] },
      { t: 'Projeto e licenciamento', opcional: true, checklist: [
        { k: 'arquitetura', t: 'Projeto de arquitetura' },
        { k: 'especialidades', t: 'Projetos de especialidades' },
        { k: 'submissao', t: 'Submissão (comunicação prévia ou licença)' },
        { k: 'taxas', t: 'Pagamento das taxas' },
        { k: 'alvara', t: 'Admissão ou alvará' },
      ] },
      { t: 'Propriedade horizontal', opcional: true, checklist: [
        { k: 'certidao_camara', t: 'Certidão camarária de propriedade horizontal' },
        { k: 'escritura', t: 'Escritura de constituição ou alteração' },
        { k: 'registo', t: 'Registo predial' },
        { k: 'matriz', t: 'Inscrição matricial das frações' },
      ] },
      { t: 'Revisão final da proposta do empreiteiro', checklist: [
        { k: 'vistoria', t: 'Vistoria do empreiteiro ao imóvel' },
        { k: 'medicoes', t: 'Medições e assunções confirmadas' },
        { k: 'nao_incluidos', t: 'Trabalhos não incluídos e quem os assume' },
        { k: 'prazo', t: 'Prazo definido (dias úteis ou de calendário)' },
        { k: 'pagamentos', t: 'Plano de pagamentos' },
        { k: 'proposta_final', t: 'Proposta final revista carregada' },
      ] },
      // Nomes fixos dos dois documentos: «<Projeto> - Visita pré-obra» e
      // «<Projeto> - Relatório visita pré-obra».
      { t: 'Visita pré-obra e relatório', checklist: [
        { k: 'registo', t: 'Folha «Visita pré-obra» preenchida na visita' },
        { k: 'relatorio', t: '«Relatório visita pré-obra» carregado' },
        { k: 'investidores', t: 'Relatório enviado aos investidores' },
      ] },
      { t: 'IVA a 6%', checklist: [
        { k: 'contabilista', t: 'Enquadramento validado pela contabilista (verba, 20% de materiais, autoliquidação)' },
        { k: 'materiais', t: 'Divisão entre materiais e mão de obra obtida' },
        { k: 'clausula', t: 'Cláusula de responsabilidade do IVA no contrato' },
        { k: 'documento', t: 'Documento entregue ao empreiteiro (declaração da câmara, se ARU)' },
      ] },
      { t: 'Contrato de empreitada e pagamento do adiantamento', checklist: [
        { k: 'prazo', t: 'Prazo (dias úteis ou de calendário)' },
        { k: 'pagamentos', t: 'Preço e plano de pagamentos' },
        { k: 'trabalhos_mais', t: 'Trabalhos a mais só com aprovação escrita' },
        { k: 'nao_incluidos', t: 'Trabalhos não incluídos e responsáveis' },
        { k: 'iva', t: 'Cláusula de IVA' },
        { k: 'penalizacoes', t: 'Penalizações por atraso' },
        { k: 'garantias', t: 'Garantias e retenção' },
        { k: 'seguros', t: 'Seguros do empreiteiro' },
        { k: 'alvara', t: 'Alvará do empreiteiro' },
        { k: 'garantia_bancaria', t: 'Garantia bancária do adiantamento (se acordada)', obrigatoria: false },
        { k: 'assinado', t: 'Contrato assinado' },
        { k: 'adiantamento', t: 'Adiantamento pago (depois de assinar)' },
      ] },
      // Base do Estimado vs Real e do alerta de atrasos das fases.
      { t: 'Orçamento base e cronograma da obra', checklist: [
        { k: 'orcamento', t: 'Orçamento interno importado para o projeto' },
        { k: 'rubricas', t: 'Rubricas do Estimado vs Real alinhadas com a proposta final do empreiteiro' },
        { k: 'cronograma', t: 'Datas previstas das fases de obra preenchidas (D1 e fim de obra)' },
      ] },
      { t: 'Consignação da obra e fotografias do estado zero', checklist: [
        { k: 'auto', t: 'Auto de consignação com a data do D1' },
        { k: 'fotos', t: 'Fotografias do estado zero (todas as divisões)' },
        { k: 'chaves', t: 'Entrega das chaves ao empreiteiro (quantas)' },
        { k: 'contadores', t: 'Leitura dos contadores' },
        { k: 'vizinhos', t: 'Comunicação a vizinhos ou condomínio', obrigatoria: false },
        { k: 'investidores', t: 'Data do D1 comunicada aos investidores' },
      ] },
    ],
  },
  ...fasesObraCaep(),
  {
    ...getFaseConfig('comercializacao'),
    descricao: 'Staging, fotografias, lançamento e janelas de redução do PEV',
    tarefas: [
      'Home staging (mobiliário/decoração)',
      'Sessão fotográfica profissional',
      'Tour virtual / vídeo',
      'Memória descritiva de acabamentos',
      { t: 'Lançamento ao mercado conforme o PEV', checklist: [
        { k: 'anuncio', t: 'Anúncio publicado nos portais ao Preço de Lançamento' },
        { k: 'd0', t: 'Data de entrada no mercado registada (início da Janela 0–30 dias)' },
        { k: 'consultor', t: 'Imóvel entregue ao consultor parceiro com o PEV' },
        { k: 'open_house', t: 'Open House agendado para as primeiras semanas' },
      ] },
      'Plano de marketing digital',
      'Visitas e qualificação de propostas',
      relatorioJanela(30),
      relatorioJanela(60),
      { t: 'Limite de Corte atingido: decisão dos dois CEO', opcional: true, checklist: [
        { k: 'relatorio', t: 'Relatório de situação (procura, propostas e custo de retenção)' },
        { k: 'decisao', t: 'Decisão registada pelos dois CEO' },
        { k: 'investidores', t: 'Decisão comunicada aos investidores' },
      ] },
      { t: 'Negociação e CPCV', checklist: [
        { k: 'reserva', t: 'Proposta aceite igual ou acima do Preço de Reserva (abaixo, só com decisão dos dois CEO)' },
        { k: 'cpcv', t: 'CPCV assinado' },
        { k: 'sinal', t: 'Sinal recebido' },
      ] },
    ],
  },
  {
    ...getFaseConfig('vendido'),
    descricao: 'Escritura, prestação de contas aos investidores e balanço do projeto',
    tarefas: [
      'Escritura de venda',
      'Liquidação de despesas pendentes (empreiteiros, fornecedores)',
      'Reconciliação financeira final',
      // SOP 12, 8.8.
      { t: 'Prestação de contas e liquidação ao investidor', porInvestidor: true, checklist: [
        { k: 'mapa', t: 'Relatório de saída (PDF do CRM) com o mapa de receitas e custos' },
        { k: 'suporte', t: 'Documentos de suporte anexados' },
        { k: 'resultado', t: 'Resultado Líquido e montante devido calculados' },
        { k: 'envio', t: 'Prestação de contas enviada ao investidor' },
        { k: 'contestacao', t: 'Prazo de contestação decorrido (ou contestação resolvida)' },
        { k: 'retencao', t: 'Retenção na fonte validada com a contabilista' },
        { k: 'pagamento', t: 'Contribuição e participação nos lucros pagas para o IBAN do contrato' },
        { k: 'comprovativo', t: 'Comprovativo do pagamento final arquivado' },
      ] },
      { t: 'Balanço interno do projeto', checklist: [
        { k: 'evr', t: 'Estimado vs Real final fechado' },
        { k: 'tir', t: 'TIR realizada calculada' },
        { k: 'desvios', t: 'Desvios por rubrica e de prazo explicados' },
        { k: 'licoes', t: 'Lições registadas para as próximas análises' },
      ] },
      'Arquivo do dossier completo',
    ],
  },
]

// Fases de obra do CAEP: as do Fix and Flip, cada uma fechada com medição,
// pagamento e ficha aos investidores. As fotografias do estado zero já estão
// na consignação (Pré-obra); o fim de obra fecha com receção provisória e
// relatório aos investidores.
function fasesObraCaep() {
  const fecho = { t: 'Fecho da fase: medição, pagamento e ficha aos investidores', checklist: [
    { k: 'medicao', t: 'Trabalhos da fase medidos e validados em obra' },
    { k: 'fotos', t: 'Fotografias do fim da fase' },
    { k: 'fatura', t: 'Fatura do empreiteiro carregada, com rubrica', obrigatoria: false },
    { k: 'pagamento', t: 'Pagamento ao empreiteiro feito (se previsto no plano de pagamentos)', obrigatoria: false },
    { k: 'evr', t: 'Estimado vs Real atualizado' },
    { k: 'ficha', t: 'Ficha da fase (PDF do CRM) enviada aos investidores' },
  ] }
  const fimDeObra = [
    { t: 'Receção provisória da obra', checklist: [
      { k: 'auto', t: 'Auto de receção provisória assinado com o empreiteiro' },
      { k: 'defeitos', t: 'Lista de defeitos a corrigir, com prazo' },
      { k: 'pagamento', t: 'Pagamento final ao empreiteiro, com a retenção acordada' },
      { k: 'garantia', t: 'Início do prazo de garantia e da retenção registado' },
    ] },
    { t: 'Relatório de fim de obra aos investidores', checklist: [
      { k: 'fotos', t: 'Fotografias antes e depois' },
      { k: 'evr', t: 'Estimado vs Real da obra' },
      { k: 'prazo', t: 'Prazo real face ao previsto no contrato de empreitada' },
      { k: 'envio', t: 'Relatório enviado aos investidores' },
    ] },
  ]
  return ['demolicoes', 'estrutura_especialidades', 'acabamentos', 'exterior_fecho'].map(key => {
    const f = getFaseConfig(key)
    const tarefas = f.tarefas.filter(t => t !== 'Fotografias do estado zero (todas as divisões)')
    return { ...f, tarefas: key === 'exterior_fecho' ? [...tarefas, ...fimDeObra] : [...tarefas, fecho] }
  })
}

// Relatório de mercado no fim de cada Janela de Redução do PEV (SOP 14).
function relatorioJanela(dias) {
  return { t: `Relatório de mercado aos ${dias} dias e decisão da Janela de Redução`, checklist: [
    { k: 'kpi', t: 'KPI de procura face à meta do PEV (contactos, visitas e propostas)' },
    { k: 'consultor', t: 'Leitura do consultor parceiro' },
    { k: 'decisao', t: 'Decisão: manter o preço ou descer para o degrau seguinte da Escada de Preço' },
    { k: 'aprovacao', t: 'Decisão aprovada pelos dois CEO' },
    { k: 'investidores', t: 'Relatório enviado aos investidores' },
  ] }
}

// Fluxo Wholesaling: alinhar investidor antes de comprometer a compra.
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
      'Proposta de cedência de posição (PDF do CRM) enviada ao investidor',
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
      'Emitir fatura',
      'Confirmar recebimento do fee',
      'Reconciliar com financeiro',
      { t: 'Relatório de fecho do negócio', checklist: [
        { k: 'fee', t: 'Fee recebido face ao fee previsto' },
        { k: 'custos', t: 'Custos do negócio (sinal, honorários e outros)' },
        { k: 'prazo', t: 'Prazo do CPCV de Compra à cedência' },
        { k: 'analise', t: 'Comparação com a análise inicial' },
      ] },
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
      'Emissão fatura de comissão',
      'Recebimento e arquivo',
    ],
  },
]

// Consultoria/Assessoria — honorário fixo; pode incluir gestão da obra do
// cliente (sem capital próprio da Somnium). Keys com prefixo cons_ para não
// colidirem no lookup global (getFaseConfigGlobal).
export const FASES_CONSULTORIA = [
  {
    key: 'cons_proposta',
    nome: 'Proposta e Contrato',
    icon: '📝',
    cor: '#475569',
    descricao: 'Âmbito, honorário e contrato de prestação de serviços',
    tarefas: [
      'Reunião de levantamento de necessidades',
      'Enviar proposta de honorários',
      'Assinatura do contrato de prestação de serviços',
    ],
  },
  {
    key: 'cons_diagnostico',
    nome: 'Diagnóstico',
    icon: '🔍',
    cor: '#1F4E5F',
    descricao: 'Análise da situação do cliente e do imóvel',
    tarefas: [
      'Recolha de documentação do cliente/imóvel',
      'Visita técnica',
      'Relatório de diagnóstico',
    ],
  },
  {
    key: 'cons_plano',
    nome: 'Plano de Ação',
    icon: '🗺️',
    cor: '#5F4D20',
    descricao: 'Recomendações, orçamento e calendário',
    tarefas: [
      'Plano de ação e calendário',
      'Validação do plano com o cliente',
    ],
  },
  {
    key: 'cons_execucao',
    nome: 'Execução / Acompanhamento de Obra',
    icon: '🏗️',
    cor: '#C9A84C',
    descricao: 'Acompanhamento da execução e, se contratada, gestão da obra do cliente',
    tarefas: [
      'Reuniões de acompanhamento com o cliente',
      'Coordenação de fornecedores/empreiteiros (se aplicável)',
      'Relatórios de progresso',
    ],
  },
  {
    key: 'cons_entrega',
    nome: 'Entrega',
    icon: '📦',
    cor: '#2E7D5B',
    descricao: 'Entrega final ao cliente',
    tarefas: [
      'Relatório final / entregáveis',
      'Reunião de fecho com o cliente',
    ],
  },
  {
    key: 'cons_fecho',
    nome: 'Fecho e Faturação',
    icon: '✅',
    cor: '#0d0d0d',
    descricao: 'Faturação do honorário e arquivo',
    tarefas: [
      'Emissão da fatura do honorário',
      'Recebimento e arquivo',
    ],
  },
]

// Mapa de categoria → template de fases
export const FASES_POR_CATEGORIA = {
  'Fix and Flip': FASES_FIX_FLIP,
  'CAEP': FASES_CAEP,
  'Wholesaling': FASES_WHOLESALLING,
  'Mediação Imobiliária': FASES_MEDIACAO,
  'Consultoria/Assessoria': FASES_CONSULTORIA,
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
