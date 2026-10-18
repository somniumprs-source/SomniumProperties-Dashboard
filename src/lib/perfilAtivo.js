// Perfil ativo: a equipa partilha a sessão Supabase (vários users com o mesmo
// email). O perfil escolhido fica neste aparelho e segue em X-User-Id em todos
// os pedidos (src/lib/api.js e src/main.jsx); o servidor usa-o como autor no
// histórico e recusa escritas sem ele (PERFIL_OBRIGATORIO, 428).
export const ACTIVE_USER_KEY = 'somnium:active_user_id'
export const EVENTO_PERFIL_MUDOU = 'somnium:perfil-mudou'
export const EVENTO_PERFIL_OBRIGATORIO = 'somnium:perfil-obrigatorio'

export function lerPerfilAtivo() {
  try { return window.localStorage.getItem(ACTIVE_USER_KEY) } catch { return null }
}

export function definirPerfilAtivo(id) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_USER_KEY, id)
    else window.localStorage.removeItem(ACTIVE_USER_KEY)
  } catch {}
  window.dispatchEvent(new Event(EVENTO_PERFIL_MUDOU))
}
