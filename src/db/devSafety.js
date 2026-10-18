/**
 * Modo de desenvolvimento seguro (só Express local).
 *
 * O servidor de dev liga-se à BD de produção. Sem estas variáveis o
 * comportamento é o de sempre; com elas, o arranque fica inofensivo:
 *
 *  - DISABLE_BACKGROUND_JOBS=true → não arranca crons, auto-syncs (Google
 *    Calendar, Fireflies, Forms), initSchema (DDL + UPDATEs de arranque),
 *    recálculo de lucro_real, registo de despesas recorrentes, backups nem
 *    pré-aquecimento de cache.
 *  - DEV_DB_READ_ONLY=true → qualquer query que não seja de leitura é recusada
 *    antes de sair do processo (erro com code 'DEV_READ_ONLY'). Feito em JS e
 *    não com SET de sessão, para não contaminar ligações partilhadas do pooler.
 *
 * Valores aceites: "true" ou "1". Qualquer outro valor (ou ausência) = desligado.
 */

const on = (v) => v === 'true' || v === '1'

export const backgroundJobsDisabled = on(process.env.DISABLE_BACKGROUND_JOBS)
export const devDbReadOnly = on(process.env.DEV_DB_READ_ONLY)

/** Regista no arranque uma tarefa que não foi iniciada por estar em modo seguro. */
export function skipJob(nome) {
  console.log(`[dev-safe] não iniciado: ${nome}`)
}

// Primeira palavra permitida em modo só de leitura.
const LEITURA = new Set(['SELECT', 'WITH', 'SHOW', 'EXPLAIN', 'VALUES', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE'])
// Palavras que denunciam escrita dentro de um SELECT/WITH (CTE com INSERT, etc.).
const ESCRITA = /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|COMMENT|VACUUM|REINDEX|CLUSTER|REFRESH|CALL|DO|LOCK|NOTIFY)\b/i

function limpar(sql) {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")      // literais de texto
    .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "''") // dollar-quoting
    .replace(/"(?:[^"]|"")*"/g, '""')      // identificadores entre aspas
    .replace(/\bFOR\s+(NO\s+KEY\s+)?(UPDATE|SHARE)\b/gi, ' ') // locks de leitura
    .replace(/\bEXPLAIN\s+ANALY[SZ]E\b/gi, 'EXPLAIN_ANALYZE') // executa a query
}

/** true se o SQL só lê. Exportado para teste. */
export function isReadOnlySql(text) {
  if (typeof text !== 'string') return false
  const instrucoes = limpar(text).split(';').map(s => s.trim()).filter(Boolean)
  if (!instrucoes.length) return true
  return instrucoes.every(s => {
    const primeira = s.split(/\s+/)[0].toUpperCase()
    if (!LEITURA.has(primeira)) return false
    if (primeira === 'BEGIN' && /\bREAD\s+WRITE\b/i.test(s)) return false
    return !ESCRITA.test(s)
  })
}

function bloquear(text) {
  const resumo = String(text).replace(/\s+/g, ' ').trim().slice(0, 120)
  console.warn(`[dev-safe] escrita bloqueada: ${resumo}`)
  const err = new Error('Modo só de leitura (DEV_DB_READ_ONLY): escrita na base de dados bloqueada')
  err.code = 'DEV_READ_ONLY'
  return err
}

function guardar(queryFn) {
  return function guardedQuery(...args) {
    const text = typeof args[0] === 'string' ? args[0] : args[0]?.text
    if (!isReadOnlySql(text)) {
      const err = bloquear(text)
      const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null
      if (cb) { process.nextTick(() => cb(err)); return undefined }
      return Promise.reject(err)
    }
    return queryFn.apply(this, args)
  }
}

/**
 * Instala o guarda de leitura no pool (pool.query e clientes de pool.connect).
 * Deve ser chamado depois de qualquer outro wrapper de pool.query.
 */
export function installReadOnlyGuard(pool) {
  pool.query = guardar(pool.query)
  pool.on('connect', (client) => {
    if (client.__devSafe) return
    client.__devSafe = true
    client.query = guardar(client.query)
  })
  console.log('[dev-safe] BD em modo só de leitura (DEV_DB_READ_ONLY)')
  return pool
}
