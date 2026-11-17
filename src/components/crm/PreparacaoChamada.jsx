/**
 * "Preparar chamada" no painel do investidor (SOP 23 v2.1): documento de
 * planeamento + guião gerado pela IA (fila no Mac), lido antes de ligar.
 * Independente da preparação por tarefa (PreparacaoCall.jsx).
 * Backend: /api/crm/investidores/:id/preparacao-chamada e /gerar-preparacao
 * (supabase/functions/_shared/preparacaoChamada.ts).
 *
 * Nunca bloqueia: o pedido responde logo e o painel actualiza sozinho.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, RefreshCw, Printer, PhoneCall, AlertTriangle } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { Button } from '../ui/Button.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'

const CONDUTORES = ['Alexandre Mendes', 'João Abreu']
const TIPO_LABEL = {
  qualificacao: 'Chamada 1 – Qualificação',
  discovery: 'Chamada 2 – Discovery',
  recontacto: 'Recontacto (Follow Up)',
  fora_sop23: 'Fora do SOP 23',
}
const TIPOS_ESCOLHA = ['qualificacao', 'recontacto', 'discovery']
const OPCAO_LABEL = { qualificacao: 'Chamada 1 – Qualificação (cold call)', recontacto: 'Recontacto (Follow Up)', discovery: 'Discovery', fora_sop23: 'Fora do SOP 23' }

// ── Markdown simples (sem dependências): títulos, listas, tabelas, negrito, itálico ──
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
  .replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, '$1<em>$2</em>')
const celulas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
export function markdownParaHtml(md) {
  const linhas = String(md || '').replace(/\r/g, '').split('\n')
  const out = []
  let lista = null
  const fecharLista = () => { if (lista) { out.push(`</${lista}>`); lista = null } }
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]
    if (/^\s*\|.*\|\s*$/.test(l)) {
      fecharLista()
      const bloco = []
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) bloco.push(linhas[i++])
      i--
      const sep = bloco.length > 1 && /^[\s|:-]+$/.test(bloco[1])
      const cab = sep ? celulas(bloco[0]) : null
      const corpo = bloco.slice(sep ? 2 : 0)
      out.push('<table>' + (cab ? `<thead><tr>${cab.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '')
        + `<tbody>${corpo.map((r) => `<tr>${celulas(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/)
    if (h) { fecharLista(); out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); continue }
    const ul = l.match(/^\s*[-*•]\s+(.*)$/)
    const ol = l.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ul || ol) {
      const tipo = ul ? 'ul' : 'ol'
      if (lista !== tipo) { fecharLista(); out.push(`<${tipo}>`); lista = tipo }
      out.push(`<li>${inline((ul || ol)[1])}</li>`)
      continue
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { fecharLista(); out.push('<hr/>'); continue }
    if (!l.trim()) { fecharLista(); continue }
    fecharLista()
    out.push(`<p>${inline(l)}</p>`)
  }
  fecharLista()
  return out.join('\n')
}

const ESTILO_DOC = `
.prep-doc h2{font-size:1.05rem;font-weight:600;margin:1rem 0 .4rem}
.prep-doc h3{font-size:.95rem;font-weight:600;margin:.9rem 0 .3rem}
.prep-doc h4,.prep-doc h5{font-size:.9rem;font-weight:600;margin:.7rem 0 .2rem}
.prep-doc p{margin:.25rem 0}
.prep-doc ul,.prep-doc ol{margin:.25rem 0 .25rem 1.2rem}
.prep-doc ul{list-style:disc}.prep-doc ol{list-style:decimal}
.prep-doc table{border-collapse:collapse;margin:.4rem 0;width:100%;font-size:.85em}
.prep-doc th,.prep-doc td{border:1px solid rgba(127,127,127,.35);padding:.25rem .4rem;text-align:left;vertical-align:top}
.prep-doc hr{margin:.8rem 0;border-color:rgba(127,127,127,.35)}
`

const fmt = (v) => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function imprimir(prep, nome) {
  const w = window.open('', '_blank')
  if (!w) return
  const alertas = (prep.alertas || []).map((a) => `<p class="alerta">${esc(a)}</p>`).join('')
  w.document.write(`<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Preparação de chamada · ${esc(nome || '')}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:18mm;font-size:11pt;line-height:1.4}
.meta{color:#666;font-size:9pt;margin-bottom:8px}.alerta{color:#b91c1c;font-weight:600;border:1px solid #b91c1c;padding:4px 8px;margin:4px 0}
${ESTILO_DOC}@media print{body{margin:0}}</style></head>
<body><div class="meta">Preparação de chamada · ${esc(TIPO_LABEL[prep.tipo_chamada] || '')} · gerada em ${esc(fmt(prep.gerado_em))}</div>
${alertas}<div class="prep-doc">${markdownParaHtml(prep.conteudo)}</div></body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

export function PreparacaoChamada({ investidorId, investidorNome }) {
  const { profile } = useAuth() || {}
  const [estado, setEstado] = useState(null)
  const [erro, setErro] = useState(null)
  const [aPedir, setAPedir] = useState(false)
  const [quem, setQuem] = useState(CONDUTORES.includes(profile?.nome) ? profile.nome : CONDUTORES[0])
  // null = o tipo calculado pela etapa.
  const [tipo, setTipo] = useState(null)

  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/crm/investidores/${investidorId}/preparacao-chamada${tipo ? `?tipo=${tipo}` : ''}`)
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || 'Falha ao carregar')
      setEstado(j); setErro(null)
    } catch (e) { setErro(e.message) }
  }, [investidorId, tipo])
  useEffect(() => { carregar() }, [carregar])

  // Enquanto o Mac gera, actualiza a cada 15 s.
  const ref = useRef(carregar); ref.current = carregar
  useEffect(() => {
    if (!estado?.em_fila) return
    const t = setInterval(() => ref.current(), 15000)
    return () => clearInterval(t)
  }, [estado?.em_fila])

  const pedir = async (forcar) => {
    setAPedir(true)
    try {
      const r = await apiFetch(`/api/crm/investidores/${investidorId}/gerar-preparacao`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quem_conduz: quem, tipo_chamada: tipoAtual === 'fora_sop23' ? null : tipoAtual, forcar }),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || 'Falha ao pedir a preparação')
      setEstado(j); setErro(null)
    } catch (e) { setErro(e.message) } finally { setAPedir(false) }
  }

  const calculado = estado?.tipo_calculado || null
  const tipoAtual = tipo || calculado
  const opcoes = calculado === 'fora_sop23' ? ['fora_sop23', ...TIPOS_ESCOLHA] : TIPOS_ESCOLHA
  // Mostra a última preparação só se for do tipo seleccionado.
  const prep = estado?.preparacao && (!tipoAtual || estado.preparacao.tipo_chamada === tipoAtual) ? estado.preparacao : null
  const mostrar = prep && (estado?.valida || !estado?.em_fila)
  return (
    <section className="rounded-lg border border-line bg-surface-raised p-4 space-y-3">
      <style>{ESTILO_DOC}</style>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-serif text-lg text-ink mr-auto">Preparar chamada</h3>
        <label className="text-xs text-ink-muted flex items-center gap-1.5">
          Quem conduz
          <select value={quem} onChange={(e) => setQuem(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink">
            {CONDUTORES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {calculado && (
          <label className="text-xs text-ink-muted flex items-center gap-1.5">
            Tipo de chamada
            <select value={tipoAtual} onChange={(e) => setTipo(e.target.value === calculado ? null : e.target.value)} disabled={estado?.em_fila}
              className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink">
              {opcoes.map((t) => <option key={t} value={t}>{OPCAO_LABEL[t]}{t === calculado ? ' (pela etapa)' : ''}</option>)}
            </select>
          </label>
        )}
        {!prep || !estado?.valida ? (
          <Button size="sm" onClick={() => pedir(false)} disabled={aPedir || estado?.em_fila}>
            {aPedir ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}Preparar chamada
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => pedir(true)} disabled={aPedir || estado?.em_fila}>
            {aPedir ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Gerar de novo
          </Button>
        )}
        {mostrar && (
          <Button size="sm" variant="secondary" onClick={() => imprimir(prep, investidorNome)}>
            <Printer className="w-3.5 h-3.5" />Imprimir/PDF
          </Button>
        )}
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}
      {estado?.em_fila && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="w-4 h-4 animate-spin" />Em geração no Mac (3 a 6 minutos). Actualiza sozinho. Não esperes por isto para ligar.
        </p>
      )}
      {estado?.erro && !estado?.em_fila && <p className="text-sm text-danger">A última geração falhou: {estado.erro}</p>}

      {mostrar && (
        <>
          <p className="text-xs text-ink-muted">
            {TIPO_LABEL[prep.tipo_chamada] || prep.tipo_chamada} · última geração {fmt(prep.gerado_em)}{prep.gerado_por ? ` por ${prep.gerado_por}` : ''}
            {!estado.valida && ' · desatualizada (mais de 24 horas ou contactos novos)'}
          </p>
          {(prep.alertas || []).map((a) => (
            <p key={a} className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
              <AlertTriangle className="w-4 h-4 shrink-0" />{a}
            </p>
          ))}
          <div className="prep-doc text-sm text-ink" dangerouslySetInnerHTML={{ __html: markdownParaHtml(prep.conteudo) }} />
        </>
      )}
      {tipo && calculado && tipo !== calculado && !estado?.em_fila && (
        <p className="text-xs text-ink-muted">Tipo escolhido à mão. Pela etapa seria {OPCAO_LABEL[calculado]}: actualiza a etapa depois da chamada.</p>
      )}
      {!prep && !estado?.em_fila && estado && <p className="text-sm text-ink-muted">Ainda sem preparação deste tipo para este investidor.</p>}
    </section>
  )
}
