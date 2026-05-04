/**
 * Motor de cálculo do orçamento de obra (v3 — separação material/MO).
 *
 * IMPORTANTE — quadro fiscal correcto (CIVA, abril 2026):
 *
 *   Verba 2.27 Lista I CIVA (Reabilitação Urbana — ARU):
 *     Aplicável a TODA a empreitada (material + MO incorporados). Taxa 6%
 *     desde que cumpridos requisitos: imóvel em ARU, certificação
 *     municipal/IHRU, declaração do dono da obra ao empreiteiro.
 *
 *   Verba 2.32 Lista I CIVA (Empreitadas em habitação):
 *     Taxa 6% no global, mas se os MATERIAIS incorporados excederem 20% do
 *     valor global da empreitada, perde-se a redução e tudo passa a 23%.
 *
 *   Regime Normal: 23% generalizado.
 *
 * Tipos de linha:
 *   'material'   — incorporado na empreitada (taxa do regime, salvo override)
 *   'mo'         — mão-de-obra incorporada (taxa do regime; pode autoliquidar)
 *   'servicos'   — empreitada de serviços auxiliares (demolições, RCD, andaime)
 *   'honorarios' — sempre 23% (projecto, TRO, SCE, fiscalização, solicitador)
 *   'taxas'      — fora do campo IVA (art. 2º nº 2 CIVA — taxas municipais)
 *   'isento'     — isento (seguros — art. 9º CIVA)
 *   'misto'      — agregado não decomposto (legacy/fallback)
 *
 * A separação material/MO é mantida como rastreabilidade operacional e para
 * calcular o rácio de materiais que dispara a perda do benefício na 2.32.
 *
 * Inputs por secção:
 *   - Cada par `eur_m2`/`eur_un`/`base` tem variantes `_material` e `_mo`.
 *   - Se utilizador preencher só o legacy `eur_m2`, é tratado como linha 'misto'
 *     com a taxa do regime (compatibilidade com orçamentos antigos).
 *
 * Fonte da verdade — usado pelo backend (PUT) e pelo frontend (cálculo realtime).
 */

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n) => Math.round(n * 100) / 100

// ── Construtor de linha ─────────────────────────────────────
function linha({ descricao, base, taxa_iva = 23, autoliquidacao = false, retencao_irs = 0, capitalizavel = true, verba_iva, formula, tipo = 'misto' }) {
  const b = num(base)
  const t = num(taxa_iva)
  const iva = round2(b * t / 100)
  const ret = round2(b * num(retencao_irs) / 100)
  return {
    descricao,
    formula,
    tipo,
    base: round2(b),
    taxa_iva: t,
    iva,
    autoliquidacao: !!autoliquidacao,
    retencao_irs: num(retencao_irs),
    retencao_valor: ret,
    capitalizavel: capitalizavel !== false,
    verba_iva,
    valor_pagar: round2(b - ret + (autoliquidacao ? 0 : iva)),
    valor_bruto: round2(b + iva),
  }
}

// ── Par material+MO (2 linhas com taxa do regime) ──
// A separação serve para rastreabilidade técnica E para calcular o rácio
// de materiais que dispara a regra dos 20% da Verba 2.32. A taxa de IVA
// aplicada vem do regime (6% ARU/Hab, 23% Normal) — Verba 2.27 abrange
// material+MO da mesma empreitada.
function pareMatMO({ descricao, base_material, base_mo, taxa_iva, autoliq_mo, formula_material, formula_mo }) {
  const out = []
  if (num(base_material) > 0) {
    out.push(linha({
      descricao: `${descricao} — material`,
      base: num(base_material),
      taxa_iva: num(taxa_iva),
      autoliquidacao: false,                    // material não autoliquida
      formula: formula_material,
      tipo: 'material',
    }))
  }
  if (num(base_mo) > 0) {
    out.push(linha({
      descricao: `${descricao} — mão-de-obra`,
      base: num(base_mo),
      taxa_iva: num(taxa_iva),
      autoliquidacao: !!autoliq_mo,
      formula: formula_mo,
      tipo: 'mo',
    }))
  }
  return out
}

function taxaPorDefeito(regime, override) {
  if (Number.isFinite(Number(override))) return Number(override)
  if (regime === 'aru' || regime === 'habitacao') return 6
  return 23
}

// Helper: lê inputs de uma secção e devolve {qty, mat, mo, eur_legacy}
// para um piso ou bloco fixo, tratando legacy.
function lerMatMO(s, prefMat = 'eur_m2_material', prefMO = 'eur_m2_mo', legacy = 'eur_m2') {
  const mat = num(s?.[prefMat])
  const mo  = num(s?.[prefMO])
  const leg = num(s?.[legacy])
  return { mat, mo, leg, hasSplit: mat > 0 || mo > 0 }
}

// ── 1. Demolições (serviço) ─────────────────────────────────
function linhasDemolicoes(s, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  if (num(s.entulhos) > 0) {
    out.push(linha({
      descricao: 'Entrega de entulhos',
      base: num(s.entulhos), taxa_iva: tMO, autoliquidacao: auto,
      formula: `${num(s.entulhos)} €`, tipo: 'servicos',
    }))
  }
  if (num(s.remocao_dias) * num(s.remocao_eur_dia) > 0) {
    out.push(linha({
      descricao: 'Remoção e transporte',
      base: num(s.remocao_dias) * num(s.remocao_eur_dia),
      taxa_iva: tMO, autoliquidacao: auto,
      formula: `${num(s.remocao_dias)} dias × ${num(s.remocao_eur_dia)} €/dia`,
      tipo: 'servicos',
    }))
  }
  // Nivelamento toutvenant — material + MO se decomposto
  const nivelM2  = num(s.nivel_m2)
  const nivelAlt = num(s.nivel_altura)
  if (nivelM2 * nivelAlt > 0) {
    const matMO = lerMatMO(s, 'nivel_eur_m3_material', 'nivel_eur_m3_mo', 'nivel_eur_m3')
    if (matMO.hasSplit) {
      out.push(...pareMatMO({
        descricao: 'Nivelamento (toutvenant)',
        base_material: nivelM2 * nivelAlt * matMO.mat,
        base_mo: nivelM2 * nivelAlt * matMO.mo,
        taxa_iva: tMO, autoliq_mo: auto,
        formula_material: `${nivelM2}m² × ${nivelAlt}m × ${matMO.mat} €/m³`,
        formula_mo: `${nivelM2}m² × ${nivelAlt}m × ${matMO.mo} €/m³`,
      }))
    } else if (matMO.leg > 0) {
      out.push(linha({
        descricao: 'Nivelamento (toutvenant)',
        base: nivelM2 * nivelAlt * matMO.leg,
        taxa_iva: tMO, autoliquidacao: auto,
        formula: `${nivelM2}m² × ${nivelAlt}m × ${matMO.leg} €/m³`,
        tipo: 'misto',
      }))
    }
  }
  if (num(s.limpeza_dias) * num(s.limpeza_eur_dia) > 0) {
    out.push(linha({
      descricao: 'Limpeza interior + terreno',
      base: num(s.limpeza_dias) * num(s.limpeza_eur_dia),
      taxa_iva: tMO, autoliquidacao: auto,
      formula: `${num(s.limpeza_dias)} dias × ${num(s.limpeza_eur_dia)} €/dia`,
      tipo: 'servicos',
    }))
  }
  if (num(s.paredes_dias) * num(s.paredes_eur_dia) > 0) {
    out.push(linha({
      descricao: 'Demolição paredes / roços',
      base: num(s.paredes_dias) * num(s.paredes_eur_dia),
      taxa_iva: tMO, autoliquidacao: auto,
      formula: `${num(s.paredes_dias)} dias × ${num(s.paredes_eur_dia)} €/dia`,
      tipo: 'servicos',
    }))
  }
  return out
}

// ── 2. RCD (serviço — transporte+operador) ──────────────────
function linhasRCD(s, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const out = []
  for (const tipo of ['inerte', 'misto', 'perigoso']) {
    const q = num(s[`${tipo}_m3`]), p = num(s[`${tipo}_eur_m3`])
    if (q * p > 0) {
      out.push(linha({
        descricao: `RCD ${tipo} (transporte + operador licenciado)`,
        base: q * p, taxa_iva: tMO,
        formula: `${q}m³ × ${p} €/m³`, tipo: 'servicos',
      }))
    }
  }
  if (num(s.plano_gestao) > 0) {
    out.push(linha({
      descricao: 'Plano de prevenção e gestão de RCD',
      base: num(s.plano_gestao), taxa_iva: 23,
      formula: `${num(s.plano_gestao)} €`, tipo: 'honorarios',
    }))
  }
  return out
}

// ── 3. Estrutura (mat+MO por sub-item) ──────────────────────
function linhasEstrutura(s, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  const items = [
    ['lajes',         'Lajes (substituição/reforço)'],
    ['vigamentos',    'Vigamentos / barrotes madeira'],
    ['pilares',       'Reforço de pilares'],
    ['escadas',       'Escadas interiores'],
    ['paredes_novas', 'Paredes novas'],
    ['outros',        'Outros trabalhos estruturais'],
  ]
  for (const [k, label] of items) {
    const mat = num(s[`${k}_material`])
    const mo  = num(s[`${k}_mo`])
    const leg = num(s[k])
    if (mat > 0 || mo > 0) {
      out.push(...pareMatMO({
        descricao: label,
        base_material: mat, base_mo: mo,
        taxa_iva: tMO, autoliq_mo: auto,
        formula_material: `${mat} €`, formula_mo: `${mo} €`,
      }))
    } else if (leg > 0) {
      out.push(linha({
        descricao: label, base: leg, taxa_iva: tMO, autoliquidacao: auto,
        formula: `${leg} €`, tipo: 'misto',
      }))
    }
  }
  return out
}

// ── 4. Eletricidade e Canalização (mat+MO por piso e sub-linhas) ──
function linhasEletricidade(s, pisos, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []

  // Modo simples — €/m² mat + €/m² MO por piso
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const m2 = num(piso.area_m2 ?? p.area_m2)
      const matMO = lerMatMO(piso)
      if (m2 <= 0) continue
      if (matMO.hasSplit) {
        out.push(...pareMatMO({
          descricao: `${p.nome} — instalações (eléct. + canal.)`,
          base_material: m2 * matMO.mat, base_mo: m2 * matMO.mo,
          taxa_iva: tMO, autoliq_mo: auto,
          formula_material: `${m2}m² × ${matMO.mat} €/m²`,
          formula_mo: `${m2}m² × ${matMO.mo} €/m²`,
        }))
      } else if (matMO.leg > 0) {
        out.push(linha({
          descricao: `${p.nome} — instalações`,
          base: m2 * matMO.leg, taxa_iva: tMO, autoliquidacao: auto,
          formula: `${m2}m² × ${matMO.leg} €/m²`, tipo: 'misto',
        }))
      }
    }
  }

  // Sub-linhas detalhadas — cada uma com mat+MO
  const subs = [
    ['rede_electrica',  'Rede eléctrica + quadro QE'],
    ['ited',            'ITED (telecomunicações)'],
    ['agua_fria',       'Canalização água fria'],
    ['agua_quente',     'Canalização AQ + AQS'],
    ['esgotos',         'Esgotos prediais'],
    ['gas',             'Rede de gás'],
  ]
  for (const [k, label] of subs) {
    const mat = num(s[`${k}_material`])
    const mo  = num(s[`${k}_mo`])
    const leg = num(s[k])
    if (mat > 0 || mo > 0) {
      out.push(...pareMatMO({
        descricao: label, base_material: mat, base_mo: mo,
        taxa_iva: tMO, autoliq_mo: auto,
        formula_material: `${mat} €`, formula_mo: `${mo} €`,
      }))
    } else if (leg > 0) {
      out.push(linha({
        descricao: label, base: leg, taxa_iva: tMO, autoliquidacao: auto,
        formula: `${leg} €`, tipo: 'misto',
      }))
    }
  }
  return out
}

// ── 5. AVAC / Solar / AQS (equipamentos = material 23%) ────
function linhasAvac(s, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const out = []
  // Equipamentos — sempre 23% (material)
  const items = [
    ['split_un', 'split_eur_un',         'Splits / multi-split AC',         (un, eur) => `${un} × ${eur} €/un`],
    [null,        'bomba_calor',          'Bomba de calor (AQS)',            (v) => `${v} €`],
    [null,        'solar_termico',        'Painéis solares térmicos + dep.', (v) => `${v} €`],
    ['fotovoltaico_kwp', 'fotovoltaico_eur_kwp', 'Sistema fotovoltaico',     (k, eur) => `${k} kWp × ${eur} €/kWp`],
    [null,        'recuperador',          'Recuperador / lareira',           (v) => `${v} €`],
    [null,        'outros_avac',          'Outros equipamentos AVAC',        (v) => `${v} €`],
  ]
  for (const [qK, pK, label, fmt] of items) {
    if (qK) {
      const q = num(s[qK]), p = num(s[pK])
      if (q * p > 0) out.push(linha({
        descricao: label, base: q * p, taxa_iva: tMO,
        formula: fmt(q, p), tipo: 'material',
      }))
    } else {
      const v = num(s[pK])
      if (v > 0) out.push(linha({
        descricao: label, base: v, taxa_iva: tMO,
        formula: fmt(v), tipo: 'material',
      }))
    }
  }
  // MO instalação agregada — taxa do regime
  if (num(s.mo_instalacao) > 0) {
    out.push(linha({
      descricao: 'AVAC — MO instalação',
      base: num(s.mo_instalacao), taxa_iva: tMO, autoliquidacao: !!s.autoliquidacao,
      formula: `${num(s.mo_instalacao)} €`, tipo: 'mo',
    }))
  }
  return out
}

// ── 6. Pavimento (mat+MO por piso) ──────────────────────────
function linhasPavimento(s, pisos, regime) {
  if (!Array.isArray(pisos)) return []
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  for (const p of pisos) {
    const piso = s.por_piso?.[p.nome] || {}
    const m2 = num(piso.area_m2 ?? p.area_m2)
    const tipo = piso.tipo || 'mosaico'
    const matMO = lerMatMO(piso)
    if (m2 <= 0) continue
    if (matMO.hasSplit) {
      out.push(...pareMatMO({
        descricao: `${p.nome} — pavimento (${tipo})`,
        base_material: m2 * matMO.mat, base_mo: m2 * matMO.mo,
        taxa_iva: tMO, autoliq_mo: auto,
        formula_material: `${m2}m² × ${matMO.mat} €/m²`,
        formula_mo: `${m2}m² × ${matMO.mo} €/m²`,
      }))
    } else if (matMO.leg > 0) {
      out.push(linha({
        descricao: `${p.nome} — pavimento (${tipo})`,
        base: m2 * matMO.leg, taxa_iva: tMO, autoliquidacao: auto,
        formula: `${m2}m² × ${matMO.leg} €/m²`, tipo: 'misto',
      }))
    }
  }
  return out
}

// ── 7. Pladur tetos (mat+MO por piso) ───────────────────────
function linhasPladur(s, pisos, regime) {
  if (!Array.isArray(pisos)) return []
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  for (const p of pisos) {
    const piso = s.por_piso?.[p.nome] || {}
    const m2 = num(piso.area_m2 ?? p.area_m2)
    const matMO = lerMatMO(piso)
    if (m2 <= 0) continue
    if (matMO.hasSplit) {
      out.push(...pareMatMO({
        descricao: `${p.nome} — pladur tecto`,
        base_material: m2 * matMO.mat, base_mo: m2 * matMO.mo,
        taxa_iva: tMO, autoliq_mo: auto,
        formula_material: `${m2}m² × ${matMO.mat} €/m²`,
        formula_mo: `${m2}m² × ${matMO.mo} €/m²`,
      }))
    } else if (matMO.leg > 0) {
      out.push(linha({
        descricao: `${p.nome} — pladur tecto`,
        base: m2 * matMO.leg, taxa_iva: tMO, autoliquidacao: auto,
        formula: `${m2}m² × ${matMO.leg} €/m²`, tipo: 'misto',
      }))
    }
  }
  return out
}

// ── 8. Isolamento (mat+MO por sub-tipo) ─────────────────────
function linhasIsolamento(s, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const items = [
    ['fachada',    'Isolamento fachada (lã rocha/EPS)'],
    ['cobertura',  'Isolamento cobertura (laje esteira)'],
    ['pavimento',  'Isolamento pavimento sobre exterior'],
    ['acustico',   'Isolamento acústico'],
  ]
  const out = []
  for (const [k, label] of items) {
    const q = num(s[`${k}_m2`])
    const mat = num(s[`${k}_eur_m2_material`])
    const mo  = num(s[`${k}_eur_m2_mo`])
    const leg = num(s[`${k}_eur_m2`])
    if (q <= 0) continue
    if (mat > 0 || mo > 0) {
      out.push(...pareMatMO({
        descricao: label,
        base_material: q * mat, base_mo: q * mo,
        taxa_iva: tMO, autoliq_mo: auto,
        formula_material: `${q}m² × ${mat} €/m²`,
        formula_mo: `${q}m² × ${mo} €/m²`,
      }))
    } else if (leg > 0) {
      out.push(linha({
        descricao: label, base: q * leg, taxa_iva: tMO, autoliquidacao: auto,
        formula: `${q}m² × ${leg} €/m²`, tipo: 'misto',
      }))
    }
  }
  return out
}

// ── 9. Caixilharias (janelas = material; pedreiro/soleiras MO) ──
function linhasCaixilharias(s, pisos, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const n = num(piso.n_janelas), area = num(piso.area_janela_m2), eur = num(piso.eur_m2)
      if (n * area * eur > 0) {
        out.push(linha({
          descricao: `${p.nome} — janelas (material)`,
          base: n * area * eur, taxa_iva: tMO,
          formula: `${n} × ${area}m² × ${eur} €/m²`, tipo: 'material',
        }))
      }
      // MO instalação por piso (opcional)
      const mo = num(piso.mo_instalacao)
      if (mo > 0) {
        out.push(linha({
          descricao: `${p.nome} — MO instalação caixilharia`,
          base: mo, taxa_iva: tMO, autoliquidacao: auto,
          formula: `${mo} €`, tipo: 'mo',
        }))
      }
    }
  }
  if (num(s.cb_un) * num(s.cb_eur_un) > 0) {
    out.push(linha({
      descricao: 'Janelas casa de banho',
      base: num(s.cb_un) * num(s.cb_eur_un), taxa_iva: tMO,
      formula: `${num(s.cb_un)} × ${num(s.cb_eur_un)} €/un`, tipo: 'material',
    }))
  }
  if (num(s.pedreiro) > 0) {
    out.push(linha({
      descricao: 'Trabalho pedreiro adjacente',
      base: num(s.pedreiro), taxa_iva: tMO, autoliquidacao: auto,
      formula: `${num(s.pedreiro)} €`, tipo: 'mo',
    }))
  }
  // Soleiras: pedra incorporada na empreitada — taxa do regime
  if (num(s.soleiras_un) * num(s.soleiras_eur_un) > 0) {
    out.push(linha({
      descricao: 'Soleiras (material)',
      base: num(s.soleiras_un) * num(s.soleiras_eur_un), taxa_iva: tMO,
      formula: `${num(s.soleiras_un)} × ${num(s.soleiras_eur_un)} €/un`, tipo: 'material',
    }))
  }
  // MO assentamento soleiras (opcional)
  if (num(s.soleiras_mo) > 0) {
    out.push(linha({
      descricao: 'Soleiras (MO assentamento)',
      base: num(s.soleiras_mo), taxa_iva: tMO, autoliquidacao: auto,
      formula: `${num(s.soleiras_mo)} €`, tipo: 'mo',
    }))
  }
  return out
}

// ── 10. VMC (mat+MO por piso) ───────────────────────────────
function linhasVmc(s, pisos, regime) {
  if (!Array.isArray(pisos)) return []
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  for (const p of pisos) {
    const piso = s.por_piso?.[p.nome] || {}
    const mat = num(piso.material), mo = num(piso.mo), leg = num(piso.base)
    if (mat > 0 || mo > 0) {
      out.push(...pareMatMO({
        descricao: `${p.nome} — VMC`,
        base_material: mat, base_mo: mo,
        taxa_iva: tMO, autoliq_mo: auto,
        formula_material: `${mat} €`, formula_mo: `${mo} €`,
      }))
    } else if (leg > 0) {
      out.push(linha({
        descricao: `${p.nome} — VMC`, base: leg, taxa_iva: tMO,
        formula: `${leg} €`, tipo: 'misto',
      }))
    }
  }
  return out
}

// ── 11. Pintura (mat+MO interior por piso + exterior) ───────
function linhasPintura(s, pisos, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const par = num(piso.m2_paredes), tet = num(piso.m2_teto)
      const m2 = par + tet
      const matMO = lerMatMO(piso)
      if (m2 <= 0) continue
      if (matMO.hasSplit) {
        out.push(...pareMatMO({
          descricao: `${p.nome} — pintura interior`,
          base_material: m2 * matMO.mat, base_mo: m2 * matMO.mo,
          taxa_iva: tMO, autoliq_mo: auto,
          formula_material: `(${par}+${tet})m² × ${matMO.mat} €/m²`,
          formula_mo: `(${par}+${tet})m² × ${matMO.mo} €/m²`,
        }))
      } else if (matMO.leg > 0) {
        out.push(linha({
          descricao: `${p.nome} — pintura interior`,
          base: m2 * matMO.leg, taxa_iva: tMO, autoliquidacao: auto,
          formula: `(${par}+${tet})m² × ${matMO.leg} €/m²`, tipo: 'misto',
        }))
      }
    }
  }
  // Exterior
  const extQ = num(s.exterior_m2)
  if (extQ > 0) {
    const matExt = num(s.exterior_eur_m2_material)
    const moExt  = num(s.exterior_eur_m2_mo)
    const legExt = num(s.exterior_eur_m2)
    if (matExt > 0 || moExt > 0) {
      out.push(...pareMatMO({
        descricao: 'Pintura exterior',
        base_material: extQ * matExt, base_mo: extQ * moExt,
        taxa_iva: tMO, autoliq_mo: auto,
        formula_material: `${extQ}m² × ${matExt} €/m²`,
        formula_mo: `${extQ}m² × ${moExt} €/m²`,
      }))
    } else if (legExt > 0) {
      out.push(linha({
        descricao: 'Pintura exterior',
        base: extQ * legExt, taxa_iva: tMO, autoliquidacao: auto,
        formula: `${extQ}m² × ${legExt} €/m²`, tipo: 'misto',
      }))
    }
  }
  return out
}

// ── 12. Casas de banho (já tem mat/MO/mobiliário) ───────────
function linhasCasasBanho(s, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const un = num(s.un)
  const out = []
  if (un <= 0) return out
  // material (louças, cerâmicos, mobiliário) — sempre 23%
  const partsMat = [
    ['loucas_eur_un',     'Louças sanitárias + torneiras'],
    ['cer_mat_eur_un',    'Cerâmicos + materiais'],
    ['mobiliario_eur_un', 'Mobiliário e espelho'],
  ]
  for (const [k, label] of partsMat) {
    const v = num(s[k])
    if (v > 0) {
      out.push(linha({
        descricao: `${label} (×${un} CB)`,
        base: un * v, taxa_iva: tMO,
        formula: `${un} × ${v} €/un`, tipo: 'material',
      }))
    }
  }
  // MO — taxa do regime
  if (num(s.mo_eur_un) > 0) {
    out.push(linha({
      descricao: `Mão-de-obra (canal. + assentamento) (×${un} CB)`,
      base: un * num(s.mo_eur_un), taxa_iva: tMO, autoliquidacao: auto,
      formula: `${un} × ${num(s.mo_eur_un)} €/un`, tipo: 'mo',
    }))
  }
  return out
}

// ── 13. Portas (mat + MO aplicação) ─────────────────────────
function linhasPortas(s, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const un = num(s.un)
  if (un <= 0) return []
  const out = []
  const mat = num(s.eur_un_material)
  const mo  = num(s.eur_un_mo)
  const leg = num(s.eur_un)
  if (mat > 0) {
    out.push(linha({
      descricao: `Portas — material (${un}×)`,
      base: un * mat, taxa_iva: tMO,
      formula: `${un} × ${mat} €/un`, tipo: 'material',
    }))
  }
  if (mo > 0) {
    out.push(linha({
      descricao: `Portas — MO aplicação (${un}×)`,
      base: un * mo, taxa_iva: tMO, autoliquidacao: auto,
      formula: `${un} × ${mo} €/un`, tipo: 'mo',
    }))
  }
  if (mat === 0 && mo === 0 && leg > 0) {
    out.push(linha({
      descricao: `Portas (${un}×)`,
      base: un * leg, taxa_iva: tMO,
      formula: `${un} × ${leg} €/un`, tipo: 'misto',
    }))
  }
  return out
}

// ── 14. Cozinhas (já tem moveis/bancada/electro/MO) ─────────
function linhasCozinhas(s, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const un = num(s.un)
  if (un <= 0) return []
  const out = []
  // Material — sempre 23%
  const partsMat = [
    ['moveis_eur_un',  'Móveis cozinha'],
    ['bancada_eur_un', 'Bancada'],
    ['electro_eur_un', 'Electrodomésticos'],
  ]
  for (const [k, label] of partsMat) {
    const v = num(s[k])
    if (v > 0) {
      out.push(linha({
        descricao: `${label} (×${un} cozinha${un > 1 ? 's' : ''})`,
        base: un * v, taxa_iva: tMO,
        formula: `${un} × ${v} €/un`, tipo: 'material',
      }))
    }
  }
  // MO — taxa do regime
  if (num(s.mo_eur_un) > 0) {
    out.push(linha({
      descricao: `Instalação MO (×${un} cozinha${un > 1 ? 's' : ''})`,
      base: un * num(s.mo_eur_un), taxa_iva: tMO, autoliquidacao: auto,
      formula: `${un} × ${num(s.mo_eur_un)} €/un`, tipo: 'mo',
    }))
  }
  return out
}

// ── 15. Capoto (mat+MO ETICS + remates + andaime) ──────────
function linhasCapoto(s, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const out = []
  const liq = num(s.fachada_m2_liquido)
  const matMO = lerMatMO(s)
  if (liq > 0) {
    if (matMO.hasSplit) {
      out.push(...pareMatMO({
        descricao: 'Capoto / ETICS — fachada',
        base_material: liq * matMO.mat, base_mo: liq * matMO.mo,
        taxa_iva: tMO, autoliq_mo: auto,
        formula_material: `${liq}m² × ${matMO.mat} €/m²`,
        formula_mo: `${liq}m² × ${matMO.mo} €/m²`,
      }))
    } else if (matMO.leg > 0) {
      out.push(linha({
        descricao: 'Capoto / ETICS — fachada',
        base: liq * matMO.leg, taxa_iva: tMO, autoliquidacao: auto,
        formula: `${liq}m² × ${matMO.leg} €/m²`, tipo: 'misto',
      }))
    }
  }
  // Remates — material incorporado (taxa do regime)
  if (num(s.remates_m) * num(s.remates_eur_m) > 0) {
    out.push(linha({
      descricao: 'Remates (cantos, peitoris, pingadeiras)',
      base: num(s.remates_m) * num(s.remates_eur_m), taxa_iva: tMO,
      formula: `${num(s.remates_m)}m × ${num(s.remates_eur_m)} €/m`,
      tipo: 'material',
    }))
  }
  // Andaime — serviço (taxa do regime)
  if (num(s.andaime_m2) * num(s.andaime_eur_m2_mes) * num(s.andaime_meses) > 0) {
    out.push(linha({
      descricao: 'Andaime de fachada',
      base: num(s.andaime_m2) * num(s.andaime_eur_m2_mes) * num(s.andaime_meses),
      taxa_iva: tMO,
      formula: `${num(s.andaime_m2)}m² × ${num(s.andaime_eur_m2_mes)} €/m²·mês × ${num(s.andaime_meses)} meses`,
      tipo: 'servicos',
    }))
  }
  return out
}

// ── 16. Cobertura (mat+MO) ──────────────────────────────────
function linhasCobertura(s, regime) {
  s = s || {}
  const tMO = taxaPorDefeito(regime, s.iva_override)
  const auto = !!s.autoliquidacao
  const m2 = num(s.m2)
  const matMO = lerMatMO(s)
  if (m2 <= 0) return []
  if (matMO.hasSplit) {
    return pareMatMO({
      descricao: 'Cobertura',
      base_material: m2 * matMO.mat, base_mo: m2 * matMO.mo,
      taxa_iva: tMO, autoliq_mo: auto,
      formula_material: `${m2}m² × ${matMO.mat} €/m²`,
      formula_mo: `${m2}m² × ${matMO.mo} €/m²`,
    })
  }
  if (matMO.leg > 0) {
    return [linha({
      descricao: 'Cobertura',
      base: m2 * matMO.leg, taxa_iva: tMO, autoliquidacao: auto,
      formula: `${m2}m² × ${matMO.leg} €/m²`, tipo: 'misto',
    })]
  }
  return []
}

// ── 17. Licenciamento + Fiscalização + Seguros ─────────────
function linhasLicenciamento(s) {
  s = s || {}
  const out = []
  if (num(s.projeto) > 0) {
    out.push(linha({
      descricao: 'Projecto especialidade/arquitectura',
      base: num(s.projeto), taxa_iva: 23,
      retencao_irs: s.projeto_singular ? 25 : 0,
      formula: `${num(s.projeto)} €`, tipo: 'honorarios',
    }))
  }
  if (num(s.fiscalizacao_perc) > 0 && num(s.base_obra_para_fiscalizacao) > 0) {
    const v = round2(num(s.base_obra_para_fiscalizacao) * num(s.fiscalizacao_perc) / 100)
    out.push(linha({
      descricao: 'Fiscalização técnica de obra',
      base: v, taxa_iva: 23,
      formula: `${num(s.fiscalizacao_perc)}% × ${num(s.base_obra_para_fiscalizacao)} € (base obra)`,
      tipo: 'honorarios',
    }))
  } else if (num(s.fiscalizacao) > 0) {
    out.push(linha({
      descricao: 'Fiscalização técnica de obra',
      base: num(s.fiscalizacao), taxa_iva: 23,
      formula: `${num(s.fiscalizacao)} €`, tipo: 'honorarios',
    }))
  }
  if (num(s.tro) > 0) {
    out.push(linha({
      descricao: 'Técnico Responsável de Obra (TRO)',
      base: num(s.tro), taxa_iva: 23,
      retencao_irs: s.tro_singular ? 25 : 0,
      formula: `${num(s.tro)} €`, tipo: 'honorarios',
    }))
  }
  if (num(s.seguro_car) > 0) {
    out.push(linha({
      descricao: 'Seguro CAR (Construction All Risks)',
      base: num(s.seguro_car), taxa_iva: 0,
      formula: `${num(s.seguro_car)} € (isento art 9º CIVA)`, tipo: 'isento',
    }))
  }
  if (num(s.taxas_municipais) > 0) {
    out.push(linha({
      descricao: 'Taxas municipais / urbanísticas',
      base: num(s.taxas_municipais), taxa_iva: 0,
      formula: `${num(s.taxas_municipais)} € (fora do campo IVA)`, tipo: 'taxas',
    }))
  }
  if (num(s.solicitador) > 0) {
    out.push(linha({
      descricao: 'Solicitador / registos',
      base: num(s.solicitador), taxa_iva: 23,
      retencao_irs: s.solicitador_singular ? 25 : 0,
      formula: `${num(s.solicitador)} €`, tipo: 'honorarios',
    }))
  }
  if (num(s.livro_obra) > 0) {
    out.push(linha({
      descricao: 'Livro de obra + alvará',
      base: num(s.livro_obra), taxa_iva: 0,
      formula: `${num(s.livro_obra)} € (taxas)`, tipo: 'taxas',
    }))
  }
  if (num(s.sce) > 0) {
    out.push(linha({
      descricao: 'Certificado energético (SCE)',
      base: num(s.sce), taxa_iva: 23,
      retencao_irs: s.sce_singular ? 25 : 0,
      formula: `${num(s.sce)} €`, tipo: 'honorarios',
    }))
  }
  return out
}

// ── Linhas livres editáveis (custom) ────────────────────────
// Permite ao utilizador adicionar linhas em qualquer secção com
// descrição, quantidade, unidade, preço unitário, taxa IVA e flags.
// Estrutura por linha:
//   {
//     id: string (uuid local),
//     descricao: string,
//     qtd: number,
//     unidade: string ('un' | 'm²' | 'm' | 'h' | 'dias' | ...),
//     mat_eur_un: number,    // €/un material
//     mat_iva: 0|6|13|23,    // IVA do material (default 23)
//     mo_eur_un: number,     // €/un mão-de-obra
//     mo_iva: 0|6|13|23,     // IVA da MO (default 6 em ARU/Hab, 23 normal)
//     autoliq_mo: bool,
//     retencao_irs: 0|11.5|25,
//     tipo_override?: 'material'|'mo'|'servicos'|'honorarios'|'taxas'|'isento',
//   }
function linhasCustom(s, regime) {
  const arr = Array.isArray(s?.custom_lines) ? s.custom_lines : []
  const out = []
  const tMOdef = taxaPorDefeito(regime)
  for (const c of arr) {
    const qtd = num(c.qtd)
    if (qtd <= 0) continue
    const desc = c.descricao || 'Linha custom'
    const baseMat = qtd * num(c.mat_eur_un)
    const baseMO  = qtd * num(c.mo_eur_un)
    const taxaMat = c.mat_iva != null ? num(c.mat_iva) : 23
    const taxaMO  = c.mo_iva  != null ? num(c.mo_iva)  : tMOdef
    const auto = !!c.autoliq_mo
    const ret = num(c.retencao_irs)
    if (baseMat > 0) {
      out.push(linha({
        descricao: `${desc} — material`,
        base: baseMat, taxa_iva: taxaMat,
        formula: `${qtd} ${c.unidade || 'un'} × ${num(c.mat_eur_un)} €/${c.unidade || 'un'}`,
        tipo: c.tipo_override === 'servicos' ? 'servicos' : 'material',
      }))
    }
    if (baseMO > 0) {
      out.push(linha({
        descricao: `${desc} — mão-de-obra`,
        base: baseMO, taxa_iva: taxaMO,
        autoliquidacao: auto, retencao_irs: ret,
        formula: `${qtd} ${c.unidade || 'un'} × ${num(c.mo_eur_un)} €/${c.unidade || 'un'}`,
        tipo: c.tipo_override === 'servicos' ? 'servicos' :
              c.tipo_override === 'honorarios' ? 'honorarios' : 'mo',
      }))
    }
    // Linha simples (só uma componente, sem mat/MO split)
    if (baseMat === 0 && baseMO === 0) {
      const baseUni = qtd * num(c.eur_un)
      if (baseUni > 0) {
        out.push(linha({
          descricao: desc,
          base: baseUni, taxa_iva: c.iva != null ? num(c.iva) : tMOdef,
          autoliquidacao: auto, retencao_irs: ret,
          formula: `${qtd} ${c.unidade || 'un'} × ${num(c.eur_un)} €/${c.unidade || 'un'}`,
          tipo: c.tipo_override || 'misto',
        }))
      }
    }
  }
  return out
}

// ── Wrapper que junta linhas resolvidas + custom ────────────
function comCustom(resolverFn) {
  return (s, p, r) => [...(resolverFn(s, p, r) || []), ...linhasCustom(s, r)]
}

// ── Mapeamento secção → função ──────────────────────────────
const RESOLVERS = {
  demolicoes:    comCustom((s, p, r) => linhasDemolicoes(s, r)),
  rcd:           comCustom((s, p, r) => linhasRCD(s, r)),
  estrutura:     comCustom((s, p, r) => linhasEstrutura(s, r)),
  eletricidade:  comCustom((s, p, r) => linhasEletricidade(s, p, r)),
  avac:          comCustom((s, p, r) => linhasAvac(s, r)),
  pavimento:     comCustom((s, p, r) => linhasPavimento(s, p, r)),
  pladur:        comCustom((s, p, r) => linhasPladur(s, p, r)),
  isolamento:    comCustom((s, p, r) => linhasIsolamento(s, r)),
  caixilharias:  comCustom((s, p, r) => linhasCaixilharias(s, p, r)),
  vmc:           comCustom((s, p, r) => linhasVmc(s, p, r)),
  pintura:       comCustom((s, p, r) => linhasPintura(s, p, r)),
  casas_banho:   comCustom((s, p, r) => linhasCasasBanho(s, r)),
  portas:        comCustom((s, p, r) => linhasPortas(s, r)),
  cozinhas:      comCustom((s, p, r) => linhasCozinhas(s, r)),
  capoto:        comCustom((s, p, r) => linhasCapoto(s, r)),
  cobertura:     comCustom((s, p, r) => linhasCobertura(s, r)),
  licenciamento: comCustom((s)       => linhasLicenciamento(s)),
}

// ── Constantes exportadas ───────────────────────────────────
export const REGIMES_FISCAIS = [
  { key: 'normal',     label: 'Normal (23% generalizado)',                     iva_default: 23 },
  { key: 'aru',        label: 'Reabilitação ARU (Verba 2.27 — 6%)',            iva_default: 6 },
  { key: 'habitacao',  label: 'Habitação (Verba 2.32 — 6% c/ regra 20%)',      iva_default: 6 },
  { key: 'rjru',       label: 'RJRU (DL 53/2014) — IMT/IMI s/ alterar IVA',    iva_default: 23 },
]

export const TAXAS_IVA = [0, 6, 13, 23]

export const RETENCOES_IRS = [
  { key: 0,    label: 'Nenhuma' },
  { key: 11.5, label: '11,5% (sub-empreiteiro construção civil)' },
  { key: 25,   label: '25% (serviços categoria B)' },
]

export const SECCOES_OBRA = [
  'demolicoes', 'rcd', 'estrutura', 'eletricidade', 'avac', 'pavimento',
  'pladur', 'isolamento', 'caixilharias', 'vmc', 'pintura',
  'casas_banho', 'portas', 'cozinhas', 'capoto', 'cobertura',
]
export const SECCOES_EXTRA = ['licenciamento']
export const SECCOES_ORDEM = [...SECCOES_OBRA, ...SECCOES_EXTRA]

export const SECCOES_LABELS = {
  demolicoes:    'Demolições e limpeza',
  rcd:           'RCD — Resíduos (DL 102-D/2020)',
  estrutura:     'Estrutura (lajes, vigas, pilares)',
  eletricidade:  'Eletricidade e canalização',
  avac:          'AVAC / Solar / AQS',
  pavimento:     'Pavimento',
  pladur:        'Pladur tetos',
  isolamento:    'Isolamento térmico/acústico',
  caixilharias:  'Caixilharias',
  vmc:           'Sistema VMC',
  pintura:       'Pintura',
  casas_banho:   'Casas de banho',
  portas:        'Portas',
  cozinhas:      'Cozinhas',
  capoto:        'Capoto / ETICS exterior',
  cobertura:     'Cobertura',
  licenciamento: 'Licenciamento, fiscalização e seguros',
}

// ── Motor principal ─────────────────────────────────────────
export function calcOrcamentoObra(orcamento) {
  return calcInterno(orcamento, /* segundoPasso */ false)
}

function calcInterno(orcamento, segundoPasso) {
  const o = orcamento || {}
  const regime = o.regime_fiscal || 'normal'
  const pisos  = Array.isArray(o.pisos) ? o.pisos : []
  const s      = o.seccoes || {}

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
    let linhas = fn(s[key], pisos, regime) || []
    // Em segundo passo (regra 20% Verba 2.32 violada): força 23% nas linhas
    // de empreitada (material + MO + serviços). Honorários, taxas e isentos mantêm-se.
    if (segundoPasso) {
      linhas = linhas.map(l => {
        if (l.tipo === 'material' || l.tipo === 'mo' || l.tipo === 'servicos' || l.tipo === 'misto') {
          const novaIva = round2(l.base * 23 / 100)
          return {
            ...l,
            taxa_iva: 23,
            iva: novaIva,
            valor_pagar: round2(l.base - l.retencao_valor + (l.autoliquidacao ? 0 : novaIva)),
            valor_bruto: round2(l.base + novaIva),
          }
        }
        return l
      })
    }
    const subtotal_base = round2(linhas.reduce((a, l) => a + l.base, 0))
    const subtotal_iva  = round2(linhas.reduce((a, l) => a + (l.autoliquidacao ? 0 : l.iva), 0))
    const iva_autoliq   = round2(linhas.reduce((a, l) => a + (l.autoliquidacao ? l.iva : 0), 0))
    const retencoes     = round2(linhas.reduce((a, l) => a + l.retencao_valor, 0))

    // Subtotais por tipo dentro da secção
    const subtotaisTipo = {}
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

      // Por secção também
      if (!subtotaisTipo[t]) subtotaisTipo[t] = { base: 0, iva: 0 }
      subtotaisTipo[t].base = round2(subtotaisTipo[t].base + l.base)
      subtotaisTipo[t].iva = round2(subtotaisTipo[t].iva + l.iva)
    }

    seccoes[key] = {
      linhas,
      subtotal_base,
      subtotal_iva,
      iva_autoliq,
      retencoes,
      subtotal_bruto: round2(subtotal_base + subtotal_iva),
      por_tipo: subtotaisTipo,
    }
  }

  // ── BDI ──────────────────────────────────────────────────
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

  // ── Totais agregados ─────────────────────────────────────
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

  const total_pagar = round2(total_geral_bruto - total_iva_autoliq_obra - total_retencoes_obra - lic.retencoes)

  // ── Rácio material/total e regra 20% (Verba 2.32) ──────
  // Rácio calculado sobre a base de empreitada (excluindo honorários/taxas/isentos).
  const baseEmpreitada = porTipo.material.base + porTipo.mo.base + porTipo.servicos.base + porTipo.misto.base
  const baseMaterial = porTipo.material.base
  const racio_material = baseEmpreitada > 0 ? round2(baseMaterial / baseEmpreitada * 100) : 0
  const excede_20 = regime === 'habitacao' && racio_material > 20

  // Se em regime habitação e excedeu 20%, recalcula tudo a 23%
  // (perda do benefício da Verba 2.32) — apenas no primeiro passo.
  if (excede_20 && !segundoPasso) {
    const recalc = calcInterno(orcamento, true)
    return {
      ...recalc,
      totais: {
        ...recalc.totais,
        racio_material,
        excede_20: true,
        beneficio_perdido: true,
      },
    }
  }

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
      por_tipo: porTipo,
      racio_material,
      excede_20,
      beneficio_perdido: false,
    },
    // Compat
    total_obra: round2(total_geral_bruto - lic.subtotal_bruto),
    total_licenciamento: lic.subtotal_bruto,
    total_geral: total_geral_bruto,
    subtotais: Object.fromEntries(Object.entries(seccoes).map(([k, v]) => [k, v.subtotal_bruto])),
  }
}

// ── Validação aritmética + fiscal ───────────────────────────
export function validarOrcamento(orcamento) {
  const avisos = []
  const o = orcamento || {}
  const s = o.seccoes || {}
  const regime = o.regime_fiscal || 'normal'

  // Portas: confirmar un × eur_un coerente (legacy)
  const p = s.portas
  if (p && num(p.un) > 0 && num(p.eur_un) > 0 && num(p.total_declarado) > 0) {
    const calcVal = round2(num(p.un) * num(p.eur_un))
    if (Math.abs(num(p.total_declarado) - calcVal) > 1) {
      avisos.push({ seccao: 'portas', tipo: 'aritmetica', msg: `Portas: ${num(p.un)} × ${num(p.eur_un)} = ${calcVal} €, não ${num(p.total_declarado)} €.` })
    }
  }

  if (regime === 'aru') {
    avisos.push({
      seccao: 'global', tipo: 'fiscal',
      msg: 'Verba 2.27 (Reabilitação Urbana): aplica-se a TODA a empreitada (material + MO) à taxa reduzida 6%, desde que cumpridos os requisitos — imóvel em ARU, certificação municipal/IHRU, declaração do dono da obra ao empreiteiro. Honorários (projecto, TRO, fiscalização) continuam a 23%.',
    })
  }
  if (regime === 'habitacao') {
    avisos.push({
      seccao: 'global', tipo: 'fiscal',
      msg: 'Verba 2.32 (Habitação): taxa reduzida 6% no global da empreitada se os MATERIAIS incorporados não excederem 20% do valor da empreitada. Honorários sempre a 23%.',
    })
  }

  const calc = calcOrcamentoObra(o)
  if (calc.totais.beneficio_perdido) {
    avisos.push({
      seccao: 'global', tipo: 'fiscal_critico',
      msg: `Verba 2.32 violada: materiais representam ${calc.totais.racio_material}% da base da empreitada (limite 20%). O sistema recalculou tudo a 23% (perda do benefício). Para manter a taxa reduzida, reduza a fracção de material ou exclua linhas para outro orçamento.`,
    })
  } else if (regime === 'habitacao' && calc.totais.racio_material > 15) {
    avisos.push({
      seccao: 'global', tipo: 'fiscal',
      msg: `Materiais a ${calc.totais.racio_material}% do total da empreitada — próximo do limite de 20% da Verba 2.32. Acompanhe esta métrica.`,
    })
  }

  return avisos
}
