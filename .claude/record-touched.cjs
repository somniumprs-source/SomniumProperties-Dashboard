#!/usr/bin/env node
// PostToolUse hook (Edit|Write|NotebookEdit): regista o caminho do ficheiro
// editado num manifesto por-sessão em .claude/.touched/<session_id>.
//
// O Stop hook (auto-push.sh) lê este manifesto e comita SÓ o que o Claude tocou,
// nunca a WIP do utilizador noutros ficheiros. Nunca bloqueia a edição: qualquer
// erro -> exit 0 silencioso.
const fs = require('fs')
const path = require('path')

let raw = ''
try { raw = fs.readFileSync(0, 'utf8') } catch { process.exit(0) }

let data
try { data = JSON.parse(raw) } catch { process.exit(0) }

const fp = data && data.tool_input && data.tool_input.file_path
const session = (data && data.session_id) || 'default'
if (!fp) process.exit(0)

const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const dir = path.join(repo, '.claude', '.touched')
try {
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(path.join(dir, session), fp + '\n')
} catch { /* nunca bloquear a edição */ }
process.exit(0)
