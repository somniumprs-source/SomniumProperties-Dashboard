/**
 * Logger simples — escreve para consola com timestamps e niveis.
 * Substitui console.log/error em codigo de producao.
 */
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_DIR = path.resolve(__dirname, '../../logs')
const LOG_FILE = path.join(LOG_DIR, 'app.log')

// Criar pasta logs se nao existir
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })

function timestamp() {
  return new Date().toISOString()
}

function write(level, msg, meta) {
  const line = `[${timestamp()}] [${level}] ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}`
  console[level === 'ERROR' ? 'error' : 'log'](line)
  try { appendFileSync(LOG_FILE, line + '\n') } catch {}
}

export const logger = {
  info: (msg, meta) => write('INFO', msg, meta),
  warn: (msg, meta) => write('WARN', msg, meta),
  error: (msg, meta) => write('ERROR', msg, meta),
}
