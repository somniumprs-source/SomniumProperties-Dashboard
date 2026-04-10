#!/usr/bin/env node
/**
 * Backup automático de todas as tabelas para JSON.
 * Mantém últimos 30 backups (rotação automática).
 *
 * Usage: node scripts/backup.js
 */
import db from '../src/db/schema.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKUP_DIR = path.join(__dirname, '../backups')
const MAX_BACKUPS = 30

fs.mkdirSync(BACKUP_DIR, { recursive: true })

const tables = ['imoveis', 'investidores', 'consultores', 'negocios', 'despesas', 'tarefas']
const backup = {}
let total = 0

for (const t of tables) {
  try {
    backup[t] = db.prepare(`SELECT * FROM ${t}`).all()
    total += backup[t].length
    console.log(`  ${t}: ${backup[t].length} registos`)
  } catch {
    backup[t] = []
  }
}

backup.exported_at = new Date().toISOString()
backup.total = total

const filename = `somnium-backup-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json`
const filepath = path.join(BACKUP_DIR, filename)
fs.writeFileSync(filepath, JSON.stringify(backup, null, 2))
console.log(`\n✅ Backup guardado: ${filepath}`)
console.log(`   Total: ${total} registos`)

// Rotação: apagar backups antigos
const files = fs.readdirSync(BACKUP_DIR)
  .filter(f => f.startsWith('somnium-backup-') && f.endsWith('.json'))
  .sort()
  .reverse()

if (files.length > MAX_BACKUPS) {
  const toDelete = files.slice(MAX_BACKUPS)
  for (const f of toDelete) {
    fs.unlinkSync(path.join(BACKUP_DIR, f))
    console.log(`   Apagado backup antigo: ${f}`)
  }
}

console.log(`   Backups guardados: ${Math.min(files.length, MAX_BACKUPS)}/${MAX_BACKUPS}`)
