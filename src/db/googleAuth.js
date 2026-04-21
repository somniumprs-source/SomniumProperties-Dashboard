/**
 * Google OAuth2 helper partilhado.
 * Tenta ler credenciais de ficheiros JSON (dev local).
 * Se nao existirem, le de env vars (producao Render).
 */
import { google } from 'googleapis'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OAUTH_PATH = path.join(ROOT, 'google-oauth.json')
const TOKEN_PATH = path.join(ROOT, 'google-token.json')

/**
 * Obter cliente OAuth2 autenticado.
 * 1. Tenta ficheiros JSON (dev local)
 * 2. Fallback para env vars (Render producao)
 * @returns {google.auth.OAuth2 | null}
 */
export function getGoogleAuth() {
  // 1. Ficheiros JSON (dev local)
  if (existsSync(OAUTH_PATH) && existsSync(TOKEN_PATH)) {
    const creds = JSON.parse(readFileSync(OAUTH_PATH, 'utf8'))
    const { client_id, client_secret } = creds.installed || creds.web
    const oauth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333')
    oauth2.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, 'utf8')))
    return oauth2
  }

  // 2. Env vars (Render producao)
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3333')
    oauth2.setCredentials({ refresh_token: refreshToken })
    return oauth2
  }

  return null
}

/**
 * Verificar se Google OAuth esta configurado (ficheiros OU env vars).
 */
export function isGoogleConfigured() {
  if (existsSync(OAUTH_PATH) && existsSync(TOKEN_PATH)) return true
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN)
}
