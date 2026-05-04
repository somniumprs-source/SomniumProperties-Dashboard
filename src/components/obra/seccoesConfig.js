/**
 * Configuração declarativa das secções do orçamento de obra (v3 — material/MO).
 *
 * Cada secção define:
 *   - inputs operacionais com pares `material` / `mo` quando aplicável
 *   - taxa IVA por defeito (do regime fiscal global) e override por secção
 *   - flag autoliquidação (al. j) art 2º CIVA — entre sujeitos passivos)
 *   - flag retenção IRS (prestador singular cat B)
 *
 * Convenção de nomes:
 *   eur_m2_material / eur_m2_mo  — par que decompõe um agregado por m²
 *   eur_un_material / eur_un_mo  — idem por unidade
 *   eur_m3_material / eur_m3_mo  — idem por m³
 *   {chave}_material / {chave}_mo — par fixo (estrutura, eletricidade sub-linhas)
 *   eur_m2 / eur_un / {chave}    — campos legacy (continuam a funcionar como 'misto')
 *
 * Tipos de secção:
 *   'fixed' — campos fixos não dependem de pisos
 *   'por_piso' — replica campos por piso
 *   'mixto' — fixed + por_piso
 *   'unitario', 'avac', 'capoto', 'licenciamento_completo'
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
      { key: 'nivel_eur_m3_material', label: 'Toutvenant — €/m³ material', sufixo: '€/m³', tipo_fiscal: 'material' },
      { key: 'nivel_eur_m3_mo',       label: 'Toutvenant — €/m³ MO',       sufixo: '€/m³', tipo_fiscal: 'mo' },
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
      { key: 'plano_gestao',  label: 'Plano de gestão de RCD (honorários 23%)', sufixo: '€' },
    ],
  },

  {
    key: 'estrutura',
    label: 'Estrutura (lajes, vigas, pilares)',
    icon: '🏗️',
    tipo: 'fixed',
    grupo: 'obra',
    suporta_autoliq: true,
    nota: 'Para cada item separe material e mão-de-obra (taxa IVA segue regime).',
    campos: [
      { key: 'lajes_material',         label: 'Lajes — material',         sufixo: '€', tipo_fiscal: 'material' },
      { key: 'lajes_mo',               label: 'Lajes — MO',               sufixo: '€', tipo_fiscal: 'mo' },
      { key: 'vigamentos_material',    label: 'Vigamentos — material',    sufixo: '€', tipo_fiscal: 'material' },
      { key: 'vigamentos_mo',          label: 'Vigamentos — MO',          sufixo: '€', tipo_fiscal: 'mo' },
      { key: 'pilares_material',       label: 'Pilares — material',       sufixo: '€', tipo_fiscal: 'material' },
      { key: 'pilares_mo',             label: 'Pilares — MO',             sufixo: '€', tipo_fiscal: 'mo' },
      { key: 'escadas_material',       label: 'Escadas — material',       sufixo: '€', tipo_fiscal: 'material' },
      { key: 'escadas_mo',             label: 'Escadas — MO',             sufixo: '€', tipo_fiscal: 'mo' },
      { key: 'paredes_novas_material', label: 'Paredes novas — material', sufixo: '€', tipo_fiscal: 'material' },
      { key: 'paredes_novas_mo',       label: 'Paredes novas — MO',       sufixo: '€', tipo_fiscal: 'mo' },
      { key: 'outros_material',        label: 'Outros — material',        sufixo: '€', tipo_fiscal: 'material' },
      { key: 'outros_mo',              label: 'Outros — MO',              sufixo: '€', tipo_fiscal: 'mo' },
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
      { key: 'eur_m2_material', label: '€/m² material', sufixo: '€/m²', placeholder: '20', tipo_fiscal: 'material' },
      { key: 'eur_m2_mo',       label: '€/m² MO',       sufixo: '€/m²', placeholder: '50', tipo_fiscal: 'mo' },
    ],
    nota: 'Modo simples (€/m² mat + MO por piso) ou detalhado (sub-linhas abaixo).',
    campos: [
      { key: 'rede_electrica_material', label: 'Rede eléctrica — material', sufixo: '€', tipo_fiscal: 'material' },
      { key: 'rede_electrica_mo',       label: 'Rede eléctrica — MO',       sufixo: '€', tipo_fiscal: 'mo' },
      { key: 'ited_material',           label: 'ITED — material',           sufixo: '€', tipo_fiscal: 'material' },
      { key: 'ited_mo',                 label: 'ITED — MO',                 sufixo: '€', tipo_fiscal: 'mo' },
      { key: 'agua_fria_material',      label: 'Água fria — material',      sufixo: '€', tipo_fiscal: 'material' },
      { key: 'agua_fria_mo',            label: 'Água fria — MO',            sufixo: '€', tipo_fiscal: 'mo' },
      { key: 'agua_quente_material',    label: 'AQ + AQS — material',       sufixo: '€', tipo_fiscal: 'material' },
      { key: 'agua_quente_mo',          label: 'AQ + AQS — MO',             sufixo: '€', tipo_fiscal: 'mo' },
      { key: 'esgotos_material',        label: 'Esgotos — material',        sufixo: '€', tipo_fiscal: 'material' },
      { key: 'esgotos_mo',              label: 'Esgotos — MO',              sufixo: '€', tipo_fiscal: 'mo' },
      { key: 'gas_material',            label: 'Gás — material',            sufixo: '€', tipo_fiscal: 'material' },
      { key: 'gas_mo',                  label: 'Gás — MO',                  sufixo: '€', tipo_fiscal: 'mo' },
    ],
  },

  {
    key: 'avac',
    label: 'AVAC / Solar / AQS',
    icon: '🔆',
    tipo: 'fixed',
    grupo: 'obra',
    nota: 'Equipamentos como material; MO instalação separada.',
    campos: [
      { key: 'split_un',          label: 'Splits — nº',                 sufixo: 'un' },
      { key: 'split_eur_un',      label: 'Splits — €/un (material)',    sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'bomba_calor',       label: 'Bomba de calor (AQS)',        sufixo: '€', tipo_fiscal: 'material' },
      { key: 'solar_termico',     label: 'Painéis solares térmicos',    sufixo: '€', tipo_fiscal: 'material' },
      { key: 'fotovoltaico_kwp',  label: 'Fotovoltaico — kWp',          sufixo: 'kWp' },
      { key: 'fotovoltaico_eur_kwp', label: 'Fotovoltaico — €/kWp',     sufixo: '€/kWp', tipo_fiscal: 'material' },
      { key: 'recuperador',       label: 'Recuperador / lareira',       sufixo: '€', tipo_fiscal: 'material' },
      { key: 'outros_avac',       label: 'Outros equipamentos AVAC',    sufixo: '€', tipo_fiscal: 'material' },
      { key: 'mo_instalacao',     label: 'MO instalação AVAC (agreg.)', sufixo: '€', tipo_fiscal: 'mo' },
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
      { key: 'tipo',           label: 'Tipo',     opcoes: ['mosaico', 'soalho a recuperar', 'flutuante', 'laminado', 'vinílico', 'pedra natural'] },
      { key: 'eur_m2_material', label: '€/m² material', sufixo: '€/m²', placeholder: '31', tipo_fiscal: 'material' },
      { key: 'eur_m2_mo',       label: '€/m² MO',       sufixo: '€/m²', placeholder: '25', tipo_fiscal: 'mo' },
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
      { key: 'eur_m2_material', label: '€/m² material', sufixo: '€/m²', placeholder: '17', tipo_fiscal: 'material' },
      { key: 'eur_m2_mo',       label: '€/m² MO',       sufixo: '€/m²', placeholder: '28', tipo_fiscal: 'mo' },
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
      { key: 'fachada_m2',                  label: 'Fachada — m²',                 sufixo: 'm²' },
      { key: 'fachada_eur_m2_material',     label: 'Fachada — €/m² material',      sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'fachada_eur_m2_mo',           label: 'Fachada — €/m² MO',            sufixo: '€/m²', tipo_fiscal: 'mo' },
      { key: 'cobertura_m2',                label: 'Cobertura — m²',               sufixo: 'm²' },
      { key: 'cobertura_eur_m2_material',   label: 'Cobertura — €/m² material',    sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'cobertura_eur_m2_mo',         label: 'Cobertura — €/m² MO',          sufixo: '€/m²', tipo_fiscal: 'mo' },
      { key: 'pavimento_m2',                label: 'Pavimento s/ ext — m²',        sufixo: 'm²' },
      { key: 'pavimento_eur_m2_material',   label: 'Pavimento — €/m² material',    sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'pavimento_eur_m2_mo',         label: 'Pavimento — €/m² MO',          sufixo: '€/m²', tipo_fiscal: 'mo' },
      { key: 'acustico_m2',                 label: 'Acústico — m²',                sufixo: 'm²' },
      { key: 'acustico_eur_m2_material',    label: 'Acústico — €/m² material',     sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'acustico_eur_m2_mo',          label: 'Acústico — €/m² MO',           sufixo: '€/m²', tipo_fiscal: 'mo' },
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
      { key: 'n_janelas',      label: 'Nº janelas',                  sufixo: 'un' },
      { key: 'area_janela_m2', label: 'm²/janela',                   sufixo: 'm²', placeholder: '1.5' },
      { key: 'eur_m2',         label: '€/m² janela (material)',      sufixo: '€/m²', placeholder: '450', tipo_fiscal: 'material' },
      { key: 'mo_instalacao',  label: 'MO instalação caixilharia (€)', sufixo: '€', tipo_fiscal: 'mo' },
    ],
    campos: [
      { key: 'cb_un',           label: 'Janelas CB — nº',                sufixo: 'un' },
      { key: 'cb_eur_un',       label: 'Janelas CB — €/un (material)',   sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'pedreiro',        label: 'Trabalho pedreiro (MO)',         sufixo: '€', tipo_fiscal: 'mo' },
      { key: 'soleiras_un',     label: 'Soleiras — nº',                  sufixo: 'un' },
      { key: 'soleiras_eur_un', label: 'Soleiras — €/un (material)',     sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'soleiras_mo',     label: 'Soleiras — MO assentamento',     sufixo: '€', tipo_fiscal: 'mo' },
    ],
  },

  {
    key: 'vmc',
    label: 'Sistema VMC',
    icon: '💨',
    tipo: 'por_piso',
    grupo: 'obra',
    campos_piso: [
      { key: 'material', label: 'Material — €',       sufixo: '€', tipo_fiscal: 'material' },
      { key: 'mo',       label: 'MO instalação — €',  sufixo: '€', tipo_fiscal: 'mo' },
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
      { key: 'm2_paredes',      label: 'm² paredes',          sufixo: 'm²' },
      { key: 'm2_teto',         label: 'm² teto',             sufixo: 'm²' },
      { key: 'eur_m2_material', label: '€/m² material',       sufixo: '€/m²', placeholder: '5', tipo_fiscal: 'material' },
      { key: 'eur_m2_mo',       label: '€/m² MO',             sufixo: '€/m²', placeholder: '10', tipo_fiscal: 'mo' },
    ],
    campos: [
      { key: 'exterior_m2',                 label: 'Pintura exterior — m²',       sufixo: 'm²' },
      { key: 'exterior_eur_m2_material',    label: 'Exterior — €/m² material',    sufixo: '€/m²', placeholder: '8', tipo_fiscal: 'material' },
      { key: 'exterior_eur_m2_mo',          label: 'Exterior — €/m² MO',          sufixo: '€/m²', placeholder: '17', tipo_fiscal: 'mo' },
    ],
  },

  {
    key: 'casas_banho',
    label: 'Casas de banho',
    icon: '🚿',
    tipo: 'fixed',
    grupo: 'obra',
    suporta_autoliq: true,
    campos: [
      { key: 'un',                 label: 'Nº casas de banho',                  sufixo: 'un' },
      { key: 'loucas_eur_un',      label: 'Louças + torneiras €/un (material)', sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'cer_mat_eur_un',     label: 'Cerâmicos €/un (material)',          sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'mobiliario_eur_un',  label: 'Mobiliário + espelho €/un (mat.)',   sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'mo_eur_un',          label: 'MO €/un (canal. + assentamento)',    sufixo: '€/un', tipo_fiscal: 'mo' },
    ],
  },

  {
    key: 'portas',
    label: 'Portas',
    icon: '🚪',
    tipo: 'unitario',
    grupo: 'obra',
    suporta_autoliq: true,
    campos: [
      { key: 'un',              label: 'Nº portas',                  sufixo: 'un' },
      { key: 'eur_un_material', label: '€/un material',              sufixo: '€/un', placeholder: '110', tipo_fiscal: 'material' },
      { key: 'eur_un_mo',       label: '€/un MO aplicação',          sufixo: '€/un', placeholder: '65',  tipo_fiscal: 'mo' },
    ],
  },

  {
    key: 'cozinhas',
    label: 'Cozinhas',
    icon: '🍳',
    tipo: 'fixed',
    grupo: 'obra',
    suporta_autoliq: true,
    campos: [
      { key: 'un',                label: 'Nº cozinhas',                       sufixo: 'un' },
      { key: 'moveis_eur_un',     label: 'Móveis €/un (material)',            sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'bancada_eur_un',    label: 'Bancada €/un (material)',           sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'electro_eur_un',    label: 'Electrodomésticos €/un (material)', sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'mo_eur_un',         label: 'MO instalação €/un',                sufixo: '€/un', tipo_fiscal: 'mo' },
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
      { key: 'fachada_m2_liquido', label: 'm² fachada (líquido vãos)',   sufixo: 'm²' },
      { key: 'eur_m2_material',    label: 'ETICS — €/m² material',        sufixo: '€/m²', placeholder: '32', tipo_fiscal: 'material' },
      { key: 'eur_m2_mo',          label: 'ETICS — €/m² MO',              sufixo: '€/m²', placeholder: '23', tipo_fiscal: 'mo' },
      { key: 'remates_m',          label: 'Remates — metros lineares',    sufixo: 'm' },
      { key: 'remates_eur_m',      label: 'Remates — €/m (material)',     sufixo: '€/m', tipo_fiscal: 'material' },
      { key: 'andaime_m2',         label: 'Andaime — m²',                 sufixo: 'm²' },
      { key: 'andaime_eur_m2_mes', label: 'Andaime — €/m²·mês (serv.)',   sufixo: '€/m²·mês', placeholder: '6' },
      { key: 'andaime_meses',      label: 'Andaime — meses',              sufixo: 'meses' },
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
      { key: 'm2',              label: 'Área cobertura',           sufixo: 'm²' },
      { key: 'eur_m2_material', label: '€/m² material',            sufixo: '€/m²', placeholder: '85', tipo_fiscal: 'material' },
      { key: 'eur_m2_mo',       label: '€/m² MO',                  sufixo: '€/m²', placeholder: '45', tipo_fiscal: 'mo' },
    ],
  },

  {
    key: 'licenciamento',
    label: 'Licenciamento, fiscalização e seguros',
    icon: '📋',
    tipo: 'licenciamento_completo',
    grupo: 'extra',
    isLicenciamento: true,
    nota: 'Honorários sempre 23%. Taxas municipais e seguros sem IVA. Honorários singulares retêm IRS 25%.',
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
