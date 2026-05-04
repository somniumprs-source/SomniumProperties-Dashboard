/**
 * Configuração declarativa das secções do orçamento de obra (v2 — auditável fiscalmente).
 *
 * Cada secção controla:
 *   - inputs operacionais (tipo de campos)
 *   - taxa IVA por defeito (do regime fiscal global) e override por secção
 *   - flag autoliquidação (al. j) art 2º CIVA — entre sujeitos passivos)
 *   - flag retenção IRS (prestador singular cat B)
 *
 * Tipos:
 *   'fixed', 'por_piso', 'mixto', 'unitario', 'capoto', 'rcd',
 *   'estrutura', 'avac', 'isolamento', 'casas_banho_detalhada',
 *   'cozinhas_detalhada', 'eletricidade_detalhada', 'pintura_completa',
 *   'cobertura_detalhada', 'licenciamento_completo'
 */

export { REGIMES_FISCAIS, TAXAS_IVA, RETENCOES_IRS } from '../../db/orcamentoObraEngine.js'

export const SECCOES = [
  {
    key: 'demolicoes',
    label: 'Demolições e limpeza',
    icon: '🔨',
    tipo: 'fixed',
    grupo: 'obra',
    suporta_autoliq: true,
    campos: [
      { key: 'entulhos',         label: 'Entrega de entulhos',          sufixo: '€' },
      { key: 'remocao_dias',     label: 'Remoção e transporte — dias',  sufixo: 'dias' },
      { key: 'remocao_eur_dia',  label: 'Remoção — €/dia',              sufixo: '€/dia' },
      { key: 'nivel_m2',         label: 'Nivelamento — área',           sufixo: 'm²' },
      { key: 'nivel_altura',     label: 'Nivelamento — altura caixa',   sufixo: 'm' },
      { key: 'nivel_eur_m3',     label: 'Nivelamento — €/m³',           sufixo: '€/m³' },
      { key: 'limpeza_dias',     label: 'Limpeza — dias',               sufixo: 'dias' },
      { key: 'limpeza_eur_dia',  label: 'Limpeza — €/dia',              sufixo: '€/dia' },
      { key: 'paredes_dias',     label: 'Demolição paredes/roços — dias', sufixo: 'dias' },
      { key: 'paredes_eur_dia',  label: 'Demolição — €/dia',            sufixo: '€/dia' },
    ],
  },

  {
    key: 'rcd',
    label: 'RCD — Resíduos (DL 102-D/2020)',
    icon: '♻️',
    tipo: 'fixed',
    grupo: 'obra',
    nota: 'Plano de prevenção e gestão de RCD obrigatório. Transporte por operador licenciado.',
    campos: [
      { key: 'inerte_m3',     label: 'Inertes — m³',           sufixo: 'm³' },
      { key: 'inerte_eur_m3', label: 'Inertes — €/m³',         sufixo: '€/m³' },
      { key: 'misto_m3',      label: 'Mistos — m³',            sufixo: 'm³' },
      { key: 'misto_eur_m3',  label: 'Mistos — €/m³',          sufixo: '€/m³' },
      { key: 'perigoso_m3',   label: 'Perigosos — m³',         sufixo: 'm³' },
      { key: 'perigoso_eur_m3', label: 'Perigosos — €/m³',     sufixo: '€/m³' },
      { key: 'plano_gestao',  label: 'Plano de gestão de RCD', sufixo: '€' },
    ],
  },

  {
    key: 'estrutura',
    label: 'Estrutura (lajes, vigas, pilares)',
    icon: '🏗️',
    tipo: 'fixed',
    grupo: 'obra',
    suporta_autoliq: true,
    campos: [
      { key: 'lajes',         label: 'Substituição/reforço de lajes',  sufixo: '€' },
      { key: 'vigamentos',    label: 'Vigamentos / barrotes madeira',  sufixo: '€' },
      { key: 'pilares',       label: 'Reforço de pilares',             sufixo: '€' },
      { key: 'escadas',       label: 'Escadas interiores',             sufixo: '€' },
      { key: 'paredes_novas', label: 'Construção paredes novas',       sufixo: '€' },
      { key: 'outros',        label: 'Outros trabalhos estruturais',   sufixo: '€' },
    ],
  },

  {
    key: 'eletricidade',
    label: 'Eletricidade e canalização',
    icon: '⚡',
    tipo: 'mixto',
    grupo: 'obra',
    suporta_autoliq: true,
    campos_piso: [
      { key: 'eur_m2', label: '€/m² (modo simples)', sufixo: '€/m²', placeholder: '70' },
    ],
    nota: 'Modo simples (€/m² por piso) ou detalhado (sub-linhas abaixo). Pode usar os dois.',
    campos: [
      { key: 'rede_electrica', label: 'Rede eléctrica + quadro QE',     sufixo: '€' },
      { key: 'ited',           label: 'ITED (telecomunicações)',        sufixo: '€' },
      { key: 'agua_fria',      label: 'Canalização água fria',          sufixo: '€' },
      { key: 'agua_quente',    label: 'Canalização AQ + AQS',           sufixo: '€' },
      { key: 'esgotos',        label: 'Esgotos prediais',               sufixo: '€' },
      { key: 'gas',            label: 'Rede de gás',                    sufixo: '€' },
    ],
  },

  {
    key: 'avac',
    label: 'AVAC / Solar / AQS',
    icon: '🔆',
    tipo: 'fixed',
    grupo: 'obra',
    nota: 'Obrigatório para passar SCE (REH).',
    campos: [
      { key: 'split_un',          label: 'Splits — nº',                 sufixo: 'un' },
      { key: 'split_eur_un',      label: 'Splits — €/un',               sufixo: '€/un' },
      { key: 'bomba_calor',       label: 'Bomba de calor (AQS)',        sufixo: '€' },
      { key: 'solar_termico',     label: 'Painéis solares térmicos',    sufixo: '€' },
      { key: 'fotovoltaico_kwp',  label: 'Fotovoltaico — kWp',          sufixo: 'kWp' },
      { key: 'fotovoltaico_eur_kwp', label: 'Fotovoltaico — €/kWp',     sufixo: '€/kWp' },
      { key: 'recuperador',       label: 'Recuperador / lareira',       sufixo: '€' },
      { key: 'outros_avac',       label: 'Outros (AC central, dutado)', sufixo: '€' },
    ],
  },

  {
    key: 'pavimento',
    label: 'Pavimento',
    icon: '⬜',
    tipo: 'por_piso',
    grupo: 'obra',
    suporta_autoliq: true,
    campos_piso: [
      { key: 'tipo',   label: 'Tipo',     opcoes: ['mosaico', 'soalho a recuperar', 'flutuante', 'laminado', 'vinílico', 'pedra natural'] },
      { key: 'eur_m2', label: '€/m²',     sufixo: '€/m²' },
    ],
  },

  {
    key: 'pladur',
    label: 'Pladur tetos (placa + isolamento + perfis + MO)',
    icon: '◾',
    tipo: 'por_piso',
    grupo: 'obra',
    suporta_autoliq: true,
    campos_piso: [
      { key: 'eur_m2', label: '€/m²', sufixo: '€/m²' },
    ],
  },

  {
    key: 'isolamento',
    label: 'Isolamento térmico/acústico (REH)',
    icon: '🧊',
    tipo: 'fixed',
    grupo: 'obra',
    nota: 'REH/RECS exige isolamento em fachada, cobertura e pavimentos sobre exterior.',
    campos: [
      { key: 'fachada_m2',      label: 'Fachada — m²',           sufixo: 'm²' },
      { key: 'fachada_eur_m2',  label: 'Fachada — €/m²',         sufixo: '€/m²' },
      { key: 'cobertura_m2',    label: 'Cobertura — m²',         sufixo: 'm²' },
      { key: 'cobertura_eur_m2', label: 'Cobertura — €/m²',      sufixo: '€/m²' },
      { key: 'pavimento_m2',    label: 'Pavimento s/ exterior — m²', sufixo: 'm²' },
      { key: 'pavimento_eur_m2', label: 'Pavimento — €/m²',      sufixo: '€/m²' },
      { key: 'acustico_m2',     label: 'Acústico — m²',          sufixo: 'm²' },
      { key: 'acustico_eur_m2', label: 'Acústico — €/m²',        sufixo: '€/m²' },
    ],
  },

  {
    key: 'caixilharias',
    label: 'Caixilharias (alumínio + corte térmico + vidro duplo)',
    icon: '🪟',
    tipo: 'mixto',
    grupo: 'obra',
    suporta_autoliq: true,
    campos_piso: [
      { key: 'n_janelas',      label: 'Nº janelas',     sufixo: 'un' },
      { key: 'area_janela_m2', label: 'm²/janela',      sufixo: 'm²', placeholder: '1.5' },
      { key: 'eur_m2',         label: '€/m²',           sufixo: '€/m²', placeholder: '450' },
    ],
    campos: [
      { key: 'cb_un',           label: 'Janelas CB — nº',          sufixo: 'un' },
      { key: 'cb_eur_un',       label: 'Janelas CB — €/un',        sufixo: '€/un' },
      { key: 'pedreiro',        label: 'Trabalho pedreiro',        sufixo: '€' },
      { key: 'soleiras_un',     label: 'Soleiras — nº',            sufixo: 'un' },
      { key: 'soleiras_eur_un', label: 'Soleiras — €/un',          sufixo: '€/un' },
    ],
  },

  {
    key: 'vmc',
    label: 'Sistema VMC',
    icon: '💨',
    tipo: 'por_piso',
    grupo: 'obra',
    campos_piso: [
      { key: 'base', label: 'Base (sem IVA)', sufixo: '€' },
    ],
  },

  {
    key: 'pintura',
    label: 'Pintura (interior + exterior)',
    icon: '🎨',
    tipo: 'mixto',
    grupo: 'obra',
    suporta_autoliq: true,
    campos_piso: [
      { key: 'm2_paredes', label: 'm² paredes', sufixo: 'm²' },
      { key: 'm2_teto',    label: 'm² teto',    sufixo: 'm²' },
      { key: 'eur_m2',     label: '€/m² interior', sufixo: '€/m²', placeholder: '15' },
    ],
    campos: [
      { key: 'exterior_m2',     label: 'Pintura exterior — m²',       sufixo: 'm²' },
      { key: 'exterior_eur_m2', label: 'Pintura exterior — €/m²',     sufixo: '€/m²', placeholder: '25' },
    ],
  },

  {
    key: 'casas_banho',
    label: 'Casas de banho (separar mat / MO)',
    icon: '🚿',
    tipo: 'fixed',
    grupo: 'obra',
    suporta_autoliq: true,
    campos: [
      { key: 'un',                 label: 'Nº casas de banho',        sufixo: 'un' },
      { key: 'loucas_eur_un',      label: 'Louças + torneiras €/un',  sufixo: '€/un' },
      { key: 'cer_mat_eur_un',     label: 'Cerâmicos + materiais €/un', sufixo: '€/un' },
      { key: 'mo_eur_un',          label: 'MO (canal. + assent.) €/un', sufixo: '€/un' },
      { key: 'mobiliario_eur_un',  label: 'Mobiliário + espelho €/un', sufixo: '€/un' },
    ],
  },

  {
    key: 'portas',
    label: 'Portas',
    icon: '🚪',
    tipo: 'unitario',
    grupo: 'obra',
    valida_aritmetica: true,
    campos: [
      { key: 'un',     label: 'Nº portas',                sufixo: 'un' },
      { key: 'eur_un', label: '€/un (com aplicação)',     sufixo: '€/un', placeholder: '175' },
    ],
  },

  {
    key: 'cozinhas',
    label: 'Cozinhas (móveis + bancada + electro + MO)',
    icon: '🍳',
    tipo: 'fixed',
    grupo: 'obra',
    suporta_autoliq: true,
    campos: [
      { key: 'un',                label: 'Nº cozinhas',             sufixo: 'un' },
      { key: 'moveis_eur_un',     label: 'Móveis €/un',             sufixo: '€/un' },
      { key: 'bancada_eur_un',    label: 'Bancada €/un',            sufixo: '€/un' },
      { key: 'electro_eur_un',    label: 'Electrodomésticos €/un',  sufixo: '€/un' },
      { key: 'mo_eur_un',         label: 'MO instalação €/un',      sufixo: '€/un' },
    ],
  },

  {
    key: 'capoto',
    label: 'Capoto / ETICS exterior',
    icon: '🧱',
    tipo: 'fixed',
    grupo: 'obra',
    suporta_autoliq: true,
    nota: 'Calcular m² de fachada líquido (já descontados vãos).',
    campos: [
      { key: 'fachada_m2_liquido', label: 'm² fachada (líquido vãos)', sufixo: 'm²' },
      { key: 'eur_m2',             label: '€/m² ETICS',                sufixo: '€/m²', placeholder: '55' },
      { key: 'remates_m',          label: 'Remates — metros lineares', sufixo: 'm' },
      { key: 'remates_eur_m',      label: 'Remates — €/m',             sufixo: '€/m' },
      { key: 'andaime_m2',         label: 'Andaime — m²',              sufixo: 'm²' },
      { key: 'andaime_eur_m2_mes', label: 'Andaime — €/m²·mês',        sufixo: '€/m²·mês', placeholder: '6' },
      { key: 'andaime_meses',      label: 'Andaime — meses',           sufixo: 'meses' },
    ],
  },

  {
    key: 'cobertura',
    label: 'Cobertura',
    icon: '🏠',
    tipo: 'fixed',
    grupo: 'obra',
    suporta_autoliq: true,
    campos: [
      { key: 'm2',     label: 'Área cobertura',  sufixo: 'm²' },
      { key: 'eur_m2', label: '€/m²',            sufixo: '€/m²', placeholder: '150' },
    ],
  },

  {
    key: 'licenciamento',
    label: 'Licenciamento, fiscalização e seguros',
    icon: '📋',
    tipo: 'licenciamento_completo',
    grupo: 'extra',
    isLicenciamento: true,
    nota: 'Taxas municipais e seguros não têm IVA. Honorários: IVA 23% + retenção 25% se prestador singular.',
    campos: [
      { key: 'projeto',          label: 'Projecto especialidade/arquitectura', sufixo: '€', acompanha_singular: true },
      { key: 'tro',              label: 'TRO — Técnico Responsável de Obra',   sufixo: '€', acompanha_singular: true },
      { key: 'fiscalizacao',     label: 'Fiscalização (valor fixo)',           sufixo: '€' },
      { key: 'fiscalizacao_perc', label: '— ou % sobre base obra',             sufixo: '%' },
      { key: 'seguro_car',       label: 'Seguro CAR (isento)',                 sufixo: '€' },
      { key: 'taxas_municipais', label: 'Taxas municipais (sem IVA)',          sufixo: '€' },
      { key: 'solicitador',      label: 'Solicitador / registos',              sufixo: '€', acompanha_singular: true },
      { key: 'livro_obra',       label: 'Livro de obra + alvará (taxas)',      sufixo: '€' },
      { key: 'sce',              label: 'Certificado energético (SCE)',        sufixo: '€', acompanha_singular: true },
    ],
  },
]

export const PISO_PRESETS = ['R/C', '1º Andar', '2º Andar', '3º Andar', 'Sótão', 'Cave']
