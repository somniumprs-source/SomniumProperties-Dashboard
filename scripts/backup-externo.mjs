#!/usr/bin/env node
// Backup diário externo ao Supabase (prevenção, 20/10/2026).
//
// O backup interno (cron-backup) guarda só 6 tabelas, em JSON, dentro da
// própria base de dados — se a base de dados se perder, perde-se com ela.
// Este script corre no Mac (LaunchAgent com.somnium.backup-externo, 03:00) e:
//   1. faz pg_dump do schema `public` completo para ~/Backups/Somnium/db/<data>.dump
//   2. confirma que o dump é legível (pg_restore --list) e regista as contagens
//      de linhas da produção, para comparar num restauro
//   3. mantém um espelho incremental do Storage em ~/Backups/Somnium/storage/
//      (só descarrega ficheiros novos ou com tamanho diferente, um de cada vez —
//      em paralelo esgota as ligações do plano básico)
//   4. apaga dumps com mais de RETENCAO_DIAS, mas nunca o mais recente
//   5. escreve o resultado em ~/Backups/Somnium/estado.json e no log
// Nunca escreve na base de dados nem no Storage (só leituras).
//
// Uso: node scripts/backup-externo.mjs   (lê DATABASE_URL e a chave de serviço do .env)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(RAIZ, '.env') })

const DESTINO = process.env.BACKUP_DESTINO || path.join(os.homedir(), 'Backups', 'Somnium')
const RETENCAO_DIAS = Number(process.env.BACKUP_RETENCAO_DIAS || 14)
const PG_BIN = process.env.PG_BIN || '/opt/homebrew/opt/postgresql@17/bin'
// Data de Lisboa (às 00:30 locais o UTC ainda está no dia anterior).
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
const estado = { inicio: new Date().toISOString(), ok: false, passos: {} }

function log(msg) { console.log(`[backup-externo] ${new Date().toISOString()} ${msg}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL em falta no .env')
  fs.mkdirSync(path.join(DESTINO, 'db'), { recursive: true, mode: 0o700 })

  // pg_dump não funciona no pooler em modo transação (6543): usa o modo sessão (5432).
  const urlSessao = new URL(process.env.DATABASE_URL)
  if (urlSessao.port === '6543') urlSessao.port = '5432'
  const env = { ...process.env, PGSSLMODE: 'require', LC_ALL: 'en_US.UTF-8' }

  // 1–2. Dump da base de dados e verificação de legibilidade
  const dump = path.join(DESTINO, 'db', `${hoje}.dump`)
  execFileSync(path.join(PG_BIN, 'pg_dump'), [urlSessao.toString(), '-Fc', '-n', 'public', '--no-owner', '--no-privileges', '-f', dump], { env, stdio: ['ignore', 'ignore', 'pipe'] })
  fs.chmodSync(dump, 0o600)
  const lista = execFileSync(path.join(PG_BIN, 'pg_restore'), ['--list', dump], { env }).toString()
  const tabelasNoDump = (lista.match(/ TABLE DATA public /g) || []).length

  const cli = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await cli.connect()
  await cli.query('BEGIN READ ONLY')
  const { rows: tabelas } = await cli.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")
  const contagens = {}
  for (const { tablename } of tabelas) {
    contagens[tablename] = Number((await cli.query(`SELECT count(*) FROM public."${tablename}"`)).rows[0].count)
  }
  const { rows: objetos } = await cli.query(
    "SELECT bucket_id, name, (metadata->>'size')::bigint AS size FROM storage.objects WHERE name NOT LIKE '%.emptyFolderPlaceholder' ORDER BY 1, 2",
  )
  await cli.query('ROLLBACK')
  await cli.end()
  fs.writeFileSync(path.join(DESTINO, 'db', `${hoje}.contagens.json`), JSON.stringify(contagens, null, 1), { mode: 0o600 })
  if (tabelasNoDump !== tabelas.length) throw new Error(`dump com ${tabelasNoDump} tabelas, produção com ${tabelas.length}`)
  estado.passos.db = { ficheiro: dump, bytes: fs.statSync(dump).size, tabelas: tabelas.length, linhas: Object.values(contagens).reduce((a, b) => a + b, 0) }
  log(`BD: ${tabelas.length} tabelas, ${estado.passos.db.linhas} linhas, ${(estado.passos.db.bytes / 1048576).toFixed(1)} MB`)

  // 3. Espelho incremental do Storage
  const chave = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!chave || !url) throw new Error('chave de serviço ou URL do Supabase em falta no .env')
  const sb = createClient(url, chave)
  const raizStorage = path.join(DESTINO, 'storage')
  let descarregados = 0, iguais = 0
  const falhas = []
  for (const o of objetos) {
    const f = path.join(raizStorage, o.bucket_id, o.name)
    if (fs.existsSync(f) && (o.size == null || fs.statSync(f).size === Number(o.size))) { iguais++; continue }
    let feito = false
    for (let tentativa = 1; tentativa <= 4 && !feito; tentativa++) {
      const { data, error } = await sb.storage.from(o.bucket_id).download(o.name)
      if (error) { await sleep(1500 * tentativa); continue }
      const buf = Buffer.from(await data.arrayBuffer())
      if (o.size != null && Number(o.size) !== buf.length) { await sleep(1500 * tentativa); continue }
      fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 })
      fs.writeFileSync(f, buf, { mode: 0o600 })
      descarregados++
      feito = true
    }
    if (!feito) falhas.push(`${o.bucket_id}/${o.name}`)
    await sleep(150)
  }
  estado.passos.storage = { objetos: objetos.length, descarregados, iguais, falhas }
  log(`Storage: ${objetos.length} objetos (${descarregados} novos/alterados, ${iguais} iguais, ${falhas.length} falhas)`)
  if (falhas.length) throw new Error(`${falhas.length} ficheiro(s) do Storage não descarregados`)

  // 4. Retenção dos dumps (nunca apaga o de hoje nem o mais recente)
  const limite = Date.now() - RETENCAO_DIAS * 86400000
  const dumps = fs.readdirSync(path.join(DESTINO, 'db')).filter((n) => /^\d{4}-\d{2}-\d{2}\.(dump|contagens\.json)$/.test(n)).sort()
  const maisRecente = dumps.filter((n) => n.endsWith('.dump')).pop()
  const apagados = []
  for (const n of dumps) {
    const data = Date.parse(n.slice(0, 10))
    if (data < limite && !n.startsWith(maisRecente.slice(0, 10))) { fs.unlinkSync(path.join(DESTINO, 'db', n)); apagados.push(n) }
  }
  estado.passos.retencao = { apagados }

  estado.ok = true
}

main()
  .catch((e) => { estado.erro = e.message; log(`ERRO: ${e.message}`); process.exitCode = 1 })
  .finally(() => {
    estado.fim = new Date().toISOString()
    try { fs.writeFileSync(path.join(DESTINO, 'estado.json'), JSON.stringify(estado, null, 1), { mode: 0o600 }) } catch {}
  })
