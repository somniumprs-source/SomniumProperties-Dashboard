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
 * Extrai o número do SOP a partir do título (ex: "SOP 4 - ..." ou "SOP_4_...").
 * Ancorado ao início da string para não apanhar falsos positivos como
 * "OBSOLETO - substituído pelo novo SOP 4" (não é o SOP 4, é outra linha).
 */
function extractSopNumber(text) {
  const m = String(text || '').trim().match(/^SOP[\s_-]*([0-9]+)(?!\d)/i)
  return m ? parseInt(m[1], 10) : null
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

/**
 * Sincroniza a tabela `sops` com várias pastas do Drive numa única operação.
 * Ao contrário de importFolderToSops (que só sabe adicionar/actualizar por
 * drive_file_id), esta função:
 *  1. Casa cada ficheiro do Drive com uma linha existente pelo número do SOP
 *     extraído do título (ex: "SOP 4" ou "SOP_4") — não pelo ID do ficheiro,
 *     que muda sempre que o documento é recriado/re-uploaded no Drive. Isto
 *     evita duplicados quando um SOP é substituído por um ficheiro novo.
 *  2. No fim, remove da BD qualquer linha dos departamentos sincronizados que
 *     não correspondeu a nenhum ficheiro desta sincronização (documentos
 *     obsoletos ou removidos do Drive).
 */
export async function syncSopsFromDrive({ folders, user = null }) {
  if (!isConfigured()) {
    throw new Error('Google Drive não está configurado. Definir GOOGLE_SERVICE_ACCOUNT no .env.')
  }
  for (const f of folders) {
    if (!DEPARTAMENTOS_VALIDOS.includes(f.departamento)) {
      throw new Error(`Departamento inválido: ${f.departamento}`)
    }
  }
  const drive = getDrive()
  if (!drive) throw new Error('Não foi possível instanciar o cliente Drive.')

  const departamentos = [...new Set(folders.map(f => f.departamento))]
  const { rows: existingRows } = await pool.query(
    `SELECT id, titulo, drive_file_id FROM sops WHERE departamento = ANY($1) ORDER BY created_at ASC, id ASC`,
    [departamentos]
  )
  const numToId = new Map()
  const fileIdToId = new Map()
  for (const row of existingRows) {
    const num = extractSopNumber(row.titulo)
    if (num != null && !numToId.has(num)) numToId.set(num, row.id)
    if (row.drive_file_id && !fileIdToId.has(row.drive_file_id)) fileIdToId.set(row.drive_file_id, row.id)
  }

  const stats = { total: 0, importados: 0, actualizados: 0, ignorados: 0, removidos: 0, erros: [] }
  const touchedIds = new Set()

  for (const { folderId, departamento } of folders) {
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
          const num = extractSopNumber(titulo)
          const matchId = (num != null ? numToId.get(num) : null) ?? fileIdToId.get(f.id) ?? null

          if (matchId) {
            await pool.query(
              `UPDATE sops SET titulo = $1, departamento = $2, drive_url = $3, drive_file_id = $4,
               updated_at = NOW(), updated_by = $5
               WHERE id = $6`,
              [titulo, departamento, f.webViewLink || null, f.id, user, matchId]
            )
            touchedIds.add(matchId)
            fileIdToId.set(f.id, matchId)
            if (num != null) numToId.set(num, matchId)
            stats.actualizados++
          } else {
            const { rows: inserted } = await pool.query(
              `INSERT INTO sops (departamento, titulo, drive_file_id, drive_url, created_by, updated_by)
               VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
              [departamento, titulo, f.id, f.webViewLink || null, user]
            )
            const newId = inserted[0].id
            touchedIds.add(newId)
            fileIdToId.set(f.id, newId)
            if (num != null) numToId.set(num, newId)
            stats.importados++
          }
        } catch (e) {
          stats.erros.push({ ficheiro: f.name, erro: e.message })
        }
      }
    } while (pageToken)
  }

  if (touchedIds.size) {
    const { rows: removed } = await pool.query(
      `DELETE FROM sops WHERE departamento = ANY($1) AND id != ALL($2::int[]) RETURNING id`,
      [departamentos, Array.from(touchedIds)]
    )
    stats.removidos = removed.length
  }

  return stats
}
