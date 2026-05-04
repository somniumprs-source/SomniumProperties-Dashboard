/**
 * Configuração declarativa das secções do orçamento de obra.
 * Cada secção define os seus inputs (chave, label, sufixo).
 * As fórmulas/cálculos vivem em src/db/orcamentoObraEngine.js — única fonte da verdade.
 *
 * Tipos de secção:
 *   'fixed'     — campos fixos (não dependem de pisos)
 *   'por_piso'  — replica os campos `campos_piso` por cada piso configurado
 *   'mixto'     — fixed + por_piso
 *   'unitario'  — un × eur_un
 *   'capoto'    — lista dinâmica de troços (perímetro × altura × eur/m²)
 */

export const SECCOES = [
  {
    key: 'demolicoes',
    label: 'Demolições e limpeza',
    icon: '🔨',
    tipo: 'fixed',
    campos: [
      { key: 'entulhos',         label: 'Entrega de entulhos',          sufixo: '€', com_iva: false },
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
    key: 'eletricidade',
    label: 'Eletricidade e canalização',
    icon: '⚡',
    tipo: 'por_piso',
    campos_piso: [
      { key: 'eur_m2', label: '€/m² (média)', sufixo: '€/m²', placeholder: '70' },
    ],
    nota: 'Custo médio aproximado: 60-70 €/m² (mão-de-obra + materiais).',
  },

  {
    key: 'pavimento',
    label: 'Pavimento (mosaico + cola + rejunt + MO)',
    icon: '⬜',
    tipo: 'por_piso',
    campos_piso: [
      { key: 'eur_m2', label: '€/m²', sufixo: '€/m²', placeholder: '56' },
    ],
  },

  {
    key: 'pladur',
    label: 'Pladur tetos (placa + isolamento + perfis + MO)',
    icon: '◾',
    tipo: 'por_piso',
    campos_piso: [
      { key: 'eur_m2', label: '€/m²', sufixo: '€/m²', placeholder: '47' },
    ],
  },

  {
    key: 'caixilharias',
    label: 'Caixilharias (alumínio + corte térmico + vidro duplo)',
    icon: '🪟',
    tipo: 'mixto',
    campos_piso: [
      { key: 'n_janelas',      label: 'Nº janelas',     sufixo: 'un' },
      { key: 'area_janela_m2', label: 'Área por janela', sufixo: 'm²', placeholder: '1.5' },
      { key: 'eur_m2',         label: '€/m²',           sufixo: '€/m²', placeholder: '450' },
    ],
    campos: [
      { key: 'cb_un',           label: 'Janelas casa-de-banho — nº',    sufixo: 'un' },
      { key: 'cb_eur_un',       label: 'Janelas CB — €/un (c/ IVA)',    sufixo: '€/un' },
      { key: 'pedreiro',        label: 'Trabalho pedreiro',             sufixo: '€' },
      { key: 'soleiras_un',     label: 'Soleiras — nº',                 sufixo: 'un' },
      { key: 'soleiras_eur_un', label: 'Soleiras — €/un',               sufixo: '€/un' },
    ],
  },

  {
    key: 'vmc',
    label: 'Sistema VMC',
    icon: '💨',
    tipo: 'por_piso',
    campos_piso: [
      { key: 'valor_com_iva', label: 'Valor (já com IVA)', sufixo: '€' },
    ],
  },

  {
    key: 'pintura',
    label: 'Pintura',
    icon: '🎨',
    tipo: 'por_piso',
    campos_piso: [
      { key: 'm2_paredes', label: 'm² paredes', sufixo: 'm²' },
      { key: 'm2_teto',    label: 'm² teto',    sufixo: 'm²' },
      { key: 'eur_m2',     label: '€/m²',       sufixo: '€/m²', placeholder: '15' },
    ],
  },

  {
    key: 'casas_banho',
    label: 'Casas de banho',
    icon: '🚿',
    tipo: 'unitario',
    campos: [
      { key: 'un',     label: 'Nº casas de banho', sufixo: 'un' },
      { key: 'eur_un', label: '€/un (c/ IVA)',     sufixo: '€/un', placeholder: '4000' },
    ],
  },

  {
    key: 'portas',
    label: 'Portas',
    icon: '🚪',
    tipo: 'unitario',
    campos: [
      { key: 'un',     label: 'Nº portas',                  sufixo: 'un' },
      { key: 'eur_un', label: '€/un (com aplicação)',       sufixo: '€/un', placeholder: '175' },
    ],
  },

  {
    key: 'cozinhas',
    label: 'Cozinhas (incl. fogão, exaustor, forno, frigorífico, MLL, MLR)',
    icon: '🍳',
    tipo: 'unitario',
    campos: [
      { key: 'un',     label: 'Nº cozinhas',           sufixo: 'un' },
      { key: 'eur_un', label: '€/un (c/ IVA)',         sufixo: '€/un', placeholder: '9000' },
    ],
  },

  {
    key: 'capoto',
    label: 'Capoto exterior',
    icon: '🧱',
    tipo: 'capoto',
  },

  {
    key: 'cobertura',
    label: 'Cobertura',
    icon: '🏠',
    tipo: 'unitario',
    campos: [
      { key: 'm2',     label: 'Área cobertura',     sufixo: 'm²' },
      { key: 'eur_m2', label: '€/m² (c/ IVA)',      sufixo: '€/m²', placeholder: '150' },
    ],
  },

  {
    key: 'licenciamento',
    label: 'Licenciamento (opcional)',
    icon: '📋',
    tipo: 'fixed',
    isLicenciamento: true,
    campos: [
      { key: 'projeto', label: 'Projecto especialidade/arquitectura', sufixo: '€' },
      { key: 'taxas',   label: 'Taxas e solicitador',                 sufixo: '€' },
    ],
  },
]

export const PISO_PRESETS = ['R/C', '1º Andar', '2º Andar', 'Sótão', 'Cave']
