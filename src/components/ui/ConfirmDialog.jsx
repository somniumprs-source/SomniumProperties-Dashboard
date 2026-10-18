/**
 * ConfirmDialog — substitui o confirm() nativo do navegador por uma janela da plataforma.
 * Uso (em qualquer sítio, dentro ou fora de componentes):
 *   if (!(await confirmar('Apagar esta despesa?'))) return
 *   await confirmar('Tens alterações…', { confirmLabel: 'Guardar e mudar', cancelLabel: 'Ficar' })
 * Mensagens com Apagar/Eliminar/Remover usam o botão de perigo por omissão.
 */
import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal.jsx'
import { Button } from './Button.jsx'

let abrir = null

// eslint-disable-next-line react-refresh/only-export-components -- função de chamada, vive junto do provider
export function confirmar(message, opts = {}) {
  // Sem provider montado (ex.: testes), mantém o comportamento antigo.
  if (!abrir) return Promise.resolve(window.confirm(message))
  return new Promise(resolve => abrir({ message, ...opts, resolve }))
}

const PERIGO = /\b(apagar|eliminar|remover|restaurar)\b/i

export function ConfirmProvider({ children }) {
  const [pedido, setPedido] = useState(null)
  const fila = useRef([])

  useEffect(() => {
    abrir = (p) => setPedido(atual => {
      if (atual) { fila.current.push(p); return atual }
      return p
    })
    return () => { abrir = null }
  }, [])

  const responder = (valor) => {
    pedido?.resolve(valor)
    setPedido(fila.current.shift() || null)
  }

  const perigo = pedido?.danger ?? PERIGO.test(pedido?.message || '')
  const [titulo, ...resto] = (pedido?.message || '').split('\n\n')

  return (
    <>
      {children}
      <Modal open={!!pedido} onClose={() => responder(false)} size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => responder(false)}>{pedido?.cancelLabel || 'Cancelar'}</Button>
            <Button variant={perigo ? 'destructive' : 'primary'} autoFocus onClick={() => responder(true)}>
              {pedido?.confirmLabel || (perigo ? 'Confirmar' : 'Continuar')}
            </Button>
          </div>
        }>
        <p className="text-sm font-medium text-ink whitespace-pre-line">{titulo}</p>
        {resto.length > 0 && <p className="text-caption text-ink-muted mt-2 whitespace-pre-line">{resto.join('\n\n')}</p>}
      </Modal>
    </>
  )
}
