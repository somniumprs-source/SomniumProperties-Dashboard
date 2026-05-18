/**
 * Importação de SOPs a partir de uma pasta do Google Drive.
 * Aceita Google Docs (exporta como Markdown nativo) e Markdown puro.
 * PDFs/DOCX são criados como entradas com conteúdo vazio + drive_url.
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

/**
 * Extrai folderId de URL completa do Drive ou retorna o próprio input se já for ID.
 * Aceita formatos:
 *   - https://drive.google.com/drive/folders/<ID>
 *   - https://drive.google.com/drive/folders/<ID>?usp=sharing
 *   - <ID>
 */
export function parseFolderId(input) {
  if (!input) return null
  const s = String(input).trim()
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s
  return null
}

// O Google Docs exporta imagens como data URIs base64 dentro do markdown — o que
// inflaciona o tamanho em ordens de magnitude e torna a edição lenta. Substitui
// cada referência base64 por um placeholder; o documento original mantém-se
// acessível via "Abrir no Drive".
export function stripBase64Images(md) {
  if (!md) return ''
  const PLACEHOLDER = '_[imagem — ver original no Drive]_'
  let out = md
  // Inline:  ![alt](data:image/...;base64,...)
  out = out.replace(/!\[[^\]]*\]\(data:image\/[a-z0-9+.-]+;base64,[^)]+\)/gi, PLACEHOLDER)
  // HTML img tags com data URI
  out = out.replace(/<img[^>]*src=["']data:image\/[^"']+["'][^>]*>/gi, PLACEHOLDER)
  // Reference-style (estilo Google Docs):  [imageN]: <data:image/...;base64,...>
  out = out.replace(/^\[[^\]]+\]:\s*<data:image\/[a-z0-9+.-]+;base64,[^>]+>\s*$/gim, '')
  // …também sem < >
  out = out.replace(/^\[[^\]]+\]:\s*data:image\/[a-z0-9+.-]+;base64,\S+\s*$/gim, '')
  return out
}

async function exportDocAsMarkdown(drive, fileId) {
  try {
    const res = await drive.files.export(
      { fileId, mimeType: 'text/markdown' },
      { responseType: 'text' }
    )
    const raw = typeof res.data === 'string' ? res.data : String(res.data || '')
    return stripBase64Images(raw)
  } catch (e) {
    if (e?.code === 400 || e?.response?.status === 400) {
      const fallback = await drive.files.export(
        { fileId, mimeType: 'text/plain' },
        { responseType: 'text' }
      )
      return typeof fallback.data === 'string' ? fallback.data : String(fallback.data || '')
    }
    throw e
  }
}

async function downloadTextFile(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' }
  )
  return typeof res.data === 'string' ? res.data : String(res.data || '')
}

/**
 * Importa todos os ficheiros de uma pasta do Drive para a tabela `sops`.
 * @param {Object} opts
 * @param {string} opts.folderId    ID da pasta Drive
 * @param {string} opts.departamento 'comercial'|'financeiro'|'administrativo'|'geral'
 * @param {boolean} opts.overwrite  Se true, actualiza entrada existente em vez de saltar
 * @param {string} opts.user        Email do utilizador que despoletou o import
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
        let conteudo = ''
        if (f.mimeType === 'application/vnd.google-apps.document') {
          conteudo = await exportDocAsMarkdown(drive, f.id)
        } else if (f.mimeType === 'text/markdown' || f.mimeType === 'text/plain') {
          conteudo = await downloadTextFile(drive, f.id)
        } else if (f.mimeType === 'application/vnd.google-apps.folder') {
          stats.ignorados++
          continue
        }
        const titulo = (f.name || 'SOP sem título').replace(/\.(md|markdown|txt)$/i, '')

        const { rows: existing } = await pool.query('SELECT id FROM sops WHERE drive_file_id = $1', [f.id])
        if (existing.length && !overwrite) {
          stats.ignorados++
          continue
        }
        if (existing.length && overwrite) {
          await pool.query(
            `UPDATE sops SET titulo = $1, conteudo_md = $2, departamento = $3,
             versao = versao + 1, drive_url = $4, updated_at = NOW(), updated_by = $5
             WHERE drive_file_id = $6`,
            [titulo, conteudo, departamento, f.webViewLink || null, user, f.id]
          )
          stats.actualizados++
        } else {
          await pool.query(
            `INSERT INTO sops (departamento, titulo, conteudo_md, drive_file_id, drive_url, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $6)`,
            [departamento, titulo, conteudo, f.id, f.webViewLink || null, user]
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
