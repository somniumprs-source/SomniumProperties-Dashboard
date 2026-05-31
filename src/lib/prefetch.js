/**
 * Prefetcher de rotas: chama os mesmos dynamic imports usados em App.jsx
 * para pré-aquecer chunks ao hover do link, antes do clique.
 *
 * Cache em Map para garantir 1 fetch por chunk por sessão.
 */
const cache = new Map()

const loaders = {
  '/crm':                () => import('../pages/CRM.jsx'),
  '/projectos':          () => import('../pages/Projectos.jsx'),
  '/projectos/calendario': () => import('../pages/ProjectosCalendario.jsx'),
  '/financeiro':         () => import('../pages/Financeiro.jsx'),
  '/operacoes':          () => import('../pages/Operacoes.jsx'),
  '/metricas':           () => import('../pages/Metricas.jsx'),
  '/alertas':            () => import('../pages/Alertas.jsx'),
  '/administracao':      () => import('../pages/Administracao.jsx'),
  '/administracao/sop':  () => import('../pages/AdministracaoSOP.jsx'),
  '/administracao/relatorios': () => import('../pages/RelatoriosAdmin.jsx'),
  '/administracao/regiao':     () => import('../pages/AdministracaoMultiRegiao.jsx'),
  '/admin/utilizadores': () => import('../pages/Utilizadores.jsx'),
}

export function prefetchRoute(path) {
  if (!path) return
  // match exacto primeiro, depois prefixo
  const loader = loaders[path] || loaders[Object.keys(loaders).find(k => path.startsWith(k))]
  if (!loader) return
  if (cache.has(loader)) return
  const p = loader().catch(() => {})
  cache.set(loader, p)
}
