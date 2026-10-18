/**
 * Janela «Quem está a operar?». A equipa partilha a sessão: sem perfil
 * escolhido neste aparelho o servidor recusa escritas e o histórico não
 * saberia quem fez o quê. Abre ao entrar (sem perfil válido) e sempre que o
 * servidor recusa uma escrita por falta de perfil (428). Não fecha sem escolha.
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { Modal } from '../ui/Modal.jsx'
import { lerPerfilAtivo, definirPerfilAtivo, EVENTO_PERFIL_MUDOU, EVENTO_PERFIL_OBRIGATORIO } from '../../lib/perfilAtivo.js'

export function PerfilObrigatorio() {
  const { profile } = useAuth()
  const perfis = profile?.perfis || []
  const [ativo, setAtivo] = useState(lerPerfilAtivo)
  const [recusado, setRecusado] = useState(false)

  useEffect(() => {
    const mudou = () => { setAtivo(lerPerfilAtivo()); setRecusado(false) }
    const recusa = () => setRecusado(true)
    window.addEventListener(EVENTO_PERFIL_MUDOU, mudou)
    window.addEventListener(EVENTO_PERFIL_OBRIGATORIO, recusa)
    return () => {
      window.removeEventListener(EVENTO_PERFIL_MUDOU, mudou)
      window.removeEventListener(EVENTO_PERFIL_OBRIGATORIO, recusa)
    }
  }, [])

  const partilhada = perfis.length > 1
  const valido = perfis.some(p => p.id === ativo)
  const aberto = partilhada && (!valido || recusado)

  return (
    <Modal open={aberto} onClose={() => {}} size="sm">
      <h2 className="text-base font-semibold text-ink">Quem está a operar?</h2>
      <p className="text-caption text-ink-muted mt-1 mb-4">
        {recusado && valido
          ? 'A alteração não foi gravada. Confirma o perfil e repete-a.'
          : 'Este aparelho ainda não tem perfil. Cada alteração fica registada em nome de quem a fez.'}
      </p>
      <div className="flex flex-col gap-2">
        {perfis.map(p => (
          <button key={p.id} onClick={() => definirPerfilAtivo(p.id)}
            className={`w-full text-left px-4 py-3 rounded-xl border transition-colors duration-fast ${p.id === ativo ? 'border-accent bg-accent/10' : 'border-line hover:bg-surface-muted'}`}>
            <span className="text-sm font-medium text-ink">{p.nome}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
