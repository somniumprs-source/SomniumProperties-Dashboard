// Regras das despesas e dos seus documentos (auditoria D3).
// Espelho: supabase/functions/_shared/regrasDespesas.ts (manter em sync).
//
// • Um lançamento (pagamento único ou mês registado de uma subscrição) só fica
//   documentado com a fatura ou o comprovativo anexado. Sem anexo está «Por
//   documentar». As linhas «Mensalmente»/«Anual» são o modelo da subscrição:
//   quem se documenta é cada mês que geram.
// • O tipo de documento só existe quando há documento (sem valor por defeito).
// • Fecho do mês: a partir do dia 1, o mês anterior tem de ficar todo
//   documentado e enviado à contabilidade.
// • A regra vale para as despesas registadas a partir de 19/10/2026; as
//   anteriores ficam de fora (decisão do João).

// NIF da Somnium Properties. Enquanto estiver vazio, a fatura confere-se pelo
// nome do cliente; com ele, também pelo NIF.
export const NIF_SOMNIUM = ''

export const TIPOS_DOCUMENTO_DESPESA = ['fatura', 'comprovativo_pagamento']

export const REGRA_DOCUMENTO_DESDE = '2026-10-19T00:00:00+01:00'

export const lancamento = d => ['Único', 'Registado'].includes(d?.timing)

// Registada antes da regra existir: não conta para nada disto.
export const anteriorARegra = d => {
  const c = d?.created_at ?? d?.createdAt
  return !!c && new Date(c) < new Date(REGRA_DOCUMENTO_DESDE)
}

export const valorDespesa = d => {
  const mensal = Number(d?.custo_mensal ?? d?.custoMensal) || 0
  const anual = Number(d?.custo_anual ?? d?.custoAnual) || 0
  return d?.timing === 'Anual' ? (anual || mensal) : (mensal || anual)
}

export function documentosDe(d) {
  const raw = d?.documentos
  if (!raw) return []
  try { const v = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(v) ? v : [] } catch { return [] }
}

export const temDocumento = d => documentosDe(d).length > 0

// null (não precisa: modelo de subscrição ou valor 0) | 'por_documentar' |
// 'documentada' | 'enviada'
export function estadoDocumental(d) {
  if (!lancamento(d) || !(valorDespesa(d) > 0) || anteriorARegra(d)) return null
  if (!temDocumento(d)) return 'por_documentar'
  return (d.enviada_contabilidade_em ?? d.enviadaContabilidadeEm) ? 'enviada' : 'documentada'
}

export const ROTULO_ESTADO_DOCUMENTAL = {
  por_documentar: 'Por documentar',
  documentada: 'Por enviar',
  enviada: 'Enviada',
}

const mesDe = d => String(d?.data || '').slice(0, 7)

// Mês anterior a `hoje` (AAAA-MM) e o que falta para o fechar.
export function fechoDoMes(despesas, hoje = new Date()) {
  const ant = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const mes = `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, '0')}`
  const doMes = (despesas || []).filter(d => mesDe(d) === mes && estadoDocumental(d))
  return {
    mes,
    porDocumentar: doMes.filter(d => estadoDocumental(d) === 'por_documentar'),
    porEnviar: doMes.filter(d => estadoDocumental(d) === 'documentada'),
  }
}

// A fatura foi passada à Somnium? null quando o documento não diz o cliente.
export function faturaParaSomnium(extracao) {
  const cli = extracao?.cliente || {}
  const nif = String(cli.nif || '').replace(/\D/g, '')
  if (NIF_SOMNIUM && nif) return nif === NIF_SOMNIUM
  if (cli.nome) return /somnium/i.test(String(cli.nome))
  return null
}

const eur = v => `${Number(v || 0).toFixed(2).replace('.', ',')} €`

// Alertas: cada lançamento sem documento e, a partir do dia 1, o fecho do mês
// anterior (por documentar ou por enviar). `donos` = { regiao: nome }.
export function alertasDeDespesas(despesas, donos = {}, hoje = new Date()) {
  const out = []
  const dono = d => donos[d.regiao || 'Coimbra'] || null
  for (const d of despesas || []) {
    if (estadoDocumental(d) !== 'por_documentar') continue
    out.push({
      tipo: 'despesa_por_documentar', severidade: 'aviso', entidade: d.movimento,
      mensagem: `Sem fatura nem comprovativo · ${d.data ? String(d.data).slice(0, 10) : 'sem data'} · ${eur(valorDespesa(d))}`,
      id: d.id, ...(dono(d) ? { regiao: d.regiao || 'Coimbra', responsavel: dono(d) } : {}),
    })
  }
  const f = fechoDoMes(despesas, hoje)
  if (f.porDocumentar.length || f.porEnviar.length) {
    const partes = [f.porDocumentar.length && `${f.porDocumentar.length} por documentar`, f.porEnviar.length && `${f.porEnviar.length} por enviar à contabilidade`].filter(Boolean)
    out.push({
      tipo: 'fecho_contabilidade', severidade: f.porDocumentar.length ? 'critico' : 'aviso', entidade: `Fecho de ${f.mes}`,
      mensagem: `${partes.join(' · ')} (Financeiro › Contabilidade)`,
    })
  }
  return out
}
