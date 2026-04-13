/**
 * Google Drive — criar e mover pastas de imóveis.
 * Cada imóvel tem pasta com subpastas: Documentos, Fotos, Estudo de Mercado.
 * Quando o estado muda, a pasta move-se para a pasta do estado correspondente.
 */
import { google } from 'googleapis'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from './pg.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OAUTH_PATH = path.join(ROOT, 'google-oauth.json')
const TOKEN_PATH = path.join(ROOT, 'google-token.json')

const PIPELINE_FOLDER_ID = process.env.DRIVE_PIPELINE_FOLDER_ID || '1FT6uIpAad7R_XnGO1rHU1uLTsR-xOtFK'

// Mapeamento estado CRM → ID da pasta no Drive
const ESTADO_FOLDER_MAP = {
  'Adicionado':                     '1JeSnIFus-ZOEzkqS-wXeYx6a50MRle5K',
  'Chamada Não Atendida':           '1y19JbJHojeQJUsrGAJdYy8WRO5li_Eur',
  'Pendentes':                      '1aeeCXWU6Wm1RAwDPK5egzKpyrqJnDCl8',
  'Necessidade de Visita':          '1Oh4dU1eUku-PTMgdytos0gYHt8ajmWy6',
  'Visita Marcada':                 '1rnnguah42TZUAfKcMqFxlC2q_uTP_WqD',
  'Estudo de VVR':                  '1dU2wxAx9c0qYynPitFYPd7SsKr-go16-',
  'Criar Proposta ao Proprietário': '13nKzAWyGCZSqbOJc77yM7rTm1iFdvGq3',
  'Enviar proposta ao Proprietário':'1NQO9nb69Jm5FmWcJNgBbxScLACdi2L_t',
  'Em negociação':                  '1hsaQF7FGIRzZVTPXP2s4l0WG7XAs85sl',
  'Proposta aceite':                '1lEAKei9viJ44LZyi7Ob5QXnvJqigVuj2',
  'Enviar proposta ao investidor':  '1v79KPdvTF0HorZWMfYVdVWkDYviCfiF0',
  'Follow Up após proposta':        '16EqJfhbTp26iXG7YN6r1Ro2yR6BQY_EC',
  'Follow UP':                      '10iwPgF6ULwllONutkMGXxsEW-ouAOofR',
  'Wholesaling':                    '1jRaZXia5LAIwImN4SlDdDfszDlI86jI5',
  'CAEP':                           '1hPJDDwB_0lGI7QeVbouitD9r6ydXtCWB',
  'Fix and Flip':                   '1gtjKXT9zGJpTW9c0KV1uh4OSb1vcPAEN',
  'Não interessa':                  '13CobsbcEv8x33TDgzcdzv4c4Nn95IX9Q',
}

function getDrive() {
  if (!existsSync(OAUTH_PATH) || !existsSync(TOKEN_PATH)) return null
  const creds = JSON.parse(readFileSync(OAUTH_PATH, 'utf8'))
  const { client_id, client_secret } = creds.installed || creds.web
  const oauth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333')
  oauth2.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, 'utf8')))
  return google.drive({ version: 'v3', auth: oauth2 })
}

export function isConfigured() {
  return existsSync(OAUTH_PATH) && existsSync(TOKEN_PATH)
}

/**
 * Upload de documento PDF para a pasta Documentos do imóvel no Drive.
 */
export async function uploadDocToFolder(imovelId, pdfStream, fileName) {
  const drive = getDrive()
  if (!drive) return null

  try {
    // Buscar drive_folder_id do imóvel
    const { rows: [imovel] } = await pool.query('SELECT drive_folder_id, nome FROM imoveis WHERE id = $1', [imovelId])
    if (!imovel?.drive_folder_id) return null

    // Encontrar subpasta "Documentos"
    const list = await drive.files.list({
      q: `'${imovel.drive_folder_id}' in parents and name='Documentos' and mimeType='application/vnd.google-apps.folder'`,
      fields: 'files(id)',
      supportsAllDrives: true,
    })
    let docsFolder = list.data.files?.[0]?.id
    if (!docsFolder) docsFolder = imovel.drive_folder_id // fallback: pasta raiz do imóvel

    // Verificar se já existe ficheiro com mesmo nome e apagar
    const existing = await drive.files.list({
      q: `'${docsFolder}' in parents and name='${fileName}'`,
      fields: 'files(id)',
      supportsAllDrives: true,
    })
    for (const f of existing.data.files || []) {
      await drive.files.delete({ fileId: f.id, supportsAllDrives: true }).catch(() => {})
    }

    // Recolher PDF stream para buffer
    const { Readable } = await import('stream')
    const chunks = []
    await new Promise((resolve, reject) => {
      pdfStream.on('data', c => chunks.push(c))
      pdfStream.on('end', resolve)
      pdfStream.on('error', reject)
    })
    const buffer = Buffer.concat(chunks)

    // Upload
    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/pdf',
        parents: [docsFolder],
      },
      media: {
        mimeType: 'application/pdf',
        body: Readable.from(buffer),
      },
      fields: 'id',
      supportsAllDrives: true,
    })

    console.log(`[drive] Upload: ${fileName} → ${imovel.nome} (${file.data.id})`)
    return file.data.id
  } catch (e) {
    console.error('[drive] Upload erro:', e.message)
    return null
  }
}

/**
 * Criar pasta do imóvel com subpastas no Drive.
 * Retorna o ID da pasta criada.
 */
export async function createImovelFolder(imovelId, nome, estado) {
  const drive = getDrive()
  if (!drive) return null

  try {
    // Determinar pasta pai baseado no estado
    const parentId = ESTADO_FOLDER_MAP[estado] || ESTADO_FOLDER_MAP['Adicionado'] || PIPELINE_FOLDER_ID

    // Criar pasta principal do imóvel
    const folder = await drive.files.create({
      requestBody: {
        name: nome,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
      supportsAllDrives: true,
    })
    const folderId = folder.data.id

    // Criar subpastas
    for (const sub of ['Documentos', 'Fotos', 'Estudo de Mercado']) {
      await drive.files.create({
        requestBody: {
          name: sub,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [folderId],
        },
        supportsAllDrives: true,
      })
    }

    // Guardar ID da pasta no imóvel
    await pool.query('UPDATE imoveis SET drive_folder_id = $1 WHERE id = $2', [folderId, imovelId])

    console.log(`[drive] Pasta criada: "${nome}" em ${estado} (${folderId})`)
    return folderId
  } catch (e) {
    console.error('[drive] Erro ao criar pasta:', e.message)
    return null
  }
}

/**
 * Mover pasta do imóvel para a pasta do novo estado.
 */
export async function moveImovelFolder(imovelId, novoEstado) {
  const drive = getDrive()
  if (!drive) return false

  try {
    // Buscar drive_folder_id do imóvel
    const { rows: [imovel] } = await pool.query('SELECT drive_folder_id, nome FROM imoveis WHERE id = $1', [imovelId])
    if (!imovel?.drive_folder_id) {
      console.log(`[drive] Imóvel ${imovelId} sem pasta Drive — a criar...`)
      await createImovelFolder(imovelId, imovel?.nome || 'Sem nome', novoEstado)
      return true
    }

    const folderId = imovel.drive_folder_id
    const novoParentId = ESTADO_FOLDER_MAP[novoEstado]
    if (!novoParentId) {
      console.warn(`[drive] Estado "${novoEstado}" sem pasta mapeada`)
      return false
    }

    // Obter pai actual
    const file = await drive.files.get({
      fileId: folderId,
      fields: 'parents',
      supportsAllDrives: true,
    })
    const currentParents = (file.data.parents || []).join(',')

    // Mover (remover do pai actual, adicionar ao novo)
    await drive.files.update({
      fileId: folderId,
      addParents: novoParentId,
      removeParents: currentParents,
      supportsAllDrives: true,
    })

    console.log(`[drive] Pasta "${imovel.nome}" movida para ${novoEstado}`)
    return true
  } catch (e) {
    console.error('[drive] Erro ao mover pasta:', e.message)
    return false
  }
}
