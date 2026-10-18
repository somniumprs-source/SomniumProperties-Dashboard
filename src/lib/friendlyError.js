// Erros em linguagem simples. Usado pelo ErrorState e pelas páginas (toasts).

const GENERICA = 'Ocorreu um erro inesperado. Tenta novamente; se continuar, avisa a equipa técnica.'

// Mensagem técnica? (JSON, stack, códigos HTTP, nomes de exceções)
const TECNICA = /^\s*[{[]|\bat \S+ \(|\b[A-Z][a-zA-Z]*Error\b|\bHTTP \d{3}\b|undefined|null|\bfetch\b|\bstatus\b|<\/?[a-z]/

/** Converte qualquer erro numa frase compreensível para quem usa a plataforma. */
export function friendlyError(err) {
  if (!err) return GENERICA
  const msg = typeof err === 'string' ? err : String(err.message || '')
  const status = Number(err.status || err.statusCode || msg.match(/\b(?:HTTP|status)\s*(\d{3})\b/i)?.[1]) || 0

  if (err.code === 'DEV_READ_ONLY' || /DEV_READ_ONLY|só de leitura/i.test(msg)) return 'Este ambiente está em modo só de leitura: as alterações estão desativadas.'
  if (err.name === 'AbortError' || /timeout|timed out|demorou/i.test(msg)) return 'O pedido demorou demasiado. Tenta novamente.'
  if (/Failed to fetch|NetworkError|Load failed|ERR_NETWORK|ECONNREFUSED/i.test(msg)) return 'Sem ligação ao servidor. Verifica a internet e tenta novamente.'
  if (status === 401) return 'A sessão expirou. Volta a entrar para continuar.'
  if (status === 403) return 'Não tens permissão para ver esta informação.'
  if (status === 404) return 'Não encontrámos o que procuras. Pode ter sido removido.'
  if (status >= 500) return 'O servidor não respondeu como esperado. Tenta novamente daqui a pouco.'
  // Texto já escrito para pessoas (ex.: vindo da própria página) passa tal como está.
  if (typeof err === 'string' && msg.length <= 160 && !TECNICA.test(msg)) return msg
  return GENERICA
}
