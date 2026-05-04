/**
 * Motor de cálculo do orçamento de obra.
 *
 * Replica as fórmulas do documento Word do gestor de obra
 * (ex: Análise de Custo de Obra - Santa Clara, Rua do Clube).
 * Usado pelo backend (orcamentoObraRoutes) e pelo frontend
 * (useOrcamentoObra) para garantir cálculo consistente.
 *
 * Convenções:
 *  - Inputs sem IVA salvo nota explícita "comIva".
 *  - IVA aplica-se através de iva_perc global do orçamento.
 *  - Áreas por piso vêm de pisos[].area_m2 (lookup por nome do piso).
 */

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const aplicaIva = (valor, ivaPerc) => valor * (1 + num(ivaPerc) / 100)

// ── 1. Demolições e limpeza ──────────────────────────────────
function calcDemolicoes(s, ivaPerc) {
  s = s || {}
  const entulhos          = aplicaIva(num(s.entulhos), ivaPerc)
  const remocao           = aplicaIva(num(s.remocao_dias) * num(s.remocao_eur_dia), ivaPerc)
  const nivelamento       = num(s.nivel_m2) * num(s.nivel_altura) * num(s.nivel_eur_m3)
  const limpeza           = num(s.limpeza_dias) * num(s.limpeza_eur_dia)
  const paredes_rocos     = num(s.paredes_dias) * num(s.paredes_eur_dia)
  return entulhos + remocao + nivelamento + limpeza + paredes_rocos
}

// ── Helpers para secções "por piso" (m² × €/m² + IVA) ────────
function somaPorPiso(pisos, dados, ivaPerc, withIva = true) {
  if (!Array.isArray(pisos)) return 0
  return pisos.reduce((acc, p) => {
    const piso = dados?.[p.nome] || {}
    const valor = num(piso.area_m2 ?? p.area_m2) * num(piso.eur_m2)
    return acc + (withIva ? aplicaIva(valor, ivaPerc) : valor)
  }, 0)
}

// ── 2. Eletricidade e Canalização (por piso) ─────────────────
const calcEletricidadeCanalizacao = (s, pisos, ivaPerc) =>
  somaPorPiso(pisos, s?.por_piso, ivaPerc, true)

// ── 3. Pavimento (por piso) ──────────────────────────────────
const calcPavimento = (s, pisos, ivaPerc) =>
  somaPorPiso(pisos, s?.por_piso, ivaPerc, true)

// ── 4. Pladur tetos (por piso) ───────────────────────────────
const calcPladur = (s, pisos, ivaPerc) =>
  somaPorPiso(pisos, s?.por_piso, ivaPerc, true)

// ── 5. Caixilharias ──────────────────────────────────────────
function calcCaixilharias(s, pisos, ivaPerc) {
  s = s || {}
  let total = 0
  if (Array.isArray(pisos)) {
    for (const p of pisos) {
      const piso = s.por_piso?.[p.nome] || {}
      const janelas = num(piso.n_janelas) * num(piso.area_janela_m2) * num(piso.eur_m2)
      total += aplicaIva(janelas, ivaPerc)
    }
  }
  total += num(s.cb_un) * num(s.cb_eur_un)             // janelas casa-de-banho (já com IVA)
  total += aplicaIva(num(s.pedreiro), ivaPerc)
  total += aplicaIva(num(s.soleiras_un) * num(s.soleiras_eur_un), ivaPerc)
  return total
}

// ── 6. Sistema VMC (por piso, valor com IVA) ─────────────────
function calcVmc(s, pisos) {
  if (!Array.isArray(pisos)) return 0
  return pisos.reduce((acc, p) => {
    const piso = s?.por_piso?.[p.nome] || {}
    return acc + num(piso.valor_com_iva)
  }, 0)
}

// ── 7. Pintura (por piso, m² paredes + m² teto × €/m²) ──────
function calcPintura(s, pisos, ivaPerc) {
  if (!Array.isArray(pisos)) return 0
  return pisos.reduce((acc, p) => {
    const piso = s?.por_piso?.[p.nome] || {}
    const valor = (num(piso.m2_paredes) + num(piso.m2_teto)) * num(piso.eur_m2)
    return acc + aplicaIva(valor, ivaPerc)
  }, 0)
}

// ── 8/9/10. Casas de banho / Portas / Cozinhas (un × €/un) ──
const calcUnitario = (s) => num(s?.un) * num(s?.eur_un)

// ── 11. Capoto exterior (perímetro × altura × €/m²) ─────────
function calcCapoto(s, ivaPerc) {
  s = s || {}
  const trecos = Array.isArray(s.trecos) ? s.trecos : []
  const valor = trecos.reduce((acc, t) => acc + num(t.perimetro) * num(t.altura) * num(t.eur_m2), 0)
  return aplicaIva(valor, ivaPerc)
}

// ── 12. Cobertura (m² × €/m² com IVA) ────────────────────────
const calcCobertura = (s) => num(s?.m2) * num(s?.eur_m2)

// ── 13. Licenciamento ────────────────────────────────────────
function calcLicenciamento(s, ivaPerc) {
  s = s || {}
  const projeto = aplicaIva(num(s.projeto), ivaPerc)
  const taxas   = aplicaIva(num(s.taxas), ivaPerc)
  return projeto + taxas
}

// ── Motor principal ──────────────────────────────────────────
export function calcOrcamentoObra(orcamento) {
  const o = orcamento || {}
  const ivaPerc = num(o.iva_perc ?? 23)
  const pisos   = Array.isArray(o.pisos) ? o.pisos : []
  const s       = o.seccoes || {}

  const subtotais = {
    demolicoes:    calcDemolicoes(s.demolicoes, ivaPerc),
    eletricidade:  calcEletricidadeCanalizacao(s.eletricidade, pisos, ivaPerc),
    pavimento:     calcPavimento(s.pavimento, pisos, ivaPerc),
    pladur:        calcPladur(s.pladur, pisos, ivaPerc),
    caixilharias:  calcCaixilharias(s.caixilharias, pisos, ivaPerc),
    vmc:           calcVmc(s.vmc, pisos),
    pintura:       calcPintura(s.pintura, pisos, ivaPerc),
    casas_banho:   calcUnitario(s.casas_banho),
    portas:        calcUnitario(s.portas),
    cozinhas:      calcUnitario(s.cozinhas),
    capoto:        calcCapoto(s.capoto, ivaPerc),
    cobertura:     calcCobertura(s.cobertura),
  }

  const total_obra = Object.values(subtotais).reduce((a, b) => a + b, 0)
  const total_licenciamento = calcLicenciamento(s.licenciamento, ivaPerc)
  const total_geral = total_obra + total_licenciamento

  // Acumulado progressivo (para mostrar como no Word)
  const ordem = ['demolicoes', 'eletricidade', 'pavimento', 'pladur', 'caixilharias',
                 'vmc', 'pintura', 'casas_banho', 'portas', 'cozinhas', 'capoto', 'cobertura']
  const acumulado = {}
  let running = 0
  for (const k of ordem) {
    running += subtotais[k]
    acumulado[k] = running
  }

  return {
    subtotais,
    acumulado,
    total_obra,
    total_licenciamento,
    total_geral,
  }
}

export const SECCOES_ORDEM = [
  'demolicoes', 'eletricidade', 'pavimento', 'pladur', 'caixilharias',
  'vmc', 'pintura', 'casas_banho', 'portas', 'cozinhas', 'capoto', 'cobertura',
  'licenciamento',
]
