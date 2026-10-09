/**
 * Tarefas de uma fase do projeto: checklist dentro da tarefa (com o documento
 * do imóvel que já veio do Comercial), tarefas opcionais que se ativam quando
 * são precisas, e bloqueio de conclusão enquanto a checklist estiver incompleta.
 * Um item com espaço (slot) também deixa carregar o documento a partir daqui:
 * fica guardado nos documentos do imóvel, junto dos restantes.
 * A percentagem da fase é calculada no servidor (src/db/projetoTarefas.js).
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Trash2, ChevronRight, Plus, FileText, Upload } from 'lucide-react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'
import { Button } from '../ui/Button.jsx'

function lerChecklist(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}

// Último documento carregado no Comercial para cada espaço (slot) do imóvel.
function docsPorSlot(fotos) {
  let arr = fotos
  if (typeof arr === 'string') { try { arr = JSON.parse(arr) } catch { arr = [] } }
  const map = {}
  for (const d of Array.isArray(arr) ? arr : []) {
    if (!d?.slot) continue
    if (!map[d.slot] || String(d.uploaded_at || '') > String(map[d.slot].uploaded_at || '')) map[d.slot] = d
  }
  return map
}

const fmtData = iso => (iso ? new Date(iso).toLocaleDateString('pt-PT') : '')

export function TarefasFase({ fase, negocioId, imovelId, fotosImovel, readOnly, onChange }) {
  const toast = useToast()
  const [novaTarefa, setNovaTarefa] = useState('')
  const tarefas = fase.tarefas || []
  const ativas = tarefas.filter(t => t.ativa !== false)
  const porAtivar = tarefas.filter(t => t.ativa === false)
  const docs = docsPorSlot(fotosImovel)

  const precisaInvestidores = tarefas.some(t => lerChecklist(t.checklist)?.por_investidor)
  const invQuery = useQuery({
    queryKey: ['projeto-investidores', negocioId],
    enabled: precisaInvestidores && !!negocioId,
    queryFn: async () => {
      const r = await apiFetch(`/api/crm/projetos/${negocioId}/investidores`).catch(() => null)
      return r?.ok ? (await r.json()).investidores || [] : []
    },
  })
  const investidores = invQuery.data ?? []

  async function pedido(url, method, body, erro) {
    const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      toast?.(err.error || `${erro} (${r.status})`, 'error', 4000)
      return false
    }
    onChange()
    return true
  }

  // Carrega um ficheiro para os documentos do imóvel, ligado ao espaço (slot) do item.
  async function carregarDocumento(slot, files) {
    if (!imovelId || !files?.length) return
    const fd = new FormData()
    fd.append('folder', 'documentos')
    fd.append('slot', slot)
    for (const f of files) fd.append('fotos', f)
    const r = await apiFetch(`/api/crm/imoveis/${imovelId}/fotos`, { method: 'POST', body: fd, timeoutMs: 120000 }).catch(() => null)
    if (!r?.ok) {
      const err = await r?.json().catch(() => ({}))
      toast?.(err?.error || 'Erro ao carregar o documento', 'error', 4000)
      return
    }
    toast?.('Documento guardado nos documentos do imóvel', 'success', 3000)
    onChange()
  }

  async function adicionarTarefa() {
    if (!novaTarefa.trim()) return
    if (await pedido(`/api/crm/projetos/fases/${fase.id}/tarefas`, 'POST', { descricao: novaTarefa.trim() }, 'Erro ao adicionar tarefa')) setNovaTarefa('')
  }

  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Tarefas ({fase.tarefas_concluidas}/{fase.tarefas_total})</p>
      <div className="space-y-1.5 mb-2">
        {ativas.map(t => (
          <TarefaItem key={t.id} t={t} readOnly={readOnly} docs={docs} investidores={investidores} pedido={pedido}
            onCarregar={imovelId ? carregarDocumento : null} />
        ))}
        {ativas.length === 0 && <p className="text-[11px] text-gray-400 italic">Sem tarefas.</p>}
      </div>

      {porAtivar.length > 0 && (
        <div className="mt-3 mb-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Só quando for preciso · ativar se se aplicar a este imóvel</p>
          <div className="space-y-1">
            {porAtivar.map(t => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 border border-dashed border-gray-200 dark:border-neutral-700">
                <span className="flex-1 text-xs text-gray-500 dark:text-neutral-400">{t.descricao}</span>
                {!readOnly && (
                  <button type="button" onClick={() => pedido(`/api/crm/projetos/tarefas/${t.id}`, 'PUT', { ativa: true }, 'Erro ao ativar')}
                    className="text-[11px] font-semibold text-brand-gold hover:underline">Ativar</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="flex gap-2">
          <input value={novaTarefa} onChange={e => setNovaTarefa(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionarTarefa()}
            placeholder="Nova tarefa..."
            className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white dark:bg-neutral-900 dark:border-neutral-700" />
          <Button size="sm" icon={Plus} onClick={adicionarTarefa} disabled={!novaTarefa.trim()}>Adicionar</Button>
        </div>
      )}
    </div>
  )
}

function TarefaItem({ t, readOnly, docs, investidores, pedido, onCarregar }) {
  const ch = lerChecklist(t.checklist)
  const [aberta, setAberta] = useState(false)
  const obrig = ch ? ch.itens.filter(i => i.obrigatoria) : []
  const grupos = ch?.por_investidor
    ? investidores.map(inv => ({ id: inv.investidor_id, nome: inv.investidor_nome }))
    : [{ id: null, nome: null }]
  const chave = (g, i) => (g.id ? `${g.id}:${i.k}` : i.k)
  const totalObrig = ch ? grupos.length * obrig.length : 0
  const feitosObrig = ch ? grupos.reduce((s, g) => s + obrig.filter(i => ch.estado?.[chave(g, i)]?.feito).length, 0) : 0

  async function toggleTarefa() {
    if (readOnly) return
    await pedido(`/api/crm/projetos/tarefas/${t.id}`, 'PUT', { concluida: t.concluida ? 0 : 1 }, 'Erro ao atualizar tarefa')
  }
  async function apagar() {
    if (!confirm(`Apagar tarefa "${t.descricao}"?`)) return
    await pedido(`/api/crm/projetos/tarefas/${t.id}`, 'DELETE', null, 'Erro ao apagar tarefa')
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-100 dark:border-neutral-800">
      <div className="flex items-center gap-2 group px-2.5 py-2">
        <button type="button" onClick={toggleTarefa} className="flex-shrink-0" disabled={readOnly}
          title={ch && feitosObrig < totalObrig && !t.concluida ? 'Completa a checklist para concluir' : undefined}>
          {t.concluida ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Circle className="w-4 h-4 text-gray-300 hover:text-gray-500" />}
        </button>
        <button type="button" onClick={() => ch && setAberta(!aberta)}
          className={`flex-1 text-left text-xs ${t.concluida ? 'line-through text-gray-400' : 'text-gray-700 dark:text-neutral-200'} ${ch ? 'cursor-pointer' : 'cursor-default'}`}>
          {t.descricao}
        </button>
        {ch && (
          <button type="button" onClick={() => setAberta(!aberta)} className="flex items-center gap-1 text-[11px] font-mono text-gray-500">
            {ch.por_investidor && grupos.length === 0 ? 'sem investidores' : `${feitosObrig}/${totalObrig}`}
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${aberta ? 'rotate-90' : ''}`} />
          </button>
        )}
        {t.deadline && <span className="text-[10px] text-gray-400">{t.deadline}</span>}
        {!readOnly && t.opcional && (
          <button type="button" onClick={() => pedido(`/api/crm/projetos/tarefas/${t.id}`, 'PUT', { ativa: false }, 'Erro ao desativar')}
            className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 hover:text-gray-600">Desativar</button>
        )}
        {!readOnly && (
          <button type="button" onClick={apagar} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity" aria-label="Apagar tarefa">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {ch && aberta && (
        <div className="border-t border-gray-100 dark:border-neutral-800 px-3 py-2 space-y-2">
          {ch.por_investidor && grupos.length === 0 && (
            <p className="text-[11px] text-gray-500">Associa os investidores ao projeto (separador Investidores) para preencher esta checklist.</p>
          )}
          {grupos.map(g => (
            <div key={g.id || 'unico'}>
              {g.nome && <p className="text-[11px] font-semibold text-gray-600 dark:text-neutral-300 mb-1">{g.nome}</p>}
              <ul className="space-y-1">
                {ch.itens.map(i => {
                  const k = chave(g, i)
                  const est = ch.estado?.[k] || {}
                  const doc = i.slot ? docs[i.slot] : null
                  return (
                    <li key={k} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <input type="checkbox" id={`ck-${t.id}-${k}`} checked={!!est.feito} disabled={readOnly}
                        onChange={e => pedido(`/api/crm/projetos/tarefas/${t.id}/checklist`, 'PUT', { chave: k, feito: e.target.checked }, 'Erro ao guardar')}
                        className="accent-brand-gold w-3.5 h-3.5" />
                      <label htmlFor={`ck-${t.id}-${k}`} className={`${est.feito ? 'text-gray-400' : 'text-gray-700 dark:text-neutral-200'}`}>
                        {i.t}{!i.obrigatoria && <span className="text-gray-400"> (se aplicável)</span>}
                      </label>
                      {i.slot && (doc
                        ? <a href={doc.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand-gold hover:underline"><FileText className="w-3 h-3" />{doc.name}</a>
                        : <span className="text-[11px] text-gray-400">sem documento</span>)}
                      {i.slot && !readOnly && onCarregar && (
                        <label className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-brand-gold cursor-pointer">
                          <Upload className="w-3 h-3" />{doc ? 'Carregar nova versão' : 'Carregar'}
                          <input type="file" className="hidden"
                            onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; onCarregar(i.slot, fs) }} />
                        </label>
                      )}
                      {est.feito && est.por && <span className="text-[10px] text-gray-400">· {est.por}, {fmtData(est.em)}</span>}
                      {!readOnly ? (
                        <input type="text" defaultValue={est.nota || ''} placeholder="Nota"
                          onBlur={e => e.target.value !== (est.nota || '') && pedido(`/api/crm/projetos/tarefas/${t.id}/checklist`, 'PUT', { chave: k, nota: e.target.value }, 'Erro ao guardar nota')}
                          className="ml-auto w-40 max-w-full px-2 py-0.5 text-[11px] rounded border border-gray-200 bg-white dark:bg-neutral-900 dark:border-neutral-700" />
                      ) : est.nota ? <span className="text-[11px] text-gray-500 italic">— {est.nota}</span> : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
