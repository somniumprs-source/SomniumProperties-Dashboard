/**
 * Configuração declarativa das secções do orçamento de obra (v4 — simplificada).
 *
 * Regras fiscais agora são derivadas globalmente (zona_aru + tipo_obra no
 * topo da aba), pelo que NÃO há mais override por secção nem por linha.
 *
 * MO contabilizada SEMPRE por dia (dias × €/dia), ao nível da secção.
 *
 * Tipos de campo:
 *   - Material: campos numéricos (€, €/m², €/un)
 *   - MO da secção: bloco fixo `dias_mo` + `eur_dia_mo` no topo do body
 *   - Por piso: campos materiais por piso (sem MO — MO é da secção)
 */

export {
  TAXAS_IVA, RETENCOES_IRS, TIPOS_OBRA,
  REGIMES_FISCAIS,  // legacy, mantido para retrocompat de imports
} from '../../db/orcamentoObraEngine.js'

const MO_DEFAULT_EUR_DIA = 147.5  // 2 pessoas × 8h × 15 €/h × IVA aprox.

// Helper: bloco MO de secção (todas as secções com MO o usam)
const MO_FIELDS = {
  has_mo: true,
  mo_default_eur_dia: MO_DEFAULT_EUR_DIA,
}

export const SECCOES = [
  // ── 1. ESTALEIRO ─────────────────────────────────────────
  {
    key: 'estaleiro', label: 'Estaleiro de obra', icon: '🚧',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    nota: 'Vedação, contentor WC, sinalização, placa de obra, ligações provisórias. ~1.5–3% do total.',
    campos: [
      { key: 'vedacao',             label: 'Vedação obra',                sufixo: '€', tipo_fiscal: 'material' },
      { key: 'contentor_wc',        label: 'Contentor WC químico',        sufixo: '€', tipo_fiscal: 'material' },
      { key: 'sinalizacao',         label: 'Sinalização',                 sufixo: '€', tipo_fiscal: 'material' },
      { key: 'placa_obra',          label: 'Placa de obra',               sufixo: '€', tipo_fiscal: 'material' },
      { key: 'outros_mat',          label: 'Outros materiais',            sufixo: '€', tipo_fiscal: 'material' },
      { key: 'ligacoes_provisorias', label: 'Ligações provisórias (taxas)', sufixo: '€', tipo_fiscal: 'taxas' },
    ],
  },

  // ── 2. DEMOLIÇÕES ────────────────────────────────────────
  {
    key: 'demolicoes', label: 'Demolições e limpeza', icon: '🔨',
    tipo: 'fixed', grupo: 'obra',
    campos: [
      { key: 'entulhos',         label: 'Entrega de entulhos',          sufixo: '€' },
      { key: 'remocao_dias',     label: 'Remoção e transporte — dias',  sufixo: 'dias' },
      { key: 'remocao_eur_dia',  label: 'Remoção — €/dia',              sufixo: '€/dia' },
      { key: 'nivel_m2',         label: 'Nivelamento — área',           sufixo: 'm²' },
      { key: 'nivel_altura',     label: 'Nivelamento — altura caixa',   sufixo: 'm' },
      { key: 'nivel_eur_m3',     label: 'Toutvenant — €/m³',            sufixo: '€/m³', tipo_fiscal: 'material' },
      { key: 'limpeza_dias',     label: 'Limpeza — dias',               sufixo: 'dias' },
      { key: 'limpeza_eur_dia',  label: 'Limpeza — €/dia',              sufixo: '€/dia' },
      { key: 'paredes_dias',     label: 'Demolição paredes — dias',     sufixo: 'dias' },
      { key: 'paredes_eur_dia',  label: 'Demolição — €/dia',            sufixo: '€/dia' },
    ],
  },

  // ── 3. RCD ───────────────────────────────────────────────
  {
    key: 'rcd', label: 'RCD — Resíduos (DL 102-D/2020)', icon: '♻️',
    tipo: 'fixed', grupo: 'obra',
    nota: 'Plano de prevenção e gestão de RCD obrigatório. Transporte por operador licenciado.',
    campos: [
      { key: 'inerte_m3',     label: 'Inertes — m³',           sufixo: 'm³' },
      { key: 'inerte_eur_m3', label: 'Inertes — €/m³',         sufixo: '€/m³' },
      { key: 'misto_m3',      label: 'Mistos — m³',            sufixo: 'm³' },
      { key: 'misto_eur_m3',  label: 'Mistos — €/m³',          sufixo: '€/m³' },
      { key: 'perigoso_m3',   label: 'Perigosos — m³',         sufixo: 'm³' },
      { key: 'perigoso_eur_m3', label: 'Perigosos — €/m³',     sufixo: '€/m³' },
      { key: 'plano_gestao',  label: 'Plano de gestão (honorários 23%)', sufixo: '€' },
    ],
  },

  // ── 4. ESTRUTURA ─────────────────────────────────────────
  {
    key: 'estrutura', label: 'Estrutura (lajes, vigas, pilares)', icon: '🏗️',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    campos: [
      { key: 'lajes_material',          label: 'Lajes — material',         sufixo: '€', tipo_fiscal: 'material' },
      { key: 'vigamentos_material',     label: 'Vigamentos — material',    sufixo: '€', tipo_fiscal: 'material' },
      { key: 'pilares_material',        label: 'Pilares — material',       sufixo: '€', tipo_fiscal: 'material' },
      { key: 'escadas_material',        label: 'Escadas — material',       sufixo: '€', tipo_fiscal: 'material' },
      { key: 'paredes_novas_material',  label: 'Paredes novas — material', sufixo: '€', tipo_fiscal: 'material' },
      { key: 'outros_material',         label: 'Outros — material',        sufixo: '€', tipo_fiscal: 'material' },
    ],
  },

  // ── 5. ELETRICIDADE E CANALIZAÇÃO ────────────────────────
  {
    key: 'eletricidade', label: 'Eletricidade e canalização', icon: '⚡',
    tipo: 'mixto', grupo: 'obra', ...MO_FIELDS,
    nota: 'Modo simples (€/m² material por piso) ou detalhado (sub-linhas).',
    campos_piso: [
      { key: 'eur_m2_material', label: '€/m² material (modo simples)', sufixo: '€/m²', tipo_fiscal: 'material' },
    ],
    campos: [
      { key: 'rede_electrica_material',  label: 'Rede eléctrica + QE',     sufixo: '€', tipo_fiscal: 'material' },
      { key: 'ited_material',            label: 'ITED',                    sufixo: '€', tipo_fiscal: 'material' },
      { key: 'agua_fria_material',       label: 'Água fria',               sufixo: '€', tipo_fiscal: 'material' },
      { key: 'agua_quente_material',     label: 'AQ + AQS',                sufixo: '€', tipo_fiscal: 'material' },
      { key: 'esgotos_material',         label: 'Esgotos',                 sufixo: '€', tipo_fiscal: 'material' },
      { key: 'gas_material',             label: 'Gás',                     sufixo: '€', tipo_fiscal: 'material' },
      { key: 'contador_agua_lig_material', label: 'Contador água + ramal — material', sufixo: '€', tipo_fiscal: 'material' },
      { key: 'contador_agua_taxa',       label: 'Contador água + ramal (taxa câmara)', sufixo: '€', tipo_fiscal: 'taxas' },
      { key: 'certiel',                  label: 'CERTIEL — certif. eléctrica (honor.)', sufixo: '€', acompanha_singular: true },
      { key: 'certif_gas',               label: 'Certificação gás ITG (honor.)', sufixo: '€', acompanha_singular: true },
    ],
  },

  // ── 6. AVAC ──────────────────────────────────────────────
  {
    key: 'avac', label: 'AVAC / Solar / AQS', icon: '🔆',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    nota: 'Equipamentos = material. MO instalação no bloco em cima.',
    campos: [
      { key: 'split_un',          label: 'Splits — nº',               sufixo: 'un' },
      { key: 'split_eur_un',      label: 'Splits — €/un',             sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'bomba_calor',       label: 'Bomba de calor (AQS)',      sufixo: '€', tipo_fiscal: 'material' },
      { key: 'solar_termico',     label: 'Painéis solares térmicos',  sufixo: '€', tipo_fiscal: 'material' },
      { key: 'fotovoltaico_kwp',  label: 'Fotovoltaico — kWp',        sufixo: 'kWp' },
      { key: 'fotovoltaico_eur_kwp', label: 'Fotovoltaico — €/kWp',   sufixo: '€/kWp', tipo_fiscal: 'material' },
      { key: 'recuperador',       label: 'Recuperador / lareira',     sufixo: '€', tipo_fiscal: 'material' },
      { key: 'outros_avac',       label: 'Outros equipamentos',       sufixo: '€', tipo_fiscal: 'material' },
    ],
  },

  // ── 7. PAVIMENTO ─────────────────────────────────────────
  {
    key: 'pavimento', label: 'Pavimento', icon: '⬜',
    tipo: 'por_piso', grupo: 'obra', ...MO_FIELDS,
    nota: 'Betonilha de regularização separada do revestimento.',
    campos_piso: [
      { key: 'tipo',                opcoes: ['mosaico', 'soalho a recuperar', 'flutuante', 'laminado', 'vinílico', 'pedra natural'] },
      { key: 'betonilha_eur_m2',    label: '€/m² betonilha',  sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'eur_m2_material',     label: '€/m² revestimento', sufixo: '€/m²', tipo_fiscal: 'material' },
    ],
  },

  // ── 8. PLADUR ────────────────────────────────────────────
  {
    key: 'pladur', label: 'Pladur tetos', icon: '◾',
    tipo: 'por_piso', grupo: 'obra', ...MO_FIELDS,
    campos_piso: [
      { key: 'eur_m2_material', label: '€/m² material', sufixo: '€/m²', tipo_fiscal: 'material' },
    ],
  },

  // ── 9. ISOLAMENTO ────────────────────────────────────────
  {
    key: 'isolamento', label: 'Isolamento térmico/acústico (REH)', icon: '🧊',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    campos: [
      { key: 'fachada_m2',                  label: 'Fachada — m²',                 sufixo: 'm²' },
      { key: 'fachada_eur_m2_material',     label: 'Fachada — €/m²',               sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'cobertura_m2',                label: 'Cobertura — m²',               sufixo: 'm²' },
      { key: 'cobertura_eur_m2_material',   label: 'Cobertura — €/m²',             sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'pavimento_m2',                label: 'Pavimento s/ ext — m²',        sufixo: 'm²' },
      { key: 'pavimento_eur_m2_material',   label: 'Pavimento — €/m²',             sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'acustico_m2',                 label: 'Acústico — m²',                sufixo: 'm²' },
      { key: 'acustico_eur_m2_material',    label: 'Acústico — €/m²',              sufixo: '€/m²', tipo_fiscal: 'material' },
    ],
  },

  // ── 10. IMPERMEABILIZAÇÕES ───────────────────────────────
  {
    key: 'impermeabilizacoes', label: 'Impermeabilizações', icon: '💧',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    nota: 'Telas, primários, juntas em terraços, banheiras WC, muros enterrados.',
    campos: [
      { key: 'terracos_material',     label: 'Terraços e varandas',     sufixo: '€', tipo_fiscal: 'material' },
      { key: 'banheiras_material',    label: 'Banheiras WC',            sufixo: '€', tipo_fiscal: 'material' },
      { key: 'muros_material',        label: 'Muros enterrados',        sufixo: '€', tipo_fiscal: 'material' },
      { key: 'juntas_material',       label: 'Juntas dilatação',        sufixo: '€', tipo_fiscal: 'material' },
      { key: 'outros_material',       label: 'Outras',                  sufixo: '€', tipo_fiscal: 'material' },
    ],
  },

  // ── 11. REBOCOS E ESTUQUES ───────────────────────────────
  {
    key: 'rebocos', label: 'Rebocos e estuques', icon: '🏛️',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    campos: [
      { key: 'chapisco_material',         label: 'Chapisco',                 sufixo: '€', tipo_fiscal: 'material' },
      { key: 'reboco_trad_material',      label: 'Reboco tradicional',       sufixo: '€', tipo_fiscal: 'material' },
      { key: 'estuque_proj_material',     label: 'Estuque projectado',       sufixo: '€', tipo_fiscal: 'material' },
      { key: 'gesso_paredes_material',    label: 'Gesso cartonado paredes',  sufixo: '€', tipo_fiscal: 'material' },
    ],
  },

  // ── 12. CAIXILHARIAS ─────────────────────────────────────
  {
    key: 'caixilharias', label: 'Caixilharias', icon: '🪟',
    tipo: 'mixto', grupo: 'obra', ...MO_FIELDS,
    campos_piso: [
      { key: 'n_janelas',      label: 'Nº janelas',                  sufixo: 'un' },
      { key: 'area_janela_m2', label: 'm²/janela',                   sufixo: 'm²', placeholder: '1.5' },
      { key: 'eur_m2',         label: '€/m² (material)',             sufixo: '€/m²', tipo_fiscal: 'material' },
    ],
    campos: [
      { key: 'cb_un',           label: 'Janelas CB — nº',            sufixo: 'un' },
      { key: 'cb_eur_un',       label: 'Janelas CB — €/un',          sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'soleiras_un',     label: 'Soleiras — nº',              sufixo: 'un' },
      { key: 'soleiras_eur_un', label: 'Soleiras — €/un',            sufixo: '€/un', tipo_fiscal: 'material' },
    ],
  },

  // ── 13. VMC ──────────────────────────────────────────────
  {
    key: 'vmc', label: 'Sistema VMC', icon: '💨',
    tipo: 'por_piso', grupo: 'obra', ...MO_FIELDS,
    campos_piso: [
      { key: 'material', label: 'Material — €', sufixo: '€', tipo_fiscal: 'material' },
    ],
  },

  // ── 14. PINTURA ──────────────────────────────────────────
  {
    key: 'pintura', label: 'Pintura (interior + exterior)', icon: '🎨',
    tipo: 'mixto', grupo: 'obra', ...MO_FIELDS,
    nota: 'Preparação separada do acabamento.',
    campos_piso: [
      { key: 'm2_paredes',          label: 'm² paredes',          sufixo: 'm²' },
      { key: 'm2_teto',             label: 'm² teto',             sufixo: 'm²' },
      { key: 'preparacao_eur_m2',   label: '€/m² preparação',     sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'eur_m2_material',     label: '€/m² acabamento',     sufixo: '€/m²', tipo_fiscal: 'material' },
    ],
    campos: [
      { key: 'exterior_m2',                label: 'Pintura exterior — m²',   sufixo: 'm²' },
      { key: 'exterior_eur_m2_material',   label: 'Exterior — €/m²',         sufixo: '€/m²', tipo_fiscal: 'material' },
    ],
  },

  // ── 15. CASAS DE BANHO E PICHELARIA ──────────────────────
  {
    key: 'casas_banho', label: 'Casas de banho e pichelaria', icon: '🚿',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    campos: [
      { key: 'un',                 label: 'Nº casas de banho',                  sufixo: 'un' },
      { key: 'loucas_eur_un',      label: 'Louças + torneiras €/un',            sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'cer_mat_eur_un',     label: 'Cerâmicos €/un',                     sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'mobiliario_eur_un',  label: 'Mobiliário + espelho €/un',          sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'lava_louca_cozinha', label: 'Lava-louça cozinha',                 sufixo: '€', tipo_fiscal: 'material' },
      { key: 'torneira_exterior',  label: 'Torneira exterior',                  sufixo: '€', tipo_fiscal: 'material' },
      { key: 'maquina_pontos',     label: 'Pontos máquina lavar/secar',         sufixo: '€', tipo_fiscal: 'material' },
      { key: 'outros_pichelaria',  label: 'Outras peças pichelaria',            sufixo: '€', tipo_fiscal: 'material' },
    ],
  },

  // ── 16. PORTAS ───────────────────────────────────────────
  {
    key: 'portas', label: 'Portas', icon: '🚪',
    tipo: 'unitario', grupo: 'obra', ...MO_FIELDS,
    campos: [
      { key: 'un',              label: 'Nº portas',                  sufixo: 'un' },
      { key: 'eur_un_material', label: '€/un (material)',            sufixo: '€/un', tipo_fiscal: 'material' },
    ],
  },

  // ── 17. CARPINTARIAS ─────────────────────────────────────
  {
    key: 'carpintarias', label: 'Carpintarias interiores', icon: '🪵',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    nota: 'Rodapés, aros, guarnições, roupeiros embutidos, escadas, tectos.',
    campos: [
      { key: 'rodapes_material',           label: 'Rodapés',                sufixo: '€', tipo_fiscal: 'material' },
      { key: 'aros_guarnicoes_material',   label: 'Aros e guarnições',      sufixo: '€', tipo_fiscal: 'material' },
      { key: 'roupeiros_material',         label: 'Roupeiros embutidos',    sufixo: '€', tipo_fiscal: 'material' },
      { key: 'escadas_madeira_material',   label: 'Escadas madeira',        sufixo: '€', tipo_fiscal: 'material' },
      { key: 'tectos_madeira_material',    label: 'Tectos madeira',         sufixo: '€', tipo_fiscal: 'material' },
      { key: 'outros_material',            label: 'Outras carpintarias',    sufixo: '€', tipo_fiscal: 'material' },
    ],
  },

  // ── 18. SERRALHARIAS ─────────────────────────────────────
  {
    key: 'serralharias', label: 'Serralharias', icon: '⚙️',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    nota: 'Gradeamentos, guardas, portões, corrimãos, portas corta-fogo.',
    campos: [
      { key: 'gradeamentos_material',         label: 'Gradeamentos',           sufixo: '€', tipo_fiscal: 'material' },
      { key: 'guardas_varanda_material',      label: 'Guardas varanda',        sufixo: '€', tipo_fiscal: 'material' },
      { key: 'portoes_material',              label: 'Portões',                sufixo: '€', tipo_fiscal: 'material' },
      { key: 'corrimaos_material',            label: 'Corrimãos',              sufixo: '€', tipo_fiscal: 'material' },
      { key: 'portas_corta_fogo_material',    label: 'Portas corta-fogo',      sufixo: '€', tipo_fiscal: 'material' },
      { key: 'outros_material',               label: 'Outras serralharias',    sufixo: '€', tipo_fiscal: 'material' },
    ],
  },

  // ── 19. COZINHAS ─────────────────────────────────────────
  {
    key: 'cozinhas', label: 'Cozinhas', icon: '🍳',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    campos: [
      { key: 'un',                label: 'Nº cozinhas',                       sufixo: 'un' },
      { key: 'moveis_eur_un',     label: 'Móveis €/un',                       sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'bancada_eur_un',    label: 'Bancada €/un',                      sufixo: '€/un', tipo_fiscal: 'material' },
      { key: 'electro_eur_un',    label: 'Electrodomésticos €/un',            sufixo: '€/un', tipo_fiscal: 'material' },
    ],
  },

  // ── 20. ANDAIMES ─────────────────────────────────────────
  {
    key: 'andaimes', label: 'Andaimes', icon: '🪜',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    nota: 'Aluguer mensal por m² × meses. Montagem/desmontagem como MO.',
    campos: [
      { key: 'm2',          label: 'Andaime — m²',          sufixo: 'm²' },
      { key: 'eur_m2_mes',  label: 'Andaime — €/m²·mês',    sufixo: '€/m²·mês', placeholder: '6', tipo_fiscal: 'material' },
      { key: 'meses',       label: 'Andaime — meses',       sufixo: 'meses' },
    ],
  },

  // ── 21. CAPOTO ───────────────────────────────────────────
  {
    key: 'capoto', label: 'Capoto / ETICS exterior', icon: '🧱',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    nota: 'Calcular m² fachada já líquido de vãos.',
    campos: [
      { key: 'fachada_m2_liquido', label: 'm² fachada (líquido)',        sufixo: 'm²' },
      { key: 'eur_m2_material',    label: '€/m² ETICS material',         sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'remates_m',          label: 'Remates — metros lineares',   sufixo: 'm' },
      { key: 'remates_eur_m',      label: 'Remates — €/m',               sufixo: '€/m', tipo_fiscal: 'material' },
    ],
  },

  // ── 22. COBERTURA ────────────────────────────────────────
  {
    key: 'cobertura', label: 'Cobertura', icon: '🏠',
    tipo: 'fixed', grupo: 'obra', ...MO_FIELDS,
    nota: 'Estrutura, revestimento e remates separados.',
    campos: [
      { key: 'm2',                  label: 'Área cobertura',              sufixo: 'm²' },
      { key: 'estrutura_eur_m2',    label: '€/m² estrutura/madeiramento', sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'revestimento_eur_m2', label: '€/m² revestimento (telha)',   sufixo: '€/m²', tipo_fiscal: 'material' },
      { key: 'remates_total',       label: 'Remates (rufos, caleiras)',   sufixo: '€', tipo_fiscal: 'material' },
    ],
  },

  // ── 23. EQUIPAMENTO E LOGÍSTICA ──────────────────────────
  {
    key: 'equipamento', label: 'Equipamento e logística', icon: '🚚',
    tipo: 'fixed', grupo: 'obra',
    nota: 'Aluguer, consumos provisórios e transportes.',
    campos: [
      { key: 'aluguer_mini_grua',   label: 'Aluguer mini-grua',                 sufixo: '€', tipo_fiscal: 'material' },
      { key: 'aluguer_betoneira',   label: 'Aluguer betoneira',                 sufixo: '€', tipo_fiscal: 'material' },
      { key: 'aluguer_plataforma',  label: 'Aluguer plataforma elevatória',     sufixo: '€', tipo_fiscal: 'material' },
      { key: 'aluguer_outros',      label: 'Outros equipamentos alugados',      sufixo: '€', tipo_fiscal: 'material' },
      { key: 'transportes',         label: 'Transportes / portes',              sufixo: '€', tipo_fiscal: 'material' },
      { key: 'ferramentas',         label: 'Ferramentas e consumíveis',         sufixo: '€', tipo_fiscal: 'material' },
      { key: 'consumos_agua',       label: 'Consumo água provisória (taxa)',    sufixo: '€', tipo_fiscal: 'taxas' },
      { key: 'consumos_luz',        label: 'Consumo luz provisória (taxa)',     sufixo: '€', tipo_fiscal: 'taxas' },
    ],
  },

  // ── 24. LICENCIAMENTO ────────────────────────────────────
  {
    key: 'licenciamento', label: 'Licenciamento, fiscalização e seguros', icon: '📋',
    tipo: 'licenciamento_completo', grupo: 'extra', isLicenciamento: true,
    nota: 'Honorários sempre 23% (com retenção 25% se singular). Taxas/seguros sem IVA.',
    campos: [
      { key: 'projeto',               label: 'Projecto especialidade/arquitectura', sufixo: '€', acompanha_singular: true },
      { key: 'tro',                   label: 'TRO — Técnico Responsável de Obra',   sufixo: '€', acompanha_singular: true },
      { key: 'fiscalizacao',          label: 'Fiscalização (valor fixo)',           sufixo: '€', acompanha_singular: true },
      { key: 'fiscalizacao_perc',     label: '— ou % sobre base obra',              sufixo: '%' },
      { key: 'seguro_car',            label: 'Seguro CAR (isento)',                 sufixo: '€' },
      { key: 'seguro_rc',             label: 'Seguro RC empreiteiro (isento)',      sufixo: '€' },
      { key: 'taxas_municipais',      label: 'Taxas municipais (sem IVA)',          sufixo: '€' },
      { key: 'taxa_ocup_via_publica', label: 'Taxa ocupação via pública',           sufixo: '€' },
      { key: 'solicitador',           label: 'Solicitador / registos',              sufixo: '€', acompanha_singular: true },
      { key: 'livro_obra',            label: 'Livro de obra + alvará (taxas)',      sufixo: '€' },
      { key: 'sce',                   label: 'Certificado energético (SCE)',        sufixo: '€', acompanha_singular: true },
    ],
  },

  // ── 25. FECHO DE OBRA ────────────────────────────────────
  {
    key: 'fecho_obra', label: 'Fecho de obra e ensaios', icon: '✅',
    tipo: 'fixed', grupo: 'extra',
    nota: 'Telas finais, FTH, ensaios, vistoria final, limpeza pós-obra.',
    campos: [
      { key: 'telas_finais',        label: 'Telas finais (as-built)',                       sufixo: '€', acompanha_singular: true },
      { key: 'fth',                 label: 'Ficha Técnica Habitação (FTH)',                 sufixo: '€', acompanha_singular: true },
      { key: 'sce_final',           label: 'SCE final pós-obra',                            sufixo: '€', acompanha_singular: true },
      { key: 'ensaios_total',       label: 'Ensaios obrig. (gás, água, eléct., infiltrom.)', sufixo: '€' },
      { key: 'vistoria_camara',     label: 'Vistoria final câmara + lic. utilização (taxa)', sufixo: '€' },
      { key: 'limpeza_dias',        label: 'Limpeza pós-obra — dias',                       sufixo: 'dias' },
      { key: 'limpeza_eur_dia',     label: 'Limpeza — €/dia',                               sufixo: '€/dia' },
    ],
  },
]

export const PISO_PRESETS = ['R/C', '1º Andar', '2º Andar', '3º Andar', 'Sótão', 'Cave']
