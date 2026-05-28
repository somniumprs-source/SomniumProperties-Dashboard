/**
 * Configuração visual e utilitários do módulo de documentação (importação livre).
 * A análise é por documento; o cruzamento de divergências faz-se por código
 * (detectarInconsistencias) a partir do objecto dados_chave de cada análise.
 */

// Estados visuais (palette Somnium).
export const ESTADOS = {
  pendente: { label: 'Não analisado', cor: '#9ca3af', bg: '#f3f4f6' },
  validado: { label: 'Válido', cor: '#27ae60', bg: '#eafaf0' },
  warning: { label: 'Com alertas', cor: '#e67e22', bg: '#fdf2e8' },
  erro: { label: 'Problema', cor: '#c0392b', bg: '#fdecea' },
}

// Converte o campo `valido` da análise (true|false|'warning') no estado visual.
export function estadoFromValido(valido) {
  if (valido === true) return 'validado'
  if (valido === 'warning') return 'warning'
  return 'erro'
}

export const SEVERIDADE = {
  critical: { label: 'Crítico', icone: '⛔', cor: '#c0392b', rank: 0 },
  warning: { label: 'Alerta', icone: '⚠️', cor: '#e67e22', rank: 1 },
  info: { label: 'Info', icone: 'ℹ️', cor: '#6b7280', rank: 2 },
}

// Chaves comparáveis entre documentos (extraídas pela IA em dados_chave).
export const DADOS_CHAVE_LABELS = {
  morada: 'Morada',
  freguesia: 'Freguesia',
  concelho: 'Concelho',
  artigo_matricial: 'Artigo matricial',
  fracao: 'Fracção',
  area: 'Área',
  vpt: 'VPT',
  titular: 'Titular',
  data_documento: 'Data do documento',
  validade: 'Validade',
}

// Chaves tratadas como numéricas (comparação com tolerância).
const CHAVES_NUMERICAS = new Set(['area', 'vpt'])

function normalizarTexto(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizarNumero(v) {
  const s = String(v ?? '').replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Cruza os dados_chave de todas as análises e devolve as divergências.
 * Para cada chave, agrupa valores normalizados; se houver 2+ valores distintos,
 * regista uma inconsistência com os valores originais e o documento de origem.
 * @returns {{chave: string, label: string, valores: {valor: string, origem: string}[]}[]}
 */
export function detectarInconsistencias(analises) {
  const lista = Array.isArray(analises) ? analises : []
  const out = []

  for (const chave of Object.keys(DADOS_CHAVE_LABELS)) {
    const numerica = CHAVES_NUMERICAS.has(chave)
    const ocorrencias = [] // { norm, valor, origem }

    for (const a of lista) {
      const bruto = a?.dados_chave?.[chave]
      if (bruto == null || String(bruto).trim() === '') continue
      const origem = a.tipo_documento || a.nome_ficheiro || 'Documento'
      if (numerica) {
        const n = normalizarNumero(bruto)
        if (n == null) continue
        ocorrencias.push({ norm: n, valor: String(bruto), origem })
      } else {
        const norm = normalizarTexto(bruto)
        if (!norm) continue
        ocorrencias.push({ norm, valor: String(bruto), origem })
      }
    }

    if (ocorrencias.length < 2) continue

    let divergente = false
    if (numerica) {
      const nums = ocorrencias.map(o => o.norm)
      const min = Math.min(...nums), max = Math.max(...nums)
      // Tolerância de 1% (ou 1 unidade) para arredondamentos.
      const tol = Math.max(1, max * 0.01)
      divergente = (max - min) > tol
    } else {
      divergente = new Set(ocorrencias.map(o => o.norm)).size > 1
    }

    if (divergente) {
      // Deduplica por valor original + origem para a apresentação.
      const vistos = new Set()
      const valores = []
      for (const o of ocorrencias) {
        const k = `${o.valor}|${o.origem}`
        if (vistos.has(k)) continue
        vistos.add(k)
        valores.push({ valor: o.valor, origem: o.origem })
      }
      out.push({ chave, label: DADOS_CHAVE_LABELS[chave], valores })
    }
  }

  return out
}
