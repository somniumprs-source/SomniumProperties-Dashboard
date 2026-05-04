/**
 * Motor de cálculo do orçamento de obra (v2 — auditável fiscalmente).
 *
 * Modelo de cada LINHA:
 *   {
 *     descricao: string,
 *     base: number,                // sem IVA
 *     taxa_iva: 0 | 6 | 13 | 23,    // por linha
 *     autoliquidacao: boolean,      // CIVA art 2º nº1 al. j) — IVA não soma ao total a pagar
 *     retencao_irs: 0 | 11.5 | 25,  // categoria B (singular) — desconto líquido a pagar
 *     capitalizavel: boolean,       // NCRF 18 — entra no inventário (default true)
 *     verba_iva?: '2.23' | '2.27' | '2.32' | '...',
 *   }
 *
 * Regime fiscal do orçamento (em `regime_fiscal`):
 *   'normal'   — IVA 23% generalizado (default)
 *   'aru'      — Verba 2.27 Lista I CIVA (reabilitação em ARU): 6%
 *   'rjru'     — DL 53/2014, eventual isenção/redução IMT/IMI (não afecta IVA por defeito)
 *   'habitacao' — Verba 2.32 (ex 2.23 — empreitadas em habitação) sujeito à regra dos 20% de materiais
 *
 * Convenções:
 *   - Valores numéricos com 2 casas internamente; arredondamento só para output
 *   - Linhas com `base = 0` são ignoradas
 *   - `autoliquidacao = true` → IVA é meramente informativo (passa para o adquirente);
 *     o "total a pagar ao prestador" = base, mas o "total fiscal do orçamento" = base + IVA
 *
 * Fonte da verdade — usado pelo backend (PUT) e pelo frontend (cálculo realtime).
 */

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n) => Math.round(n * 100) / 100

// ── Construtor de linha normalizada ─────────────────────────
function linha({ descricao, base, taxa_iva = 23, autoliquidacao = false, retencao_irs = 0, capitalizavel = true, verba_iva, formula }) {
  const b = num(base)
  const t = num(taxa_iva)
  const iva = round2(b * t / 100)
  const ret = round2(b * num(retencao_irs) / 100)
  return {
    descricao,
    formula,
    base: round2(b),
    taxa_iva: t,
    iva,
    autoliquidacao: !!autoliquidacao,
    retencao_irs: num(retencao_irs),
    retencao_valor: ret,
    capitalizavel: capitalizavel !== false,
    verba_iva,
    // Total efectivo a pagar ao prestador (sem IVA se autoliq, líquido de retenção)
    valor_pagar: round2(b - ret + (autoliquidacao ? 0 : iva)),
    // Total bruto fiscal (sempre inclui IVA, mesmo que autoliquidado para o adquirente)
    valor_bruto: round2(b + iva),
  }
}

// ── Helper: se taxa_iva da linha não definida, usa default do regime ──
function taxaPorDefeito(regime, override) {
  if (Number.isFinite(Number(override))) return Number(override)
  if (regime === 'aru' || regime === 'habitacao') return 6
  return 23
}

// ── Resolver linhas com base na config do utilizador ────────
// Cada secção devolve uma lista de linhas. Regras de IVA e
// autoliquidação ficam aqui: o user pode override por linha
// no campo `seccoes[key].iva_override` ou flag `autoliq`.

function leOverride(s, key) {
  if (!s) return {}
  const o = s[`__${key}__`] || {}
  return {
    taxa_iva: o.taxa_iva,
    autoliquidacao: o.autoliquidacao,
    retencao_irs: o.retencao_irs,
  }
}

// ── 1. Demolições ───────────────────────────────────────────
function linhasDemolicoes(s, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  if (num(s.entulhos) > 0) {
    out.push(linha({
      descricao: 'Entrega de entulhos',
      base: num(s.entulhos), taxa_iva: t, autoliquidacao: auto,
      formula: `${num(s.entulhos)} €`,
    }))
  }
  if (num(s.remocao_dias) * num(s.remocao_eur_dia) > 0) {
    out.push(linha({
      descricao: 'Remoção e transporte',
      base: num(s.remocao_dias) * num(s.remocao_eur_dia),
      taxa_iva: t, autoliquidacao: auto,
      formula: `${num(s.remocao_dias)} dias × ${num(s.remocao_eur_dia)} €/dia`,
    }))
  }
  if (num(s.nivel_m2) * num(s.nivel_altura) * num(s.nivel_eur_m3) > 0) {
    out.push(linha({
      descricao: 'Nivelamento (toutvenant)',
      base: num(s.nivel_m2) * num(s.nivel_altura) * num(s.nivel_eur_m3),
      taxa_iva: t, autoliquidacao: auto,
      formula: `${num(s.nivel_m2)}m² × ${num(s.nivel_altura)}m × ${num(s.nivel_eur_m3)} €/m³`,
    }))
  }
  if (num(s.limpeza_dias) * num(s.limpeza_eur_dia) > 0) {
    out.push(linha({
      descricao: 'Limpeza interior + terreno',
      base: num(s.limpeza_dias) * num(s.limpeza_eur_dia),
      taxa_iva: t, autoliquidacao: auto,
      formula: `${num(s.limpeza_dias)} dias × ${num(s.limpeza_eur_dia)} €/dia`,
    }))
  }
  if (num(s.paredes_dias) * num(s.paredes_eur_dia) > 0) {
    out.push(linha({
      descricao: 'Demolição paredes / roços',
      base: num(s.paredes_dias) * num(s.paredes_eur_dia),
      taxa_iva: t, autoliquidacao: auto,
      formula: `${num(s.paredes_dias)} dias × ${num(s.paredes_eur_dia)} €/dia`,
    }))
  }
  return out
}

// ── 2. RCD (Resíduos Construção e Demolição) — DL 102-D/2020 ──
function linhasRCD(s, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const out = []
  for (const tipo of ['inerte', 'misto', 'perigoso']) {
    const q = num(s[`${tipo}_m3`])
    const p = num(s[`${tipo}_eur_m3`])
    if (q * p > 0) {
      out.push(linha({
        descricao: `RCD ${tipo} (transporte + operador licenciado)`,
        base: q * p, taxa_iva: t,
        formula: `${q}m³ × ${p} €/m³`,
      }))
    }
  }
  if (num(s.plano_gestao) > 0) {
    out.push(linha({
      descricao: 'Plano de prevenção e gestão de RCD',
      base: num(s.plano_gestao), taxa_iva: 23,
      formula: `${num(s.plano_gestao)} €`,
    }))
  }
  return out
}

// ── 3. Estrutura ────────────────────────────────────────────
function linhasEstrutura(s, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  const items = [
    ['lajes',           'Substituição/reforço de lajes',   '€'],
    ['vigamentos',      'Vigamentos / barrotes madeira',   '€'],
    ['pilares',         'Reforço de pilares',              '€'],
    ['escadas',         'Escadas interiores',              '€'],
    ['paredes_novas',   'Construção paredes novas',        '€'],
    ['outros',          'Outros trabalhos estruturais',    '€'],
  ]
  for (const [k, label] of items) {
    const v = num(s[k])
    if (v > 0) out.push(linha({ descricao: label, base: v, taxa_iva: t, autoliquidacao: auto, formula: `${v} €` }))
  }
  return out
}

// ── 4. Eletricidade e Canalização (sub-linhas + por piso) ──
function linhasEletricidade(s, pisos, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  // Por piso (modo simples — €/m² agregado)
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const m2 = num(piso.area_m2 ?? p.area_m2)
      const eur = num(piso.eur_m2)
      if (m2 * eur > 0) {
        out.push(linha({
          descricao: `${p.nome} — instalações (eléct. + canal.)`,
          base: m2 * eur, taxa_iva: t, autoliquidacao: auto,
          formula: `${m2}m² × ${eur} €/m²`,
        }))
      }
    }
  }
  // Sub-linhas opcionais (modo detalhado)
  const subs = [
    ['rede_electrica',  'Rede eléctrica + quadro QE'],
    ['ited',            'ITED (telecomunicações)'],
    ['agua_fria',       'Canalização água fria'],
    ['agua_quente',     'Canalização AQ + AQS'],
    ['esgotos',         'Esgotos prediais'],
    ['gas',             'Rede de gás'],
  ]
  for (const [k, label] of subs) {
    const v = num(s[k])
    if (v > 0) out.push(linha({ descricao: label, base: v, taxa_iva: t, autoliquidacao: auto, formula: `${v} €` }))
  }
  return out
}

// ── 5. AVAC / Solar / AQS ───────────────────────────────────
function linhasAvac(s, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const items = [
    ['split_un',        ['split_eur_un'],     'Splits / multi-split AC',         (un, eur) => `${un} × ${eur} €/un`],
    ['bomba_calor',     null,                 'Bomba de calor (AQS)',            (v) => `${v} €`],
    ['solar_termico',   null,                 'Painéis solares térmicos + depósito', (v) => `${v} €`],
    ['fotovoltaico_kwp',['fotovoltaico_eur_kwp'], 'Sistema fotovoltaico',         (k, eur) => `${k} kWp × ${eur} €/kWp`],
    ['recuperador',     null,                 'Recuperador de calor / lareira',  (v) => `${v} €`],
    ['outros_avac',     null,                 'Outros equipamentos AVAC',        (v) => `${v} €`],
  ]
  const out = []
  for (const [a, b, label, fmt] of items) {
    if (b) {
      const q = num(s[a]), p = num(s[b[0]])
      if (q * p > 0) out.push(linha({ descricao: label, base: q * p, taxa_iva: t, formula: fmt(q, p) }))
    } else {
      const v = num(s[a])
      if (v > 0) out.push(linha({ descricao: label, base: v, taxa_iva: t, formula: fmt(v) }))
    }
  }
  return out
}

// ── 6. Pavimento (por piso + tipo) ──────────────────────────
function linhasPavimento(s, pisos, regime) {
  if (!Array.isArray(pisos)) return []
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  return pisos.map(p => {
    const piso = s.por_piso?.[p.nome] || {}
    const m2 = num(piso.area_m2 ?? p.area_m2)
    const eur = num(piso.eur_m2)
    const tipo = piso.tipo || 'mosaico'
    if (m2 * eur <= 0) return null
    return linha({
      descricao: `${p.nome} — pavimento (${tipo})`,
      base: m2 * eur, taxa_iva: t, autoliquidacao: auto,
      formula: `${m2}m² × ${eur} €/m²`,
    })
  }).filter(Boolean)
}

// ── 7. Pladur tetos (com isolamento) ────────────────────────
function linhasPladur(s, pisos, regime) {
  if (!Array.isArray(pisos)) return []
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  return pisos.map(p => {
    const piso = s.por_piso?.[p.nome] || {}
    const m2 = num(piso.area_m2 ?? p.area_m2)
    const eur = num(piso.eur_m2)
    if (m2 * eur <= 0) return null
    return linha({
      descricao: `${p.nome} — pladur tecto`,
      base: m2 * eur, taxa_iva: t, autoliquidacao: auto,
      formula: `${m2}m² × ${eur} €/m²`,
    })
  }).filter(Boolean)
}

// ── 8. Isolamento térmico/acústico (REH) ────────────────────
function linhasIsolamento(s, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const items = [
    ['fachada_m2',    'fachada_eur_m2',   'Isolamento fachada (lã rocha/EPS)'],
    ['cobertura_m2',  'cobertura_eur_m2', 'Isolamento cobertura (laje esteira)'],
    ['pavimento_m2',  'pavimento_eur_m2', 'Isolamento pavimento sobre exterior'],
    ['acustico_m2',   'acustico_eur_m2',  'Isolamento acústico (paredes/pavimentos)'],
  ]
  return items.map(([qk, pk, label]) => {
    const q = num(s[qk]), p = num(s[pk])
    if (q * p <= 0) return null
    return linha({ descricao: label, base: q * p, taxa_iva: t, formula: `${q}m² × ${p} €/m²` })
  }).filter(Boolean)
}

// ── 9. Caixilharias ─────────────────────────────────────────
function linhasCaixilharias(s, pisos, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const n = num(piso.n_janelas), area = num(piso.area_janela_m2), eur = num(piso.eur_m2)
      if (n * area * eur > 0) {
        out.push(linha({
          descricao: `${p.nome} — janelas`,
          base: n * area * eur, taxa_iva: t, autoliquidacao: auto,
          formula: `${n} × ${area}m² × ${eur} €/m²`,
        }))
      }
    }
  }
  if (num(s.cb_un) * num(s.cb_eur_un) > 0) {
    out.push(linha({
      descricao: 'Janelas casa de banho',
      base: num(s.cb_un) * num(s.cb_eur_un), taxa_iva: t,
      formula: `${num(s.cb_un)} × ${num(s.cb_eur_un)} €/un`,
    }))
  }
  if (num(s.pedreiro) > 0) {
    out.push(linha({
      descricao: 'Trabalho pedreiro adjacente',
      base: num(s.pedreiro), taxa_iva: t, autoliquidacao: auto,
      formula: `${num(s.pedreiro)} €`,
    }))
  }
  if (num(s.soleiras_un) * num(s.soleiras_eur_un) > 0) {
    out.push(linha({
      descricao: 'Soleiras',
      base: num(s.soleiras_un) * num(s.soleiras_eur_un), taxa_iva: t,
      formula: `${num(s.soleiras_un)} × ${num(s.soleiras_eur_un)} €/un`,
    }))
  }
  return out
}

// ── 10. VMC ─────────────────────────────────────────────────
function linhasVmc(s, pisos, regime) {
  if (!Array.isArray(pisos)) return []
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  return pisos.map(p => {
    const piso = s.por_piso?.[p.nome] || {}
    const v = num(piso.base)
    if (v <= 0) return null
    return linha({ descricao: `${p.nome} — VMC`, base: v, taxa_iva: t, formula: `${v} € (base)` })
  }).filter(Boolean)
}

// ── 11. Pintura (interior + exterior) ───────────────────────
function linhasPintura(s, pisos, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const par = num(piso.m2_paredes), tet = num(piso.m2_teto), eur = num(piso.eur_m2)
      if ((par + tet) * eur > 0) {
        out.push(linha({
          descricao: `${p.nome} — pintura interior`,
          base: (par + tet) * eur, taxa_iva: t, autoliquidacao: auto,
          formula: `(${par}+${tet})m² × ${eur} €/m²`,
        }))
      }
    }
  }
  if (num(s.exterior_m2) * num(s.exterior_eur_m2) > 0) {
    out.push(linha({
      descricao: 'Pintura exterior',
      base: num(s.exterior_m2) * num(s.exterior_eur_m2), taxa_iva: t, autoliquidacao: auto,
      formula: `${num(s.exterior_m2)}m² × ${num(s.exterior_eur_m2)} €/m²`,
    }))
  }
  return out
}

// ── 12. Casas de banho (sep. mat / MO / louças) ─────────────
function linhasCasasBanho(s, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const un = num(s.un)
  const out = []
  if (un <= 0) return out
  for (const k of ['loucas_eur_un', 'cer_mat_eur_un', 'mo_eur_un', 'mobiliario_eur_un']) {
    const v = num(s[k])
    if (v > 0) {
      const labelMap = {
        loucas_eur_un: 'Louças sanitárias + torneiras',
        cer_mat_eur_un: 'Cerâmicos + materiais',
        mo_eur_un: 'Mão-de-obra (canal. + assentamento)',
        mobiliario_eur_un: 'Mobiliário e espelho',
      }
      const isMO = k === 'mo_eur_un'
      out.push(linha({
        descricao: `${labelMap[k]} (×${un} CB)`,
        base: un * v,
        taxa_iva: t,
        autoliquidacao: isMO ? auto : false,
        formula: `${un} × ${v} €/un`,
      }))
    }
  }
  return out
}

// ── 13. Portas ──────────────────────────────────────────────
function linhasPortas(s, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const un = num(s.un), eur = num(s.eur_un)
  if (un * eur <= 0) return []
  return [linha({
    descricao: `Portas interiores (${un}×)`,
    base: un * eur, taxa_iva: t,
    formula: `${un} × ${eur} €/un`,
  })]
}

// ── 14. Cozinhas (móveis + bancada + electro + MO) ──────────
function linhasCozinhas(s, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const un = num(s.un)
  if (un <= 0) return []
  const out = []
  const itens = [
    ['moveis_eur_un',    'Móveis cozinha',           23, false],
    ['bancada_eur_un',   'Bancada (pedra/compacto)', 23, false],
    ['electro_eur_un',   'Electrodomésticos',        23, false],
    ['mo_eur_un',        'Instalação (MO)',          t, auto],
  ]
  for (const [k, label, taxa, isAuto] of itens) {
    const v = num(s[k])
    if (v > 0) {
      out.push(linha({
        descricao: `${label} (×${un} cozinha${un > 1 ? 's' : ''})`,
        base: un * v, taxa_iva: taxa, autoliquidacao: isAuto,
        formula: `${un} × ${v} €/un`,
      }))
    }
  }
  return out
}

// ── 15. Capoto (m² fachada líquido + remates + andaime) ────
function linhasCapoto(s, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  const liq = num(s.fachada_m2_liquido), eur = num(s.eur_m2)
  if (liq * eur > 0) {
    out.push(linha({
      descricao: 'Capoto / ETICS — fachada (líquido de vãos)',
      base: liq * eur, taxa_iva: t, autoliquidacao: auto,
      formula: `${liq}m² × ${eur} €/m²`,
    }))
  }
  if (num(s.remates_m) * num(s.remates_eur_m) > 0) {
    out.push(linha({
      descricao: 'Remates (cantos, peitoris, pingadeiras)',
      base: num(s.remates_m) * num(s.remates_eur_m), taxa_iva: t,
      formula: `${num(s.remates_m)}m × ${num(s.remates_eur_m)} €/m`,
    }))
  }
  if (num(s.andaime_m2) * num(s.andaime_eur_m2_mes) * num(s.andaime_meses) > 0) {
    out.push(linha({
      descricao: 'Andaime de fachada',
      base: num(s.andaime_m2) * num(s.andaime_eur_m2_mes) * num(s.andaime_meses), taxa_iva: t,
      formula: `${num(s.andaime_m2)}m² × ${num(s.andaime_eur_m2_mes)} €/m²·mês × ${num(s.andaime_meses)} meses`,
    }))
  }
  return out
}

// ── 16. Cobertura (mat + MO + isolamento) ──────────────────
function linhasCobertura(s, regime) {
  s = s || {}
  const t = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const m2 = num(s.m2), eur = num(s.eur_m2)
  if (m2 * eur <= 0) return []
  return [linha({
    descricao: 'Cobertura (telha + estrutura + impermeab.)',
    base: m2 * eur, taxa_iva: t, autoliquidacao: auto,
    formula: `${m2}m² × ${eur} €/m²`,
  })]
}

// ── 17. Licenciamento + Fiscalização + Seguros ─────────────
//      Honorários: IVA 23% (não cobertos por verba reduzida).
//      Taxas municipais: SEM IVA (art. 2º nº 2 CIVA).
//      Honorários singulares podem ter retenção 25% (art. 101º CIRS).
function linhasLicenciamento(s) {
  s = s || {}
  const out = []
  if (num(s.projeto) > 0) {
    out.push(linha({
      descricao: 'Projecto especialidade/arquitectura',
      base: num(s.projeto),
      taxa_iva: 23,
      retencao_irs: s.projeto_singular ? 25 : 0,
      formula: `${num(s.projeto)} €`,
      capitalizavel: true,
    }))
  }
  if (num(s.fiscalizacao_perc) > 0 && num(s.base_obra_para_fiscalizacao) > 0) {
    const v = round2(num(s.base_obra_para_fiscalizacao) * num(s.fiscalizacao_perc) / 100)
    out.push(linha({
      descricao: 'Fiscalização técnica de obra',
      base: v, taxa_iva: 23,
      formula: `${num(s.fiscalizacao_perc)}% × ${num(s.base_obra_para_fiscalizacao)} € (base obra)`,
    }))
  } else if (num(s.fiscalizacao) > 0) {
    out.push(linha({
      descricao: 'Fiscalização técnica de obra',
      base: num(s.fiscalizacao), taxa_iva: 23,
      formula: `${num(s.fiscalizacao)} €`,
    }))
  }
  if (num(s.tro) > 0) {
    out.push(linha({
      descricao: 'Técnico Responsável de Obra (TRO)',
      base: num(s.tro), taxa_iva: 23,
      retencao_irs: s.tro_singular ? 25 : 0,
      formula: `${num(s.tro)} €`,
    }))
  }
  if (num(s.seguro_car) > 0) {
    out.push(linha({
      descricao: 'Seguro CAR (Construction All Risks)',
      base: num(s.seguro_car), taxa_iva: 0,  // seguros isentos — art 9º CIVA
      formula: `${num(s.seguro_car)} € (isento art 9º CIVA)`,
    }))
  }
  if (num(s.taxas_municipais) > 0) {
    out.push(linha({
      descricao: 'Taxas municipais / urbanísticas',
      base: num(s.taxas_municipais), taxa_iva: 0,  // fora do campo IVA — art 2º nº 2
      formula: `${num(s.taxas_municipais)} € (fora do campo IVA)`,
    }))
  }
  if (num(s.solicitador) > 0) {
    out.push(linha({
      descricao: 'Solicitador / registos',
      base: num(s.solicitador), taxa_iva: 23,
      retencao_irs: s.solicitador_singular ? 25 : 0,
      formula: `${num(s.solicitador)} €`,
    }))
  }
  if (num(s.livro_obra) > 0) {
    out.push(linha({
      descricao: 'Livro de obra + alvará',
      base: num(s.livro_obra), taxa_iva: 0,  // taxas
      formula: `${num(s.livro_obra)} € (taxas)`,
    }))
  }
  if (num(s.sce) > 0) {
    out.push(linha({
      descricao: 'Certificado energético (SCE)',
      base: num(s.sce), taxa_iva: 23,
      retencao_irs: s.sce_singular ? 25 : 0,
      formula: `${num(s.sce)} €`,
    }))
  }
  return out
}

// ── Mapeamento secção → função ──────────────────────────────
const RESOLVERS = {
  demolicoes:    (s, p, r) => linhasDemolicoes(s, r),
  rcd:           (s, p, r) => linhasRCD(s, r),
  estrutura:     (s, p, r) => linhasEstrutura(s, r),
  eletricidade:  (s, p, r) => linhasEletricidade(s, p, r),
  avac:          (s, p, r) => linhasAvac(s, r),
  pavimento:     (s, p, r) => linhasPavimento(s, p, r),
  pladur:        (s, p, r) => linhasPladur(s, p, r),
  isolamento:    (s, p, r) => linhasIsolamento(s, r),
  caixilharias:  (s, p, r) => linhasCaixilharias(s, p, r),
  vmc:           (s, p, r) => linhasVmc(s, p, r),
  pintura:       (s, p, r) => linhasPintura(s, p, r),
  casas_banho:   (s, p, r) => linhasCasasBanho(s, r),
  portas:        (s, p, r) => linhasPortas(s, r),
  cozinhas:      (s, p, r) => linhasCozinhas(s, r),
  capoto:        (s, p, r) => linhasCapoto(s, r),
  cobertura:     (s, p, r) => linhasCobertura(s, r),
  licenciamento: (s)       => linhasLicenciamento(s),
}

export const SECCOES_OBRA = [
  'demolicoes', 'rcd', 'estrutura', 'eletricidade', 'avac', 'pavimento',
  'pladur', 'isolamento', 'caixilharias', 'vmc', 'pintura',
  'casas_banho', 'portas', 'cozinhas', 'capoto', 'cobertura',
]
export const SECCOES_EXTRA = ['licenciamento']

// ── Motor principal ─────────────────────────────────────────
export function calcOrcamentoObra(orcamento) {
  const o = orcamento || {}
  const regime = o.regime_fiscal || 'normal'
  const pisos  = Array.isArray(o.pisos) ? o.pisos : []
  const s      = o.seccoes || {}

  const seccoes = {}
  let acumBase = 0
  for (const key of [...SECCOES_OBRA, ...SECCOES_EXTRA]) {
    const fn = RESOLVERS[key]
    const linhas = fn(s[key], pisos, regime) || []
    const subtotal_base = round2(linhas.reduce((a, l) => a + l.base, 0))
    const subtotal_iva = round2(linhas.reduce((a, l) => a + (l.autoliquidacao ? 0 : l.iva), 0))
    const iva_autoliq = round2(linhas.reduce((a, l) => a + (l.autoliquidacao ? l.iva : 0), 0))
    const retencoes = round2(linhas.reduce((a, l) => a + l.retencao_valor, 0))
    seccoes[key] = {
      linhas,
      subtotal_base,
      subtotal_iva,
      iva_autoliq,
      retencoes,
      subtotal_bruto: round2(subtotal_base + subtotal_iva),
    }
    if (key !== 'licenciamento') acumBase += subtotal_base
  }

  // BDI / imprevistos / margem (calculados sobre base de obra, excluindo licenciamento)
  const bdi = o.bdi || {}
  const baseObra = round2(Object.entries(seccoes)
    .filter(([k]) => SECCOES_OBRA.includes(k))
    .reduce((a, [, v]) => a + v.subtotal_base, 0))

  const imprevistos_perc = num(bdi.imprevistos_perc ?? 0)
  const margem_perc      = num(bdi.margem_perc ?? 0)
  const imprevistos_base = round2(baseObra * imprevistos_perc / 100)
  const margem_base      = round2(baseObra * margem_perc / 100)
  const taxa_bdi         = bdi.taxa_iva != null ? num(bdi.taxa_iva) : taxaPorDefeito(regime)
  const bdi_iva          = round2((imprevistos_base + margem_base) * taxa_bdi / 100)

  // Totais agregados
  const total_base_obra = round2(baseObra + imprevistos_base + margem_base)
  const total_iva_obra  = round2(Object.entries(seccoes)
    .filter(([k]) => SECCOES_OBRA.includes(k))
    .reduce((a, [, v]) => a + v.subtotal_iva, 0) + bdi_iva)
  const total_iva_autoliq_obra = round2(Object.entries(seccoes)
    .filter(([k]) => SECCOES_OBRA.includes(k))
    .reduce((a, [, v]) => a + v.iva_autoliq, 0))
  const total_retencoes_obra = round2(Object.entries(seccoes)
    .filter(([k]) => SECCOES_OBRA.includes(k))
    .reduce((a, [, v]) => a + v.retencoes, 0))

  const lic = seccoes.licenciamento
  const total_licenciamento_base = lic.subtotal_base
  const total_licenciamento_iva  = lic.subtotal_iva

  const total_base_geral = round2(total_base_obra + total_licenciamento_base)
  const total_iva_geral  = round2(total_iva_obra + total_licenciamento_iva)
  const total_geral_bruto = round2(total_base_geral + total_iva_geral)

  // Total efectivo a pagar (descontando autoliquidação que vai para o adquirente)
  const total_pagar = round2(total_geral_bruto - total_iva_autoliq_obra - total_retencoes_obra - lic.retencoes)

  return {
    regime_fiscal: regime,
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
      retencoes_irs: round2(total_retencoes_obra + lic.retencoes),
      base_licenciamento: total_licenciamento_base,
      iva_licenciamento: total_licenciamento_iva,
      base_geral: total_base_geral,
      iva_geral: total_iva_geral,
      bruto_geral: total_geral_bruto,
      a_pagar: total_pagar,
    },
    // Compat com versão anterior
    total_obra: total_geral_bruto - lic.subtotal_bruto,
    total_licenciamento: lic.subtotal_bruto,
    total_geral: total_geral_bruto,
    subtotais: Object.fromEntries(Object.entries(seccoes).map(([k, v]) => [k, v.subtotal_bruto])),
  }
}

export const SECCOES_ORDEM = [...SECCOES_OBRA, ...SECCOES_EXTRA]

// ── Validação aritmética (avisos UI) ────────────────────────
export function validarOrcamento(orcamento) {
  const avisos = []
  const o = orcamento || {}
  const s = o.seccoes || {}

  // Portas: confirmar un × eur_un coerente
  const p = s.portas
  if (p && num(p.un) > 0 && num(p.eur_un) > 0) {
    const calc = round2(num(p.un) * num(p.eur_un))
    if (num(p.total_declarado) > 0 && Math.abs(num(p.total_declarado) - calc) > 1) {
      avisos.push({ seccao: 'portas', tipo: 'aritmetica', msg: `Portas: ${num(p.un)} × ${num(p.eur_un)} = ${calc} €, não ${num(p.total_declarado)} €.` })
    }
  }

  // Aviso regime fiscal vs verba
  if (o.regime_fiscal === 'aru' || o.regime_fiscal === 'habitacao') {
    avisos.push({
      seccao: 'global', tipo: 'fiscal',
      msg: 'Regime de IVA reduzido aplicado. Confirme documentação obrigatória: declaração do dono da obra ao empreiteiro a atestar destino, certificação ARU/IHRU, comprovativo morada na ARU.',
    })
  }
  if (o.regime_fiscal === 'habitacao') {
    avisos.push({
      seccao: 'global', tipo: 'fiscal',
      msg: 'Verba 2.32 (habitação): atenção à regra dos 20% — materiais incorporados não podem exceder 20% do valor global da empreitada para manter a taxa reduzida (verificar redacção CIVA em vigor).',
    })
  }

  return avisos
}
