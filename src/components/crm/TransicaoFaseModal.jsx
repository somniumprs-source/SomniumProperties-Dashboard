/**
 * Janela de registo ao mudar um imóvel de fase. O servidor diz o que falta
 * para entrar na fase de destino (src/db/dealBreakers.js) e esta janela pede
 * só isso, grava no sítio real (visita, campos do imóvel) e devolve ao pai os
 * campos que seguem com a mudança de fase.
 *
 * mover=true  → o pai repete a mudança de fase com os campos (onConfirm).
 * mover=false → só regista o que falta, sem mudar de fase (painel do imóvel).
 */
import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api.js'
import { DECISOES, normalizeFicha } from '../../constants/fichaVisitaSchema.js'

const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300'
const DECISOES_ESPERA = { PERITO: 'Parecer técnico', SEGUNDA_VISITA: 'Segunda visita', STAND_BY: 'Rever informação em falta' }
const EFEITO_DECISAO = {
  GO: 'O imóvel pode entrar em «Estudo de VVR».',
  NO_GO: 'O imóvel não entra em estudo: passa para «Não interessa», com este motivo.',
  PERITO: 'O imóvel fica na fase atual até haver parecer. O próximo passo vai para a agenda.',
  SEGUNDA_VISITA: 'O imóvel fica na fase atual até à segunda visita. O próximo passo vai para a agenda.',
  STAND_BY: 'O imóvel fica na fase atual. O próximo passo vai para a agenda.',
}

const hoje = () => new Date().toISOString().slice(0, 10)
const agoraLocal = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const paraLocal = iso => {
  const d = new Date(iso)
  if (isNaN(d)) return agoraLocal()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function Campo({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      {children}
    </div>
  )
}

export function TransicaoFaseModal({ imovel, destino, requisitos = [], mover = true, onCancel, onConfirm, onResolvido, onAbrirImovel }) {
  const acoes = new Set(requisitos.map(r => r.acao))
  const pedeVisita = acoes.has('visita')
  const pedePreco = acoes.has('preco')
  const pedeProposta = acoes.has('proposta')
  const pedeAceite = acoes.has('aceite')
  const pedeVvr = acoes.has('vvr')
  const soVvr = pedeVvr && acoes.size === 1

  const [visitaExistente, setVisitaExistente] = useState(null)
  const [v, setV] = useState({ data: agoraLocal(), decisao: '', area: '', obra: '', motivo: '', proximo: hoje() })
  const [campos, setCampos] = useState({
    ask_price: imovel?.ask_price || '',
    valor_proposta: imovel?.valor_proposta || '',
    data_proposta: (imovel?.data_proposta || '').slice(0, 10) || hoje(),
    data_proposta_aceite: (imovel?.data_proposta_aceite || '').slice(0, 10) || hoje(),
  })
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  // Reaproveita a visita mais recente do imóvel (por exemplo, uma agendada que
  // já se realizou) em vez de criar outra.
  useEffect(() => {
    if (!pedeVisita || !imovel?.id) return
    apiFetch(`/api/crm/imoveis/${imovel.id}/visitas`).then(r => r.ok ? r.json() : []).then(lista => {
      const ult = [...(lista || [])].filter(x => x.estado !== 'cancelada')
        .sort((a, b) => String(b.dataHora || '').localeCompare(String(a.dataHora || '')))[0]
      if (!ult) return
      const f = normalizeFicha(ult.ficha)
      setVisitaExistente(ult)
      setV(p => ({
        ...p,
        data: ult.dataHora ? paraLocal(ult.dataHora) : p.data,
        decisao: f.relatorio.decisao || '',
        area: f.areaMedida || '',
        obra: f.totalObra || '',
        motivo: f.relatorio.justificacao || '',
      }))
    }).catch(() => {})
  }, [imovel?.id, pedeVisita])

  const setCampo = (k, val) => setCampos(p => ({ ...p, [k]: val }))
  const espera = !!DECISOES_ESPERA[v.decisao]

  async function gravarVisita() {
    const ficha = normalizeFicha(visitaExistente?.ficha)
    ficha.relatorio.decisao = v.decisao
    ficha.areaMedida = String(v.area)
    ficha.totalObra = String(v.obra)
    if (v.motivo.trim()) ficha.relatorio.justificacao = v.motivo.trim()
    const body = { imovel_id: imovel.id, data_hora: new Date(v.data).toISOString(), estado: 'realizada', ficha }
    const r = await apiFetch(visitaExistente ? `/api/crm/visitas/${visitaExistente.id}` : '/api/crm/visitas', {
      method: visitaExistente ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao gravar a visita')
  }

  async function put(body) {
    const r = await apiFetch(`/api/crm/imoveis/${imovel.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao guardar')
  }

  async function confirmar() {
    setErro('')
    if (pedeVisita) {
      if (!v.data || !v.decisao || v.area === '' || v.obra === '') return setErro('Preenche a data, a decisão, a área medida e o custo de obra (pode ser 0).')
      if (v.decisao === 'NO_GO' && !v.motivo.trim()) return setErro('Indica o motivo do NO GO.')
      if (espera && !v.proximo) return setErro('Indica a data do próximo passo.')
    }
    if (pedePreco && !(Number(campos.ask_price) > 0)) return setErro('Indica o preço pedido.')
    if ((pedeProposta || pedeAceite) && !(Number(campos.valor_proposta) > 0)) return setErro('Indica o valor da proposta.')
    if (pedeProposta && !campos.data_proposta) return setErro('Indica a data da proposta.')
    if (pedeAceite && !campos.data_proposta_aceite) return setErro('Indica a data de aceitação.')

    setSaving(true)
    try {
      if (pedeVisita) {
        await gravarVisita()
        if (v.decisao === 'NO_GO') {
          await put({ estado: 'Não interessa', motivo_nao_interessa: `Visita com decisão NO GO: ${v.motivo.trim()}` })
          return onResolvido?.('Visita registada com NO GO. O imóvel passou para «Não interessa».')
        }
        if (espera) {
          const r = await apiFetch(`/api/crm/imoveis/${imovel.id}/follow-up`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: v.proximo, motivo: DECISOES_ESPERA[v.decisao] }),
          })
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao agendar o próximo passo')
          return onResolvido?.('Visita registada. O imóvel fica na fase atual e o próximo passo foi agendado.')
        }
      }
      const extra = {}
      if (pedePreco) extra.ask_price = Number(campos.ask_price)
      if (pedeProposta || pedeAceite) extra.valor_proposta = Number(campos.valor_proposta)
      if (pedeProposta) extra.data_proposta = campos.data_proposta
      if (pedeAceite) extra.data_proposta_aceite = campos.data_proposta_aceite
      if (mover) return await onConfirm?.(extra)
      if (Object.keys(extra).length) await put(extra)
      onResolvido?.(pedeVisita ? 'Visita registada.' : 'Guardado.')
    } catch (e) {
      setErro(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-800 mb-1">
          {mover ? `Mover para ${destino}` : pedeVisita ? 'Registar visita' : 'Registar em falta'}
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          {imovel?.nome ? `Imóvel: ${imovel.nome}. ` : ''}
          {mover ? 'Esta fase precisa do seguinte:' : 'Fica gravado no registo do imóvel.'}
        </p>

        <div className="space-y-3 mb-4">
          {pedePreco && (
            <Campo label="Preço pedido (€)">
              <input type="number" min="0" step="any" className={inputClass} value={campos.ask_price}
                onChange={e => setCampo('ask_price', e.target.value)} onWheel={e => e.target.blur()} />
            </Campo>
          )}

          {pedeVisita && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Data e hora da visita">
                  <input type="datetime-local" className={inputClass} value={v.data} onChange={e => setV(p => ({ ...p, data: e.target.value }))} />
                </Campo>
                <Campo label="Decisão">
                  <select className={inputClass} value={v.decisao} onChange={e => setV(p => ({ ...p, decisao: e.target.value }))}>
                    <option value="">Escolher…</option>
                    {DECISOES.map(d => <option key={d.key} value={d.key}>{d.label.split(' — ')[0]}</option>)}
                  </select>
                </Campo>
                <Campo label="Área medida (m²)">
                  <input type="number" min="0" step="any" className={inputClass} value={v.area}
                    onChange={e => setV(p => ({ ...p, area: e.target.value }))} onWheel={e => e.target.blur()} />
                </Campo>
                <Campo label="Custo de obra estimado (€)">
                  <input type="number" min="0" step="any" className={inputClass} value={v.obra}
                    onChange={e => setV(p => ({ ...p, obra: e.target.value }))} onWheel={e => e.target.blur()} />
                </Campo>
              </div>
              {(v.decisao === 'NO_GO' || espera) && (
                <Campo label={v.decisao === 'NO_GO' ? 'Motivo do NO GO' : 'Notas (opcional)'}>
                  <textarea rows={2} className={inputClass} value={v.motivo} onChange={e => setV(p => ({ ...p, motivo: e.target.value }))} />
                </Campo>
              )}
              {espera && (
                <Campo label={`Data do próximo passo (${DECISOES_ESPERA[v.decisao].toLowerCase()})`}>
                  <input type="date" className={inputClass} value={v.proximo} onChange={e => setV(p => ({ ...p, proximo: e.target.value }))} />
                </Campo>
              )}
              {v.decisao && <p className="text-xs text-gray-500">{EFEITO_DECISAO[v.decisao]}</p>}
              <p className="text-[11px] text-gray-400">A Ficha de Visita completa continua disponível na aba Visitas.</p>
            </>
          )}

          {(pedeProposta || pedeAceite) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label={pedeAceite ? 'Valor final da proposta (€)' : 'Valor da proposta (€)'}>
                <input type="number" min="0" step="any" className={inputClass} value={campos.valor_proposta}
                  onChange={e => setCampo('valor_proposta', e.target.value)} onWheel={e => e.target.blur()} />
              </Campo>
              {pedeProposta && (
                <Campo label="Data de envio da proposta">
                  <input type="date" className={inputClass} value={campos.data_proposta} onChange={e => setCampo('data_proposta', e.target.value)} />
                </Campo>
              )}
              {pedeAceite && (
                <Campo label="Data de aceitação">
                  <input type="date" className={inputClass} value={campos.data_proposta_aceite} onChange={e => setCampo('data_proposta_aceite', e.target.value)} />
                </Campo>
              )}
            </div>
          )}

          {pedeVvr && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              Falta definir o VVR no estudo de mercado. Regista-se na aba Análise Financeira do imóvel.
              {onAbrirImovel && (
                <button type="button" onClick={onAbrirImovel} className="block mt-1.5 text-xs font-semibold underline">Abrir o imóvel</button>
              )}
            </div>
          )}
        </div>

        {erro && <p className="text-xs text-red-600 mb-3">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {soVvr ? 'Fechar' : 'Cancelar'}
          </button>
          {!soVvr && (
            <button onClick={confirmar} disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#C9A84C' }}>
              {saving ? 'A guardar…' : mover && !(pedeVisita && v.decisao && v.decisao !== 'GO') ? 'Guardar e mover' : 'Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
