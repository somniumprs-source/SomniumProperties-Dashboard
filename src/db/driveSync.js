/**
 * Google Drive — criar e mover pastas de imóveis.
 * Cada imóvel tem pasta com subpastas: Documentos, Fotos, Estudo de Mercado.
 * Quando o estado muda, a pasta move-se para a pasta do estado correspondente.
 */
import { google } from 'googleapis'
import pool from './pg.js'
import { getGoogleAuth, isGoogleConfigured } from './googleAuth.js'

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
  const auth = getGoogleAuth()
  if (!auth) return null
  return google.drive({ version: 'v3', auth })
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
let financeiroGeralFolderId = process.env.DRIVE_FINANCEIRO_FOLDER_ID || null

function escapeQ(s) {
  return String(s).replace(/'/g, "\\'")
}

// Normaliza stream Node / Buffer / Uint8Array / ArrayBuffer → Buffer.
async function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof Uint8Array) return Buffer.from(data)
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data))
  if (data && typeof data.on === 'function') {
    const chunks = []
    await new Promise((resolve, reject) => {
      data.on('data', c => chunks.push(c))
      data.on('end', resolve)
      data.on('error', reject)
    })
    return Buffer.concat(chunks)
  }
  return Buffer.from(data)
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
  const { Readable } = await import('stream')
  const file = await drive.files.create({
    requestBody: { name: fileName, mimeType, parents: [folderId] },
    media: { mimeType, body: Readable.from(bytes) },
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

// Pasta de arquivo para tudo o que é apagado do CRM (fotos, documentos) mas
// tem espelho no Drive — em vez de apagar a cópia no Drive (ou deixá-la
// órfã, como acontecia antes), o ficheiro é movido para aqui, mantendo
// histórico do que já existiu. Achado da auditoria: "apagar no CRM não
// apaga no Drive — os dois espelhos podiam mostrar coisas diferentes".
let elementosApagadosFolderId = null
async function ensureElementosApagadosFolder(drive) {
  if (elementosApagadosFolderId) return elementosApagadosFolderId
  elementosApagadosFolderId = await ensureSubfolder(drive, PIPELINE_FOLDER_ID, 'Elementos apagados do CRM')
  return elementosApagadosFolderId
}

/**
 * Move um ficheiro do Drive para a pasta "Elementos apagados do CRM", em vez
 * de o apagar — chamar sempre que um registo com espelho no Drive (foto,
 * documento) é apagado no CRM.
 */
export async function moverParaElementosApagados(fileId) {
  if (!fileId) return false
  const drive = getDrive()
  if (!drive) return false
  try {
    const destino = await ensureElementosApagadosFolder(drive)
    if (!destino) return false
    const file = await drive.files.get({ fileId, fields: 'parents', supportsAllDrives: true })
    const currentParents = (file.data.parents || []).join(',')
    await drive.files.update({
      fileId, addParents: destino, removeParents: currentParents, supportsAllDrives: true,
    })
    console.log(`[drive] Ficheiro ${fileId} movido para "Elementos apagados do CRM"`)
    return true
  } catch (e) {
    if (e.code === 404) return true // já não existe no Drive, nada a mover
    console.error('[drive] Erro ao mover para Elementos apagados:', e.message)
    return false
  }
}

// Pasta de topo para os investidores. DRIVE_INVESTIDORES_FOLDER_ID é opcional —
// sem ela, cria/usa uma subpasta "Investidores" dentro do pipeline (mesmo
// padrão de ensureFinanceiroGeralFolder).
let investidoresRootFolderId = process.env.DRIVE_INVESTIDORES_FOLDER_ID || null
async function ensureInvestidoresRootFolder(drive) {
  if (investidoresRootFolderId) return investidoresRootFolderId
  investidoresRootFolderId = await ensureSubfolder(drive, PIPELINE_FOLDER_ID, 'Investidores')
  return investidoresRootFolderId
}

/**
 * Descarrega os bytes de um ficheiro do Drive (autenticado). Necessário para a
 * análise por IA de documentos que vivem no Drive — o webContentLink não é
 * acessível anonimamente em ficheiros privados.
 */
export async function downloadDriveFile(fileId) {
  if (!isGoogleConfigured()) throw new Error('Google Drive não configurado')
  const drive = getDrive()
  if (!drive) throw new Error('Google Drive não configurado')
  const meta = await drive.files.get({ fileId, fields: 'name,mimeType', supportsAllDrives: true })
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  return { buffer: Buffer.from(res.data), name: meta.data.name, mimeType: meta.data.mimeType || null }
}

/**
 * Upload de documento PDF gerado para a subpasta certa do imóvel no Drive.
 * `pdfData` aceita stream Node | Buffer | Uint8Array | ArrayBuffer.
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
    const buffer = await toBuffer(pdfData)

    const id = await uploadBytesToSubfolder(drive, imovel.drive_folder_id, subfolder, buffer, fileName, mimeType)
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
 * Sem dedup (vários ficheiros podem partilhar nome original).
 */
export async function uploadUserFileToFolder(imovelId, bytes, fileName, { isPhoto = false, mimeType } = {}) {
  const drive = getDrive()
  if (!drive) return null

  try {
    const { rows: [imovel] } = await pool.query('SELECT drive_folder_id, nome FROM imoveis WHERE id = $1', [imovelId])
    if (!imovel?.drive_folder_id) return null

    const subfolder = isPhoto ? SUB_FOTOS : SUB_DOCS_LEGAL
    const buffer = await toBuffer(bytes)
    const id = await uploadBytesToSubfolder(
      drive, imovel.drive_folder_id, subfolder, buffer, fileName, mimeType || 'application/octet-stream', { dedup: false },
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
export async function uploadComprovativoToFolder(despesaId, bytes, fileName, mimeType, opts = {}) {
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
    const buffer = await toBuffer(bytes)
    const mt = mimeType || 'application/octet-stream'

    if (row?.drive_folder_id) {
      const id = await uploadBytesToSubfolder(drive, row.drive_folder_id, SUB_FINANCEIRO, buffer, fileName, mt, { dedup: false })
      console.log(`[drive] Comprovativo: ${fileName} → ${row.imovel_nome}/${SUB_FINANCEIRO} (${id})`)
      return id
    }

    // Sem imóvel → Financeiro Geral / ano
    const geral = await ensureFinanceiroGeralFolder(drive)
    if (!geral) return null
    const ano = opts.ano || String(new Date().getFullYear())
    const anoFolder = await ensureSubfolder(drive, geral, ano)
    const id = await uploadBytesToFolder(drive, anoFolder, buffer, fileName, mt, { dedup: false })
    console.log(`[drive] Comprovativo (Financeiro Geral ${ano}): ${fileName} (${id})`)
    return id
  } catch (e) {
    console.error('[drive] Comprovativo erro:', e.message)
    return null
  }
}

/**
 * Criar pasta do investidor no Drive (sem subpastas — os documentos vivem
 * directamente na pasta, como uma pasta pessoal do investidor).
 * Retorna o ID da pasta criada.
 */
export async function createInvestidorFolder(investidorId, nome) {
  const drive = getDrive()
  if (!drive) return null

  try {
    const parentId = await ensureInvestidoresRootFolder(drive)
    if (!parentId) return null

    const folder = await drive.files.create({
      requestBody: { name: nome || 'Sem nome', mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
      supportsAllDrives: true,
    })
    const folderId = folder.data.id

    await pool.query('UPDATE investidores SET drive_folder_id = $1 WHERE id = $2', [folderId, investidorId])

    console.log(`[drive] Pasta de investidor criada: "${nome}" (${folderId})`)
    return folderId
  } catch (e) {
    console.error('[drive] Erro ao criar pasta de investidor:', e.message)
    return null
  }
}

/**
 * Upload de um documento para a pasta do investidor. Cria a pasta se ainda
 * não existir (investidores criados antes desta funcionalidade).
 */
export async function uploadDocumentoInvestidor(investidorId, bytes, fileName, mimeType) {
  const drive = getDrive()
  if (!drive) return null

  try {
    const { rows: [inv] } = await pool.query('SELECT nome, drive_folder_id FROM investidores WHERE id = $1', [investidorId])
    if (!inv) return null
    let folderId = inv.drive_folder_id
    if (!folderId) folderId = await createInvestidorFolder(investidorId, inv.nome)
    if (!folderId) return null

    return await uploadBytesToFolder(drive, folderId, bytes, fileName, mimeType)
  } catch (e) {
    console.error('[drive] Erro ao enviar documento de investidor:', e.message)
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
