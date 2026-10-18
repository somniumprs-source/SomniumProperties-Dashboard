/**
 * Janela de registo ao mudar um imóvel de fase. O servidor diz o que falta
 * para entrar na fase de destino (src/db/dealBreakers.js) e esta janela pede
 * só isso, grava no sítio real (visita, campos do imóvel) e devolve ao pai os
 * campos que seguem com a mudança de fase.
 *
 * Fases de espera e de agendamento (auditoria D8): o follow-up segue pela
 * porta única /follow-up (que também muda a fase); a visita e a chamada
 * agendam-se antes de a fase mudar; a data da primeira chamada segue com a
 * mudança de fase.
 *
 * mover=true  → o pai repete a mudança de fase com os campos (onConfirm).
 * mover=false → só regista o que falta, sem mudar de fase (painel do imóvel).
 */
import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api.js'
import { DECISOES, normalizeFicha } from '../../constants/fichaVisitaSchema.js'
import { chamadaSugerida } from '../../constants/pipelineImoveis.js'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'

const inputClass = 'w-full px-3 py-2 rounded-lg border border-line bg-surface-raised text-ink text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-colors duration-fast'
const DECISOES_ESPERA = { PERITO: 'Parecer técnico', SEGUNDA_VISITA: 'Segunda visita', STAND_BY: 'Rever informação em falta' }
const EFEITO_DECISAO = {
  GO: 'O imóvel pode entrar em «Estudo de VVR».',
  NO_GO: 'O imóvel não entra em estudo: passa para «Não interessa», com este motivo.',
  PERITO: 'À espera de parecer: escolhe se o imóvel fica em «Pendentes» ou passa a «Follow UP». O follow-up vai para a agenda.',
  SEGUNDA_VISITA: 'À espera da segunda visita: escolhe se o imóvel fica em «Pendentes» ou passa a «Follow UP». O follow-up vai para a agenda.',
  STAND_BY: 'Em espera: escolhe se o imóvel fica em «Pendentes» ou passa a «Follow UP». O follow-up vai para a agenda.',
}

const hoje = () => new Date().toISOString().slice(0, 10)
const agoraLocal = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const emHoras = h => {
  const d = new Date(Date.now() + h * 3600000)
  d.setMinutes(0, 0, 0)
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
      <label className="text-xs font-medium text-ink-muted block mb-1">{label}</label>
      {children}
    </div>
  )
}

export function TransicaoFaseModal({ open = true, imovel, destino, requisitos = [], mover = true, onCancel, onConfirm, onResolvido, onAbrirImovel }) {
  const acoes = new Set(requisitos.map(r => r.acao))
  const pedeVisita = acoes.has('visita')
  const pedePreco = acoes.has('preco')
  const pedeProposta = acoes.has('proposta')
  const pedeAceite = acoes.has('aceite')
  const pedeVvr = acoes.has('vvr')
  const soVvr = pedeVvr && acoes.size === 1
  const reqFollowUp = requisitos.find(r => r.acao === 'follow_up')
  const faseFollowUp = reqFollowUp?.fase || destino
  const pedeChamadaReg = acoes.has('chamada_registada')
  const pedeVisitaAg = acoes.has('visita_agendada')
  const pedeChamadaAg = acoes.has('chamada_agendada')
  const [fu, setFu] = useState(() => {
    const d = String(imovel?.data_follow_up || '').slice(0, 10)
    return { motivo: imovel?.motivo_follow_up || '', data: d >= hoje() ? d : hoje() }
  })
  const [agenda, setAgenda] = useState({ chamada: (imovel?.data_chamada || '').slice(0, 10) || hoje(), visita: emHoras(48), proxima: emHoras(24) })

  const [visitaExistente, setVisitaExistente] = useState(null)
  const [v, setV] = useState({ data: agoraLocal(), decisao: '', area: '', obra: '', motivo: '', proximo: hoje(), faseEspera: '' })
  const [campos, setCampos] = useState({
    ask_price: imovel?.ask_price || '',
    valor_proposta: imovel?.valor_proposta || '',
    data_proposta: (imovel?.data_proposta || '').slice(0, 10) || hoje(),
    data_proposta_aceite: (imovel?.data_proposta_aceite || '').slice(0, 10) || hoje(),
  })
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  // Reaproveita a visita mais recente do imóvel (por exemplo, uma agendada que
  // já se realizou) em vez de criar outra. Visitas com investidor não contam.
  useEffect(() => {
    if (!pedeVisita || !imovel?.id) return
    apiFetch(`/api/crm/imoveis/${imovel.id}/visitas`).then(r => r.ok ? r.json() : []).then(lista => {
      const ult = [...(lista || [])].filter(x => x.estado !== 'cancelada' && !x.investidorId)
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

  async function post(url, body, falha) {
    const r = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || falha)
    return r.json().catch(() => ({}))
  }

  async function confirmar() {
    setErro('')
    if (reqFollowUp) {
      if (!fu.motivo.trim()) return setErro('Indica o motivo.')
      if (!fu.data || fu.data < hoje()) return setErro('Indica uma data a partir de hoje.')
    }
    if (pedeChamadaReg && !agenda.chamada) return setErro('Indica a data da primeira chamada.')
    if (pedeVisitaAg && !agenda.visita) return setErro('Indica a data e a hora da visita.')
    if (pedeChamadaAg && !agenda.proxima) return setErro('Indica a data e a hora da próxima tentativa.')
    if (pedeVisita) {
      if (!v.data || !v.decisao || v.area === '' || v.obra === '') return setErro('Preenche a data, a decisão, a área medida e o custo de obra (pode ser 0).')
      if (v.decisao === 'NO_GO' && !v.motivo.trim()) return setErro('Indica o motivo do NO GO.')
      if (espera && !v.faseEspera) return setErro('Escolhe se o imóvel fica em Pendentes ou passa a Follow UP.')
      if (espera && !v.proximo) return setErro('Indica a data do follow-up.')
    }
    if (pedePreco && !(Number(campos.ask_price) > 0)) return setErro('Indica o preço pedido.')
    if ((pedeProposta || pedeAceite) && !(Number(campos.valor_proposta) > 0)) return setErro('Indica o valor da proposta.')
    if (pedeProposta && !campos.data_proposta) return setErro('Indica a data da proposta.')
    if (pedeAceite && !campos.data_proposta_aceite) return setErro('Indica a data de aceitação.')

    setSaving(true)
    try {
      if (reqFollowUp) {
        const { estado, consultor } = await post(`/api/crm/imoveis/${imovel.id}/follow-up`,
          { data: fu.data, motivo: fu.motivo.trim(), destino: faseFollowUp }, 'Erro ao agendar o follow-up')
        const onde = consultor ? `o follow-up entrou no contacto com ${consultor.nome}` : 'o follow-up está na agenda'
        return onResolvido?.(estado ? `O imóvel passou para «${estado}» e ${onde}.` : `Guardado: ${onde}.`)
      }
      if (pedeVisitaAg) {
        await post('/api/crm/visitas', { imovel_id: imovel.id, data_hora: new Date(agenda.visita).toISOString(), estado: 'agendada' }, 'Erro ao marcar a visita')
      }
      if (pedeChamadaAg) {
        await post(`/api/crm/imoveis/${imovel.id}/proximos-passos`,
          { tipo: 'chamada', quando: new Date(agenda.proxima).toISOString(), tipo_chamada: chamadaSugerida(destino || imovel?.estado) }, 'Erro ao agendar a chamada')
      }
      if (pedeVisita) {
        await gravarVisita()
        if (v.decisao === 'NO_GO') {
          await put({ estado: 'Não interessa', motivo_nao_interessa: `Visita com decisão NO GO: ${v.motivo.trim()}` })
          return onResolvido?.('Visita registada com NO GO. O imóvel passou para «Não interessa».')
        }
        if (espera) {
          const r = await apiFetch(`/api/crm/imoveis/${imovel.id}/follow-up`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: v.proximo, motivo: [DECISOES_ESPERA[v.decisao], v.motivo.trim()].filter(Boolean).join(': '), destino: v.faseEspera }),
          })
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao agendar o próximo passo')
          const { estado, consultor } = await r.json().catch(() => ({}))
          const onde = consultor ? `o follow-up entrou no contacto com ${consultor.nome}` : 'o follow-up foi agendado'
          return onResolvido?.(estado
            ? `Visita registada. O imóvel passou para «${estado}» e ${onde}.`
            : `Visita registada. O imóvel fica em «${v.faseEspera}» e ${onde}.`)
        }
      }
      const extra = {}
      if (pedePreco) extra.ask_price = Number(campos.ask_price)
      if (pedeProposta || pedeAceite) extra.valor_proposta = Number(campos.valor_proposta)
      if (pedeProposta) extra.data_proposta = campos.data_proposta
      if (pedeAceite) extra.data_proposta_aceite = campos.data_proposta_aceite
      if (pedeChamadaReg) extra.data_chamada = agenda.chamada
      if (mover) return await onConfirm?.(extra)
      if (Object.keys(extra).length) await put(extra)
      onResolvido?.(pedeVisita ? 'Visita registada.' : pedeVisitaAg ? 'Visita marcada.' : pedeChamadaAg ? 'Chamada agendada.' : 'Guardado.')
    } catch (e) {
      setErro(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onCancel} size="md"
      title={mover ? `Mover para ${destino}` : pedeVisita ? 'Registar visita' : 'Registar em falta'}
      subtitle={`${imovel?.nome ? `Imóvel: ${imovel.nome}. ` : ''}${mover ? 'Esta fase precisa do seguinte:' : 'Fica gravado no registo do imóvel.'}`}
      footer={
        <Modal.Footer>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            {soVvr ? 'Fechar' : 'Cancelar'}
          </Button>
          {!soVvr && (
            <Button variant="primary" onClick={confirmar} loading={saving}>
              {saving ? 'A guardar…' : mover && !(pedeVisita && v.decisao && v.decisao !== 'GO') ? 'Guardar e mover' : 'Guardar'}
            </Button>
          )}
        </Modal.Footer>
      }>
        <div className="space-y-3">
          {reqFollowUp && (
            <>
              <Campo label={faseFollowUp === 'Pendentes' ? 'Motivo (o que falta resolver)' : 'Motivo do follow-up'}>
                <textarea rows={3} className={inputClass} value={fu.motivo} autoFocus
                  onChange={e => setFu(p => ({ ...p, motivo: e.target.value }))} />
              </Campo>
              <Campo label={`${faseFollowUp === 'Pendentes' ? 'Data de reativação' : 'Data do follow-up'} (cria a tarefa na agenda)`}>
                <input type="date" min={hoje()} className={inputClass} value={fu.data} onChange={e => setFu(p => ({ ...p, data: e.target.value }))} />
              </Campo>
            </>
          )}

          {pedeChamadaReg && (
            <Campo label="Data da primeira chamada ao proprietário ou consultor">
              <input type="date" max={hoje()} className={inputClass} value={agenda.chamada} onChange={e => setAgenda(p => ({ ...p, chamada: e.target.value }))} />
            </Campo>
          )}

          {pedeVisitaAg && (
            <Campo label="Data e hora da visita (fica no registo de visitas e na agenda)">
              <input type="datetime-local" className={inputClass} value={agenda.visita} onChange={e => setAgenda(p => ({ ...p, visita: e.target.value }))} />
            </Campo>
          )}

          {pedeChamadaAg && (
            <Campo label="Data e hora da próxima tentativa (cria a tarefa na agenda)">
              <input type="datetime-local" className={inputClass} value={agenda.proxima} onChange={e => setAgenda(p => ({ ...p, proxima: e.target.value }))} />
            </Campo>
          )}

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
                <Campo label="O imóvel fica em">
                  <select className={inputClass} value={v.faseEspera} onChange={e => setV(p => ({ ...p, faseEspera: e.target.value }))}>
                    <option value="">Escolher…</option>
                    <option value="Pendentes">Pendentes — algo a resolver antes de ser analisado</option>
                    <option value="Follow UP">Follow UP — algo tem de mudar para o negócio ser viável</option>
                  </select>
                </Campo>
              )}
              {espera && (
                <Campo label={`Data do follow-up (${DECISOES_ESPERA[v.decisao].toLowerCase()})`}>
                  <input type="date" className={inputClass} value={v.proximo} onChange={e => setV(p => ({ ...p, proximo: e.target.value }))} />
                </Campo>
              )}
              {v.decisao && <p className="text-xs text-ink-muted">{EFEITO_DECISAO[v.decisao]}</p>}
              <p className="text-[11px] text-ink-muted">A Ficha de Visita completa continua disponível na aba Visitas.</p>
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
            <div className="rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-sm text-warning">
              Falta definir o VVR no estudo de mercado. Regista-se na aba Análise Financeira do imóvel.
              {onAbrirImovel && (
                <button type="button" onClick={onAbrirImovel} className="block mt-1.5 text-xs font-semibold underline">Abrir o imóvel</button>
              )}
            </div>
          )}
        </div>

        {erro && <p className="text-xs text-danger mt-3" role="alert">{erro}</p>}
    </Modal>
  )
}
