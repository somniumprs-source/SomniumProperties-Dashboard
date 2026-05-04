/**
 * API REST routes para o CRM (PostgreSQL).
 */
import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { readFile, unlink } from 'fs/promises'
import { createClient } from '@supabase/supabase-js'

// Supabase Storage client para uploads persistentes
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const supabaseStorage = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null
import { Imoveis, Investidores, Consultores, Negocios, Despesas, Tarefas, ConsultorInteracoes, ConsultorFollowups, DocumentosInvestidor, getDashboardStats } from './crud.js'
import pool from './pg.js'
import { syncFromNotion, syncAllFromNotion, syncToNotion } from './sync.js'
import { generateImovelPDF } from './pdfReport.js'
import { syncFireflies, fetchTranscript, isConfigured as firefliesConfigured } from './firefliesSync.js'
import { syncForms, isConfigured as formsConfigured } from './formsSync.js'
import { createImovelFolder, moveImovelFolder, uploadDocToFolder, isConfigured as driveConfigured } from './driveSync.js'
import { generateDoc, getDocsForEstado } from './pdfImovelDocs.js'
import { onImovelCreated, listDocumentos, persistDocumento } from './documentLifecycle.js'
import { analyzeReuniao, autoFillInvestidor } from './meetingAnalysis.js'
import { generateMeetingPDF } from './pdfMeetingReport.js'
import { ensureLabels, organizeMessage, organizeBatch, autoOrganize, isConfigured as gmailConfigured } from './gmailSync.js'
import { exportDepartment } from './excelExport.js'
import { scrapePhotosFromLink } from './linkScraper.js'
import { generateDocx, getAvailableTypes } from './docxGenerator.js'
import { runEstudoLocalizacao } from '../lib/estudoLocalizacao.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.resolve(__dirname, '../../public/uploads/despesas')
const imoveisUploadsDir = path.resolve(__dirname, '../../public/uploads/imoveis')

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
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp|heic|pdf|doc|docx|xls|xlsx)$/i
    cb(null, allowed.test(path.extname(file.originalname)))
  },
})

const router = Router()

// Desactivar cache em todas as respostas do CRM — dados tem que ser sempre frescos
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  next()
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
function crudRoutes(path, crud, { onCreate, onUpdate } = {}) {
  router.get(path, async (req, res) => {
    try {
      const { limit = 100, offset = 0, sort, search, ...filter } = req.query
      if (search) {
        const data = await crud.search(search, +limit)
        return res.json({ data, total: data.length })
      }
      res.json(await crud.list({ limit: +limit, offset: +offset, sort, filter }))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.get(`${path}/stats`, async (req, res) => {
    try { res.json(await crud.stats()) }
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
      const item = await crud.create(req.body)
      const table = path.slice(1)
      syncToNotion(table, item.id).catch(e => console.error(`[sync] create ${table}:`, e.message))
      if (onCreate) onCreate(item).catch(e => console.error(`[hook] create ${table}:`, e.message))
      res.status(201).json(item)
    } catch (e) { res.status(400).json({ error: e.message }) }
  })

  router.put(`${path}/:id`, async (req, res) => {
    try {
      const item = await crud.update(req.params.id, req.body)
      if (!item) return res.status(404).json({ error: 'Não encontrado' })
      const table = path.slice(1)
      syncToNotion(table, req.params.id).catch(e => console.error(`[sync] update ${table}:`, e.message))
      if (onUpdate) onUpdate(item, req.body).catch(e => console.error(`[hook] update ${table}:`, e.message))
      res.json(item)
    } catch (e) { res.status(400).json({ error: e.message }) }
  })

  router.delete(`${path}/:id`, async (req, res) => {
    try {
      const ok = await crud.delete(req.params.id)
      if (!ok) return res.status(404).json({ error: 'Não encontrado' })
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
}

crudRoutes('/imoveis', Imoveis, {
  onCreate: async (item) => {
    if (driveConfigured()) {
      await createImovelFolder(item.id, item.nome || 'Sem nome', item.estado || 'Adicionado')
    }
    // Auto-gerar Ficha do Imóvel v1 (persiste em disco + documentos_imovel)
    onImovelCreated(item).catch(e => console.error('[docs] onCreate ficha:', e.message))
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
      // Gerar documentos da fase e upload ao Drive
      const docs = getDocsForEstado(body.estado)
      for (const tipo of docs) {
        try {
          let analise = null
          try { const { rows: [a] } = await pool.query('SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1', [item.id]); analise = a } catch {}
          const pdfDoc = await generateDoc(tipo, item, analise)
          if (pdfDoc && driveConfigured()) {
            await uploadDocToFolder(item.id, pdfDoc, `${tipo}.pdf`)
          }
        } catch (e) { console.error(`[docs] Erro ${tipo}:`, e.message) }
      }
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
  } catch (e) { res.status(500).json({ error: e.message }) }
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

// ── Documento PDF por fase do imóvel ─────────────────────────
router.get('/imoveis/:id/documento/:tipo', async (req, res) => {
  try {
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    let analise = null
    try {
      const { rows: [a] } = await pool.query('SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1', [imovel.id])
      analise = a
    } catch {}

    const doc = await generateDoc(req.params.tipo, imovel, analise)
    if (!doc) return res.status(400).json({ error: 'Tipo de documento inválido' })

    const nome = (imovel.nome || 'doc').replace(/[^a-zA-Z0-9À-ú ]/g, '').replace(/\s+/g, '_')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${req.params.tipo}_${nome}.pdf"`)
    doc.pipe(res)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Relatório PDF do imóvel ──────────────────────────────────
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
    res.setHeader('Content-Disposition', `inline; filename="Relatorio_${nome}.pdf"`)

    const doc = generateImovelPDF(imovel, analise || null)
    doc.pipe(res)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Relatório compilado para investidor ──────────────────────
router.get('/imoveis/:id/relatorio-investidor', async (req, res) => {
  try {
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })
    const { rows: [analise] } = await pool.query(
      'SELECT * FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1', [imovel.id]
    ).catch(() => ({ rows: [] }))

    const seccoes = (req.query.seccoes || 'investimento,comparaveis,caep,stress_tests').split(',').filter(Boolean)
    const { generateCompiledReport } = await import('./pdfImovelDocs.js')
    const nome = (imovel.nome || 'imovel').replace(/[^a-zA-Z0-9À-ú ]/g, '').replace(/\s+/g, '_')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="Dossier_Investimento_${nome}.pdf"`)
    const doc = await generateCompiledReport(imovel, analise || null, seccoes)
    doc.pipe(res)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

crudRoutes('/investidores', Investidores)

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

router.post('/investidores/:id/documentos', async (req, res) => {
  try {
    const { tipo, nome, imovel_id, notas } = req.body
    if (!tipo || !nome) return res.status(400).json({ error: 'tipo e nome são obrigatórios' })
    const id = randomUUID()
    const now = new Date().toISOString()
    await pool.query(
      `INSERT INTO documentos_investidor (id, investidor_id, imovel_id, tipo, nome, notas, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, req.params.id, imovel_id || null, tipo, nome, notas || null, now]
    )
    res.status(201).json({ id, investidor_id: req.params.id, imovel_id, tipo, nome, notas, created_at: now })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/investidores/:id/documentos/:docId', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM documentos_investidor WHERE id = $1 AND investidor_id = $2',
      [req.params.docId, req.params.id]
    )
    if (rowCount === 0) return res.status(404).json({ error: 'Não encontrado' })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Endpoints específicos de consultores (ANTES do crudRoutes para evitar conflito com :id) ─

// Find-or-create consultor (dedup por nome/contacto)
router.post('/consultores/find-or-create', async (req, res) => {
  try {
    const { nome, imobiliaria, contacto } = req.body
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

    // 3. Criar novo
    const item = await Consultores.create({
      nome: nome.trim(),
      estatuto: 'Cold Call',
      estado_avaliacao: 'Em avaliação',
      imobiliaria: imobiliaria || null,
      contacto: contacto || null,
    })
    res.status(201).json(item)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Lista enriquecida de consultores (com métricas e alertas inline)
router.get('/consultores/enriched', async (req, res) => {
  try {
    const { rows: consultores } = await pool.query('SELECT * FROM consultores ORDER BY score_prioridade DESC NULLS LAST, updated_at DESC')
    const { rows: imoveis } = await pool.query('SELECT nome_consultor, estado, check_qualidade, data_adicionado FROM imoveis WHERE nome_consultor IS NOT NULL')
    const { rows: interacoes } = await pool.query('SELECT consultor_id, data_hora, direcao FROM consultor_interacoes ORDER BY data_hora DESC')
    const { rows: followupAgg } = await pool.query('SELECT consultor_id, MIN(data) AS primeiro_followup, MAX(data) AS ultimo_followup FROM consultor_followups GROUP BY consultor_id')
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

crudRoutes('/consultores', Consultores)
crudRoutes('/negocios', Negocios)

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
crudRoutes('/tarefas', Tarefas)
crudRoutes('/consultor-interacoes', ConsultorInteracoes)

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

router.post('/consultores/:id/followups', async (req, res) => {
  try {
    const consultorId = req.params.id
    const { data, motivo, proximo_follow_up } = req.body
    if (!data) return res.status(400).json({ error: 'Data do follow-up é obrigatória' })

    const item = await ConsultorFollowups.create({
      consultor_id: consultorId,
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
router.post('/imoveis/:id/fotos', uploadImovel.array('fotos', 20), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'Nenhum ficheiro válido (JPG, PNG, WEBP até 15MB)' })
    const imovel = await Imoveis.getById(req.params.id)
    if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' })

    const fotos = imovel.fotos ? JSON.parse(imovel.fotos) : []
    for (const file of req.files) {
      let filePath = `/uploads/imoveis/${file.filename}`

      // Upload para Supabase Storage (persistente) se configurado
      if (supabaseStorage) {
        const storagePath = `imoveis/${req.params.id}/${file.filename}`
        const fileBuffer = await readFile(file.path)
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

      fotos.push({
        id: randomUUID(),
        name: file.originalname,
        path: filePath,
        type: file.mimetype,
        size: file.size,
        uploaded_at: new Date().toISOString(),
      })
    }
    await Imoveis.update(req.params.id, { fotos: JSON.stringify(fotos) })
    res.json({ ok: true, fotos })
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
router.post('/imoveis/:id/localizacao', uploadImovel.single('imagem'), async (req, res) => {
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
      if (folder.name === 'Fotos') result.fotos.push(...files)
      if (folder.name === 'Documentos') result.documentos.push(...files)
    }

    res.json(result)
  } catch (e) {
    console.error('[drive] list files error:', e.message)
    res.json({ files: [], fotos: [], documentos: [], configured: false, error: e.message })
  }
})

// ── Upload de documentos para despesas ───────────────────────
router.post('/despesas/:id/upload', upload.single('file'), async (req, res) => {
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
  try { res.json(await getDashboardStats()) }
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
    res.setHeader('Content-Disposition', `inline; filename="Relatorio_Reuniao_${nome}.pdf"`)

    const doc = generateMeetingPDF(reuniao, analise, investidor)
    doc.pipe(res)
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
    // Negócios onde este investidor aparece
    const { rows: negocios } = await pool.query("SELECT * FROM negocios WHERE investidor_ids LIKE $1", [`%${inv.notion_id ?? inv.id}%`])
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
    const { rows: imoveis } = await pool.query("SELECT id, nome, estado, tipologia, ask_price, zona, tipo_oportunidade, check_qualidade, check_ouro, data_adicionado FROM imoveis WHERE nome_consultor ILIKE $1", [`%${cons.nome}%`])
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
        const resposta = sortedInteracoes.slice(i + 1).find(x => x.direcao === 'Resposta')
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
    if (tab === 'imoveis') {
      const { rows } = await pool.query(`
        SELECT estado, COUNT(*) as count, COALESCE(SUM(ask_price),0) as valor
        FROM imoveis GROUP BY estado ORDER BY count DESC
      `)
      const { rows: [totals] } = await pool.query(`SELECT COUNT(*) as total, COALESCE(AVG(NULLIF(roi,0)),0) as roi_medio FROM imoveis`)
      res.json({ byEstado: rows, total: parseInt(totals.total), roiMedio: parseFloat(totals.roi_medio).toFixed(1) })
    } else if (tab === 'investidores') {
      const { rows } = await pool.query(`SELECT status, COUNT(*) as count FROM investidores GROUP BY status ORDER BY count DESC`)
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total,
          COUNT(CASE WHEN classificacao IN ('A','B') THEN 1 END) as ab,
          COALESCE(SUM(capital_max),0) as capital
        FROM investidores
      `)
      res.json({ byStatus: rows, total: parseInt(totals.total), classAB: parseInt(totals.ab), capitalTotal: parseFloat(totals.capital) })
    } else if (tab === 'consultores') {
      const { rows } = await pool.query(`SELECT estatuto, COUNT(*) as count FROM consultores GROUP BY estatuto ORDER BY count DESC`)
      const { rows: [totals] } = await pool.query(`SELECT COUNT(*) as total FROM consultores`)
      res.json({ byEstatuto: rows, total: parseInt(totals.total) })
    } else if (tab === 'negocios') {
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total, COALESCE(SUM(lucro_estimado),0) as lucro_est,
          COALESCE(SUM(lucro_real),0) as lucro_real,
          COUNT(CASE WHEN fase = 'Vendido' THEN 1 END) as vendidos
        FROM negocios
      `)
      res.json(totals)
    } else if (tab === 'despesas') {
      const { rows: [totals] } = await pool.query(`
        SELECT COUNT(*) as total,
          COALESCE(SUM(CASE WHEN timing = 'Mensalmente' THEN custo_mensal ELSE 0 END),0) as burn_rate,
          COALESCE(SUM(custo_anual),0) as total_anual
        FROM despesas
      `)
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
        'Marcar call':             'Marcar call com investidor {name}',
        'Call marcada':            'Preparar apresentação para {name}',
        'Follow Up':               'Follow-up com investidor {name}',
        'Investidor em espera': 'Enviar proposta de negócio a {name}',
        'Investidor em parceria':  'Preparar onboarding de {name}',
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
router.get('/lookup/imoveis', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, nome, estado FROM imoveis ORDER BY nome")
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
router.get('/lookup/investidores', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, nome, status FROM investidores ORDER BY nome")
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
router.get('/lookup/consultores', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, nome, estatuto FROM consultores ORDER BY nome")
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Automações PostgreSQL ──────────────────────────────────────
router.post('/automation/score-investidores', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM investidores')
    const { rows: allScorecards } = await pool.query('SELECT * FROM scorecards ORDER BY created_at DESC')
    const updated = []
    const now = new Date().toISOString()

    for (const inv of rows) {
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

      // Sem scorecard — scoring por completude do perfil (SOP 2 simplificado)
      let tipo = 'Passivo'
      try { if (JSON.parse(inv.tipo_investidor || '[]').includes('Ativo')) tipo = 'Ativo' } catch {}

      // C1: Capacidade Financeira
      const capital = Math.max(inv.capital_min || 0, inv.capital_max || 0)
      const limiteMin = tipo === 'Ativo' ? 200000 : 50000
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

router.post('/automation/score-consultores', async (req, res) => {
  try {
    const { rows: consultores } = await pool.query('SELECT * FROM consultores')
    const { rows: imoveis } = await pool.query('SELECT nome_consultor, estado FROM imoveis WHERE nome_consultor IS NOT NULL')
    const updated = []
    for (const c of consultores) {
      let score = 0
      // Contagem real de imóveis associados (da lista de imóveis)
      const meusImoveis = imoveis.filter(i => i.nome_consultor?.trim().toLowerCase() === c.nome?.trim().toLowerCase())
      const leads = meusImoveis.length
      // Qualidade baseada no estado do pipeline
      const imoveisAvancados = imoveisEntregues.filter(im => qualidadeImovel(im.estado) >= 0.75).length
      const imoveisMedios = meusImoveis.filter(im => qualidadeImovel(im.estado) >= 0.5).length

      score += Math.min(leads * 3, 30)
      score += Math.min((c.imoveis_off_market || 0) * 10, 30)
      if (c.data_proximo_follow_up && new Date(c.data_proximo_follow_up) >= new Date()) score += 15
      if (c.email) score += 5
      const imobs = c.imobiliaria ? JSON.parse(c.imobiliaria) : []
      if (imobs.length > 0) score += 5
      const zonas = c.zonas ? JSON.parse(c.zonas) : []
      if (zonas.length > 0) score += 5
      if (leads > 0) score += 10
      // Bónus por imóveis avançados no pipeline (negociação+, wholesaling, etc.)
      score += Math.min(imoveisAvancados * 8, 20)
      score += Math.min(imoveisMedios * 3, 10)

      const classificacao = CLASSE_POR_SCORE(score)
      const needsUpdate = c.classificacao !== classificacao || (c.imoveis_enviados || 0) !== leads
      if (needsUpdate) {
        await pool.query(
          'UPDATE consultores SET classificacao = $1, imoveis_enviados = $2, updated_at = $3 WHERE id = $4',
          [classificacao, leads, new Date().toISOString(), c.id]
        )
        updated.push({ nome: c.nome, score, classificacao, imoveisReais: leads, imoveisAvancados })
      }
    }
    res.json({ ok: true, atualizados: updated.length, detalhes: updated })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/automation/calc-roi', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM imoveis WHERE ask_price > 0')
    const updated = []
    for (const im of rows) {
      const custoTotal = im.ask_price + (im.custo_estimado_obra || 0)
      if (custoTotal <= 0) continue
      let roi = null
      if (im.valor_venda_remodelado > 0) {
        roi = Math.round((im.valor_venda_remodelado - custoTotal) / custoTotal * 10000) / 100
      } else if (im.valor_proposta > 0 && im.valor_proposta < im.ask_price) {
        roi = Math.round((im.ask_price - im.valor_proposta) / im.ask_price * 10000) / 100
      }
      if (roi === null) continue
      const roiAnualizado = Math.round(roi * 2 * 100) / 100
      if (Math.abs((im.roi || 0) - roi) > 0.1) {
        await pool.query('UPDATE imoveis SET roi = $1, roi_anualizado = $2, updated_at = $3 WHERE id = $4',
          [roi, roiAnualizado, new Date().toISOString(), im.id])
        updated.push({ nome: im.nome, roi, roiAnualizado })
      }
    }
    res.json({ ok: true, atualizados: updated.length, detalhes: updated })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/automation/score-prioridade-consultores', async (req, res) => {
  try {
    const { rows: consultores } = await pool.query('SELECT * FROM consultores')
    const { rows: imoveis } = await pool.query('SELECT nome_consultor, estado, check_qualidade, check_ouro FROM imoveis WHERE nome_consultor IS NOT NULL')
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
          const resp = minhasInteracoes.slice(i + 1).find(x => x.direcao === 'Resposta')
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
    const { rows: investidores } = await pool.query('SELECT * FROM investidores ORDER BY pontuacao DESC NULLS LAST')
    const { rows: negocios } = await pool.query('SELECT * FROM negocios')
    const { rows: reunioes } = await pool.query("SELECT id, entidade_id, data, duracao_min FROM reunioes WHERE entidade_tipo = 'investidores'")
    const now = new Date()

    const statusOrder = ['Potencial Investidor','Marcar call','Call marcada','Follow Up','Investidor em espera','Investidor em parceria']

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
      const meusNegocios = negocios.filter(n => (n.investidor_ids || '').includes(inv.id))
      const minhasReunioes = reunioes.filter(r => r.entidade_id === inv.id)

      const diasSemContacto = inv.data_ultimo_contacto
        ? Math.floor((now - new Date(inv.data_ultimo_contacto)) / 86400000)
        : null

      // Alertas
      if (!inv.data_ultimo_contacto || diasSemContacto > 30) report.alertas.sem_contacto_30d++
      if (minhasReunioes.length === 0) report.alertas.sem_reuniao++
      if (!capitalMax) report.alertas.sem_capital++
      if (!inv.classificacao) report.alertas.sem_classificacao++
      if (!inv.nda_assinado && ['Investidor em espera','Investidor em parceria'].includes(status)) report.alertas.nda_pendente++

      // Métricas
      if (capitalMax > 0) { somaCapital += capitalMax; comCapital++ }
      report.metricas_globais.capital_total += capitalMax
      report.metricas_globais.capital_investido += montante
      if (minhasReunioes.length > 0) report.metricas_globais.com_reuniao++
      if (inv.nda_assinado) report.metricas_globais.com_nda++
      if (status === 'Investidor em parceria') report.metricas_globais.em_parceria++

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

    // Atualizar investidor com nova classificação e pontuação
    await pool.query(
      'UPDATE investidores SET classificacao = $1, pontuacao = $2, status = CASE WHEN status IN ($5, $6) THEN $4 ELSE status END, updated_at = $3 WHERE id = $7',
      [classificacao, ponderado, now, 'Investidor em espera', 'Call marcada', 'Follow Up', investidor_id]
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
router.post('/investidores/:id/duplicar', async (req, res) => {
  try {
    const { tipo_principal } = req.body
    if (!tipo_principal || !['Ativo', 'Passivo'].includes(tipo_principal)) {
      return res.status(400).json({ error: 'tipo_principal deve ser "Ativo" ou "Passivo"' })
    }

    const { rows: [original] } = await pool.query('SELECT * FROM investidores WHERE id = $1', [req.params.id])
    if (!original) return res.status(404).json({ error: 'Investidor não encontrado' })

    if (original.tipo_principal === tipo_principal) {
      return res.status(400).json({ error: `Investidor já é ${tipo_principal}` })
    }

    // Verificar se já existe duplicado deste tipo
    const { rows: existente } = await pool.query(
      'SELECT id FROM investidores WHERE duplicado_de = $1 AND tipo_principal = $2',
      [original.duplicado_de || original.id, tipo_principal]
    )
    if (existente.length > 0) {
      return res.status(400).json({ error: `Já existe duplicado ${tipo_principal} (ID: ${existente[0].id})`, duplicado_id: existente[0].id })
    }

    const novoId = randomUUID()
    const now = new Date().toISOString()
    const origemId = original.duplicado_de || original.id

    await pool.query(
      `INSERT INTO investidores (id, nome, status, origem, telemovel, email,
        capital_min, capital_max, perfil_risco, nda_assinado,
        data_primeiro_contacto, data_ultimo_contacto, data_reuniao,
        tipo_principal, duplicado_de, tipo_investidor, notas,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18)`,
      [novoId,
        `${original.nome} (${tipo_principal})`,
        'Potencial Investidor',
        original.origem,
        original.telemovel,
        original.email,
        original.capital_min || 0,
        original.capital_max || 0,
        original.perfil_risco,
        original.nda_assinado || 0,
        original.data_primeiro_contacto,
        original.data_ultimo_contacto,
        original.data_reuniao,
        tipo_principal,
        origemId,
        JSON.stringify([tipo_principal]),
        `Duplicado de "${original.nome}" (${original.tipo_principal || 'Passivo'}) — perfil ${tipo_principal}`,
        now]
    )

    // Marcar original com duplicado_de se ainda não tem
    if (!original.duplicado_de) {
      await pool.query('UPDATE investidores SET duplicado_de = $1 WHERE id = $1', [original.id])
    }

    res.json({ ok: true, id: novoId, nome: `${original.nome} (${tipo_principal})`, tipo_principal })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

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
          const resp = minhasInt.slice(i + 1).find(x => x.direcao === 'Resposta')
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
    for (const ep of ['score-investidores', 'score-consultores', 'score-prioridade-consultores', 'calc-roi']) {
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
    const backup = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data
    let restored = 0
    for (const t of BACKUP_TABLES) {
      if (!backup[t]?.length) continue
      // Limpar tabela
      await pool.query(`DELETE FROM ${t}`)
      // Re-inserir registos
      for (const row of backup[t]) {
        const fields = Object.entries(row).filter(([, v]) => v !== undefined && v !== null)
        const cols = fields.map(([k]) => k)
        const vals = fields.map((_, i) => `$${i + 1}`)
        await pool.query(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT (id) DO NOTHING`, fields.map(([, v]) => v))
        restored++
      }
    }
    res.json({ ok: true, restored, fromBackup: rows[0].created_at })
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

    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
    url.searchParams.set('origins', origem)
    url.searchParams.set('destinations', destinos.map(d => d.endereco).join('|'))
    url.searchParams.set('mode', mode)
    url.searchParams.set('region', region)
    url.searchParams.set('language', 'pt')
    url.searchParams.set('key', apiKey)

    const r = await fetch(url.toString())
    const j = await r.json()
    if (j.status !== 'OK') {
      return res.status(502).json({ error: `Distance Matrix: ${j.status}`, detalhe: j.error_message || null })
    }

    const linha = j.rows?.[0]?.elements || []
    const resultados = destinos.map((d, i) => {
      const el = linha[i] || {}
      return {
        categoria: d.categoria || null,
        icone: d.icone || null,
        endereco: d.endereco,
        distancia_metros: el.status === 'OK' ? el.distance?.value ?? null : null,
        distancia_texto: el.status === 'OK' ? el.distance?.text ?? null : null,
        duracao_segundos: el.status === 'OK' ? el.duration?.value ?? null : null,
        duracao_texto: el.status === 'OK' ? el.duration?.text ?? null : null,
        status: el.status || 'UNKNOWN',
      }
    })

    const payload = {
      origem,
      mode,
      origem_resolvida: j.origin_addresses?.[0] || null,
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
    res.setHeader('Content-Disposition', `inline; filename="${fname}"`)

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
    doc.pipe(res)
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

export default router
