/**
 * Janela para agendar o próximo passo de um imóvel com data e hora: a próxima
 * chamada ou a visita. Cria a tarefa que segue para o Google Calendar (a
 * visita fica também no registo de visitas do imóvel).
 *
 * onDepois (opcional): corre depois de agendar, por exemplo a mudança de fase no
 * Kanban, que exige o passo já marcado (requisito de entrada, auditoria D8).
 * Se devolver false, a janela fica aberta com o aviso.
 */
import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api.js'
import { CHAMADAS_IMOVEL, chamadaSugerida } from '../../constants/pipelineImoveis.js'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'

const inputClass = 'w-full px-3 py-2 rounded-lg border border-line bg-surface-raised text-ink text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition-colors duration-fast'

function emHoras(h) {
  const d = new Date(Date.now() + h * 3600000)
  d.setMinutes(0, 0, 0)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
function paraLocal(iso) {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const TEXTO = {
  chamada: { titulo: 'Próxima chamada', ajuda: 'Cria uma tarefa na agenda para voltar a ligar.', feito: 'Chamada agendada' },
  visita: { titulo: 'Marcar visita', ajuda: 'Fica no registo de visitas do imóvel e cria a tarefa na agenda.', feito: 'Visita marcada' },
}

export function AgendarPassoModal({ open = true, imovel, tipo, destino, onDepois, onCancel, onDone }) {
  const [quando, setQuando] = useState(emHoras(tipo === 'chamada' ? 24 : 48))
  const [tipoChamada, setTipoChamada] = useState(() => chamadaSugerida(destino || imovel?.estado))
  const [visitaAgendada, setVisitaAgendada] = useState(null)
  const [saving, setSaving] = useState(false)
  const [agendado, setAgendado] = useState(null) // passo já gravado: repetir só move
  const [erro, setErro] = useState('')
  const t = TEXTO[tipo]

  // Se já há uma visita agendada, remarca-a em vez de criar outra. Visitas com
  // investidor não contam.
  useEffect(() => {
    if (tipo !== 'visita' || !imovel?.id) return
    apiFetch(`/api/crm/imoveis/${imovel.id}/visitas`).then(r => r.ok ? r.json() : []).then(lista => {
      const ag = (lista || []).filter(x => x.estado === 'agendada' && !x.investidorId)
        .sort((a, b) => String(b.dataHora || '').localeCompare(String(a.dataHora || '')))[0]
      if (ag) { setVisitaAgendada(ag); if (ag.dataHora) setQuando(paraLocal(ag.dataHora)) }
    }).catch(() => {})
  }, [imovel?.id, tipo])

  async function confirmar() {
    if (!quando) return setErro('Indica a data e a hora.')
    setErro(''); setSaving(true)
    try {
      const iso = new Date(quando).toISOString()
      const r = agendado ? null : tipo === 'chamada'
        ? await apiFetch(`/api/crm/imoveis/${imovel.id}/proximos-passos`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: 'chamada', quando: iso, tipo_chamada: tipoChamada }),
          })
        : await apiFetch(visitaAgendada ? `/api/crm/visitas/${visitaAgendada.id}` : '/api/crm/visitas', {
            method: visitaAgendada ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imovel_id: imovel.id, data_hora: iso, estado: 'agendada' }),
          })
      if (r && !r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro ao agendar')
      const quandoTxt = new Date(quando).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      // Imóvel com consultor: a chamada entra no contacto com ele (um só por pessoa).
      const feito = agendado || (tipo === 'chamada' ? await r.json().catch(() => ({})) : {})
      if (onDepois && (await onDepois()) === false) {
        setAgendado(feito)
        return setErro(`${t.feito}, mas o imóvel não mudou de fase. Tenta de novo para mover.`)
      }
      onDone?.(feito.consultor
        ? `O imóvel entrou no contacto com ${feito.consultor.nome} (${String(feito.data_contacto || '').slice(0, 10).split('-').reverse().join('/')})`
        : `${t.feito} para ${quandoTxt}`)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onCancel} size="sm"
      title={destino ? `Mover para ${destino}` : t.titulo}
      subtitle={`${imovel?.nome ? `Imóvel: ${imovel.nome}. ` : ''}${t.ajuda}`}
      footer={
        <Modal.Footer>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={confirmar} loading={saving}>
            {saving ? 'A guardar…' : destino ? 'Agendar e mover' : 'Agendar'}
          </Button>
        </Modal.Footer>
      }>
        {tipo === 'chamada' && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Object.entries(CHAMADAS_IMOVEL).map(([k, c]) => (
              <button key={k} type="button" onClick={() => setTipoChamada(k)} aria-pressed={tipoChamada === k}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors duration-fast ${tipoChamada === k ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-muted hover:bg-surface-muted'}`}>
                {c.nome}
              </button>
            ))}
          </div>
        )}
        <label className="text-xs font-medium text-ink-muted block mb-1">
          {tipo === 'chamada' ? 'Data e hora da próxima tentativa' : visitaAgendada ? 'Data e hora da visita (remarcar)' : 'Data e hora da visita'}
        </label>
        <input type="datetime-local" className={inputClass} value={quando} onChange={e => setQuando(e.target.value)} />
        {tipo === 'chamada' && (
          <div className="flex gap-1.5 mt-2">
            {[24, 72].map(h => (
              <button key={h} type="button" onClick={() => setQuando(emHoras(h))}
                className="px-2.5 py-1 text-xs rounded-full border border-line text-ink-muted hover:bg-surface-muted transition-colors duration-fast">
                Daqui a {h}h
              </button>
            ))}
          </div>
        )}
        {erro && <p className="text-xs text-danger mt-3" role="alert">{erro}</p>}
    </Modal>
  )
}
