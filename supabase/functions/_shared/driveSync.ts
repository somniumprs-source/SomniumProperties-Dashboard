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
import { drive } from "@googleapis/drive";
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
  return drive({ version: 'v3', auth })
}

export function isConfigured() {
  return isGoogleConfigured()
}

// ── Taxonomia das subpastas (por finalidade) dentro da pasta de cada imóvel ──
const SUB_DOCS_LEGAL  = '01 Documentação Legal'
const SUB_ANALISES    = '02 Análises e Estudos'
const SUB_PROPOSTAS   = '03 Propostas'
const SUB_FICHAS      = '04 Fichas e Follow-up'
const SUB_FOTOS       = '05 Fotos'
const SUB_FINANCEIRO  = '06 Financeiro'

const SUBFOLDERS = [SUB_DOCS_LEGAL, SUB_ANALISES, SUB_PROPOSTAS, SUB_FICHAS, SUB_FOTOS, SUB_FINANCEIRO]

// Categorização para listImovelFiles — inclui nomes legados (imóveis antigos).
const FOTO_FOLDER_NAMES = new Set([SUB_FOTOS, 'Fotos'])
const DOC_FOLDER_NAMES = new Set([SUB_DOCS_LEGAL, SUB_ANALISES, SUB_PROPOSTAS, SUB_FICHAS, 'Documentos', 'Estudo de Mercado'])

// Tipo de documento gerado → subpasta de destino
const DOC_SUBFOLDER_MAP = {
  analise_rentabilidade:          SUB_ANALISES,
  estudo_comparaveis:             SUB_ANALISES,
  relatorio_documental:           SUB_ANALISES,
  relatorio_investimento:         SUB_ANALISES,
  relatorio_comparaveis:          SUB_ANALISES,
  relatorio_stress:               SUB_ANALISES,
  relatorio_caep:                 SUB_ANALISES,
  proposta_formal:                SUB_PROPOSTAS,
  dossier_investidor:             SUB_PROPOSTAS,
  proposta_investimento_anonima:  SUB_PROPOSTAS,
  proposta_cedencia_posicao:      SUB_PROPOSTAS,
  ficha_imovel:                   SUB_FICHAS,
  ficha_visita:                   SUB_FICHAS,
  resumo_negociacao:              SUB_FICHAS,
  ficha_follow_up:                SUB_FICHAS,
  ficha_descarte:                 SUB_FICHAS,
}

// Pasta de topo para comprovativos de despesas sem imóvel associado.
let financeiroGeralFolderId = Deno.env.get("DRIVE_FINANCEIRO_FOLDER_ID") || null

function escapeQ(s) {
  return String(s).replace(/'/g, "\\'")
}

// Normaliza Uint8Array | ArrayBuffer | Buffer | stream Node → Uint8Array.
async function toBytes(data) {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (data && typeof data.on === 'function') {
    const chunks = []
    await new Promise((resolve, reject) => {
      data.on('data', c => chunks.push(c))
      data.on('end', resolve)
      data.on('error', reject)
    })
    return new Uint8Array(await new Blob(chunks).arrayBuffer())
  }
  return new Uint8Array(data)
}

// Procura subpasta por nome dentro de parentFolderId; cria se faltar (idempotente).
async function ensureSubfolder(drive, parentFolderId, nome) {
  const list = await drive.files.list({
    q: `'${parentFolderId}' in parents and name='${escapeQ(nome)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
  })
  const existing = list.data.files?.[0]?.id
  if (existing) return existing
  const created = await drive.files.create({
    requestBody: { name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] },
    fields: 'id',
    supportsAllDrives: true,
  })
  return created.data.id
}

// Upload de bytes para um folderId exacto. dedup=true apaga ficheiro homónimo antes.
async function uploadBytesToFolder(drive, folderId, bytes, fileName, mimeType, { dedup = true } = {}) {
  if (dedup) {
    const existing = await drive.files.list({
      q: `'${folderId}' in parents and name='${escapeQ(fileName)}' and trashed=false`,
      fields: 'files(id)',
      supportsAllDrives: true,
    })
    for (const f of existing.data.files || []) {
      await drive.files.delete({ fileId: f.id, supportsAllDrives: true }).catch(() => {})
    }
  }
  const { Readable } = await import('node:stream')
  const file = await drive.files.create({
    requestBody: { name: fileName, mimeType, parents: [folderId] },
    media: { mimeType, body: Readable.from(Buffer.from(bytes)) },
    fields: 'id',
    supportsAllDrives: true,
  })
  return file.data.id
}

// Upload para uma subpasta (por nome) da pasta do imóvel, criando-a se faltar.
async function uploadBytesToSubfolder(drive, imovelFolderId, subfolderName, bytes, fileName, mimeType, opts) {
  const target = (await ensureSubfolder(drive, imovelFolderId, subfolderName)) || imovelFolderId
  return uploadBytesToFolder(drive, target, bytes, fileName, mimeType, opts)
}

async function ensureFinanceiroGeralFolder(drive) {
  if (financeiroGeralFolderId) return financeiroGeralFolderId
  financeiroGeralFolderId = await ensureSubfolder(drive, PIPELINE_FOLDER_ID, 'Financeiro Geral')
  return financeiroGeralFolderId
}

/**
 * Upload de documento PDF gerado para a subpasta certa do imóvel no Drive.
 * `pdfData` aceita Uint8Array | ArrayBuffer | Buffer (ou stream Node legacy).
 * `opts.tipo` determina a subpasta via DOC_SUBFOLDER_MAP (fallback Documentação Legal).
 */
export async function uploadDocToFolder(imovelId, pdfData, fileName, opts = {}) {
  const drive = getDrive()
  if (!drive) return null

  try {
    const { rows: [imovel] } = await pool.query('SELECT drive_folder_id, nome FROM imoveis WHERE id = $1', [imovelId])
    if (!imovel?.drive_folder_id) return null

    const subfolder = (opts.tipo && DOC_SUBFOLDER_MAP[opts.tipo]) || SUB_DOCS_LEGAL
    const mimeType = opts.mimeType || 'application/pdf'
    const bytes = await toBytes(pdfData)

    const id = await uploadBytesToSubfolder(drive, imovel.drive_folder_id, subfolder, bytes, fileName, mimeType)
    console.log(`[drive] Upload: ${fileName} → ${imovel.nome}/${subfolder} (${id})`)
    return id
  } catch (e) {
    console.error('[drive] Upload erro:', e.message)
    return null
  }
}

/**
 * Espelha um ficheiro carregado pelo utilizador na subpasta certa do imóvel.
 * isPhoto=true → "05 Fotos"; caso contrário → "01 Documentação Legal".
 */
export async function uploadUserFileToFolder(imovelId, data, fileName, { isPhoto = false, mimeType }: { isPhoto?: boolean; mimeType?: string } = {}) {
  const drive = getDrive()
  if (!drive) return null

  try {
    const { rows: [imovel] } = await pool.query('SELECT drive_folder_id, nome FROM imoveis WHERE id = $1', [imovelId])
    if (!imovel?.drive_folder_id) return null

    const subfolder = isPhoto ? SUB_FOTOS : SUB_DOCS_LEGAL
    const bytes = await toBytes(data)
    const id = await uploadBytesToSubfolder(
      drive, imovel.drive_folder_id, subfolder, bytes, fileName, mimeType || 'application/octet-stream', { dedup: false },
    )
    console.log(`[drive] Upload utilizador: ${fileName} → ${imovel.nome}/${subfolder} (${id})`)
    return id
  } catch (e) {
    console.error('[drive] Upload utilizador erro:', e.message)
    return null
  }
}

/**
 * Espelha um comprovativo de despesa no Drive. Resolve o imóvel via
 * despesa → negócio → imóvel; com imóvel vai para "06 Financeiro" desse imóvel,
 * sem imóvel vai para "Financeiro Geral"/ano.
 */
export async function uploadComprovativoToFolder(despesaId, data, fileName, mimeType, opts = {}) {
  const drive = getDrive()
  if (!drive) return null

  try {
    const { rows: [row] } = await pool.query(
      `SELECT d.id, i.drive_folder_id, i.nome AS imovel_nome
         FROM despesas d
         LEFT JOIN negocios n ON d.negocio_id = n.id
         LEFT JOIN imoveis i ON n.imovel_id = i.id
        WHERE d.id = $1`,
      [despesaId],
    )
    const bytes = await toBytes(data)
    const mt = mimeType || 'application/octet-stream'

    if (row?.drive_folder_id) {
      const id = await uploadBytesToSubfolder(drive, row.drive_folder_id, SUB_FINANCEIRO, bytes, fileName, mt, { dedup: false })
      console.log(`[drive] Comprovativo: ${fileName} → ${row.imovel_nome}/${SUB_FINANCEIRO} (${id})`)
      return id
    }

    const geral = await ensureFinanceiroGeralFolder(drive)
    if (!geral) return null
    const ano = opts.ano || String(new Date().getFullYear())
    const anoFolder = await ensureSubfolder(drive, geral, ano)
    const id = await uploadBytesToFolder(drive, anoFolder, bytes, fileName, mt, { dedup: false })
    console.log(`[drive] Comprovativo (Financeiro Geral ${ano}): ${fileName} (${id})`)
    return id
  } catch (e) {
    console.error('[drive] Comprovativo erro:', e.message)
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

    // Criar subpastas (por finalidade)
    for (const sub of SUBFOLDERS) {
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
      if (FOTO_FOLDER_NAMES.has(folder.name)) result.fotos.push(...files)
      if (DOC_FOLDER_NAMES.has(folder.name)) result.documentos.push(...files)
    }

    return result
  } catch (e) {
    console.error('[drive] list files error:', e.message)
    return { files: [], fotos: [], documentos: [], configured: false, error: e.message }
  }
}

/**
 * Descarrega os bytes de um ficheiro do Drive (autenticado). Necessário para a
 * análise por IA de documentos que vivem no Drive — o webContentLink não é
 * acessível anonimamente em ficheiros privados.
 */
export async function downloadDriveFile(fileId) {
  if (!isGoogleConfigured()) throw new Error('Google Drive não configurado')
  const d = getDrive()
  if (!d) throw new Error('Google Drive não configurado')
  const meta = await d.files.get({ fileId, fields: 'name,mimeType', supportsAllDrives: true })
  const res = await d.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  return {
    bytes: new Uint8Array(res.data),
    name: meta.data.name,
    mimeType: meta.data.mimeType || null,
  }
}
