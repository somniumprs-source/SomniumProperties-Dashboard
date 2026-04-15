/**
 * Importar fotos do Google Drive para os imóveis do CRM.
 *
 * Para cada imóvel:
 * 1. Procura pasta no Drive com o mesmo nome
 * 2. Liga a pasta ao imóvel (drive_folder_id)
 * 3. Descarrega fotos da subpasta "Fotos" para /public/uploads/imoveis/
 * 4. Guarda metadados na coluna fotos do imóvel
 *
 * Uso: node scripts/import-drive-photos.js
 */
import 'dotenv/config'
import { google } from 'googleapis'
import { readFileSync, existsSync, writeFileSync, mkdirSync, createWriteStream } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OAUTH_PATH = path.join(ROOT, 'google-oauth.json')
const TOKEN_PATH = path.join(ROOT, 'google-token.json')
const UPLOADS_DIR = path.join(ROOT, 'public/uploads/imoveis')

// Pasta raiz do pipeline no Drive
const PIPELINE_FOLDER_ID = process.env.DRIVE_PIPELINE_FOLDER_ID || '1FT6uIpAad7R_XnGO1rHU1uLTsR-xOtFK'

function getDrive() {
  if (!existsSync(OAUTH_PATH) || !existsSync(TOKEN_PATH)) {
    console.error('Google OAuth não configurado.')
    console.error('Corre primeiro: node scripts/auth-google.js')
    process.exit(1)
  }
  const creds = JSON.parse(readFileSync(OAUTH_PATH, 'utf8'))
  const { client_id, client_secret } = creds.installed || creds.web
  const oauth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333')
  oauth2.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, 'utf8')))
  return google.drive({ version: 'v3', auth: oauth2 })
}

async function main() {
  const drive = getDrive()
  mkdirSync(UPLOADS_DIR, { recursive: true })

  // Conectar à BD
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) { console.error('DATABASE_URL não definido'); process.exit(1) }
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })

  // Buscar todos os imóveis
  const { rows: imoveis } = await pool.query('SELECT id, nome, drive_folder_id, fotos FROM imoveis ORDER BY nome')
  console.log(`\n📋 ${imoveis.length} imóveis no CRM\n`)

  // Listar TODAS as pastas dentro da pasta pipeline (recursivo por estado)
  console.log('🔍 A procurar pastas no Google Drive...\n')
  const allDriveFolders = await listAllFoldersRecursive(drive, PIPELINE_FOLDER_ID, 2)
  console.log(`   Encontradas ${allDriveFolders.length} pastas no Drive\n`)

  let imported = 0, linked = 0, skipped = 0

  for (const imovel of imoveis) {
    const nome = imovel.nome?.trim()
    if (!nome) { skipped++; continue }

    // Procurar pasta com nome correspondente (fuzzy match)
    const match = findBestMatch(nome, allDriveFolders)

    if (!match) {
      console.log(`   ⚪ ${nome} — sem pasta correspondente no Drive`)
      skipped++
      continue
    }

    console.log(`   🟡 ${nome} → pasta "${match.name}" (${match.id})`)

    // Ligar drive_folder_id se ainda não está ligado
    if (!imovel.drive_folder_id) {
      await pool.query('UPDATE imoveis SET drive_folder_id = $1, updated_at = NOW() WHERE id = $2', [match.id, imovel.id])
      console.log(`      ✅ drive_folder_id ligado`)
      linked++
    }

    // Procurar fotos em TODOS os locais: raiz + subpastas "Fotos" / "2. Fotos" etc.
    const allFilesInRoot = await listFiles(drive, match.id)
    const rootImages = allFilesInRoot.filter(f =>
      f.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic)$/i.test(f.name)
    )

    // Procurar subpastas que contenham "Foto" no nome
    const subfolders = allFilesInRoot.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
    let subfolderImages = []
    for (const sub of subfolders) {
      if (/foto/i.test(sub.name)) {
        const subFiles = await listFiles(drive, sub.id)
        const imgs = subFiles.filter(f =>
          f.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic)$/i.test(f.name)
        )
        subfolderImages.push(...imgs)
      }
    }

    const imageFiles = [...rootImages, ...subfolderImages]
    if (imageFiles.length === 0) {
      console.log(`      ℹ️  Sem fotos encontradas`)
      continue
    }

    // Verificar quais fotos já foram importadas
    const existingFotos = imovel.fotos ? JSON.parse(imovel.fotos) : []
    const existingNames = new Set(existingFotos.map(f => f.name))

    const newPhotos = imageFiles.filter(f => !existingNames.has(f.name))
    if (newPhotos.length === 0) {
      console.log(`      ℹ️  ${imageFiles.length} fotos já importadas`)
      continue
    }

    console.log(`      📸 A importar ${newPhotos.length} fotos...`)

    // Descarregar cada foto
    for (const photo of newPhotos) {
      try {
        const ext = path.extname(photo.name) || '.jpg'
        const localFilename = `${randomUUID()}${ext}`
        const localPath = path.join(UPLOADS_DIR, localFilename)

        // Download do Drive
        const response = await drive.files.get(
          { fileId: photo.id, alt: 'media' },
          { responseType: 'stream' }
        )

        await new Promise((resolve, reject) => {
          const dest = createWriteStream(localPath)
          response.data.pipe(dest)
          dest.on('finish', resolve)
          dest.on('error', reject)
        })

        // Adicionar à lista de fotos
        existingFotos.push({
          id: randomUUID(),
          name: photo.name,
          path: `/uploads/imoveis/${localFilename}`,
          type: photo.mimeType || 'image/jpeg',
          size: parseInt(photo.size || '0'),
          uploaded_at: new Date().toISOString(),
          drive_file_id: photo.id,
        })

        imported++
        console.log(`         ✅ ${photo.name}`)
      } catch (e) {
        console.error(`         ❌ ${photo.name}: ${e.message}`)
      }
    }

    // Guardar fotos na BD
    await pool.query('UPDATE imoveis SET fotos = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(existingFotos), imovel.id
    ])
  }

  console.log(`\n════════════════════════════════════════`)
  console.log(`✅ Importação concluída:`)
  console.log(`   ${linked} imóveis ligados ao Drive`)
  console.log(`   ${imported} fotos importadas`)
  console.log(`   ${skipped} imóveis sem pasta correspondente`)
  console.log(`════════════════════════════════════════\n`)

  await pool.end()
}

// ── Helpers ──────────────────────────────────────────────────

async function listAllFoldersRecursive(drive, parentId, depth) {
  const folders = []
  try {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      pageSize: 200,
      supportsAllDrives: true,
    })
    const items = res.data.files || []
    for (const item of items) {
      folders.push(item)
      if (depth > 1) {
        const children = await listAllFoldersRecursive(drive, item.id, depth - 1)
        folders.push(...children)
      }
    }
  } catch (e) {
    console.error(`Erro ao listar pasta ${parentId}:`, e.message)
  }
  return folders
}

async function findSubfolder(drive, parentId, name) {
  try {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      supportsAllDrives: true,
    })
    return res.data.files?.[0] || null
  } catch { return null }
}

async function listFiles(drive, folderId) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,size)',
      pageSize: 100,
      orderBy: 'name',
      supportsAllDrives: true,
    })
    return res.data.files || []
  } catch { return [] }
}

function normalize(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function findBestMatch(imovelName, driveFolders) {
  const normName = normalize(imovelName)

  // Exact match first
  for (const f of driveFolders) {
    if (normalize(f.name) === normName) return f
  }

  // Contains match (Drive folder name contains property name or vice-versa)
  for (const f of driveFolders) {
    const normFolder = normalize(f.name)
    if (normFolder.includes(normName) || normName.includes(normFolder)) {
      if (normFolder.length > 3 && normName.length > 3) return f
    }
  }

  // Word overlap match (>60% of words match)
  const nameWords = normName.split(' ').filter(w => w.length > 2)
  if (nameWords.length >= 2) {
    let bestScore = 0, bestFolder = null
    for (const f of driveFolders) {
      const folderWords = normalize(f.name).split(' ').filter(w => w.length > 2)
      if (folderWords.length < 2) continue
      const matching = nameWords.filter(w => folderWords.includes(w)).length
      const score = matching / Math.max(nameWords.length, folderWords.length)
      if (score > bestScore && score >= 0.6) {
        bestScore = score
        bestFolder = f
      }
    }
    if (bestFolder) return bestFolder
  }

  return null
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1) })
