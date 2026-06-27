import { supabase, authEnabled } from './supabase.js'
import { getRegiaoActivaFromStorage } from '../contexts/RegiaoContext.jsx'
// Re-export: aponta `/api/*` para a Edge Function correcta quando VITE_API_URL
// está definido. Continua exportado para quem o importe directamente.
import { resolveApiUrl, API_BASE } from './apiUrl.js'
export { resolveApiUrl, API_BASE }

/**
 * Devolve o access token actual da sessão Supabase (string vazia se não houver).
 * Útil para construir URLs com `?token=...` em window.open de PDFs.
 *
 * Os links de PDF abrem num separador novo (window.open) e por isso NÃO passam
 * pelo interceptor de fetch de main.jsx — não têm o cache de token que esse
 * interceptor mantém. Em PWA/mobile (e durante a renovação do JWT) o
 * `getSession()` devolve vazio por instantes; sem rede de segurança o link de
 * PDF saía sem `?token=` e o backend respondia "Autenticação necessária".
 * Aqui replicamos a mesma resiliência: cache do último token válido (janela de
 * 5 min, igual ao interceptor) alimentado por onAuthStateChange, + refresh
 * forçado como fallback intermédio.
 */
const TOKEN_GRACE_MS = 5 * 60_000
let _lastToken = ''
let _lastTokenAt = 0
if (authEnabled && supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.access_token) {
      _lastToken = session.access_token
      _lastTokenAt = Date.now()
    } else if (event === 'SIGNED_OUT') {
      _lastToken = ''
      _lastTokenAt = 0
    }
  })
}

export async function getToken() {
  if (!authEnabled || !supabase) return ''
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const tok = session?.access_token || ''
    if (tok) {
      _lastToken = tok
      _lastTokenAt = Date.now()
      return tok
    }
    // Sessão transitoriamente indisponível: tentar renovar com o refresh token.
    try {
      const { data } = await supabase.auth.refreshSession()
      const fresh = data?.session?.access_token || ''
      if (fresh) {
        _lastToken = fresh
        _lastTokenAt = Date.now()
        return fresh
      }
    } catch { /* cai para o cache */ }
  } catch { /* cai para o cache */ }
  // Último recurso: usar o token cacheado se ainda estiver dentro da janela.
  if (_lastToken && Date.now() - _lastTokenAt < TOKEN_GRACE_MS) return _lastToken
  return ''
}

// Escapa texto para interpolação segura em HTML. Os documentos abrem num
// about:blank que herda a origem da app (same-origin), por isso uma mensagem
// de erro vinda do backend escrita sem escape via document.write seria XSS
// executável. Toda a interpolação dinâmica passa por aqui.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

// Ponte global para notificações (toast). O ToastProvider regista um listener
// deste evento. Usado por helpers fora da árvore React (ex.: openDocument) para
// garantir que NENHUM clique falha em silêncio, mesmo sem janela onde pintar.
function notifyUser(message, type = 'error') {
  try { window.dispatchEvent(new CustomEvent('somnium:toast', { detail: { message, type } })) } catch { /* ambiente sem window */ }
}

// Após mutações bem sucedidas, sinalizar o dashboard (e outros listeners) para
// refrescar. Debounced para coalescer rajadas (ex.: gravar vários campos em sequência).
let _refreshTimer = null
function scheduleRefreshSignal() {
  if (typeof window === 'undefined') return
  if (_refreshTimer) clearTimeout(_refreshTimer)
  _refreshTimer = setTimeout(() => {
    try { window.dispatchEvent(new CustomEvent('somnium:refresh')) } catch { /* ambientes sem CustomEvent */ }
    _refreshTimer = null
  }, 500)
}

/**
 * Fetch wrapper. O Authorization header é adicionado pelo interceptor global
 * do `window.fetch` (definido em main.jsx) que tem cache de token com TTL —
 * evita chamar `supabase.auth.getSession()` a cada apiFetch (era 100-300ms
 * por chamada × N requests paralelas no boot).
 *
 * Para filtrar por região, o caller passa `options.regiao = 'Coimbra' | 'AMP'`
 * — o wrapper injecta o header `X-Regiao`. Sem regiao = sem filtro.
 *
 * Emite o evento "somnium:refresh" depois de mutações OK, excepto quando o
 * caller passa `skipRefresh: true` — usado pelos autosaves debounced (Análise,
 * Orçamento de Obra) para não forçarem o re-fetch da lista a cada gravação
 * (o que fazia a página saltar para o topo). A lista actualiza ao fechar a ficha.
 */
// Timeout default: 30s. Antes ficavam requests penduradas indefinidamente
// quando o backend não respondia (Render cold-start, Supabase pool exausto),
// e o Dashboard mostrava "A carregar dados..." eternamente. Com abort, o
// catch dispara e o utilizador vê uma mensagem de erro accionável.
const DEFAULT_TIMEOUT_MS = 30_000

export async function apiFetch(url, options = {}) {
  const { regiao, timeoutMs = DEFAULT_TIMEOUT_MS, skipRefresh = false, ...rest } = options
  const headers = { ...rest.headers }
  // Prioridade: regiao explícito > sessionStorage da página actual (apenas
  // se URL for `/api/crm/*` para limitar a entidades regionais).
  if (!headers['X-Regiao']) {
    let r = regiao
    if (!r && typeof url === 'string' && url.startsWith('/api/crm/')) {
      r = getRegiaoActivaFromStorage()
    }
    if (r) headers['X-Regiao'] = r
  }
  // Perfil activo: a equipa partilha a sessao Supabase (somniumprs@gmail.com).
  // O ID escolhido na sidebar e enviado para o backend identificar quem fez
  // a alteracao no historico (historico_alteracoes.user_nome).
  if (!headers['X-User-Id'] && typeof window !== 'undefined') {
    try {
      const activeId = window.localStorage.getItem('somnium:active_user_id')
      if (activeId) headers['X-User-Id'] = activeId
    } catch {}
  }
  // AbortController só corre se o caller não passou já um signal — senão
  // respeitamos o controlo deles (ex: componentes que cancelam ao desmontar).
  let controller
  let timer
  let signal = rest.signal
  if (!signal && timeoutMs > 0) {
    controller = new AbortController()
    signal = controller.signal
    timer = setTimeout(() => controller.abort(), timeoutMs)
  }
  try {
    const res = await fetch(url, { ...rest, headers, signal })
    const method = (options.method || 'GET').toUpperCase()
    if (res.ok && !skipRefresh && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
      scheduleRefreshSignal()
    }
    return res
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// Deriva um nome de ficheiro a partir do path do endpoint (último segmento
// significativo), para o atributo `download` quando o backend não envia
// Content-Disposition (ex.: respostas servidas via redirect do Storage).
function filenameFromPath(path, fallbackExt = 'pdf') {
  try {
    const clean = String(path).split('?')[0].replace(/\/+$/, '')
    const seg = clean.split('/').filter(Boolean).pop() || 'documento'
    return /\.[a-z0-9]{2,4}$/i.test(seg) ? seg : `${seg}.${fallbackExt}`
  } catch { return `documento.${fallbackExt}` }
}

// Tenta extrair o filename do header Content-Disposition da resposta.
// Prefere a forma RFC 5987 `filename*=UTF-8''...` (com acentos) à `filename=`.
function filenameFromResponse(res) {
  try {
    const cd = res.headers.get('content-disposition') || ''
    const ext = cd.match(/filename\*=(?:UTF-8'')?["']?([^"';]+)/i)
    if (ext && ext[1]) { try { return decodeURIComponent(ext[1]) } catch { return ext[1] } }
    const basic = cd.match(/filename=["']?([^"';]+)/i)
    if (basic && basic[1]) { try { return decodeURIComponent(basic[1]) } catch { return basic[1] } }
  } catch {}
  return null
}

/**
 * CAMINHO ÚNICO para abrir/descarregar QUALQUER documento do backend (PDF,
 * Excel, backup...). Substitui o antigo padrão `?token=` na query, que abria
 * fora do interceptor de fetch e por isso falhava com "Autenticação necessária"
 * sempre que o getSession tropeçava (PWA/mobile, renovação do JWT).
 *
 * Aqui o documento é buscado pelo `apiFetch` — exactamente o mesmo caminho
 * autenticado de todas as outras chamadas (header Authorization + cache de
 * token + refresh, via interceptor de main.jsx). Os bytes são lidos como blob
 * e abertos via object URL. Assim os documentos deixam de poder partir
 * isoladamente: se a auth falhar, falha como tudo o resto.
 *
 * O `apiFetch` segue transparentemente o 302 do backend para o Storage público
 * (CORS `*`), por isso funciona quer o backend devolva os bytes directamente
 * quer redireccione para o Supabase Storage.
 *
 * @param {string} path  ex.: `/api/crm/imoveis/123/relatorio`
 * @param {{download?: boolean, filename?: string, refresh?: boolean, timeoutMs?: number}} opts
 */
export async function openDocument(path, { download = false, filename, refresh = false, timeoutMs = 120000 } = {}) {
  const hasWindow = typeof window !== 'undefined'
  // Abrir o separador em branco JÁ (síncrono) preserva o user-gesture do Safari,
  // que bloqueia window.open depois de um await. Só para visualização.
  const win = (!download && hasWindow) ? window.open('', '_blank') : null
  // Em PWA standalone iOS (como a equipa usa no telemóvel) o window.open devolve
  // null mesmo dentro do gesto. Sem isto, o fallback corre pós-await e é
  // bloqueado pelo popup blocker → o clique não fazia nada, sem erro visível.
  // Nesse caso degradamos graciosamente para DESCARREGAR o ficheiro.
  const fallbackDownload = !download && hasWindow && !win
  // document.open/write/close é o caminho fiável para pintar num about:blank
  // recém-aberto (o document.body pode ainda não existir). `text` é SEMPRE
  // escapado (escapeHtml) — about:blank é same-origin, logo HTML não escapado
  // seria XSS executável.
  const paintErr = (text) => {
    try {
      if (win && !win.closed) {
        win.document.open()
        win.document.write(`<!doctype html><meta charset="utf-8"><p style="font-family:system-ui,sans-serif;padding:24px;color:#b00020">${escapeHtml(text)}</p>`)
        win.document.close()
      }
    } catch { /* janela cross-origin/fechada */ }
  }
  // Falha: pinta no separador (se houver) E notifica por toast (cobre download
  // e PWA sem janela). Garante que nenhum clique falha em silêncio.
  const fail = (msg) => { paintErr(msg); notifyUser(msg, 'error'); return new Error(msg) }

  try {
    if (win && !win.closed) {
      win.document.open()
      win.document.write('<!doctype html><meta charset="utf-8"><p style="font-family:system-ui,sans-serif;padding:24px;color:#555">A preparar o documento…</p>')
      win.document.close()
    }
  } catch { /* ignore */ }

  let url = path
  if (refresh) url += (url.includes('?') ? '&' : '?') + 'refresh=1'

  let res
  try {
    res = await apiFetch(url, { timeoutMs })
  } catch (e) {
    throw fail(e?.name === 'AbortError' ? 'O documento demorou demasiado a gerar. Tenta novamente.' : 'Sem ligação ao servidor. Verifica a internet e tenta novamente.')
  }

  if (!res.ok) {
    // Lê o corpo UMA vez; tenta JSON, mas aceita texto cru (ex.: erro XML do Storage).
    let msg = `Não foi possível abrir o documento (HTTP ${res.status}).`
    try {
      const txt = await res.text()
      try { const j = JSON.parse(txt); if (j?.error) msg = j.error } catch { if (txt && txt.length < 300) msg = txt }
    } catch { /* sem corpo legível */ }
    throw fail(msg)
  }

  const blob = await res.blob()

  // Sanidade para VISUALIZAÇÃO: um documento (PDF) nunca devia chegar como
  // JSON/HTML/texto. Se chegar, é um erro disfarçado (ex.: objecto em falta no
  // Storage servido com 200) — mostra-o em vez de abrir lixo. (No download
  // aceitamos qualquer tipo: o backup é legitimamente JSON.)
  if (!download && !fallbackDownload) {
    const ct = (blob.type || '').toLowerCase()
    if (ct.startsWith('application/json') || ct.startsWith('text/html') || (ct.startsWith('text/') && blob.size < 4096)) {
      let msg = 'O servidor não devolveu um documento válido. Tenta regenerar.'
      try { const txt = await blob.text(); const j = JSON.parse(txt); if (j?.error) msg = j.error } catch { /* mantém genérico */ }
      throw fail(msg)
    }
  }

  const objUrl = URL.createObjectURL(blob)
  if (download || fallbackDownload) {
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename || filenameFromResponse(res) || filenameFromPath(path)
    a.rel = 'noopener'
    document.body.appendChild(a); a.click(); a.remove()
    // Avisar quando degradámos "Ver" para download por popup bloqueado (PWA iOS).
    if (fallbackDownload) notifyUser('Janela bloqueada — o documento foi descarregado.', 'info')
    // Revoga generosamente: a maioria dos browsers segura os bytes ao iniciar o
    // download, mas um diálogo "Guardar como" lento pode demorar > 15s. 60s cobre.
    setTimeout(() => { try { URL.revokeObjectURL(objUrl) } catch {} }, 60000)
  } else {
    if (win && !win.closed) win.location = objUrl
    else if (hasWindow) window.open(objUrl, '_blank', 'noopener,noreferrer')
    // Visualização: dar tempo ao viewer nativo de carregar antes de revogar.
    setTimeout(() => { try { URL.revokeObjectURL(objUrl) } catch {} }, timeoutMs)
  }
  return objUrl
}

