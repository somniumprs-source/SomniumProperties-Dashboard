/**
 * Autorização OAuth2 do Google Calendar.
 * Corre uma vez: abre o browser, pede permissão, guarda o token.
 *
 * Uso: node scripts/auth-google.js
 */
import 'dotenv/config'
import { google } from 'googleapis'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { createServer } from 'http'
import { URL } from 'url'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CLIENT_SECRET_PATH = path.join(ROOT, 'google-oauth.json')
const TOKEN_PATH = path.join(ROOT, 'google-token.json')

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
]

async function main() {
  if (!existsSync(CLIENT_SECRET_PATH)) {
    console.error('Ficheiro google-oauth.json não encontrado na raiz do projeto.')
    process.exit(1)
  }

  const content = JSON.parse(readFileSync(CLIENT_SECRET_PATH, 'utf8'))
  const { client_id, client_secret } = content.installed || content.web

  const oauth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333')

  if (existsSync(TOKEN_PATH)) {
    console.log('Token já existe em google-token.json — a verificar...')
    const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'))
    oauth2.setCredentials(token)

    try {
      const cal = google.calendar({ version: 'v3', auth: oauth2 })
      const r = await cal.calendarList.list({ maxResults: 3 })
      console.log('Token válido! Calendários encontrados:')
      for (const c of r.data.items) {
        console.log(`  - ${c.summary} (${c.id})`)
      }
      console.log('\nGoogle Calendar já está configurado.')
      return
    } catch {
      console.log('Token expirado, a renovar...')
    }
  }

  // Gerar URL de autorização
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })

  console.log('\nA abrir o browser para autorização...\n')

  // Abrir browser
  const { exec } = await import('child_process')
  exec(`open "${authUrl}"`)

  // Servidor temporário para receber o callback
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost:3333')
      const code = url.searchParams.get('code')

      if (!code) {
        res.writeHead(400)
        res.end('Código não encontrado.')
        return
      }

      try {
        const { tokens } = await oauth2.getToken(code)
        oauth2.setCredentials(tokens)
        writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))

        // Verificar
        const cal = google.calendar({ version: 'v3', auth: oauth2 })
        const r = await cal.calendarList.list({ maxResults: 5 })

        const html = `
          <html><body style="font-family:sans-serif;padding:40px;text-align:center">
            <h1 style="color:#22c55e">Autorização concluída!</h1>
            <p>Google Calendar ligado com sucesso.</p>
            <p>Calendários encontrados:</p>
            <ul style="list-style:none;padding:0">
              ${r.data.items.map(c => `<li>${c.summary} (${c.id})</li>`).join('')}
            </ul>
            <p style="color:#999;margin-top:20px">Podes fechar esta janela.</p>
          </body></html>
        `
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)

        console.log('\nToken guardado em google-token.json')
        console.log('Calendários encontrados:')
        for (const c of r.data.items) {
          console.log(`  - ${c.summary} (${c.id})`)
        }
        console.log('\nGoogle Calendar configurado com sucesso!')

        server.close()
        resolve()
      } catch (e) {
        res.writeHead(500)
        res.end('Erro: ' + e.message)
        console.error('Erro:', e.message)
      }
    })

    server.listen(3333, () => {
      console.log('A aguardar autorização no browser...')
    })
  })
}

main().catch(console.error)
