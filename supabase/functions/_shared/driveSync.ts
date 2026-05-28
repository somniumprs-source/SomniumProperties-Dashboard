// @ts-nocheck
/**
 * Google Drive — criar/mover pastas de imóveis e listar ficheiros.
 * Port de src/db/driveSync.js para Deno/Edge Functions.
 *
 * Adaptações:
 *  - env via Deno.env.get.
 *  - getGoogleAuth() ENV-ONLY (sem disco) de ./googleAuth.ts.
 *  - uploadDocToFolder: o original recolhia um pdfStream Node em buffer; aqui
 *    aceita Uint8Array | ArrayBuffer | Buffer (ou ainda um stream Node, por
 *    compatibilidade), e faz upload via google-auth-library com body.
 *  - listImovelFiles: extraída do handler GET /imoveis/:id/drive-files do
 *    routes.js (que construía o cliente Drive inline a partir de disco) e
 *    reescrita para usar getGoogleAuth().
 */
import { google } from "googleapis";
import pool from "./pg.ts";
import { getGoogleAuth, isGoogleConfigured } from "./googleAuth.ts";

const PIPELINE_FOLDER_ID = Deno.env.get("DRIVE_PIPELINE_FOLDER_ID") || "1FT6uIpAad7R_XnGO1rHU1uLTsR-xOtFK";

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
  const auth = getGoogleAuth()
  if (!auth) return null
  return google.drive({ version: 'v3', auth })
}

export function isConfigured() {
  return isGoogleConfigured()
}

/**
 * Upload de documento PDF para a pasta Documentos do imóvel no Drive.
 * `pdfData` aceita Uint8Array | ArrayBuffer | Buffer (ou stream Node legacy).
 */
export async function uploadDocToFolder(imovelId, pdfData, fileName) {
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

    // Normalizar pdfData -> Uint8Array
    let bytes
    if (pdfData instanceof Uint8Array) {
      bytes = pdfData
    } else if (pdfData instanceof ArrayBuffer) {
      bytes = new Uint8Array(pdfData)
    } else if (pdfData && typeof pdfData.on === 'function') {
      // Stream Node legacy — recolher em buffer
      const chunks = []
      await new Promise((resolve, reject) => {
        pdfData.on('data', c => chunks.push(c))
        pdfData.on('end', resolve)
        pdfData.on('error', reject)
      })
      bytes = new Uint8Array(await new Blob(chunks).arrayBuffer())
    } else {
      bytes = new Uint8Array(pdfData)
    }

    // Upload — body como Readable a partir dos bytes
    const { Readable } = await import('node:stream')
    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/pdf',
        parents: [docsFolder],
      },
      media: {
        mimeType: 'application/pdf',
        body: Readable.from(Buffer.from(bytes)),
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

/**
 * Listar ficheiros das subpastas da pasta Drive de um imóvel.
 * Extraído do handler GET /imoveis/:id/drive-files do routes.js, reescrito para
 * usar getGoogleAuth() (env-only) em vez de construir o cliente a partir de disco.
 * Retorna { files, fotos, documentos, configured, folderId } — mesma forma do original.
 */
export async function listImovelFiles(driveFolderId) {
  const empty = { files: [], fotos: [], documentos: [], configured: false }
  if (!driveFolderId) return empty
  if (!isGoogleConfigured()) return empty

  const drive = getDrive()
  if (!drive) return empty

  try {
    // Listar subpastas
    const foldersRes = await drive.files.list({
      q: `'${driveFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      supportsAllDrives: true,
    })
    const subfolders = foldersRes.data.files || []

    const result = { files: [], fotos: [], documentos: [], configured: true, folderId: driveFolderId }

    for (const folder of subfolders) {
      const filesRes = await drive.files.list({
        q: `'${folder.id}' in parents and trashed=false`,
        fields: 'files(id,name,mimeType,size,createdTime,thumbnailLink,webViewLink,webContentLink)',
        orderBy: 'createdTime desc',
        supportsAllDrives: true,
      })
      const files = (filesRes.data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: parseInt(f.size || '0'),
        createdTime: f.createdTime,
        thumbnailLink: f.thumbnailLink,
        viewLink: f.webViewLink,
        downloadLink: f.webContentLink,
        folder: folder.name,
      }))

      result.files.push(...files)
      if (folder.name === 'Fotos') result.fotos.push(...files)
      if (folder.name === 'Documentos') result.documentos.push(...files)
    }

    return result
  } catch (e) {
    console.error('[drive] list files error:', e.message)
    return { files: [], fotos: [], documentos: [], configured: false, error: e.message }
  }
}
