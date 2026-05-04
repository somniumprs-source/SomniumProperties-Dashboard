/**
 * Motor de cálculo do orçamento de obra (v4 — simplificado).
 *
 * Regras fiscais (sem override por secção/linha):
 *
 *   IVA Material:
 *     - Zona ARU (Verba 2.27): 6%
 *     - Fora ARU: 23%
 *
 *   IVA Mão-de-obra:
 *     - Tipo obra = Remodelação: 6%
 *     - Tipo obra = Construção nova: 23%
 *
 *   Honorários (projecto, TRO, fiscalização, SCE, solicitador, CERTIEL): 23% sempre
 *   Taxas (municipais, livro de obra, contador água): 0% (fora campo IVA)
 *   Seguros (CAR): 0% (isentos art 9º CIVA)
 *
 * Tabela combinada:
 *   ┌──────────────────┬──────────┬──────┐
 *   │ Cenário          │ Material │ MO   │
 *   ├──────────────────┼──────────┼──────┤
 *   │ Não ARU + Const. │   23%    │ 23%  │
 *   │ Não ARU + Remod. │   23%    │  6%  │
 *   │ ARU + Const.     │    6%    │ 23%  │
 *   │ ARU + Remod.     │    6%    │  6%  │
 *   └──────────────────┴──────────┴──────┘
 *
 * Mão-de-obra contabilizada SEMPRE por dia (dias × €/dia), nunca por m².
 *
 * Fonte da verdade — usado pelo backend (PUT) e frontend (cálculo realtime).
 */

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round2 = (n) => Math.round(n * 100) / 100

// ── Derivação de taxas a partir dos 2 flags ────────────────
function taxaMaterial(zonaAru) { return zonaAru ? 6 : 23 }
function taxaMO(tipoObra) { return tipoObra === 'construcao_nova' ? 23 : 6 }

// ── Construtor de linha ────────────────────────────────────
function linha({ descricao, base, taxa_iva = 23, autoliquidacao = false, retencao_irs = 0, capitalizavel = true, formula, tipo = 'misto' }) {
  // Honorários nunca autoliquidam
  if (tipo === 'honorarios') autoliquidacao = false
  const b = num(base)
  const t = num(taxa_iva)
  const iva = round2(b * t / 100)
  const ret = round2(b * num(retencao_irs) / 100)
  return {
    descricao, formula, tipo,
    base: round2(b),
    taxa_iva: t,
    iva,
    autoliquidacao: !!autoliquidacao,
    retencao_irs: num(retencao_irs),
    retencao_valor: ret,
    capitalizavel: capitalizavel !== false,
    valor_pagar: round2(b - ret + (autoliquidacao ? 0 : iva)),
    valor_bruto: round2(b + iva),
  }
}

// Helper: linha de material (com ou sem qty/€/un)
function linhaMaterial(descricao, base, formula, tMat) {
  if (num(base) <= 0) return null
  return linha({ descricao, base, taxa_iva: tMat, formula, tipo: 'material' })
}

// Helper: linha de MO por dias × €/dia
function linhaMOPorDia(descricao, dias, eur_dia, tMO, autoliq) {
  const base = num(dias) * num(eur_dia)
  if (base <= 0) return null
  return linha({
    descricao,
    base,
    taxa_iva: tMO,
    autoliquidacao: !!autoliq,
    formula: `${num(dias)} dias × ${num(eur_dia)} €/dia`,
    tipo: 'mo',
  })
}

// Linha de MO directa (já calculada)
function linhaMODirecta(descricao, base, formula, tMO, autoliq) {
  if (num(base) <= 0) return null
  return linha({
    descricao, base, taxa_iva: tMO,
    autoliquidacao: !!autoliq,
    formula, tipo: 'mo',
  })
}

function linhaServico(descricao, base, formula, tMO, autoliq) {
  if (num(base) <= 0) return null
  return linha({
    descricao, base, taxa_iva: tMO,
    autoliquidacao: !!autoliq,
    formula, tipo: 'servicos',
  })
}

function linhaHonorarios(descricao, base, formula, retencao = 0) {
  if (num(base) <= 0) return null
  return linha({ descricao, base, taxa_iva: 23, retencao_irs: retencao, formula, tipo: 'honorarios' })
}

function linhaTaxa(descricao, base, formula) {
  if (num(base) <= 0) return null
  return linha({ descricao, base, taxa_iva: 0, formula: formula || `${num(base)} € (sem IVA)`, tipo: 'taxas' })
}

function linhaIsento(descricao, base, formula) {
  if (num(base) <= 0) return null
  return linha({ descricao, base, taxa_iva: 0, formula: formula || `${num(base)} € (isento)`, tipo: 'isento' })
}

// Helper: bloco MO ao nível de secção (dias × €/dia comum a vários sub-itens)
function moDaSeccao(s, descricaoPrefix, tMO) {
  const dias = num(s?.dias_mo)
  const eur = num(s?.eur_dia_mo)
  const auto = !!s?.autoliq_mo
  if (dias * eur <= 0) return null
  return linhaMOPorDia(`${descricaoPrefix} — mão-de-obra`, dias, eur, tMO, auto)
}

// ════════════════════════════════════════════════════════════
// Resolvers por secção
// ════════════════════════════════════════════════════════════

// 1. Demolições
function linhasDemolicoes(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const auto = !!s.autoliquidacao
  const out = []
  // Serviços (entulhos, remoção, limpeza, demolição) — todos por dia ou valor fixo
  if (num(s.entulhos) > 0)
    out.push(linhaServico('Entrega de entulhos', num(s.entulhos), `${num(s.entulhos)} €`, tMO, auto))
  if (num(s.remocao_dias) > 0 && num(s.remocao_eur_dia) > 0)
    out.push(linhaServico('Remoção e transporte', num(s.remocao_dias) * num(s.remocao_eur_dia),
      `${num(s.remocao_dias)} dias × ${num(s.remocao_eur_dia)} €/dia`, tMO, auto))
  // Toutvenant: material puro
  const m3Toutvenant = num(s.nivel_m2) * num(s.nivel_altura)
  if (m3Toutvenant > 0 && num(s.nivel_eur_m3) > 0)
    out.push(linhaMaterial('Nivelamento (toutvenant) — material',
      m3Toutvenant * num(s.nivel_eur_m3),
      `${num(s.nivel_m2)}m² × ${num(s.nivel_altura)}m × ${num(s.nivel_eur_m3)} €/m³`, tMat))
  if (num(s.limpeza_dias) > 0 && num(s.limpeza_eur_dia) > 0)
    out.push(linhaServico('Limpeza interior + terreno', num(s.limpeza_dias) * num(s.limpeza_eur_dia),
      `${num(s.limpeza_dias)} dias × ${num(s.limpeza_eur_dia)} €/dia`, tMO, auto))
  if (num(s.paredes_dias) > 0 && num(s.paredes_eur_dia) > 0)
    out.push(linhaServico('Demolição paredes / roços', num(s.paredes_dias) * num(s.paredes_eur_dia),
      `${num(s.paredes_dias)} dias × ${num(s.paredes_eur_dia)} €/dia`, tMO, auto))
  return out.filter(Boolean)
}

// 2. Estaleiro de obra
function linhasEstaleiro(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const auto = !!s.autoliquidacao
  const out = []
  // Materiais (vedação, contentor WC, sinalização, placa)
  for (const [k, label] of [
    ['vedacao', 'Vedação obra'],
    ['contentor_wc', 'Contentor WC químico'],
    ['sinalizacao', 'Sinalização'],
    ['placa_obra', 'Placa de obra'],
    ['outros_mat', 'Outros materiais estaleiro'],
  ]) {
    if (num(s[k]) > 0) out.push(linhaMaterial(label, num(s[k]), `${num(s[k])} €`, tMat))
  }
  // Ligações provisórias (taxas câmara/EDP/águas — sem IVA)
  if (num(s.ligacoes_provisorias) > 0)
    out.push(linhaTaxa('Ligações provisórias (água/luz)', num(s.ligacoes_provisorias)))
  // MO montagem do estaleiro (dias × €/dia)
  out.push(moDaSeccao(s, 'Montagem estaleiro', tMO))
  return out.filter(Boolean)
}

// 3. RCD — DL 102-D/2020
function linhasRCD(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const out = []
  for (const tipo of ['inerte', 'misto', 'perigoso']) {
    const q = num(s[`${tipo}_m3`]), p = num(s[`${tipo}_eur_m3`])
    if (q * p > 0)
      out.push(linhaServico(`RCD ${tipo} (transporte + operador licenciado)`,
        q * p, `${q}m³ × ${p} €/m³`, tMO))
  }
  if (num(s.plano_gestao) > 0)
    out.push(linhaHonorarios('Plano de prevenção e gestão de RCD', num(s.plano_gestao), `${num(s.plano_gestao)} €`))
  return out.filter(Boolean)
}

// 4. Estrutura
function linhasEstrutura(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const auto = !!s.autoliquidacao
  const out = []
  for (const [k, label] of [
    ['lajes', 'Lajes'],
    ['vigamentos', 'Vigamentos'],
    ['pilares', 'Pilares'],
    ['escadas', 'Escadas interiores'],
    ['paredes_novas', 'Paredes novas'],
    ['outros', 'Outros estruturais'],
  ]) {
    if (num(s[`${k}_material`]) > 0)
      out.push(linhaMaterial(`${label} — material`, num(s[`${k}_material`]), `${num(s[`${k}_material`])} €`, tMat))
  }
  // MO da secção
  out.push(moDaSeccao(s, 'Estrutura', tMO))
  return out.filter(Boolean)
}

// 5. Eletricidade e canalização
function linhasEletricidade(s, pisos, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const auto = !!s.autoliquidacao
  const out = []
  // Material por piso (€/m² simples)
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const m2 = num(piso.area_m2 ?? p.area_m2)
      const eur = num(piso.eur_m2_material ?? piso.eur_m2)
      if (m2 * eur > 0)
        out.push(linhaMaterial(`${p.nome} — instalações (material)`, m2 * eur,
          `${m2}m² × ${eur} €/m²`, tMat))
    }
  }
  // Sub-linhas detalhadas (material puro)
  for (const [k, label] of [
    ['rede_electrica_material', 'Rede eléctrica + QE — material'],
    ['ited_material', 'ITED — material'],
    ['agua_fria_material', 'Água fria — material'],
    ['agua_quente_material', 'AQ + AQS — material'],
    ['esgotos_material', 'Esgotos — material'],
    ['gas_material', 'Gás — material'],
    ['contador_agua_lig_material', 'Contador água + ramal — material'],
  ]) {
    if (num(s[k]) > 0)
      out.push(linhaMaterial(label, num(s[k]), `${num(s[k])} €`, tMat))
  }
  // Contador água + ligação à rede (taxa câmara/águas — sem IVA)
  if (num(s.contador_agua_taxa) > 0)
    out.push(linhaTaxa('Contador água + ligação à rede (taxa)', num(s.contador_agua_taxa)))
  // CERTIEL (certificação eléctrica) — honorário 23%
  if (num(s.certiel) > 0)
    out.push(linhaHonorarios('CERTIEL — certificação eléctrica', num(s.certiel),
      `${num(s.certiel)} €`, s.certiel_singular ? 25 : 0))
  // Certificação gás — honorário 23%
  if (num(s.certif_gas) > 0)
    out.push(linhaHonorarios('Certificação gás (ITG)', num(s.certif_gas),
      `${num(s.certif_gas)} €`, s.certif_gas_singular ? 25 : 0))
  // MO da secção
  out.push(moDaSeccao(s, 'Eletricidade + canalização', tMO))
  return out.filter(Boolean)
}

// 6. AVAC / Solar / AQS
function linhasAvac(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  const items = [
    ['split_un', 'split_eur_un', 'Splits / multi-split AC', (un, eur) => `${un} × ${eur} €/un`],
    [null, 'bomba_calor', 'Bomba de calor (AQS)', (v) => `${v} €`],
    [null, 'solar_termico', 'Painéis solares térmicos + dep.', (v) => `${v} €`],
    ['fotovoltaico_kwp', 'fotovoltaico_eur_kwp', 'Sistema fotovoltaico', (k, eur) => `${k} kWp × ${eur} €/kWp`],
    [null, 'recuperador', 'Recuperador / lareira', (v) => `${v} €`],
    [null, 'outros_avac', 'Outros equipamentos AVAC', (v) => `${v} €`],
  ]
  for (const [qK, pK, label, fmt] of items) {
    if (qK) {
      const q = num(s[qK]), p = num(s[pK])
      if (q * p > 0) out.push(linhaMaterial(label, q * p, fmt(q, p), tMat))
    } else {
      const v = num(s[pK])
      if (v > 0) out.push(linhaMaterial(label, v, fmt(v), tMat))
    }
  }
  // MO da secção
  out.push(moDaSeccao(s, 'AVAC — instalação', tMO))
  return out.filter(Boolean)
}

// 7. Pavimento
function linhasPavimento(s, pisos, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const auto = !!s.autoliquidacao
  const out = []
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const m2 = num(piso.area_m2 ?? p.area_m2)
      const tipo = piso.tipo || 'mosaico'
      // Betonilha de regularização (material)
      const betEur = num(piso.betonilha_eur_m2)
      if (m2 * betEur > 0)
        out.push(linhaMaterial(`${p.nome} — betonilha regularização`,
          m2 * betEur, `${m2}m² × ${betEur} €/m²`, tMat))
      // Revestimento (material)
      const eurMat = num(piso.eur_m2_material ?? piso.eur_m2)
      if (m2 * eurMat > 0)
        out.push(linhaMaterial(`${p.nome} — pavimento ${tipo} (material)`,
          m2 * eurMat, `${m2}m² × ${eurMat} €/m²`, tMat))
    }
  }
  out.push(moDaSeccao(s, 'Pavimento', tMO))
  return out.filter(Boolean)
}

// 8. Pladur tetos
function linhasPladur(s, pisos, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const m2 = num(piso.area_m2 ?? p.area_m2)
      const eur = num(piso.eur_m2_material ?? piso.eur_m2)
      if (m2 * eur > 0)
        out.push(linhaMaterial(`${p.nome} — pladur tecto (material)`,
          m2 * eur, `${m2}m² × ${eur} €/m²`, tMat))
    }
  }
  out.push(moDaSeccao(s, 'Pladur tetos', tMO))
  return out.filter(Boolean)
}

// 9. Isolamento
function linhasIsolamento(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  for (const [k, label] of [
    ['fachada', 'Isolamento fachada'],
    ['cobertura', 'Isolamento cobertura'],
    ['pavimento', 'Isolamento pavimento sobre exterior'],
    ['acustico', 'Isolamento acústico'],
  ]) {
    const q = num(s[`${k}_m2`])
    const p = num(s[`${k}_eur_m2_material`] ?? s[`${k}_eur_m2`])
    if (q * p > 0)
      out.push(linhaMaterial(`${label} — material`, q * p, `${q}m² × ${p} €/m²`, tMat))
  }
  out.push(moDaSeccao(s, 'Isolamento', tMO))
  return out.filter(Boolean)
}

// 10. Impermeabilizações
function linhasImpermeabilizacoes(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  for (const [k, label] of [
    ['terracos_material', 'Terraços e varandas — material'],
    ['banheiras_material', 'Banheiras de WC — material'],
    ['muros_material', 'Muros enterrados — material'],
    ['juntas_material', 'Juntas de dilatação — material'],
    ['outros_material', 'Outras impermeabilizações — material'],
  ]) {
    if (num(s[k]) > 0)
      out.push(linhaMaterial(label, num(s[k]), `${num(s[k])} €`, tMat))
  }
  out.push(moDaSeccao(s, 'Impermeabilizações', tMO))
  return out.filter(Boolean)
}

// 11. Rebocos e estuques
function linhasRebocos(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  for (const [k, label] of [
    ['chapisco_material', 'Chapisco — material'],
    ['reboco_trad_material', 'Reboco tradicional — material'],
    ['estuque_proj_material', 'Estuque projectado — material'],
    ['gesso_paredes_material', 'Gesso cartonado em paredes — material'],
  ]) {
    if (num(s[k]) > 0)
      out.push(linhaMaterial(label, num(s[k]), `${num(s[k])} €`, tMat))
  }
  out.push(moDaSeccao(s, 'Rebocos e estuques', tMO))
  return out.filter(Boolean)
}

// 12. Caixilharias
function linhasCaixilharias(s, pisos, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const auto = !!s.autoliquidacao
  const out = []
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const n = num(piso.n_janelas), area = num(piso.area_janela_m2), eur = num(piso.eur_m2)
      if (n * area * eur > 0)
        out.push(linhaMaterial(`${p.nome} — janelas (material)`,
          n * area * eur, `${n} × ${area}m² × ${eur} €/m²`, tMat))
    }
  }
  if (num(s.cb_un) * num(s.cb_eur_un) > 0)
    out.push(linhaMaterial('Janelas casa de banho', num(s.cb_un) * num(s.cb_eur_un),
      `${num(s.cb_un)} × ${num(s.cb_eur_un)} €/un`, tMat))
  if (num(s.soleiras_un) * num(s.soleiras_eur_un) > 0)
    out.push(linhaMaterial('Soleiras (material)',
      num(s.soleiras_un) * num(s.soleiras_eur_un),
      `${num(s.soleiras_un)} × ${num(s.soleiras_eur_un)} €/un`, tMat))
  out.push(moDaSeccao(s, 'Caixilharia + soleiras', tMO))
  return out.filter(Boolean)
}

// 13. VMC
function linhasVmc(s, pisos, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const v = num(piso.material ?? piso.base)
      if (v > 0)
        out.push(linhaMaterial(`${p.nome} — VMC (material)`, v, `${v} €`, tMat))
    }
  }
  out.push(moDaSeccao(s, 'VMC — instalação', tMO))
  return out.filter(Boolean)
}

// 14. Pintura
function linhasPintura(s, pisos, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const auto = !!s.autoliquidacao
  const out = []
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const par = num(piso.m2_paredes), tet = num(piso.m2_teto)
      const m2 = par + tet
      // Preparação (lixagem, betume, primário) — material
      const prepEur = num(piso.preparacao_eur_m2)
      if (m2 * prepEur > 0)
        out.push(linhaMaterial(`${p.nome} — preparação pintura (material)`,
          m2 * prepEur, `${m2}m² × ${prepEur} €/m²`, tMat))
      // Acabamento — material
      const eurMat = num(piso.eur_m2_material ?? piso.eur_m2)
      if (m2 * eurMat > 0)
        out.push(linhaMaterial(`${p.nome} — pintura interior (material)`,
          m2 * eurMat, `(${par}+${tet})m² × ${eurMat} €/m²`, tMat))
    }
  }
  // Exterior (material)
  if (num(s.exterior_m2) * num(s.exterior_eur_m2_material ?? s.exterior_eur_m2) > 0) {
    const eurExt = num(s.exterior_eur_m2_material ?? s.exterior_eur_m2)
    out.push(linhaMaterial('Pintura exterior (material)',
      num(s.exterior_m2) * eurExt,
      `${num(s.exterior_m2)}m² × ${eurExt} €/m²`, tMat))
  }
  out.push(moDaSeccao(s, 'Pintura', tMO))
  return out.filter(Boolean)
}

// 15. Casas de banho
function linhasCasasBanho(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const auto = !!s.autoliquidacao
  const un = num(s.un)
  const out = []
  if (un > 0) {
    for (const [k, label] of [
      ['loucas_eur_un', 'Louças + torneiras'],
      ['cer_mat_eur_un', 'Cerâmicos + materiais'],
      ['mobiliario_eur_un', 'Mobiliário + espelho'],
    ]) {
      const v = num(s[k])
      if (v > 0) out.push(linhaMaterial(`${label} (×${un} CB)`, un * v, `${un} × ${v} €/un`, tMat))
    }
  }
  // Extras fora WC: lava-louça cozinha, torneira exterior, máquina de lavar pontos
  for (const [k, label] of [
    ['lava_louca_cozinha', 'Lava-louça cozinha'],
    ['torneira_exterior', 'Torneira exterior'],
    ['maquina_pontos', 'Pontos máquina lavar/secar'],
    ['outros_pichelaria', 'Outras peças pichelaria'],
  ]) {
    if (num(s[k]) > 0) out.push(linhaMaterial(label, num(s[k]), `${num(s[k])} €`, tMat))
  }
  out.push(moDaSeccao(s, 'Casas de banho — instalação', tMO))
  return out.filter(Boolean)
}

// 16. Portas
function linhasPortas(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const un = num(s.un)
  const out = []
  if (un * num(s.eur_un_material ?? s.eur_un) > 0) {
    const eur = num(s.eur_un_material ?? s.eur_un)
    out.push(linhaMaterial(`Portas — material (${un}×)`, un * eur, `${un} × ${eur} €/un`, tMat))
  }
  out.push(moDaSeccao(s, 'Portas — aplicação', tMO))
  return out.filter(Boolean)
}

// 17. Carpintarias interiores (rodapés, aros, roupeiros)
function linhasCarpintarias(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  for (const [k, label] of [
    ['rodapes_material', 'Rodapés — material'],
    ['aros_guarnicoes_material', 'Aros e guarnições — material'],
    ['roupeiros_material', 'Roupeiros embutidos — material'],
    ['escadas_madeira_material', 'Escadas madeira — material'],
    ['tectos_madeira_material', 'Tectos madeira restaurados — material'],
    ['outros_material', 'Outras carpintarias — material'],
  ]) {
    if (num(s[k]) > 0) out.push(linhaMaterial(label, num(s[k]), `${num(s[k])} €`, tMat))
  }
  out.push(moDaSeccao(s, 'Carpintarias interiores', tMO))
  return out.filter(Boolean)
}

// 18. Serralharias
function linhasSerralharias(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  for (const [k, label] of [
    ['gradeamentos_material', 'Gradeamentos — material'],
    ['guardas_varanda_material', 'Guardas varanda — material'],
    ['portoes_material', 'Portões — material'],
    ['corrimaos_material', 'Corrimãos — material'],
    ['portas_corta_fogo_material', 'Portas corta-fogo — material'],
    ['outros_material', 'Outras serralharias — material'],
  ]) {
    if (num(s[k]) > 0) out.push(linhaMaterial(label, num(s[k]), `${num(s[k])} €`, tMat))
  }
  out.push(moDaSeccao(s, 'Serralharias', tMO))
  return out.filter(Boolean)
}

// 19. Cozinhas
function linhasCozinhas(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const un = num(s.un)
  const out = []
  if (un > 0) {
    for (const [k, label] of [
      ['moveis_eur_un', 'Móveis cozinha'],
      ['bancada_eur_un', 'Bancada'],
      ['electro_eur_un', 'Electrodomésticos'],
    ]) {
      const v = num(s[k])
      if (v > 0)
        out.push(linhaMaterial(`${label} (×${un})`, un * v, `${un} × ${v} €/un`, tMat))
    }
  }
  out.push(moDaSeccao(s, 'Cozinhas — instalação', tMO))
  return out.filter(Boolean)
}

// 20. Capoto / ETICS exterior
function linhasCapoto(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  const liq = num(s.fachada_m2_liquido)
  const eurMat = num(s.eur_m2_material ?? s.eur_m2)
  if (liq * eurMat > 0)
    out.push(linhaMaterial('Capoto / ETICS — material',
      liq * eurMat, `${liq}m² × ${eurMat} €/m²`, tMat))
  if (num(s.remates_m) * num(s.remates_eur_m) > 0)
    out.push(linhaMaterial('Remates capoto (material)',
      num(s.remates_m) * num(s.remates_eur_m),
      `${num(s.remates_m)}m × ${num(s.remates_eur_m)} €/m`, tMat))
  out.push(moDaSeccao(s, 'Capoto', tMO))
  return out.filter(Boolean)
}

// 21. Andaimes (autonomizado de Capoto)
function linhasAndaimes(s, regime) {
  s = s || {}
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  // Aluguer mensal (material/serviço de locação — 23% normalmente)
  const m2 = num(s.m2), eurMes = num(s.eur_m2_mes), meses = num(s.meses)
  if (m2 * eurMes * meses > 0)
    out.push(linhaMaterial('Aluguer andaimes',
      m2 * eurMes * meses, `${m2}m² × ${eurMes} €/m²·mês × ${meses} meses`, tMat))
  // Montagem/desmontagem (MO)
  const tMO = taxaMO(regime.tipo_obra)
  out.push(moDaSeccao(s, 'Andaimes — montagem/desmontagem', tMO))
  return out.filter(Boolean)
}

// 22. Cobertura (com sub-rubricas: estrutura, revestimento, remates)
function linhasCobertura(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  const m2 = num(s.m2)
  // Estrutura madeiramento
  const estEur = num(s.estrutura_eur_m2)
  if (m2 * estEur > 0)
    out.push(linhaMaterial('Cobertura — estrutura/madeiramento (material)',
      m2 * estEur, `${m2}m² × ${estEur} €/m²`, tMat))
  // Revestimento (telha)
  const revEur = num(s.revestimento_eur_m2 ?? s.eur_m2_material ?? s.eur_m2)
  if (m2 * revEur > 0)
    out.push(linhaMaterial('Cobertura — revestimento telha (material)',
      m2 * revEur, `${m2}m² × ${revEur} €/m²`, tMat))
  // Remates (rufos, caleiras, algerozes)
  if (num(s.remates_total) > 0)
    out.push(linhaMaterial('Cobertura — remates (rufos, caleiras)',
      num(s.remates_total), `${num(s.remates_total)} €`, tMat))
  out.push(moDaSeccao(s, 'Cobertura', tMO))
  return out.filter(Boolean)
}

// 23. Equipamento e logística (despesas indirectas)
function linhasEquipamento(s, regime) {
  s = s || {}
  const tMat = taxaMaterial(regime.zona_aru)
  const out = []
  for (const [k, label] of [
    ['aluguer_mini_grua', 'Aluguer mini-grua'],
    ['aluguer_betoneira', 'Aluguer betoneira'],
    ['aluguer_plataforma', 'Aluguer plataforma elevatória'],
    ['aluguer_outros', 'Outros equipamentos alugados'],
    ['transportes', 'Transportes / portes de material'],
    ['ferramentas', 'Ferramentas e consumíveis'],
  ]) {
    if (num(s[k]) > 0) out.push(linhaMaterial(label, num(s[k]), `${num(s[k])} €`, tMat))
  }
  // Consumos de obra (água/luz provisórias) — taxas
  if (num(s.consumos_agua) > 0)
    out.push(linhaTaxa('Consumo água provisória obra', num(s.consumos_agua)))
  if (num(s.consumos_luz) > 0)
    out.push(linhaTaxa('Consumo electricidade provisória obra', num(s.consumos_luz)))
  return out.filter(Boolean)
}

// 24. Licenciamento + Fiscalização + Seguros
function linhasLicenciamento(s) {
  s = s || {}
  const out = []
  if (num(s.projeto) > 0)
    out.push(linhaHonorarios('Projecto especialidade/arquitectura',
      num(s.projeto), `${num(s.projeto)} €`, s.projeto_singular ? 25 : 0))
  if (num(s.fiscalizacao_perc) > 0 && num(s.base_obra_para_fiscalizacao) > 0) {
    const v = round2(num(s.base_obra_para_fiscalizacao) * num(s.fiscalizacao_perc) / 100)
    out.push(linhaHonorarios('Fiscalização técnica de obra', v,
      `${num(s.fiscalizacao_perc)}% × ${num(s.base_obra_para_fiscalizacao)} €`, s.fiscalizacao_singular ? 25 : 0))
  } else if (num(s.fiscalizacao) > 0) {
    out.push(linhaHonorarios('Fiscalização técnica de obra', num(s.fiscalizacao),
      `${num(s.fiscalizacao)} €`, s.fiscalizacao_singular ? 25 : 0))
  }
  if (num(s.tro) > 0)
    out.push(linhaHonorarios('TRO — Técnico Responsável de Obra',
      num(s.tro), `${num(s.tro)} €`, s.tro_singular ? 25 : 0))
  if (num(s.seguro_car) > 0)
    out.push(linhaIsento('Seguro CAR (Construction All Risks)', num(s.seguro_car), `${num(s.seguro_car)} € (isento art 9º)`))
  if (num(s.seguro_rc) > 0)
    out.push(linhaIsento('Seguro RC empreiteiro', num(s.seguro_rc)))
  if (num(s.taxas_municipais) > 0)
    out.push(linhaTaxa('Taxas municipais / urbanísticas', num(s.taxas_municipais)))
  if (num(s.taxa_ocup_via_publica) > 0)
    out.push(linhaTaxa('Taxa ocupação via pública', num(s.taxa_ocup_via_publica)))
  if (num(s.solicitador) > 0)
    out.push(linhaHonorarios('Solicitador / registos',
      num(s.solicitador), `${num(s.solicitador)} €`, s.solicitador_singular ? 25 : 0))
  if (num(s.livro_obra) > 0)
    out.push(linhaTaxa('Livro de obra + alvará', num(s.livro_obra)))
  if (num(s.sce) > 0)
    out.push(linhaHonorarios('Certificado energético (SCE)',
      num(s.sce), `${num(s.sce)} €`, s.sce_singular ? 25 : 0))
  return out.filter(Boolean)
}

// 25. Fecho de obra e ensaios
function linhasFechoObra(s, regime) {
  s = s || {}
  const tMO = taxaMO(regime.tipo_obra)
  const out = []
  // Honorários
  if (num(s.telas_finais) > 0)
    out.push(linhaHonorarios('Telas finais (as-built)', num(s.telas_finais),
      `${num(s.telas_finais)} €`, s.telas_singular ? 25 : 0))
  if (num(s.fth) > 0)
    out.push(linhaHonorarios('Ficha Técnica de Habitação (FTH)', num(s.fth),
      `${num(s.fth)} €`, s.fth_singular ? 25 : 0))
  if (num(s.sce_final) > 0)
    out.push(linhaHonorarios('SCE final pós-obra', num(s.sce_final),
      `${num(s.sce_final)} €`, s.sce_final_singular ? 25 : 0))
  // Ensaios
  if (num(s.ensaios_total) > 0)
    out.push(linhaHonorarios('Ensaios obrigatórios (gás, água, eléct., infiltrometria)',
      num(s.ensaios_total), `${num(s.ensaios_total)} €`))
  // Vistoria final câmara
  if (num(s.vistoria_camara) > 0)
    out.push(linhaTaxa('Vistoria final câmara + licença utilização', num(s.vistoria_camara)))
  // Limpeza final pós-obra (MO)
  if (num(s.limpeza_dias) > 0 && num(s.limpeza_eur_dia) > 0)
    out.push(linhaServico('Limpeza final pós-obra',
      num(s.limpeza_dias) * num(s.limpeza_eur_dia),
      `${num(s.limpeza_dias)} dias × ${num(s.limpeza_eur_dia)} €/dia`, tMO))
  return out.filter(Boolean)
}

// ── Linhas livres (custom) ─────────────────────────────────
// Tipo derivado pelo utilizador (ou auto: se unidade=dias → MO; senão → material)
function linhasCustom(s, regime) {
  const arr = Array.isArray(s?.custom_lines) ? s.custom_lines : []
  const out = []
  const tMO = taxaMO(regime.tipo_obra)
  const tMat = taxaMaterial(regime.zona_aru)
  for (const c of arr) {
    const qtd = num(c.qtd)
    if (qtd <= 0) continue
    const desc = c.descricao || 'Linha custom'
    const baseMat = qtd * num(c.mat_eur_un)
    const baseMO  = qtd * num(c.mo_eur_un)
    const auto = !!c.autoliq_mo
    const ret = num(c.retencao_irs)
    if (baseMat > 0) {
      out.push(linha({
        descricao: `${desc} — material`, base: baseMat, taxa_iva: tMat,
        formula: `${qtd} ${c.unidade || 'un'} × ${num(c.mat_eur_un)} €/${c.unidade || 'un'}`,
        tipo: c.tipo_override === 'servicos' ? 'servicos' : 'material',
      }))
    }
    if (baseMO > 0) {
      out.push(linha({
        descricao: `${desc} — mão-de-obra`, base: baseMO, taxa_iva: tMO,
        autoliquidacao: auto, retencao_irs: ret,
        formula: `${qtd} ${c.unidade || 'un'} × ${num(c.mo_eur_un)} €/${c.unidade || 'un'}`,
        tipo: c.tipo_override === 'servicos' ? 'servicos'
            : c.tipo_override === 'honorarios' ? 'honorarios' : 'mo',
      }))
    }
    // Linha simples uni-componente
    if (baseMat === 0 && baseMO === 0) {
      const baseUni = qtd * num(c.eur_un)
      if (baseUni > 0) {
        const tipoSim = c.tipo_override || (c.unidade === 'dias' || c.unidade === 'h' ? 'mo' : 'material')
        const taxaSim = tipoSim === 'mo' ? tMO : tipoSim === 'honorarios' ? 23 : tMat
        out.push(linha({
          descricao: desc, base: baseUni, taxa_iva: taxaSim,
          autoliquidacao: auto, retencao_irs: ret,
          formula: `${qtd} ${c.unidade || 'un'} × ${num(c.eur_un)} €/${c.unidade || 'un'}`,
          tipo: tipoSim,
        }))
      }
    }
  }
  return out
}

function comCustom(resolverFn) {
  return (s, p, r) => [...(resolverFn(s, p, r) || []), ...linhasCustom(s, r)]
}

// ════════════════════════════════════════════════════════════
// Mapeamento secção → função
// ════════════════════════════════════════════════════════════
const RESOLVERS = {
  estaleiro:           comCustom((s, p, r) => linhasEstaleiro(s, r)),
  demolicoes:          comCustom((s, p, r) => linhasDemolicoes(s, r)),
  rcd:                 comCustom((s, p, r) => linhasRCD(s, r)),
  estrutura:           comCustom((s, p, r) => linhasEstrutura(s, r)),
  eletricidade:        comCustom((s, p, r) => linhasEletricidade(s, p, r)),
  avac:                comCustom((s, p, r) => linhasAvac(s, r)),
  pavimento:           comCustom((s, p, r) => linhasPavimento(s, p, r)),
  pladur:              comCustom((s, p, r) => linhasPladur(s, p, r)),
  isolamento:          comCustom((s, p, r) => linhasIsolamento(s, r)),
  impermeabilizacoes:  comCustom((s, p, r) => linhasImpermeabilizacoes(s, r)),
  rebocos:             comCustom((s, p, r) => linhasRebocos(s, r)),
  caixilharias:        comCustom((s, p, r) => linhasCaixilharias(s, p, r)),
  vmc:                 comCustom((s, p, r) => linhasVmc(s, p, r)),
  pintura:             comCustom((s, p, r) => linhasPintura(s, p, r)),
  casas_banho:         comCustom((s, p, r) => linhasCasasBanho(s, r)),
  portas:              comCustom((s, p, r) => linhasPortas(s, r)),
  carpintarias:        comCustom((s, p, r) => linhasCarpintarias(s, r)),
  serralharias:        comCustom((s, p, r) => linhasSerralharias(s, r)),
  cozinhas:            comCustom((s, p, r) => linhasCozinhas(s, r)),
  andaimes:            comCustom((s, p, r) => linhasAndaimes(s, r)),
  capoto:              comCustom((s, p, r) => linhasCapoto(s, r)),
  cobertura:           comCustom((s, p, r) => linhasCobertura(s, r)),
  equipamento:         comCustom((s, p, r) => linhasEquipamento(s, r)),
  licenciamento:       comCustom((s, p, r) => linhasLicenciamento(s)),
  fecho_obra:          comCustom((s, p, r) => linhasFechoObra(s, r)),
}

// ── Constantes exportadas ───────────────────────────────────
export const TAXAS_IVA = [0, 6, 13, 23]

export const RETENCOES_IRS = [
  { key: 0,    label: 'Nenhuma' },
  { key: 11.5, label: '11,5% (sub-empreiteiro construção civil)' },
  { key: 25,   label: '25% (serviços categoria B)' },
]

export const TIPOS_OBRA = [
  { key: 'remodelacao',     label: 'Remodelação',      iva_mo: 6 },
  { key: 'construcao_nova', label: 'Construção nova',  iva_mo: 23 },
]

export const SECCOES_OBRA = [
  'estaleiro', 'demolicoes', 'rcd', 'estrutura', 'eletricidade', 'avac',
  'pavimento', 'pladur', 'isolamento', 'impermeabilizacoes', 'rebocos',
  'caixilharias', 'vmc', 'pintura', 'casas_banho', 'portas',
  'carpintarias', 'serralharias', 'cozinhas',
  'andaimes', 'capoto', 'cobertura', 'equipamento',
]
export const SECCOES_EXTRA = ['licenciamento', 'fecho_obra']
export const SECCOES_ORDEM = [...SECCOES_OBRA, ...SECCOES_EXTRA]

export const SECCOES_LABELS = {
  estaleiro:           'Estaleiro de obra',
  demolicoes:          'Demolições e limpeza',
  rcd:                 'RCD — Resíduos (DL 102-D/2020)',
  estrutura:           'Estrutura',
  eletricidade:        'Eletricidade e canalização',
  avac:                'AVAC / Solar / AQS',
  pavimento:           'Pavimento',
  pladur:              'Pladur tetos',
  isolamento:          'Isolamento térmico/acústico',
  impermeabilizacoes:  'Impermeabilizações',
  rebocos:             'Rebocos e estuques',
  caixilharias:        'Caixilharias',
  vmc:                 'Sistema VMC',
  pintura:             'Pintura',
  casas_banho:         'Casas de banho e pichelaria',
  portas:              'Portas',
  carpintarias:        'Carpintarias interiores',
  serralharias:        'Serralharias',
  cozinhas:            'Cozinhas',
  andaimes:            'Andaimes',
  capoto:              'Capoto / ETICS exterior',
  cobertura:           'Cobertura',
  equipamento:         'Equipamento e logística',
  licenciamento:       'Licenciamento, fiscalização e seguros',
  fecho_obra:          'Fecho de obra e ensaios',
}

// Retro-compatibilidade: REGIMES_FISCAIS deprecado mas mantido para imports
export const REGIMES_FISCAIS = [
  { key: 'normal',     label: 'Normal',                        iva_default: 23 },
  { key: 'aru',        label: 'Reabilitação ARU (Verba 2.27)', iva_default: 6 },
  { key: 'habitacao',  label: 'Habitação (Verba 2.32)',        iva_default: 6 },
  { key: 'rjru',       label: 'RJRU (DL 53/2014)',             iva_default: 23 },
]

// Converte regime_fiscal antigo para flags v4 (zona_aru + tipo_obra)
function migrarRegime(regime) {
  if (regime === 'aru' || regime === 'habitacao') return { zona_aru: true, tipo_obra: 'remodelacao' }
  return { zona_aru: false, tipo_obra: 'remodelacao' }
}

// ════════════════════════════════════════════════════════════
// Motor principal
// ════════════════════════════════════════════════════════════
export function calcOrcamentoObra(orcamento) {
  const o = orcamento || {}
  const pisos = Array.isArray(o.pisos) ? o.pisos : []
  const s = o.seccoes || {}
  // Suportar formato antigo (regime_fiscal) e novo (zona_aru + tipo_obra)
  let zona_aru = !!o.zona_aru
  let tipo_obra = o.tipo_obra || 'remodelacao'
  if (o.regime_fiscal && o.zona_aru === undefined) {
    const m = migrarRegime(o.regime_fiscal)
    zona_aru = m.zona_aru
    tipo_obra = m.tipo_obra
  }
  const regime = { zona_aru, tipo_obra }

  const seccoes = {}
  const porTipo = {
    material:   { base: 0, iva: 0 },
    mo:         { base: 0, iva: 0, autoliq: 0 },
    servicos:   { base: 0, iva: 0, autoliq: 0 },
    honorarios: { base: 0, iva: 0, retencoes: 0 },
    taxas:      { base: 0 },
    isento:     { base: 0 },
    misto:      { base: 0, iva: 0, autoliq: 0 },
  }

  for (const key of [...SECCOES_OBRA, ...SECCOES_EXTRA]) {
    const fn = RESOLVERS[key]
    const linhas = (fn ? fn(s[key], pisos, regime) : []) || []
    const subtotal_base = round2(linhas.reduce((a, l) => a + l.base, 0))
    const subtotal_iva = round2(linhas.reduce((a, l) => a + (l.autoliquidacao ? 0 : l.iva), 0))
    const iva_autoliq = round2(linhas.reduce((a, l) => a + (l.autoliquidacao ? l.iva : 0), 0))
    const retencoes = round2(linhas.reduce((a, l) => a + l.retencao_valor, 0))

    for (const l of linhas) {
      const t = l.tipo || 'misto'
      const slot = porTipo[t] || (porTipo[t] = { base: 0, iva: 0 })
      slot.base = round2(slot.base + l.base)
      if (l.autoliquidacao) {
        if (slot.autoliq != null) slot.autoliq = round2(slot.autoliq + l.iva)
      } else {
        slot.iva = round2(slot.iva + l.iva)
      }
      if (slot.retencoes != null) slot.retencoes = round2(slot.retencoes + l.retencao_valor)
    }

    seccoes[key] = {
      linhas, subtotal_base, subtotal_iva, iva_autoliq, retencoes,
      subtotal_bruto: round2(subtotal_base + subtotal_iva),
    }
  }

  // BDI sobre base de obra (excluindo extra)
  const bdi = o.bdi || {}
  const baseObra = round2(Object.entries(seccoes)
    .filter(([k]) => SECCOES_OBRA.includes(k))
    .reduce((a, [, v]) => a + v.subtotal_base, 0))
  const imprevistos_perc = num(bdi.imprevistos_perc ?? 0)
  const margem_perc = num(bdi.margem_perc ?? 0)
  const imprevistos_base = round2(baseObra * imprevistos_perc / 100)
  const margem_base = round2(baseObra * margem_perc / 100)
  const taxa_bdi = bdi.taxa_iva != null ? num(bdi.taxa_iva) : taxaMaterial(zona_aru)
  const bdi_iva = round2((imprevistos_base + margem_base) * taxa_bdi / 100)

  const total_base_obra = round2(baseObra + imprevistos_base + margem_base)
  const total_iva_obra = round2(Object.entries(seccoes)
    .filter(([k]) => SECCOES_OBRA.includes(k))
    .reduce((a, [, v]) => a + v.subtotal_iva, 0) + bdi_iva)
  const total_iva_autoliq_obra = round2(Object.entries(seccoes)
    .filter(([k]) => SECCOES_OBRA.includes(k))
    .reduce((a, [, v]) => a + v.iva_autoliq, 0))
  const total_retencoes_obra = round2(Object.entries(seccoes)
    .filter(([k]) => SECCOES_OBRA.includes(k))
    .reduce((a, [, v]) => a + v.retencoes, 0))

  const baseExtra = round2(Object.entries(seccoes)
    .filter(([k]) => SECCOES_EXTRA.includes(k))
    .reduce((a, [, v]) => a + v.subtotal_base, 0))
  const ivaExtra = round2(Object.entries(seccoes)
    .filter(([k]) => SECCOES_EXTRA.includes(k))
    .reduce((a, [, v]) => a + v.subtotal_iva, 0))
  const retencoesExtra = round2(Object.entries(seccoes)
    .filter(([k]) => SECCOES_EXTRA.includes(k))
    .reduce((a, [, v]) => a + v.retencoes, 0))

  const total_base_geral = round2(total_base_obra + baseExtra)
  const total_iva_geral = round2(total_iva_obra + ivaExtra)
  const total_geral_bruto = round2(total_base_geral + total_iva_geral)
  const total_pagar = round2(total_geral_bruto - total_iva_autoliq_obra - total_retencoes_obra - retencoesExtra)

  return {
    zona_aru, tipo_obra,
    taxas: {
      material: taxaMaterial(zona_aru),
      mo: taxaMO(tipo_obra),
    },
    seccoes,
    bdi: {
      imprevistos_perc, imprevistos_base,
      margem_perc, margem_base,
      taxa_iva: taxa_bdi,
      iva: bdi_iva,
    },
    totais: {
      base_obra: round2(baseObra),
      base_obra_com_bdi: total_base_obra,
      iva_obra: total_iva_obra,
      iva_autoliquidado: total_iva_autoliq_obra,
      retencoes_irs: round2(total_retencoes_obra + retencoesExtra),
      base_extra: baseExtra,
      iva_extra: ivaExtra,
      base_geral: total_base_geral,
      iva_geral: total_iva_geral,
      bruto_geral: total_geral_bruto,
      a_pagar: total_pagar,
      por_tipo: porTipo,
      // compat: campos antigos (base_licenciamento)
      base_licenciamento: seccoes.licenciamento?.subtotal_base ?? 0,
      iva_licenciamento: seccoes.licenciamento?.subtotal_iva ?? 0,
      racio_material: 0,    // descontinuado
      excede_20: false,
      beneficio_perdido: false,
    },
    total_obra: round2(total_geral_bruto - baseExtra - ivaExtra),
    total_licenciamento: round2(baseExtra + ivaExtra),
    total_geral: total_geral_bruto,
    subtotais: Object.fromEntries(Object.entries(seccoes).map(([k, v]) => [k, v.subtotal_bruto])),
  }
}

// ── Validação fiscal + aritmética ──────────────────────────
export function validarOrcamento(orcamento) {
  const avisos = []
  const o = orcamento || {}
  // Avisos informativos sobre regime fiscal aplicável
  if (o.zona_aru) {
    avisos.push({
      seccao: 'global', tipo: 'fiscal',
      msg: 'Zona ARU activada — Verba 2.27 CIVA: material a 6%. Confirme documentação obrigatória: declaração do dono da obra ao empreiteiro, certificação ARU/IHRU.',
    })
  }
  if (o.tipo_obra === 'remodelacao') {
    avisos.push({
      seccao: 'global', tipo: 'fiscal',
      msg: 'Tipo de obra: Remodelação — IVA 6% sobre mão-de-obra. Construção nova obrigaria a IVA 23% na MO.',
    })
  }
  return avisos
}
