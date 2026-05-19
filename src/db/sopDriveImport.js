/**
 * Sincronização da lista de SOPs com uma pasta do Google Drive.
 * Apenas guarda METADADOS (titulo, drive_file_id, drive_url, departamento).
 * O conteúdo dos SOPs vive no Drive — o dashboard só serve de directório.
 */
import { google } from 'googleapis'
import pool from './pg.js'
import { getGoogleAuth, isGoogleConfigured } from './googleAuth.js'

const DEPARTAMENTOS_VALIDOS = ['comercial', 'financeiro', 'administrativo', 'geral']

function getDrive() {
  const auth = getGoogleAuth()
  if (!auth) return null
  return google.drive({ version: 'v3', auth })
}

export function isConfigured() {
  return isGoogleConfigured()
}

export function parseFolderId(input) {
  if (!input) return null
  const s = String(input).trim()
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s
  return null
}

/**
 * Importa metadados dos ficheiros de uma pasta do Drive para a tabela `sops`.
 * Não descarrega conteúdo — só guarda título e link.
 */
export async function importFolderToSops({ folderId, departamento, overwrite = false, user = null }) {
  if (!isConfigured()) {
    throw new Error('Google Drive não está configurado. Definir GOOGLE_SERVICE_ACCOUNT no .env.')
  }
  if (!DEPARTAMENTOS_VALIDOS.includes(departamento)) {
    throw new Error(`Departamento inválido: ${departamento}`)
  }
  const drive = getDrive()
  if (!drive) throw new Error('Não foi possível instanciar o cliente Drive.')

  const stats = { total: 0, importados: 0, actualizados: 0, ignorados: 0, erros: [] }
  let pageToken
  do {
    const list = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id,name,mimeType,webViewLink,modifiedTime)',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    pageToken = list.data.nextPageToken
    for (const f of list.data.files || []) {
      stats.total++
      try {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          stats.ignorados++
          continue
        }
        const titulo = (f.name || 'SOP sem título').replace(/\.(md|markdown|txt|pdf|docx?)$/i, '')

        const { rows: existing } = await pool.query('SELECT id FROM sops WHERE drive_file_id = $1', [f.id])
        if (existing.length && !overwrite) {
          stats.ignorados++
          continue
        }
        if (existing.length && overwrite) {
          await pool.query(
            `UPDATE sops SET titulo = $1, departamento = $2, drive_url = $3,
             updated_at = NOW(), updated_by = $4
             WHERE drive_file_id = $5`,
            [titulo, departamento, f.webViewLink || null, user, f.id]
          )
          stats.actualizados++
        } else {
          await pool.query(
            `INSERT INTO sops (departamento, titulo, drive_file_id, drive_url, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $5)`,
            [departamento, titulo, f.id, f.webViewLink || null, user]
          )
          stats.importados++
        }
      } catch (e) {
        stats.erros.push({ ficheiro: f.name, erro: e.message })
      }
    }
  } while (pageToken)

  return stats
}
