/**
 * API REST routes para o CRM (PostgreSQL).
 */
import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID, createHash } from 'crypto'
import { readFile, unlink } from 'fs/promises'
import { createClient } from '@supabase/supabase-js'
import { isWholesaling } from '../lib/modelos.js'
import { CHECKLIST_ENFORCEMENT_START_DATE } from '../constants/featureFlags.js'
import { diasFollowUpParaRegisto } from '../constants/followupRules.js'

// 'Resposta' foi renomeado para 'Recebido' numa migração antiga (ver pg.js);
// dados anteriores à migração ainda usam 'Resposta' — aceitar os dois.
const isDirecaoResposta = (direcao) => direcao === 'Recebido' || direcao === 'Resposta'

// Supabase Storage client para uploads persistentes
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const supabaseStorage = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null
export { supabaseStorage }
import { Imoveis, Investidores, Consultores, Negocios, Despesas, Tarefas, ConsultorInteracoes, InvestidorInteracoes, ConsultorFollowups, DocumentosInvestidor, Visitas, Empreiteiros, getDashboardStats } from './crud.js'
import pool from './pg.js'
import { getVisitasEnriquecidas, syncDataVisitaDerivada, getFichaVisitaParaImovel } from './queries.js'
import { syncFromNotion, syncAllFromNotion, syncToNotion } from './sync.js'
import { generateImovelPDF } from './pdfReport.js'
import { syncFireflies, fetchTranscript, isConfigured as firefliesConfigured } from './firefliesSync.js'
import { syncForms, isConfigured as formsConfigured } from './formsSync.js'
import { createImovelFolder, moveImovelFolder, uploadDocToFolder, uploadUserFileToFolder, uploadComprovativoToFolder, isConfigured as driveConfigured, downloadDriveFile, createInvestidorFolder, uploadDocumentoInvestidor } from './driveSync.js'
import { generateDoc, getDocsForEstado, docEmbedeLocalizacao } from './pdfImovelDocs.js'
import { onImovelCreated, listDocumentos, persistDocumento, streamPdfToResAndPersist } from './documentLifecycle.js'
import { analyzeReuniao, autoFillInvestidor } from './meetingAnalysis.js'
import { generateMeetingPDF } from './pdfMeetingReport.js'
import { ensureLabels, organizeMessage, organizeBatch, autoOrganize, isConfigured as gmailConfigured } from './gmailSync.js'
import { exportDepartment } from './excelExport.js'
import { scrapePhotosFromLink } from './linkScraper.js'
import { generateDocx, getAvailableTypes } from './docxGenerator.js'
import { runEstudoLocalizacao } from '../lib/estudoLocalizacao.js'
import { FASES_FIX_FLIP, FASES_POR_CATEGORIA, getTemplateFases, getFaseConfigGlobal } from './fasesFixFlip.js'
import { resolveAppUser, RECORD_RESTRICTED_ROLES } from './userRoutes.js'
import {
  generateFichaAcompanhamento,
  generateRelatorioAcompanhamento,
  generateMemoriaDescritiva,
  generateRelatorioSaida,
} from './pdfProjectoFixFlip.js'
import { generateRelatorioExpansaoGaia } from './pdfRelatorioExpansaoGaia.js'
import { gerarResumoProjeto, invalidarCacheAi, isConfigured as aiConfigured } from './projetoAiAssistant.js'
import { audit, descreverMudanca } from './projetoAuditLog.js'
import { calcAnalise, calcStressTests } from './calcEngine.js'
import rateLimit from 'express-rate-limit'

// Rate limit para endpoints de IA (controla custos)
const aiRateLimit = rateLimit({
  windowMs: 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados pedidos de IA. Aguarda 1 minuto.' },
})

// Rate limit para uploads (proteção disco / abuse)
const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados uploads. Aguarda 1 minuto.' },
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.resolve(__dirname, '../../public/uploads/despesas')
const imoveisUploadsDir = path.resolve(__dirname, '../../public/uploads/imoveis')
const REPO_ROOT = path.resolve(__dirname, '../..')

// Cabeçalho Content-Disposition para PDFs: por defeito abre na pré-visualização
// (inline); com ?download=1 força o descarregamento (attachment) para enviar a
// investidores ou guardar para análise. Mantém o comportamento anterior quando
// o parâmetro não está presente.
const pdfDisposition = (req, filename) =>
  `${req.query.download ? 'attachment' : 'inline'}; filename="${filename}"`

// Garantir que a pasta de uploads de imóveis existe
import { mkdirSync } from 'fs'
try { mkdirSync(imoveisUploadsDir, { recursive: true }) } catch {}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${randomUUID()}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|jpg|jpeg|png|webp|heic)$/i
    cb(null, allowed.test(path.extname(file.originalname)))
  },
})

const imoveisStorage = multer.diskStorage({
  destination: imoveisUploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${randomUUID()}${ext}`)
  },
})
const uploadImovel = multer({
  storage: imoveisStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
})
export { uploadImovel }

// Documentos de reunioes (PDF/PPTX/DOCX/XLSX) — em memoria, vao direto para o Storage.
const uploadDocs = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|pptx|ppt|docx|doc|xlsx|xls)$/i
    cb(null, allowed.test(path.extname(file.originalname)))
  },
})

// Gravacoes de chamadas (audio) — em memoria, vao direto para o Storage privado.
// Limite generoso (200MB) porque uma chamada longa em WAV pode ser pesada.
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(mp3|m4a|wav|aac|ogg|opus|flac|mp4|webm)$/i
    cb(null, allowed.test(path.extname(file.originalname)))
  },
})

// ── Auth helper para CRM (CRM bypassa auth global, mas precisamos para filtros) ──
const _supabaseCrm = process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co', process.env.SUPABASE_SERVICE_KEY)
  : null

async function resolveCrmUser(req) {
  if (!_supabaseCrm) return null
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token
  if (!token) return null
  try {
    const { data: { user }, error } = await _supabaseCrm.auth.getUser(token)
    if (error || !user) return null
    req.user = user
    return await resolveAppUser(req)
  } catch { return null }
}

const router = Router()

// Desactivar cache em todas as respostas do CRM — dados tem que ser sempre frescos
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  next()
})

// ── Multi-região: filtro automático por X-Regiao ─────────────
// Lê o header X-Regiao e injecta em req.regiaoActiva + req.query.regiao.
// Quando o crudRoutes.list usa req.query como filter, o CRUD aceita
// regiao= como filtro de coluna (validado por information_schema), pelo
// que basta passar a query: as tabelas que TÊM coluna regiao são filtradas,
// as que não têm são ignoradas silenciosamente.
// Para mutações (POST/PUT), preenche também req.body.regiao se ausente — o
// frontend não precisa de enviar o campo explicitamente.
const REGIOES_VALIDAS = new Set(['Coimbra', 'AMP'])
// Tabelas onde o filtro regional é uma garantia de isolamento (não só filtro UI).
// PUT/DELETE sobre um registo destas tabelas exige que a região do registo
// corresponda à `X-Regiao` enviada — protege contra edição cruzada entre regiões.
const TABELAS_ISOLADAS_REGIAO = new Set(['imoveis', 'consultores', 'negocios', 'empreiteiros'])
const PATH_TO_TABLE = {
  imoveis: 'imoveis', consultores: 'consultores', negocios: 'negocios',
  empreiteiros: 'empreiteiros', despesas: 'despesas', tarefas: 'tarefas',
  investidores: 'investidores',
}

router.use((req, _res, next) => {
  const r = req.headers['x-regiao'] || req.headers['X-Regiao']
  if (r && REGIOES_VALIDAS.has(r)) {
    req.regiaoActiva = r
    // POST/PUT/PATCH: pré-preenche regiao no body. Caso especial investidores
    // (pool unificado): usa regioes_preferidas (JSON array) em vez de regiao.
    if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') && req.body && typeof req.body === 'object') {
      const isInvestidor = req.path.startsWith('/investidores')
      if (isInvestidor) {
        if (req.body.regioes_preferidas === undefined) {
          req.body.regioes_preferidas = JSON.stringify([r])
        }
      } else if (req.body.regiao === undefined) {
        req.body.regiao = r
      }
    }
  }
  next()
})

// Middleware de autorização regional — bloqueia mutações sobre registos que
// pertencem a uma região diferente da activa. Aplica-se a PUT/PATCH/DELETE
// em rotas /:tabela/:id de tabelas listadas em TABELAS_ISOLADAS_REGIAO.
router.use(async (req, res, next) => {
  try {
    if (!['PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()
    if (!req.regiaoActiva) return next() // sem header: chamadas legacy passam (admin global)
    const m = req.path.match(/^\/(\w+)\/([^/]+)$/)
    if (!m) return next()
    const tabela = PATH_TO_TABLE[m[1]]
    if (!tabela || !TABELAS_ISOLADAS_REGIAO.has(tabela)) return next()
    const id = m[2]
    const { rows } = await pool.query(`SELECT regiao FROM ${tabela} WHERE id = $1`, [id])
    if (!rows[0]) return next() // 404 trata depois
    const regiaoRegisto = rows[0].regiao
    // Permitir se o registo ainda não tem região atribuída (legacy/Coimbra default)
    if (regiaoRegisto && regiaoRegisto !== req.regiaoActiva) {
      return res.status(403).json({
        error: `Acesso negado: registo pertence à região "${regiaoRegisto}" mas operação está em "${req.regiaoActiva}". Troque de região e tente de novo.`,
        registo_regiao: regiaoRegisto,
        regiao_activa: req.regiaoActiva,
      })
    }
    next()
  } catch (e) { next() } // em caso de erro, deixar passar (fail-open) — auth global apanha noutra camada
})

// ── Mapa de qualidade por estado do pipeline ─────────────────
// 0% = enviado sem info | 25% = check qualidade (SOP §5.1)
// 50% = visita/VVR concluído | 75% = negociação activa | 100% = proposta apresentada
const ESTADO_QUALIDADE = {
  'Adicionado': 0, 'Chamada Não Atendida': 0, 'Pendentes': 0,
  'Não interessa': 0, 'Nao interessa': 0, 'Descartado': 0,
  'Pré-aprovação': 0.25,
  'Necessidade de Visita': 0.25, 'Follow UP': 0.25,
  'Visita Marcada': 0.50, 'Estudo de VVR': 0.50,
  'Em negociação': 0.75, 'Proposta aceite': 0.75, 'Enviar proposta ao investidor': 0.75, 'Follow Up após proposta': 0.75,
  'Criar Proposta ao Proprietário': 1.0, 'Enviar proposta ao Proprietário': 1.0,
  'Wholesaling': 1.0, 'CAEP': 1.0, 'Fix and Flip': 1.0, 'Negócio em Curso': 1.0,
}
// Classificação por score (limiares da fórmula oficial)
const CLASSE_POR_SCORE = (score) => score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 30 ? 'C' : 'D'
const CLASSE_LABEL = { A: 'Parceiro', B: 'Activo', C: 'Em desenvolvimento', D: 'Novo' }
function qualidadeImovel(estado) {
  const clean = (estado || '').replace(/^\d+-\s*/, '').trim()
  return ESTADO_QUALIDADE[clean] ?? 0
}

// ── Generic CRUD route factory ────────────────────────────────
// beforeUpdate(id, body) corre ANTES de crud.update — só aí ainda se tem o
// registo no estado anterior sem ambiguidade. Se devolver { error }, a rota
// responde 400 e não persiste nada.
function crudRoutes(path, crud, { onCreate, onUpdate, beforeUpdate } = {}) {
  router.get(path, async (req, res) => {
    try {
      const { limit = 100, offset = 0, sort, search, ...filter } = req.query
      // Injecta regiao activa no filter, salvo se já vier explicitamente.
      // O crud.list valida via getColumns: tabelas sem coluna regiao ignoram.
      if (req.regiaoActiva && filter.regiao === undefined) {
        filter.regiao = req.regiaoActiva
      }
      if (search) {
        const data = await crud.search(search, +limit, { regiao: req.regiaoActiva })
        return res.json({ data, total: data.length })
      }
      res.json(await crud.list({ limit: +limit, offset: +offset, sort, filter }))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.get(`${path}/stats`, async (req, res) => {
    try { res.json(await crud.stats({ regiao: req.regiaoActiva })) }
    catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.get(`${path}/:id`, async (req, res) => {
    try {
      const item = await crud.getById(req.params.id)
      if (!item) return res.status(404).json({ error: 'Não encontrado' })
      res.json(item)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post(path, async (req, res) => {
    try {
      const item = await crud.create(req.body, { regiaoActiva: req.regiaoActiva })
      const table = path.slice(1)
      syncToNotion(table, item.id).catch(e => console.error(`[sync] create ${table}:`, e.message))
      if (onCreate) onCreate(item).catch(e => console.error(`[hook] create ${table}:`, e.message))
      res.status(201).json(item)
    } catch (e) { res.status(400).json({ error: e.message }) }
  })

  router.put(`${path}/:id`, async (req, res) => {
    try {
      if (beforeUpdate) {
        const check = await beforeUpdate(req.params.id, req.body)
        if (check && check.error) return res.status(400).json(check)
      }
      const item = await crud.update(req.params.id, req.body, { regiaoActiva: req.regiaoActiva })
      if (!item) return res.status(404).json({ error: 'Não encontrado' })
      const table = path.slice(1)
      syncToNotion(table, req.params.id).catch(e => console.error(`[sync] update ${table}:`, e.message))
      if (onUpdate) onUpdate(item, req.body).catch(e => console.error(`[hook] update ${table}:`, e.message))
      res.json(item)
    } catch (e) { res.status(400).json({ error: e.message }) }
  })

  router.delete(`${path}/:id`, async (req, res) => {
    try {
      const ok = await crud.delete(req.params.id, { regiaoActiva: req.regiaoActiva })
      if (!ok) return res.status(404).json({ error: 'Não encontrado' })
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
}

// Mapa estado do imóvel → categoria de negocio
// Nota: o estado no CRM aparece como "Wholesaling" (1 L) mas a categoria de negocio é "Wholesalling" (2 Ls)
const ESTADO_IMOVEL_PARA_CATEGORIA = {
  'Wholesaling':  'Wholesalling',
  'Wholesalling': 'Wholesalling',
  'CAEP':         'CAEP',
  'Fix and Flip': 'Fix and Flip',
}

async function autoCriarNegocioDeImovel(imovel, novoEstado) {
  const categoria = ESTADO_IMOVEL_PARA_CATEGORIA[novoEstado]
  if (!categoria) return  // estado não é um modelo de negócio

  // Idempotência: skipar se já existir negocio activo para este imóvel
  const { rows: existentes } = await pool.query(
    `SELECT id FROM negocios WHERE imovel_id = $1 AND (deleted_at IS NULL) LIMIT 1`,
    [imovel.id]
  )
  if (existentes.length > 0) {
    console.log(`[auto-negocio] Skip — já existe negocio para imóvel ${imovel.nome || imovel.id}`)
    return
  }

  const negocioId = randomUUID()
  const capital = Number(imovel.valor_proposta) > 0 ? Number(imovel.valor_proposta) : (Number(imovel.ask_price) || 0)
  const lucroEst = Number(imovel.valor_venda_remodelado) > 0 && Number(imovel.custo_estimado_obra) >= 0 && capital > 0
    ? Math.max(0, Number(imovel.valor_venda_remodelado) - capital - Number(imovel.custo_estimado_obra || 0))
    : 0
  const movimento = imovel.nome || `Projecto ${categoria}`
  const notas = `Auto-criado a partir do imóvel "${imovel.nome || imovel.id}" (estado: ${novoEstado})`

  await pool.query(
    `INSERT INTO negocios (id, movimento, categoria, fase, capital_total, lucro_estimado, imovel_id, data, notas, regiao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      negocioId,
      movimento,
      categoria,
      'Fase de obras',
      capital,
      lucroEst,
      imovel.id,
      new Date().toISOString().slice(0, 10),
      notas,
      imovel.regiao ?? null,
    ]
  )

  // Auto-criar fases conforme template da categoria
  if (FASES_POR_CATEGORIA[categoria]) {
    await criarFasesProjecto(negocioId, categoria).catch(e => console.error('[auto-negocio] criarFases:', e.message))
  }

  console.log(`[auto-negocio] Criado negocio ${negocioId} (${categoria}) para imóvel ${imovel.nome || imovel.id}`)
  return negocioId
}

crudRoutes('/imoveis', Imoveis, {
  onCreate: async (item) => {
    if (driveConfigured()) {
      await createImovelFolder(item.id, item.nome || 'Sem nome', item.estado || 'Adicionado')
    }
    // Auto-gerar Ficha do Imóvel v1 (persiste em disco + documentos_imovel)
    onImovelCreated(item).catch(e => console.error('[docs] onCreate ficha:', e.message))
    // Se o imóvel é criado já num estado de modelo de negócio, auto-criar projecto
    if (ESTADO_IMOVEL_PARA_CATEGORIA[item.estado]) {
      autoCriarNegocioDeImovel(item, item.estado).catch(e => console.error('[auto-negocio] onCreate:', e.message))
    }
    // Auto-scrape fotos do link do anuncio
    if (item.link && item.link.startsWith('http')) {
      scrapePhotosFromLink(item.link, item.id).then(async (photos) => {
        if (photos.length > 0) {
          const existing = item.fotos ? JSON.parse(item.fotos) : []
          existing.push(...photos)
          await Imoveis.update(item.id, { fotos: JSON.stringify(existing) })
          console.log(`[scraper] ${photos.length} fotos extraidas automaticamente para ${item.nome || item.id}`)
        }
      }).catch(e => console.error(`[scraper] Erro auto-scrape:`, e.message))
    }
  },
  onUpdate: async (item, body) => {
    // Auto-scrape fotos quando link e adicionado ou alterado
    if (body.link && body.link.startsWith('http')) {
      const existingFotos = item.fotos ? JSON.parse(item.fotos) : []
      const alreadyScraped = existingFotos.some(f => f.source === 'scraper' && f.source_url?.includes(new URL(body.link).hostname))
      if (!alreadyScraped) {
        scrapePhotosFromLink(body.link, item.id).then(async (photos) => {
          if (photos.length > 0) {
            const current = await Imoveis.getById(item.id)
            const fotos = current?.fotos ? JSON.parse(current.fotos) : []
            fotos.push(...photos)
            await Imoveis.update(item.id, { fotos: JSON.stringify(fotos) })
            console.log(`[scraper] ${photos.length} fotos extraidas de link actualizado para ${item.nome || item.id}`)
          }
        }).catch(e => console.error(`[scraper] Erro auto-scrape update:`, e.message))
      }
    }
    if (body.estado) {
      // Mover pasta no Drive
      if (driveConfigured()) {
        await moveImovelFolder(item.id, body.estado)
      }
      // Auto-criar projecto quando estado é um modelo de negócio.
      // A idempotência interna de autoCriarNegocioDeImovel garante zero duplicados —
      // não comparamos com o estado anterior porque o item devolvido pelo crud.update
      // já vem merged com body, tornando a comparação sempre falsa.
      if (ESTADO_IMOVEL_PARA_CATEGORIA[body.estado]) {
        autoCriarNegocioDeImovel({ ...item, ...body }, body.estado).catch(e => console.error('[auto-negocio] onUpdate:', e.message))
      }
      // Gerar documentos da fase: persistir em Supabase Storage + DB e upload ao Drive
      const docs = getDocsForEstado(body.estado)
      for (const tipo of docs) {
        try {
          let analise = null
          try { const { rows: [a] } = await pool.query('SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1', [item.id]); analise = a } catch {}
          if (tipo === 'ficha_visita') { try { item._fichaVisita = await getFichaVisitaParaImovel(item.id) } catch {} }
          await persistDocumento(item, tipo, { trigger: `estado:${body.estado}`, generatedBy: 'system', analise })
          if (driveConfigured()) {
            const pdfDoc = await generateDoc(tipo, item, analise)
            if (pdfDoc) await uploadDocToFolder(item.id, pdfDoc, `${tipo}.pdf`, { tipo })
          }
        } catch (e) { console.error(`[docs] Erro ${tipo}:`, e.message) }
      }
    }
    // Wholesaling: se mudou o fee de cedência (ou a proposta), recompor o lucro esperado dos negocios deste imovel
    if (body.fee_cedencia !== undefined || body.valor_proposta !== undefined) {
      await recomputeLucroWholesalingPorImovel(item.id).catch(e => console.error('[wholesaling/recompute imovel]', e.message))
    }
    // Se mudou a fonte do preco de aquisicao (valor_proposta, fee_cedencia) ou o modelo, recalcular analise activa
    if (body.fee_cedencia !== undefined || body.valor_proposta !== undefined || body.modelo_negocio !== undefined) {
      await recalcAnaliseActivaCompra(item.id).catch(e => console.error('[analise/recalc compra]', e.message))
    }
    // Auto-complete checklist: verificar campos preenchidos
    try {
      const merged = { ...item, ...body }
      const { rows: pending } = await pool.query(
        "SELECT * FROM checklist_imovel WHERE imovel_id = $1 AND concluida = false AND campo_crm IS NOT NULL",
        [item.id]
      )
      const now = new Date().toISOString()
      const toComplete = []
      for (const cl of pending) {
        if (/^(analise:|negocio:|doc:|tarefa calendario)/.test(cl.campo_crm)) continue
        const fields = cl.campo_crm.split(',').map(f => f.trim()).filter(f => f !== 'notas' && f !== 'fotos')
        if (fields.length === 0) continue
        const allFilled = fields.every(f => {
          const v = merged[f]
          return v !== null && v !== undefined && v !== '' && v !== 0
        })
        if (allFilled) toComplete.push(cl.id)
      }
      if (toComplete.length > 0) {
        await pool.query(
          `UPDATE checklist_imovel SET concluida = true, concluida_em = $1, concluida_por = 'auto', updated_at = $1
           WHERE id = ANY($2)`,
          [now, toComplete]
        )
        console.log(`[checklist] Auto-completadas ${toComplete.length} tarefas para ${item.nome || item.id}`)
      }
    } catch (e) { console.error('[checklist] Erro auto-complete:', e.message) }
  },
  // Bloqueia mudança de estado no Kanban se a checklist obrigatória do
  // estado ACTUAL não estiver completa — só para imóveis criados depois de
  // CHECKLIST_ENFORCEMENT_START_DATE (imóveis já existentes movem livremente).
  beforeUpdate: async (id, body) => {
    if (!body.estado) return null
    const { rows: [imovel] } = await pool.query('SELECT estado, created_at FROM imoveis WHERE id = $1', [id])
    if (!imovel) return null
    if (body.estado === imovel.estado) return null
    if (!imovel.created_at || imovel.created_at < CHECKLIST_ENFORCEMENT_START_DATE) return null
    const { rows: pendentes } = await pool.query(
      `SELECT titulo FROM checklist_imovel WHERE imovel_id = $1 AND estado = $2 AND obrigatoria = true AND concluida = false`,
      [id, imovel.estado]
    )
    if (pendentes.length > 0) {
      return { error: 'Checklist incompleta', itens_em_falta: pendentes.map(p => p.titulo) }
    }
    return null
  },
})

// ── Listagem dos documentos persistidos do imóvel ───────────
router.get('/imoveis/:id/documentos-persistidos', async (req, res) => {
  try { res.json(await listDocumentos(req.params.id)) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Regenerar (cria nova versão e persiste) ─────────────────
router.post('/imoveis/:id/documentos/:tipo/regenerar', async (req, res) => {
  try {
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })
    let analise = null
    try { const { rows: [a] } = await pool.query('SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1', [imovel.id]); analise = a } catch {}
    const out = await persistDocumento(imovel, req.params.tipo, { trigger: 'manual:regenerar', generatedBy: req.user?.email || 'manual', analise })
    if (!out) return res.status(400).json({ error: 'Tipo inválido' })
    res.json(out)
  } catch (e) {
    console.error(`[regenerar ${req.params.tipo} imovel=${req.params.id}] FALHOU:`, e.message, '\n', e.stack)
    res.status(500).json({ error: e.message })
  }
})

// ── Lookups (dropdowns dinâmicos) ───────────────────────────
router.get('/lookups/:categoria', async (req, res) => {
  try {
    const r = await pool.query('SELECT valor, ordem FROM lookups WHERE categoria = $1 AND ativo = true ORDER BY ordem, valor', [req.params.categoria])
    res.json(r.rows.map(x => x.valor))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/lookups', async (_req, res) => {
  try {
    const r = await pool.query("SELECT categoria, valor, ordem FROM lookups WHERE ativo = true ORDER BY categoria, ordem, valor")
    const out = {}
    r.rows.forEach(x => { (out[x.categoria] ||= []).push(x.valor) })
    res.json(out)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Regenera a imagem do estudo de localização se estiver desactualizada
// (gerada antes da última recolha de distâncias, ou legacy sem marca de
// geração). Preserva highlights/destaque/modo guardados. Nunca lança: em
// erro devolve o imóvel original (o relatório usa a imagem em cache).
// Só corre em produção (precisa de GOOGLE_MAPS_API_KEY + Supabase Storage).
async function refreshEstudoLocalizacaoSeNecessario(imovel) {
  try {
    if (!imovel?.localizacao_imagem) return imovel
    if (!process.env.GOOGLE_MAPS_API_KEY || !supabaseStorage) return imovel
    const p = imovel.pois_distancias || {}
    const genMs = p.imagem_gerada_em ? new Date(p.imagem_gerada_em).getTime() : 0
    const poisMs = imovel.pois_atualizado_em ? new Date(imovel.pois_atualizado_em).getTime() : 0
    // Desactualizada: sem marca (legacy) ou dados de POIs mudaram >1s depois da imagem.
    const stale = !genMs || (poisMs - genMs > 1000)
    if (!stale) return imovel
    await runEstudoLocalizacao({
      pool,
      supabaseStorage,
      imovelId: imovel.id,
      destinos: undefined,                                  // usa os guardados em pois_distancias
      mode: p.mode || 'driving',
      highlights: Array.isArray(p.highlights) ? p.highlights : [],
      destaque: p.destaque || null,
      origem: p.origem || imovel.morada || null,
    })
    const fresco = await Imoveis.getById(imovel.id)
    return fresco || imovel
  } catch (e) {
    console.error(`[estudo-refresh imovel=${imovel?.id}] falhou, usa imagem em cache:`, e.message)
    return imovel
  }
}

// ── Documento PDF por fase do imóvel ─────────────────────────
//
// Estratégia: se já existe pdf_path persistido, redireccionar para a URL
// Supabase (instantaneo). Só gera o PDF quando ainda não existe, evitando
// que o request hang em Render para imoveis com imagens grandes (ex.
// localizacao SVG rasterizada → PNG ~5MB → PDF ~6MB → upload demora >100s
// na infra de Render → timeout 502 ao cliente).
//
// Para forçar regeneração, usar POST /imoveis/:id/documentos/:tipo/regenerar.
router.get('/imoveis/:id/documento/:tipo', async (req, res) => {
  try {
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    // ?refresh=1 (ou refresh=true) força regeneração mesmo que exista PDF em cache.
    const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase())

    // Análise activa — necessária para gerar e para detectar desactualização.
    let analise = null
    try {
      const { rows: [a] } = await pool.query('SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1', [imovel.id])
      analise = a
    } catch {}

    // Regenerar a imagem do estudo se desactualizada (só docs que a embutem).
    let im = imovel
    if (docEmbedeLocalizacao(req.params.tipo)) im = await refreshEstudoLocalizacaoSeNecessario(imovel)

    // Servir PDF em cache APENAS se ainda reflecte os dados actuais. Regenera
    // quando o imóvel ou a análise mudaram depois da última geração.
    if (!refresh) {
      try {
        const { rows: [doc] } = await pool.query(
          `SELECT pdf_path, generated_at, frozen FROM documentos_imovel
             WHERE imovel_id = $1 AND tipo = $2
             ORDER BY frozen DESC, version DESC LIMIT 1`,
          [im.id, req.params.tipo]
        )
        if (doc?.pdf_path && /^https?:\/\//i.test(doc.pdf_path)) {
          const genMs = doc.generated_at ? new Date(doc.generated_at).getTime() : 0
          const upImovel = im.updated_at ? new Date(im.updated_at).getTime() : 0
          const upAnalise = analise?.updated_at ? new Date(analise.updated_at).getTime() : 0
          // Frozen = snapshot imutável (intencional). Vivo = só se ainda fresco.
          const fresco = doc.frozen || genMs >= Math.max(upImovel, upAnalise)
          if (fresco) return res.redirect(302, doc.pdf_path)
          // senão: dados mudaram desde a geração → cai para regeneração
        }
      } catch (e) { /* cai para geracao */ }
    }

    const out = await persistDocumento(im, req.params.tipo, {
      trigger: refresh ? 'view:refresh' : 'view:auto',
      generatedBy: req.user?.email || 'system',
      analise,
    })
    if (!out) return res.status(400).json({ error: 'Tipo de documento inválido' })

    const nome = (imovel.nome || 'doc').replace(/[^a-zA-Z0-9À-ú ]/g, '').replace(/\s+/g, '_')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', pdfDisposition(req, `${req.params.tipo}_${nome}.pdf`))
    res.end(out.buffer)
  } catch (e) {
    console.error(`[documento ${req.params.tipo} imovel=${req.params.id}] FALHOU:`, e.message, '\n', e.stack)
    res.status(500).json({ error: e.message })
  }
})

// ── Relatório PDF do imóvel ──────────────────────────────────
// ── Re-sincronização global: análise activa → campos derivados do imóvel ──
// Usado pelo botão "Atualizar" da Dashboard para garantir que ROI, ROI
// anualizado, VVR e custo de obra dos imóveis reflectem a análise activa
// (mesma fonte da calculadora). Só toca nas linhas dessincronizadas (o
// IS DISTINCT FROM evita bumps de updated_at desnecessários).
router.post('/sync-derivados', async (_req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE imoveis i SET
         roi = COALESCE(a.retorno_total, 0),
         roi_anualizado = COALESCE(a.retorno_anualizado, 0),
         valor_venda_remodelado = COALESCE(a.vvr, 0),
         custo_estimado_obra = COALESCE(a.obra_com_iva, 0),
         updated_at = $1
       FROM analises a
       WHERE a.imovel_id = i.id AND a.activa = true
         AND (i.roi IS DISTINCT FROM COALESCE(a.retorno_total, 0)
           OR i.roi_anualizado IS DISTINCT FROM COALESCE(a.retorno_anualizado, 0)
           OR i.valor_venda_remodelado IS DISTINCT FROM COALESCE(a.vvr, 0)
           OR i.custo_estimado_obra IS DISTINCT FROM COALESCE(a.obra_com_iva, 0))`,
      [new Date().toISOString()]
    )
    res.json({ ok: true, sincronizados: rowCount })
  } catch (e) {
    console.error('[sync-derivados]', e.message)
    res.status(500).json({ error: e.message })
  }
})

router.get('/imoveis/:id/relatorio', async (req, res) => {
  try {
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    // Buscar análise ativa se existir
    const { rows: [analise] } = await pool.query(
      'SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1', [imovel.id]
    ).catch(() => ({ rows: [] }))

    const nome = (imovel.nome || 'imovel').replace(/[^a-zA-Z0-9À-ú ]/g, '').replace(/\s+/g, '_')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', pdfDisposition(req, `Relatorio_${nome}.pdf`))

    const doc = generateImovelPDF(imovel, analise || null)
    streamPdfToResAndPersist(doc, res, {
      storagePath: `imoveis/${imovel.id}/relatorio.pdf`,
      localPath: path.join(REPO_ROOT, 'Relatorios', 'Imoveis', `${imovel.id}_relatorio.pdf`),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Relatório compilado para investidor ──────────────────────
router.get('/imoveis/:id/relatorio-investidor', async (req, res) => {
  try {
    let imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })
    const { rows: [analise] } = await pool.query(
      'SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1', [imovel.id]
    ).catch(() => ({ rows: [] }))

    // Garante que o estudo de localização embutido reflecte os dados actuais.
    imovel = await refreshEstudoLocalizacaoSeNecessario(imovel)

    const seccoes = (req.query.seccoes || 'investimento,comparaveis,caep,stress_tests').split(',').filter(Boolean)
    const { generateCompiledReport } = await import('./pdfImovelDocs.js')
    const nome = (imovel.nome || 'imovel').replace(/[^a-zA-Z0-9À-ú ]/g, '').replace(/\s+/g, '_')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', pdfDisposition(req, `Dossier_Investimento_${nome}.pdf`))
    const doc = await generateCompiledReport(imovel, analise || null, seccoes)
    streamPdfToResAndPersist(doc, res, {
      storagePath: `imoveis/${imovel.id}/dossier_investimento.pdf`,
      localPath: path.join(REPO_ROOT, 'Relatorios', 'Imoveis', `${imovel.id}_dossier_investimento.pdf`),
    })
  } catch (e) {
    console.error(`[relatorio-investidor imovel=${req.params.id}] FALHOU:`, e.message, '\n', e.stack)
    res.status(500).json({ error: e.message })
  }
})

// Concede ao user ligado a um investidor acesso (tabela `acessos`) a todos os
// negocios em que esse investidor participa — via projeto_investidores, a
// unica fonte real da ligacao (negocios.investidor_ids e legado, nunca
// escrito pela app). Idempotente. Sem user_id ligado, nao faz nada.
async function syncInvestidorAcessos(investidorId) {
  const { rows: [inv] } = await pool.query('SELECT user_id FROM investidores WHERE id = $1', [investidorId])
  if (!inv?.user_id) return 0
  const { rows: negocios } = await pool.query(
    `SELECT DISTINCT n.id FROM negocios n
     JOIN projeto_investidores pi ON pi.negocio_id = n.id AND pi.investidor_id = $1
     WHERE n.deleted_at IS NULL`,
    [investidorId]
  )
  for (const n of negocios) {
    await pool.query(
      `INSERT INTO acessos (id, user_id, entidade, entidade_id, granted_by)
       VALUES ($1, $2, 'negocio', $3, 'auto:investidor')
       ON CONFLICT (user_id, entidade, entidade_id) DO NOTHING`,
      [randomUUID(), inv.user_id, n.id]
    )
  }
  return negocios.length
}

crudRoutes('/investidores', Investidores, {
  onCreate: async (item) => {
    if (driveConfigured()) {
      await createInvestidorFolder(item.id, item.nome || 'Sem nome')
    }
  },
  onUpdate: async (item, body) => {
    // Ao ligar um investidor a um utilizador, dar-lhe logo acesso aos projectos.
    if (body?.user_id) await syncInvestidorAcessos(item.id)
  },
})

// ── Documentos enviados a investidores (historico) ──────────
router.get('/investidores/:id/documentos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, i.nome as imovel_nome
       FROM documentos_investidor d
       LEFT JOIN imoveis i ON i.id = d.imovel_id
       WHERE d.investidor_id = $1
       ORDER BY d.created_at DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

const INVESTIDORES_DOCS_BUCKET = 'Investidores'

// Documento real do investidor: Supabase Storage (fonte primária) + espelho
// no Drive na pasta do investidor (best-effort, não bloqueia a resposta) —
// mesmo padrão de POST /imoveis/:id/fotos. Antes disto, este endpoint só
// registava tipo/nome/nota sem nenhum ficheiro real por trás.
router.post('/investidores/:id/documentos', uploadRateLimit, uploadDocs.single('file'), async (req, res) => {
  try {
    const { tipo, nome, imovel_id, notas } = req.body
    if (!tipo || !nome) return res.status(400).json({ error: 'tipo e nome são obrigatórios' })
    const id = randomUUID()
    const now = new Date().toISOString()

    let storagePath = null
    let driveFileId = null
    if (req.file) {
      if (!supabaseStorage) return res.status(503).json({ error: 'Storage indisponível (sem SUPABASE_SERVICE_KEY)' })
      try {
        const { data: buckets } = await supabaseStorage.storage.listBuckets()
        if (!(buckets || []).some(b => b.name === INVESTIDORES_DOCS_BUCKET)) {
          await supabaseStorage.storage.createBucket(INVESTIDORES_DOCS_BUCKET, { public: false })
        }
      } catch { /* segue; o upload devolve erro claro se faltar */ }

      const safe = req.file.originalname.replace(/[^\w.\- ]+/g, '_')
      storagePath = `${req.params.id}/${id}_${safe}`
      const { error: upErr } = await supabaseStorage.storage
        .from(INVESTIDORES_DOCS_BUCKET)
        .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true })
      if (upErr) return res.status(500).json({ error: `Upload falhou: ${upErr.message}` })

      if (driveConfigured()) {
        uploadDocumentoInvestidor(req.params.id, req.file.buffer, req.file.originalname, req.file.mimetype)
          .then(fileId => {
            if (fileId) pool.query('UPDATE documentos_investidor SET drive_file_id = $1 WHERE id = $2', [fileId, id]).catch(() => {})
          })
          .catch(e => console.error('[drive] espelho documento investidor:', e.message))
      }
    }

    await pool.query(
      `INSERT INTO documentos_investidor (id, investidor_id, imovel_id, tipo, nome, notas, storage_path, drive_file_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, req.params.id, imovel_id || null, tipo, nome, notas || null, storagePath, driveFileId, now]
    )
    res.status(201).json({ id, investidor_id: req.params.id, imovel_id, tipo, nome, notas, storage_path: storagePath, created_at: now })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Serve o ficheiro real do documento (Storage, com URL assinada de curta duração).
router.get('/investidores/:id/documentos/:docId/ficheiro', async (req, res) => {
  try {
    const { rows: [doc] } = await pool.query(
      'SELECT storage_path, nome FROM documentos_investidor WHERE id = $1 AND investidor_id = $2',
      [req.params.docId, req.params.id]
    )
    if (!doc) return res.status(404).json({ error: 'Não encontrado' })
    if (!doc.storage_path) return res.status(404).json({ error: 'Este registo não tem ficheiro anexado' })
    if (!supabaseStorage) return res.status(503).json({ error: 'Storage indisponível' })
    const { data, error } = await supabaseStorage.storage
      .from(INVESTIDORES_DOCS_BUCKET)
      .createSignedUrl(doc.storage_path, 300)
    if (error || !data?.signedUrl) return res.status(500).json({ error: error?.message || 'Falha ao gerar link' })
    res.redirect(data.signedUrl)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/investidores/:id/documentos/:docId', async (req, res) => {
  try {
    const { rows: [doc] } = await pool.query(
      'SELECT storage_path FROM documentos_investidor WHERE id = $1 AND investidor_id = $2',
      [req.params.docId, req.params.id]
    )
    const { rowCount } = await pool.query(
      'DELETE FROM documentos_investidor WHERE id = $1 AND investidor_id = $2',
      [req.params.docId, req.params.id]
    )
    if (rowCount === 0) return res.status(404).json({ error: 'Não encontrado' })
    if (doc?.storage_path && supabaseStorage) {
      await supabaseStorage.storage.from(INVESTIDORES_DOCS_BUCKET).remove([doc.storage_path]).catch(() => {})
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Endpoints específicos de consultores (ANTES do crudRoutes para evitar conflito com :id) ─

// Find-or-create consultor (dedup por nome/contacto)
router.post('/consultores/find-or-create', async (req, res) => {
  try {
    const { nome, imobiliaria, contacto, email, regiao } = req.body
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' })

    // 1. Match por contacto (telefone exacto)
    if (contacto?.trim()) {
      const { rows } = await pool.query(
        'SELECT * FROM consultores WHERE contacto = $1 LIMIT 1', [contacto.trim()]
      )
      if (rows[0]) return res.json({ ...rows[0], _matched: 'contacto' })
    }

    // 2. Match por nome exacto (case-insensitive)
    const { rows: byName } = await pool.query(
      'SELECT * FROM consultores WHERE LOWER(nome) = LOWER($1) LIMIT 1', [nome.trim()]
    )
    if (byName[0]) return res.json({ ...byName[0], _matched: 'nome' })

    // 3. Criar novo — regiao vem do form (imóvel de origem) ou do header X-Regiao;
    // sem isto o consultor ficava sem regiao e invisível nos lookups regionais.
    const regiaoActiva = regiao || req.regiaoActiva || null
    const item = await Consultores.create({
      nome: nome.trim(),
      estatuto: 'Cold Call',
      estado_avaliacao: 'Em avaliação',
      imobiliaria: imobiliaria || null,
      contacto: contacto || null,
      email: email || null,
      regiao: regiaoActiva,
    }, { regiaoActiva })
    res.status(201).json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Lista enriquecida de consultores (com métricas e alertas inline)
// Lista única de valores já usados em `imobiliaria` e `zonas` dos consultores —
// alimenta autocomplete do ChipsEditor para evitar reescrever sempre.
// Filtra por região quando o header X-Regiao está presente.
let _sugestoesCache = new Map()
router.get('/consultores/sugestoes-tags', async (req, res) => {
  try {
    const regiao = req.regiaoActiva || 'all'
    const cacheKey = `tags:${regiao}`
    const now = Date.now()
    const cached = _sugestoesCache.get(cacheKey)
    if (cached && now < cached.exp) return res.json(cached.data)
    const where = req.regiaoActiva ? 'WHERE regiao = $1' : ''
    const params = req.regiaoActiva ? [req.regiaoActiva] : []
    const { rows } = await pool.query(`SELECT imobiliaria, zonas FROM consultores ${where}`, params)
    const imobiliarias = new Set()
    const zonas = new Set()
    for (const r of rows) {
      try {
        const arr = typeof r.imobiliaria === 'string' ? JSON.parse(r.imobiliaria || '[]') : (r.imobiliaria || [])
        if (Array.isArray(arr)) arr.forEach(x => { const s = String(x || '').trim(); if (s) imobiliarias.add(s) })
      } catch {}
      try {
        const arr = typeof r.zonas === 'string' ? JSON.parse(r.zonas || '[]') : (r.zonas || [])
        if (Array.isArray(arr)) arr.forEach(x => { const s = String(x || '').trim(); if (s) zonas.add(s) })
      } catch {}
    }
    const data = {
      imobiliarias: [...imobiliarias].sort((a, b) => a.localeCompare(b, 'pt')),
      zonas: [...zonas].sort((a, b) => a.localeCompare(b, 'pt')),
    }
    _sugestoesCache.set(cacheKey, { data, exp: now + 60_000 })
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/consultores/enriched', async (req, res) => {
  try {
    const regiao = req.regiaoActiva
    // 4 queries em paralelo (eram sequenciais com await) — poupa ~150-300ms.
    // Filtro por região nas tabelas que têm coluna `regiao` (consultores e imoveis).
    // Interacoes/followups herdam — agregadas por consultor_id depois filtra.
    const consultoresWhere = regiao ? 'WHERE regiao = $1' : ''
    const imoveisWhere = regiao ? "WHERE nome_consultor IS NOT NULL AND regiao = $1" : "WHERE nome_consultor IS NOT NULL"
    const params = regiao ? [regiao] : []
    const [resConsultores, resImoveis, resInteracoes, resFollowupAgg] = await Promise.all([
      pool.query(`SELECT * FROM consultores ${consultoresWhere} ORDER BY score_prioridade DESC NULLS LAST, updated_at DESC`, params),
      pool.query(`SELECT nome_consultor, estado, check_qualidade, data_adicionado FROM imoveis ${imoveisWhere}`, params),
      pool.query('SELECT consultor_id, data_hora, direcao FROM consultor_interacoes ORDER BY data_hora DESC'),
      pool.query('SELECT consultor_id, MIN(data) AS primeiro_followup, MAX(data) AS ultimo_followup FROM consultor_followups GROUP BY consultor_id'),
    ])
    const consultores = resConsultores.rows
    const imoveis = resImoveis.rows
    const interacoes = resInteracoes.rows
    const followupAgg = resFollowupAgg.rows
    const followupsByConsultor = new Map(followupAgg.map(f => [f.consultor_id, f]))

    const now = Date.now()
    const enriched = consultores.map(c => {
      const meusImoveis = imoveis.filter(i => i.nome_consultor?.trim().toLowerCase() === c.nome?.trim().toLowerCase())
      // Só contam como "entregues" os que passaram de Pré-aprovação (validados)
      const imoveisEntregues = meusImoveis.filter(im => (im.estado || '').replace(/^\d+-\s*/, '').trim() !== 'Pré-aprovação')
      const totalImoveis = imoveisEntregues.length
      const totalComPreAprovacao = meusImoveis.length
      // Qualidade baseada no estado do pipeline (só entregues)
      const imoveisAvancados = imoveisEntregues.filter(im => qualidadeImovel(im.estado) >= 0.75).length

      const minhasInteracoes = interacoes.filter(i => i.consultor_id === c.id)
      const ultimaInteracao = minhasInteracoes[0]?.data_hora
      const followupAggC = followupsByConsultor.get(c.id)
      const ultimoFollowup = followupAggC?.ultimo_followup || null
      // Para "ultimo contacto" considerar tambem o follow-up mais recente quando nao ha interacoes
      const ultimoContactoCandidatos = [ultimaInteracao, ultimoFollowup, c.data_follow_up].filter(Boolean)
      const ultimoContacto = ultimoContactoCandidatos.length
        ? ultimoContactoCandidatos.reduce((max, d) => (new Date(d) > new Date(max) ? d : max))
        : null
      const diasSemContacto = ultimoContacto ? Math.floor((now - new Date(ultimoContacto)) / 86400000) : null
      const temContacto = minhasInteracoes.length > 0 || !!c.data_primeira_call || !!followupAggC

      const ultimoImovel = [...meusImoveis].sort((a, b) => (b.data_adicionado || '').localeCompare(a.data_adicionado || ''))[0]
      const dataUltimoImovel = ultimoImovel?.data_adicionado

      const horasCriado = (now - new Date(c.created_at)) / 3600000
      let alertStatus = null
      // Verde: tem imóvel avançado (negociação+, wholesaling, etc.) nos últimos 30 dias
      const avancadoRecente = meusImoveis.some(i =>
        qualidadeImovel(i.estado) >= 0.75 && i.data_adicionado && (now - new Date(i.data_adicionado)) / 86400000 <= 30
      )
      if (avancadoRecente) {
        alertStatus = 'green'
      } else if (horasCriado > 48 && !temContacto) {
        alertStatus = 'red'
      } else if (diasSemContacto > 15) {
        const imovelDepoisContacto = dataUltimoImovel && ultimoContacto && new Date(dataUltimoImovel) > new Date(ultimoContacto)
        if (!imovelDepoisContacto) alertStatus = 'orange'
      }

      const imobs = (() => { try { return JSON.parse(c.imobiliaria || '[]') } catch { return [] } })()

      return {
        ...c,
        _totalImoveis: totalImoveis,
        _imoveisAvancados: imoveisAvancados,
        _diasSemContacto: diasSemContacto,
        _alertStatus: alertStatus,
        _agencia: imobs.join(', ') || '—',
      }
    })

    res.json({ data: enriched, total: enriched.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Middleware ANTES do crudRoutes regista um listener no res.finish para
// invalidar a cache do lookup quando uma mutação em /consultores tem sucesso.
// Cobre POST, PUT, PATCH e DELETE — incluindo DELETE que não passa pelo hook
// onCreate/onUpdate do factory.
router.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.path.startsWith('/consultores')) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) lookupCacheInvalidate('consultores')
    })
  }
  next()
})
crudRoutes('/consultores', Consultores)

// ── Negocios: auto-criar fases conforme template da categoria ──
// Suporta: Fix and Flip, CAEP, Wholesalling, Mediação Imobiliária
async function criarFasesProjecto(negocioId, categoria) {
  const template = getTemplateFases(categoria)
  if (!template) return  // categoria sem workflow

  const { rows: existentes } = await pool.query(
    'SELECT id FROM projeto_fases WHERE negocio_id = $1 LIMIT 1',
    [negocioId]
  )
  if (existentes.length > 0) return  // idempotente

  // Auto-criar uma "Fração Única" se o projecto é fracao_unica (modelo simples)
  // Para projectos 'predio', as frações são criadas manualmente pelo user
  const { rows: negRows } = await pool.query('SELECT tipo_projeto FROM negocios WHERE id = $1', [negocioId])
  const tipoProjeto = negRows[0]?.tipo_projeto || 'fracao_unica'

  let fracaoId = null
  if (tipoProjeto === 'fracao_unica') {
    // Reutilizar fração existente: o INSERT ... DO NOTHING não devolve nada
    // quando há conflito, deixando-nos com um UUID órfão que rebenta a FK de
    // projeto_fases. Procurar primeiro, inserir só se faltar.
    const { rows: existeFrac } = await pool.query(
      `SELECT id FROM projeto_fracoes WHERE negocio_id = $1 AND nome = $2 LIMIT 1`,
      [negocioId, 'Fração Única']
    )
    if (existeFrac.length > 0) {
      fracaoId = existeFrac[0].id
    } else {
      fracaoId = randomUUID()
      await pool.query(
        `INSERT INTO projeto_fracoes (id, negocio_id, nome, tipo, ordem)
         VALUES ($1, $2, $3, 'fracao', 0)`,
        [fracaoId, negocioId, 'Fração Única']
      )
    }
  }

  for (let i = 0; i < template.length; i++) {
    const fase = template[i]
    const faseId = randomUUID()
    await pool.query(
      `INSERT INTO projeto_fases (id, negocio_id, fracao_id, fase_key, nome, ordem, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [faseId, negocioId, fracaoId, fase.key, fase.nome, i, i === 0 ? 'em_curso' : 'pendente']
    )
    for (let j = 0; j < fase.tarefas.length; j++) {
      await pool.query(
        `INSERT INTO projeto_tarefas (id, fase_id, descricao, ordem) VALUES ($1, $2, $3, $4)`,
        [randomUUID(), faseId, fase.tarefas[j], j]
      )
    }
  }
}

// Alias para compatibilidade com chamadas existentes
const criarFasesFixFlip = (negocioId) => criarFasesProjecto(negocioId, 'Fix and Flip')

// Wholesaling: lucro esperado = fee de cedência da ficha do imóvel (imoveis.fee_cedencia).
// Persistido em negocios.lucro_estimado para os KPIs do portfolio (SUM) e Projetos reflectirem.
async function recomputeLucroWholesaling(negocioId) {
  const { rows } = await pool.query(
    `SELECT im.fee_cedencia
       FROM negocios n
       LEFT JOIN imoveis im ON im.id = n.imovel_id
      WHERE n.id = $1 AND n.categoria = 'Wholesalling'`,
    [negocioId],
  )
  if (!rows[0]) return
  const fee = Number(rows[0].fee_cedencia)
  // Só sobrescreve o lucro quando há um fee positivo. Com fee ausente/0 não zera —
  // protege negócios cujo lucro vem das tranches (pagamentos_faseados).
  if (!Number.isFinite(fee) || fee <= 0) return
  await pool.query(
    `UPDATE negocios SET lucro_estimado = $1, updated_at = NOW()::TEXT WHERE id = $2`,
    [fee, negocioId],
  )
}

async function recomputeLucroWholesalingPorImovel(imovelId) {
  const { rows } = await pool.query(
    `SELECT id FROM negocios WHERE imovel_id = $1 AND categoria = 'Wholesalling'`,
    [imovelId],
  )
  for (const r of rows) {
    await recomputeLucroWholesaling(r.id).catch(e => console.error('[wholesaling/recompute]', e.message))
  }
}

// Re-run calcAnalise para a analise activa do imovel: compra = valor_proposta e,
// no Wholesaling, injecta o fee de cedência da ficha (somado à compra no calcEngine).
// Disparado quando o utilizador altera valor_proposta, fee_cedencia ou modelo_negocio.
async function recalcAnaliseActivaCompra(imovelId) {
  const { rows: [imovel] } = await pool.query(
    'SELECT modelo_negocio, valor_proposta, fee_cedencia FROM imoveis WHERE id = $1',
    [imovelId],
  )
  if (!imovel) return
  const compra = Number(imovel.valor_proposta)
  if (!Number.isFinite(compra) || compra <= 0) return

  const { rows: [analise] } = await pool.query(
    'SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1',
    [imovelId],
  )
  if (!analise) return

  const feeCedencia = isWholesaling(imovel)
    ? (Number.isFinite(Number(imovel.fee_cedencia)) ? Number(imovel.fee_cedencia) : (analise.fee_cedencia ?? null))
    : null
  const inputs = { ...analise, compra, fee_cedencia: feeCedencia }
  const calculados = calcAnalise(inputs)
  const stress = calcStressTests(inputs)
  const now = new Date().toISOString()
  const updates = { compra, fee_cedencia: feeCedencia, ...calculados, stress_tests: JSON.stringify(stress), updated_at: now }

  const entries = Object.entries(updates)
  const sets = entries.map(([k], i) => `${k} = $${i + 1}`)
  const params = entries.map(([, v]) => typeof v === 'object' && v !== null ? JSON.stringify(v) : v)
  params.push(analise.id)
  await pool.query(`UPDATE analises SET ${sets.join(', ')} WHERE id = $${params.length}`, params)

  await pool.query(
    `UPDATE imoveis SET roi = $1, roi_anualizado = $2, updated_at = $3 WHERE id = $4`,
    [calculados.retorno_total ?? null, calculados.retorno_anualizado ?? null, now, imovelId],
  )

  // Propagar para negocios.lucro_estimado (todas as categorias, não só
  // Wholesalling) usando a mesma lógica já usada quando a análise é gravada
  // pela calculadora — importação dinâmica para evitar ciclo de import
  // estático com analiseRoutes.js (que importa uploadImovel/supabaseStorage
  // deste ficheiro ao nível do módulo).
  const { propagarParaImovel } = await import('./analiseRoutes.js')
  await propagarParaImovel(imovelId, calculados, inputs).catch(e => console.error('[analise/recalc propagar]', e.message))
}

// UX12 — Soft delete (lixeira): marcar deleted_at em vez de apagar.
// IMPORTANTE: registar ANTES de crudRoutes('/negocios'), senão o DELETE genérico
// do crud (hard delete) apanha o pedido primeiro e rebenta com violação de FK
// (fases, tarefas, fotos, frações referenciam o negócio).
router.delete('/negocios/:id', async (req, res) => {
  try {
    const hard = req.query.hard === '1'
    if (hard) {
      const { rows } = await pool.query('DELETE FROM negocios WHERE id = $1 RETURNING id', [req.params.id])
      if (!rows.length) return res.status(404).json({ error: 'Não encontrado' })
      return res.json({ ok: true, hard: true })
    }
    const { rows } = await pool.query(
      `UPDATE negocios SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Não encontrado ou já apagado' })
    res.json({ ok: true, soft_deleted: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

crudRoutes('/negocios', Negocios, {
  onCreate: async (item) => {
    if (FASES_POR_CATEGORIA[item.categoria]) {
      await criarFasesProjecto(item.id, item.categoria).catch(e => console.error('[fases] auto-criar:', e.message))
    }
    if (item.categoria === 'Wholesalling') {
      await recomputeLucroWholesaling(item.id).catch(e => console.error('[wholesaling/recompute]', e.message))
    }
  },
  onUpdate: async (item, body) => {
    // Se categoria suporta template, criar fases (idempotente)
    if (FASES_POR_CATEGORIA[body.categoria]) {
      await criarFasesProjecto(item.id, body.categoria).catch(e => console.error('[fases] auto-criar update:', e.message))
    }
    if (item.categoria === 'Wholesalling' || body.categoria === 'Wholesalling') {
      await recomputeLucroWholesaling(item.id).catch(e => console.error('[wholesaling/recompute]', e.message))
    }
  },
})

// Recovery: criar fases para negócios cuja categoria tem template mas ficaram sem fases
// (ex: mudança de categoria que falhou silenciosamente por causa do bug antigo do fracaoId).
router.post('/negocios/recover-fases', async (req, res) => {
  try {
    const categorias = Object.keys(FASES_POR_CATEGORIA)
    const { rows } = await pool.query(
      `SELECT n.id, n.movimento, n.categoria
         FROM negocios n
         LEFT JOIN projeto_fases f ON f.negocio_id = n.id
        WHERE n.categoria = ANY($1)
          AND n.deleted_at IS NULL
          AND f.id IS NULL`,
      [categorias]
    )
    const resultados = []
    for (const n of rows) {
      try {
        await criarFasesProjecto(n.id, n.categoria)
        resultados.push({ id: n.id, movimento: n.movimento, categoria: n.categoria, ok: true })
      } catch (e) {
        resultados.push({ id: n.id, movimento: n.movimento, categoria: n.categoria, ok: false, error: e.message })
      }
    }
    res.json({ total: rows.length, criados: resultados.filter(r => r.ok).length, resultados })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Restaurar projecto da lixeira
router.post('/negocios/:id/restaurar', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE negocios SET deleted_at = NULL WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Não encontrado' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Lista lixeira
router.get('/negocios-lixeira', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM negocios WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100`
    )
    res.json({ data: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Confirmar pagamento de tranche ──────────────────────────
router.put('/negocios/:id/confirmar-pagamento', async (req, res) => {
  try {
    const { trancheIndex } = req.body
    if (trancheIndex == null) return res.status(400).json({ error: 'trancheIndex obrigatório' })

    const { rows } = await pool.query('SELECT * FROM negocios WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Negócio não encontrado' })
    const neg = rows[0]

    let pags = []
    try { pags = typeof neg.pagamentos_faseados === 'string' ? JSON.parse(neg.pagamentos_faseados || '[]') : (neg.pagamentos_faseados || []) } catch { pags = [] }
    if (trancheIndex < 0 || trancheIndex >= pags.length) return res.status(400).json({ error: 'Índice de tranche inválido' })

    pags[trancheIndex].recebido = true

    const totalRecebido = pags.filter(p => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
    const todasRecebidas = pags.every(p => p.recebido)
    const updates = {
      pagamentos_faseados: JSON.stringify(pags),
      lucro_real: Math.round(totalRecebido * 100) / 100,
    }
    if (todasRecebidas) {
      updates.pagamento_em_falta = 0
    }

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ')
    const values = Object.values(updates)
    await pool.query(`UPDATE negocios SET ${setClauses}, updated_at = NOW() WHERE id = $1`, [req.params.id, ...values])

    syncToNotion('negocios', req.params.id).catch(e => console.error('[sync] confirmar-pagamento:', e.message))
    res.json({ ok: true, todasRecebidas, pagamentos: pags })
  } catch (e) {
    console.error('[confirmar-pagamento]', e.message)
    res.status(500).json({ error: e.message })
  }
})

crudRoutes('/despesas', Despesas)

// Contagem rápida de tarefas atrasadas — usado pelo badge da Sidebar. Evita
// puxar ?limit=200 só para contar quantas estão em "Atrasada". Cache 30s.
// IMPORTANTE: registar ANTES de crudRoutes('/tarefas') senão o router.get
// /tarefas/:id apanha "count-atrasadas" como id e devolve 404.
let _countAtrasadasCache = { exp: 0, n: 0 }
router.get('/tarefas/count-atrasadas', async (_req, res) => {
  try {
    const now = Date.now()
    if (now < _countAtrasadasCache.exp) return res.json({ atrasadas: _countAtrasadasCache.n })
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM tarefas WHERE status = 'Atrasada'`)
    const n = rows[0]?.n ?? 0
    _countAtrasadasCache = { exp: now + 30_000, n }
    res.json({ atrasadas: n })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

crudRoutes('/tarefas', Tarefas)
crudRoutes('/consultor-interacoes', ConsultorInteracoes)
crudRoutes('/investidor-interacoes', InvestidorInteracoes)
crudRoutes('/empreiteiros', Empreiteiros)

// ── Visitas — CRUD com sync de imoveis.data_visita ───────────
// Cada mutacao (create/update/delete) re-sincroniza o campo derivado
// imoveis.data_visita = MAX(data_hora) WHERE estado='realizada' AND <= NOW().
router.get('/visitas', async (req, res) => {
  try {
    const items = await getVisitasEnriquecidas({ imovelId: req.query.imovel_id })
    res.json(items)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/imoveis/:id/visitas', async (req, res) => {
  try {
    const items = await getVisitasEnriquecidas({ imovelId: req.params.id })
    res.json(items)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/visitas', async (req, res) => {
  try {
    const item = await Visitas.create(req.body)
    await syncDataVisitaDerivada(item.imovel_id)
    res.status(201).json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

router.put('/visitas/:id', async (req, res) => {
  try {
    const item = await Visitas.update(req.params.id, req.body)
    if (!item) return res.status(404).json({ error: 'Não encontrado' })
    await syncDataVisitaDerivada(item.imovel_id)
    res.json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

router.delete('/visitas/:id', async (req, res) => {
  try {
    const existing = await Visitas.getById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Não encontrado' })
    await Visitas.delete(req.params.id)
    await syncDataVisitaDerivada(existing.imovel_id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Histórico de follow-ups por consultor ───────────────────
router.get('/consultores/:id/followups', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM consultor_followups WHERE consultor_id = $1 ORDER BY data DESC, created_at DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Extraído para ser reutilizável por PATCH /gravacoes/:id/registo (follow-up
// automático por desfecho de chamada, ver C2 da auditoria) e por
// autoFillConsultor (meetingAnalysis.js) — ambos devem criar uma entrada real
// em consultor_followups, nunca escrever os campos legados directamente.
export async function criarFollowUpConsultor(consultorId, { data, motivo, proximo_follow_up, imovel_id }) {
  if (!data) throw new Error('Data do follow-up é obrigatória')

  const item = await ConsultorFollowups.create({
    consultor_id: consultorId,
    imovel_id: imovel_id || null,
    data,
    motivo: motivo || null,
    proximo_follow_up: proximo_follow_up || null,
  })

  // Sincronizar campos legados no consultor com a entrada mais recente
  const { rows } = await pool.query(
    `SELECT data, motivo, proximo_follow_up FROM consultor_followups
     WHERE consultor_id = $1 ORDER BY data DESC, created_at DESC LIMIT 1`,
    [consultorId]
  )
  if (rows[0]) {
    await Consultores.update(consultorId, {
      data_follow_up: rows[0].data,
      motivo_follow_up: rows[0].motivo,
      data_proximo_follow_up: rows[0].proximo_follow_up,
    })
  }

  // Auto-preencher data_primeira_call com o follow-up mais antigo (apenas se vazio)
  const { rows: cur } = await pool.query(
    `SELECT data_primeira_call FROM consultores WHERE id = $1`,
    [consultorId]
  )
  if (cur[0] && (cur[0].data_primeira_call == null || cur[0].data_primeira_call === '')) {
    const { rows: oldest } = await pool.query(
      `SELECT data FROM consultor_followups
       WHERE consultor_id = $1 ORDER BY data ASC, created_at ASC LIMIT 1`,
      [consultorId]
    )
    if (oldest[0]?.data) {
      await Consultores.update(consultorId, { data_primeira_call: oldest[0].data })
    }
  }

  return item
}

router.post('/consultores/:id/followups', async (req, res) => {
  try {
    const item = await criarFollowUpConsultor(req.params.id, req.body)
    res.status(201).json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

router.delete('/consultores/:id/followups/:followupId', async (req, res) => {
  try {
    const ok = await ConsultorFollowups.delete(req.params.followupId)
    if (!ok) return res.status(404).json({ error: 'Follow-up não encontrado' })

    // Re-sincronizar campos legados com a entrada mais recente que sobrou
    const { rows } = await pool.query(
      `SELECT data, motivo, proximo_follow_up FROM consultor_followups
       WHERE consultor_id = $1 ORDER BY data DESC, created_at DESC LIMIT 1`,
      [req.params.id]
    )
    await Consultores.update(req.params.id, {
      data_follow_up: rows[0]?.data || null,
      motivo_follow_up: rows[0]?.motivo || null,
      data_proximo_follow_up: rows[0]?.proximo_follow_up || null,
    })

    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Gravacoes de chamadas (audio → transcricao Whisper → analise IA) ──────────
const GRAVACOES_BUCKET = 'Gravacoes'

// SOP 2: tipo de chamada + campos manuais estruturados por tipo. O registo
// manual e SEMPRE a fonte de verdade (nunca escrito pela IA directamente —
// so o utilizador, via 'Aceitar sugestao', o confirma).
const CC_RESULTADOS = ['atendeu', 'nao_atendeu', 'recusou', 'numero_errado']
const SIM_NAO_NP = ['sim', 'nao', 'nao_perguntado']
const CC_DISPONIBILIDADE = ['sim', 'nao_vendido_reservado']
const CC_DOCUMENTACAO = ['enviada_na_hora', 'prometida_com_prazo', 'nao_pedida']
const CL_RESULTADOS = ['aceite', 'recusa_definitiva', 'vou_pensar_com_data', 'vou_pensar_sem_data']
const DC_SCORE_FIELDS = ['dc_score_objetivo', 'dc_score_motivo_real', 'dc_score_dor_desafio', 'dc_score_impacto', 'dc_score_urgencia', 'dc_score_tentativas_anteriores']
const DC_NOTAS_FIELDS = ['dc_notas_objetivo', 'dc_notas_motivo_real', 'dc_notas_dor_desafio', 'dc_notas_impacto', 'dc_notas_urgencia', 'dc_notas_tentativas_anteriores']

function clampScore(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(2, Math.round(n)))
}
function toBool(v) {
  if (v === true || v === 'true' || v === '1' || v === 1) return true
  if (v === false || v === 'false' || v === '0' || v === 0) return false
  return null
}
function toNum(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Uma chamada real cobre muitas vezes mais do que uma fase do SOP2 na mesma
// conversa (ex: cold call que passa logo a discovery) — por isso nao ha um
// "tipo" escolhido pelo utilizador. Derivamos aqui a fase mais avancada
// coberta, so para etiqueta/agrupamento; os KPIs usam antes presenca de
// campo a campo (ver GET /gravacoes/kpis), nao este valor.
function derivarTipoChamada(out) {
  if (out.cl_resultado) return 'close_call'
  if (DC_SCORE_FIELDS.some(f => out[f] !== null)) return 'discovery_call'
  if (out.cc_resultado) return 'cold_call'
  if (out.pp_compromisso_confirmado !== null || out.pp_criterios_pesquisa_enviados !== null || out.pp_negocios_fechados !== null) return 'pivot_parceria'
  return null
}

// Junta `input` (payload novo, so chaves presentes) com `current` (valores ja
// gravados na BD) e devolve o conjunto completo de colunas do registo manual,
// validado e com dc_pontuacao_total/tipo_chamada recalculados no servidor.
function sanitizeRegistoManual(input, current = {}) {
  const pick = (key) => (Object.prototype.hasOwnProperty.call(input, key) ? input[key] : current[key])
  const out = {}

  out.cc_resultado = CC_RESULTADOS.includes(pick('cc_resultado')) ? pick('cc_resultado') : null
  out.cc_aceita_negociar = SIM_NAO_NP.includes(pick('cc_aceita_negociar')) ? pick('cc_aceita_negociar') : null
  out.cc_disponibilidade = CC_DISPONIBILIDADE.includes(pick('cc_disponibilidade')) ? pick('cc_disponibilidade') : null
  out.cc_documentacao = CC_DOCUMENTACAO.includes(pick('cc_documentacao')) ? pick('cc_documentacao') : null

  for (const f of DC_SCORE_FIELDS) out[f] = clampScore(pick(f))
  for (const f of DC_NOTAS_FIELDS) out[f] = (pick(f) ?? '').toString().trim() || null
  out.dc_onus_verificado = toBool(pick('dc_onus_verificado'))
  out.dc_direito_preferencia_esclarecido = toBool(pick('dc_direito_preferencia_esclarecido'))
  const scoresPresentes = DC_SCORE_FIELDS.some(f => out[f] !== null)
  out.dc_pontuacao_total = scoresPresentes ? DC_SCORE_FIELDS.reduce((sum, f) => sum + (out[f] || 0), 0) : null

  out.cl_resultado = CL_RESULTADOS.includes(pick('cl_resultado')) ? pick('cl_resultado') : null
  out.cl_valor_ancora = toNum(pick('cl_valor_ancora'))
  out.cl_valor_contraproposta = toNum(pick('cl_valor_contraproposta'))
  out.cl_deadline = pick('cl_deadline') || null
  out.cl_formalizado_escrito_mesmo_dia = toBool(pick('cl_formalizado_escrito_mesmo_dia'))

  out.pp_compromisso_confirmado = toBool(pick('pp_compromisso_confirmado'))
  out.pp_criterios_pesquisa_enviados = toBool(pick('pp_criterios_pesquisa_enviados'))
  const ppNeg = toNum(pick('pp_negocios_fechados'))
  out.pp_negocios_fechados = ppNeg === null ? null : Math.round(ppNeg)

  out.tipo_chamada = derivarTipoChamada(out)

  return out
}

// Guiao unico do SOP 2: uma chamada real cobre muitas vezes varias fases
// seguidas na mesma conversa (ex: cold call que passa logo a discovery), por
// isso a IA avalia contra as 4 fases em conjunto e so preenche sugestao_*
// para as que reconhecer na transcricao — as outras ficam a null.
const GRAVACAO_GUIAO_SOP2 = `FASE 1 — COLD CALL (2-4 minutos): confirmar se vale a pena investir tempo e ganhar permissao para aprofundar — NAO e para "vender" nem para recolher todos os detalhes do imovel.
Guiao esperado: abertura directa sem pedir permissao (identificar-se como Somnium Properties, grupo de investidores em Coimbra, referir o imovel/zona visto no portal, dizer que ha genuino interesse em avancar rapidamente fora do processo normal de mercado); motivo da chamada numa frase; pergunta de qualificacao unica ("Estao abertos a uma proposta directa, fora do processo normal, se fizer sentido em valor?"); tratar no maximo 1 objeccao; fechar com proximo passo concreto e hora definida.
Regras de qualidade: NAO deve terminar a abertura com "tem 2 minutos?" nem usar "faz sentido?" como muleta vaga. NAO deve negociar valor nesta fase (o valor so se discute na Discovery/Close).
Objeccoes tipicas: "nao tenho pressa nenhuma", "ja tenho comprador/esta em processo", "nao vendo abaixo do anuncio", "nao trabalho com investidores" — resposta certa nunca insiste nem negoceia valor, so tenta manter a porta aberta.

FASE 2 — DISCOVERY CALL: aprofundar a situacao real do proprietario SEM pitch de venda — o foco e encontrar um problema real que a proposta resolve, nao justificar um valor.
Estrutura esperada em 3 blocos: (1) Objectivo — o que pretende fazer depois de vender, ha prazo definido; (2) Motivo Real — aprofundar a resposta superficial ("E isso permitia-lhe fazer o quê?") ate um motivo especifico; (3) Desafios/dor real — clarificacao, quantificacao ("Quanto lhe custa por mes manter o imovel assim?"), tentativas anteriores, duracao do problema, impacto actual.
Regras de conduta: regra 70/30 (o proprietario fala a maior parte do tempo); silencio depois de perguntas de quantificacao; "E depois?" como tecnica de aprofundamento; confirmar sempre no fim com recapitulacao curta + "Ha algo importante que me esteja a escapar?".
Duas verificacoes obrigatorias antes de proposta: onus/hipotecas (Certidao Permanente) e direito de preferencia (se arrendado).
Sinais de descartar: "nao tem pressa nenhuma" (repetido), "esta confortavel", "so vende por X" acima do suportavel, "nao quer investidores" mantido.
Rubrica do scorecard (0-2 por criterio): 0 = nao abordado; 1 = superficial; 2 = aprofundado com detalhe concreto e quantificado.

FASE 3 — CLOSE CALL: obter resposta definitiva — um "sim" verbal NAO e proposta aceite (reversivel ate documento assinado); "vou pensar" sem data de resposta NAO e resultado aceitavel.
Guiao esperado: recapitulacao primeiro (usando a discovery) antes de qualquer valor; apresentar a proposta com ancoragem (dizer o valor uma vez, com clareza, sem desculpar nem justificar); silencio activo depois do numero; contra-proposta com concessao condicional; pedir a decisao directamente; se nao fechar, deadline com justificacao real; formalizar aceitacao por escrito no mesmo dia.
Objeccoes tipicas: "esperava mais, o anuncio diz outro valor" (reconduzir a dor da discovery, nunca ao valor isolado); "preciso de falar com a familia/socio" (deixar proposta valida ate data definida); "vou ver com outro comprador" (criar urgencia real); "nao sei se conseguem pagar tao depressa" (prova de fundos proactiva).

FASE 4 — PIVOT PARA PARCERIA: aplica-se quando o interlocutor e um consultor/agente (nao o proprietario directo), independentemente do resultado sobre o imovel desta chamada — posiciona a Somnium como comprador de referencia para negocios off-market futuros.
Criterios a comunicar: tipologia T1-T6 ou moradias; zonas Coimbra e arredores, Vila Nova de Gaia, Porto e arredores; valor maximo 300 mil euros; estado a precisar de obras.
Criterio de sucesso: o consultor confirma EXPLICITAMENTE um compromisso de contacto futuro — resposta vaga ("mantenho-vos em mente") nao conta.`

// Prompt da analise comercial (SOP 2). Foco: optimizar os scripts comerciais
// da Somnium e sugerir o preenchimento do registo manual (nunca substitui-lo).
function buildGravacaoPrompt(consultorNome) {
  return `Es um analista comercial senior da Somnium Properties (investimento imobiliario em Coimbra, Portugal). Recebes a transcricao de uma chamada entre a nossa equipa e ${consultorNome || '(desconhecido)'}, avaliada contra o SOP 2 (Angariacao de Negocios). Uma chamada real cobre muitas vezes mais do que uma fase seguida (ex: cold call que passa logo a discovery na mesma conversa) — identifica quais das 4 fases abaixo estao realmente presentes na transcricao e avalia so essas.

${GRAVACAO_GUIAO_SOP2}

Avalia a chamada CONTRA o(s) guiao(oes) das fases que identificares, com o objectivo de OPTIMIZAR os nossos scripts e treinar a equipa. As colunas "sugestao_*" abaixo sao apenas uma SUGESTAO para o registo manual — o registo manual e sempre a fonte de verdade e so e alterado se um humano confirmar. Responde APENAS com um objecto JSON valido (sem texto antes ou depois, sem markdown), com esta estrutura exacta — preenche so os campos das fases que a transcricao realmente cobre, deixa os restantes a null:

{
  "resumo": "2-3 frases sobre o que aconteceu na chamada",
  "sentimento": "positivo" | "neutro" | "negativo",
  "classificacao": 1-5 (qualidade global da nossa execucao face ao(s) guiao(oes) aplicavel(eis)),
  "pontos_fortes": ["o que correu bem"],
  "pontos_fracos": ["onde falhamos ou perdemos o controlo da conversa"],
  "objeccoes": [{ "objeccao": "objeccao levantada", "resposta_dada": "como respondemos", "eficaz": true|false, "sugestao": "como responder melhor da proxima vez" }],
  "proximo_passo": "accao recomendada",
  "sugestao_justificacao": "1-2 frases a justificar as sugestoes abaixo e a dizer que fases identificaste na chamada",
  "sugestao_cc_resultado": "atendeu" | "nao_atendeu" | "recusou" | "numero_errado" | null,
  "sugestao_cc_aceita_negociar": "sim" | "nao" | "nao_perguntado" | null,
  "sugestao_dc_score_objetivo": 0-2 ou null, "sugestao_dc_score_motivo_real": 0-2 ou null, "sugestao_dc_score_dor_desafio": 0-2 ou null,
  "sugestao_dc_score_impacto": 0-2 ou null, "sugestao_dc_score_urgencia": 0-2 ou null, "sugestao_dc_score_tentativas_anteriores": 0-2 ou null,
  "sugestao_dc_onus_verificado": true|false|null,
  "sugestao_dc_direito_preferencia_esclarecido": true|false|null,
  "sugestao_cl_resultado": "aceite" | "recusa_definitiva" | "vou_pensar_com_data" | "vou_pensar_sem_data" | null,
  "sugestao_cl_valor_ancora": numero ou null,
  "sugestao_cl_valor_contraproposta": numero ou null,
  "sugestao_cl_deadline": "YYYY-MM-DD ou null",
  "sugestao_cl_formalizado_escrito_mesmo_dia": true|false|null,
  "sugestao_pp_compromisso_confirmado": true|false|null,
  "sugestao_pp_criterios_pesquisa_enviados": true|false|null,
  "sugestao_pp_negocios_fechados": numero ou null
}

Escreve em portugues de Portugal, directo e profissional. Se a chamada nao cobrir uma fase, deixa TODOS os campos sugestao_* dessa fase a null — nao inventes.`
}

// Corre a analise da transcricao com o Claude. Devolve o objecto parseado ou lanca.
async function analisarTranscricaoIA(transcricao, consultorNome) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY nao configurada')
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: `${buildGravacaoPrompt(consultorNome)}\n\n--- TRANSCRICAO ---\n${transcricao}` }],
  })
  const respText = response.content?.[0]?.text || '{}'
  const jsonMatch = respText.match(/\{[\s\S]*\}/)
  return JSON.parse(jsonMatch?.[0] || respText)
}

// Upload de uma gravacao de chamada para um consultor. O audio e opcional —
// uma Cold Call "nao atendeu", por exemplo, nao tem nada para gravar; nesse
// caso o registo fica em estado 'sem_audio', so com os campos manuais do SOP2.
router.post('/consultores/:id/gravacoes', uploadRateLimit, uploadAudio.single('audio'), async (req, res) => {
  try {
    const cons = await Consultores.getById(req.params.id)
    if (!cons) return res.status(404).json({ error: 'Consultor nao encontrado' })

    let storagePath = null
    let ficheiroNome = null
    if (req.file) {
      if (!supabaseStorage) return res.status(503).json({ error: 'Supabase Storage nao configurado' })
      // Garantir bucket privado (partilhado com producao no mesmo projecto Supabase).
      try {
        const { data: buckets } = await supabaseStorage.storage.listBuckets()
        if (!(buckets || []).some(b => b.name === GRAVACOES_BUCKET)) {
          await supabaseStorage.storage.createBucket(GRAVACOES_BUCKET, { public: false })
        }
      } catch { /* segue; o upload devolve erro claro se faltar */ }

      const id = randomUUID()
      const ext = (path.extname(req.file.originalname) || '.mp3').toLowerCase()
      storagePath = `${req.params.id}/${id}${ext}`
      const { error: upErr } = await supabaseStorage.storage
        .from(GRAVACOES_BUCKET)
        .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype || 'application/octet-stream', upsert: true })
      if (upErr) return res.status(500).json({ error: `Storage: ${upErr.message}` })
      ficheiroNome = req.file.originalname
    }

    const id = randomUUID()
    const now = new Date().toISOString()
    const estado = req.file ? 'pendente' : 'sem_audio'
    const registo = sanitizeRegistoManual(req.body || {})

    const { rows: [row] } = await pool.query(
      `INSERT INTO consultor_gravacoes
        (id, consultor_id, followup_id, imovel_id, titulo, data_chamada, ficheiro_path, ficheiro_nome, estado,
         tipo_chamada, registo_fonte, registo_confirmado_em, registo_confirmado_por,
         cc_disponibilidade, cc_documentacao, cc_resultado, cc_aceita_negociar,
         dc_score_objetivo, dc_score_motivo_real, dc_score_dor_desafio, dc_score_impacto, dc_score_urgencia, dc_score_tentativas_anteriores,
         dc_notas_objetivo, dc_notas_motivo_real, dc_notas_dor_desafio, dc_notas_impacto, dc_notas_urgencia, dc_notas_tentativas_anteriores,
         dc_pontuacao_total, dc_onus_verificado, dc_direito_preferencia_esclarecido,
         cl_resultado, cl_valor_ancora, cl_valor_contraproposta, cl_deadline, cl_formalizado_escrito_mesmo_dia,
         pp_compromisso_confirmado, pp_criterios_pesquisa_enviados, pp_negocios_fechados,
         created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
         $10,$11,$12,$13,
         $14,$15,$16,$17,
         $18,$19,$20,$21,$22,$23,
         $24,$25,$26,$27,$28,$29,
         $30,$31,$32,
         $33,$34,$35,$36,$37,
         $38,$39,$40,
         $41,$41)
       RETURNING *`,
      [id, req.params.id, req.body.followup_id || null, req.body.imovel_id || null,
       req.body.titulo || ficheiroNome || 'Registo de chamada', req.body.data_chamada || now, storagePath, ficheiroNome, estado,
       registo.tipo_chamada, 'manual', registo.tipo_chamada ? now : null, registo.tipo_chamada ? (req.body.registo_confirmado_por || null) : null,
       registo.cc_disponibilidade, registo.cc_documentacao, registo.cc_resultado, registo.cc_aceita_negociar,
       registo.dc_score_objetivo, registo.dc_score_motivo_real, registo.dc_score_dor_desafio, registo.dc_score_impacto, registo.dc_score_urgencia, registo.dc_score_tentativas_anteriores,
       registo.dc_notas_objetivo, registo.dc_notas_motivo_real, registo.dc_notas_dor_desafio, registo.dc_notas_impacto, registo.dc_notas_urgencia, registo.dc_notas_tentativas_anteriores,
       registo.dc_pontuacao_total, registo.dc_onus_verificado, registo.dc_direito_preferencia_esclarecido,
       registo.cl_resultado, registo.cl_valor_ancora, registo.cl_valor_contraproposta, registo.cl_deadline, registo.cl_formalizado_escrito_mesmo_dia,
       registo.pp_compromisso_confirmado, registo.pp_criterios_pesquisa_enviados, registo.pp_negocios_fechados,
       now]
    )
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Actualizar o registo manual (SOP2) de uma gravacao ja existente — criar,
// corrigir, ou "aceitar sugestao da IA" (o frontend copia analise.sugestao_*
// para o payload). Nunca mexe em analise/transcricao/estado.
router.patch('/gravacoes/:id/registo', async (req, res) => {
  try {
    const { rows: [current] } = await pool.query('SELECT * FROM consultor_gravacoes WHERE id = $1', [req.params.id])
    if (!current) return res.status(404).json({ error: 'Gravacao nao encontrada' })

    const registo = sanitizeRegistoManual(req.body || {}, current)
    const now = new Date().toISOString()
    const registoFonte = req.body?.registo_fonte === 'ia_sugestao_confirmada' ? 'ia_sugestao_confirmada' : 'manual'

    const { rows: [row] } = await pool.query(
      `UPDATE consultor_gravacoes SET
        tipo_chamada = $2, registo_fonte = $3, registo_confirmado_em = $4, registo_confirmado_por = $5,
        cc_disponibilidade = $6, cc_documentacao = $7, cc_resultado = $8, cc_aceita_negociar = $9,
        dc_score_objetivo = $10, dc_score_motivo_real = $11, dc_score_dor_desafio = $12, dc_score_impacto = $13, dc_score_urgencia = $14, dc_score_tentativas_anteriores = $15,
        dc_notas_objetivo = $16, dc_notas_motivo_real = $17, dc_notas_dor_desafio = $18, dc_notas_impacto = $19, dc_notas_urgencia = $20, dc_notas_tentativas_anteriores = $21,
        dc_pontuacao_total = $22, dc_onus_verificado = $23, dc_direito_preferencia_esclarecido = $24,
        cl_resultado = $25, cl_valor_ancora = $26, cl_valor_contraproposta = $27, cl_deadline = $28, cl_formalizado_escrito_mesmo_dia = $29,
        pp_compromisso_confirmado = $30, pp_criterios_pesquisa_enviados = $31, pp_negocios_fechados = $32,
        updated_at = $33
       WHERE id = $1 RETURNING *`,
      [req.params.id, registo.tipo_chamada, registoFonte, now, req.body?.registo_confirmado_por || null,
       registo.cc_disponibilidade, registo.cc_documentacao, registo.cc_resultado, registo.cc_aceita_negociar,
       registo.dc_score_objetivo, registo.dc_score_motivo_real, registo.dc_score_dor_desafio, registo.dc_score_impacto, registo.dc_score_urgencia, registo.dc_score_tentativas_anteriores,
       registo.dc_notas_objetivo, registo.dc_notas_motivo_real, registo.dc_notas_dor_desafio, registo.dc_notas_impacto, registo.dc_notas_urgencia, registo.dc_notas_tentativas_anteriores,
       registo.dc_pontuacao_total, registo.dc_onus_verificado, registo.dc_direito_preferencia_esclarecido,
       registo.cl_resultado, registo.cl_valor_ancora, registo.cl_valor_contraproposta, registo.cl_deadline, registo.cl_formalizado_escrito_mesmo_dia,
       registo.pp_compromisso_confirmado, registo.pp_criterios_pesquisa_enviados, registo.pp_negocios_fechados,
       now]
    )

    // Follow-up automático por desfecho de chamada (ver C2 da auditoria) —
    // valores de prazo em followupRules.js ainda pendentes de confirmação
    // com o SOP 2. Só na PRIMEIRA confirmação deste registo, para não criar
    // um follow-up novo sempre que a chamada é reeditada.
    try {
      const primeiraConfirmacao = !current.registo_confirmado_em
      const dias = primeiraConfirmacao ? diasFollowUpParaRegisto(row) : null
      if (dias != null && row.consultor_id) {
        const dataFollowUp = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)
        const desfecho = row.tipo_chamada === 'cold_call' ? row.cc_resultado : row.cl_resultado
        await criarFollowUpConsultor(row.consultor_id, {
          data: dataFollowUp,
          motivo: `[Auto] Desfecho da chamada: ${desfecho}`,
          imovel_id: row.imovel_id || null,
        })
      }
    } catch (e) { console.error('[gravacoes/registo] follow-up automático:', e.message) }

    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Lista de gravacoes de um consultor (sem o blob; com transcricao/analise).
router.get('/consultores/:id/gravacoes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM consultor_gravacoes WHERE consultor_id = $1 ORDER BY data_chamada DESC, created_at DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Worker: gravacoes a aguardar transcricao, com signed URL para descarregar o audio.
router.get('/gravacoes/pendentes', async (req, res) => {
  try {
    if (!supabaseStorage) return res.json([])
    // Inclui pendentes + gravacoes presas em a_transcrever ha >15min (worker que
    // crashou a meio): de outra forma ficariam encravadas para sempre.
    const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { rows } = await pool.query(
      `SELECT g.id, g.consultor_id, g.ficheiro_path, g.ficheiro_nome, c.nome AS consultor_nome
       FROM consultor_gravacoes g LEFT JOIN consultores c ON c.id = g.consultor_id
       WHERE g.estado = 'pendente' OR (g.estado = 'a_transcrever' AND g.updated_at < $1)
       ORDER BY g.created_at ASC LIMIT 5`,
      [staleCutoff]
    )
    const out = []
    for (const r of rows) {
      const { data: signed } = await supabaseStorage.storage
        .from(GRAVACOES_BUCKET).createSignedUrl(r.ficheiro_path, 60 * 60)
      out.push({ ...r, audio_url: signed?.signedUrl || null })
    }
    res.json(out)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Worker: marcar como em transcricao (evita corridas se houver 2 workers).
router.post('/gravacoes/:id/iniciar-transcricao', async (req, res) => {
  try {
    // Permite re-adquirir um lock obsoleto (a_transcrever ha >15min) sem roubar
    // um lock fresco de outro worker concorrente.
    const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { rows: [row] } = await pool.query(
      `UPDATE consultor_gravacoes SET estado = 'a_transcrever', updated_at = $2
       WHERE id = $1 AND (estado = 'pendente' OR (estado = 'a_transcrever' AND updated_at < $3)) RETURNING id`,
      [req.params.id, new Date().toISOString(), staleCutoff]
    )
    res.json({ ok: !!row })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Worker: gravar a transcricao e disparar a analise IA automaticamente.
router.post('/gravacoes/:id/transcricao', async (req, res) => {
  try {
    const { transcricao, duracao_seg } = req.body || {}
    if (!transcricao?.trim()) return res.status(400).json({ error: 'Transcricao vazia' })
    const now = new Date().toISOString()
    const { rows: [g] } = await pool.query(
      `UPDATE consultor_gravacoes SET transcricao = $2, duracao_seg = $3, estado = 'transcrito', erro = NULL, updated_at = $4
       WHERE id = $1 RETURNING *`,
      [req.params.id, transcricao, duracao_seg ?? null, now]
    )
    if (!g) return res.status(404).json({ error: 'Gravacao nao encontrada' })

    // Analise comercial (best-effort): falha nao bloqueia a transcricao.
    try {
      const cons = await Consultores.getById(g.consultor_id)
      const analise = await analisarTranscricaoIA(transcricao, cons?.nome)
      await pool.query(
        `UPDATE consultor_gravacoes SET analise = $2, estado = 'analisado', updated_at = $3 WHERE id = $1`,
        [req.params.id, JSON.stringify(analise), new Date().toISOString()]
      )
    } catch (e) {
      await pool.query(
        `UPDATE consultor_gravacoes SET erro = $2, updated_at = $3 WHERE id = $1`,
        [req.params.id, `Analise: ${e.message}`, new Date().toISOString()]
      )
    }
    const { rows: [final] } = await pool.query('SELECT * FROM consultor_gravacoes WHERE id = $1', [req.params.id])
    res.json(final)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Worker: reportar falha de transcricao (audio corrompido, whisper falhou, etc.).
router.post('/gravacoes/:id/falha', async (req, res) => {
  try {
    const { rows: [row] } = await pool.query(
      `UPDATE consultor_gravacoes SET estado = 'erro', erro = $2, updated_at = $3 WHERE id = $1 RETURNING id`,
      [req.params.id, (req.body?.erro || 'Falha na transcricao').slice(0, 500), new Date().toISOString()]
    )
    res.json({ ok: !!row })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Repor uma gravacao em erro para 'pendente' (re-tentar transcricao).
router.post('/gravacoes/:id/retomar', async (req, res) => {
  try {
    const { rows: [row] } = await pool.query(
      `UPDATE consultor_gravacoes SET estado = 'pendente', erro = NULL, updated_at = $2
       WHERE id = $1 AND estado IN ('erro','a_transcrever') RETURNING *`,
      [req.params.id, new Date().toISOString()]
    )
    if (!row) return res.status(404).json({ error: 'Gravacao nao encontrada ou nao retomavel' })
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// (Re)correr a analise comercial sobre a transcricao existente.
router.post('/gravacoes/:id/analisar', async (req, res) => {
  try {
    const { rows: [g] } = await pool.query('SELECT * FROM consultor_gravacoes WHERE id = $1', [req.params.id])
    if (!g) return res.status(404).json({ error: 'Gravacao nao encontrada' })
    if (!g.transcricao?.trim()) return res.status(400).json({ error: 'Sem transcricao para analisar' })
    await pool.query(`UPDATE consultor_gravacoes SET estado = 'a_analisar', updated_at = $2 WHERE id = $1`,
      [req.params.id, new Date().toISOString()])
    const cons = await Consultores.getById(g.consultor_id)
    const analise = await analisarTranscricaoIA(g.transcricao, cons?.nome)
    const { rows: [final] } = await pool.query(
      `UPDATE consultor_gravacoes SET analise = $2, estado = 'analisado', erro = NULL, updated_at = $3 WHERE id = $1 RETURNING *`,
      [req.params.id, JSON.stringify(analise), new Date().toISOString()]
    )
    res.json(final)
  } catch (e) {
    await pool.query(`UPDATE consultor_gravacoes SET estado = 'transcrito', erro = $2, updated_at = $3 WHERE id = $1`,
      [req.params.id, `Analise: ${e.message}`, new Date().toISOString()]).catch(() => {})
    res.status(500).json({ error: e.message })
  }
})

// Apagar uma gravacao (Storage + BD).
router.delete('/gravacoes/:id', async (req, res) => {
  try {
    const { rows: [g] } = await pool.query('SELECT ficheiro_path FROM consultor_gravacoes WHERE id = $1', [req.params.id])
    if (!g) return res.status(404).json({ error: 'Gravacao nao encontrada' })
    if (supabaseStorage && g.ficheiro_path) {
      await supabaseStorage.storage.from(GRAVACOES_BUCKET).remove([g.ficheiro_path]).catch(() => {})
    }
    await pool.query('DELETE FROM consultor_gravacoes WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── KPIs de chamadas (SOP 2) ──────────────────────────────────
const round1 = n => Math.round(n * 10) / 10
const SINTOMA_AMOSTRA_MIN = 10

// Leitura de funil por sintoma (SOP 2, Seccao 7). Os limiares (40%, 7 pontos)
// sao um ponto de partida razoavel, nao valores-alvo oficiais do SOP — o
// proprio documento nao define metas numericas, so a logica de diagnostico.
function diagnosticarFunil(kpis, amostras) {
  const out = []
  if (amostras.cold_total >= SINTOMA_AMOSTRA_MIN && kpis.taxa_contacto != null && kpis.taxa_contacto < 40) {
    out.push({ sintoma: 'Taxa de contacto baixa', severidade: 'media',
      texto: 'Boa amostra de Cold Calls mas atendimento baixo — provavel problema de horario das chamadas, nao do guiao.' })
  }
  if (amostras.cold_atendeu >= SINTOMA_AMOSTRA_MIN && kpis.taxa_contacto != null && kpis.taxa_contacto >= 40
      && kpis.taxa_passagem_discovery != null && kpis.taxa_passagem_discovery < 40) {
    out.push({ sintoma: 'Passagem a Discovery baixa', severidade: 'alta',
      texto: 'Bom atendimento mas poucas Discovery Calls agendadas — provavel problema na abertura ou na pergunta de qualificacao da Cold Call.' })
  }
  if (amostras.discovery_total >= SINTOMA_AMOSTRA_MIN && kpis.pontuacao_media_qualificacao != null && kpis.pontuacao_media_qualificacao < 7) {
    out.push({ sintoma: 'Pontuacao de qualificacao sistematicamente baixa', severidade: 'alta',
      texto: 'Discovery Call provavelmente cortada cedo demais — reforcar os 3 blocos (Objectivo, Motivo Real, Desafios).' })
  }
  if (amostras.close_total >= 5 && kpis.pontuacao_media_qualificacao != null && kpis.pontuacao_media_qualificacao >= 8
      && kpis.taxa_fecho != null && kpis.taxa_fecho < 40) {
    out.push({ sintoma: 'Taxa de fecho baixa com boa qualificacao', severidade: 'alta',
      texto: 'O problema esta na Close Call (ancoragem, tratamento de objeccoes), nao na Discovery.' })
  }
  return out
}

// KPIs agregados + diagnostico de funil (SOP 2, Framework de Metricas Simplificado).
router.get('/gravacoes/kpis', async (req, res) => {
  try {
    const desde = req.query.desde || '1970-01-01'
    const ate = req.query.ate || '2999-12-31'
    // Presenca de campo, nao "tipo_chamada = X": a mesma chamada cobre muitas
    // vezes mais do que uma fase (cold call que passa logo a discovery), por
    // isso uma linha pode contar para varios KPIs ao mesmo tempo.
    const { rows: [r] } = await pool.query(
      `WITH base AS (
        SELECT * FROM consultor_gravacoes WHERE tipo_chamada IS NOT NULL AND data_chamada BETWEEN $1 AND $2
      ), por_consultor AS (
        SELECT consultor_id,
          MIN(data_chamada) FILTER (WHERE cc_resultado IS NOT NULL) AS inicio,
          MAX(data_chamada) FILTER (WHERE cl_resultado IS NOT NULL OR pp_compromisso_confirmado IS NOT NULL) AS fim
        FROM base GROUP BY consultor_id
      )
      SELECT
        COUNT(*) FILTER (WHERE cc_resultado IS NOT NULL) AS cold_total,
        COUNT(*) FILTER (WHERE cc_resultado = 'atendeu') AS cold_atendeu,
        COUNT(*) FILTER (WHERE dc_pontuacao_total IS NOT NULL) AS discovery_total,
        AVG(dc_pontuacao_total) AS dc_media,
        COUNT(*) FILTER (WHERE cl_resultado IS NOT NULL) AS close_total,
        COUNT(*) FILTER (WHERE cl_resultado = 'aceite') AS close_aceite,
        COUNT(DISTINCT consultor_id) FILTER (WHERE pp_compromisso_confirmado IS NOT NULL OR pp_criterios_pesquisa_enviados IS NOT NULL) AS pivot_contactados,
        COUNT(DISTINCT consultor_id) FILTER (WHERE pp_compromisso_confirmado = true) AS pivot_confirmados,
        (SELECT AVG(EXTRACT(EPOCH FROM (fim::timestamptz - inicio::timestamptz)) / 86400.0)
         FROM por_consultor WHERE inicio IS NOT NULL AND fim IS NOT NULL AND fim >= inicio) AS tempo_medio_ciclo_dias
      FROM base`,
      [desde, ate]
    )
    const amostras = {
      cold_total: Number(r.cold_total) || 0,
      cold_atendeu: Number(r.cold_atendeu) || 0,
      discovery_total: Number(r.discovery_total) || 0,
      close_total: Number(r.close_total) || 0,
      pivot_contactados: Number(r.pivot_contactados) || 0,
    }
    const kpis = {
      taxa_contacto: amostras.cold_total ? round1(amostras.cold_atendeu / amostras.cold_total * 100) : null,
      taxa_passagem_discovery: amostras.cold_atendeu ? round1(amostras.discovery_total / amostras.cold_atendeu * 100) : null,
      pontuacao_media_qualificacao: r.dc_media != null ? round1(Number(r.dc_media)) : null,
      taxa_fecho: amostras.close_total ? round1(Number(r.close_aceite) / amostras.close_total * 100) : null,
      tempo_medio_ciclo_dias: r.tempo_medio_ciclo_dias != null ? round1(Number(r.tempo_medio_ciclo_dias)) : null,
      taxa_conversao_parceiro: amostras.pivot_contactados ? round1(Number(r.pivot_confirmados) / amostras.pivot_contactados * 100) : null,
    }
    res.json({ periodo: { desde, ate }, kpis, amostras, diagnostico: diagnosticarFunil(kpis, amostras) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Registo de chamadas (SOP 2), filtravel — usado na tabela da aba de Administracao.
router.get('/gravacoes', async (req, res) => {
  try {
    const { desde, ate, tipo_chamada, consultor_id } = req.query
    const conds = ['g.tipo_chamada IS NOT NULL']
    const params = []
    if (desde) { params.push(desde); conds.push(`g.data_chamada >= $${params.length}`) }
    if (ate) { params.push(ate); conds.push(`g.data_chamada <= $${params.length}`) }
    if (tipo_chamada) { params.push(tipo_chamada); conds.push(`g.tipo_chamada = $${params.length}`) }
    if (consultor_id) { params.push(consultor_id); conds.push(`g.consultor_id = $${params.length}`) }
    const { rows } = await pool.query(
      `SELECT g.*, c.nome AS consultor_nome, i.nome AS imovel_nome
       FROM consultor_gravacoes g
       LEFT JOIN consultores c ON c.id = g.consultor_id
       LEFT JOIN imoveis i ON i.id = g.imovel_id
       WHERE ${conds.join(' AND ')}
       ORDER BY g.data_chamada DESC, g.created_at DESC
       LIMIT 200`,
      params
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Interacções por consultor ────────────────────────────────
router.get('/consultores/:id/interacoes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ci.*, i.nome as imovel_nome FROM consultor_interacoes ci
       LEFT JOIN imoveis i ON i.id = ci.imovel_id
       WHERE ci.consultor_id = $1 ORDER BY ci.data_hora DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/investidores/:id/interacoes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM investidor_interacoes WHERE investidor_id = $1 ORDER BY data_hora DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Interacções por imóvel ──────────────────────────────────
router.get('/imoveis/:id/interacoes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ci.*, c.nome as consultor_nome FROM consultor_interacoes ci
       LEFT JOIN consultores c ON c.id = ci.consultor_id
       WHERE ci.imovel_id = $1 ORDER BY ci.data_hora DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Conversas (follow-ups + gravacoes) ligadas a um imovel ───
// Espelha na ficha do imovel as conversas registadas no consultor com este imovel.
router.get('/imoveis/:id/followups', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, c.nome AS consultor_nome FROM consultor_followups f
       LEFT JOIN consultores c ON c.id = f.consultor_id
       WHERE f.imovel_id = $1 ORDER BY f.data DESC, f.created_at DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/imoveis/:id/gravacoes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM consultor_gravacoes WHERE imovel_id = $1 ORDER BY data_chamada DESC, created_at DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Extrair fotos de link de anuncio ─────────────────────────
router.post('/imoveis/:id/scrape-fotos', async (req, res) => {
  try {
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    const url = req.body.url || imovel.link
    if (!url) return res.status(400).json({ error: 'Nenhum link fornecido. Enviar { url: "..." } ou preencher o campo link do imóvel.' })

    const scraped = await scrapePhotosFromLink(url, req.params.id)
    if (scraped.length === 0) return res.json({ ok: true, fotos: [], message: 'Nenhuma foto encontrada no link.' })

    const fotos = imovel.fotos ? JSON.parse(imovel.fotos) : []
    fotos.push(...scraped)
    await Imoveis.update(req.params.id, { fotos: JSON.stringify(fotos) })

    res.json({ ok: true, extraidas: scraped.length, fotos })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Upload de fotos para imóveis ─────────────────────────────
router.post('/imoveis/:id/fotos', uploadRateLimit, uploadImovel.array('fotos', 20), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'Nenhum ficheiro recebido (limite 15MB por ficheiro)' })
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    const folder = req.body?.folder === 'documentos' ? 'documentos' : undefined
    // Slot opcional: liga o ficheiro a um item da checklist canónica de
    // documentação (ver src/components/crm/ImovelDocumentacao/checklist.config.js).
    // Múltiplos ficheiros podem partilhar o mesmo slot.
    const slot = req.body?.slot ? String(req.body.slot).trim() : undefined
    let fotos = imovel.fotos ? JSON.parse(imovel.fotos) : []
    const driveJobs = []
    for (const file of req.files) {
      let filePath = `/uploads/imoveis/${file.filename}`
      const fileBuffer = await readFile(file.path)

      // Upload para Supabase Storage (persistente) se configurado
      if (supabaseStorage) {
        const storagePath = `imoveis/${req.params.id}/${file.filename}`
        const { error } = await supabaseStorage.storage
          .from('Imoveis')
          .upload(storagePath, fileBuffer, { contentType: file.mimetype, upsert: true })

        if (!error) {
          const { data: urlData } = supabaseStorage.storage
            .from('Imoveis')
            .getPublicUrl(storagePath)
          filePath = urlData.publicUrl
          // Apagar ficheiro temporario do disco
          await unlink(file.path).catch(() => {})
        }
      }

      // Espelho no Google Drive (fonte primária continua a ser o Storage)
      if (driveConfigured()) {
        driveJobs.push(
          uploadUserFileToFolder(req.params.id, fileBuffer, file.originalname, {
            isPhoto: folder !== 'documentos',
            mimeType: file.mimetype,
          }).catch(e => console.error('[drive] espelho upload:', e.message)),
        )
      }

      fotos.push({
        id: randomUUID(),
        name: file.originalname,
        path: filePath,
        type: file.mimetype,
        size: file.size,
        uploaded_at: new Date().toISOString(),
        ...(folder ? { folder } : {}),
        ...(slot ? { slot } : {}),
      })
    }
    await Imoveis.update(req.params.id, { fotos: JSON.stringify(fotos) })
    // Best-effort: espelho no Drive não bloqueia o sucesso da resposta
    if (driveJobs.length) await Promise.allSettled(driveJobs)
    res.json({ ok: true, fotos })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Análise documental por IA (Claude) ──────────────────────
// Analisa um documento legal (certidão, caderneta, licença, etc.) e devolve
// JSON estruturado (validade, campos, red flags, resumo). Persiste a análise
// no array imoveis.documentacao_analise (upsert por doc_id). Toda a IA corre
// no backend — a chave Anthropic nunca chega ao frontend.
const DOC_MEDIA = {
  '.pdf': { kind: 'document', media: 'application/pdf' },
  '.jpg': { kind: 'image', media: 'image/jpeg' },
  '.jpeg': { kind: 'image', media: 'image/jpeg' },
  '.png': { kind: 'image', media: 'image/png' },
  '.webp': { kind: 'image', media: 'image/webp' },
}
// Fallback por mimetype quando a extensão do nome/path não é fiável.
const CT_MEDIA = {
  'application/pdf': { kind: 'document', media: 'application/pdf' },
  'image/jpeg': { kind: 'image', media: 'image/jpeg' },
  'image/jpg': { kind: 'image', media: 'image/jpeg' },
  'image/png': { kind: 'image', media: 'image/png' },
  'image/webp': { kind: 'image', media: 'image/webp' },
}
// Resolve o bloco de media (kind/media_type) por extensão ou, em alternativa, por mimetype.
function resolveDocMedia(ext, ...contentTypes) {
  if (ext && DOC_MEDIA[ext]) return DOC_MEDIA[ext]
  for (const ct of contentTypes) {
    const norm = String(ct || '').split(';')[0].trim().toLowerCase()
    if (CT_MEDIA[norm]) return CT_MEDIA[norm]
  }
  return null
}
// A IA pode devolver valido como string; normaliza para true|false|'warning'.
function normalizarValido(v) {
  if (v === true || v === 'true') return true
  if (v === 'warning') return 'warning'
  return false
}

function buildDocPrompt(tipoImovel) {
  const tipo = (tipoImovel || '').toLowerCase().includes('morad') ? 'MORADIA' : ((tipoImovel || '').trim() ? 'APARTAMENTO' : 'NÃO ESPECIFICADO')
  return `És um especialista jurídico e imobiliário português ao serviço da Somnium Properties.

Contexto: documento associado a um imóvel (tipo: ${tipo}).

Identifica que documento é (qualquer tipo, não apenas documentos de escritura) e analisa-o com lente jurídica/imobiliária portuguesa. Devolve APENAS um JSON válido, sem markdown, sem texto extra:

{
  "tipo_documento": "Nome do tipo de documento que identificaste (ex: Certidão Permanente, Caderneta Predial, Contrato, Fatura, Planta, etc.)",
  "valido": true | false | "warning",
  "campos": [
    { "label": "Campo extraído", "valor": "Valor" }
  ],
  "dados_chave": {
    "morada": "...",
    "freguesia": "...",
    "concelho": "...",
    "artigo_matricial": "...",
    "fracao": "...",
    "area": "...",
    "vpt": "...",
    "titular": "...",
    "data_documento": "...",
    "validade": "..."
  },
  "flags": [
    {
      "severity": "critical | warning | info",
      "titulo": "Título da flag",
      "descricao": "Descrição detalhada"
    }
  ],
  "resumo": "Resumo em 2-3 frases sobre o documento.",
  "pontos_verificar": ["Ponto 1", "Ponto 2"]
}

Instruções para dados_chave:
- Inclui APENAS as chaves cujo valor consegues extrair do documento; omite as restantes.
- Usa os valores tal como aparecem no documento (estes campos servem para cruzar dados entre documentos).
- area em m2; vpt em euros.

Regras de validação (aplica as que forem relevantes ao documento):
- Certidão Permanente: flag crítica se tiver ónus, penhoras ou hipotecas
- Caderneta Predial: verificar VPT, área, tipologia; flag se área inconsistente
- Licença de Utilização: obrigatória para imóveis após 07/08/1951; flag crítica se ausente ou uso não-habitacional
- Ficha Técnica: obrigatória para obras após 30/03/2004; verificar assinatura técnica
- Certificado Energético: verificar validade (10 anos); flag se classe abaixo de D
- Guia de Impostos: verificar se IMT e IS foram pagos e valores corretos
- Declaração de Condomínio: flag crítica se existirem dívidas em atraso
- Para outros documentos: assinala datas vencidas, valores em falta, assinaturas ausentes ou qualquer pormenor relevante
- Se não conseguires ler o documento, indica nas flags`
}

// Resolve o buffer + extensão do documento, vindo de multer ou de um path já carregado.
async function resolveDocBuffer(req) {
  if (req.file) {
    const buf = await readFile(req.file.path)
    await unlink(req.file.path).catch(() => {})
    return { buffer: buf, ext: path.extname(req.file.originalname).toLowerCase(), name: req.file.originalname, contentType: req.file.mimetype }
  }
  const p = req.body?.path
  if (!p) return null
  const ext = path.extname((req.body?.name || p).split('?')[0]).toLowerCase()
  if (/^https?:\/\//i.test(p)) {
    const r = await fetch(p)
    if (!r.ok) throw new Error(`Não foi possível obter o ficheiro (${r.status})`)
    return { buffer: Buffer.from(await r.arrayBuffer()), ext, name: req.body?.name || path.basename(p), contentType: r.headers.get('content-type') }
  }
  const rel = p.startsWith('/') ? p.slice(1) : p
  const abs = path.resolve(REPO_ROOT, 'public', rel)
  if (!abs.startsWith(path.resolve(REPO_ROOT, 'public'))) throw new Error('Caminho inválido')
  return { buffer: await readFile(abs), ext, name: req.body?.name || path.basename(p), contentType: null }
}

router.post('/imoveis/:id/documentos/analise', uploadRateLimit, uploadImovel.single('ficheiro'), async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'Análise por IA indisponível (ANTHROPIC_API_KEY não configurada).' })
    }
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    let doc
    if (req.body?.driveFileId) {
      // Documento que vive no Google Drive — download autenticado (o link público não serve).
      try {
        const df = await downloadDriveFile(req.body.driveFileId)
        const ext = path.extname(df.name || req.body?.name || '').toLowerCase()
        doc = { buffer: df.buffer, ext, name: df.name || req.body?.name || 'documento', contentType: df.mimeType }
      } catch (e) { return res.status(400).json({ error: e.message }) }
    } else {
      try { doc = await resolveDocBuffer(req) }
      catch (e) { return res.status(400).json({ error: e.message }) }
    }
    if (!doc?.buffer?.length) return res.status(400).json({ error: 'Nenhum documento para analisar (PDF, JPG ou PNG).' })

    const meta = resolveDocMedia(doc.ext, req.body?.type, doc.contentType)
    if (!meta) return res.status(400).json({ error: 'Formato não suportado. Usa PDF, JPG, JPEG, PNG ou WEBP.' })
    if (doc.buffer.length > 15 * 1024 * 1024) return res.status(400).json({ error: 'Ficheiro demasiado grande (máx. 15MB).' })

    const base64 = doc.buffer.toString('base64')
    const fileBlock = meta.kind === 'document'
      ? { type: 'document', source: { type: 'base64', media_type: meta.media, data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: meta.media, data: base64 } }

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const tipoImovel = req.body?.tipoImovel || imovel.predio_tipo || imovel.tipologia || ''

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: buildDocPrompt(tipoImovel) }] }],
    })

    const respText = response.content?.[0]?.text || '{}'
    let parsed
    try {
      const jsonMatch = respText.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch?.[0] || respText)
    } catch {
      return res.status(502).json({ error: 'A IA devolveu uma resposta ilegível. Tenta novamente.' })
    }

    const entry = {
      fotoId: req.body?.fotoId || null,
      nome_ficheiro: doc.name,
      tipo_documento: parsed.tipo_documento || 'Documento',
      valido: normalizarValido(parsed.valido),
      campos: Array.isArray(parsed.campos) ? parsed.campos.slice(0, 6) : [],
      dados_chave: (parsed.dados_chave && typeof parsed.dados_chave === 'object') ? parsed.dados_chave : {},
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      resumo: parsed.resumo || '',
      pontos_verificar: Array.isArray(parsed.pontos_verificar) ? parsed.pontos_verificar : [],
      analyzed_at: new Date().toISOString(),
    }

    // Upsert por fotoId (uma análise por ficheiro carregado).
    const atual = Array.isArray(imovel.documentacao_analise) ? imovel.documentacao_analise : []
    const next = [...atual.filter(a => !(entry.fotoId && a.fotoId === entry.fotoId)), entry]
    await Imoveis.update(req.params.id, { documentacao_analise: JSON.stringify(next) }, { regiaoActiva: req.regiaoActiva })

    res.json({ ok: true, analise: entry, documentacao_analise: next })
  } catch (e) {
    console.error(`[documentos/analise imovel=${req.params.id}] FALHOU:`, e.message)
    res.status(500).json({ error: e.message || 'Falha na análise do documento.' })
  }
})

// Remover a análise de um documento (por fotoId) — permite reanalisar do zero.
router.delete('/imoveis/:id/documentos/analise/:fotoId', async (req, res) => {
  try {
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })
    const atual = Array.isArray(imovel.documentacao_analise) ? imovel.documentacao_analise : []
    const next = atual.filter(a => a.fotoId !== req.params.fotoId)
    await Imoveis.update(req.params.id, { documentacao_analise: JSON.stringify(next) }, { regiaoActiva: req.regiaoActiva })
    res.json({ ok: true, documentacao_analise: next })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Mover ficheiro entre categorias (fotos ↔ documentos)
router.put('/imoveis/:id/fotos/:fotoId/mover', async (req, res) => {
  try {
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })
    const { folder } = req.body // 'fotos' ou 'documentos'
    if (!['fotos', 'documentos'].includes(folder)) return res.status(400).json({ error: 'Pasta inválida' })

    const fotos = imovel.fotos ? JSON.parse(imovel.fotos) : []
    const updated = fotos.map(f => f.id === req.params.fotoId ? { ...f, folder } : f)
    await Imoveis.update(req.params.id, { fotos: JSON.stringify(updated) })
    res.json({ ok: true, fotos: updated })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Upload da imagem de localização (Google Maps print) ─────
router.post('/imoveis/:id/localizacao', uploadRateLimit, uploadImovel.single('imagem'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro válido (JPG, PNG, WEBP até 15MB)' })
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    let filePath = `/uploads/imoveis/${req.file.filename}`
    if (supabaseStorage) {
      const storagePath = `imoveis/${req.params.id}/localizacao_${req.file.filename}`
      const fileBuffer = await readFile(req.file.path)
      const { error } = await supabaseStorage.storage
        .from('Imoveis')
        .upload(storagePath, fileBuffer, { contentType: req.file.mimetype, upsert: true })
      if (!error) {
        const { data: urlData } = supabaseStorage.storage.from('Imoveis').getPublicUrl(storagePath)
        filePath = urlData.publicUrl
        await unlink(req.file.path).catch(() => {})
      }
    }
    await Imoveis.update(req.params.id, { localizacao_imagem: filePath })
    res.json({ ok: true, localizacao_imagem: filePath })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/imoveis/:id/localizacao', async (req, res) => {
  try {
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })
    const url = imovel.localizacao_imagem
    if (url && supabaseStorage && url.includes('supabase.co/storage/')) {
      const match = url.match(/\/storage\/v1\/object\/public\/Imoveis\/(.+)$/)
      if (match) await supabaseStorage.storage.from('Imoveis').remove([match[1]]).catch(() => {})
    }
    await Imoveis.update(req.params.id, { localizacao_imagem: null })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/imoveis/:id/fotos/:fotoId', async (req, res) => {
  try {
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    const fotos = imovel.fotos ? JSON.parse(imovel.fotos) : []
    const foto = fotos.find(f => f.id === req.params.fotoId)

    // Apagar do Supabase Storage se for URL do Supabase
    if (foto && supabaseStorage && foto.path?.includes('supabase.co/storage/')) {
      const match = foto.path.match(/\/storage\/v1\/object\/public\/Imoveis\/(.+)$/)
      if (match) {
        await supabaseStorage.storage.from('Imoveis').remove([match[1]]).catch(() => {})
      }
    }

    const filtered = fotos.filter(f => f.id !== req.params.fotoId)
    await Imoveis.update(req.params.id, { fotos: JSON.stringify(filtered) })
    res.json({ ok: true, fotos: filtered })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Listar ficheiros do Google Drive do imóvel ───────────────
router.get('/imoveis/:id/drive-files', async (req, res) => {
  try {
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })
    if (!imovel.drive_folder_id) return res.json({ files: [], fotos: [], documentos: [], configured: false })

    if (!driveConfigured()) return res.json({ files: [], fotos: [], documentos: [], configured: false })

    const { google: googleapis } = await import('googleapis')
    const { readFileSync, existsSync } = await import('fs')
    const pth = await import('path')
    const root = pth.resolve(__dirname, '../..')
    const oauthPath = pth.join(root, 'google-oauth.json')
    const tokenPath = pth.join(root, 'google-token.json')
    const creds = JSON.parse(readFileSync(oauthPath, 'utf8'))
    const { client_id, client_secret } = creds.installed || creds.web
    const oauth2 = new googleapis.auth.OAuth2(client_id, client_secret, 'http://localhost:3333')
    oauth2.setCredentials(JSON.parse(readFileSync(tokenPath, 'utf8')))
    const drive = googleapis.drive({ version: 'v3', auth: oauth2 })

    // Listar subpastas
    const foldersRes = await drive.files.list({
      q: `'${imovel.drive_folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
      supportsAllDrives: true,
    })
    const subfolders = foldersRes.data.files || []

    const result = { files: [], fotos: [], documentos: [], configured: true, folderId: imovel.drive_folder_id }

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
      // Categorização tolerante a nomes legados (imóveis antigos)
      const isFoto = folder.name === '05 Fotos' || folder.name === 'Fotos'
      const isDoc = ['01 Documentação Legal', '02 Análises e Estudos', '03 Propostas', '04 Fichas e Follow-up', 'Documentos', 'Estudo de Mercado'].includes(folder.name)
      if (isFoto) result.fotos.push(...files)
      if (isDoc) result.documentos.push(...files)
    }

    res.json(result)
  } catch (e) {
    console.error('[drive] list files error:', e.message)
    res.json({ files: [], fotos: [], documentos: [], configured: false, error: e.message })
  }
})

// ── Upload de documentos para despesas ───────────────────────
router.post('/despesas/:id/upload', uploadRateLimit, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Ficheiro inválido (PDF, JPG, PNG até 10MB)' })
    const { id } = req.params
    const despesa = await Despesas.getById(id)
    if (!despesa) return res.status(404).json({ error: 'Despesa não encontrada' })

    const docs = despesa.documentos ? JSON.parse(despesa.documentos) : []
    docs.push({
      id: randomUUID(),
      name: req.file.originalname,
      path: `/uploads/despesas/${req.file.filename}`,
      type: req.file.mimetype,
      size: req.file.size,
      uploaded_at: new Date().toISOString(),
    })
    await Despesas.update(id, { documentos: JSON.stringify(docs) })
    res.json({ ok: true, documentos: docs })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/despesas/:id/upload/:docId', async (req, res) => {
  try {
    const { id, docId } = req.params
    const despesa = await Despesas.getById(id)
    if (!despesa) return res.status(404).json({ error: 'Despesa não encontrada' })

    const docs = despesa.documentos ? JSON.parse(despesa.documentos) : []
    const filtered = docs.filter(d => d.id !== docId)
    await Despesas.update(id, { documentos: JSON.stringify(filtered) })
    res.json({ ok: true, documentos: filtered })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/stats', async (req, res) => {
  try { res.json(await getDashboardStats({ regiao: req.regiaoActiva })) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Fireflies (reuniões / transcrições) ──────────────────────
router.get('/reunioes', async (req, res) => {
  try {
    const { entidade_tipo, entidade_id, limit = 50 } = req.query
    let query = 'SELECT id, fireflies_id, titulo, data, duracao_min, participantes, resumo, keywords, action_items, entidade_tipo, entidade_id, organizador, created_at FROM reunioes'
    const params = []
    if (entidade_tipo && entidade_id) {
      query += ' WHERE entidade_tipo = $1 AND entidade_id = $2'
      params.push(entidade_tipo, entidade_id)
    }
    query += ` ORDER BY data DESC LIMIT $${params.length + 1}`
    params.push(+limit)
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/reunioes/:id', async (req, res) => {
  try {
    const { rows: [reuniao] } = await pool.query('SELECT * FROM reunioes WHERE id = $1', [req.params.id])
    if (!reuniao) return res.status(404).json({ error: 'Reunião não encontrada' })
    res.json(reuniao)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/reunioes/:id/transcricao', async (req, res) => {
  try {
    const { rows: [reuniao] } = await pool.query('SELECT titulo, transcricao FROM reunioes WHERE id = $1', [req.params.id])
    if (!reuniao) return res.status(404).json({ error: 'Reunião não encontrada' })
    res.json({ titulo: reuniao.titulo, transcricao: reuniao.transcricao })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/reunioes/:id/relatorio', async (req, res) => {
  try {
    const { rows: [reuniao] } = await pool.query('SELECT * FROM reunioes WHERE id = $1', [req.params.id])
    if (!reuniao) return res.status(404).json({ error: 'Reunião não encontrada' })

    // Usar analise_completa guardada se existir, senão fallback para análise por padrões
    let analise
    if (reuniao.analise_completa) {
      try { analise = JSON.parse(reuniao.analise_completa) } catch { analise = await analyzeReuniao(req.params.id) }
    } else {
      analise = await analyzeReuniao(req.params.id)
    }

    let investidor = null
    if (reuniao.entidade_id && reuniao.entidade_tipo === 'investidores') {
      const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [reuniao.entidade_id])
      investidor = inv
    }

    const nome = (reuniao.titulo || 'reuniao').replace(/[^a-zA-Z0-9À-ú ]/g, '').replace(/\s+/g, '_')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', pdfDisposition(req, `Relatorio_Reuniao_${nome}.pdf`))

    const doc = generateMeetingPDF(reuniao, analise, investidor)
    streamPdfToResAndPersist(doc, res, {
      storagePath: `reunioes/${reuniao.id}/relatorio.pdf`,
      localPath: path.join(REPO_ROOT, 'Relatorios', 'Reunioes', `${reuniao.id}_relatorio.pdf`),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.put('/reunioes/:id', async (req, res) => {
  try {
    const { analise_completa, entidade_tipo, entidade_id } = req.body
    const sets = ['updated_at = $1']
    const params = [new Date().toISOString()]
    if (analise_completa !== undefined) { params.push(analise_completa); sets.push(`analise_completa = $${params.length}`) }
    if (entidade_tipo !== undefined) { params.push(entidade_tipo); sets.push(`entidade_tipo = $${params.length}`) }
    if (entidade_id !== undefined) { params.push(entidade_id); sets.push(`entidade_id = $${params.length}`) }
    params.push(req.params.id)
    await pool.query(`UPDATE reunioes SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/reunioes/:id/analisar', async (req, res) => {
  try {
    const { rows: [r] } = await pool.query('SELECT entidade_tipo FROM reunioes WHERE id = $1', [req.params.id])
    if (!r) return res.status(404).json({ error: 'Reunião não encontrada' })
    const { autoFillConsultor } = await import('./meetingAnalysis.js')
    const result = r.entidade_tipo === 'consultores'
      ? await autoFillConsultor(req.params.id)
      : await autoFillInvestidor(req.params.id)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/reunioes/:id/marcar-vista', async (req, res) => {
  try {
    await pool.query(
      'UPDATE reunioes SET analise_vista = true, updated_at = $1 WHERE id = $2',
      [new Date().toISOString(), req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/fireflies/sync', async (req, res) => {
  try {
    if (!firefliesConfigured()) return res.status(503).json({ error: 'FIREFLIES_API_KEY não configurada' })
    const result = await syncFireflies()

    // Auto-analisar e preencher investidores para reuniões novas
    if (result.created > 0) {
      const { rows: novas } = await pool.query(
        "SELECT id FROM reunioes WHERE entidade_tipo = 'investidores' AND entidade_id IS NOT NULL ORDER BY created_at DESC LIMIT $1",
        [result.created]
      )
      for (const r of novas) {
        try { await autoFillInvestidor(r.id) } catch {}
      }
      result.analyzed = novas.length
    }

    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Google Forms → CRM ───────────────────────────────────────
router.post('/forms/sync', async (req, res) => {
  try {
    if (!formsConfigured()) return res.status(503).json({ error: 'Google Forms não configurado' })
    const result = await syncForms()
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Gmail — Organizar emails por departamento ───────────────────
router.get('/gmail/labels', async (req, res) => {
  try {
    if (!gmailConfigured()) return res.status(503).json({ error: 'Gmail não configurado. Correr: node scripts/auth-google.js' })
    const labels = await ensureLabels()
    res.json({ labels })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/gmail/organize', async (req, res) => {
  try {
    if (!gmailConfigured()) return res.status(503).json({ error: 'Gmail não configurado' })
    const { messageId, label, markRead } = req.body
    if (!messageId || !label) return res.status(400).json({ error: 'messageId e label obrigatórios' })
    const result = await organizeMessage(messageId, label, markRead !== false)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/gmail/organize-batch', async (req, res) => {
  try {
    if (!gmailConfigured()) return res.status(503).json({ error: 'Gmail não configurado' })
    const { messages } = req.body
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages deve ser um array' })
    const results = await organizeBatch(messages)
    res.json({ results })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/gmail/auto-organize', async (req, res) => {
  try {
    if (!gmailConfigured()) return res.status(503).json({ error: 'Gmail não configurado' })
    const result = await autoOrganize()
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Excel Export por departamento ────────────────────────────────
router.get('/export/:dept', async (req, res) => {
  try {
    const { dept } = req.params
    const driveFolderId = req.query.driveFolderId || null
    const { buffer, fileName, driveFile } = await exportDepartment(dept, driveFolderId)
    if (req.query.download !== 'false') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      return res.send(Buffer.from(buffer))
    }
    res.json({ fileName, driveFile })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── DOCX — documentos Word ──────────────────────────────────────
router.get('/imoveis/:id/docx/:tipo', async (req, res) => {
  try {
    const { buffer, fileName } = await generateDocx(req.params.tipo, req.params.id)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.send(Buffer.from(buffer))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/docx/tipos', (req, res) => {
  res.json({ tipos: getAvailableTypes() })
})

// ── CSV Export ──────────────────────────────────────────────────
router.get('/export-csv/:entity', async (req, res) => {
  try {
    const { entity } = req.params
    const allowed = ['imoveis', 'investidores', 'consultores', 'negocios', 'despesas', 'tarefas']
    if (!allowed.includes(entity)) return res.status(400).json({ error: `Entidade invalida. Usar: ${allowed.join(', ')}` })
    const { rows } = await pool.query(`SELECT * FROM ${entity} ORDER BY created_at DESC`)
    if (rows.length === 0) return res.status(404).json({ error: 'Sem dados' })
    const headers = Object.keys(rows[0])
    const csvRows = [headers.join(',')]
    for (const row of rows) {
      csvRows.push(headers.map(h => {
        let v = row[h]
        if (v == null) return ''
        if (v instanceof Date) return v.toISOString().slice(0, 10)
        v = String(v).replace(/"/g, '""')
        return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v}"` : v
      }).join(','))
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${entity}_${new Date().toISOString().slice(0,10)}.csv"`)
    res.send('\uFEFF' + csvRows.join('\n'))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── CSV Import ──────────────────────────────────────────────────
router.post('/import-csv/:entity', async (req, res) => {
  try {
    const { entity } = req.params
    const allowed = ['investidores', 'consultores', 'despesas']
    if (!allowed.includes(entity)) return res.status(400).json({ error: `Import permitido para: ${allowed.join(', ')}` })
    const { rows: data } = req.body
    if (!Array.isArray(data) || data.length === 0) return res.status(400).json({ error: 'Body deve conter { rows: [...] }' })
    let imported = 0
    for (const row of data) {
      const keys = Object.keys(row).filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at')
      if (keys.length === 0) continue
      const vals = keys.map((_, i) => `$${i + 1}`)
      await pool.query(`INSERT INTO ${entity} (${keys.join(',')}) VALUES (${vals.join(',')})`, keys.map(k => row[k] || null))
      imported++
    }
    res.json({ imported, total: data.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Pesquisa global ─────────────────────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q
    if (!q || q.length < 2) return res.json({ results: [] })
    const term = `%${q}%`
    const [imoveis, investidores, consultores, negocios] = await Promise.all([
      pool.query("SELECT id, nome, zona, estado, 'imovel' as tipo FROM imoveis WHERE nome ILIKE $1 OR zona ILIKE $1 OR notas ILIKE $1 LIMIT 10", [term]),
      pool.query("SELECT id, nome, email, status, 'investidor' as tipo FROM investidores WHERE nome ILIKE $1 OR email ILIKE $1 OR telemovel ILIKE $1 LIMIT 10", [term]),
      pool.query("SELECT id, nome, email, estatuto, 'consultor' as tipo FROM consultores WHERE nome ILIKE $1 OR email ILIKE $1 OR contacto ILIKE $1 LIMIT 10", [term]),
      pool.query("SELECT id, movimento, categoria, fase, 'negocio' as tipo FROM negocios WHERE movimento ILIKE $1 OR categoria ILIKE $1 LIMIT 10", [term]),
    ])
    res.json({
      results: [
        ...imoveis.rows, ...investidores.rows,
        ...consultores.rows, ...negocios.rows,
      ],
      total: imoveis.rowCount + investidores.rowCount + consultores.rowCount + negocios.rowCount,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Sync Notion ↔ CRM ─────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try { res.json({ ok: true, results: await syncAllFromNotion() }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/sync/:table', async (req, res) => {
  try { res.json(await syncFromNotion(req.params.table)) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Ficha de detalhe com relações ──────────────────────────────
router.get('/imoveis/:id/full', async (req, res) => {
  try {
    const { rows: [imovel] } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [req.params.id])
    if (!imovel) return res.status(404).json({ error: 'Não encontrado' })
    // Negócios ligados a este imóvel
    const { rows: negocios } = await pool.query('SELECT * FROM negocios WHERE imovel_id = $1', [imovel.id])
    // Consultor (por nome)
    const { rows: consultores } = imovel.nome_consultor
      ? await pool.query('SELECT id, nome, estatuto, classificacao, contacto, email FROM consultores WHERE nome ILIKE $1', [`%${imovel.nome_consultor}%`])
      : { rows: [] }
    // Tarefas
    const { rows: tarefas } = await pool.query("SELECT * FROM tarefas WHERE tarefa ILIKE $1 ORDER BY created_at DESC", [`%${imovel.nome}%`])
    // Análises de rentabilidade
    const { rows: analises } = await pool.query('SELECT * FROM analises WHERE imovel_id = $1 ORDER BY activa DESC, updated_at DESC', [imovel.id])
    // Audit log (timeline)
    const { rows: timeline } = await pool.query("SELECT * FROM audit_log WHERE registo_id = $1 ORDER BY created_at DESC LIMIT 20", [imovel.id])
    // Checklist obrigatória — com auto-complete de campos preenchidos
    const { rows: checklist } = await pool.query('SELECT * FROM checklist_imovel WHERE imovel_id = $1 ORDER BY estado, ordem', [imovel.id])
    const now = new Date().toISOString()
    const autoCompleteIds = []
    for (const item of checklist) {
      if (item.concluida) continue
      if (!item.campo_crm) continue
      // Ignorar campos de análise, negócio, docs, calendário
      if (/^(analise:|negocio:|doc:|tarefa calendario)/.test(item.campo_crm)) continue
      // Verificar campos do imóvel
      const fields = item.campo_crm.split(',').map(f => f.trim()).filter(f => f !== 'notas' && f !== 'fotos')
      if (fields.length === 0) continue
      const allFilled = fields.every(f => {
        const v = imovel[f]
        return v !== null && v !== undefined && v !== '' && v !== 0
      })
      if (allFilled) {
        autoCompleteIds.push(item.id)
        item.concluida = true
        item.concluida_em = now
        item.concluida_por = 'auto'
      }
    }
    // Persistir auto-completes em batch
    if (autoCompleteIds.length > 0) {
      await pool.query(
        `UPDATE checklist_imovel SET concluida = true, concluida_em = $1, concluida_por = 'auto', updated_at = $1
         WHERE id = ANY($2) AND concluida = false`,
        [now, autoCompleteIds]
      )
    }
    // Interacções com consultores (registadas no contexto deste imóvel)
    const { rows: interacoes } = await pool.query(
      `SELECT ci.*, c.nome as consultor_nome FROM consultor_interacoes ci
       LEFT JOIN consultores c ON c.id = ci.consultor_id
       WHERE ci.imovel_id = $1 ORDER BY ci.data_hora DESC`,
      [imovel.id]
    )
    res.json({ ...imovel, negocios, consultores, tarefas, analises, timeline, checklist, interacoes })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/investidores/:id/full', async (req, res) => {
  try {
    const { rows: [inv] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [req.params.id])
    if (!inv) return res.status(404).json({ error: 'Não encontrado' })
    // Negócios onde este investidor aparece — via projeto_investidores, a
    // única fonte real da ligação (investidor_ids é um campo legado, nunca
    // escrito pela app).
    const { rows: negocios } = await pool.query(
      `SELECT n.* FROM negocios n JOIN projeto_investidores pi ON pi.negocio_id = n.id WHERE pi.investidor_id = $1`,
      [inv.id]
    )
    // Tarefas relacionadas
    const { rows: tarefas } = await pool.query("SELECT * FROM tarefas WHERE tarefa ILIKE $1 ORDER BY created_at DESC", [`%${inv.nome}%`])
    const { rows: timeline } = await pool.query("SELECT * FROM audit_log WHERE registo_id = $1 ORDER BY created_at DESC LIMIT 20", [inv.id])
    const { rows: documentos } = await pool.query(
      `SELECT d.*, i.nome as imovel_nome FROM documentos_investidor d LEFT JOIN imoveis i ON i.id = d.imovel_id WHERE d.investidor_id = $1 ORDER BY d.created_at DESC`,
      [inv.id]
    )
    res.json({ ...inv, negocios, tarefas, timeline, documentos })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/consultores/:id/full', async (req, res) => {
  try {
    const { rows: [cons] } = await pool.query('SELECT * FROM consultores WHERE id = $1', [req.params.id])
    if (!cons) return res.status(404).json({ error: 'Não encontrado' })
    // Imóveis deste consultor
    const { rows: imoveis } = await pool.query("SELECT id, nome, estado, tipologia, ask_price, zona, tipo_oportunidade, check_qualidade, data_adicionado FROM imoveis WHERE nome_consultor ILIKE $1", [`%${cons.nome}%`])
    // Negócios
    const { rows: negocios } = await pool.query("SELECT * FROM negocios WHERE consultor_ids LIKE $1", [`%${cons.notion_id ?? cons.id}%`])
    const { rows: tarefas } = await pool.query("SELECT * FROM tarefas WHERE tarefa ILIKE $1 ORDER BY created_at DESC", [`%${cons.nome}%`])
    const { rows: timeline } = await pool.query("SELECT * FROM audit_log WHERE registo_id = $1 ORDER BY created_at DESC LIMIT 20", [cons.id])
    // Interacções (com nome do imóvel quando aplicável)
    const { rows: interacoes } = await pool.query(
      `SELECT ci.*, i.nome as imovel_nome FROM consultor_interacoes ci
       LEFT JOIN imoveis i ON i.id = ci.imovel_id
       WHERE ci.consultor_id = $1 ORDER BY ci.data_hora DESC`,
      [cons.id]
    )
    // Métricas computadas — qualidade baseada no estado do pipeline
    const totalImoveis = imoveis.length
    const somaQualidade = imoveis.reduce((sum, im) => sum + qualidadeImovel(im.estado), 0)
    const taxaQualidade = totalImoveis > 0 ? Math.round(somaQualidade / totalImoveis * 100) : 0
    const imoveisAvancados = imoveis.filter(im => qualidadeImovel(im.estado) >= 0.75).length
    // Tempo médio resposta (Enviado → Resposta)
    let tempoMedio = null
    const sortedInteracoes = [...interacoes].sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
    const tempos = []
    for (let i = 0; i < sortedInteracoes.length; i++) {
      if (sortedInteracoes[i].direcao === 'Enviado') {
        const resposta = sortedInteracoes.slice(i + 1).find(x => isDirecaoResposta(x.direcao))
        if (resposta) {
          const horas = (new Date(resposta.data_hora) - new Date(sortedInteracoes[i].data_hora)) / 3600000
          if (horas >= 0) tempos.push(horas)
        }
      }
    }
    if (tempos.length > 0) tempoMedio = Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length * 10) / 10
    res.json({ ...cons, imoveis, negocios, tarefas, timeline, interacoes, _totalImoveis: totalImoveis, _imoveisAvancados: imoveisAvancados, _taxaQualidade: taxaQualidade, _tempoMedioResposta: tempoMedio })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── KPIs rápidos por tab ──────────────────────────────────────
router.get('/kpis/:tab', async (req, res) => {
  try {
    const tab = req.params.tab
    const regiao = req.regiaoActiva
    // WHERE para tabelas com coluna `regiao` directa
    const wReg = regiao ? `WHERE regiao = $1` : ''
    const wAnd = regiao ? `AND regiao = $1` : ''
    const params = regiao ? [regiao] : []
    // WHERE especial para investidores (pool unificado por regioes_preferidas)
    const wInv = regiao ? `WHERE regioes_preferidas LIKE $1` : ''
    const paramsInv = regiao ? [`%"${regiao}"%`] : []
    if (tab === 'imoveis') {
      const { rows } = await pool.query(`
        SELECT estado, COUNT(*) as count, COALESCE(SUM(ask_price),0) as valor
        FROM imoveis ${wReg} GROUP BY estado ORDER BY count DESC
      `, params)
      // ROI médio: só de imóveis com negocio activo de CAEP ou Fix and Flip.
      // Wholesalling e Mediação Imobiliária são modelos de fee/comissão, não de ROI
      // sobre capital investido — não pertencem a esta métrica.
      const { rows: [totals] } = await pool.query(`
        SELECT
          COUNT(*) AS total,
          COALESCE(
            AVG(NULLIF(i.roi, 0)) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM negocios n
                WHERE n.imovel_id = i.id
                  AND n.deleted_at IS NULL
                  AND n.categoria IN ('CAEP', 'Fix and Flip')
              )
            ),
            0
          ) AS roi_medio
        FROM imoveis i
        ${regiao ? 'WHERE i.regiao = $1' : ''}
      `, params)
      res.json({ byEstado: rows, total: parseInt(totals.total), roiMedio: parseFloat(totals.roi_medio).toFixed(1) })
    } else if (tab === 'investidores') {
      // Excluir cópias duplicadas (Ativo/Passivo) — só contam pessoas únicas.
      // Origens auto-referenciadas (duplicado_de = id) ficam dentro.
      const dupGuard = '(duplicado_de IS NULL OR duplicado_de = id)'
      const wInvDup = wInv ? `${wInv} AND ${dupGuard}` : `WHERE ${dupGuard}`
      const { rows } = await pool.query(`SELECT status, COUNT(*) as count FROM investidores ${wInvDup} GROUP BY status ORDER BY count DESC`, paramsInv)
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total,
          COUNT(CASE WHEN classificacao IN ('A','B') THEN 1 END) as ab,
          COALESCE(SUM(capital_max),0) as capital
        FROM investidores ${wInvDup}
      `, paramsInv)
      res.json({ byStatus: rows, total: parseInt(totals.total), classAB: parseInt(totals.ab), capitalTotal: parseFloat(totals.capital) })
    } else if (tab === 'consultores') {
      const { rows } = await pool.query(`SELECT estatuto, COUNT(*) as count FROM consultores ${wReg} GROUP BY estatuto ORDER BY count DESC`, params)
      const { rows: [totals] } = await pool.query(`SELECT COUNT(*) as total FROM consultores ${wReg}`, params)
      res.json({ byEstatuto: rows, total: parseInt(totals.total) })
    } else if (tab === 'negocios') {
      // negocios tem soft-delete (migração 0020): excluir lixeira senão os KPIs somam apagados.
      const wRegNeg = regiao ? 'WHERE regiao = $1 AND deleted_at IS NULL' : 'WHERE deleted_at IS NULL'
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total, COALESCE(SUM(lucro_estimado),0) as lucro_est,
          COALESCE(SUM(lucro_real),0) as lucro_real,
          COUNT(CASE WHEN fase = 'Vendido' THEN 1 END) as vendidos
        FROM negocios ${wRegNeg}
      `, params)
      res.json(totals)
    } else if (tab === 'despesas') {
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total,
          COALESCE(SUM(CASE WHEN timing = 'Mensalmente' THEN custo_mensal ELSE 0 END),0) as burn_rate,
          COALESCE(SUM(custo_anual),0) as total_anual
        FROM despesas ${wReg}
      `, params)
      res.json(totals)
    } else {
      res.status(404).json({ error: 'Tab not found' })
    }
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Tarefas automáticas por mudança de fase ───────────────────
router.post('/auto-task', async (req, res) => {
  try {
    const { entity, entityId, entityName, newPhase } = req.body

    // Para imóveis: gerar checklist automaticamente
    if (entity === 'imoveis' && entityId) {
      const { CHECKLIST_TEMPLATES } = await import('../constants/checklistTemplates.js')
      const templates = CHECKLIST_TEMPLATES[newPhase]
      if (templates && templates.length > 0) {
        const now = new Date().toISOString()
        let created = 0
        for (let i = 0; i < templates.length; i++) {
          const t = templates[i]
          const id = (await import('crypto')).randomUUID()
          try {
            await pool.query(
              `INSERT INTO checklist_imovel (id, imovel_id, estado, template_key, titulo, campo_crm, categoria, tempo_estimado, obrigatoria, ordem, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
               ON CONFLICT (imovel_id, template_key) DO NOTHING`,
              [id, entityId, newPhase, t.key, t.titulo, t.campo_crm, t.categoria, t.tempo_estimado, t.obrigatoria, i + 1, now, now]
            )
            created++
          } catch (e) { /* duplicado, ignorar */ }
        }
        console.log(`[checklist] ${created} items gerados para ${entityName} → ${newPhase}`)
        return res.json({ ok: true, created: true, count: created })
      }
    }

    // Fallback para investidores/consultores: manter auto-task antigo
    const TASK_MAP = {
      investidores: {
        // Comuns
        'Pendente de Aprovação':              'Aprovar lead {name}',
        'Potencial Investidor':               'Marcar 1ª call com {name}',
        'Marcar call':                        'Marcar call com investidor {name}',
        'Call marcada':                       'Preparar apresentação para {name}',
        'Follow Up':                          'Follow-up com investidor {name}',
        // Passivo
        'Investidor Qualificado em Carteira': 'Procurar deal compatível para {name}',
        'Investidor em parceria':             'Preparar onboarding de {name}',
        // Activo
        'Negociação de Deal':                 'Acompanhar negociação de deal com {name}',
        'Investidor Ativo':                   'Preparar próximo deal para {name}',
      },
      consultores: {
        'Follow up':          'Follow-up com consultor {name}',
        'Aberto Parcerias':   'Formalizar parceria com {name}',
      },
    }
    const taskTemplates = TASK_MAP[entity] ?? {}
    const template = taskTemplates[newPhase]
    if (!template) return res.json({ ok: true, created: false, reason: 'No task for this phase' })

    const tarefa = template.replace('{name}', entityName)
    const id = (await import('crypto')).randomUUID()
    const now = new Date().toISOString()
    await pool.query(
      'INSERT INTO tarefas (id, tarefa, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [id, tarefa, 'A fazer', now, now]
    )
    res.json({ ok: true, created: true, tarefa, id })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Checklist de imóveis ─────────────────────────────────────
router.get('/checklist/progress-batch', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT imovel_id, estado,
              COUNT(*) FILTER (WHERE obrigatoria) as total,
              COUNT(*) FILTER (WHERE obrigatoria AND concluida) as done
       FROM checklist_imovel
       GROUP BY imovel_id, estado`
    )
    const map = {}
    for (const r of rows) {
      if (!map[r.imovel_id]) map[r.imovel_id] = {}
      map[r.imovel_id][r.estado] = { done: parseInt(r.done), total: parseInt(r.total) }
    }
    res.json(map)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/checklist/:imovelId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM checklist_imovel WHERE imovel_id = $1 ORDER BY estado, ordem',
      [req.params.imovelId]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/checklist/:itemId', async (req, res) => {
  try {
    const { concluida, notas, concluida_por } = req.body
    const now = new Date().toISOString()
    const sets = ['updated_at = $2']
    const vals = [req.params.itemId, now]
    let idx = 3
    if (concluida !== undefined) {
      sets.push(`concluida = $${idx}`)
      vals.push(concluida)
      idx++
      sets.push(`concluida_em = $${idx}`)
      vals.push(concluida ? now : null)
      idx++
      sets.push(`concluida_por = $${idx}`)
      vals.push(concluida ? (concluida_por || null) : null)
      idx++
    }
    if (notas !== undefined) {
      sets.push(`notas = $${idx}`)
      vals.push(notas)
      idx++
    }
    const { rows: [item] } = await pool.query(
      `UPDATE checklist_imovel SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      vals
    )
    res.json(item)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/checklist/:imovelId/progress', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT estado,
              COUNT(*) FILTER (WHERE obrigatoria) as total,
              COUNT(*) FILTER (WHERE obrigatoria AND concluida) as done
       FROM checklist_imovel WHERE imovel_id = $1
       GROUP BY estado`,
      [req.params.imovelId]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Relation lookups (para dropdowns nos formulários) ─────────
// Cache local de 120s — lookups raramente mudam, e são chamados em vários
// formulários e selectors no boot.
const _lookupCache = new Map()
function lookupCacheGet(key) {
  const e = _lookupCache.get(key)
  if (e && Date.now() < e.exp) return e.data
  if (e) _lookupCache.delete(key)
  return null
}
function lookupCacheSet(key, data, ttl = 120_000) {
  _lookupCache.set(key, { data, exp: Date.now() + ttl })
}
// Invalida entries cuja key começa por `prefix`. Chamado pelos hooks de
// mutation abaixo: criar/editar/apagar um consultor → invalida consultores:*.
// Sem isto, após criar uma imobiliária nova o frontend recebia até 120s da
// lista antiga (Era Gaia Oriente não aparecia no dropdown da ficha do imóvel).
function lookupCacheInvalidate(prefix) {
  for (const k of _lookupCache.keys()) {
    if (k === prefix || k.startsWith(`${prefix}:`)) _lookupCache.delete(k)
  }
}
async function serveLookup(key, sql, res) {
  try {
    const cached = lookupCacheGet(key)
    if (cached) return res.json(cached)
    const { rows } = await pool.query(sql)
    lookupCacheSet(key, rows)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
}
router.get('/lookup/imoveis', (req, res) =>
  serveLookup('imoveis', "SELECT id, nome, estado FROM imoveis ORDER BY nome", res))
router.get('/lookup/investidores', (req, res) =>
  serveLookup('investidores', "SELECT id, nome, status FROM investidores ORDER BY nome", res))
// Consultores filtram por região quando o header X-Regiao está presente.
// Necessário para o select da ficha do imóvel só sugerir consultores da AMP
// quando o imóvel é da AMP (não faz sentido sugerir consultor de Coimbra).
router.get('/lookup/consultores', (req, res) => {
  const regiao = req.regiaoActiva
  if (regiao) {
    const key = `consultores:${regiao}`
    const sql = `SELECT id, nome, estatuto FROM consultores WHERE regiao = '${regiao.replace(/'/g, "''")}' ORDER BY nome`
    return serveLookup(key, sql, res)
  }
  return serveLookup('consultores', "SELECT id, nome, estatuto, regiao FROM consultores ORDER BY nome", res)
})

// ── Automações PostgreSQL ──────────────────────────────────────
router.post('/automation/score-investidores', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM investidores')
    const { rows: allScorecards } = await pool.query('SELECT * FROM scorecards ORDER BY created_at DESC')
    const updated = []
    const now = new Date().toISOString()

    for (const inv of rows) {
      // Classificação definida pelo formulário de classificação (scorecard manual)
      // manda — automações não a sobrescrevem.
      if (inv.classificacao_origem === 'manual') continue

      // Se tem scorecard, usar a pontuação ponderada do último scorecard
      const ultimoSc = allScorecards.find(s => s.investidor_id === inv.id)
      if (ultimoSc) {
        // Scorecard existe — usar classificação do scorecard (mais precisa)
        if (inv.classificacao !== ultimoSc.classificacao || Math.abs((inv.pontuacao || 0) - ultimoSc.pontuacao_ponderada) > 1) {
          await pool.query('UPDATE investidores SET pontuacao = $1, classificacao = $2, updated_at = $3 WHERE id = $4',
            [ultimoSc.pontuacao_ponderada, ultimoSc.classificacao, now, inv.id])
          updated.push({ nome: inv.nome, score: ultimoSc.pontuacao_ponderada, classificacao: ultimoSc.classificacao, fonte: 'scorecard' })
        }
        continue
      }

      // Sem scorecard — scoring por completude do perfil (SOP 2 simplificado).
      // tipo_principal é o campo que a ficha edita (multi-valor, ex:
      // '["Ativo","Passivo"]') — lê-se este, não o legado tipo_investidor.
      let tiposPrincipal = []
      try { tiposPrincipal = JSON.parse(inv.tipo_principal || '[]') } catch {}
      if (!Array.isArray(tiposPrincipal)) tiposPrincipal = [tiposPrincipal].filter(Boolean)
      const tipo = tiposPrincipal.includes('Ativo') ? 'Ativo' : 'Passivo'

      // C1: Capacidade Financeira. Investidor com os dois perfis usa o
      // limiar mais permissivo (50k de Passivo) — considerar ambos os
      // limiares em vez de aplicar sempre o mais exigente (200k de Ativo).
      const capital = Math.max(inv.capital_min || 0, inv.capital_max || 0)
      const limiteMin = (tiposPrincipal.includes('Ativo') && !tiposPrincipal.includes('Passivo')) ? 200000 : 50000
      const c1 = capital >= limiteMin * 4 ? 5 : capital >= limiteMin * 2 ? 4 : capital >= limiteMin ? 3 : capital > 0 ? 2 : 1

      // C2: Experiência (estimada pelo perfil)
      const estrategia = inv.estrategia ? JSON.parse(inv.estrategia) : []
      const c2 = estrategia.length >= 3 ? 4 : estrategia.length >= 1 ? 3 : inv.data_reuniao ? 2 : 1

      // C3: Alinhamento (estimado por engagement)
      const c3 = inv.data_reuniao && inv.nda_assinado ? 5
        : inv.data_reuniao ? 4
        : inv.data_primeiro_contacto ? 3
        : (inv.telemovel || inv.email) ? 2 : 1

      // C4: Estabilidade
      const c4 = inv.nda_assinado && inv.perfil_risco ? 4
        : inv.nda_assinado || inv.perfil_risco ? 3
        : (inv.telemovel && inv.email) ? 2 : 1

      // C5: Compromisso
      const c5 = inv.montante_investido > 0 ? 5
        : inv.numero_negocios > 0 ? 4
        : inv.data_reuniao ? 3
        : inv.data_primeiro_contacto ? 2 : 1

      const { ponderado, classificacao } = calcularScorecard({ c1, c2, c3, c4, c5 }, tipo)

      if (Math.abs((inv.pontuacao || 0) - ponderado) > 1 || inv.classificacao !== classificacao) {
        await pool.query('UPDATE investidores SET pontuacao = $1, classificacao = $2, updated_at = $3 WHERE id = $4',
          [ponderado, classificacao, now, inv.id])
        updated.push({ nome: inv.nome, score: ponderado, classificacao, fonte: 'perfil', criterios: { c1, c2, c3, c4, c5 } })
      }
    }
    res.json({ ok: true, atualizados: updated.length, detalhes: updated })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// automation/calc-roi removido — usava uma fórmula naive alternativa à da
// calculadora financeira. O ROI apresentado é sempre o da análise activa
// (ver /sync-derivados e propagarParaImovel em analiseRoutes.js).

// automation/score-consultores removido — duplicava score-prioridade-consultores
// (fórmula simples vs ponderada), escrevendo os dois na mesma coluna
// consultores.classificacao com resultados diferentes (achado da auditoria,
// confirmado: um consultor podia aparecer Classe A ou B consoante qual das
// duas tivesse corrido por último). score-prioridade-consultores cobre tudo o
// que esta fazia (imoveis_enviados, classificacao) e mais (score_prioridade,
// taxa_qualidade, tempo_medio_resposta) — fica como única fonte.

router.post('/automation/score-prioridade-consultores', async (req, res) => {
  try {
    const { rows: consultores } = await pool.query('SELECT * FROM consultores')
    const { rows: imoveis } = await pool.query('SELECT nome_consultor, estado, check_qualidade FROM imoveis WHERE nome_consultor IS NOT NULL')
    const { rows: interacoes } = await pool.query('SELECT consultor_id, data_hora, direcao FROM consultor_interacoes ORDER BY data_hora ASC')
    const now = Date.now()

    const leadCounts = consultores.map(c =>
      imoveis.filter(i => i.nome_consultor?.trim().toLowerCase() === c.nome?.trim().toLowerCase()).length
    )
    const maxLeads = Math.max(...leadCounts, 1)

    const updated = []
    const relatorio = { total: consultores.length, reclassificados: 0, semDados: 0, inativos: 0, distribuicao: { A: 0, B: 0, C: 0, D: 0 }, top5: [], mudancas: [], semDadosList: [] }

    for (const c of consultores) {
      const meusImoveis = imoveis.filter(i => i.nome_consultor?.trim().toLowerCase() === c.nome?.trim().toLowerCase())
      // Só contam como entregues os que passaram de Pré-aprovação
      const imoveisEntregues = meusImoveis.filter(im => (im.estado || '').replace(/^\d+-\s*/, '').trim() !== 'Pré-aprovação')
      const totalImoveis = imoveisEntregues.length
      const classeAnterior = c.classificacao

      // Regra: inactivo 60+ dias → manter Inativo, sem classe
      const diasSemUpdate = Math.floor((now - new Date(c.updated_at || c.created_at)) / 86400000)
      const ultimaInteracao = interacoes.filter(i => i.consultor_id === c.id).sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora))[0]
      const diasSemActividade = ultimaInteracao
        ? Math.floor((now - new Date(ultimaInteracao.data_hora)) / 86400000)
        : diasSemUpdate
      const isInativo = diasSemActividade >= 60 && totalImoveis === 0

      if (isInativo) {
        const needsUpdate = c.estado_avaliacao !== 'Inativo'
        if (needsUpdate) {
          await pool.query('UPDATE consultores SET estado_avaliacao = $1, score_prioridade = 0, classificacao = NULL, updated_at = $2 WHERE id = $3',
            ['Inativo', new Date().toISOString(), c.id])
        }
        relatorio.inativos++
        continue
      }

      // Consultor sem imóveis → D, score 0
      if (totalImoveis === 0) {
        const scorePrioridade = 0
        const classificacao = 'D'
        relatorio.distribuicao.D++
        if (c.score_prioridade !== 0 || c.classificacao !== 'D') {
          await pool.query('UPDATE consultores SET score_prioridade = 0, taxa_qualidade = 0, classificacao = $1, imoveis_enviados = 0, updated_at = $2 WHERE id = $3',
            ['D', new Date().toISOString(), c.id])
          if (classeAnterior && classeAnterior !== 'D') relatorio.mudancas.push({ nome: c.nome, de: classeAnterior, para: 'D', score: 0 })
          relatorio.reclassificados++
        }
        relatorio.semDados++
        relatorio.semDadosList.push({ nome: c.nome, motivo: 'Sem imóveis associados' })
        continue
      }

      // Componente 1: Taxa de qualidade (50%) — só imóveis entregues (validados)
      const somaQualidade = imoveisEntregues.reduce((sum, im) => sum + qualidadeImovel(im.estado), 0)
      const taxaQualidade = Math.round(somaQualidade / totalImoveis * 100)

      // Componente 2: Volume normalizado (30%)
      const volumeNorm = Math.min(Math.round(totalImoveis / maxLeads * 100), 100)

      // Componente 3: Velocidade de resposta (20%)
      const minhasInteracoes = interacoes.filter(i => i.consultor_id === c.id)
      const tempos = []
      for (let i = 0; i < minhasInteracoes.length; i++) {
        if (minhasInteracoes[i].direcao === 'Enviado') {
          const resp = minhasInteracoes.slice(i + 1).find(x => isDirecaoResposta(x.direcao))
          if (resp) {
            const horas = (new Date(resp.data_hora) - new Date(minhasInteracoes[i].data_hora)) / 3600000
            if (horas >= 0) tempos.push(horas)
          }
        }
      }
      const tempoMedio = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length * 10) / 10 : null
      const speedScore = tempoMedio != null ? Math.max(0, Math.min(100, Math.round(100 - tempoMedio * 2))) : 50

      // Score final
      const scorePrioridade = Math.round(taxaQualidade * 0.5 + volumeNorm * 0.3 + speedScore * 0.2)
      const classificacao = CLASSE_POR_SCORE(scorePrioridade)
      relatorio.distribuicao[classificacao]++

      const imoveisAvancados = imoveisEntregues.filter(im => qualidadeImovel(im.estado) >= 0.75).length

      const changed = Math.abs((c.score_prioridade || 0) - scorePrioridade) > 0.5 ||
                       Math.abs((c.taxa_qualidade || 0) - taxaQualidade) > 0.5 ||
                       (c.tempo_medio_resposta || null) !== tempoMedio ||
                       c.classificacao !== classificacao ||
                       (c.imoveis_enviados || 0) !== totalImoveis

      if (changed) {
        await pool.query(
          `UPDATE consultores SET score_prioridade = $1, taxa_qualidade = $2, tempo_medio_resposta = $3,
           classificacao = $4, imoveis_enviados = $5, updated_at = $6 WHERE id = $7`,
          [scorePrioridade, taxaQualidade, tempoMedio, classificacao, totalImoveis, new Date().toISOString(), c.id]
        )
        relatorio.reclassificados++
        if (classeAnterior && classeAnterior !== classificacao) {
          relatorio.mudancas.push({ nome: c.nome, de: classeAnterior, para: classificacao, score: scorePrioridade })
        }
      }

      if (tempoMedio === null) {
        relatorio.semDadosList.push({ nome: c.nome, motivo: 'Sem log de interacções (velocidade = 50 neutro)' })
      }

      updated.push({ nome: c.nome, scorePrioridade, taxaQualidade, tempoMedio, classificacao, classeAnterior, imoveisReais: totalImoveis, imoveisAvancados })
    }

    // Top 5
    relatorio.top5 = updated.sort((a, b) => b.scorePrioridade - a.scorePrioridade).slice(0, 5).map(u => ({
      nome: u.nome, score: u.scorePrioridade, classe: u.classificacao, imoveis: u.imoveisReais, qualidade: u.taxaQualidade
    }))

    res.json({ ok: true, atualizados: relatorio.reclassificados, relatorio, detalhes: updated })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Relatório semanal de investidores ────────────────────────
router.get('/relatorio/investidores', async (req, res) => {
  try {
    // Excluir cópias duplicadas (Ativo/Passivo) — só contam pessoas únicas.
    const { rows: investidores } = await pool.query(
      'SELECT * FROM investidores WHERE duplicado_de IS NULL OR duplicado_de = id ORDER BY pontuacao DESC NULLS LAST'
    )
    const { rows: negocios } = await pool.query('SELECT * FROM negocios')
    const { rows: reunioes } = await pool.query("SELECT id, entidade_id, data, duracao_min FROM reunioes WHERE entidade_tipo = 'investidores'")
    // Ligação real investidor↔negócio — investidor_ids é campo legado, nunca escrito pela app.
    const { rows: projInv } = await pool.query('SELECT negocio_id, investidor_id FROM projeto_investidores')
    const now = new Date()

    const statusOrder = ['Pendente de Aprovação','Potencial Investidor','Marcar call','Call marcada','Follow Up','Investidor Qualificado em Carteira','Negociação de Deal','Investidor em parceria','Investidor Ativo','Não qualificado','Inactivo']

    const report = {
      gerado_em: now.toISOString(),
      semana: `${now.toISOString().slice(0, 10)} (Semana ${Math.ceil(now.getDate() / 7)})`,
      total_investidores: investidores.length,
      distribuicao: { A: 0, B: 0, C: 0, D: 0, 'Sem classificação': 0 },
      por_status: {},
      top5: [],
      investidores_detalhados: [],
      alertas: { sem_contacto_30d: 0, sem_reuniao: 0, sem_capital: 0, sem_classificacao: 0, nda_pendente: 0 },
      metricas_globais: {
        capital_total: 0, capital_investido: 0, media_capital: 0,
        com_reuniao: 0, com_nda: 0, em_parceria: 0,
        taxa_conversao: 0, ticket_medio: 0,
      },
    }

    for (const s of statusOrder) report.por_status[s] = 0

    let somaCapital = 0, comCapital = 0

    for (const inv of investidores) {
      const classe = inv.classificacao || 'Sem classificação'
      if (report.distribuicao[classe] !== undefined) report.distribuicao[classe]++
      else report.distribuicao['Sem classificação']++

      const status = inv.status || '?'
      if (report.por_status[status] !== undefined) report.por_status[status]++
      else report.por_status[status] = (report.por_status[status] || 0) + 1

      const capitalMax = inv.capital_max || 0
      const montante = inv.montante_investido || 0
      const meusNegocioIds = new Set(projInv.filter(pi => pi.investidor_id === inv.id).map(pi => pi.negocio_id))
      const meusNegocios = negocios.filter(n => meusNegocioIds.has(n.id))
      const minhasReunioes = reunioes.filter(r => r.entidade_id === inv.id)

      const diasSemContacto = inv.data_ultimo_contacto
        ? Math.floor((now - new Date(inv.data_ultimo_contacto)) / 86400000)
        : null

      // Alertas
      if (!inv.data_ultimo_contacto || diasSemContacto > 30) report.alertas.sem_contacto_30d++
      if (minhasReunioes.length === 0) report.alertas.sem_reuniao++
      if (!capitalMax) report.alertas.sem_capital++
      if (!inv.classificacao) report.alertas.sem_classificacao++
      if (!inv.nda_assinado && ['Investidor Qualificado em Carteira','Investidor em parceria','Negociação de Deal','Investidor Ativo'].includes(status)) report.alertas.nda_pendente++

      // Métricas
      if (capitalMax > 0) { somaCapital += capitalMax; comCapital++ }
      report.metricas_globais.capital_total += capitalMax
      report.metricas_globais.capital_investido += montante
      if (minhasReunioes.length > 0) report.metricas_globais.com_reuniao++
      if (inv.nda_assinado) report.metricas_globais.com_nda++
      if (status === 'Investidor em parceria' || status === 'Investidor Ativo') report.metricas_globais.em_parceria++

      let estrategias = []
      try { estrategias = JSON.parse(inv.estrategia || '[]') } catch {}

      report.investidores_detalhados.push({
        id: inv.id, nome: inv.nome, status, classificacao: inv.classificacao || null,
        pontuacao: inv.pontuacao || 0, capitalMax, montanteInvestido: montante,
        email: inv.email, telemovel: inv.telemovel,
        estrategias, perfilRisco: inv.perfil_risco,
        ndaAssinado: !!inv.nda_assinado,
        reunioes: minhasReunioes.length, negocios: meusNegocios.length,
        diasSemContacto, proximaAcao: inv.proxima_acao, dataProximaAcao: inv.data_proxima_acao,
        dataReuniao: inv.data_reuniao, dataPrimeiroContacto: inv.data_primeiro_contacto,
      })
    }

    report.metricas_globais.media_capital = comCapital > 0 ? Math.round(somaCapital / comCapital) : 0
    report.metricas_globais.taxa_conversao = investidores.length > 0
      ? Math.round(report.metricas_globais.em_parceria / investidores.length * 100) : 0
    report.metricas_globais.ticket_medio = report.metricas_globais.em_parceria > 0
      ? Math.round(report.metricas_globais.capital_investido / report.metricas_globais.em_parceria) : 0

    report.top5 = report.investidores_detalhados
      .filter(i => i.capitalMax > 0)
      .sort((a, b) => b.capitalMax - a.capitalMax)
      .slice(0, 5)
      .map(i => ({ nome: i.nome, classificacao: i.classificacao, capital: i.capitalMax, status: i.status, reunioes: i.reunioes }))

    res.json(report)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Scorecards Discovery Call (SOP 2) ───────────────────────

// Pesos por tipo de investidor (soma = 100%)
const PESOS_SCORECARD = {
  Passivo: { c1: 0.20, c2: 0.10, c3: 0.30, c4: 0.20, c5: 0.20 },
  Ativo:   { c1: 0.25, c2: 0.30, c3: 0.20, c4: 0.15, c5: 0.10 },
}

const CRITERIOS_LABELS = {
  c1: 'Capacidade Financeira',
  c2: 'Experiência Imobiliária',
  c3: 'Alinhamento Estratégico',
  c4: 'Estabilidade e Credibilidade',
  c5: 'Disponibilidade e Compromisso',
}

// Rubrica detalhada de pontuação (1-5) por critério e tipo
const RUBRICA = {
  Passivo: {
    c1: [
      { min: 1, max: 1, desc: 'Sem capital mobilizável ou < €30.000' },
      { min: 2, max: 2, desc: '€30.000–€49.999, mobilização > 60 dias' },
      { min: 3, max: 3, desc: '€50.000–€99.999, mobilizável em 30 dias' },
      { min: 4, max: 4, desc: '€100.000–€199.999, conta corrente/depósito' },
      { min: 5, max: 5, desc: '≥ €200.000, capital exclusivo, mobilização imediata' },
    ],
    c2: [
      { min: 1, max: 1, desc: 'Sem experiência de investimento' },
      { min: 2, max: 2, desc: 'Experiência em depósitos/certificados apenas' },
      { min: 3, max: 3, desc: 'Investimentos diversificados (ações, fundos)' },
      { min: 4, max: 4, desc: 'Investimento imobiliário indireto (fundos, REITs)' },
      { min: 5, max: 5, desc: 'Investimentos imobiliários diretos anteriores' },
    ],
    c3: [
      { min: 1, max: 1, desc: 'Expectativas irrealistas ou quer controlo operacional' },
      { min: 2, max: 2, desc: 'ROI esperado acima do mercado, pouca flexibilidade' },
      { min: 3, max: 3, desc: 'ROI realista mas baixa tolerância a imprevistos' },
      { min: 4, max: 4, desc: 'Alinhado com modelo Somnium, aceita volatilidade' },
      { min: 5, max: 5, desc: 'Totalmente alinhado, delega operação, foco longo prazo' },
    ],
    c4: [
      { min: 1, max: 1, desc: 'Incoerências graves entre Forms e entrevista' },
      { min: 2, max: 2, desc: 'Resistente a documentação KYC' },
      { min: 3, max: 3, desc: 'Coerente mas sem documentação imediata' },
      { min: 4, max: 4, desc: 'Coerente, KYC parcial, origem capital clara' },
      { min: 5, max: 5, desc: 'Totalmente coerente, KYC completo, referências' },
    ],
    c5: [
      { min: 1, max: 1, desc: 'Sem data de decisão, apenas curiosidade' },
      { min: 2, max: 2, desc: 'Interessado mas com impedimentos indefinidos' },
      { min: 3, max: 3, desc: 'Decisão em 60–90 dias, capital parcialmente reservado' },
      { min: 4, max: 4, desc: 'Decisão em 30 dias, capital reservado' },
      { min: 5, max: 5, desc: 'Pronto para investir, capital disponível, sem impedimentos' },
    ],
  },
  Ativo: {
    c1: [
      { min: 1, max: 1, desc: 'Sem capital ou < €100.000' },
      { min: 2, max: 2, desc: '€100.000–€149.999, sem reserva contingência' },
      { min: 3, max: 3, desc: '€150.000–€199.999, cobre aquisição mas não obra' },
      { min: 4, max: 4, desc: '€200.000–€299.999, cobre aquisição + obra' },
      { min: 5, max: 5, desc: '≥ €300.000, com reserva contingência, sem pressão liquidez' },
    ],
    c2: [
      { min: 1, max: 1, desc: 'Sem experiência em gestão de obra' },
      { min: 2, max: 2, desc: '1 obra gerida, sem empreiteiro fixo' },
      { min: 3, max: 3, desc: '2-3 obras, empreiteiro ocasional, conhece preços' },
      { min: 4, max: 4, desc: '3-5 obras, empreiteiro de confiança, gestão sólida' },
      { min: 5, max: 5, desc: '5+ obras, equipa própria, estimativas precisas' },
    ],
    c3: [
      { min: 1, max: 1, desc: 'Quer fazer à sua maneira, não aceita modelo Somnium' },
      { min: 2, max: 2, desc: 'Aceita parceria mas com muitas condições' },
      { min: 3, max: 3, desc: 'Alinhado parcialmente, necessita alinhamento' },
      { min: 4, max: 4, desc: 'Aceita modelo Somnium, experiência com parcerias' },
      { min: 5, max: 5, desc: 'Totalmente alinhado, historial de parcerias bem-sucedidas' },
    ],
    c4: [
      { min: 1, max: 1, desc: 'Sem historial verificável, incoerências' },
      { min: 2, max: 2, desc: 'Historial parcial, recusa documentação' },
      { min: 3, max: 3, desc: 'Coerente, historial parcialmente verificável' },
      { min: 4, max: 4, desc: 'Historial sólido, KYC parcial, sem litígios' },
      { min: 5, max: 5, desc: 'Historial exemplar, KYC completo, referências verificadas' },
    ],
    c5: [
      { min: 1, max: 1, desc: 'Sem equipa, sem agenda, sem capital imediato' },
      { min: 2, max: 2, desc: 'Capital OK mas sem empreiteiro disponível' },
      { min: 3, max: 3, desc: 'Capital + empreiteiro em 60 dias' },
      { min: 4, max: 4, desc: 'Capital + empreiteiro em 30 dias, agenda livre' },
      { min: 5, max: 5, desc: 'Tudo pronto: capital, empreiteiro, agenda, foco total' },
    ],
  },
}

function calcularScorecard(scores, tipo) {
  const pesos = PESOS_SCORECARD[tipo] || PESOS_SCORECARD.Passivo
  const total = (scores.c1 || 0) + (scores.c2 || 0) + (scores.c3 || 0) + (scores.c4 || 0) + (scores.c5 || 0)
  const ponderado = (
    (scores.c1 || 0) * pesos.c1 +
    (scores.c2 || 0) * pesos.c2 +
    (scores.c3 || 0) * pesos.c3 +
    (scores.c4 || 0) * pesos.c4 +
    (scores.c5 || 0) * pesos.c5
  ) * 20 // normalizar para 0-100

  const classificacao = ponderado >= 88 ? 'A' : ponderado >= 72 ? 'B' : ponderado >= 56 ? 'C' : 'D'
  return { total, ponderado: Math.round(ponderado * 100) / 100, classificacao }
}

// GET rubrica (para o frontend mostrar as descrições)
router.get('/scorecards/rubrica', (req, res) => {
  res.json({ pesos: PESOS_SCORECARD, criterios: CRITERIOS_LABELS, rubrica: RUBRICA })
})

// GET scorecards de um investidor
router.get('/scorecards/:investidorId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM scorecards WHERE investidor_id = $1 ORDER BY created_at DESC',
      [req.params.investidorId]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST criar scorecard (manual ou automático via transcrição)
router.post('/scorecards', async (req, res) => {
  try {
    const { investidor_id, reuniao_id, tipo_investidor, c1_score, c2_score, c3_score, c4_score, c5_score,
      c1_notas, c2_notas, c3_notas, c4_notas, c5_notas, avaliador, fonte } = req.body

    if (!investidor_id) return res.status(400).json({ error: 'investidor_id obrigatório' })

    const tipo = tipo_investidor || 'Passivo'
    const scores = { c1: +c1_score || 0, c2: +c2_score || 0, c3: +c3_score || 0, c4: +c4_score || 0, c5: +c5_score || 0 }
    const { total, ponderado, classificacao } = calcularScorecard(scores, tipo)

    const id = randomUUID()
    const now = new Date().toISOString()

    await pool.query(
      `INSERT INTO scorecards (id, investidor_id, reuniao_id, tipo_investidor,
        c1_score, c2_score, c3_score, c4_score, c5_score,
        c1_notas, c2_notas, c3_notas, c4_notas, c5_notas,
        pontuacao_total, pontuacao_ponderada, classificacao,
        avaliador, fonte, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)`,
      [id, investidor_id, reuniao_id || null, tipo,
        scores.c1, scores.c2, scores.c3, scores.c4, scores.c5,
        c1_notas || null, c2_notas || null, c3_notas || null, c4_notas || null, c5_notas || null,
        total, ponderado, classificacao,
        avaliador || 'Sistema', fonte || 'manual', now]
    )

    // Buscar classificação anterior do investidor
    const { rows: [inv] } = await pool.query('SELECT classificacao, pontuacao FROM investidores WHERE id = $1', [investidor_id])

    // Auto-promoção: scorecard guardado durante "Call marcada" ou "Follow Up"
    // promove para "Investidor Qualificado em Carteira" (independente do tipo).
    // classificacao_origem='manual': isto é o formulário de classificação
    // preenchido pela equipa — a partir daqui manda sobre as automações.
    await pool.query(
      `UPDATE investidores SET classificacao = $1, pontuacao = $2,
        status = CASE WHEN status IN ('Call marcada','Follow Up') THEN 'Investidor Qualificado em Carteira' ELSE status END,
        classificacao_origem = 'manual', classificacao_definida_em = $3,
        updated_at = $3 WHERE id = $4`,
      [classificacao, ponderado, now, investidor_id]
    )

    // Registar no histórico de classificação
    await pool.query(
      `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova,
        pontuacao_anterior, pontuacao_nova, motivo, tipo, scorecard_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [randomUUID(), investidor_id, inv?.classificacao || null, classificacao,
        inv?.pontuacao || 0, ponderado, 'Scorecard Discovery Call', fonte || 'manual', id, now]
    )

    res.json({
      ok: true, id, classificacao, pontuacao_ponderada: ponderado, pontuacao_total: total,
      classificacao_anterior: inv?.classificacao || null,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET histórico de classificação de um investidor
router.get('/classificacao-historico/:investidorId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM classificacao_historico WHERE investidor_id = $1 ORDER BY created_at DESC',
      [req.params.investidorId]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Duplicar investidor (Ativo ↔ Passivo) ───────────────────
// /investidores/:id/duplicar removido (ver B3 da auditoria) — tipo_principal
// passou a ser multi-valor: um investidor pode ser Activo e Passivo em
// simultâneo no mesmo registo, já não é preciso criar uma segunda ficha.

// ── Reclassificação periódica (30/60/90 dias follow-up) ─────

const FOLLOWUP_INVESTIDOR_RULES = {
  A: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, penalizacao_quente: 0, penalizacao_intermedio: 5, penalizacao_frio: 15 },
  B: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, penalizacao_quente: 0, penalizacao_intermedio: 8, penalizacao_frio: 20 },
  C: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, penalizacao_quente: 0, penalizacao_intermedio: 10, penalizacao_frio: 25 },
  D: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, penalizacao_quente: 0, penalizacao_intermedio: 5, penalizacao_frio: 10 },
}

router.post('/automation/reclassificar-investidores', async (req, res) => {
  try {
    const { rows: investidores } = await pool.query('SELECT * FROM investidores')
    const { rows: allScorecards } = await pool.query('SELECT * FROM scorecards ORDER BY created_at DESC')
    const now = new Date()
    const updated = []
    const alertas = { promovidos: [], despromovidos: [], follow_up_urgente: [], arquivo: [] }

    for (const inv of investidores) {
      if (!inv.classificacao || inv.classificacao === 'D') continue
      // Classificação definida pelo formulário de classificação (scorecard manual)
      // manda — automações não a sobrescrevem.
      if (inv.classificacao_origem === 'manual') continue

      // Último scorecard
      const ultimoScorecard = allScorecards.find(s => s.investidor_id === inv.id)
      if (!ultimoScorecard) continue

      // Calcular dias sem contacto
      const ultimoContacto = inv.data_ultimo_contacto || inv.data_reuniao || inv.data_primeiro_contacto
      if (!ultimoContacto) continue

      const diasSem = Math.floor((now - new Date(ultimoContacto)) / 86400000)
      const rules = FOLLOWUP_INVESTIDOR_RULES[inv.classificacao] || FOLLOWUP_INVESTIDOR_RULES.C

      // Calcular penalização baseada no tempo sem contacto
      let penalizacao = 0
      let tipoFollowUp = null

      if (diasSem >= rules.dias_frio) {
        penalizacao = rules.penalizacao_frio
        tipoFollowUp = 'frio'
      } else if (diasSem >= rules.dias_intermedio) {
        penalizacao = rules.penalizacao_intermedio
        tipoFollowUp = 'intermedio'
      } else if (diasSem >= rules.dias_quente) {
        penalizacao = rules.penalizacao_quente
        tipoFollowUp = 'quente'
      }

      if (penalizacao === 0) continue

      // Bónus por engagement positivo
      let bonus = 0
      if (inv.nda_assinado) bonus += 5
      if (inv.montante_investido > 0) bonus += 10
      if (inv.numero_negocios > 0) bonus += 10

      const pontuacaoAjustada = Math.max(0, Math.min(100, (inv.pontuacao || 0) - penalizacao + bonus))
      const novaClassificacao = pontuacaoAjustada >= 88 ? 'A' : pontuacaoAjustada >= 72 ? 'B' : pontuacaoAjustada >= 56 ? 'C' : 'D'

      if (novaClassificacao !== inv.classificacao || Math.abs(pontuacaoAjustada - (inv.pontuacao || 0)) > 1) {
        const motivo = `Reclassificação periódica — ${diasSem}d sem contacto (follow-up ${tipoFollowUp}), penalização ${penalizacao}pts` +
          (bonus > 0 ? `, bónus engagement +${bonus}pts` : '')

        await pool.query(
          'UPDATE investidores SET classificacao = $1, pontuacao = $2, data_follow_up = $3, updated_at = $3 WHERE id = $4',
          [novaClassificacao, pontuacaoAjustada, now.toISOString(), inv.id]
        )

        await pool.query(
          `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova,
            pontuacao_anterior, pontuacao_nova, motivo, tipo, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [randomUUID(), inv.id, inv.classificacao, novaClassificacao,
            inv.pontuacao || 0, pontuacaoAjustada, motivo, 'reclassificacao_periodica', now.toISOString()]
        )

        const mudanca = { nome: inv.nome, de: inv.classificacao, para: novaClassificacao,
          pontuacao_de: inv.pontuacao || 0, pontuacao_para: pontuacaoAjustada, diasSem, tipoFollowUp }
        updated.push(mudanca)

        if (novaClassificacao > inv.classificacao) alertas.despromovidos.push(mudanca)
        else alertas.promovidos.push(mudanca)

        // Classe C sem evolução há 180 dias → sugerir arquivo
        if (novaClassificacao === 'C' || novaClassificacao === 'D') {
          const primContacto = inv.data_primeiro_contacto ? new Date(inv.data_primeiro_contacto) : null
          if (primContacto && Math.floor((now - primContacto) / 86400000) > 180) {
            alertas.arquivo.push({ nome: inv.nome, classificacao: novaClassificacao, diasTotal: Math.floor((now - primContacto) / 86400000) })
          }
        }
      }

      // Alertas de follow-up urgente (sem reclassificação mas perto)
      if (tipoFollowUp === 'intermedio' && novaClassificacao === inv.classificacao) {
        alertas.follow_up_urgente.push({ nome: inv.nome, classificacao: inv.classificacao, diasSem, proximoLimite: rules.dias_frio })
      }
    }

    res.json({ ok: true, atualizados: updated.length, detalhes: updated, alertas })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Relatório semanal de consultores ─────────────────────────
router.get('/relatorio/consultores', async (req, res) => {
  try {
    const { rows: consultores } = await pool.query('SELECT * FROM consultores ORDER BY score_prioridade DESC NULLS LAST')
    const { rows: imoveis } = await pool.query('SELECT nome_consultor, estado, check_qualidade FROM imoveis WHERE nome_consultor IS NOT NULL')
    const { rows: interacoes } = await pool.query('SELECT consultor_id, data_hora, direcao FROM consultor_interacoes')
    const now = new Date()

    const leadCounts = consultores.map(c =>
      imoveis.filter(i => i.nome_consultor?.trim().toLowerCase() === c.nome?.trim().toLowerCase()).length
    )
    const maxLeads = Math.max(...leadCounts, 1)

    const report = {
      gerado_em: now.toISOString(),
      semana: `${now.toISOString().slice(0, 10)} (Semana ${Math.ceil((now.getDate()) / 7)})`,
      total_consultores: consultores.length,
      distribuicao: { A: 0, B: 0, C: 0, D: 0, Inativo: 0 },
      top5: [],
      consultores_detalhados: [],
      alertas: { sem_contacto_48h: 0, inativos_15d: 0, inativos_60d: 0 },
      metricas_globais: { media_score: 0, media_qualidade: 0, total_imoveis: imoveis.length, consultores_com_imoveis: 0, consultores_com_interacoes: 0 },
    }

    let somaScore = 0, somaQual = 0, comImoveis = 0

    for (const c of consultores) {
      const meusImoveis = imoveis.filter(i => i.nome_consultor?.trim().toLowerCase() === c.nome?.trim().toLowerCase())
      const totalIm = meusImoveis.length
      const minhasInt = interacoes.filter(i => i.consultor_id === c.id)

      const somaQ = meusImoveis.reduce((sum, im) => sum + qualidadeImovel(im.estado), 0)
      const tq = totalIm > 0 ? Math.round(somaQ / totalIm * 100) : 0
      const vol = Math.min(Math.round(totalIm / maxLeads * 100), 100)

      const tempos = []
      for (let i = 0; i < minhasInt.length; i++) {
        if (minhasInt[i].direcao === 'Enviado') {
          const resp = minhasInt.slice(i + 1).find(x => isDirecaoResposta(x.direcao))
          if (resp) { const h = (new Date(resp.data_hora) - new Date(minhasInt[i].data_hora)) / 3600000; if (h >= 0) tempos.push(h) }
        }
      }
      const tmr = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length * 10) / 10 : null
      const sp = tempos.length > 0 ? Math.max(0, Math.min(100, Math.round(100 - tmr * 2))) : 50

      const score = totalIm > 0 ? Math.round(tq * 0.5 + vol * 0.3 + sp * 0.2) : 0
      const classe = totalIm > 0 ? CLASSE_POR_SCORE(score) : 'D'

      const diasCriado = Math.floor((now - new Date(c.created_at)) / 86400000)
      const ultimaInt = minhasInt.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora))[0]
      const diasSemContacto = ultimaInt ? Math.floor((now - new Date(ultimaInt.data_hora)) / 86400000) : null

      report.distribuicao[classe]++
      if (totalIm > 0) { comImoveis++; somaScore += score; somaQual += tq }
      if (minhasInt.length > 0) report.metricas_globais.consultores_com_interacoes++
      if (diasCriado > 2 && minhasInt.length === 0) report.alertas.sem_contacto_48h++
      if (diasSemContacto > 15) report.alertas.inativos_15d++
      if (diasSemContacto > 60 || (diasSemContacto === null && diasCriado > 60)) report.alertas.inativos_60d++

      const imoveisDetalhe = meusImoveis.map(im => ({
        nome: im.nome_consultor, estado: (im.estado || '').replace(/^\d+-\s*/, ''),
        qualidade: Math.round(qualidadeImovel(im.estado) * 100)
      }))

      report.consultores_detalhados.push({
        nome: c.nome, score, classe, classeLabel: CLASSE_LABEL[classe] || classe,
        taxaQualidade: tq, volume: totalIm, tempoResposta: tmr,
        estatuto: c.estatuto, agencia: (() => { try { return JSON.parse(c.imobiliaria || '[]').join(', ') } catch { return '' } })(),
        contacto: c.contacto, email: c.email,
        diasSemContacto, proximoFollowUp: c.data_proximo_follow_up,
        imoveis: imoveisDetalhe, interacoes: minhasInt.length,
      })
    }

    report.metricas_globais.consultores_com_imoveis = comImoveis
    report.metricas_globais.media_score = comImoveis > 0 ? Math.round(somaScore / comImoveis) : 0
    report.metricas_globais.media_qualidade = comImoveis > 0 ? Math.round(somaQual / comImoveis) : 0
    report.top5 = report.consultores_detalhados.filter(c => c.score > 0).slice(0, 5).map(c => ({
      nome: c.nome, score: c.score, classe: c.classe, imoveis: c.volume, qualidade: c.taxaQualidade
    }))

    res.json(report)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/automation/run-all', async (req, res) => {
  try {
    const base = `http://localhost:${process.env.PORT ?? 3001}`
    const results = {}
    for (const ep of ['score-investidores', 'score-prioridade-consultores']) {
      try {
        const r = await fetch(`${base}/api/crm/automation/${ep}`, { method: 'POST' })
        results[ep] = await r.json()
      } catch (e) { results[ep] = { error: e.message } }
    }
    res.json({ ok: true, results })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Audit log ─────────────────────────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    const { limit = 50, tabela } = req.query
    let query = 'SELECT * FROM audit_log'
    const params = []
    if (tabela) { query += ' WHERE tabela = $1'; params.push(tabela) }
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`
    params.push(+limit)
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Undo (reverter alteração via audit log) ──────────────────
router.post('/undo/:auditId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM audit_log WHERE id = $1', [req.params.auditId])
    if (!rows[0]) return res.status(404).json({ error: 'Entrada não encontrada' })
    const entry = rows[0]
    const tabela = entry.tabela
    const registoId = entry.registo_id

    if (entry.acao === 'UPDATE' && entry.dados_anteriores) {
      // Reverter UPDATE: restaurar dados anteriores
      const anterior = JSON.parse(entry.dados_anteriores)
      const SKIP = new Set(['id', 'created_at', 'notion_id'])
      const fields = Object.entries(anterior).filter(([k]) => !SKIP.has(k))
      const sets = fields.map(([k], i) => `${k} = $${i + 1}`)
      const params = [...fields.map(([, v]) => v), registoId]
      await pool.query(`UPDATE ${tabela} SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
      // Log the undo
      await pool.query(
        'INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)',
        [tabela, registoId, 'UNDO', entry.dados_novos, entry.dados_anteriores]
      )
      res.json({ ok: true, action: 'restored', tabela, registoId })

    } else if (entry.acao === 'DELETE' && entry.dados_anteriores) {
      // Reverter DELETE: re-inserir o registo
      const anterior = JSON.parse(entry.dados_anteriores)
      const fields = Object.entries(anterior).filter(([, v]) => v !== undefined && v !== null)
      const cols = fields.map(([k]) => k)
      const vals = fields.map((_, i) => `$${i + 1}`)
      const params = fields.map(([, v]) => v)
      await pool.query(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT (id) DO NOTHING`, params)
      await pool.query(
        'INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)',
        [tabela, registoId, 'UNDO_DELETE', null, entry.dados_anteriores]
      )
      res.json({ ok: true, action: 'restored_deleted', tabela, registoId })

    } else if (entry.acao === 'INSERT') {
      // Reverter INSERT: apagar o registo criado
      await pool.query(`DELETE FROM ${tabela} WHERE id = $1`, [registoId])
      await pool.query(
        'INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)',
        [tabela, registoId, 'UNDO_INSERT', entry.dados_novos, null]
      )
      res.json({ ok: true, action: 'deleted_created', tabela, registoId })

    } else {
      res.status(400).json({ error: 'Não é possível reverter esta ação' })
    }
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Backup ────────────────────────────────────────────────────
const BACKUP_TABLES = ['imoveis', 'investidores', 'consultores', 'negocios', 'despesas', 'tarefas']

router.get('/backup', async (req, res) => {
  try {
    const backup = {}
    let total = 0
    for (const t of BACKUP_TABLES) {
      const { rows } = await pool.query(`SELECT * FROM ${t}`)
      backup[t] = rows
      total += rows.length
    }
    // Incluir audit log
    const { rows: audit } = await pool.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500')
    backup.audit_log = audit
    backup.exported_at = new Date().toISOString()
    backup.total = total
    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename=somnium-backup-${new Date().toISOString().slice(0,10)}.json`)
    }
    res.json(backup)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Backup automático — guarda snapshot na tabela backups
router.post('/backup/auto', async (req, res) => {
  try {
    // Criar tabela de backups se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS backups (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        total_registos INT DEFAULT 0,
        created_at TEXT DEFAULT (NOW()::TEXT)
      )
    `)
    const backup = {}
    let total = 0
    for (const t of BACKUP_TABLES) {
      const { rows } = await pool.query(`SELECT * FROM ${t}`)
      backup[t] = rows
      total += rows.length
    }
    await pool.query(
      'INSERT INTO backups (data, total_registos, created_at) VALUES ($1, $2, $3)',
      [JSON.stringify(backup), total, new Date().toISOString()]
    )
    // Manter só os últimos 30 backups
    await pool.query(`DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY created_at DESC LIMIT 30)`)
    res.json({ ok: true, total, timestamp: new Date().toISOString() })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Listar backups disponíveis
router.get('/backup/list', async (req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS backups (id SERIAL PRIMARY KEY, data JSONB NOT NULL, total_registos INT DEFAULT 0, created_at TEXT DEFAULT (NOW()::TEXT))`)
    const { rows } = await pool.query('SELECT id, total_registos, created_at FROM backups ORDER BY created_at DESC LIMIT 30')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Restaurar backup específico
router.post('/backup/restore/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM backups WHERE id = $1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Backup não encontrado' })

    // Restauração regional: parâmetros opcionais.
    //  • req.body.regiao = 'Coimbra' | 'AMP' → restaurar APENAS registos dessa região.
    //  • req.body.confirm_perda_amp = true → autoriza restaurar globalmente
    //    mesmo que o backup seja anterior à expansão AMP (apaga AMP).
    //  Sem nenhum dos dois: bloqueia se detectar perda cross-regional.
    const restoreRegiao = (req.body?.regiao === 'AMP' || req.body?.regiao === 'Coimbra') ? req.body.regiao : null
    const confirmPerdaAmp = req.body?.confirm_perda_amp === true

    // Detectar se o backup é pré-AMP: imóveis no backup com regiao IS NULL/Coimbra apenas
    const backup = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data
    const backupTemAmp = (backup.imoveis || []).some(r => r.regiao === 'AMP')
        || (backup.consultores || []).some(r => r.regiao === 'AMP')
        || (backup.negocios || []).some(r => r.regiao === 'AMP')
    // Detectar dados AMP actuais que seriam apagados num restore global
    // guard:deleted-at-ok — conta linhas FÍSICAS (incl. lixeira) p/ avisar de perda real num restore
    const { rows: ampActual } = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM imoveis WHERE regiao = 'AMP') AS imoveis,
              (SELECT COUNT(*)::int FROM consultores WHERE regiao = 'AMP') AS consultores,
              (SELECT COUNT(*)::int FROM negocios WHERE regiao = 'AMP') AS negocios`,
    )
    const totalAmpAtual = (ampActual[0]?.imoveis || 0) + (ampActual[0]?.consultores || 0) + (ampActual[0]?.negocios || 0)
    if (!restoreRegiao && !backupTemAmp && totalAmpAtual > 0 && !confirmPerdaAmp) {
      return res.status(409).json({
        error: 'Restore bloqueado: backup é anterior à expansão AMP e existem ' + totalAmpAtual +
          ' registos AMP que seriam perdidos. Reenvie com {"confirm_perda_amp":true} para forçar, ' +
          'ou {"regiao":"Coimbra"} para restaurar só Coimbra preservando AMP.',
        amp_atual: ampActual[0],
        backup_tem_amp: backupTemAmp,
      })
    }

    // Primeiro fazer backup do estado actual (safety net)
    const currentBackup = {}
    let currentTotal = 0
    for (const t of BACKUP_TABLES) {
      const { rows: current } = await pool.query(`SELECT * FROM ${t}`)
      currentBackup[t] = current
      currentTotal += current.length
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS backups (id SERIAL PRIMARY KEY, data JSONB NOT NULL, total_registos INT DEFAULT 0, created_at TEXT DEFAULT (NOW()::TEXT))`)
    await pool.query(
      'INSERT INTO backups (data, total_registos, created_at) VALUES ($1, $2, $3)',
      [JSON.stringify(currentBackup), currentTotal, new Date().toISOString() + '_pre_restore']
    )

    // Restaurar
    let restored = 0
    for (const t of BACKUP_TABLES) {
      if (!backup[t]?.length) continue
      if (restoreRegiao) {
        // Apenas linhas da região pedida — preserva o resto.
        const colsCheck = await pool.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='regiao' LIMIT 1`, [t])
        const hasRegiao = colsCheck.rowCount > 0
        if (hasRegiao) {
          await pool.query(`DELETE FROM ${t} WHERE regiao = $1`, [restoreRegiao])
        } else {
          continue // tabela sem coluna regiao → saltar quando restore é regional
        }
        for (const row of backup[t]) {
          if ((row.regiao || 'Coimbra') !== restoreRegiao) continue
          const fields = Object.entries(row).filter(([, v]) => v !== undefined && v !== null)
          const cols = fields.map(([k]) => k)
          const vals = fields.map((_, i) => `$${i + 1}`)
          await pool.query(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT (id) DO NOTHING`, fields.map(([, v]) => v))
          restored++
        }
      } else {
        // Restauro global tradicional
        await pool.query(`DELETE FROM ${t}`)
        for (const row of backup[t]) {
          const fields = Object.entries(row).filter(([, v]) => v !== undefined && v !== null)
          const cols = fields.map(([k]) => k)
          const vals = fields.map((_, i) => `$${i + 1}`)
          await pool.query(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT (id) DO NOTHING`, fields.map(([, v]) => v))
          restored++
        }
      }
    }
    res.json({ ok: true, restored, fromBackup: rows[0].created_at, regiao: restoreRegiao || 'global' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Descarregar backup específico como ficheiro
router.get('/backup/:id/download', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM backups WHERE id = $1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Backup não encontrado' })
    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data
    data.exported_at = rows[0].created_at
    data.total = rows[0].total_registos
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename=somnium-backup-${rows[0].created_at.slice(0,10)}.json`)
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── WhatsApp unread counts + mark-seen ────────────────────
router.get('/whatsapp/unread-counts', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ci.consultor_id, COUNT(*)::int as unread
      FROM consultor_interacoes ci
      LEFT JOIN whatsapp_last_seen ls ON ls.consultor_id = ci.consultor_id
      WHERE ci.canal = 'whatsapp'
        AND ci.direcao = 'Recebido'
        AND ci.data_hora > COALESCE(ls.last_seen_at, '1970-01-01')
      GROUP BY ci.consultor_id
      HAVING COUNT(*) > 0
    `)
    const result = {}
    for (const r of rows) result[r.consultor_id] = r.unread
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/whatsapp/mark-seen/:id', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO whatsapp_last_seen (consultor_id, last_seen_at)
       VALUES ($1, $2)
       ON CONFLICT (consultor_id) DO UPDATE SET last_seen_at = $2`,
      [req.params.id, new Date().toISOString()]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Estudo de localização: Distance Matrix API ────────────────
// POIs sugeridos por defeito (categoria + label visível). O frontend pode
// adicionar/remover livremente — esta lista é só o ponto de partida.
const POIS_SUGERIDOS = [
  { categoria: 'Mercearia/Supermercado', icone: '🛒' },
  { categoria: 'Hospital', icone: '🏥' },
  { categoria: 'Farmácia', icone: '💊' },
  { categoria: 'Escola Básica', icone: '🏫' },
  { categoria: 'Estação de Comboios', icone: '🚆' },
  { categoria: 'Centro Comercial', icone: '🛍️' },
  { categoria: 'Restaurante', icone: '🍽️' },
  { categoria: 'Ginásio', icone: '🏋️' },
  { categoria: 'Acesso A1/A8', icone: '🛣️' },
  { categoria: 'Aeroporto', icone: '✈️' },
]

router.get('/imoveis/pois/sugeridos', (req, res) => res.json(POIS_SUGERIDOS))

router.post('/imoveis/:id/distancias', async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY não configurada' })

    const { rows: [imovel] } = await pool.query('SELECT id, nome, morada, zona FROM imoveis WHERE id = $1', [req.params.id])
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    const origem = (req.body?.origem || imovel.morada || imovel.zona || '').trim()
    if (!origem) return res.status(400).json({ error: 'Indica morada/origem do imóvel (ou preenche o campo morada).' })

    const destinos = Array.isArray(req.body?.destinos) ? req.body.destinos.filter(d => d?.endereco?.trim()) : []
    if (destinos.length === 0) return res.status(400).json({ error: 'Lista de destinos vazia.' })
    if (destinos.length > 25) return res.status(400).json({ error: 'Máximo 25 destinos por chamada (limite Distance Matrix).' })

    const mode = req.body?.mode === 'walking' ? 'walking' : req.body?.mode === 'bicycling' ? 'bicycling' : req.body?.mode === 'transit' ? 'transit' : 'driving'
    const region = 'pt'

    // Calcula sempre os dois modos: trajecto/distância a pé difere do de carro.
    async function matrixFor(modeX) {
      const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
      url.searchParams.set('origins', origem)
      url.searchParams.set('destinations', destinos.map(d => d.endereco).join('|'))
      url.searchParams.set('mode', modeX)
      url.searchParams.set('region', region)
      url.searchParams.set('language', 'pt')
      url.searchParams.set('key', apiKey)
      const resp = await fetch(url.toString())
      const j = await resp.json()
      if (j.status !== 'OK') {
        const err = new Error(`Distance Matrix (${modeX}): ${j.status}${j.error_message ? ' — ' + j.error_message : ''}`)
        err.detalhe = j.error_message || null
        throw err
      }
      return j
    }

    const [jCar, jWalk] = await Promise.all([matrixFor('driving'), matrixFor('walking')])
    const carEls = jCar.rows?.[0]?.elements || []
    const walkEls = jWalk.rows?.[0]?.elements || []
    const pick = (el) => ({
      distancia_metros: el?.status === 'OK' ? el.distance?.value ?? null : null,
      distancia_texto: el?.status === 'OK' ? el.distance?.text ?? null : null,
      duracao_segundos: el?.status === 'OK' ? el.duration?.value ?? null : null,
      duracao_texto: el?.status === 'OK' ? el.duration?.text ?? null : null,
      status: el?.status || 'UNKNOWN',
    })

    const resultados = destinos.map((d, i) => {
      const carro = pick(carEls[i])
      const pe = pick(walkEls[i])
      return {
        categoria: d.categoria || null,
        icone: d.icone || null,
        endereco: d.endereco,
        carro,
        pe,
        // compatibilidade com consumidores antigos (= carro)
        ...carro,
      }
    })

    const payload = {
      origem,
      mode,
      origem_resolvida: jCar.origin_addresses?.[0] || jWalk.origin_addresses?.[0] || null,
      atualizado_em: new Date().toISOString(),
      resultados,
    }

    await pool.query(
      `UPDATE imoveis SET pois_distancias = $1::jsonb, pois_atualizado_em = NOW(), morada = COALESCE(NULLIF($2,''), morada), updated_at = NOW()::text WHERE id = $3`,
      [JSON.stringify(payload), origem, imovel.id]
    )

    res.json(payload)
  } catch (e) {
    console.error('[distancias]', e)
    res.status(500).json({ error: e.message })
  }
})

// ── Estudo de localização auto: Distance Matrix + composição SVG + upload Supabase + UPDATE localizacao_imagem
router.post('/imoveis/:id/estudo-localizacao', async (req, res) => {
  try {
    if (!supabaseStorage) return res.status(500).json({ error: 'Supabase Storage não configurado' })
    const r = await runEstudoLocalizacao({
      pool,
      supabaseStorage,
      imovelId: req.params.id,
      destinos: req.body?.destinos,
      mode: req.body?.mode || 'driving',
      highlights: Array.isArray(req.body?.highlights) ? req.body.highlights : [],
      destaque: req.body?.destaque || null,
      origem: req.body?.origem || null,
    })
    res.json(r)
  } catch (e) {
    console.error('[estudo-localizacao]', e)
    res.status(500).json({ error: e.message })
  }
})

router.get('/imoveis/:id/distancias', async (req, res) => {
  try {
    const { rows: [imovel] } = await pool.query('SELECT pois_distancias, pois_atualizado_em, morada FROM imoveis WHERE id = $1', [req.params.id])
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })
    res.json({
      morada: imovel.morada || null,
      atualizado_em: imovel.pois_atualizado_em,
      payload: imovel.pois_distancias || null,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Relatorios Semanais Administracao ──────────────────────────────
router.get('/relatorios-semanais', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, semana_iso, data_inicio, data_fim, titulo, subtitulo, reuniao_ids, notas, created_at, updated_at FROM relatorios_semanais ORDER BY data_inicio DESC'
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Documentos (PDF/PPTX) por semana, guardados no bucket privado "Relatorios" do Storage.
// Devolve [{ semana, ficheiros: [{ nome, ext, tamanho, atualizado, url (assinada 1h) }] }]
router.get('/relatorios-documentos', async (_req, res) => {
  try {
    if (!supabaseStorage) return res.json([])
    const BUCKET = 'Relatorios'
    const { data: folders, error } = await supabaseStorage.storage
      .from(BUCKET).list('', { limit: 200, sortBy: { column: 'name', order: 'desc' } })
    if (error) throw error
    const semanas = (folders || []).filter(f => f.id === null && /^\d{4}-W\d{2}$/.test(f.name))
    const out = []
    for (const s of semanas) {
      const { data: files } = await supabaseStorage.storage.from(BUCKET).list(s.name, { limit: 200 })
      const ficheiros = []
      for (const f of (files || [])) {
        const ext = (f.name.split('.').pop() || '').toLowerCase()
        if (!['pdf', 'pptx'].includes(ext)) continue
        const { data: signed } = await supabaseStorage.storage
          .from(BUCKET).createSignedUrl(`${s.name}/${f.name}`, 60 * 60)
        ficheiros.push({
          nome: f.name,
          ext,
          tamanho: f.metadata?.size ?? null,
          atualizado: f.updated_at || f.created_at || null,
          url: signed?.signedUrl || null,
        })
      }
      if (ficheiros.length) {
        ficheiros.sort((a, b) => a.nome.localeCompare(b.nome))
        out.push({ semana: s.name, ficheiros })
      }
    }
    out.sort((a, b) => b.semana.localeCompare(a.semana))
    res.json(out)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Eliminar um documento de reuniao do Storage (bucket Relatorios)
router.delete('/relatorios-documentos', async (req, res) => {
  try {
    if (!supabaseStorage) return res.status(503).json({ error: 'Storage indisponível' })
    const { semana, nome } = req.body || {}
    if (!semana || !nome || !/^\d{4}-W\d{2}$/.test(semana)) return res.status(400).json({ error: 'semana/nome inválidos' })
    if (String(nome).includes('/') || String(nome).includes('..')) return res.status(400).json({ error: 'nome inválido' })
    const caminho = `${semana}/${nome}`
    const { error } = await supabaseStorage.storage.from('Relatorios').remove([caminho])
    if (error) throw error
    res.json({ ok: true, removido: caminho })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════════════════════════════
// REUNIOES DOCUMENTOS — reunioes editaveis com upload de ficheiros
// Ficheiros no bucket privado "Relatorios" do Storage em <pasta>/<ficheiro>.
// ════════════════════════════════════════════════════════════════
const REUNIOES_BUCKET = 'Relatorios'

function semanaIsoDeData(dataIso) {
  if (!dataIso) return null
  try {
    const d = new Date(dataIso)
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const dayNum = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    const weekNum = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
    return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
  } catch { return null }
}

async function listarFicheirosReuniao(pasta) {
  if (!supabaseStorage || !pasta) return []
  const { data: files } = await supabaseStorage.storage.from(REUNIOES_BUCKET).list(pasta, { limit: 200 })
  const out = []
  for (const f of (files || [])) {
    if (f.id === null) continue // subpastas
    const ext = (f.name.split('.').pop() || '').toLowerCase()
    const { data: signed } = await supabaseStorage.storage
      .from(REUNIOES_BUCKET).createSignedUrl(`${pasta}/${f.name}`, 60 * 60)
    out.push({
      nome: f.name,
      ext,
      tamanho: f.metadata?.size ?? null,
      atualizado: f.updated_at || f.created_at || null,
      url: signed?.signedUrl || null,
    })
  }
  out.sort((a, b) => a.nome.localeCompare(b.nome))
  return out
}

// GET lista reunioes + ficheiros. Auto-importa pastas de semana legadas como reunioes.
router.get('/reunioes-documentos', async (_req, res) => {
  try {
    const { rows: existentes } = await pool.query('SELECT pasta FROM reunioes_documentos')
    const pastasExistentes = new Set(existentes.map(r => r.pasta))

    // Auto-import: pastas de semana antigas no bucket sem reuniao associada.
    if (supabaseStorage) {
      const { data: folders } = await supabaseStorage.storage
        .from(REUNIOES_BUCKET).list('', { limit: 200, sortBy: { column: 'name', order: 'desc' } })
      const semanas = (folders || []).filter(f => f.id === null && /^\d{4}-W\d{2}$/.test(f.name))
      for (const s of semanas) {
        if (pastasExistentes.has(s.name)) continue
        const ficheiros = await listarFicheirosReuniao(s.name)
        if (!ficheiros.length) continue
        const id = randomUUID()
        await pool.query(
          `INSERT INTO reunioes_documentos (id, titulo, data, semana_iso, pasta) VALUES ($1, $2, NULL, $3, $4)`,
          [id, `Reunião ${s.name}`, s.name, s.name]
        )
        pastasExistentes.add(s.name)
      }
    }

    const { rows } = await pool.query(
      'SELECT * FROM reunioes_documentos ORDER BY COALESCE(data, semana_iso, created_at) DESC, created_at DESC'
    )
    const out = []
    for (const r of rows) {
      out.push({ ...r, ficheiros: await listarFicheirosReuniao(r.pasta) })
    }
    res.json(out)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/reunioes-documentos', async (req, res) => {
  try {
    const { titulo, data, notas } = req.body || {}
    if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'Título obrigatório' })
    const id = randomUUID()
    const pasta = `reunioes/${id}`
    const { rows: [r] } = await pool.query(
      `INSERT INTO reunioes_documentos (id, titulo, data, semana_iso, notas, pasta)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, titulo.trim(), data || null, semanaIsoDeData(data), notas || null, pasta]
    )
    res.status(201).json({ ...r, ficheiros: [] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/reunioes-documentos/:id', async (req, res) => {
  try {
    const { titulo, data, notas } = req.body || {}
    const sets = ['updated_at = $1']
    const params = [new Date().toISOString()]
    if (titulo !== undefined) { params.push(titulo); sets.push(`titulo = $${params.length}`) }
    if (data !== undefined) {
      params.push(data || null); sets.push(`data = $${params.length}`)
      params.push(semanaIsoDeData(data)); sets.push(`semana_iso = $${params.length}`)
    }
    if (notas !== undefined) { params.push(notas || null); sets.push(`notas = $${params.length}`) }
    params.push(req.params.id)
    const { rows: [r] } = await pool.query(
      `UPDATE reunioes_documentos SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params
    )
    if (!r) return res.status(404).json({ error: 'Reunião não encontrada' })
    res.json({ ...r, ficheiros: await listarFicheirosReuniao(r.pasta) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/reunioes-documentos/:id', async (req, res) => {
  try {
    const { rows: [r] } = await pool.query('SELECT pasta FROM reunioes_documentos WHERE id = $1', [req.params.id])
    if (!r) return res.status(404).json({ error: 'Não encontrada' })
    if (supabaseStorage) {
      const { data: files } = await supabaseStorage.storage.from(REUNIOES_BUCKET).list(r.pasta, { limit: 200 })
      const paths = (files || []).filter(f => f.id !== null).map(f => `${r.pasta}/${f.name}`)
      if (paths.length) await supabaseStorage.storage.from(REUNIOES_BUCKET).remove(paths).catch(() => {})
    }
    await pool.query('DELETE FROM reunioes_documentos WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/reunioes-documentos/:id/ficheiros', uploadDocs.array('ficheiros', 20), async (req, res) => {
  try {
    if (!supabaseStorage) return res.status(503).json({ error: 'Storage indisponível (sem SUPABASE_SERVICE_KEY)' })
    const { rows: [r] } = await pool.query('SELECT pasta FROM reunioes_documentos WHERE id = $1', [req.params.id])
    if (!r) return res.status(404).json({ error: 'Reunião não encontrada' })
    if (!req.files?.length) return res.status(400).json({ error: 'Nenhum ficheiro recebido' })
    for (const file of req.files) {
      const safe = file.originalname.replace(/[^\w.\- ]+/g, '_')
      await supabaseStorage.storage.from(REUNIOES_BUCKET)
        .upload(`${r.pasta}/${safe}`, file.buffer, { contentType: file.mimetype, upsert: true })
    }
    await pool.query('UPDATE reunioes_documentos SET updated_at = $1 WHERE id = $2', [new Date().toISOString(), req.params.id])
    res.json({ ficheiros: await listarFicheirosReuniao(r.pasta) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/reunioes-documentos/:id/ficheiros/:nome', async (req, res) => {
  try {
    if (!supabaseStorage) return res.status(503).json({ error: 'Storage indisponível' })
    const { rows: [r] } = await pool.query('SELECT pasta FROM reunioes_documentos WHERE id = $1', [req.params.id])
    if (!r) return res.status(404).json({ error: 'Reunião não encontrada' })
    const nome = decodeURIComponent(req.params.nome)
    await supabaseStorage.storage.from(REUNIOES_BUCKET).remove([`${r.pasta}/${nome}`])
    res.json({ ficheiros: await listarFicheirosReuniao(r.pasta) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/relatorios-semanais/:id', async (req, res) => {
  try {
    const { rows: [r] } = await pool.query('SELECT * FROM relatorios_semanais WHERE id = $1', [req.params.id])
    if (!r) return res.status(404).json({ error: 'Relatório não encontrado' })
    res.json(r)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/relatorios-semanais/:id/pdf', async (req, res) => {
  try {
    const { rows: [r] } = await pool.query('SELECT * FROM relatorios_semanais WHERE id = $1', [req.params.id])
    if (!r) return res.status(404).json({ error: 'Relatório não encontrado' })

    const fname = `Relatorio_Semanal_${r.semana_iso}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', pdfDisposition(req, fname))

    // Se ha PDF original importado e existe no disco, servir directamente
    if (r.pdf_original_path) {
      const path = (await import('path')).default
      const fs = (await import('fs')).default
      const fileURLToPath = (await import('url')).fileURLToPath
      const __dirname = path.dirname(fileURLToPath(import.meta.url))
      const ROOT = path.resolve(__dirname, '../..')
      const abs = path.isAbsolute(r.pdf_original_path) ? r.pdf_original_path : path.join(ROOT, r.pdf_original_path)
      if (fs.existsSync(abs)) {
        return fs.createReadStream(abs).pipe(res)
      }
      console.warn('[relatorios-semanais/pdf] pdf_original_path nao existe:', abs, '— fallback para template')
    }

    const { generateRelatorioSemanalPDF } = await import('./pdfRelatorioSemanal.js')
    const doc = generateRelatorioSemanalPDF(r)
    streamPdfToResAndPersist(doc, res, {
      storagePath: `relatorios-semanais/${r.semana_iso}.pdf`,
      localPath: path.join(REPO_ROOT, 'Relatorios', 'RelatoriosSemanais', `${r.semana_iso}.pdf`),
    })
  } catch (e) {
    console.error('[relatorios-semanais/pdf]', e)
    res.status(500).json({ error: e.message })
  }
})

router.post('/relatorios-semanais/gerar', async (req, res) => {
  try {
    const { gerarRelatorioSemanal } = await import('./relatorioSemanalAggregator.js')
    const { semana_iso, data_inicio, data_fim, regenerar } = req.body || {}
    const result = await gerarRelatorioSemanal({ semana_iso, data_inicio, data_fim, regenerar })
    res.json(result)
  } catch (e) {
    console.error('[relatorios-semanais/gerar]', e)
    res.status(500).json({ error: e.message })
  }
})

router.post('/relatorios-semanais/auto-gerar', async (req, res) => {
  try {
    const { autoGerarRelatoriosSemanaisPendentes } = await import('./relatorioSemanalAggregator.js')
    const apenas_pendentes = req.body?.apenas_pendentes ?? req.query?.apenas_pendentes === 'true'
    const r = await autoGerarRelatoriosSemanaisPendentes({ apenas_pendentes: !!apenas_pendentes })
    res.json(r)
  } catch (e) {
    console.error('[relatorios-semanais/auto-gerar]', e)
    res.status(500).json({ error: e.message })
  }
})

router.delete('/relatorios-semanais/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM relatorios_semanais WHERE id = $1', [req.params.id])
    if (rowCount === 0) return res.status(404).json({ error: 'Não encontrado' })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/relatorios-semanais/:id', async (req, res) => {
  try {
    const { titulo, subtitulo, conteudo_json, notas } = req.body || {}
    const sets = ['updated_at = $1']
    const params = [new Date().toISOString()]
    if (titulo !== undefined) { params.push(titulo); sets.push(`titulo = $${params.length}`) }
    if (subtitulo !== undefined) { params.push(subtitulo); sets.push(`subtitulo = $${params.length}`) }
    if (conteudo_json !== undefined) {
      params.push(typeof conteudo_json === 'string' ? conteudo_json : JSON.stringify(conteudo_json))
      sets.push(`conteudo_json = $${params.length}`)
    }
    if (notas !== undefined) { params.push(notas); sets.push(`notas = $${params.length}`) }
    params.push(req.params.id)
    await pool.query(`UPDATE relatorios_semanais SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════════════════════════════
// PROJETOS FIX AND FLIP — Fases, Tarefas, Fotos
// ════════════════════════════════════════════════════════════════

// GET lista de projectos filtrada pelos acessos do user logado.
// Admins/comerciais veem tudo. Investidores/parceiros veem só os
// projectos onde foram explicitamente adicionados via tabela `acessos`.
router.get('/projetos/meus', async (req, res) => {
  try {
    const u = await resolveCrmUser(req)
    if (!u) {
      // Sem user resolvido (dev/sem Supabase ou sem token) — retornar tudo (excepto apagados)
      const { rows } = await pool.query(`SELECT n.*, i.nome AS imovel_nome FROM negocios n LEFT JOIN imoveis i ON n.imovel_id = i.id WHERE n.deleted_at IS NULL ORDER BY n.created_at DESC LIMIT 200`)
      return res.json({ data: rows, role: 'admin' })
    }
    const isRestricted = RECORD_RESTRICTED_ROLES.has(u.role)
    if (!isRestricted) {
      const { rows } = await pool.query(`SELECT n.*, i.nome AS imovel_nome FROM negocios n LEFT JOIN imoveis i ON n.imovel_id = i.id WHERE n.deleted_at IS NULL ORDER BY n.created_at DESC LIMIT 200`)
      return res.json({ data: rows, role: u.role })
    }
    // Investidor/parceiro: filtrar pelos acessos
    const { rows } = await pool.query(
      `SELECT n.*, i.nome AS imovel_nome FROM negocios n
       JOIN acessos a ON a.entidade = 'negocio' AND a.entidade_id = n.id
       LEFT JOIN imoveis i ON n.imovel_id = i.id
       WHERE a.user_id = $1 AND n.deleted_at IS NULL
       ORDER BY n.created_at DESC`,
      [u.id]
    )
    res.json({ data: rows, role: u.role })
  } catch (e) { console.error('[projetos/meus]', e.message); res.status(500).json({ error: e.message }) }
})

// GET fases + tarefas + contagem de fotos de um negócio
router.get('/projetos/:negocioId/fases', async (req, res) => {
  try {
    const { rows: fases } = await pool.query(
      `SELECT * FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem`,
      [req.params.negocioId]
    )
    const ids = fases.map(f => f.id)
    let tarefas = []
    let fotosCounts = {}
    if (ids.length > 0) {
      const { rows: tarefasRows } = await pool.query(
        `SELECT * FROM projeto_tarefas WHERE fase_id = ANY($1) ORDER BY ordem`,
        [ids]
      )
      tarefas = tarefasRows
      const { rows: fotosRows } = await pool.query(
        `SELECT fase_id, COUNT(*)::int AS c FROM projeto_fotos WHERE fase_id = ANY($1) GROUP BY fase_id`,
        [ids]
      )
      fotosCounts = Object.fromEntries(fotosRows.map(r => [r.fase_id, r.c]))
    }
    const enriched = fases.map(f => {
      const fts = tarefas.filter(t => t.fase_id === f.id)
      const concluidas = fts.filter(t => t.concluida).length
      const total = fts.length
      const percTarefas = total > 0 ? Math.round((concluidas / total) * 100) : 0
      return {
        ...f,
        tarefas: fts,
        tarefas_total: total,
        tarefas_concluidas: concluidas,
        perc_tarefas: percTarefas,
        fotos_count: fotosCounts[f.id] || 0,
      }
    })
    res.json({ fases: enriched })
  } catch (e) { console.error('[projetos/fases]', e.message); res.status(500).json({ error: e.message }) }
})

// POST: forçar criação de fases (caso negócio já exista sem elas)
router.post('/projetos/:negocioId/fases/inicializar', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT categoria FROM negocios WHERE id = $1', [req.params.negocioId])
    if (!rows.length) return res.status(404).json({ error: 'Negócio não encontrado' })
    const categoria = rows[0].categoria
    if (!FASES_POR_CATEGORIA[categoria]) {
      return res.status(400).json({ error: `Categoria "${categoria || '—'}" não tem workflow de fases.` })
    }
    await criarFasesProjecto(req.params.negocioId, categoria)
    res.json({ ok: true, categoria })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT fase (estado, datas, %, orçamento, notas)
router.put('/projetos/fases/:faseId', async (req, res) => {
  try {
    // Capturar estado anterior para detectar transição em_curso → notificar
    const { rows: antes } = await pool.query('SELECT estado, fase_key, negocio_id FROM projeto_fases WHERE id = $1', [req.params.faseId])
    const estadoAntes = antes[0]?.estado

    const allowed = ['estado', 'perc_execucao', 'data_inicio_prevista', 'data_fim_prevista', 'data_inicio_real', 'data_fim_real', 'orcamento_alocado', 'custo_real', 'responsavel', 'notas']
    const sets = []
    const params = []
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        params.push(req.body[k])
        sets.push(`${k} = $${params.length}`)
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Sem campos para atualizar' })
    sets.push(`updated_at = NOW()`)
    params.push(req.params.faseId)
    const { rows } = await pool.query(
      `UPDATE projeto_fases SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    if (!rows.length) return res.status(404).json({ error: 'Fase não encontrada' })

    // Notificar se mudou para "em_curso" (e antes não era)
    if (req.body.estado === 'em_curso' && estadoAntes !== 'em_curso') {
      notificarInvestidoresMudancaFase(rows[0].negocio_id, rows[0].fase_key).catch(() => {})
    }

    // Audit log
    const user = await resolveCrmUser(req).catch(() => null)
    for (const k of Object.keys(req.body)) {
      audit({
        negocioId: rows[0].negocio_id, entidade: 'fase', entidadeId: rows[0].id,
        acao: 'update', campo: k, valorDepois: req.body[k],
        descricao: `Fase "${rows[0].nome}": ${k} = ${req.body[k]}`,
        user,
      })
    }

    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST nova tarefa numa fase
router.post('/projetos/fases/:faseId/tarefas', async (req, res) => {
  try {
    const { descricao, responsavel, deadline, notas } = req.body || {}
    if (!descricao?.trim()) return res.status(400).json({ error: 'descricao obrigatória' })
    const { rows: maxOrdem } = await pool.query('SELECT COALESCE(MAX(ordem), -1) AS m FROM projeto_tarefas WHERE fase_id = $1', [req.params.faseId])
    const id = randomUUID()
    const { rows } = await pool.query(
      `INSERT INTO projeto_tarefas (id, fase_id, descricao, ordem, responsavel, deadline, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, req.params.faseId, descricao.trim(), maxOrdem[0].m + 1, responsavel || null, deadline || null, notas || null]
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT tarefa (toggle concluída, editar campos)
router.put('/projetos/tarefas/:tarefaId', async (req, res) => {
  try {
    const allowed = ['descricao', 'concluida', 'responsavel', 'deadline', 'notas']
    const sets = []
    const params = []
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        params.push(req.body[k])
        sets.push(`${k} = $${params.length}`)
      }
    }
    if (req.body.concluida !== undefined) {
      params.push(req.body.concluida ? new Date().toISOString() : null)
      sets.push(`concluida_em = $${params.length}`)
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Sem campos' })
    params.push(req.params.tarefaId)
    const { rows } = await pool.query(
      `UPDATE projeto_tarefas SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    if (!rows.length) return res.status(404).json({ error: 'Tarefa não encontrada' })

    // Audit
    if (req.body.concluida !== undefined) {
      const { rows: faseRows } = await pool.query('SELECT negocio_id FROM projeto_fases WHERE id = $1', [rows[0].fase_id])
      const negId = faseRows[0]?.negocio_id
      if (negId) {
        const user = await resolveCrmUser(req).catch(() => null)
        audit({
          negocioId: negId, entidade: 'tarefa', entidadeId: rows[0].id,
          acao: 'status_change',
          descricao: `Tarefa "${rows[0].descricao}" ${req.body.concluida ? 'concluída' : 'reaberta'}`,
          user,
        })
      }
    }
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/projetos/tarefas/:tarefaId', async (req, res) => {
  try {
    await pool.query('DELETE FROM projeto_tarefas WHERE id = $1', [req.params.tarefaId])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Fotos: upload e listagem ────────────────────────────────
const projetoFotosDir = path.resolve(__dirname, '../../public/uploads/projetos')
try { mkdirSync(projetoFotosDir, { recursive: true }) } catch {}
const projetoFotosStorage = multer.diskStorage({
  destination: projetoFotosDir,
  filename: (req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
})
const uploadFoto = multer({
  storage: projetoFotosStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(jpg|jpeg|png|webp|heic)$/i.test(path.extname(file.originalname))),
})

router.get('/projetos/:negocioId/fotos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pf.*, f.fase_key, f.nome AS fase_nome, f.ordem AS fase_ordem
       FROM projeto_fotos pf
       JOIN projeto_fases f ON pf.fase_id = f.id
       WHERE pf.negocio_id = $1
       ORDER BY f.ordem, pf.created_at`,
      [req.params.negocioId]
    )
    res.json({ fotos: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/projetos/fases/:faseId/fotos', uploadRateLimit, uploadFoto.array('fotos', 20), async (req, res) => {
  try {
    const { rows: faseRows } = await pool.query('SELECT negocio_id FROM projeto_fases WHERE id = $1', [req.params.faseId])
    if (!faseRows.length) return res.status(404).json({ error: 'Fase não encontrada' })
    const negocioId = faseRows[0].negocio_id
    const tipo = req.body?.tipo || 'durante'
    const legenda = req.body?.legenda || ''
    const inserted = []
    for (const file of (req.files || [])) {
      const id = randomUUID()
      const url = `/uploads/projetos/${file.filename}`
      const { rows } = await pool.query(
        `INSERT INTO projeto_fotos (id, fase_id, negocio_id, url, legenda, tipo)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, req.params.faseId, negocioId, url, legenda, tipo]
      )
      inserted.push(rows[0])
    }
    res.status(201).json({ fotos: inserted })
  } catch (e) { console.error('[projetos/fotos] upload', e.message); res.status(500).json({ error: e.message }) }
})

router.put('/projetos/fotos/:fotoId', async (req, res) => {
  try {
    const allowed = ['legenda', 'tipo', 'ordem']
    const sets = []
    const params = []
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        params.push(req.body[k])
        sets.push(`${k} = $${params.length}`)
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Sem campos' })
    params.push(req.params.fotoId)
    const { rows } = await pool.query(
      `UPDATE projeto_fotos SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    if (!rows.length) return res.status(404).json({ error: 'Foto não encontrada' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/projetos/fotos/:fotoId', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM projeto_fotos WHERE id = $1 RETURNING url', [req.params.fotoId])
    if (rows[0]?.url) {
      const filePath = path.resolve(__dirname, '../..', rows[0].url.replace(/^\//, ''))
      unlink(filePath).catch(() => {})
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Helper: carregar dados completos do projeto ───────────────
async function loadProjetoCompleto(negocioId) {
  const { rows: negRows } = await pool.query('SELECT * FROM negocios WHERE id = $1', [negocioId])
  if (!negRows.length) return null
  const negocio = negRows[0]

  let imovel = null
  if (negocio.imovel_id) {
    const { rows } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [negocio.imovel_id])
    imovel = rows[0] || null
  }

  const { rows: fases } = await pool.query(
    'SELECT * FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem', [negocioId]
  )
  const faseIds = fases.map(f => f.id)
  const tarefas = faseIds.length > 0
    ? (await pool.query('SELECT * FROM projeto_tarefas WHERE fase_id = ANY($1) ORDER BY ordem', [faseIds])).rows
    : []
  const fotos = faseIds.length > 0
    ? (await pool.query(
        `SELECT pf.*, f.fase_key, f.nome AS fase_nome FROM projeto_fotos pf
         JOIN projeto_fases f ON pf.fase_id = f.id
         WHERE pf.negocio_id = $1 ORDER BY f.ordem, pf.created_at`,
        [negocioId]
      )).rows
    : []

  let orcamento = null
  if (negocio.imovel_id) {
    const { rows } = await pool.query('SELECT * FROM orcamentos_obra WHERE imovel_id = $1 LIMIT 1', [negocio.imovel_id]).catch(() => ({ rows: [] }))
    orcamento = rows?.[0] || null
    if (orcamento?.seccoes && typeof orcamento.seccoes === 'string') {
      try { orcamento.seccoes = JSON.parse(orcamento.seccoes) } catch {}
    }
  }

  const orcAlocado = fases.reduce((s, f) => s + (Number(f.orcamento_alocado) || 0), 0)
  const custoReal = fases.reduce((s, f) => s + (Number(f.custo_real) || 0), 0)
  const percGlobal = fases.length > 0
    ? Math.round(fases.reduce((s, f) => s + (Number(f.perc_execucao) || 0), 0) / fases.length)
    : 0

  return { negocio, imovel, fases, tarefas, fotos, orcamento, orcAlocado, custoReal, percGlobal }
}

// ── PDFs: Ficha de Acompanhamento (por fase) ────────────────
router.get('/projetos/:negocioId/pdf/ficha/:faseId', async (req, res) => {
  try {
    const data = await loadProjetoCompleto(req.params.negocioId)
    if (!data) return res.status(404).json({ error: 'Projecto não encontrado' })
    const fase = data.fases.find(f => f.id === req.params.faseId)
    if (!fase) return res.status(404).json({ error: 'Fase não encontrada' })
    const tarefas = data.tarefas.filter(t => t.fase_id === fase.id)
    const fotos = data.fotos.filter(f => f.fase_id === fase.id)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', pdfDisposition(req, `ficha-${fase.fase_key}-${data.negocio.movimento.replace(/[^\w]/g, '_')}.pdf`))
    const doc = generateFichaAcompanhamento({ negocio: data.negocio, imovel: data.imovel, fase, tarefas, fotos })
    doc.pipe(res)
  } catch (e) { console.error('[pdf/ficha]', e.message); res.status(500).json({ error: e.message }) }
})

// ── PDF: Relatório de Acompanhamento (executivo) ────────────
router.get('/projetos/:negocioId/pdf/relatorio', async (req, res) => {
  try {
    const data = await loadProjetoCompleto(req.params.negocioId)
    if (!data) return res.status(404).json({ error: 'Projecto não encontrado' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', pdfDisposition(req, `relatorio-obra-${data.negocio.movimento.replace(/[^\w]/g, '_')}.pdf`))
    const doc = generateRelatorioAcompanhamento(data)
    doc.pipe(res)
  } catch (e) { console.error('[pdf/relatorio]', e.message); res.status(500).json({ error: e.message }) }
})

// ── PDF: Memória Descritiva de Acabamentos ──────────────────
router.get('/projetos/:negocioId/pdf/memoria', async (req, res) => {
  try {
    const data = await loadProjetoCompleto(req.params.negocioId)
    if (!data) return res.status(404).json({ error: 'Projecto não encontrado' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', pdfDisposition(req, `memoria-acabamentos-${data.negocio.movimento.replace(/[^\w]/g, '_')}.pdf`))
    const doc = generateMemoriaDescritiva(data)
    doc.pipe(res)
  } catch (e) { console.error('[pdf/memoria]', e.message); res.status(500).json({ error: e.message }) }
})

// ── PDF: Relatório de Saída CAEP ────────────────────────────
router.get('/projetos/:negocioId/pdf/saida', async (req, res) => {
  try {
    const data = await loadProjetoCompleto(req.params.negocioId)
    if (!data) return res.status(404).json({ error: 'Projecto não encontrado' })

    // Fonte única: projeto_investidores (capital + % reais). investidor_ids
    // é um campo legado nunca escrito pela app — descontinuado (confirmado
    // que nenhum negócio depende só dele).
    const { rows: projInv } = await pool.query(
      `SELECT pi.capital, pi.percentagem, i.nome
       FROM projeto_investidores pi
       JOIN investidores i ON pi.investidor_id = i.id
       WHERE pi.negocio_id = $1
       ORDER BY pi.capital DESC`,
      [req.params.negocioId]
    )
    const investidores = projInv.map(p => ({ nome: p.nome, capital: Number(p.capital) || 0 }))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', pdfDisposition(req, `saida-caep-${data.negocio.movimento.replace(/[^\w]/g, '_')}.pdf`))
    const doc = generateRelatorioSaida({ ...data, investidores })
    doc.pipe(res)
  } catch (e) { console.error('[pdf/saida]', e.message); res.status(500).json({ error: e.message }) }
})

// ── Relatorio Executivo de Expansao para Vila Nova de Gaia ──
// Documento estrategico (10-15 paginas) para apresentar a investidores,
// equipa e parceiros locais. Dataset em ./expansaoGaiaData.js.
router.get('/relatorios/expansao-gaia', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', pdfDisposition(req, 'relatorio-expansao-gaia.pdf'))
    const doc = generateRelatorioExpansaoGaia()
    doc.pipe(res)
  } catch (e) {
    console.error('[pdf/expansao-gaia]', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── Mover negócio entre fases do Kanban (drag&drop) ─────────
router.put('/projetos/:negocioId/mover-fase', async (req, res) => {
  try {
    const { faseKey } = req.body
    if (!faseKey) return res.status(400).json({ error: 'faseKey obrigatório' })
    // Garantir que as fases existem — auto-inicializa conforme template da categoria se for o caso
    let { rows: fases } = await pool.query(
      'SELECT id, fase_key, ordem FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem',
      [req.params.negocioId]
    )
    if (fases.length === 0) {
      const { rows: negs } = await pool.query('SELECT categoria FROM negocios WHERE id = $1', [req.params.negocioId])
      const categoria = negs[0]?.categoria
      if (!FASES_POR_CATEGORIA[categoria]) {
        return res.status(400).json({ error: `Categoria "${categoria || '—'}" não tem workflow de fases.` })
      }
      await criarFasesProjecto(req.params.negocioId, categoria)
      const reload = await pool.query(
        'SELECT id, fase_key, ordem FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem',
        [req.params.negocioId]
      )
      fases = reload.rows
      if (fases.length === 0) return res.status(500).json({ error: 'Falha a inicializar fases' })
    }

    const novaFase = fases.find(f => f.fase_key === faseKey)
    if (!novaFase) return res.status(400).json({ error: 'Fase inválida' })

    // Marcar todas as fases anteriores como concluídas (100%), a nova como em_curso, e as seguintes como pendentes
    for (const f of fases) {
      let estado, perc
      if (f.ordem < novaFase.ordem) { estado = 'concluida'; perc = 100 }
      else if (f.ordem === novaFase.ordem) { estado = 'em_curso'; perc = Math.max(1, Math.min(99, 50)) }
      else { estado = 'pendente'; perc = 0 }
      await pool.query(
        `UPDATE projeto_fases SET estado = $1,
           perc_execucao = CASE WHEN $2 = 100 THEN 100 WHEN $2 = 0 THEN 0 ELSE perc_execucao END,
           ${f.ordem === novaFase.ordem ? 'data_inicio_real = COALESCE(data_inicio_real, $4),' : ''}
           updated_at = NOW()
         WHERE id = $3`,
        f.ordem === novaFase.ordem
          ? [estado, perc, f.id, new Date().toISOString().slice(0, 10)]
          : [estado, perc, f.id]
      )
    }
    // Notificação assíncrona aos investidores (best-effort)
    notificarInvestidoresMudancaFase(req.params.negocioId, faseKey).catch(() => {})

    // Audit log
    const user = await resolveCrmUser(req).catch(() => null)
    audit({
      negocioId: req.params.negocioId, entidade: 'negocio', entidadeId: req.params.negocioId,
      acao: 'status_change', campo: 'fase_atual', valorDepois: faseKey,
      descricao: `Projecto movido para fase "${faseKey}"`,
      user,
    })

    res.json({ ok: true, faseKey })
  } catch (e) { console.error('[mover-fase]', e.message); res.status(500).json({ error: e.message }) }
})

// ── Notificar investidores quando uma fase muda ──────────────
async function notificarInvestidoresMudancaFase(negocioId, novaFaseKey) {
  try {
    const { sendEmail, isConfigured: emailOK } = await import('./emailService.js')
    if (!emailOK()) return

    const { rows: negs } = await pool.query('SELECT * FROM negocios WHERE id = $1', [negocioId])
    if (!negs.length) return
    const negocio = negs[0]

    // investidor_ids nunca é escrito pela app — a ligação real vive em
    // projeto_investidores. Este fallback ficava sempre vazio, o que
    // significava que esta notificação nunca era enviada a ninguém.
    const { rows: piRows } = await pool.query('SELECT investidor_id FROM projeto_investidores WHERE negocio_id = $1', [negocioId])
    const invIds = piRows.map(p => p.investidor_id)
    if (invIds.length === 0) return

    // Filtra investidores que TÊM a região do negócio nas suas preferências.
    // Pool unificado: se regioes_preferidas inclui a região do negócio (ou
    // o investidor não definiu preferências), recebe notificação.
    const regiaoNegocio = negocio.regiao || 'Coimbra'
    const { rows: invs } = await pool.query(
      `SELECT id, nome, email, telemovel, canal_notificacao, regioes_preferidas FROM investidores
       WHERE id = ANY($1) AND (canal_notificacao IS NULL OR canal_notificacao <> 'nenhum')`,
      [invIds]
    )
    const invsFiltered = invs.filter(inv => {
      let prefs = []
      try { prefs = typeof inv.regioes_preferidas === 'string' ? JSON.parse(inv.regioes_preferidas || '[]') : (inv.regioes_preferidas || []) } catch {}
      if (!Array.isArray(prefs) || prefs.length === 0) return true // sem preferência definida → recebe tudo
      return prefs.includes(regiaoNegocio)
    })
    if (invsFiltered.length === 0) return
    // Substituir array original para que o resto da função use a lista filtrada.
    invs.length = 0
    invsFiltered.forEach(x => invs.push(x))

    const faseConfig = getFaseConfigGlobal(novaFaseKey)
    const faseNome = faseConfig?.nome || novaFaseKey
    const faseIcon = faseConfig?.icon || '🛠️'

    const baseUrl = process.env.PUBLIC_URL || 'https://somniumproperties-dashboard.onrender.com'
    const link = `${baseUrl}/projectos/${negocioId}`

    const subject = `${faseIcon} ${negocio.movimento}: nova fase de obra — ${faseNome}`
    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff;">
        <div style="background: #0d0d0d; padding: 24px; border-radius: 12px; color: white; text-align: center;">
          <p style="color: #C9A84C; font-size: 11px; letter-spacing: 1px; margin: 0; text-transform: uppercase;">SOMNIUM PROPERTIES</p>
          <h1 style="color: #C9A84C; margin: 8px 0 0; font-size: 22px;">${negocio.movimento}</h1>
        </div>
        <div style="padding: 24px 0;">
          <p style="font-size: 15px; color: #1f2937; line-height: 1.6;">
            Tem uma atualização do projeto <strong>${negocio.movimento}</strong>.
          </p>
          <div style="background: #f9fafb; border-left: 3px solid #C9A84C; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Nova fase iniciada</p>
            <p style="margin: 6px 0 0; font-size: 18px; font-weight: bold; color: #0d0d0d;">${faseIcon} ${faseNome}</p>
          </div>
          <p style="font-size: 14px; color: #6b7280;">
            Pode consultar o cronograma completo, fotos do progresso e o relatório detalhado no link abaixo.
          </p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${link}" style="background: #0d0d0d; color: #C9A84C; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Ver projeto</a>
          </p>
          <p style="font-size: 11px; color: #9ca3af; text-align: center;">
            Link confidencial. Não partilhar.
          </p>
        </div>
        <div style="border-top: 1px solid #e5e7eb; padding-top: 12px; text-align: center;">
          <p style="font-size: 10px; color: #9ca3af; margin: 0;">Somnium Properties · ${new Date().toLocaleDateString('pt-PT')}</p>
        </div>
      </div>
    `

    const textoWhatsApp = `🏗️ *Somnium Properties*\n\n${negocio.movimento}: nova fase iniciada\n\n${faseIcon} *${faseNome}*\n\nConsulta o cronograma e fotos no portal: ${link}`

    // Procurar user_id ligado a cada investidor (F19: notificação in-app)
    const { rows: invsComUser } = await pool.query(
      `SELECT id, user_id FROM investidores WHERE id = ANY($1) AND user_id IS NOT NULL`,
      [invIds]
    )
    const userIdsPorInv = Object.fromEntries(invsComUser.map(i => [i.id, i.user_id]))

    let envios = { email: 0, whatsapp: 0, in_app: 0 }
    for (const inv of invs) {
      const canal = inv.canal_notificacao || 'email'
      if ((canal === 'email' || canal === 'ambos') && inv.email) {
        sendEmail(subject, html, { to: inv.email })
          .then(() => envios.email++)
          .catch(e => console.error(`[notif-fase] email ${inv.email}:`, e.message))
      }
      if ((canal === 'whatsapp' || canal === 'ambos') && inv.telemovel) {
        try {
          const { sendWhatsApp } = await import('./whatsappAgent.js')
          await sendWhatsApp(inv.telemovel, textoWhatsApp)
          envios.whatsapp++
        } catch (e) { console.error(`[notif-fase] whatsapp ${inv.telemovel}:`, e.message) }
      }
      // F19: notificação in-app
      const userId = userIdsPorInv[inv.id]
      if (userId) {
        criarNotificacao(userId, {
          tipo: 'fase_mudou',
          titulo: `${negocio.movimento}: ${faseNome}`,
          mensagem: `Nova fase iniciada — ${faseIcon} ${faseNome}`,
          link: `/projectos/${negocioId}`,
        })
        envios.in_app++
      }
    }
    console.log(`[notif-fase] ${negocio.movimento} → ${faseNome}: email=${envios.email}, whatsapp=${envios.whatsapp}, in-app=${envios.in_app}`)
  } catch (e) { console.error('[notif-fase]', e.message) }
}

// ── DOCUMENTOS por fase (PDFs, DOCXs, certificados) ─────────
const projetoDocsDir = path.resolve(__dirname, '../../public/uploads/projetos-docs')
try { mkdirSync(projetoDocsDir, { recursive: true }) } catch {}
const projetoDocsStorage = multer.diskStorage({
  destination: projetoDocsDir,
  filename: (req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
})
const uploadDoc = multer({
  storage: projetoDocsStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(pdf|docx?|xlsx?|jpg|jpeg|png|webp|heic)$/i.test(path.extname(file.originalname))),
})

router.get('/projetos/:negocioId/documentos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pd.*, f.fase_key, f.nome AS fase_nome, f.ordem AS fase_ordem
       FROM projeto_documentos pd
       LEFT JOIN projeto_fases f ON pd.fase_id = f.id
       WHERE pd.negocio_id = $1
       ORDER BY COALESCE(f.ordem, 999), pd.created_at DESC`,
      [req.params.negocioId]
    )
    res.json({ documentos: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/projetos/:negocioId/documentos', uploadRateLimit, uploadDoc.array('files', 10), async (req, res) => {
  try {
    const { faseId, tipo, notas } = req.body
    const inserted = []
    for (const file of (req.files || [])) {
      const id = randomUUID()
      const url = `/uploads/projetos-docs/${file.filename}`
      const { rows } = await pool.query(
        `INSERT INTO projeto_documentos (id, fase_id, negocio_id, url, nome, tipo, tamanho, mime, notas)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [id, faseId || null, req.params.negocioId, url, file.originalname, tipo || 'outro', file.size, file.mimetype, notas || null]
      )
      inserted.push(rows[0])
    }
    res.status(201).json({ documentos: inserted })
  } catch (e) { console.error('[projetos/documentos] upload', e.message); res.status(500).json({ error: e.message }) }
})

router.put('/projetos/documentos/:docId', async (req, res) => {
  try {
    const allowed = ['fase_id', 'tipo', 'nome', 'notas']
    const sets = []
    const params = []
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        params.push(req.body[k])
        sets.push(`${k} = $${params.length}`)
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Sem campos' })
    params.push(req.params.docId)
    const { rows } = await pool.query(`UPDATE projeto_documentos SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params)
    if (!rows.length) return res.status(404).json({ error: 'Documento não encontrado' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/projetos/documentos/:docId', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM projeto_documentos WHERE id = $1 RETURNING url', [req.params.docId])
    if (rows[0]?.url) {
      const filePath = path.resolve(__dirname, '../..', rows[0].url.replace(/^\//, ''))
      unlink(filePath).catch(() => {})
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── DESPESAS por fase (F2.6) ────────────────────────────────
router.get('/projetos/:negocioId/despesas', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, f.fase_key, f.nome AS fase_nome, f.ordem AS fase_ordem
       FROM despesas d
       LEFT JOIN projeto_fases f ON d.fase_id = f.id
       WHERE d.negocio_id = $1
       ORDER BY COALESCE(f.ordem, 999), d.data DESC NULLS LAST`,
      [req.params.negocioId]
    )
    res.json({ despesas: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/projetos/:negocioId/despesas', async (req, res) => {
  try {
    const { fase_id, fracao_id, movimento, valor, data, categoria, fornecedor, notas } = req.body || {}
    if (!movimento?.trim()) return res.status(400).json({ error: 'movimento obrigatório' })
    const id = randomUUID()
    // Anexo de comprovativo passa sempre por despesas.documentos — ver
    // POST /projetos/despesas/:despesaId/comprovativo, chamado depois de criar
    // a despesa. Nunca escrever comprovativo_url/comprovativo_nome aqui.
    const { rows } = await pool.query(
      `INSERT INTO despesas (id, movimento, categoria, custo_mensal, custo_anual, timing, data, notas, negocio_id, fase_id, fracao_id, fornecedor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [id, movimento.trim(), categoria || 'Obra', Number(valor) || 0, 0, 'Único', data || null, notas || null,
       req.params.negocioId, fase_id || null, fracao_id || null,
       fornecedor || null]
    )
    // Recalcular custo_real da fase
    if (fase_id) {
      await pool.query(
        `UPDATE projeto_fases SET custo_real = (SELECT COALESCE(SUM(custo_mensal), 0) FROM despesas WHERE fase_id = $1), updated_at = NOW() WHERE id = $1`,
        [fase_id]
      )
    }
    // Audit
    const user = await resolveCrmUser(req).catch(() => null)
    audit({
      negocioId: req.params.negocioId, entidade: 'despesa', entidadeId: id,
      acao: 'create', valorDepois: `${movimento.trim()} (${Number(valor) || 0}€)`,
      descricao: `Despesa registada: ${movimento.trim()} — ${Number(valor) || 0}€${fornecedor ? ` · ${fornecedor}` : ''}`,
      user,
    })
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Upload de comprovativo (factura/recibo) — separado para suportar multipart
const projetoCompDir = path.resolve(__dirname, '../../public/uploads/comprovativos')
try { mkdirSync(projetoCompDir, { recursive: true }) } catch {}
const projetoCompStorage = multer.diskStorage({
  destination: projetoCompDir,
  filename: (req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
})
const uploadComprovativo = multer({
  storage: projetoCompStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(pdf|jpg|jpeg|png|webp|heic)$/i.test(path.extname(file.originalname))),
})

// Comprovativo de despesa de obra — usa o mesmo mecanismo (despesas.documentos)
// do resto das despesas, em vez de comprovativo_url/comprovativo_nome (campo
// paralelo sem nenhuma UI a mostrá-lo — confirmado por grep no frontend).
router.post('/projetos/despesas/:despesaId/comprovativo', uploadRateLimit, uploadComprovativo.single('comprovativo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Sem ficheiro' })
    const { despesaId } = req.params
    const despesa = await Despesas.getById(despesaId)
    if (!despesa) return res.status(404).json({ error: 'Despesa não encontrada' })

    const docs = despesa.documentos ? JSON.parse(despesa.documentos) : []
    docs.push({
      id: randomUUID(),
      name: req.file.originalname,
      path: `/uploads/comprovativos/${req.file.filename}`,
      type: req.file.mimetype,
      size: req.file.size,
      uploaded_at: new Date().toISOString(),
    })
    const { rows } = await pool.query(
      `UPDATE despesas SET documentos = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify(docs), despesaId]
    )
    if (!rows.length) return res.status(404).json({ error: 'Despesa não encontrada' })
    // Espelho no Google Drive (best-effort — não bloqueia a resposta)
    if (driveConfigured()) {
      try {
        const fileBuffer = await readFile(req.file.path)
        await uploadComprovativoToFolder(despesaId, fileBuffer, req.file.originalname, req.file.mimetype)
      } catch (e) { console.error('[drive] espelho comprovativo:', e.message) }
    }
    res.json(rows[0])
  } catch (e) { console.error('[comprovativo]', e.message); res.status(500).json({ error: e.message }) }
})

router.delete('/projetos/despesas/:despesaId', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM despesas WHERE id = $1 RETURNING fase_id', [req.params.despesaId])
    if (rows[0]?.fase_id) {
      await pool.query(
        `UPDATE projeto_fases SET custo_real = (SELECT COALESCE(SUM(custo_mensal), 0) FROM despesas WHERE fase_id = $1), updated_at = NOW() WHERE id = $1`,
        [rows[0].fase_id]
      )
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── INVESTIDORES por projeto (F2.8) ──────────────────────────
router.get('/projetos/:negocioId/investidores', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pi.*, i.nome AS investidor_nome, i.email AS investidor_email
       FROM projeto_investidores pi
       JOIN investidores i ON pi.investidor_id = i.id
       WHERE pi.negocio_id = $1
       ORDER BY pi.capital DESC NULLS LAST`,
      [req.params.negocioId]
    )
    res.json({ investidores: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// investidores.montante_investido deixa de ser editável à mão — passa a ser
// sempre a soma real do capital desse investidor em projeto_investidores
// (fonte de verdade). Recalculado a cada escrita nesta tabela.
async function syncMontanteInvestido(investidorId) {
  if (!investidorId) return
  const { rows: [r] } = await pool.query(
    'SELECT COALESCE(SUM(capital), 0) AS total FROM projeto_investidores WHERE investidor_id = $1',
    [investidorId]
  )
  await pool.query('UPDATE investidores SET montante_investido = $1 WHERE id = $2', [Number(r.total) || 0, investidorId])
}

router.post('/projetos/:negocioId/investidores', async (req, res) => {
  try {
    const { investidor_id, capital, percentagem, notas } = req.body || {}
    if (!investidor_id) return res.status(400).json({ error: 'investidor_id obrigatório' })
    const id = randomUUID()
    const { rows } = await pool.query(
      `INSERT INTO projeto_investidores (id, negocio_id, investidor_id, capital, percentagem, notas)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (negocio_id, investidor_id) DO UPDATE
         SET capital = EXCLUDED.capital, percentagem = EXCLUDED.percentagem, notas = EXCLUDED.notas
       RETURNING *`,
      [id, req.params.negocioId, investidor_id, Number(capital) || 0, Number(percentagem) || 0, notas || null]
    )
    // Se este investidor tem um utilizador ligado, dar-lhe acesso a este projecto.
    syncInvestidorAcessos(investidor_id).catch(e => console.error('[projeto-investidor] syncAcessos:', e.message))
    syncMontanteInvestido(investidor_id).catch(e => console.error('[projeto-investidor] syncMontante:', e.message))
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/projetos/investidores/:linkId', async (req, res) => {
  try {
    const allowed = ['capital', 'percentagem', 'notas']
    const sets = []
    const params = []
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        params.push(req.body[k])
        sets.push(`${k} = $${params.length}`)
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Sem campos' })
    params.push(req.params.linkId)
    const { rows } = await pool.query(`UPDATE projeto_investidores SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params)
    if (!rows.length) return res.status(404).json({ error: 'Ligação não encontrada' })
    syncMontanteInvestido(rows[0].investidor_id).catch(e => console.error('[projeto-investidor] syncMontante:', e.message))
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/projetos/investidores/:linkId', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM projeto_investidores WHERE id = $1 RETURNING investidor_id', [req.params.linkId])
    if (rows[0]) syncMontanteInvestido(rows[0].investidor_id).catch(e => console.error('[projeto-investidor] syncMontante:', e.message))
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════════════════════════════
// FRAÇÕES dentro de um projecto (prédios com várias frações)
// ════════════════════════════════════════════════════════════════
router.get('/projetos/:negocioId/fracoes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*,
              (SELECT COUNT(*) FROM projeto_fases WHERE fracao_id = f.id) AS num_fases,
              (SELECT COALESCE(AVG(perc_execucao), 0) FROM projeto_fases WHERE fracao_id = f.id) AS perc_global,
              (SELECT COALESCE(SUM(custo_real), 0) FROM projeto_fases WHERE fracao_id = f.id) AS custo_total
       FROM projeto_fracoes f
       WHERE f.negocio_id = $1
       ORDER BY f.ordem, f.nome`,
      [req.params.negocioId]
    )
    res.json({ fracoes: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/projetos/:negocioId/fracoes', async (req, res) => {
  try {
    const { nome, tipo, categoria_comum, tipologia, andar, area_m2, estado, valor_venda_estimado, data_venda_estimada, notas, duplicarFases } = req.body || {}
    if (!nome?.trim()) return res.status(400).json({ error: 'nome obrigatório' })
    const tipoVal = tipo === 'area_comum' ? 'area_comum' : 'fracao'
    const id = randomUUID()
    const { rows: maxOrdem } = await pool.query('SELECT COALESCE(MAX(ordem), -1) AS m FROM projeto_fracoes WHERE negocio_id = $1', [req.params.negocioId])
    const { rows } = await pool.query(
      `INSERT INTO projeto_fracoes (id, negocio_id, nome, tipo, categoria_comum, tipologia, andar, area_m2, estado, valor_venda_estimado, data_venda_estimada, notas, ordem)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [id, req.params.negocioId, nome.trim(), tipoVal, tipoVal === 'area_comum' ? (categoria_comum || null) : null,
       tipoVal === 'fracao' ? (tipologia || null) : null, andar || null,
       Number(area_m2) || null, estado || 'em_obra', Number(valor_venda_estimado) || 0,
       data_venda_estimada || null, notas || null, maxOrdem[0].m + 1]
    )

    // Auto-duplicar fases existentes do prédio para esta fração (se pedido)
    if (duplicarFases) {
      const { rows: fasesComuns } = await pool.query(
        `SELECT * FROM projeto_fases WHERE negocio_id = $1 AND fracao_id IS NULL ORDER BY ordem`,
        [req.params.negocioId]
      )
      for (const f of fasesComuns) {
        const novaFaseId = randomUUID()
        await pool.query(
          `INSERT INTO projeto_fases (id, negocio_id, fracao_id, fase_key, nome, ordem, estado)
           VALUES ($1, $2, $3, $4, $5, $6, 'pendente')`,
          [novaFaseId, req.params.negocioId, id, f.fase_key, `${f.nome} · ${nome.trim()}`, f.ordem]
        )
        // Duplicar tarefas-template
        const { rows: tarefas } = await pool.query(
          `SELECT descricao, ordem FROM projeto_tarefas WHERE fase_id = $1 ORDER BY ordem`,
          [f.id]
        )
        for (const t of tarefas) {
          await pool.query(
            `INSERT INTO projeto_tarefas (id, fase_id, descricao, ordem) VALUES ($1, $2, $3, $4)`,
            [randomUUID(), novaFaseId, t.descricao, t.ordem]
          )
        }
      }
    }

    res.status(201).json(rows[0])
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Já existe uma fração com esse nome no projecto' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/projetos/fracoes/:fracaoId', async (req, res) => {
  try {
    const { rows: antes } = await pool.query('SELECT estado, negocio_id, nome FROM projeto_fracoes WHERE id = $1', [req.params.fracaoId])
    const estadoAntes = antes[0]?.estado

    const allowed = ['nome', 'tipo', 'categoria_comum', 'tipologia', 'andar', 'area_m2', 'estado', 'valor_venda_estimado', 'valor_venda_real', 'data_venda_estimada', 'data_venda_real', 'comprador', 'notas', 'ordem']
    const sets = []
    const params = []
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        params.push(req.body[k])
        sets.push(`${k} = $${params.length}`)
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Sem campos' })
    sets.push(`updated_at = NOW()`)
    params.push(req.params.fracaoId)
    const { rows } = await pool.query(`UPDATE projeto_fracoes SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params)
    if (!rows.length) return res.status(404).json({ error: 'Fração não encontrada' })

    // F21: hook automático quando fracção é marcada como vendida
    if (req.body.estado === 'vendido' && estadoAntes !== 'vendido') {
      disparoVendaFracaoAutomatico(req.params.fracaoId).catch(() => {})
      // Audit
      const user = await resolveCrmUser(req).catch(() => null)
      audit({
        negocioId: rows[0].negocio_id, entidade: 'fracao', entidadeId: rows[0].id,
        acao: 'status_change',
        descricao: `Fração "${rows[0].nome}" marcada como Vendida`,
        user,
      })
    }
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/projetos/fracoes/:fracaoId', async (req, res) => {
  try {
    // Desligar fases/fotos/despesas em vez de apagar — fração apaga-se mas dados ficam como "comuns"
    await pool.query('UPDATE projeto_fases SET fracao_id = NULL WHERE fracao_id = $1', [req.params.fracaoId])
    await pool.query('UPDATE projeto_fotos SET fracao_id = NULL WHERE fracao_id = $1', [req.params.fracaoId])
    await pool.query('UPDATE despesas SET fracao_id = NULL WHERE fracao_id = $1', [req.params.fracaoId])
    await pool.query('DELETE FROM projeto_fracoes WHERE id = $1', [req.params.fracaoId])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── P4.5: Export Excel completo do projecto ─────────────────
router.get('/projetos/:negocioId/export-excel', async (req, res) => {
  try {
    const { exportProjetoExcel } = await import('./projetoExcelExport.js')
    const result = await exportProjetoExcel(req.params.negocioId)
    if (!result) return res.status(404).json({ error: 'Projecto não encontrado' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    await result.workbook.xlsx.write(res)
    res.end()
  } catch (e) { console.error('[export-excel]', e.message); res.status(500).json({ error: e.message }) }
})

// ── P4.7: Forecast de tesouraria do projecto ────────────────
router.get('/projetos/:negocioId/forecast', async (req, res) => {
  try {
    const { rows: negs } = await pool.query('SELECT * FROM negocios WHERE id = $1', [req.params.negocioId])
    if (!negs.length) return res.status(404).json({ error: 'Projecto não encontrado' })
    const negocio = negs[0]

    const { rows: fases } = await pool.query(
      `SELECT * FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem`, [req.params.negocioId]
    )

    // Outflow previsto: para cada fase não concluída, o restante do orçamento (orcamento - custo_real)
    // distribuído pelo período entre data_inicio_prevista e data_fim_prevista
    const outflows = []
    for (const f of fases) {
      if (f.estado === 'concluida') continue
      const orc = Number(f.orcamento_alocado) || 0
      const gasto = Number(f.custo_real) || 0
      const restante = Math.max(0, orc - gasto)
      if (restante === 0) continue
      const dataFim = f.data_fim_prevista || negocio.data_estimada_venda || new Date().toISOString().slice(0, 10)
      outflows.push({
        data: dataFim,
        descricao: `Outflow previsto: ${f.nome}`,
        valor: -restante,
        tipo: 'despesa_prevista',
      })
    }

    // Inflow: tranches não recebidas
    let pags = []
    try { pags = typeof negocio.pagamentos_faseados === 'string' ? JSON.parse(negocio.pagamentos_faseados || '[]') : (negocio.pagamentos_faseados || []) } catch {}
    const inflows = pags.filter(p => !p.recebido).map(p => ({
      data: p.data || negocio.data_estimada_venda || new Date().toISOString().slice(0, 10),
      descricao: `Tranche: ${p.descricao || 'Pagamento'}`,
      valor: Number(p.valor) || 0,
      tipo: 'tranche_prevista',
    }))

    // Inflow: venda esperada (se data_venda ainda não houve)
    if (!negocio.data_venda && negocio.data_estimada_venda && (Number(negocio.lucro_estimado) || 0) > 0) {
      const totalTranches = pags.reduce((s, p) => s + (Number(p.valor) || 0), 0)
      const lucroEsp = Number(negocio.lucro_estimado) || 0
      const valorVenda = lucroEsp + (Number(negocio.capital_total) || 0) + (Number(negocio.custo_real_obra) || 0)
      const naoCobertoPorTranches = Math.max(0, valorVenda - totalTranches)
      if (naoCobertoPorTranches > 0) {
        inflows.push({
          data: negocio.data_estimada_venda,
          descricao: 'Venda esperada (líquido de tranches definidas)',
          valor: naoCobertoPorTranches,
          tipo: 'venda_prevista',
        })
      }
    }

    // Combinar e ordenar por data
    const eventos = [...outflows, ...inflows].sort((a, b) => (a.data || '').localeCompare(b.data || ''))

    // Saldo acumulado
    let saldo = 0
    const cashflow = eventos.map(e => {
      saldo += e.valor
      return { ...e, saldo_acumulado: saldo }
    })

    // KPIs agregados
    const totalOut = outflows.reduce((s, e) => s + Math.abs(e.valor), 0)
    const totalIn = inflows.reduce((s, e) => s + e.valor, 0)
    const saldoFinal = totalIn - totalOut

    // F23: Cenário pessimista (ajuste de risco)
    // Baseado em padrões empíricos de obra de reabilitação: +20% custos, -10% receita, +30 dias datas
    const FACTOR_CUSTO = 1.20
    const FACTOR_RECEITA = 0.90
    const cenarioPessimista = {
      outflow: totalOut * FACTOR_CUSTO,
      inflow: totalIn * FACTOR_RECEITA,
      saldo_previsto: (totalIn * FACTOR_RECEITA) - (totalOut * FACTOR_CUSTO),
    }
    // Detectar atrasos históricos das fases (se há fases com data real depois da prevista, factor sobe)
    const atrasoHistorico = fases.filter(f => f.data_fim_real && f.data_fim_prevista && new Date(f.data_fim_real) > new Date(f.data_fim_prevista)).length
    const factorRisco = atrasoHistorico >= 2 ? 'alto' : atrasoHistorico === 1 ? 'medio' : 'baixo'

    res.json({
      eventos: cashflow,
      totais: { outflow: totalOut, inflow: totalIn, saldo_previsto: saldoFinal },
      cenario_pessimista: cenarioPessimista,
      factor_risco: factorRisco,
      observacao: `Cenário pessimista aplica +20% custos e -10% receita. Factor de risco actual: ${factorRisco} (${atrasoHistorico} fase${atrasoHistorico !== 1 ? 's' : ''} com atraso histórico)`,
    })
  } catch (e) { console.error('[forecast]', e.message); res.status(500).json({ error: e.message }) }
})

// F21: PDF Saída CAEP automático ao marcar fração como Vendida
// Hook que dispara o envio do PDF aos investidores quando o estado muda
async function disparoVendaFracaoAutomatico(fracaoId) {
  try {
    const { rows: fracs } = await pool.query('SELECT * FROM projeto_fracoes WHERE id = $1', [fracaoId])
    if (!fracs.length || fracs[0].estado !== 'vendido') return
    const negocioId = fracs[0].negocio_id

    // Verificar se TODAS as frações estão vendidas
    const { rows: todas } = await pool.query(
      `SELECT estado FROM projeto_fracoes WHERE negocio_id = $1 AND tipo = 'fracao'`,
      [negocioId]
    )
    const todasVendidas = todas.every(f => f.estado === 'vendido')
    if (!todasVendidas) return

    // Carregar dados + gerar PDF + enviar a investidores
    const { sendEmail, isConfigured: emailOK } = await import('./emailService.js')
    if (!emailOK()) return

    const { rows: negs } = await pool.query('SELECT * FROM negocios WHERE id = $1', [negocioId])
    const negocio = negs[0]
    // investidor_ids nunca é escrito pela app — a ligação real vive em
    // projeto_investidores. Este fallback ficava sempre vazio, o que
    // significava que este email nunca era enviado a ninguém.
    const { rows: piRows } = await pool.query('SELECT investidor_id FROM projeto_investidores WHERE negocio_id = $1', [negocioId])
    const invIds = piRows.map(p => p.investidor_id)
    if (invIds.length === 0) return

    const { rows: invs } = await pool.query(
      'SELECT id, nome, email FROM investidores WHERE id = ANY($1) AND email IS NOT NULL',
      [invIds]
    )
    if (invs.length === 0) return

    // Gerar PDF Saída em buffer
    const data = await loadProjetoCompleto(negocioId)
    if (!data) return
    const { rows: projInv } = await pool.query(
      `SELECT pi.capital, pi.percentagem, i.nome FROM projeto_investidores pi
       JOIN investidores i ON pi.investidor_id = i.id WHERE pi.negocio_id = $1`,
      [negocioId]
    )
    const investidores = projInv.length > 0
      ? projInv.map(p => ({ nome: p.nome, capital: Number(p.capital) || 0 }))
      : invs.map(i => ({ nome: i.nome, capital: (Number(negocio.capital_total) || 0) / invs.length }))

    const doc = generateRelatorioSaida({ ...data, investidores })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    await new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); doc.end() })
    const pdfBuffer = Buffer.concat(chunks)

    const subject = `${negocio.movimento}: Relatório de Saída CAEP`
    const html = `<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="background: #0d0d0d; padding: 24px; border-radius: 12px; color: white; text-align: center;">
        <p style="color: #C9A84C; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; margin: 0;">SOMNIUM PROPERTIES</p>
        <h1 style="color: #C9A84C; margin: 8px 0 0;">${negocio.movimento}</h1>
      </div>
      <p style="font-size: 15px; color: #1f2937; line-height: 1.6;">O projecto foi vendido. Em anexo está o relatório final com a distribuição CAEP.</p>
      <p style="font-size: 11px; color: #9ca3af; text-align: center;">Documento confidencial · Somnium Properties</p>
    </div>`

    for (const inv of invs) {
      sendEmail(subject, html, {
        to: inv.email,
        attachments: [{ filename: `saida-caep-${negocio.movimento.replace(/[^\w]/g, '_')}.pdf`, content: pdfBuffer }],
      }).catch(e => console.error(`[venda-auto] ${inv.email}:`, e.message))
    }
    console.log(`[venda-auto] PDF Saída CAEP enviado a ${invs.length} investidor(es) para ${negocio.movimento}`)
  } catch (e) { console.error('[venda-auto]', e.message) }
}

// ── P4.8: IA preditiva — análise de atrasos e recomendações ─
// Usa Claude Sonnet para analisar TODOS os projectos activos e sinalizar
// os que estão em risco de atraso baseado em padrões (data prevista vs progresso)
// Cache em memória das predições (30min)
let _predicoesCache = null
let _predicoesExpires = 0
router.get('/projetos/portfolio/ia-predicoes', aiRateLimit, async (req, res) => {
  try {
    if (!aiConfigured()) return res.status(503).json({ error: 'AI não configurada' })
    // Cache
    if (req.query.fresh !== '1' && _predicoesCache && _predicoesExpires > Date.now()) {
      return res.json({ ..._predicoesCache, cached: true })
    }
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

    // Carregar projectos activos com dados resumidos
    const { rows: projectos } = await pool.query(
      `SELECT n.id, n.movimento, n.categoria, n.data_compra, n.data_estimada_venda
       FROM negocios n
       WHERE n.categoria = 'Fix and Flip' AND (n.fase IS NULL OR n.fase <> 'Vendido')`
    )

    const contextos = []
    for (const p of projectos) {
      const { rows: fases } = await pool.query(
        `SELECT nome, estado, perc_execucao, data_fim_prevista FROM projeto_fases
         WHERE negocio_id = $1 ORDER BY ordem`, [p.id]
      )
      if (fases.length === 0) continue
      contextos.push({
        id: p.id,
        nome: p.movimento,
        venda_estimada: p.data_estimada_venda,
        fases: fases.map(f => `${f.nome}: ${f.estado} ${f.perc_execucao || 0}% ${f.data_fim_prevista ? `(prev. ${f.data_fim_prevista})` : ''}`),
      })
    }

    if (contextos.length === 0) return res.json({ predicoes: [] })

    const prompt = `És um consultor de obra experiente. Analisa o estado destes projectos Fix and Flip e identifica os que estão em RISCO de atraso ou desvio orçamental significativo.

Hoje é ${new Date().toLocaleDateString('pt-PT')}.

PROJECTOS:
${contextos.map(c => `\n--- ${c.nome} (venda esperada ${c.venda_estimada || '—'}) ---\n${c.fases.join('\n')}`).join('\n')}

Devolve JSON estrito:
{
  "predicoes": [
    { "projeto_id": "id-do-projecto", "projeto_nome": "nome", "risco": "alto"|"medio"|"baixo", "razao": "1 frase curta", "acao_recomendada": "1 acção concreta" }
  ]
}

Regras:
- Considera "alto" risco quando há fase em curso com data prevista a menos de 30 dias mas <50% executada, ou venda esperada nos próximos 60 dias com obra incompleta.
- "medio" se há sinais preocupantes mas ainda há margem.
- Apenas inclui projectos onde haja efectivamente risco. NÃO listes projectos saudáveis.
- Máximo 10 entradas. Devolve APENAS o JSON, sem texto à volta.`

    const t0 = Date.now()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content[0]?.text || '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    let parsed
    try { parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) }
    catch { return res.status(500).json({ error: 'Resposta IA inválida' }) }

    const result = {
      predicoes: parsed.predicoes || [],
      gerado_em: new Date().toISOString(),
      ms: Date.now() - t0,
      modelo: 'claude-sonnet-4-6',
      total_analisados: contextos.length,
    }
    _predicoesCache = result
    _predicoesExpires = Date.now() + 30 * 60 * 1000
    res.json(result)
  } catch (e) { console.error('[ia-predicoes]', e.message); res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════════════════════════════
// F15 — Assinaturas digitais in-house
// ════════════════════════════════════════════════════════════════

// Criar pedido de assinatura: gera token único, devolve link público
router.post('/projetos/:negocioId/assinaturas', async (req, res) => {
  try {
    const { documento_tipo, documento_hash, investidor_id, investidor_nome, investidor_email } = req.body || {}
    if (!documento_tipo || !documento_hash) return res.status(400).json({ error: 'documento_tipo e documento_hash obrigatórios' })
    const id = randomUUID()
    const token = randomUUID().replace(/-/g, '')
    const { rows } = await pool.query(
      `INSERT INTO projeto_assinaturas (id, negocio_id, documento_tipo, documento_hash, token, investidor_id, investidor_nome, investidor_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, req.params.negocioId, documento_tipo, documento_hash, token, investidor_id || null, investidor_nome || null, investidor_email || null]
    )
    res.status(201).json({ ...rows[0], link_aceitacao: `/aceitar/${token}` })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/projetos/:negocioId/assinaturas', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM projeto_assinaturas WHERE negocio_id = $1 ORDER BY created_at DESC',
      [req.params.negocioId]
    )
    res.json({ assinaturas: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Validar token (página pública /aceitar/:token)
router.get('/assinaturas/:token/validar', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projeto_assinaturas WHERE token = $1', [req.params.token])
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado' })
    res.json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Registar aceitação
router.post('/assinaturas/:token/aceitar', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown'
    const ua = req.headers['user-agent'] || 'unknown'
    const { rows } = await pool.query(
      `UPDATE projeto_assinaturas
       SET aceite_em = NOW(), aceite_ip = $1, aceite_user_agent = $2
       WHERE token = $3 AND aceite_em IS NULL
       RETURNING *`,
      [ip.slice(0, 45), ua.slice(0, 250), req.params.token]
    )
    if (!rows.length) return res.status(404).json({ error: 'Pedido inválido ou já aceite' })
    res.json({ ok: true, aceitacao: rows[0] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════════════════════════════
// F18 — Analytics do investidor (registo de acessos)
// ════════════════════════════════════════════════════════════════
router.post('/projetos/:negocioId/track', async (req, res) => {
  try {
    const u = await resolveCrmUser(req).catch(() => null)
    if (!u) return res.json({ ok: true, skipped: true })
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown'
    const ua = req.headers['user-agent'] || ''
    await pool.query(
      `INSERT INTO investidor_acessos (id, user_id, negocio_id, pagina, tab, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), u.id, req.params.negocioId, req.body?.pagina || null, req.body?.tab || null, ip.slice(0, 45), ua.slice(0, 250)]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, error: e.message }) }
})

router.get('/projetos/:negocioId/analytics', async (req, res) => {
  try {
    const { rows: visitas } = await pool.query(
      `SELECT user_id, COUNT(*)::int AS num_visitas, MAX(created_at) AS ultima_visita,
              COUNT(DISTINCT DATE(created_at))::int AS dias_distintos
       FROM investidor_acessos WHERE negocio_id = $1 GROUP BY user_id ORDER BY ultima_visita DESC`,
      [req.params.negocioId]
    )
    const userIds = visitas.map(v => v.user_id)
    let users = []
    if (userIds.length > 0) {
      const { rows } = await pool.query('SELECT id, nome, email FROM users WHERE id = ANY($1)', [userIds])
      users = rows
    }
    const enriched = visitas.map(v => ({
      ...v,
      user: users.find(u => u.id === v.user_id) || { nome: 'Desconhecido' },
    }))
    res.json({ analytics: enriched })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════════════════════════════
// F19 — Notificações in-app (bell icon)
// ════════════════════════════════════════════════════════════════
router.get('/notificacoes', async (req, res) => {
  try {
    const u = await resolveCrmUser(req).catch(() => null)
    if (!u) return res.json({ notificacoes: [], unread: 0 })
    const { rows } = await pool.query(
      `SELECT * FROM notificacoes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [u.id]
    )
    const { rows: unreadRows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM notificacoes WHERE user_id = $1 AND lida = false`,
      [u.id]
    )
    res.json({ notificacoes: rows, unread: unreadRows[0]?.c || 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Contagem de não lidas — endpoint leve para badge da bell. Lista completa
// só é puxada quando o utilizador abre o painel.
router.get('/notificacoes/count', async (req, res) => {
  try {
    const u = await resolveCrmUser(req).catch(() => null)
    if (!u) return res.json({ unread: 0 })
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM notificacoes WHERE user_id = $1 AND lida = false`,
      [u.id]
    )
    res.json({ unread: rows[0]?.c || 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/notificacoes/marcar-lidas', async (req, res) => {
  try {
    const u = await resolveCrmUser(req).catch(() => null)
    if (!u) return res.json({ ok: false })
    await pool.query(`UPDATE notificacoes SET lida = true WHERE user_id = $1`, [u.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Helper para criar notificação
async function criarNotificacao(userId, { tipo, titulo, mensagem, link }) {
  try {
    await pool.query(
      `INSERT INTO notificacoes (id, user_id, tipo, titulo, mensagem, link) VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), userId, tipo, titulo, mensagem || null, link || null]
    )
  } catch (e) { console.error('[notif]', e.message) }
}

// ════════════════════════════════════════════════════════════════
// F16 — Templates de obra customizáveis
// ════════════════════════════════════════════════════════════════
router.get('/projetos/templates', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projeto_templates WHERE publico = true OR created_by = $1 ORDER BY nome', [(await resolveCrmUser(req).catch(() => null))?.id || ''])
    // Templates default por categoria
    const defaults = [
      { id: '__default_ff__',  nome: 'Fix and Flip (default)',  descricao: '8 fases padrão para reabilitação em PT',           fases_json: JSON.stringify(FASES_POR_CATEGORIA['Fix and Flip']) },
      { id: '__default_caep__', nome: 'CAEP (default)',          descricao: '8 fases (igual ao Fix and Flip)',                  fases_json: JSON.stringify(FASES_POR_CATEGORIA['CAEP']) },
      { id: '__default_whs__',  nome: 'Wholesalling (default)',  descricao: '7 fases — prospecção a fee recebido',              fases_json: JSON.stringify(FASES_POR_CATEGORIA['Wholesalling']) },
      { id: '__default_med__',  nome: 'Mediação Imobiliária (default)', descricao: '7 fases — captação a escritura',           fases_json: JSON.stringify(FASES_POR_CATEGORIA['Mediação Imobiliária']) },
    ].map(t => ({ ...t, publico: true, created_at: null }))
    res.json({ templates: [...defaults, ...rows] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/projetos/templates', async (req, res) => {
  try {
    const { nome, descricao, fases_json } = req.body || {}
    if (!nome?.trim() || !fases_json) return res.status(400).json({ error: 'nome e fases_json obrigatórios' })
    const id = randomUUID()
    const u = await resolveCrmUser(req).catch(() => null)
    const { rows } = await pool.query(
      `INSERT INTO projeto_templates (id, nome, descricao, fases_json, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, nome.trim(), descricao || null, typeof fases_json === 'string' ? fases_json : JSON.stringify(fases_json), u?.id || null]
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/projetos/templates/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM projeto_templates WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── P4.1: GET audit log do projecto ──────────────────────────
router.get('/projetos/:negocioId/audit', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500)
    const { rows } = await pool.query(
      `SELECT * FROM projeto_audit WHERE negocio_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.params.negocioId, limit]
    )
    res.json({ eventos: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── P4.3: Comentários por fase ───────────────────────────────
router.get('/projetos/fases/:faseId/comentarios', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM projeto_comentarios WHERE fase_id = $1 ORDER BY created_at ASC`,
      [req.params.faseId]
    )
    res.json({ comentarios: rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/projetos/fases/:faseId/comentarios', async (req, res) => {
  try {
    const { texto } = req.body || {}
    if (!texto?.trim()) return res.status(400).json({ error: 'texto obrigatório' })
    const { rows: faseRows } = await pool.query('SELECT negocio_id FROM projeto_fases WHERE id = $1', [req.params.faseId])
    if (!faseRows.length) return res.status(404).json({ error: 'Fase não encontrada' })
    const user = await resolveCrmUser(req).catch(() => null)
    const id = randomUUID()
    const { rows } = await pool.query(
      `INSERT INTO projeto_comentarios (id, fase_id, negocio_id, autor_id, autor_nome, texto)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, req.params.faseId, faseRows[0].negocio_id, user?.id || null, user?.nome || user?.email || 'Sistema', texto.trim()]
    )
    res.status(201).json(rows[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/projetos/comentarios/:comentarioId', async (req, res) => {
  try {
    await pool.query('DELETE FROM projeto_comentarios WHERE id = $1', [req.params.comentarioId])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── P3.16 — Calendário: deadlines de fases e tarefas ─────────
// Devolve todos os eventos relevantes (fases data_fim_prevista, tarefas deadline)
// filtrados por intervalo [from, to]. Respeita acessos para roles restritos.
router.get('/projetos/calendario', async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const to = req.query.to ? new Date(req.query.to) : new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0)
    const fromStr = from.toISOString().slice(0, 10)
    const toStr = to.toISOString().slice(0, 10)

    const u = await resolveCrmUser(req)
    const isRestricted = u && RECORD_RESTRICTED_ROLES.has(u.role)
    const filtro = isRestricted
      ? `n.id IN (SELECT entidade_id FROM acessos WHERE entidade = 'negocio' AND user_id = $3)`
      : `1=1`
    const params = isRestricted ? [fromStr, toStr, u.id] : [fromStr, toStr]

    const { rows: fases } = await pool.query(
      `SELECT f.id, f.nome AS titulo, f.data_fim_prevista AS data, f.estado, f.fase_key,
              n.id AS negocio_id, n.movimento AS projeto
       FROM projeto_fases f
       JOIN negocios n ON n.id = f.negocio_id
       WHERE f.data_fim_prevista IS NOT NULL
         AND f.data_fim_prevista::date BETWEEN $1::date AND $2::date
         AND ${filtro}`,
      params
    )
    const { rows: tarefas } = await pool.query(
      `SELECT t.id, t.descricao AS titulo, t.deadline AS data, t.concluida, t.responsavel,
              f.fase_key, f.nome AS fase,
              n.id AS negocio_id, n.movimento AS projeto
       FROM projeto_tarefas t
       JOIN projeto_fases f ON t.fase_id = f.id
       JOIN negocios n ON n.id = f.negocio_id
       WHERE t.deadline IS NOT NULL
         AND t.deadline::date BETWEEN $1::date AND $2::date
         AND ${filtro}`,
      params
    )

    const eventos = [
      ...fases.map(f => ({ ...f, tipo: 'fase' })),
      ...tarefas.map(t => ({ ...t, tipo: 'tarefa' })),
    ]
    res.json({ eventos, from: fromStr, to: toStr })
  } catch (e) { console.error('[calendario]', e.message); res.status(500).json({ error: e.message }) }
})

// ── P3.18 — AI assistant: resumo do projecto ────────────────
router.get('/projetos/:negocioId/ai-resumo', aiRateLimit, async (req, res) => {
  try {
    if (!aiConfigured()) return res.status(503).json({ error: 'AI não configurada (ANTHROPIC_API_KEY)' })
    const ignorarCache = req.query.fresh === '1'
    const r = await gerarResumoProjeto(req.params.negocioId, { ignorarCache })
    if (!r.ok) return res.status(500).json({ error: r.error })
    res.json(r)
  } catch (e) { console.error('[ai-resumo]', e.message); res.status(500).json({ error: e.message }) }
})

// ── F2.7 — KPIs agregados de portfolio por modelo de negócio ─────────
router.get('/projetos/portfolio/kpis', async (req, res) => {
  try {
    const u = await resolveCrmUser(req)
    const isRestricted = u && RECORD_RESTRICTED_ROLES.has(u.role)

    const categoria = (req.query.categoria || '').trim()  // '' = todos os modelos de negócio
    const conds = ['n.deleted_at IS NULL']  // ignorar negócios na lixeira (senão KPIs somam apagados)
    const params = []
    if (isRestricted) {
      params.push(u.id)
      conds.push(`n.id IN (SELECT entidade_id FROM acessos WHERE entidade = 'negocio' AND user_id = $${params.length})`)
    }
    if (categoria) {
      params.push(categoria)
      conds.push(`n.categoria = $${params.length}`)
    }
    if (req.regiaoActiva) {
      params.push(req.regiaoActiva)
      conds.push(`n.regiao = $${params.length}`)
    }
    const filterNegocio = conds.length ? conds.join(' AND ') : '1=1'

    const { rows: stats } = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE n.fase <> 'Vendido') AS ativos,
         COALESCE(SUM(n.lucro_estimado), 0) AS lucro_estimado_total,
         COALESCE(SUM(n.lucro_real), 0) AS lucro_real_total,
         COALESCE(SUM(n.capital_total), 0) AS capital_total
       FROM negocios n WHERE ${filterNegocio}`,
      params
    )

    // Fases por estado e atrasos
    const { rows: faseStats } = await pool.query(
      `SELECT estado, COUNT(*) AS c FROM projeto_fases f
       JOIN negocios n ON n.id = f.negocio_id
       WHERE ${filterNegocio}
       GROUP BY estado`,
      params
    )
    const { rows: atrasos } = await pool.query(
      `SELECT f.id, f.nome, f.data_fim_prevista, n.id AS negocio_id, n.movimento, n.categoria,
              (CURRENT_DATE - f.data_fim_prevista::date)::int AS dias_atraso
       FROM projeto_fases f
       JOIN negocios n ON n.id = f.negocio_id
       WHERE f.data_fim_prevista IS NOT NULL
         AND f.data_fim_prevista::date < CURRENT_DATE
         AND f.estado <> 'concluida'
         AND ${filterNegocio}
       ORDER BY dias_atraso DESC
       LIMIT 5`,
      params
    )
    // Distribuição por fase actual (em_curso)
    const { rows: distribuicao } = await pool.query(
      `SELECT f.fase_key, f.nome, COUNT(*) AS projetos
       FROM projeto_fases f
       JOIN negocios n ON n.id = f.negocio_id
       WHERE f.estado = 'em_curso' AND ${filterNegocio}
       GROUP BY f.fase_key, f.nome ORDER BY projetos DESC`,
      params
    )

    res.json({
      totais: stats[0],
      fases: Object.fromEntries(faseStats.map(r => [r.estado, Number(r.c)])),
      topAtrasos: atrasos,
      distribuicaoFases: distribuicao,
    })
  } catch (e) { console.error('[portfolio/kpis]', e.message); res.status(500).json({ error: e.message }) }
})

// Vista agregada por negócio (para o detalhe da página)
router.get('/projetos/:negocioId/resumo', async (req, res) => {
  try {
    const { rows: negRows } = await pool.query('SELECT * FROM negocios WHERE id = $1', [req.params.negocioId])
    if (!negRows.length) return res.status(404).json({ error: 'Negócio não encontrado' })
    const negocio = negRows[0]

    const { rows: fases } = await pool.query(
      `SELECT id, fase_key, nome, ordem, estado, perc_execucao, data_inicio_prevista, data_fim_prevista,
              data_inicio_real, data_fim_real, orcamento_alocado, custo_real
       FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem`,
      [req.params.negocioId]
    )

    let imovel = null
    if (negocio.imovel_id) {
      const { rows: imRows } = await pool.query('SELECT id, nome, zona, tipologia, fotos FROM imoveis WHERE id = $1', [negocio.imovel_id])
      imovel = imRows[0] || null
    }

    const orcAlocado = fases.reduce((s, f) => s + (Number(f.orcamento_alocado) || 0), 0)
    const custoReal = fases.reduce((s, f) => s + (Number(f.custo_real) || 0), 0)
    const percGlobal = fases.length > 0
      ? Math.round(fases.reduce((s, f) => s + (Number(f.perc_execucao) || 0), 0) / fases.length)
      : 0
    const faseAtual = fases.find(f => f.estado === 'em_curso') || fases.find(f => f.estado === 'pendente') || fases[fases.length - 1]

    res.json({ negocio, imovel, fases, orcAlocado, custoReal, percGlobal, faseAtual })
  } catch (e) { console.error('[projetos/resumo]', e.message); res.status(500).json({ error: e.message }) }
})

export default router
