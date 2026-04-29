import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { Client } from '@notionhq/client'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors())
app.use(express.json())
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }))
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')))

// ── Auth middleware (Supabase JWT) ────────────────────────────
import { createClient } from '@supabase/supabase-js'
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mjgusjuougzoeiyavsor.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const supabaseAdmin = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null

app.use('/api', async (req, res, next) => {
  // CRM API — historicamente sem auth, mas se vier token populamos req.user
  // (necessário para os requireModule de /api/crm/* identificarem o utilizador).
  if (req.path.startsWith('/crm/')) {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token
    if (token && supabaseAdmin) {
      try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token)
        if (user) req.user = user
      } catch {}
    }
    return next()
  }
  // Webhook Twilio — validacao feita no handler (X-Twilio-Signature)
  if (req.path.startsWith('/webhook/')) return next()
  // Cron jobs, templates, relatórios, reactivação — protegidos por API key interna
  if (req.path.startsWith('/cron/') || req.path.startsWith('/template/') || req.path.startsWith('/relatorios') || req.path.startsWith('/reactivacao')) {
    const internalKey = process.env.INTERNAL_API_KEY
    if (internalKey && req.headers['x-api-key'] !== internalKey) {
      // Em dev (sem key configurada), deixar passar
      if (internalKey) return res.status(403).json({ error: 'Acesso negado' })
    }
    return next()
  }
  // PDFs e documentos — abrem em nova janela sem token
  if (req.path.includes('/relatorio') || req.path.includes('/documento/')) return next()
  // Diagnostico publico de integracoes — so expoe estado, nunca credenciais
  if (req.path === '/calendar/status') return next()
  // Backfill protegido por INTERNAL_API_KEY (validado no handler)
  if (req.path === '/calendar/backfill') return next()
  // Se não há service key configurada, deixar passar (dev mode)
  if (!supabaseAdmin) return next()
  // Token via header Authorization OU via query string (para PDFs abertos em novo tab)
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token
  if (!token) return res.status(401).json({ error: 'Autenticação necessária' })
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Sessão inválida' })
    req.user = user
    next()
  } catch {
    res.status(401).json({ error: 'Sessão inválida' })
  }
})

// ── CRM API (PostgreSQL/Supabase) ────────────────────────────
try {
  const { initSchema } = await import('./src/db/pg.js')
  await initSchema()
  const { default: crmRoutes } = await import('./src/db/routes.js')
  app.use('/api/crm', crmRoutes)
  const { default: analiseRoutes } = await import('./src/db/analiseRoutes.js')
  app.use('/api/crm', analiseRoutes)
  console.log('[crm] API CRM + Análises montada em /api/crm (PostgreSQL)')

  // ── Gestão de utilizadores e camadas de acesso ───────────────
  const { default: userRoutes, accessRouter, requireRole, requireModule, restrictByAccess } = await import('./src/db/userRoutes.js')
  app.use('/api/users', userRoutes)
  app.use('/api/acessos', accessRouter)
  // Sub-módulos do CRM — bloqueiam roles que não estão na ROLE_MODULES respectiva
  app.use('/api/crm/investidores', requireModule('crm.investidores'))
  app.use('/api/crm/consultores',  requireModule('crm.consultores'))
  app.use('/api/crm/empreiteiros', requireModule('crm.empreiteiros'))
  // Imóveis e Negócios: parceiros podem aceder mas filtrados por registo (tabela acessos)
  app.use('/api/crm/imoveis',  restrictByAccess('imovel'))
  app.use('/api/crm/negocios', requireModule('crm.negocios'), restrictByAccess('negocio'))
  // Filtros por área (admin passa sempre; em dev sem Supabase passa sempre)
  app.use('/api/financeiro',         requireRole('financeiro'))
  app.use('/api/kpis/financeiro',    requireRole('financeiro'))
  app.use('/api/comercial',          requireRole('comercial'))
  app.use('/api/kpis/comercial',     requireRole('comercial'))
  app.use('/api/marketing',          requireRole('comercial'))
  app.use('/api/kpis/marketing',     requireRole('comercial'))
  app.use('/api/operacoes',          requireRole('operacoes'))
  app.use('/api/kpis/operacoes',     requireRole('operacoes'))
  app.use('/api/tarefas',            requireRole('operacoes'))
  app.use('/api/calendar/events',    requireRole('operacoes'))
  app.use('/api/alertas',            requireRole('operacoes'))
  console.log('[users] Camadas de acesso activas')

  // ── WhatsApp Webhook (Twilio) ───────────────────────────────
  try {
    const { receiveWhatsAppMessage, isConfigured: waConfigured } = await import('./src/db/whatsappAgent.js')
    const { runFollowUp, runRelatorioDiario, runRelatorioSemanal, REACTIVATION_TEMPLATE } = await import('./src/db/cronJobs.js')
    const { startCronJobs } = await import('./src/db/cronJobs.js')

    // Tracking do ultimo pedido recebido no webhook
    let lastWebhookReceived = null

    // Webhook POST /api/webhook/whatsapp (recepção Twilio — com validacao de assinatura)
    const { validateTwilioSignature } = await import('./src/db/whatsappAgent.js')
    app.post('/api/webhook/whatsapp', express.urlencoded({ extended: false }), (req, res) => {
      lastWebhookReceived = { timestamp: new Date().toISOString(), from: req.body?.From || '?' }
      // Validar assinatura Twilio (se configurada)
      const twilioSig = req.headers['x-twilio-signature']
      const webhookUrl = process.env.TWILIO_WEBHOOK_URL
      if (webhookUrl && twilioSig) {
        if (!validateTwilioSignature(webhookUrl, req.body || {}, twilioSig)) {
          console.warn('[whatsapp] Assinatura Twilio invalida — pedido rejeitado')
          return res.status(403).send('<Response></Response>')
        }
      }

      // Responder 200 ao Twilio sem mensagem automatica (o agente responde via API)
      res.set('Content-Type', 'text/xml')
      res.status(200).send('<Response></Response>')

      const from = req.body.From || ''
      let body = req.body.Body || ''
      const numMedia = parseInt(req.body.NumMedia || '0')

      // Detectar media (áudios, fotos, ficheiros) e pedir texto ao consultor
      if (numMedia > 0) {
        const mediaType = req.body.MediaContentType0 || ''
        if (mediaType.startsWith('audio/')) {
          body = body
            ? `${body}\n[ÁUDIO RECEBIDO — pedir ao consultor para enviar por escrito]`
            : '[ÁUDIO RECEBIDO — pedir ao consultor para enviar por escrito]'
        } else if (mediaType.startsWith('image/')) {
          body = body
            ? `${body}\n[IMAGEM RECEBIDA — pedir dados por escrito ao consultor]`
            : '[IMAGEM RECEBIDA — pedir dados por escrito ao consultor]'
        } else if (!body) {
          body = '[FICHEIRO RECEBIDO — pedir dados por escrito ao consultor]'
        }
      }

      if (from && body) {
        receiveWhatsAppMessage(from, body, true)
      }
    })

    // Endpoint de status do agente WhatsApp
    const { isGoogleConfigured } = await import('./src/db/googleAuth.js')
    app.get('/api/webhook/whatsapp/status', (_req, res) => {
      res.json({
        agente_activo: waConfigured(),
        twilio: {
          sid: !!process.env.TWILIO_ACCOUNT_SID,
          token: !!process.env.TWILIO_AUTH_TOKEN,
          number: process.env.TWILIO_WHATSAPP_NUMBER || null,
          webhook_url: process.env.TWILIO_WEBHOOK_URL || 'NAO CONFIGURADO — definir TWILIO_WEBHOOK_URL',
        },
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        google_oauth: isGoogleConfigured(),
        ultimo_webhook: lastWebhookReceived || 'Nenhum pedido recebido desde o ultimo restart',
        instrucoes: !process.env.TWILIO_WEBHOOK_URL
          ? 'Configurar no Twilio Console: Sandbox Settings → When a message comes in → https://somniumproperties-dashboard.onrender.com/api/webhook/whatsapp (HTTP POST)'
          : null,
      })
    })

    // Endpoint para retomar controlo do agente
    app.post('/api/consultores/:id/retomar-agente', async (req, res) => {
      try {
        const { query: pgQuery } = await import('./src/db/pg.js')
        await pgQuery('UPDATE consultores SET controlo_manual = false, updated_at = $1 WHERE id = $2',
          [new Date().toISOString(), req.params.id])
        res.json({ ok: true })
      } catch (e) { res.status(500).json({ error: e.message }) }
    })

    // Endpoint para marcar handoff manual
    app.post('/api/consultores/:id/handoff', async (req, res) => {
      try {
        const { query: pgQuery } = await import('./src/db/pg.js')
        await pgQuery('UPDATE consultores SET controlo_manual = true, updated_at = $1 WHERE id = $2',
          [new Date().toISOString(), req.params.id])
        res.json({ ok: true })
      } catch (e) { res.status(500).json({ error: e.message }) }
    })

    // Endpoint para processar comando de voz (Speech → Claude API → Accao no CRM)
    app.post('/api/voice/process', async (req, res) => {
      try {
        const { text } = req.body
        if (!text?.trim()) return res.status(400).json({ error: 'Texto vazio' })

        const { query: pgQuery } = await import('./src/db/pg.js')
        const { randomUUID } = await import('crypto')
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const now = new Date().toISOString()
        const hoje = new Date().toISOString().slice(0, 10)

        // Buscar consultores e imoveis para contexto
        const { rows: consultores } = await pgQuery("SELECT id, nome FROM consultores LIMIT 200")
        const { rows: imoveis } = await pgQuery("SELECT id, nome, estado FROM imoveis LIMIT 200")
        const consNomes = consultores.map(c => c.nome).join(', ')
        const imNomes = imoveis.map(i => `${i.nome} (${i.estado})`).join(', ')

        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: `Interpretas comandos de voz em português para um CRM imobiliário. Data de hoje: ${hoje}.

CONSULTORES NA BASE: ${consNomes}
IMÓVEIS NA BASE: ${imNomes}

Devolve SEMPRE JSON com exactamente este schema:
{
  "accao": "TAREFA|NOTA_IMOVEL|NOTA_CONSULTOR|INTERACAO|MOVER_ESTADO|CLASSIFICAR|FOLLOW_UP|CRIAR_IMOVEL|ATUALIZAR_IMOVEL|CRIAR_CONSULTOR",
  "descricao": "texto limpo e claro da tarefa/nota (reformula se necessario)",
  "entidade": "nome do consultor ou imovel (exacto da base)",
  "entidade_tipo": "consultor|imovel|null",
  "data": "YYYY-MM-DD",
  "hora_inicio": "HH:MM ou null",
  "hora_fim": "HH:MM ou null",
  "duracao_horas": numero (default 1 se nao especificado),
  "categoria": "Follow-up Consultor|Visita|Análise|Proposta|Documentação|Reunião|Obra|Outro",
  "novo_estado": "estado pipeline ou null",
  "canal": "chamada|whatsapp|null",
  "preencher_data_visita": true|false (true se for visita a imovel),
  "preencher_data_chamada": true|false (true se for chamada a consultor/imovel),
  "mensagem_ui": "texto curto para mostrar ao utilizador"
}

REGRAS DE INTERPRETAÇÃO:
- Se diz "às 18 horas" sem hora fim → hora_inicio=18:00, duracao=1h, hora_fim=19:00
- Se diz "das 10 às 12" → hora_inicio=10:00, hora_fim=12:00, duracao=2
- Se diz "durante 2 horas" → duracao=2
- Se diz "sexta-feira" → calcular a data exacta YYYY-MM-DD
- Se diz "amanhã" → data de amanha
- Se diz "visita ao imovel X" → preencher_data_visita=true + TAREFA categoria Visita
- Se diz "ligar ao consultor X" → preencher_data_chamada=true + INTERACAO/TAREFA
- Se diz "follow up feito" → registar como ja realizado (INTERACAO passada)
- Se diz "nota ao imovel/consultor" → NOTA_IMOVEL ou NOTA_CONSULTOR
- SEMPRE reformula a descricao para ser clara e concisa

Exemplos:
"na sexta-feira vamos fazer visita ao imovel pelas 18 horas" → TAREFA, Visita, imovel match, data=sexta, hora_inicio=18:00, hora_fim=19:00, preencher_data_visita=true
"ligar ao consultor Teresa amanha as 10" → TAREFA, Follow-up, Teresa Sousa, data=amanha, hora_inicio=10:00, hora_fim=10:30, duracao=0.5
"nota ao prédio rua do clube: proprietário aceita 150k" → NOTA_IMOVEL, Prédio Rua do Clube
"follow up ao Amaro feito hoje por chamada" → INTERACAO, Amaro Bailão, canal=chamada, data=hoje
"mover prédio Bencanta para estudo de VVR" → MOVER_ESTADO, Prédio Bencanta, novo_estado=Estudo de VVR

"adicionar imovel T3 em Celas consultor João preço 180 mil" → CRIAR_IMOVEL
"actualizar preço do prédio Bencanta para 340 mil" → ATUALIZAR_IMOVEL
"adicionar consultor Maria Santos telefone 912345678" → CRIAR_CONSULTOR

Faz match aproximado dos nomes (Teresa → Teresa Sousa, prédio clube → Prédio Rua do Clube).
TODAS as tarefas devem ser sincronizadas com Google Calendar.`,
          messages: [{ role: 'user', content: text }]
        })

        const respText = response.content[0]?.text || '{}'
        let parsed
        try {
          const jsonMatch = respText.match(/\{[\s\S]*\}/)
          parsed = JSON.parse(jsonMatch?.[0] || respText)
        } catch { parsed = { accao: 'TAREFA', descricao: text, mensagem_ui: text } }

        const accao = parsed.accao || 'TAREFA'
        const entNome = parsed.entidade
        let msg = parsed.mensagem_ui || 'Processado'

        // Executar accao
        if (accao === 'NOTA_IMOVEL' && entNome) {
          const im = imoveis.find(i => i.nome.toLowerCase().includes(entNome.toLowerCase()))
          if (im) {
            const { rows: [existing] } = await pgQuery('SELECT notas FROM imoveis WHERE id = $1', [im.id])
            const notas = (existing?.notas || '') + '\n' + `[${hoje}] ${parsed.descricao}`
            await pgQuery('UPDATE imoveis SET notas = $1, updated_at = $2 WHERE id = $3', [notas.trim(), now, im.id])
            msg = `Nota adicionada ao imóvel "${im.nome}"`
          } else { msg = `Imóvel "${entNome}" não encontrado` }

        } else if (accao === 'NOTA_CONSULTOR' && entNome) {
          const cons = consultores.find(c => c.nome.toLowerCase().includes(entNome.toLowerCase()))
          if (cons) {
            const { rows: [existing] } = await pgQuery('SELECT notas FROM consultores WHERE id = $1', [cons.id])
            const notas = (existing?.notas || '') + '\n' + `[${hoje}] ${parsed.descricao}`
            await pgQuery('UPDATE consultores SET notas = $1, updated_at = $2 WHERE id = $3', [notas.trim(), now, cons.id])
            msg = `Nota adicionada ao consultor "${cons.nome}"`
          } else { msg = `Consultor "${entNome}" não encontrado` }

        } else if (accao === 'INTERACAO' && entNome) {
          const cons = consultores.find(c => c.nome.toLowerCase().includes(entNome.toLowerCase()))
          if (cons) {
            await pgQuery(
              'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
              [randomUUID(), cons.id, parsed.data ? `${parsed.data}T${parsed.hora || '09:00'}:00Z` : now, parsed.canal || 'chamada', 'Enviado', parsed.descricao]
            )
            msg = `Interacção registada com "${cons.nome}" (${parsed.canal || 'chamada'})`
          } else { msg = `Consultor "${entNome}" não encontrado` }

        } else if (accao === 'MOVER_ESTADO' && entNome && parsed.novo_estado) {
          const im = imoveis.find(i => i.nome.toLowerCase().includes(entNome.toLowerCase()))
          if (im) {
            await pgQuery('UPDATE imoveis SET estado = $1, updated_at = $2 WHERE id = $3', [parsed.novo_estado, now, im.id])
            msg = `"${im.nome}" movido para "${parsed.novo_estado}"`
          } else { msg = `Imóvel "${entNome}" não encontrado` }

        } else if (accao === 'CLASSIFICAR' && entNome) {
          const cons = consultores.find(c => c.nome.toLowerCase().includes(entNome.toLowerCase()))
          if (cons) {
            const estado = parsed.descricao.toLowerCase().includes('inativo') ? 'Inativo' : parsed.descricao.toLowerCase().includes('ativo') ? 'Ativo' : 'Em avaliação'
            await pgQuery('UPDATE consultores SET estado_avaliacao = $1, updated_at = $2 WHERE id = $3', [estado, now, cons.id])
            msg = `"${cons.nome}" classificado como "${estado}"`
          }

        } else if (accao === 'FOLLOW_UP' && entNome) {
          const cons = consultores.find(c => c.nome.toLowerCase().includes(entNome.toLowerCase()))
          if (cons) {
            const data = parsed.data || hoje
            await pgQuery('UPDATE consultores SET data_follow_up = $1, data_proximo_follow_up = $2, updated_at = $3 WHERE id = $4', [data, data, now, cons.id])
            await pgQuery(
              'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
              [randomUUID(), cons.id, `${data}T${parsed.hora || '09:00'}:00Z`, parsed.canal || 'chamada', 'Enviado', `Follow-up: ${parsed.descricao}`]
            )
            msg = `Follow-up registado com "${cons.nome}" — ${data}`
          }

        } else if (accao === 'CRIAR_IMOVEL') {
          const nome = parsed.descricao || text
          const PORT = process.env.PORT ?? 3001
          try {
            await fetch(`http://localhost:${PORT}/api/crm/imoveis`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nome,
                zona: parsed.zona || null,
                tipologia: parsed.tipologia || null,
                ask_price: parsed.ask_price || 0,
                nome_consultor: parsed.entidade || null,
                origem: 'Consultor',
              })
            })
            msg = `Imóvel criado: "${nome}"`
          } catch { msg = `Erro ao criar imóvel` }

        } else if (accao === 'ATUALIZAR_IMOVEL' && entNome) {
          const im = imoveis.find(i => i.nome.toLowerCase().includes(entNome.toLowerCase()))
          if (im) {
            const updates = {}
            if (parsed.ask_price) updates.ask_price = parsed.ask_price
            if (parsed.valor_proposta) updates.valor_proposta = parsed.valor_proposta
            if (parsed.tipologia) updates.tipologia = parsed.tipologia
            if (parsed.zona) updates.zona = parsed.zona
            if (parsed.descricao) {
              const { rows: [ex] } = await pgQuery('SELECT notas FROM imoveis WHERE id = $1', [im.id])
              updates.notas = ((ex?.notas || '') + '\n' + `[${hoje}] ${parsed.descricao}`).trim()
            }
            if (Object.keys(updates).length > 0) {
              const sets = Object.entries(updates).map(([k], i) => `${k} = $${i + 1}`)
              sets.push(`updated_at = $${Object.keys(updates).length + 1}`)
              const params = [...Object.values(updates), now, im.id]
              await pgQuery(`UPDATE imoveis SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
            }
            msg = `"${im.nome}" actualizado`
          }

        } else if (accao === 'CRIAR_CONSULTOR') {
          const PORT = process.env.PORT ?? 3001
          try {
            await fetch(`http://localhost:${PORT}/api/crm/consultores/find-or-create`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nome: parsed.entidade || parsed.descricao,
                contacto: parsed.contacto || null,
              })
            })
            msg = `Consultor criado/encontrado: "${parsed.entidade || parsed.descricao}"`
          } catch { msg = `Erro ao criar consultor` }

        } else {
          // Default: criar tarefa com hora inicio/fim
          const hInicio = parsed.hora_inicio || '09:00'
          const duracao = parsed.duracao_horas || 1
          const hFim = parsed.hora_fim || (() => {
            const [h, m] = hInicio.split(':').map(Number)
            const totalMin = h * 60 + m + duracao * 60
            return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
          })()
          const dataStr = parsed.data || hoje
          const inicio = `${dataStr}T${hInicio}:00`
          const fim = `${dataStr}T${hFim}:00`

          // Criar tarefa via endpoint interno (sincroniza automaticamente com Google Calendar)
          try {
            const PORT = process.env.PORT ?? 3001
            await fetch(`http://localhost:${PORT}/api/tarefas`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tarefa: parsed.descricao || text,
                categoria: parsed.categoria || 'Outro',
                funcionario: 'Alexandre Mendes',
                inicio, fim,
              })
            })
          } catch (tarefaErr) {
            // Fallback: criar directamente na DB
            await pgQuery(
              `INSERT INTO tarefas (id, tarefa, status, categoria, funcionario, inicio, fim, created_at, updated_at)
               VALUES ($1, $2, 'A fazer', $3, $4, $5, $6, $7, $7)`,
              [randomUUID(), parsed.descricao || text, parsed.categoria || 'Outro', 'Alexandre Mendes', inicio, fim, now]
            )
          }

          // Preencher datas nas fichas dos imoveis
          if (parsed.preencher_data_visita && entNome) {
            const im = imoveis.find(i => i.nome.toLowerCase().includes(entNome.toLowerCase()))
            if (im) {
              await pgQuery('UPDATE imoveis SET data_visita = $1, updated_at = $2 WHERE id = $3', [dataStr, now, im.id])
              msg = `Visita agendada: "${parsed.descricao}" (${hInicio}-${hFim}) — data_visita preenchida + Google Calendar sincronizado`
            } else {
              msg = `Tarefa criada: "${parsed.descricao}" (${hInicio}-${hFim}) + Google Calendar`
            }
          } else if (parsed.preencher_data_chamada && entNome) {
            const im = imoveis.find(i => i.nome.toLowerCase().includes(entNome.toLowerCase()))
            if (im) {
              await pgQuery('UPDATE imoveis SET data_chamada = $1, updated_at = $2 WHERE id = $3', [dataStr, now, im.id])
            }
            msg = `Tarefa criada: "${parsed.descricao}" (${hInicio}-${hFim}) + Google Calendar`
          } else {
            msg = `Tarefa criada: "${parsed.descricao}" (${hInicio}-${hFim}) + Google Calendar`
          }
        }

        res.json({ ok: true, message: msg, accao, parsed })
      } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
    })

    // Endpoint para enviar WhatsApp manualmente (handoff — tu a falar directamente)
    app.post('/api/consultores/:id/enviar-whatsapp', async (req, res) => {
      try {
        const { query: pgQuery } = await import('./src/db/pg.js')
        const { sendWhatsApp } = await import('./src/db/whatsappAgent.js')
        const { randomUUID } = await import('crypto')
        const { mensagem } = req.body
        if (!mensagem?.trim()) return res.status(400).json({ error: 'Mensagem vazia' })

        // Buscar consultor
        const { rows: [consultor] } = await pgQuery('SELECT id, nome, contacto, controlo_manual FROM consultores WHERE id = $1', [req.params.id])
        if (!consultor) return res.status(404).json({ error: 'Consultor não encontrado' })
        if (!consultor.contacto) return res.status(400).json({ error: 'Consultor sem contacto' })

        // Marcar handoff (agente para de responder)
        await pgQuery('UPDATE consultores SET controlo_manual = true, updated_at = $1 WHERE id = $2',
          [new Date().toISOString(), consultor.id])

        // Enviar pelo Twilio
        const result = await sendWhatsApp(consultor.contacto, mensagem.trim())
        if (!result) return res.status(500).json({ error: 'Falha no envio' })

        // Registar no log
        const now = new Date().toISOString()
        await pgQuery(
          'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
          [randomUUID(), consultor.id, now, 'whatsapp', 'Enviado', mensagem.trim()]
        )

        res.json({ ok: true, sid: result.sid })
      } catch (e) { res.status(500).json({ error: e.message }) }
    })

    // Endpoints para execução manual de cron jobs
    app.post('/api/cron/followup', async (_req, res) => {
      try { await runFollowUp(); res.json({ ok: true }) } catch (e) { res.status(500).json({ error: e.message }) }
    })
    app.post('/api/cron/relatorio-diario', async (_req, res) => {
      try { await runRelatorioDiario(); res.json({ ok: true }) } catch (e) { res.status(500).json({ error: e.message }) }
    })
    app.post('/api/cron/relatorio-semanal', async (_req, res) => {
      try { await runRelatorioSemanal(); res.json({ ok: true }) } catch (e) { res.status(500).json({ error: e.message }) }
    })

    // Endpoint para obter template de reactivação
    app.get('/api/template/reactivacao/:nome', (req, res) => {
      res.json({ template: REACTIVATION_TEMPLATE(req.params.nome) })
    })

    // ── Reactivação em massa (20/dia) ─────────────────────────
    app.post('/api/reactivacao/enviar', async (req, res) => {
      try {
        const { query: pgQuery } = await import('./src/db/pg.js')
        const limite = req.body?.limite || 20
        const { sendWhatsApp } = await import('./src/db/whatsappAgent.js')

        // Buscar consultores com contacto que ainda nao foram reactivados
        const { rows: consultores } = await pgQuery(
          "SELECT id, nome, contacto FROM consultores WHERE reactivado = false AND contacto IS NOT NULL AND contacto != '' ORDER BY classificacao ASC, score_prioridade DESC LIMIT $1",
          [limite]
        )

        if (consultores.length === 0) {
          return res.json({ ok: true, enviados: 0, faltam: 0, mensagem: 'Todos os consultores já foram reactivados' })
        }

        const { randomUUID } = await import('crypto')
        const enviados = []
        const erros = []
        const now = new Date().toISOString()

        for (const c of consultores) {
          try {
            const firstName = (c.nome || '').split(' ')[0]
            const msg = REACTIVATION_TEMPLATE(firstName)
            // Usar template aprovado pela Meta (necessario para primeira mensagem)
            const twilio = (await import('twilio')).default
            const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
            const to = c.contacto.startsWith('whatsapp:') ? c.contacto : `whatsapp:${c.contacto.replace(/\s/g, '')}`
            let result
            try {
              // Tentar com template content SID
              result = await twilioClient.messages.create({
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to,
                contentSid: 'HXa6f25c714d7850e23796ea471a3c4fa9',
                contentVariables: JSON.stringify({ '1': firstName }),
              })
            } catch (templateErr) {
              // Se template nao aprovado, tentar texto livre (funciona se ja houve conversa)
              console.warn('[reactivacao] Template falhou, tentando texto livre:', templateErr.message)
              const { sendWhatsApp: sendWA } = await import('./src/db/whatsappAgent.js')
              result = await sendWA(c.contacto, msg)
            }
            if (result) {
              // Marcar como reactivado
              await pgQuery('UPDATE consultores SET reactivado = true, updated_at = $1 WHERE id = $2', [now, c.id])
              // Registar no log de interacoes
              await pgQuery(
                'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
                [randomUUID(), c.id, now, 'whatsapp', 'Enviado', `[REACTIVAÇÃO] ${msg}`]
              )
              enviados.push({ nome: c.nome, contacto: c.contacto })
            } else {
              erros.push({ nome: c.nome, contacto: c.contacto, erro: 'Envio falhou' })
            }
          } catch (e) {
            erros.push({ nome: c.nome, contacto: c.contacto, erro: e.message })
          }
        }

        // Contar quantos faltam
        const { rows: [{ c: faltam }] } = await pgQuery("SELECT COUNT(*) as c FROM consultores WHERE reactivado = false AND contacto IS NOT NULL AND contacto != ''")

        res.json({ ok: true, enviados: enviados.length, erros: erros.length, faltam: parseInt(faltam), detalhes: { enviados, erros } })
      } catch (e) { res.status(500).json({ error: e.message }) }
    })

    app.get('/api/reactivacao/estado', async (req, res) => {
      try {
        const { query: pgQuery } = await import('./src/db/pg.js')
        const { rows: [total] } = await pgQuery("SELECT COUNT(*) as c FROM consultores WHERE contacto IS NOT NULL AND contacto != ''")
        const { rows: [reactivados] } = await pgQuery("SELECT COUNT(*) as c FROM consultores WHERE reactivado = true")
        const { rows: [faltam] } = await pgQuery("SELECT COUNT(*) as c FROM consultores WHERE reactivado = false AND contacto IS NOT NULL AND contacto != ''")
        const { rows: [ultimo] } = await pgQuery("SELECT data_hora FROM consultor_interacoes WHERE notas LIKE '%REACTIVAÇÃO%' ORDER BY data_hora DESC LIMIT 1")
        res.json({
          total: parseInt(total.c),
          reactivados: parseInt(reactivados.c),
          faltam: parseInt(faltam.c),
          ultimo_envio: ultimo?.data_hora || null,
        })
      } catch (e) { res.status(500).json({ error: e.message }) }
    })

    // Endpoint para listar relatórios guardados
    app.get('/api/relatorios', async (req, res) => {
      try {
        const { query: pgQuery } = await import('./src/db/pg.js')
        const { tipo, limit = 20 } = req.query
        let query = 'SELECT id, tipo, data, created_at FROM relatorios'
        const params = []
        if (tipo) { query += ' WHERE tipo = $1'; params.push(tipo) }
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`
        params.push(+limit)
        const { rows } = await pgQuery(query, params)
        res.json(rows)
      } catch (e) { res.status(500).json({ error: e.message }) }
    })
    app.get('/api/relatorios/:id', async (req, res) => {
      try {
        const { query: pgQuery } = await import('./src/db/pg.js')
        const { rows: [r] } = await pgQuery('SELECT * FROM relatorios WHERE id = $1', [req.params.id])
        if (!r) return res.status(404).json({ error: 'Relatório não encontrado' })
        res.json(r)
      } catch (e) { res.status(500).json({ error: e.message }) }
    })

    // Iniciar cron jobs
    startCronJobs()

    if (waConfigured()) {
      console.log('[whatsapp] Agente WhatsApp activo — webhook em /api/webhook/whatsapp')
    } else {
      console.log('[whatsapp] Twilio/Anthropic não configurado — webhook registado mas agente inactivo')
    }
  } catch (e) {
    console.warn('[whatsapp] Módulo WhatsApp não disponível:', e.message)
  }
} catch (e) {
  console.warn('[crm] PostgreSQL não disponível — CRM API desativada:', e.message)
  app.use('/api/crm', (_req, res) => res.status(503).json({ error: 'CRM não disponível' }))
}

const notion = new Client({ auth: process.env.NOTION_API_KEY })

const DB = {
  negócios:        process.env.NOTION_DB_FATURACAO,         // Faturação — negócios / deals
  despesas:        process.env.NOTION_DB_DESPESAS,           // Despesas operacionais
  investidores:    process.env.NOTION_DB_INVESTIDORES,
  pipelineImoveis: process.env.NOTION_DB_PIPELINE_IMOVEIS,
  empreiteiros:    process.env.NOTION_DB_EMPREITEIROS,
  consultores:     process.env.NOTION_DB_CONSULTORES,
  projetos:        process.env.NOTION_DB_PROJETOS,           // Projetos (linked to Pipeline Imóveis)
  pipeline:        process.env.NOTION_DB_PIPELINE,
  clientes:        process.env.NOTION_DB_CLIENTES,
  campanhas:       process.env.NOTION_DB_CAMPANHAS,
  obras:           process.env.NOTION_DB_OBRAS,
}

// ── Helpers ──────────────────────────────────────────────────────
const title      = p => p?.title?.map(r => r.plain_text).join('') ?? ''
const text       = p => p?.rich_text?.map(r => r.plain_text).join('') ?? ''
const sel        = p => p?.select?.name ?? null
const multisel   = p => (p?.multi_select ?? []).map(s => s.name)
const statusProp = p => p?.status?.name ?? null
const num        = p => p?.number ?? 0
const dt         = p => p?.date?.start ?? null
const email      = p => p?.email ?? null
const phone      = p => p?.phone_number ?? null
const formula    = p => p?.formula?.number ?? p?.formula?.string ?? null

function round2(n) { return Math.round(n * 100) / 100 }

const MES_ABREV    = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function getMesAtual() {
  const now = new Date()
  return { mesAbrev: MES_ABREV[now.getMonth()], ano: now.getFullYear(), month: now.getMonth() + 1 }
}

function isMonth(dateStr, year, month) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d.getFullYear() === year && d.getMonth() + 1 === month
}

function isYear(dateStr, year) {
  if (!dateStr) return false
  return new Date(dateStr).getFullYear() === year
}

function mesAbrevToNum(abrev) { return MES_ABREV.indexOf(abrev) + 1 }

async function queryAll(dbId, filter) {
  const results = []
  let cursor
  do {
    const res = await notion.databases.query({ database_id: dbId, filter, start_cursor: cursor, page_size: 100 })
    results.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return results
}

// ── Mappers ───────────────────────────────────────────────────────
function mapNegocio(p) {
  const pr = p.properties
  return {
    id: p.id,
    movimento:        title(pr['Movimento']),
    categoria:        sel(pr['Categoria']),      // Wholesalling | CAEP | Mediação Imobiliária | Fix and Flip
    fase:             sel(pr['Fase']),            // Fase de obras | Fase de venda | Vendido
    lucroEstimado:    num(pr['Lucro estimado']),
    lucroReal:        num(pr['Lucro real']),
    custoRealObra:    num(pr['Custo Real de Obra']),
    dataVenda:        dt(pr['Data de venda']),
    dataEstimada:     dt(pr['Data estimada de venda']),
    dataCompra:       dt(pr['Data Compra']),
    data:             dt(pr['Data']),
    pagamentoEmFalta: pr['Pagamento em falta']?.checkbox ?? false,
    investidor:       pr['Investidor']?.relation?.map(r => r.id) ?? [],
    imovel:           pr['Imóvel']?.relation?.map(r => r.id) ?? [],
    consultorIds:     pr['Consultor']?.relation?.map(r => r.id) ?? [],
    notas:            text(pr['Notas']),
    quotaSomnium:     formula(pr['Quota Somnium €']),
    capitalTotal:     num(pr['Capital Total €']),
    nInvestidores:    num(pr['Nº Investidores']),
  }
}

function mapDespesa(p) {
  const pr = p.properties
  const timing     = sel(pr['Timing Pagamento'])  // Mensalmente | Anual | Único
  const custoMensal = num(pr['Custo Mensal'])
  const custoAnualFormula = formula(pr['Custo Anual']) ?? 0
  const custoAnualReal    = num(pr['Custo Anual (Real)'])
  // Prefer formula result → real → calculated fallback
  const custoAnual = custoAnualFormula || custoAnualReal ||
    (timing === 'Mensalmente' ? custoMensal * 12 : custoMensal)
  return {
    id: p.id,
    movimento:  title(pr['Movimento']),
    categoria:  sel(pr['Categoria']),
    data:       dt(pr['Data']),
    custoMensal,
    custoAnual: round2(custoAnual),
    timing,
    notas:      text(pr['Notas']),
  }
}

function mapPipeline(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:              title(pr['Obra / Oportunidade']),
    cliente:           text(pr['Cliente']),
    fase:              sel(pr['Fase']),
    tipoObra:          sel(pr['Tipo de Obra']),
    valorEstimado:     num(pr['Valor Estimado (€)']),
    valorContratado:   num(pr['Valor Contratado (€)']),
    probabilidade:     num(pr['Probabilidade (%)']),
    dataLead:          dt(pr['Data do Lead']),
    dataFechoPrevista: dt(pr['Data de Fecho Prevista']),
    dataFechoReal:     dt(pr['Data Fecho Real']),
    responsavel:       text(pr['Responsável']),
    origemLead:        sel(pr['Origem do Lead']),
    notas:             text(pr['Notas']),
  }
}

function mapCliente(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:              title(pr['Nome / Empresa']),
    tipo:              sel(pr['Tipo']),
    segmento:          sel(pr['Segmento']),
    email:             email(pr['Email']),
    telefone:          phone(pr['Telefone']),
    nif:               text(pr['NIF']),
    localizacao:       text(pr['Localização']),
    valorFaturado:     num(pr['Valor Total Faturado (€)']),
    ultimaInteracao:   dt(pr['Última Interação']),
    dataAquisicao:     dt(pr['Data Aquisição']),
    nProjetos:         num(pr['Nº Projetos']),
    potencialRecompra: sel(pr['Potencial de Recompra']),
    notas:             text(pr['Notas']),
  }
}

function mapCampanha(p) {
  const pr = p.properties
  return {
    id: p.id,
    campanha:          title(pr['Campanha']),
    canal:             sel(pr['Canal']),
    dataInicio:        dt(pr['Data Início']),
    dataFim:           dt(pr['Data Fim']),
    investimento:      num(pr['Investimento (€)']),
    leadsGerados:      num(pr['Leads Gerados']),
    leadsQualificados: num(pr['Leads Qualificados (SQL)']),
    custoPorLead:      num(pr['Custo por Lead (€)']),
    receitaAtribuida:  num(pr['Receita Atribuída (€)']),
    status:            sel(pr['Status']),
    notas:             text(pr['Notas']),
  }
}

function mapObra(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:               title(pr['Nome da Obra']),
    cliente:            text(pr['Cliente']),
    tipoObra:           sel(pr['Tipo de Obra']),
    localizacao:        text(pr['Localização']),
    status:             sel(pr['Status']),
    dataInicioPrevista: dt(pr['Data Início Prevista']),
    dataInicioReal:     dt(pr['Data Início Real']),
    dataFimPrevista:    dt(pr['Data Fim Prevista']),
    dataFimReal:        dt(pr['Data Fim Real']),
    orcamentoAprovado:  num(pr['Orçamento Aprovado (€)']),
    custoReal:          num(pr['Custo Real (€)']),
    valorFaturado:      num(pr['Valor Faturado (€)']),
    desvioPct:          num(pr['Desvio de Orçamento (%)']),
    area:               num(pr['Área (m²)']),
    responsavel:        text(pr['Encarregado / Responsável']),
    naoConformidades:   num(pr['Não Conformidades']),
    notas:              text(pr['Notas']),
  }
}

function mapImovel(p) {
  const pr = p.properties
  // Zona: prefer new multi_select field, fallback to legacy rich_text
  const zonaMulti = multisel(pr['Zona (Multi)'])
  const zonaLegacy = text(pr['Zona'])
  return {
    id: p.id,
    nome:              title(pr['Nome do Imóvel']),
    estado:            statusProp(pr['Estado']),
    tipologia:         text(pr['Tipologia']) || sel(pr['Tipologia']),
    askPrice:          num(pr['Ask Price']),
    valorProposta:     num(pr['Valor Proposta']),
    custoObra:         num(pr['Custo Estimado de Obra']),
    areaUtil:          num(pr['Área Util']),
    areaBruta:         num(pr['Área Bruta']),
    area:              num(pr['Área Util']) || num(pr['Área Bruta']),
    roi:               num(pr['ROI']),
    roiAnualizado:     num(pr['ROI Anualizado']),
    origem:            sel(pr['Origem']),
    zona:                  zonaMulti.length > 0 ? zonaMulti[0] : zonaLegacy,
    zonas:                 zonaMulti.length > 0 ? zonaMulti : (zonaLegacy ? [zonaLegacy] : []),
    projeto:               pr['Projeto']?.relation?.map(r => r.id) ?? [],
    nomeConsultor:         text(pr['Nome Consultor']),
    modeloNegocio:         sel(pr['Modelo de Negócio']),
    motivoDescarte:        sel(pr['Motivo Descarte']),
    valorVendaRemodelado:  num(pr['Valor de Venda Remodelado']),
    dataFollowUp:          dt(pr['Data Follow Up']),
    dataAdicionado:        dt(pr['Data Adicionado']),
    dataChamada:           dt(pr['Data Chamada']),
    dataVisita:            dt(pr['Data de Visita']),
    dataProposta:          dt(pr['Data da Proposta']),
    dataPropostaAceite:    dt(pr['Data Proposta Aceite']),
    dataEstudoMercado:     dt(pr['Data Estudo Mercado']),
    dataAceiteInvestidor:  dt(pr['Data de aceitação por investidor']),
  }
}

function mapProjeto(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:          title(pr['Nome'] ?? pr['Projeto'] ?? pr['Nome do Projeto']),
    estado:        statusProp(pr['Estado']) ?? sel(pr['Estado']),
    tipo:          sel(pr['Tipo']),
    zona:          text(pr['Zona']) || (multisel(pr['Zona'])[0] ?? ''),
    dataInicio:    dt(pr['Data de Início']) ?? dt(pr['Data Início']),
    dataFim:       dt(pr['Data de Fim']) ?? dt(pr['Data Fim']),
    imovel:        pr['Imóvel']?.relation?.map(r => r.id) ?? [],
    notas:         text(pr['Notas']),
    createdTime:   p.created_time,
  }
}

function mapInvestidor(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:                    title(pr['Nome']),
    status:                  statusProp(pr['Status']),
    classificacao:           multisel(pr['Classificação']),
    pontuacao:               num(pr['Pontuação Classificação']),
    capitalMin:              num(pr['Capital mínimo']),
    capitalMax:              num(pr['Capital máximo']),
    montanteInvestido:       num(pr['Montante Investido (euro)']),
    numeroNegocios:          num(pr['Numero de Negocios']),
    estrategia:              multisel(pr['Estratégia de Investimento']),
    origem:                  sel(pr['Origem']),
    ndaAssinado:             pr['NDA Assinado']?.checkbox ?? false,
    dataReuniao:             dt(pr['Data Reunião']),
    dataPrimeiroContacto:    dt(pr['Data de Primeiro Contacto']),
    dataUltimoContacto:      dt(pr['Data de Último Contacto']),
    dataCapitalTransferido:  dt(pr['Data Capital Transferido']),
    dataProximaAcao:         dt(pr['Data Proxima Acao']),
    diasSemContacto:         formula(pr['Dias sem contacto']) ?? null,
    proximaAcao:             text(pr['Proxima Acao']),
    tipoInvestidor:          multisel(pr['Tipo de Investidor']),
    perfilRisco:              sel(pr['Perfil de Risco']),
    roiInvestidor:            num(pr['ROI Investidor %']),
    roiAnualizadoInvestidor:  num(pr['ROI Anualizado Investidor %']),
    motivoNaoAprovacao:       text(pr['Motivo Não Aprovação']),
    motivoInatividade:        text(pr['Motivo Inatividade']),
    dataApresentacaoNegocio:  dt(pr['Data Apresentação Negócio']),
    dataAprovacaoNegocio:     dt(pr['Data Aprovação Negócio']),
  }
}

function mapEmpreiteiro(p) {
  const pr = p.properties
  return {
    id: p.id,
    nome:              title(pr['Nome']),
    empresa:           text(pr['Empresa']),
    estado:            sel(pr['Estado']),
    zona:              multisel(pr['Zona']),
    especializacao:    multisel(pr['Especialização']),
    score:             num(pr['Score']),
    custoMedioM2:      num(pr['Custo Médio m2']),
    fonte:             sel(pr['Fonte']),
    contratoFormalizado: pr['Contrato Formalizado']?.checkbox ?? false,
  }
}

function mapConsultor(p) {
  const pr = p.properties
  return {
    id:                  p.id,
    nome:                title(pr['Nome']),
    estatuto:            statusProp(pr['Estatuto']),
    tipo:                sel(pr['Tipo']),
    classificacao:       sel(pr['Classificação']),
    imobiliaria:         multisel(pr['Imobiliária']),
    zonas:               multisel(pr['Zona de Atuação']),
    contacto:            text(pr['Contacto']),
    email:               email(pr['Email']),
    equipaRemax:         text(pr['Equipa REMAX']),
    dataInicio:          dt(pr['Data de Início']),
    dataFollowUp:        dt(pr['Data Follow up']),
    dataProximoFollowUp: dt(pr['Data Proximo follow up']),
    motivoFollowUp:      text(pr['Motivo de Follow Up']),
    imoveisEnviados:     num(pr['Imoveis enviado publicados']),
    imoveisOffMarket:    num(pr['Imoveis Off/Market ']),
    metaMensalLeads:     num(pr['Meta Mensal Leads']),
    comissao:            num(pr['Comissão %']),
    dataPrimeiraCall:    dt(pr['Data Primeira Call']),
    lucroGerado:         num(pr['Lucro Gerado €']),
    motivoDescontinuacao: text(pr['Motivo Descontinuação']),
  }
}

// ── Data source: PostgreSQL (Supabase) ────────────────────────────
// Importa queries que lêem da DB local em vez do Notion
import {
  getNegócios, getDespesas, getImóveis, getInvestidores, getConsultores, getTarefas,
  round2 as round2PG,
} from './src/db/queries.js'

// Legacy getters (retornam vazio — DBs inacessíveis)
const getEmpreiteiros = async () => []
const getProjetos     = async () => []
const getPipeline     = async () => []
const getClientes     = async () => []
const getCampanhas    = async () => []
const getObras        = async () => []

// Cache com TTL para endpoints que fazem queries pesadas
import { TTLCache } from './src/db/utils/ttlCache.js'
const cache = new TTLCache(60000) // 60s default TTL
app.post('/api/cache/clear', (_req, res) => { cache.clear(); res.json({ ok: true }) })

// ════════════════════════════════════════════════════════════════
// FINANCEIRO — Wholesaling Imobiliário
// ════════════════════════════════════════════════════════════════
app.get('/api/kpis/financeiro', async (req, res) => {
  try {
    const [negócios, despesas] = await Promise.all([getNegócios(), getDespesas()])

    const lucroEstimadoTotal = round2(negócios.reduce((s,n) => s + n.lucroEstimado, 0))
    const lucroRealTotal     = round2(negócios.reduce((s,n) => s + n.lucroReal, 0))
    const lucroPendente      = round2(lucroEstimadoTotal - lucroRealTotal)
    const pendentes          = negócios.filter(n => n.pagamentoEmFalta)
    const negóciosAtivos     = negócios.filter(n => n.fase !== 'Vendido')

    // Burn rate — mensais + anuais ÷ 12
    const burnRate = round2(
      despesas.filter(d => d.timing === 'Mensalmente').reduce((s,d) => s + d.custoMensal, 0) + despesas.filter(d => d.timing === 'Anual').reduce((s,d) => s + (d.custoAnual || 0) / 12, 0) +
      despesas.filter(d => d.timing === 'Anual').reduce((s,d) => s + (d.custoAnual || 0) / 12, 0)
    )
    const despesasAnuaisTotal = round2(despesas.reduce((s,d) => s + d.custoAnual, 0))
    const runway = burnRate > 0 && lucroPendente > 0 ? round2(lucroPendente / burnRate) : null

    // Por categoria
    const porCategoria = {}
    for (const n of negócios) {
      const k = n.categoria ?? 'Outro'
      if (!porCategoria[k]) porCategoria[k] = { count: 0, lucroEst: 0, lucroReal: 0 }
      porCategoria[k].count++
      porCategoria[k].lucroEst  += n.lucroEstimado
      porCategoria[k].lucroReal += n.lucroReal
    }
    const categorias = Object.entries(porCategoria).map(([cat, v]) => ({
      categoria: cat, count: v.count,
      lucroEst:  round2(v.lucroEst), lucroReal: round2(v.lucroReal),
    }))

    // Por fase
    const FASES = ['Fase de obras', 'Fase de venda', 'Vendido']
    const porFase = FASES.map(f => ({
      fase: f,
      count: negócios.filter(n => n.fase === f).length,
      lucroEst: round2(negócios.filter(n => n.fase === f).reduce((s,n) => s + n.lucroEstimado, 0)),
    }))

    // Alertas
    const hoje = new Date()
    const alertas = []

    // Runway alert
    if (runway !== null && runway < 3) alertas.push({ tipo: 'critico', msg: `Runway crítico: ${runway.toFixed(1)} meses`, icon: '🔴' })
    else if (runway !== null && runway < 6) alertas.push({ tipo: 'aviso', msg: `Runway baixo: ${runway.toFixed(1)} meses`, icon: '🟡' })

    // Tranches atrasadas
    const tranchesAtrasadas = []
    for (const n of negócios) {
      for (const p of (n.pagamentosFaseados || [])) {
        if (!p.recebido && p.data && new Date(p.data) < hoje) {
          tranchesAtrasadas.push({ negocio: n.movimento, descricao: p.descricao, valor: parseFloat(p.valor) || 0, data: p.data, dias: Math.floor((hoje - new Date(p.data)) / 86400000) })
        }
      }
    }
    if (tranchesAtrasadas.length > 0) {
      const totalAtrasado = round2(tranchesAtrasadas.reduce((s, t) => s + t.valor, 0))
      alertas.push({ tipo: 'aviso', msg: `${tranchesAtrasadas.length} tranche(s) atrasada(s): ${totalAtrasado.toLocaleString('pt-PT')} €`, icon: '⏰' })
    }

    // Concentração de risco
    const topDeal = negócios.reduce((max, n) => n.lucroEstimado > max.lucroEstimado ? n : max, { lucroEstimado: 0 })
    const concentracao = lucroEstimadoTotal > 0 ? round2(topDeal.lucroEstimado / lucroEstimadoTotal * 100) : 0
    if (concentracao > 60) alertas.push({ tipo: 'aviso', msg: `${concentracao}% do pipeline concentrado em "${topDeal.movimento}"`, icon: '⚠️' })

    // YTD
    const anoActual = hoje.getFullYear()
    const ytdReal = lucroRealTotal
    const ytdDespesas = round2(burnRate * (hoje.getMonth() + 1))
    const ytdResultado = round2(ytdReal - ytdDespesas)

    // Enrich negociosLista with relation names (defensive)
    let negociosEnriquecidos = negócios
    try {
      const [imoveis, consultores, investidores] = await Promise.all([getImóveis(), getConsultores(), getInvestidores()])
      const imovelMap = Object.fromEntries(imoveis.map(i => [i.id, i.nome]))
      const consultorMap = Object.fromEntries(consultores.map(c => [c.id, c.nome]))
      const investidorMap = Object.fromEntries(investidores.map(i => [i.id, i.nome]))
      negociosEnriquecidos = negócios.map(n => ({
        ...n,
        imovelNome: n.imovel?.[0] ? (imovelMap[n.imovel[0]] || null) : null,
        consultorNome: n.consultorIds?.[0] ? (consultorMap[n.consultorIds[0]] || null) : null,
        investidorNome: n.investidor?.[0] ? (investidorMap[n.investidor[0]] || null) : null,
      }))
    } catch (e) { console.error('[financeiro] Enrich error:', e.message) }

    res.json({
      lucroEstimadoTotal, lucroRealTotal, lucroPendente,
      burnRate, despesasAnuaisTotal, runway,
      negóciosAtivos:    negóciosAtivos.length,
      negociosPendentes: pendentes.length,
      totalNegócios:     negócios.length,
      categorias, porFase,
      negociosLista:     negociosEnriquecidos,
      alertas, tranchesAtrasadas, concentracao,
      ytd: { real: ytdReal, despesas: ytdDespesas, resultado: ytdResultado },
    })
  } catch (err) {
    console.error('[financeiro]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Despesas operacionais ────────────────────────────────────────
app.get('/api/financeiro/despesas', async (req, res) => {
  try {
    const despesas = await getDespesas()

    const recorrentes = despesas.filter(d => d.timing === 'Mensalmente')
    const anuais      = despesas.filter(d => d.timing === 'Anual')
    const unicaVez    = despesas.filter(d => d.timing === 'Único')
    // Burn rate = mensais + anuais ÷ 12
    const burnRate    = round2(
      recorrentes.reduce((s,d) => s + d.custoMensal, 0) +
      anuais.reduce((s,d) => s + (d.custoAnual || 0) / 12, 0)
    )

    const porCategoria = {}
    for (const d of despesas) {
      const k = d.categoria ?? 'Outros'
      if (!porCategoria[k]) porCategoria[k] = { custoMensal: 0, custoAnual: 0, count: 0 }
      porCategoria[k].custoMensal += d.custoMensal
      porCategoria[k].custoAnual  += d.custoAnual
      porCategoria[k].count++
    }
    const categorias = Object.entries(porCategoria)
      .map(([cat, v]) => ({ categoria: cat, custoMensal: round2(v.custoMensal), custoAnual: round2(v.custoAnual), count: v.count }))
      .sort((a,b) => b.custoAnual - a.custoAnual)

    // Total anual = subscrições projectadas + únicos/registados do ano corrente
    const anoActual = new Date().getFullYear()
    const totalAnual = round2(
      recorrentes.reduce((s,d) => s + (d.custoMensal || 0) * 12, 0) +
      anuais.reduce((s,d) => s + (d.custoAnual || 0), 0) +
      [...unicaVez, ...despesas.filter(d => d.timing === 'Registado')]
        .filter(d => d.data && new Date(d.data).getFullYear() === anoActual)
        .reduce((s,d) => s + (d.custoMensal || d.custoAnual || 0), 0)
    )

    res.json({
      burnRate, burnRateAnual: round2(burnRate * 12),
      totalAnual,
      recorrentes, anuais, unicaVez, todas: despesas, categorias,
    })
  } catch (err) {
    console.error('[financeiro/despesas]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Cash Flow & Runway ───────────────────────────────────────────
app.get('/api/financeiro/cashflow', async (req, res) => {
  try {
    const [negócios, despesas] = await Promise.all([getNegócios(), getDespesas()])

    const pendentes  = negócios.filter(n => n.pagamentoEmFalta)
    const recebidos  = negócios.filter(n => !n.pagamentoEmFalta && n.lucroReal > 0)
    const burnRate   = round2(despesas.filter(d => d.timing === 'Mensalmente').reduce((s,d) => s + d.custoMensal, 0) + despesas.filter(d => d.timing === 'Anual').reduce((s,d) => s + (d.custoAnual || 0) / 12, 0))

    const fatExpectavel  = round2(negócios.reduce((s,n) => s + n.lucroEstimado, 0))
    const fatReal        = round2(negócios.reduce((s,n) => s + n.lucroReal, 0))
    const lucroPendente  = round2(fatExpectavel - fatReal)
    const lucroRecebido  = fatReal
    const runway = burnRate > 0 && lucroPendente > 0 ? round2(lucroPendente / burnRate) : null

    const pendentesOrdenados = [...pendentes].sort((a,b) => {
      const da = a.dataEstimada ?? a.dataVenda ?? '9999'
      const db = b.dataEstimada ?? b.dataVenda ?? '9999'
      return da.localeCompare(db)
    })

    res.json({ lucroPendente, lucroRecebido, burnRate, runway, pendentes: pendentesOrdenados, recebidos })
  } catch (err) {
    console.error('[financeiro/cashflow]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── dummy endpoints kept for /api/kpis aggregate compat ─────────
app.get('/api/financeiro/pl',     async (_req, res) => res.json({}))
app.get('/api/financeiro/budget', async (_req, res) => res.json({ linhas: [] }))

// ── Conta Corrente (extrato cronológico) ─────────────────────────
app.get('/api/financeiro/conta-corrente', async (req, res) => {
  try {
    const [negócios, despesasAll] = await Promise.all([getNegócios(), getDespesas()])
    const movimentos = []

    // Entradas: tranches recebidas de projectos
    for (const n of negócios) {
      const pags = n.pagamentosFaseados || []
      for (const p of pags) {
        if (p.recebido && parseFloat(p.valor) > 0) {
          movimentos.push({
            tipo: 'entrada',
            descricao: `${n.movimento} — ${p.descricao || 'Pagamento'}`,
            categoria: n.categoria,
            valor: parseFloat(p.valor),
            data: p.data || n.data || '2026-01-01',
          })
        }
      }
      // Negócios sem tranches mas com lucroReal
      if (pags.length === 0 && n.lucroReal > 0) {
        movimentos.push({
          tipo: 'entrada',
          descricao: n.movimento,
          categoria: n.categoria,
          valor: n.lucroReal,
          data: n.dataVenda || n.data || '2026-01-01',
        })
      }
    }

    // Saídas: despesas com timing Único ou Registado (pagamentos reais)
    for (const d of despesasAll) {
      if (['Único', 'Registado'].includes(d.timing) && d.data) {
        const valor = d.custoMensal || d.custoAnual || 0
        if (valor > 0) {
          movimentos.push({
            tipo: 'saida',
            descricao: d.movimento,
            categoria: d.categoria,
            valor,
            data: d.data,
          })
        }
      }
    }

    // Filtrar a partir de 16/04/2026 (data de início da conta corrente)
    const DATA_INICIO = '2026-04-16'
    const movimentosFiltrados = movimentos.filter(m => m.data >= DATA_INICIO)

    // Ordenar cronologicamente
    movimentosFiltrados.sort((a, b) => a.data.localeCompare(b.data))

    // Calcular saldo corrente
    let saldo = 0
    for (const m of movimentosFiltrados) {
      saldo += m.tipo === 'entrada' ? m.valor : -m.valor
      m.saldo = round2(saldo)
    }

    res.json({ movimentos: movimentosFiltrados, saldo: round2(saldo), dataInicio: DATA_INICIO })
  } catch (err) {
    console.error('[conta-corrente]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Aging de pagamentos faseados ─────────────────────────────────
app.get('/api/financeiro/aging', async (_req, res) => {
  try {
    const negocios = await getNegócios()
    const hoje = new Date()
    const buckets = { overdue: [], b30: [], b60: [], b90: [], b90plus: [] }
    for (const n of negocios) {
      for (const p of (n.pagamentosFaseados || [])) {
        if (p.recebido || !p.data) continue
        const dt = new Date(p.data)
        const dias = Math.floor((dt - hoje) / 86400000)
        const item = { negocio: n.movimento, categoria: n.categoria, descricao: p.descricao, valor: parseFloat(p.valor) || 0, data: p.data, dias }
        if (dias < 0) buckets.overdue.push(item)
        else if (dias <= 30) buckets.b30.push(item)
        else if (dias <= 60) buckets.b60.push(item)
        else if (dias <= 90) buckets.b90.push(item)
        else buckets.b90plus.push(item)
      }
    }
    const summary = [
      { label: 'Atrasado', count: buckets.overdue.length, total: round2(buckets.overdue.reduce((s, p) => s + p.valor, 0)), color: 'red' },
      { label: '< 30 dias', count: buckets.b30.length, total: round2(buckets.b30.reduce((s, p) => s + p.valor, 0)), color: 'yellow' },
      { label: '30-60 dias', count: buckets.b60.length, total: round2(buckets.b60.reduce((s, p) => s + p.valor, 0)), color: 'blue' },
      { label: '60-90 dias', count: buckets.b90.length, total: round2(buckets.b90.reduce((s, p) => s + p.valor, 0)), color: 'indigo' },
      { label: '> 90 dias', count: buckets.b90plus.length, total: round2(buckets.b90plus.reduce((s, p) => s + p.valor, 0)), color: 'gray' },
    ]
    res.json({ summary, buckets })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Rentabilidade ────────────────────────────────────────────────
app.get('/api/financeiro/rentabilidade', async (req, res) => {
  try {
    const [negocios, imoveis, consultores, investidores] = await Promise.all([
      getNegócios(), getImóveis(), getConsultores(), getInvestidores()
    ])

    // Margem por modelo de negócio
    const porModelo = {}
    for (const n of negocios) {
      const k = n.categoria || 'Outro'
      if (!porModelo[k]) porModelo[k] = { count: 0, lucroEst: 0, lucroReal: 0 }
      porModelo[k].count++
      porModelo[k].lucroEst += n.lucroEstimado
      porModelo[k].lucroReal += n.lucroReal
    }
    const modelos = Object.entries(porModelo).map(([modelo, v]) => ({
      modelo, count: v.count,
      lucroEst: round2(v.lucroEst), lucroReal: round2(v.lucroReal),
      mediaEst: v.count > 0 ? round2(v.lucroEst / v.count) : 0,
    })).sort((a, b) => b.lucroEst - a.lucroEst)

    // Rentabilidade por consultor
    const consultorMap = {}
    for (const c of consultores) consultorMap[c.id] = c.nome
    const porConsultor = {}
    for (const n of negocios) {
      for (const cid of (n.consultorIds || [])) {
        const nome = consultorMap[cid] || 'Desconhecido'
        if (!porConsultor[nome]) porConsultor[nome] = { count: 0, lucroEst: 0, lucroReal: 0 }
        porConsultor[nome].count++
        porConsultor[nome].lucroEst += n.lucroEstimado
        porConsultor[nome].lucroReal += n.lucroReal
      }
    }
    const consultoresRent = Object.entries(porConsultor).map(([nome, v]) => ({
      nome, count: v.count,
      lucroEst: round2(v.lucroEst), lucroReal: round2(v.lucroReal),
      mediaEst: v.count > 0 ? round2(v.lucroEst / v.count) : 0,
    })).sort((a, b) => b.lucroEst - a.lucroEst)

    // ROI por investidor
    const investidorMap = {}
    for (const i of investidores) investidorMap[i.id] = i
    const porInvestidor = {}
    for (const n of negocios) {
      for (const iid of (n.investidor || [])) {
        const inv = investidorMap[iid]
        const nome = inv?.nome || 'Desconhecido'
        if (!porInvestidor[nome]) porInvestidor[nome] = { count: 0, lucroEst: 0, lucroReal: 0, capitalInvestido: inv?.montanteInvestido || 0 }
        porInvestidor[nome].count++
        porInvestidor[nome].lucroEst += n.lucroEstimado
        porInvestidor[nome].lucroReal += n.lucroReal
      }
    }
    const investidoresRent = Object.entries(porInvestidor).map(([nome, v]) => ({
      nome, count: v.count,
      lucroEst: round2(v.lucroEst), lucroReal: round2(v.lucroReal),
      capitalInvestido: round2(v.capitalInvestido),
    })).sort((a, b) => b.lucroEst - a.lucroEst)

    // Ciclo médio (dias de data_adicionado → data_proposta_aceite)
    const ciclos = imoveis
      .filter(i => i.dataAdicionado && i.dataPropostaAceite)
      .map(i => Math.floor((new Date(i.dataPropostaAceite) - new Date(i.dataAdicionado)) / 86400000))
      .filter(d => d >= 0 && d < 365)
    const cicloMedio = ciclos.length > 0 ? round2(ciclos.reduce((s, d) => s + d, 0) / ciclos.length) : null

    // Concentração de risco
    const totalPipeline = negocios.reduce((s, n) => s + n.lucroEstimado, 0)
    const topDeal = negocios.reduce((max, n) => n.lucroEstimado > max.lucroEstimado ? n : max, { lucroEstimado: 0 })
    const concentracao = totalPipeline > 0 ? round2(topDeal.lucroEstimado / totalPipeline * 100) : 0

    res.json({
      modelos, consultores: consultoresRent, investidores: investidoresRent,
      cicloMedio, cicloCount: ciclos.length,
      concentracao, topDeal: topDeal.movimento || null, totalPipeline: round2(totalPipeline),
    })
  } catch (err) {
    console.error('[financeiro/rentabilidade]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/financeiro/historico', async (req, res) => {
  try {
    const negócios = await getNegócios()
    // Agrupamos por mês de dataVenda ou data
    const porMes = {}
    for (const n of negócios) {
      const d = n.dataVenda ?? n.data
      if (!d) continue
      const dt2 = new Date(d)
      const key = `${dt2.getFullYear()}-${String(dt2.getMonth()+1).padStart(2,'0')}`
      const label = `${MES_ABREV[dt2.getMonth()]} ${String(dt2.getFullYear()).slice(2)}`
      if (!porMes[key]) porMes[key] = { label, lucroEst: 0, lucroReal: 0, count: 0 }
      porMes[key].lucroEst  += n.lucroEstimado
      porMes[key].lucroReal += n.lucroReal
      porMes[key].count++
    }
    const meses = Object.entries(porMes)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([, v]) => ({ ...v, lucroEst: round2(v.lucroEst), lucroReal: round2(v.lucroReal) }))
    res.json({ meses })
  } catch (err) {
    console.error('[financeiro/historico]', err.message)
    res.status(500).json({ error: err.message })
  }
})


// ════════════════════════════════════════════════════════════════
// COMERCIAL — Wholesaling Imobiliário
// ════════════════════════════════════════════════════════════════

// Estados do pipeline imóveis que estão "activos"
const ESTADOS_NEGATIVOS = ['Descartado', 'Nao interessa', 'Não interessa', 'Cancelado']

// Funil do pipeline imóveis (ordem lógica)
const FUNIL_IMOVEIS = [
  'Em Análise',
  'Visita Marcada',
  'Follow UP',
  'Estudo de VVR',
  'Enviar proposta ao investidor',
  'Wholesaling',
  'Negócio em Curso',
]

// Funil do investidor — suporta nomes antigos e novos do Notion
const FUNIL_INVESTIDORES = [
  'Potencial Investidor', 'Potencial',
  'Marcar call', 'Marcar Call',
  'Call marcada', 'Call Marcada',
  'Follow Up',
  'Investidor em espera', 'Classificado',
  'Investidor em parceria', 'Em Parceria',
]
// Labels bonitos para o funil (colapsa old→new)
const FUNIL_INV_LABEL = {
  'Potencial Investidor':    'Potencial',
  'Marcar call':             'Marcar Call',
  'Call marcada':            'Call Marcada',
  'Investidor em espera': 'Classificado',
  'Investidor em parceria':  'Em Parceria',
}

app.get('/api/kpis/comercial', async (req, res) => {
  try {
    const [imoveisResult, investidores] = await Promise.all([
      getImóveis().catch(() => []),
      getInvestidores(),
    ])
    const imoveis = imoveisResult

    const ativos = imoveis.filter(i => !ESTADOS_NEGATIVOS.some(e => i.estado?.toLowerCase().includes(e.toLowerCase())))
    const negativos = imoveis.filter(i => ESTADOS_NEGATIVOS.some(e => i.estado?.toLowerCase().includes(e.toLowerCase())))

    const valorPotencial = round2(ativos.reduce((s,i) => s + i.askPrice, 0))
    const roiMedio = ativos.filter(i => i.roi > 0).length > 0
      ? round2(ativos.filter(i => i.roi > 0).reduce((s,i) => s + i.roi, 0) / ativos.filter(i => i.roi > 0).length)
      : 0

    // Investidores classificados A ou B
    const investClassificados = investidores.filter(i => i.classificacao.some(c => ['A','B'].includes(c)))
    const investParceria = investidores.filter(i => i.status === 'Investidor em parceria')
    const capitalDisponivel = round2(investClassificados.reduce((s,i) => s + i.capitalMax, 0))

    // Funil imóveis
    const funilImoveis = FUNIL_IMOVEIS.map(estado => ({
      estado,
      count: imoveis.filter(i => i.estado === estado).length,
      valorTotal: round2(imoveis.filter(i => i.estado === estado).reduce((s,i) => s + i.askPrice, 0)),
    })).filter(f => f.count > 0)

    // Funil investidores — colapsa nomes antigos em labels normalizados
    const funilInvestidoresRaw = {}
    for (const status of FUNIL_INVESTIDORES) {
      const label = FUNIL_INV_LABEL[status] ?? status
      const count = investidores.filter(i => i.status === status).length
      if (count > 0) funilInvestidoresRaw[label] = (funilInvestidoresRaw[label] ?? 0) + count
    }
    const funilInvestidores = Object.entries(funilInvestidoresRaw).map(([status, count]) => ({ status, count }))

    // Por origem
    const porOrigem = {}
    for (const i of imoveis) { const k = i.origem ?? 'Outro'; porOrigem[k] = (porOrigem[k] ?? 0) + 1 }
    const origens = Object.entries(porOrigem).map(([name, value]) => ({ name, value })).sort((a,b) => b.value-a.value)

    res.json({
      imóveisAtivos:      ativos.length,
      imóveisDescartados: negativos.length,
      imóveisTotal:       imoveis.length,
      valorPotencial,
      roiMedio,
      investidoresTotal:  investidores.length,
      investClassificados: investClassificados.length,
      investParceria:     investParceria.length,
      capitalDisponivel,
      funilImoveis,
      funilInvestidores,
      origens,
      imoveisAtivosLista: ativos.slice(0, 15),
    })
  } catch (err) {
    console.error('[comercial]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/comercial/imoveis', async (req, res) => {
  try {
    const imoveis = await getImóveis().catch(() => [])
    res.json({ imoveis })
  } catch (err) {
    console.error('[comercial/imoveis]', err.message)
    res.json({ imoveis: [] })
  }
})

app.get('/api/comercial/investidores', async (req, res) => {
  try {
    const investidores = await getInvestidores()

    // Grouped by classification
    const porClass = { A: [], B: [], C: [], D: [], 'Sem class.': [] }
    for (const inv of investidores) {
      const classes = inv.classificacao
      if (classes.includes('A')) porClass.A.push(inv)
      else if (classes.includes('B')) porClass.B.push(inv)
      else if (classes.includes('C')) porClass.C.push(inv)
      else if (classes.includes('D')) porClass.D.push(inv)
      else porClass['Sem class.'].push(inv)
    }

    res.json({ investidores, porClass })
  } catch (err) {
    console.error('[comercial/investidores]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/comercial/empreiteiros', async (req, res) => {
  try {
    const empreiteiros = await getEmpreiteiros()
    res.json({ empreiteiros })
  } catch (err) {
    console.error('[comercial/empreiteiros]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Cache de nomes de consultores por page ID (resolve relações da Faturação)
const consultorNameCache = new Map()
async function resolveConsultorName(pageId) {
  if (consultorNameCache.has(pageId)) return consultorNameCache.get(pageId)
  try {
    const p = await notion.pages.retrieve({ page_id: pageId })
    const nome = Object.values(p.properties).find(v => v.type === 'title')?.title?.map(t => t.plain_text).join('') ?? null
    consultorNameCache.set(pageId, nome)
    return nome
  } catch { return null }
}

app.get('/api/comercial/consultores', async (_req, res) => {
  try {
    const [imoveis, consultoresNotion, negocios] = await Promise.all([getImóveis(), getConsultores(), getNegócios()])
    const now = new Date()
    const year = now.getFullYear(), month = now.getMonth() + 1
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear  = month === 1 ? year - 1 : year

    const ESTADOS_NEG = new Set(['Descartado','Nao interessa','Não interessa','Cancelado'])
    const ESTADOS_AV  = new Set(['Visita Marcada','Follow UP','Estudo de VVR','Enviar proposta ao investidor',
      'Wholesaling','Negócio em Curso','CAEP','Fix and Flip','Em negociação','Contrato fechado'])

    // Pipeline metrics grouped by consultant name
    const byNome = {}
    for (const im of imoveis) {
      const nome = im.nomeConsultor?.trim() || null
      if (!nome) continue
      if (!byNome[nome]) byNome[nome] = []
      byNome[nome].push(im)
    }

    function calcMetrics(nome, leads) {
      const total       = leads.length
      const descartados = leads.filter(i => ESTADOS_NEG.has(i.estado)).length
      const ativos      = total - descartados
      const avancados   = leads.filter(i => ESTADOS_AV.has(i.estado)).length
      const taxaDescarte  = total > 0 ? round2(descartados / total * 100) : 0
      const taxaConversao = total > 0 ? round2(avancados   / total * 100) : 0

      const valorPipeline = leads
        .filter(i => !ESTADOS_NEG.has(i.estado))
        .reduce((s, i) => s + (i.valorProposta || i.askPrice || 0), 0)

      const rois = leads.filter(i => i.roi > 0).map(i => i.roi)
      const roiMedio = rois.length ? round2(rois.reduce((a, b) => a + b, 0) / rois.length) : null

      const temposResposta = leads.map(i => daysBetween(i.dataAdicionado, i.dataChamada)).filter(v => v != null && v >= 0 && v < 365)
      const tempoRespostaMedio = temposResposta.length ? round2(temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length) : null

      const temposNeg = leads.map(i => daysBetween(i.dataChamada, i.dataProposta)).filter(v => v != null && v >= 0 && v < 365)
      const tempoNegociacaoMedio = temposNeg.length ? round2(temposNeg.reduce((a, b) => a + b, 0) / temposNeg.length) : null

      const leadsEsteMes     = leads.filter(i => isMonth(i.dataAdicionado, year, month)).length
      const leadsMesAnterior = leads.filter(i => isMonth(i.dataAdicionado, prevYear, prevMonth)).length

      const datas = leads.map(i => i.dataAdicionado).filter(Boolean).sort().reverse()
      const ultimoLead  = datas[0] ?? null
      const diasSemLead = ultimoLead ? Math.floor((now - new Date(ultimoLead)) / 86400000) : null

      const funil = [
        { fase: 'Lead adicionado',  count: total },
        { fase: '1ª Chamada',       count: leads.filter(i => i.dataChamada).length },
        { fase: 'Visita',           count: leads.filter(i => i.dataVisita).length },
        { fase: 'Proposta enviada', count: leads.filter(i => i.dataProposta).length },
        { fase: 'Proposta aceite',  count: leads.filter(i => i.dataPropostaAceite).length },
      ]

      return { nome, total, ativos, descartados, avancados, taxaDescarte, taxaConversao,
        valorPipeline: round2(valorPipeline), roiMedio, tempoRespostaMedio, tempoNegociacaoMedio,
        leadsEsteMes, leadsMesAnterior, ultimoLead, diasSemLead, funil }
    }

    // KPIs de faturação por consultor — indexado por page ID (relação directa)
    const fatById = {}
    for (const neg of negocios) {
      for (const cid of neg.consultorIds) {
        if (!fatById[cid]) fatById[cid] = []
        fatById[cid].push(neg)
      }
    }

    function calcFatMetrics(consultorId) {
      const negs = fatById[consultorId] ?? []
      const vendidos = negs.filter(n => n.fase === 'Vendido' || n.dataVenda)
      const emCurso  = negs.filter(n => n.fase !== 'Vendido' && !n.dataVenda)
      const lucroRealizado  = round2(vendidos.reduce((s, n) => s + (n.lucroReal || 0), 0))
      const lucroPotencial  = round2(emCurso.reduce((s, n) => s + (n.lucroEstimado || 0), 0))
      const lucroTotal      = round2(negs.reduce((s, n) => s + (n.lucroReal || n.lucroEstimado || 0), 0))
      const dealsEsteMes    = negs.filter(n => isMonth(n.dataVenda ?? n.data, year, month)).length
      const taxaConversaoFat = negs.length > 0 ? round2(vendidos.length / negs.length * 100) : null
      return { dealsTotal: negs.length, dealsVendidos: vendidos.length, dealsEmCurso: emCurso.length,
        dealsEsteMes, lucroRealizado, lucroPotencial, lucroTotal, taxaConversaoFat }
    }

    // Merge: Notion consultores + pipeline metrics + faturação KPIs (por ID)
    const consultores = consultoresNotion.map(c => {
      const leads = byNome[c.nome] ?? []
      const metrics = calcMetrics(c.nome, leads)
      const fat = calcFatMetrics(c.id)
      const cumpreMeta = c.metaMensalLeads > 0
        ? round2(metrics.leadsEsteMes / c.metaMensalLeads * 100) : null
      return { ...c, ...metrics, ...fat, cumpreMeta }
    })

    // Consultores no pipeline que não estão na lista Notion
    for (const [nome, leads] of Object.entries(byNome)) {
      if (!consultoresNotion.find(c => c.nome === nome)) {
        consultores.push({ ...calcMetrics(nome, leads),
          dealsTotal: 0, dealsVendidos: 0, dealsEsteMes: 0, lucroTotal: 0, taxaConversaoFat: null,
          status: null, tipo: null, classificacao: null, zonas: [],
          metaMensalLeads: 0, comissao: 0, cumpreMeta: null })
      }
    }

    consultores.sort((a, b) => b.total - a.total)
    res.json({ consultores, total: consultores.length })
  } catch (err) {
    console.error('[comercial/consultores]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/comercial/projetos', async (req, res) => {
  try {
    const projetos = await getProjetos().catch(() => [])
    res.json({ projetos })
  } catch (err) {
    console.error('[comercial/projetos]', err.message)
    res.json({ projetos: [] })
  }
})

app.get('/api/comercial/historico', async (req, res) => {
  try {
    const imoveis = await getImóveis().catch(() => [])
    const now = new Date()

    // Imóveis adicionados por mês (últimos 12)
    const meses = []
    for (let i = 11; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ano   = d.getFullYear()
      const month = d.getMonth() + 1
      const label = `${MES_ABREV[d.getMonth()]} ${String(ano).slice(2)}`
      const adicionados = imoveis.filter(im => isMonth(im.dataAdicionado, ano, month))
      const descartados = adicionados.filter(im => ESTADOS_NEGATIVOS.some(e => im.estado?.toLowerCase().includes(e.toLowerCase())))
      meses.push({
        label,
        adicionados: adicionados.length,
        descartados: descartados.length,
        ativos: adicionados.length - descartados.length,
      })
    }

    // Por tipologia
    const porTipologia = {}
    for (const im of imoveis) {
      const k = im.tipologia ?? 'Outro'
      if (!porTipologia[k]) porTipologia[k] = { count: 0, valor: 0 }
      porTipologia[k].count++
      porTipologia[k].valor += im.askPrice
    }
    const tipologias = Object.entries(porTipologia)
      .map(([name, v]) => ({ name, count: v.count, valor: round2(v.valor) }))
      .sort((a,b) => b.count - a.count)

    res.json({ meses, tipologias })
  } catch (err) {
    console.error('[comercial/historico]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// COMERCIAL — Métricas Temporais (KPI Framework completo)
// ════════════════════════════════════════════════════════════════
app.get('/api/comercial/metricas-temporais', async (req, res) => {
  try {
    const [imoveis, investidores, consultoresRaw, negocios] = await Promise.all([
      getImóveis().catch(() => []),
      getInvestidores(),
      getConsultores().catch(() => []),
      getNegócios(),
    ])

    const now   = new Date()
    const year  = now.getFullYear()
    const month = now.getMonth() + 1

    // ── Períodos ─────────────────────────────────────────────
    const wDay = now.getDay()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - (wDay === 0 ? 6 : wDay - 1)); weekStart.setHours(0,0,0,0)
    const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23,59,59,999)

    const monthStart   = new Date(year, month - 1, 1)
    const monthEnd     = new Date(year, month, 0, 23, 59, 59, 999)

    const q            = Math.ceil(month / 3)
    const quarterStart = new Date(year, (q - 1) * 3, 1)
    const quarterEnd   = new Date(year, q * 3, 0, 23, 59, 59, 999)

    const semStart = month <= 6 ? new Date(year, 0, 1)  : new Date(year, 6, 1)
    const semEnd   = month <= 6 ? new Date(year, 5, 30, 23,59,59,999) : new Date(year, 11, 31, 23,59,59,999)

    const yearStart = new Date(year, 0, 1)
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59, 999)

    function inP(dateStr, start, end) {
      if (!dateStr) return false
      const d = new Date(dateStr)
      return d >= start && d <= end
    }

    function avgDays(arr) {
      const valid = arr.filter(v => v != null && v >= 0 && v < 365)
      return valid.length ? round2(valid.reduce((a,b) => a+b,0) / valid.length) : null
    }

    // ── Volume de atividades por período ─────────────────────
    function volImoveis(s, e) {
      return {
        adicionados: imoveis.filter(i => inP(i.dataAdicionado, s, e)).length,
        chamadas:    imoveis.filter(i => inP(i.dataChamada, s, e)).length,
        visitas:     imoveis.filter(i => inP(i.dataVisita, s, e)).length,
        estudos:     imoveis.filter(i => inP(i.dataEstudoMercado, s, e)).length,
        propostas:   imoveis.filter(i => inP(i.dataProposta, s, e)).length,
        propostasAceites: imoveis.filter(i => inP(i.dataPropostaAceite, s, e)).length,
        negocios:    negocios.filter(n => inP(n.dataVenda, s, e) || inP(n.dataCompra, s, e)).length,
      }
    }
    const emFollowUp = imoveis.filter(i => i.estado === 'Follow UP').length

    // ── Funil de conversão por coorte (data adicionado) ──────
    function funilCoorte(s, e) {
      const coorte = imoveis.filter(i => inP(i.dataAdicionado, s, e))
      const n = coorte.length
      return {
        adicionados:      n,
        comChamada:       coorte.filter(i => i.dataChamada).length,
        comVisita:        coorte.filter(i => i.dataVisita).length,
        comEstudo:        coorte.filter(i => i.dataEstudoMercado).length,
        comProposta:      coorte.filter(i => i.dataProposta).length,
        comPropostaAceite:coorte.filter(i => i.dataPropostaAceite).length,
        taxaChamada:      n > 0 ? round2(coorte.filter(i => i.dataChamada).length / n * 100) : null,
        taxaVisita:       n > 0 ? round2(coorte.filter(i => i.dataVisita).length / n * 100) : null,
        taxaProposta:     n > 0 ? round2(coorte.filter(i => i.dataProposta).length / n * 100) : null,
      }
    }

    // ── Ciclos médios Imóveis (todos os históricos) ───────────
    const ESTADOS_NEG_SET = new Set(['Descartado','Nao interessa','Não interessa','Cancelado'])
    const cicloImoveis = {
      leadAChamada:    avgDays(imoveis.map(i => daysBetween(i.dataAdicionado, i.dataChamada))),
      chamadaAVisita:  avgDays(imoveis.map(i => daysBetween(i.dataChamada, i.dataVisita))),
      visitaAEstudo:   avgDays(imoveis.map(i => daysBetween(i.dataVisita, i.dataEstudoMercado))),
      estudoAProposta: avgDays(imoveis.map(i => daysBetween(i.dataEstudoMercado, i.dataProposta))),
      propostaAFecho:  avgDays(imoveis.map(i => daysBetween(i.dataProposta, i.dataPropostaAceite))),
    }

    // ── Motivos de descarte ────────────────────────────────────
    const motivosDescarte = {}
    const descartados = imoveis.filter(i => ESTADOS_NEG_SET.has(i.estado))
    for (const i of descartados) {
      const m = i.motivoDescarte ?? 'Não registado'
      motivosDescarte[m] = (motivosDescarte[m] ?? 0) + 1
    }
    const motivosDescarteList = Object.entries(motivosDescarte)
      .map(([motivo, count]) => ({ motivo, count }))
      .sort((a,b) => b.count - a.count)

    // Descarte por origem
    const descarteOrigem = {}
    for (const i of imoveis) {
      const o = i.origem ?? 'Outro'
      if (!descarteOrigem[o]) descarteOrigem[o] = { total: 0, descartados: 0 }
      descarteOrigem[o].total++
      if (ESTADOS_NEG_SET.has(i.estado)) descarteOrigem[o].descartados++
    }
    const descarteOrigemList = Object.entries(descarteOrigem)
      .map(([origem, v]) => ({ origem, total: v.total, descartados: v.descartados, taxaDescarte: round2(v.descartados / v.total * 100) }))
      .sort((a,b) => b.total - a.total)

    // ── Investidores ──────────────────────────────────────────
    const INV_PARCERIA = new Set(['Investidor em parceria','Em Parceria','Investidor Ativo'])
    const emParceria   = investidores.filter(i => INV_PARCERIA.has(i.status))

    const invSemContacto60 = investidores
      .filter(i => i.diasSemContacto != null && i.diasSemContacto > 60)
      .map(i => ({ nome: i.nome, dias: i.diasSemContacto, status: i.status }))

    // LTV por investidor (montante investido + lucro real dos negócios com este investidor)
    const ltvInvestidores = investidores.map(i => {
      const negsInv  = negocios.filter(n => n.investidor.includes(i.id))
      const lucroRealizado = round2(negsInv.filter(n => n.fase === 'Vendido').reduce((s,n) => s + n.lucroReal, 0))
      const quotaSomnium   = round2(negsInv.filter(n => n.fase === 'Vendido').reduce((s,n) => s + (n.quotaSomnium || n.lucroReal * 0.267), 0))
      return { nome: i.nome, status: i.status, montante: i.montanteInvestido, lucroRealizado, quotaSomnium, numeroNegocios: i.numeroNegocios }
    }).filter(i => i.montante > 0 || i.lucroRealizado > 0).sort((a,b) => b.lucroRealizado - a.lucroRealizado || b.montante - a.montante)

    const capitalMobilizado = round2(investidores.reduce((s,i) => s + i.montanteInvestido, 0))
    const reinvestiram      = emParceria.filter(i => i.numeroNegocios > 1).length

    const cicloInvestidor = {
      contactoAReuniao:     avgDays(investidores.map(i => daysBetween(i.dataPrimeiroContacto, i.dataReuniao))),
      reuniaoACapital:      avgDays(investidores.map(i => daysBetween(i.dataReuniao, i.dataCapitalTransferido))),
      totalContactoACapital:avgDays(investidores.map(i => daysBetween(i.dataPrimeiroContacto, i.dataCapitalTransferido))),
    }

    // ── Consultores ────────────────────────────────────────────
    const CONS_ATIVOS_STATUS = new Set(['Aberto Parcerias','Em Parceria','Follow up','Follow Up'])
    const consAtivos = consultoresRaw.filter(c => CONS_ATIVOS_STATUS.has(c.estatuto))
    const consInativos = consultoresRaw.filter(c => c.estatuto === 'Inativo').length
    const consFollowUpAtrasado = consultoresRaw.filter(c =>
      c.dataProximoFollowUp && new Date(c.dataProximoFollowUp) < now && CONS_ATIVOS_STATUS.has(c.estatuto)
    ).length
    const consSemContacto30 = consultoresRaw.filter(c => {
      if (!CONS_ATIVOS_STATUS.has(c.estatuto)) return false
      if (!c.dataFollowUp && !c.dataProximoFollowUp) return true
      const ultima = c.dataProximoFollowUp ?? c.dataFollowUp
      const dias = (now - new Date(ultima)) / 86400000
      return dias > 30
    }).length

    const ltvConsultores = consultoresRaw
      .filter(c => c.lucroTotal > 0)
      .map(c => ({ nome: c.nome, ltv: c.lucroTotal, negocios: c.dealsTotal, lucroRealizado: c.lucroRealizado }))
      .sort((a,b) => b.ltv - a.ltv)
      .slice(0, 10)

    const cicloConsultor = {
      inicioA1Call: avgDays(consultoresRaw.filter(c => c.dataInicio && c.dataPrimeiraCall).map(c => daysBetween(c.dataInicio, c.dataPrimeiraCall))),
      call1ANegocio: avgDays(consultoresRaw.filter(c => c.dataPrimeiraCall).map(c => {
        const primeiroLead = imoveis.filter(i => i.nomeConsultor?.trim() === c.nome && i.dataAdicionado).map(i => i.dataAdicionado).sort()[0]
        return daysBetween(c.dataPrimeiraCall, primeiroLead)
      })),
    }

    // ── Receita por modelo ─────────────────────────────────────
    function receitaModelo(s, e) {
      const neg = negocios.filter(n => inP(n.dataVenda, s, e) && n.fase === 'Vendido')
      const wh  = neg.filter(n => n.categoria === 'Wholesalling')
      const caep= neg.filter(n => n.categoria === 'CAEP')
      return {
        totalNeg:     neg.length,
        lucroWhTotal: round2(wh.reduce((s,n) => s + n.lucroReal, 0)),
        lucroWhMedio: wh.length > 0 ? round2(wh.reduce((s,n) => s + n.lucroReal, 0) / wh.length) : null,
        lucroCAEPTotal: round2(caep.reduce((s,n) => s + n.lucroReal, 0)),
        quotaSomniumCAEP: round2(caep.reduce((s,n) => s + (n.quotaSomnium || n.lucroReal * 0.267), 0)),
        negWH:  wh.length,
        negCAEP: caep.length,
      }
    }

    res.json({
      updatedAt: new Date().toISOString(),
      periodos: {
        semana: { de: weekStart.toISOString().slice(0,10), ate: weekEnd.toISOString().slice(0,10) },
        mes:    { de: monthStart.toISOString().slice(0,10), ate: monthEnd.toISOString().slice(0,10) },
        trimestre: `Q${q} ${year}`,
        semestre: month <= 6 ? `S1 ${year}` : `S2 ${year}`,
        ano: year,
      },
      imoveis: {
        volume: {
          semanal:    { ...volImoveis(weekStart, weekEnd),   emFollowUp },
          mensal:     { ...volImoveis(monthStart, monthEnd), emFollowUp },
          trimestral: { ...volImoveis(quarterStart, quarterEnd), emFollowUp },
          semestral:  { ...volImoveis(semStart, semEnd),     emFollowUp },
          anual:      { ...volImoveis(yearStart, yearEnd),   emFollowUp },
        },
        funil: {
          mensal:     funilCoorte(monthStart, monthEnd),
          trimestral: funilCoorte(quarterStart, quarterEnd),
          semestral:  funilCoorte(semStart, semEnd),
          anual:      funilCoorte(yearStart, yearEnd),
          total:      funilCoorte(new Date('2020-01-01'), yearEnd),
        },
        ciclo: cicloImoveis,
        motivosDescarte: motivosDescarteList,
        descarteOrigem:  descarteOrigemList,
      },
      investidores: {
        alertas:         { semContacto60d: invSemContacto60 },
        ltv:             ltvInvestidores,
        capitalMobilizado,
        emParceria:      emParceria.length,
        reinvestiram,
        ciclo:           cicloInvestidor,
      },
      consultores: {
        alertas: { followUpAtrasado: consFollowUpAtrasado, inativos: consInativos, semContacto30d: consSemContacto30 },
        ltv:     ltvConsultores,
        ciclo:   cicloConsultor,
        totalAtivos: consAtivos.length,
      },
      receita: {
        mensal:     receitaModelo(monthStart, monthEnd),
        trimestral: receitaModelo(quarterStart, quarterEnd),
        semestral:  receitaModelo(semStart, semEnd),
        anual:      receitaModelo(yearStart, yearEnd),
      },
    })
  } catch (err) {
    console.error('[metricas-temporais]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// MARKETING
// ════════════════════════════════════════════════════════════════
app.get('/api/kpis/marketing', async (req, res) => {
  try {
    const { ano, month } = getMesAtual()
    const campanhas = await getCampanhas()

    const doMes  = campanhas.filter(c => isMonth(c.dataInicio, ano, month))
    const ativas = campanhas.filter(c => c.status === 'Ativa')

    const investimentoTotal = doMes.reduce((s,c) => s + c.investimento, 0)
    const leadsGerados      = doMes.reduce((s,c) => s + c.leadsGerados, 0)
    const sql               = doMes.reduce((s,c) => s + c.leadsQualificados, 0)
    const receitaAtribuida  = doMes.reduce((s,c) => s + c.receitaAtribuida, 0)
    const cpl               = leadsGerados > 0 ? round2(investimentoTotal / leadsGerados) : 0
    const taxaQualificacao  = leadsGerados > 0 ? round2(sql / leadsGerados * 100) : 0
    const roi               = investimentoTotal > 0 ? round2((receitaAtribuida - investimentoTotal) / investimentoTotal * 100) : 0

    res.json({ leadsGerados, cpl, sql, taxaQualificacao, receitaAtribuida: round2(receitaAtribuida), roi, campanhasAtivas: ativas.slice(0,10) })
  } catch (err) {
    console.error('[marketing]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/marketing/historico', async (req, res) => {
  try {
    const campanhas = await getCampanhas()
    const now = new Date()

    // Leads por mês (últimos 12)
    const meses = []
    for (let i = 11; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ano   = d.getFullYear()
      const month = d.getMonth() + 1
      const label = `${MES_ABREV[d.getMonth()]} ${String(ano).slice(2)}`
      const camp  = campanhas.filter(c => isMonth(c.dataInicio, ano, month))
      const invest = camp.reduce((s,c) => s + c.investimento, 0)
      const leads  = camp.reduce((s,c) => s + c.leadsGerados, 0)
      meses.push({
        label,
        leads,
        sql:         camp.reduce((s,c) => s + c.leadsQualificados, 0),
        investimento:round2(invest),
        receita:     round2(camp.reduce((s,c) => s + c.receitaAtribuida, 0)),
        cpl:         leads > 0 ? round2(invest / leads) : 0,
      })
    }

    // Performance por canal
    const porCanal = {}
    for (const c of campanhas) {
      const k = c.canal ?? 'Outro'
      if (!porCanal[k]) porCanal[k] = { investimento: 0, leads: 0, sql: 0, receita: 0 }
      porCanal[k].investimento += c.investimento
      porCanal[k].leads        += c.leadsGerados
      porCanal[k].sql          += c.leadsQualificados
      porCanal[k].receita      += c.receitaAtribuida
    }
    const canais = Object.entries(porCanal).map(([canal, v]) => ({
      canal,
      investimento: round2(v.investimento),
      leads:        v.leads,
      sql:          v.sql,
      receita:      round2(v.receita),
      roi:          v.investimento > 0 ? round2((v.receita - v.investimento) / v.investimento * 100) : 0,
      cpl:          v.leads > 0 ? round2(v.investimento / v.leads) : 0,
    })).sort((a,b) => b.leads - a.leads)

    res.json({ meses, canais })
  } catch (err) {
    console.error('[marketing/historico]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// OPERAÇÕES
// ════════════════════════════════════════════════════════════════
app.get('/api/kpis/operacoes', async (req, res) => {
  try {
    const { ano, month } = getMesAtual()
    const obras = await getObras()

    const obrasAtivas     = obras.filter(o => o.status === 'Em curso')
    const obrasConcluidas = obras.filter(o => o.status === 'Concluída' && isMonth(o.dataFimReal, ano, month))
    const noPrazo         = obrasConcluidas.filter(o => o.dataFimReal && o.dataFimPrevista && o.dataFimReal <= o.dataFimPrevista).length
    const percentNoPrazo  = obrasConcluidas.length > 0 ? round2(noPrazo / obrasConcluidas.length * 100) : 0
    const desvioVals      = obras.filter(o => o.status === 'Concluída' && o.desvioPct !== 0).map(o => o.desvioPct)
    const desvioMedio     = desvioVals.length > 0 ? round2(desvioVals.reduce((s,v) => s+v, 0) / desvioVals.length) : 0

    // Valor total em carteira
    const valorCarteira   = obrasAtivas.reduce((s,o) => s + o.orcamentoAprovado, 0)
    // Nº não conformidades abertas
    const naoConformidades = obrasAtivas.reduce((s,o) => s + o.naoConformidades, 0)
    // Taxa de faturação de obras (valor faturado / orçamento)
    const totalOrcado     = obrasAtivas.reduce((s,o) => s + o.orcamentoAprovado, 0)
    const totalFaturado   = obrasAtivas.reduce((s,o) => s + o.valorFaturado, 0)
    const taxaFaturacao   = totalOrcado > 0 ? round2(totalFaturado / totalOrcado * 100) : 0

    res.json({
      obrasAtivas:      obrasAtivas.length,
      obrasConcluidas:  obrasConcluidas.length,
      percentNoPrazo,
      desvioMedio,
      valorCarteira:    round2(valorCarteira),
      naoConformidades,
      taxaFaturacao,
      obrasAtivasLista: obrasAtivas.slice(0, 10),
    })
  } catch (err) {
    console.error('[operacoes]', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/operacoes/historico', async (req, res) => {
  try {
    const obras = await getObras()
    const now   = new Date()

    // Obras concluídas por mês (últimos 12)
    const meses = []
    for (let i = 11; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ano   = d.getFullYear()
      const month = d.getMonth() + 1
      const label = `${MES_ABREV[d.getMonth()]} ${String(ano).slice(2)}`
      const conc  = obras.filter(o => o.status === 'Concluída' && isMonth(o.dataFimReal, ano, month))
      const inic  = obras.filter(o => isMonth(o.dataInicioPrevista, ano, month))
      meses.push({
        label,
        concluidas:    conc.length,
        iniciadas:     inic.length,
        valorConcluido:round2(conc.reduce((s,o) => s + o.orcamentoAprovado, 0)),
        desvioMedio:   conc.length > 0 ? round2(conc.reduce((s,o) => s + o.desvioPct, 0) / conc.length) : 0,
      })
    }

    // Por tipo de obra
    const porTipo = {}
    for (const o of obras) {
      const k = o.tipoObra ?? 'Outro'
      if (!porTipo[k]) porTipo[k] = { count: 0, valor: 0 }
      porTipo[k].count++
      porTipo[k].valor += o.orcamentoAprovado
    }
    const tipos = Object.entries(porTipo).map(([name, v]) => ({ name, count: v.count, valor: round2(v.valor) })).sort((a,b) => b.count-a.count)

    // Status actual
    const STATUS_LIST = ['Planeada','Em curso','Pausada','Concluída','Cancelada']
    const porStatus = STATUS_LIST.map(s => ({ status: s, count: obras.filter(o => o.status === s).length })).filter(s => s.count > 0)

    res.json({ meses, tipos, porStatus })
  } catch (err) {
    console.error('[operacoes/historico]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// DASHBOARD CENTRAL
// ════════════════════════════════════════════════════════════════
app.get('/api/kpis', async (req, res) => {
  try {
    const base = 'http://localhost:3001'
    const safe = url => fetch(url).then(r => r.json()).catch(() => ({}))
    const [financeiro, comercial, marketing, operacoes, cashflow, analises] = await Promise.all([
      safe(`${base}/api/kpis/financeiro`),
      safe(`${base}/api/kpis/comercial`),
      safe(`${base}/api/kpis/marketing`),
      safe(`${base}/api/kpis/operacoes`),
      safe(`${base}/api/financeiro/cashflow`),
      safe(`${base}/api/crm/analises-kpis`),
    ])
    res.json({ financeiro: { ...financeiro, cashflow, analises }, comercial, marketing, operacoes, updatedAt: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// WEEKLY PULSE — Saúde semanal do negócio
// ════════════════════════════════════════════════════════════════
app.get('/api/weekly-pulse', async (req, res) => {
  try {
    const [imoveis, investidores, consultoresRaw, negocios, despesas] = await Promise.all([
      getImóveis().catch(() => []),
      getInvestidores(),
      getConsultores().catch(() => []),
      getNegócios(),
      getDespesas(),
    ])
    const now = new Date()
    const wDay = now.getDay()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - (wDay === 0 ? 6 : wDay - 1)); weekStart.setHours(0,0,0,0)

    function inWeek(dateStr) {
      if (!dateStr) return false
      return new Date(dateStr) >= weekStart && new Date(dateStr) <= now
    }

    // Atividades da semana
    const imoveisAdicionados = imoveis.filter(i => inWeek(i.dataAdicionado)).length
    const chamadasFeitas = imoveis.filter(i => inWeek(i.dataChamada)).length
    const visitasFeitas = imoveis.filter(i => inWeek(i.dataVisita)).length
    const propostasEnviadas = imoveis.filter(i => inWeek(i.dataProposta)).length
    const dealsFechados = negocios.filter(n => inWeek(n.dataVenda) || inWeek(n.dataCompra)).length

    // Alertas críticos
    const ESTADOS_NEG = new Set(['Descartado','Nao interessa','Não interessa','Cancelado'])
    const imoveisParados = imoveis.filter(i => {
      if (ESTADOS_NEG.has(i.estado) || ['Vendido','Wholesaling','Negócio em Curso'].includes(i.estado)) return false
      const ultima = i.dataPropostaAceite ?? i.dataProposta ?? i.dataEstudoMercado ?? i.dataVisita ?? i.dataChamada ?? i.dataAdicionado
      if (!ultima) return false
      return (now - new Date(ultima)) / 86400000 > 7
    }).length

    const investSemContacto = investidores.filter(i => {
      const dias = i.diasSemContacto ?? (() => {
        const u = i.dataUltimoContacto ?? i.dataReuniao ?? i.dataPrimeiroContacto
        return u ? Math.floor((now - new Date(u)) / 86400000) : null
      })()
      return dias != null && dias > 14
    }).length

    const CONS_ATIVOS = new Set(['Aberto Parcerias','Em Parceria','Follow up','Follow Up','Acesso imoveis Off market'])
    const consFollowUpAtrasado = consultoresRaw.filter(c =>
      CONS_ATIVOS.has(c.estatuto) && c.dataProximoFollowUp && new Date(c.dataProximoFollowUp) < now
    ).length

    // Cash
    const burnRate = round2(despesas.filter(d => d.timing === 'Mensalmente').reduce((s,d) => s + d.custoMensal, 0) + despesas.filter(d => d.timing === 'Anual').reduce((s,d) => s + (d.custoAnual || 0) / 12, 0))
    const lucroPendente = round2(negocios.filter(n => n.pagamentoEmFalta).reduce((s,n) => s + n.lucroEstimado, 0))
    const runway = burnRate > 0 ? round2(lucroPendente / burnRate) : null

    // Pulse score (0-100)
    let score = 50 // base
    score += Math.min(imoveisAdicionados * 5, 15) // até +15 por imóveis novos
    score += Math.min(chamadasFeitas * 3, 10)     // até +10 por chamadas
    score += Math.min(visitasFeitas * 5, 10)      // até +10 por visitas
    score += dealsFechados * 15                    // +15 por deal
    score -= Math.min(imoveisParados * 2, 15)     // até -15 por parados
    score -= Math.min(investSemContacto * 1, 10)  // até -10 por inativos
    score -= Math.min(consFollowUpAtrasado * 1, 10) // até -10 por follow-ups
    score = Math.max(0, Math.min(100, score))

    const status = score >= 75 ? 'excelente' : score >= 50 ? 'bom' : score >= 30 ? 'atenção' : 'crítico'

    res.json({
      semana: { de: weekStart.toISOString().slice(0,10), ate: now.toISOString().slice(0,10) },
      score, status,
      atividades: { imoveisAdicionados, chamadasFeitas, visitasFeitas, propostasEnviadas, dealsFechados },
      alertas: { imoveisParados, investSemContacto, consFollowUpAtrasado },
      financeiro: { burnRate, lucroPendente, runway },
    })
  } catch (err) {
    console.error('[weekly-pulse]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// CASH FLOW PROJETADO — Projeção mensal
// ════════════════════════════════════════════════════════════════
app.get('/api/financeiro/projecao', async (req, res) => {
  try {
    const [negocios, despesas] = await Promise.all([getNegócios(), getDespesas()])
    const now = new Date()

    const burnRate = round2(despesas.filter(d => d.timing === 'Mensalmente').reduce((s,d) => s + d.custoMensal, 0) + despesas.filter(d => d.timing === 'Anual').reduce((s,d) => s + (d.custoAnual || 0) / 12, 0))
    const despesasAnuais = despesas.filter(d => d.timing === 'Anual')

    // Projeção: próximos 12 meses
    const meses = []
    let saldoAcumulado = 0

    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const ano = d.getFullYear()
      const month = d.getMonth() + 1
      const label = `${MES_ABREV[d.getMonth()]} ${String(ano).slice(2)}`

      // Entradas previstas: pagamentos faseados pendentes com data neste mês + negócios sem faseados
      let totalEntradas = 0
      let dealCount = 0
      const negociosContados = new Set()

      for (const n of negocios) {
        if (!n.pagamentoEmFalta) continue
        const pags = n.pagamentosFaseados || []
        const pagsMes = pags.filter(p => {
          if (p.recebido || !p.data) return false
          const dt = new Date(p.data)
          return dt.getFullYear() === ano && dt.getMonth() + 1 === month
        })
        if (pagsMes.length > 0) {
          totalEntradas += pagsMes.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
          if (!negociosContados.has(n.id)) { dealCount++; negociosContados.add(n.id) }
        } else if (pags.length === 0) {
          // Sem faseados — usar data estimada como antes
          const data = n.dataEstimada ?? n.dataVenda
          if (!data) continue
          const dt = new Date(data)
          if (dt.getFullYear() === ano && dt.getMonth() + 1 === month) {
            totalEntradas += n.lucroEstimado
            dealCount++
          }
        }
      }
      totalEntradas = round2(totalEntradas)

      // Saídas: burn rate + despesas anuais que caem neste mês
      let totalSaidas = burnRate
      for (const da of despesasAnuais) {
        if (da.data) {
          const dda = new Date(da.data)
          if (dda.getMonth() + 1 === month) totalSaidas += da.custoAnual || da.custoMensal || 0
        }
      }
      totalSaidas = round2(totalSaidas)

      const liquido = round2(totalEntradas - totalSaidas)
      saldoAcumulado = round2(saldoAcumulado + liquido)

      meses.push({ label, entradas: totalEntradas, saidas: totalSaidas, liquido, saldoAcumulado, deals: dealCount })
    }

    // Break-even: quantos deals para cobrir despesas anuais
    const despesasAnuaisTotal = round2(burnRate * 12 + despesasAnuais.reduce((s,d) => s + (d.custoAnual || 0), 0))
    const lucroMedioDeal = negocios.length > 0 ? round2(negocios.reduce((s,n) => s + n.lucroEstimado, 0) / negocios.length) : 0
    const dealsParaBreakEven = lucroMedioDeal > 0 ? Math.ceil(despesasAnuaisTotal / lucroMedioDeal) : null

    // P&L simplificado
    const receitaTotal = round2(negocios.reduce((s,n) => s + n.lucroReal, 0))
    const receitaEstimada = round2(negocios.reduce((s,n) => s + n.lucroEstimado, 0))
    const despesasTotalAno = despesasAnuaisTotal
    const resultadoLiquido = round2(receitaTotal - (burnRate * (now.getMonth() + 1)))
    const resultadoEstimado = round2(receitaEstimada - despesasTotalAno)

    res.json({
      projecao: meses,
      burnRate,
      breakEven: { despesasAnuais: despesasAnuaisTotal, lucroMedioDeal, dealsNecessarios: dealsParaBreakEven },
      pl: {
        receitaReal: receitaTotal,
        receitaEstimada,
        despesasAteAgora: round2(burnRate * (now.getMonth() + 1)),
        despesasAnuaisTotal,
        resultadoLiquido,
        resultadoEstimado,
        mesesDecorridos: now.getMonth() + 1,
      },
    })
  } catch (err) {
    console.error('[financeiro/projecao]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// OPS SCORECARD — Substitui Operações legacy
// ════════════════════════════════════════════════════════════════
app.get('/api/ops-scorecard', async (req, res) => {
  try {
    const [imoveis, consultoresRaw, negocios, investidores] = await Promise.all([
      getImóveis().catch(() => []),
      getConsultores().catch(() => []),
      getNegócios(),
      getInvestidores(),
    ])
    const now = new Date()
    const CONS_ATIVOS = new Set(['Aberto Parcerias','Em Parceria','Follow up','Follow Up','Acesso imoveis Off market','Consultores em Parceria'])
    const ESTADOS_NEG = new Set(['Descartado','Nao interessa','Não interessa','Cancelado'])

    // Consultores ativos
    const consAtivos = consultoresRaw.filter(c => CONS_ATIVOS.has(c.estatuto))
    const consParceria = consultoresRaw.filter(c => c.estatuto === 'Consultores em Parceria' || c.estatuto === 'Em Parceria')
    const taxaAtivacao = consultoresRaw.length > 0 ? round2(consAtivos.length / consultoresRaw.length * 100) : 0

    // Pipeline velocity
    const imoveisAtivos = imoveis.filter(i => !ESTADOS_NEG.has(i.estado))
    const tempoMedioFase = (() => {
      const tempos = imoveisAtivos.map(i => {
        const ultima = i.dataPropostaAceite ?? i.dataProposta ?? i.dataEstudoMercado ?? i.dataVisita ?? i.dataChamada ?? i.dataAdicionado
        if (!ultima) return null
        return Math.floor((now - new Date(ultima)) / 86400000)
      }).filter(v => v != null)
      return tempos.length > 0 ? round2(tempos.reduce((s,v) => s+v,0) / tempos.length) : null
    })()

    // Ranking consultores (top 10 por leads)
    const byNome = {}
    for (const im of imoveis) {
      const nome = im.nomeConsultor?.trim()
      if (!nome) continue
      if (!byNome[nome]) byNome[nome] = { total: 0, ativos: 0, descartados: 0, avancados: 0, visitas: 0 }
      byNome[nome].total++
      if (ESTADOS_NEG.has(im.estado)) byNome[nome].descartados++
      else byNome[nome].ativos++
      if (im.dataVisita) byNome[nome].visitas++
      if (['Wholesaling','Negócio em Curso','Estudo de VVR','Enviar proposta ao investidor'].includes(im.estado)) byNome[nome].avancados++
    }

    const rankingConsultores = Object.entries(byNome)
      .map(([nome, v]) => ({
        nome, ...v,
        taxaConversao: v.total > 0 ? round2(v.avancados / v.total * 100) : 0,
        consultor: consultoresRaw.find(c => c.nome === nome),
      }))
      .sort((a,b) => b.total - a.total)
      .slice(0, 15)

    // Pipeline por zona
    const porZona = {}
    for (const im of imoveis) {
      const zona = im.zonas?.[0] ?? im.zona ?? 'Sem zona'
      if (!porZona[zona]) porZona[zona] = { total: 0, ativos: 0, valor: 0 }
      porZona[zona].total++
      if (!ESTADOS_NEG.has(im.estado)) {
        porZona[zona].ativos++
        porZona[zona].valor += im.askPrice || 0
      }
    }
    const zonas = Object.entries(porZona)
      .map(([zona, v]) => ({ zona, ...v, valor: round2(v.valor) }))
      .sort((a,b) => b.ativos - a.ativos)

    // Tempo médio por fase do pipeline
    const faseTimings = {}
    const FUNIL = ['dataChamada','dataVisita','dataEstudoMercado','dataProposta','dataPropostaAceite']
    const FUNIL_LABELS = ['Lead → Chamada','Chamada → Visita','Visita → Estudo','Estudo → Proposta','Proposta → Aceite']
    const FUNIL_FROM = ['dataAdicionado','dataChamada','dataVisita','dataEstudoMercado','dataProposta']
    for (let idx = 0; idx < FUNIL.length; idx++) {
      const dias = imoveis.map(i => {
        const from = i[FUNIL_FROM[idx]]
        const to = i[FUNIL[idx]]
        if (!from || !to) return null
        const d = (new Date(to) - new Date(from)) / 86400000
        return d >= 0 && d < 365 ? d : null
      }).filter(v => v != null)
      faseTimings[FUNIL_LABELS[idx]] = dias.length > 0 ? round2(dias.reduce((s,v)=>s+v,0)/dias.length) : null
    }

    // Investidores: funil de conversão
    const invTotal = investidores.length
    const invReuniao = investidores.filter(i => i.dataReuniao).length
    const invClassificado = investidores.filter(i => i.classificacao?.length > 0).length
    const invParceria = investidores.filter(i => ['Investidor em parceria','Em Parceria'].includes(i.status)).length
    const invTaxaConversao = invTotal > 0 ? round2(invParceria / invTotal * 100) : 0

    res.json({
      updatedAt: new Date().toISOString(),
      consultores: {
        total: consultoresRaw.length,
        ativos: consAtivos.length,
        emParceria: consParceria.length,
        taxaAtivacao,
      },
      pipeline: {
        imoveisAtivos: imoveisAtivos.length,
        imoveisTotal: imoveis.length,
        tempoMedioFase,
        faseTimings,
      },
      investidores: {
        total: invTotal, comReuniao: invReuniao, classificados: invClassificado,
        emParceria: invParceria, taxaConversao: invTaxaConversao,
      },
      negocios: { total: negocios.length, fechados: negocios.filter(n => n.fase === 'Vendido').length },
      rankingConsultores,
      zonas,
    })
  } catch (err) {
    console.error('[ops-scorecard]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// MÉTRICAS — Framework completo Wholesaling / Fix & Flip
// ════════════════════════════════════════════════════════════════
function daysBetween(d1, d2) {
  if (!d1 || !d2) return null
  const ms = new Date(d2) - new Date(d1)
  return ms > 0 ? round2(ms / 86400000) : null
}
function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v))
  return valid.length > 0 ? round2(valid.reduce((s, v) => s + v, 0) / valid.length) : null
}

app.get('/api/metricas', async (req, res) => {
  try {
    const [imoveis, negocios, investidores, consultoresRaw, despesas] = await Promise.all([
      getImóveis().catch(() => []),
      getNegócios(),
      getInvestidores(),
      getConsultores().catch(() => []),
      getDespesas().catch(() => []),
    ])

    const { ano, month } = getMesAtual()
    const now = new Date()

    // Normalização: suporta nomes antigos e novos do Notion em simultâneo
    const ESTADOS_NEGATIVOS_SET = new Set([
      'Descartado','Nao interessa','Não interessa','Cancelado',
    ])
    const ESTADOS_AVANCADOS_SET = new Set([
      'Visita Marcada','Necessidade de Visita',
      'Follow UP','Follow Up após proposta',
      'Estudo de VVR',
      'Enviar proposta ao investidor',
      'Criar Proposta ao Proprietário','Enviar proposta ao Proprietário',
      'Em negociação','Proposta aceite',
      'Wholesaling','Negócio em Curso','CAEP','Fix and Flip',
    ])
    const ESTADOS_PARCERIA = new Set([
      'Investidor em parceria','Em Parceria','Investidor Ativo',
    ])
    const ESTADOS_PROPOSTA_INV = new Set([
      'Investidor em espera','Classificado','Qualificado',
      'Em Qualificacao','Em Qualificação',
      'Proposta Enviada','Em Negociacao','Em Negociação',
      'Investidor em parceria','Em Parceria',
    ])
    const ESTADOS_PIPELINE_INV = new Set([
      'Potencial','Potencial Investidor',
      'Marcar Call','Marcar call',
      'Call Marcada','Call marcada',
      'Follow Up','Classificado','Investidor em espera',
    ])

    const imoveisAtivos      = imoveis.filter(i => !ESTADOS_NEGATIVOS_SET.has(i.estado))
    const imoveisDescartados = imoveis.filter(i =>  ESTADOS_NEGATIVOS_SET.has(i.estado))
    const imoveisDoMes       = imoveis.filter(i => isMonth(i.dataAdicionado, ano, month))

    // ── PIPELINE 1 — Imóveis ────────────────────────────────────

    // Funil (todos os imóveis históricos, baseado em data_adicionado / estado atingido)
    const leadsGerados       = imoveis.length
    const analisados         = imoveis.filter(i =>
      ESTADOS_AVANCADOS_SET.has(i.estado) || !!i.dataEstudoMercado).length
    const propostasEnviadas  = imoveis.filter(i => !!i.dataProposta).length
    const contratosAssinados = negocios.length   // cada entrada em Faturação = um contrato
    const escriturasConcluidas = negocios.filter(n => n.fase === 'Vendido').length

    // Taxa de conversão lead → contrato
    const taxaConversaoP1 = leadsGerados > 0
      ? round2(contratosAssinados / leadsGerados * 100) : 0

    // Spread médio negociação: (ask - proposta) / ask
    const spreads = imoveis
      .filter(i => i.askPrice > 0 && i.valorProposta > 0)
      .map(i => (i.askPrice - i.valorProposta) / i.askPrice * 100)
    const spreadMedio = avg(spreads)

    // Desconto sobre valor de mercado (CAEP/F&F): (VVR - proposta) / VVR
    const descontosCAEP = imoveis
      .filter(i => i.valorVendaRemodelado > 0 && i.valorProposta > 0)
      .map(i => (i.valorVendaRemodelado - i.valorProposta) / i.valorVendaRemodelado * 100)
    const descontoMercado = avg(descontosCAEP)

    // % imóveis abaixo limiar rentabilidade F&F (ROI < 15%)
    const imoveisFF = imoveis.filter(i => i.roi > 0)
    const abaixoLimiar = imoveisFF.length > 0
      ? round2(imoveisFF.filter(i => i.roi < 15).length / imoveisFF.length * 100) : null

    // Imóveis em due diligence simultânea
    const nDueDiligence = imoveis.filter(i => i.estado === 'Estudo de VVR').length

    // Tempo médio negociação (1.ª chamada → proposta aceite)
    const temposNegociacao = imoveis
      .map(i => daysBetween(i.dataChamada, i.dataPropostaAceite))
      .filter(v => v != null && v < 365)
    const tempoMedioNegociacao = avg(temposNegociacao)

    // Motivos de descarte
    const motivosDescarte = {}
    for (const i of imoveisDescartados) {
      const m = i.motivoDescarte ?? 'Não registado'
      motivosDescarte[m] = (motivosDescarte[m] ?? 0) + 1
    }

    // Descarte por origem
    const descarteOrigem = {}
    for (const i of imoveis) {
      const o = i.origem ?? 'Outro'
      if (!descarteOrigem[o]) descarteOrigem[o] = { total: 0, descartados: 0 }
      descarteOrigem[o].total++
      if (ESTADOS_NEGATIVOS_SET.has(i.estado)) descarteOrigem[o].descartados++
    }
    const descarteOrigemList = Object.entries(descarteOrigem).map(([origem, v]) => ({
      origem, total: v.total, descartados: v.descartados,
      taxaDescarte: round2(v.descartados / v.total * 100),
    })).sort((a, b) => b.taxaDescarte - a.taxaDescarte)

    // Modelo por estado (Wholesaling vs F&F derivado do campo Modelo de Negócio ou fallback por estado)
    const modeloCount = { 'Wholesaling': 0, 'Fix & Flip': 0, 'Mediação': 0, 'Não definido': 0 }
    for (const i of imoveisAtivos) {
      const m = i.modeloNegocio ?? 'Não definido'
      modeloCount[m] = (modeloCount[m] ?? 0) + 1
    }

    // ── PIPELINE 2 — Consultores (derivado de Faturação) ────────
    const porCategoria = {}
    for (const n of negocios) {
      const k = n.categoria ?? 'Outro'
      if (!porCategoria[k]) porCategoria[k] = { count: 0, lucroEst: 0, lucroReal: 0, fechados: 0 }
      porCategoria[k].count++
      porCategoria[k].lucroEst  += n.lucroEstimado
      porCategoria[k].lucroReal += n.lucroReal
      if (n.fase === 'Vendido') porCategoria[k].fechados++
    }
    const dealsPorCategoria = Object.entries(porCategoria).map(([cat, v]) => ({
      categoria: cat, count: v.count, fechados: v.fechados,
      lucroEst: round2(v.lucroEst), lucroReal: round2(v.lucroReal),
      lucroMedio: v.fechados > 0 ? round2(v.lucroReal / v.fechados) : null,
    }))

    // Deals com capital passivo (com investidor associado)
    const dealsComInvestidor = negocios.filter(n => n.investidor.length > 0)
    const pctDealsCapitalPassivo = negocios.length > 0
      ? round2(dealsComInvestidor.length / negocios.length * 100) : 0

    // Holding period (F&F): data compra → data venda
    const holdingPeriods = negocios
      .map(n => daysBetween(n.dataCompra, n.dataVenda))
      .filter(v => v != null && v > 0 && v < 730)
    const holdingMedio = avg(holdingPeriods)

    // Margem bruta por modelo
    const negWholesaling = negocios.filter(n => n.categoria === 'Wholesalling')
    const negFF          = negocios.filter(n => ['Fix and Flip', 'CAEP'].includes(n.categoria))
    const margemWholesaling = avg(negWholesaling.filter(n=>n.lucroReal>0).map(n=>n.lucroReal))
    const margemFF          = avg(negFF.filter(n=>n.lucroReal>0).map(n=>n.lucroReal))

    // Deals fechados no mês actual
    const dealsMes = negocios.filter(n => isMonth(n.dataVenda, ano, month) && n.fase === 'Vendido')
    const receitaMes = round2(dealsMes.reduce((s,n) => s + n.lucroEstimado, 0))

    // ── PIPELINE 3 — Investidores ───────────────────────────────
    const total            = investidores.length
    const comReuniao       = investidores.filter(i => !!i.dataReuniao).length
    const comNDA           = investidores.filter(i => i.ndaAssinado).length
    const comCapital       = investidores.filter(i => i.montanteInvestido > 0).length
    const emParceria  = investidores.filter(i => ESTADOS_PARCERIA.has(i.status))
    const comProposta = investidores.filter(i => ESTADOS_PROPOSTA_INV.has(i.status)).length

    // Capital
    const capitalCaptado    = round2(investidores.reduce((s,i) => s + i.montanteInvestido, 0))
    // capitalDisponivel = capital máximo dos investidores classificados A/B (potencial total mobilizável)
    const investClassif     = investidores.filter(i => i.classificacao.some(c => ['A','B'].includes(c)))
    const capitalDisponivel = investClassif.length > 0
      ? round2(investClassif.reduce((s,i) => s + i.capitalMax, 0))
      : round2(emParceria.reduce((s,i) => s + i.capitalMax, 0))
    const ticketMedio        = comCapital > 0
      ? round2(investidores.filter(i=>i.montanteInvestido>0).reduce((s,i)=>s+i.montanteInvestido,0) / comCapital)
      : null

    // Taxa de conversão: total → em parceria
    const taxaConversaoInv = total > 0 ? round2(emParceria.length / total * 100) : 0

    // Taxa de retenção: investidores com >1 negócio / total em parceria
    const taxaRetencao = emParceria.length > 0
      ? round2(emParceria.filter(i => i.numeroNegocios > 1).length / emParceria.length * 100) : null

    // Tempo médio captação (1.º contacto → capital transferido)
    const temposCaptacao = investidores
      .map(i => daysBetween(i.dataPrimeiroContacto, i.dataCapitalTransferido))
      .filter(v => v != null && v < 730)
    const tempoMedioCaptacao = avg(temposCaptacao)

    // ROI entregue: lucroReal de negócios com investidor / capital captado
    const lucroEntregue = negocios
      .filter(n => n.investidor.length > 0 && n.fase === 'Vendido')
      .reduce((s,n) => s + n.lucroReal, 0)
    const roiEntregue = capitalCaptado > 0 ? round2(lucroEntregue / capitalCaptado * 100) : null

    // LTV por investidor
    const ltvPorInvestidor = investidores
      .filter(i => i.montanteInvestido > 0)
      .map(i => ({ nome: i.nome, ltv: i.montanteInvestido, negocios: i.numeroNegocios, status: i.status }))
      .sort((a,b) => b.ltv - a.ltv)

    // Capital disponível vs alocado (deals activos)
    const capitalAlocado = round2(
      imoveisAtivos
        .filter(i => ['Wholesaling','Negócio em Curso'].includes(i.estado))
        .reduce((s,i) => s + i.askPrice, 0)
    )

    const investEmPipeline = investidores.filter(i => ESTADOS_PIPELINE_INV.has(i.status)).length

    // ── TRANSVERSAIS ────────────────────────────────────────────
    const pipelineValue = round2(imoveisAtivos.reduce((s,i) => s + i.askPrice, 0))
    const ratioDealFlowCapital = capitalDisponivel > 0
      ? round2(pipelineValue / capitalDisponivel) : null

    // % deals que cumprem projecção CAEP (lucroReal >= lucroEstimado * 0.8)
    const dealsFechados = negocios.filter(n => n.fase === 'Vendido' && n.lucroEstimado > 0)
    const cumpreProjeccao = dealsFechados.length > 0
      ? round2(dealsFechados.filter(n => n.lucroReal >= n.lucroEstimado * 0.8).length / dealsFechados.length * 100)
      : null

    // Velocidade ciclo completo (lead adicionado → deal fechado) — via Faturação com Imóvel ligado
    // Calculamos pelos imóveis que têm relação com Faturação fechada
    const ciclosCompletos = []
    for (const n of negocios.filter(n => n.fase === 'Vendido' && n.dataVenda)) {
      const imovelRel = imoveis.find(i => n.imovel.includes(i.id))
      if (imovelRel?.dataAdicionado) {
        const dias = daysBetween(imovelRel.dataAdicionado, n.dataVenda)
        if (dias && dias > 0 && dias < 730) ciclosCompletos.push(dias)
      }
    }
    const velocidadeCicloCompleto = avg(ciclosCompletos)

    // ROE (lucro real / capital investido pelos parceiros)
    const roe = capitalCaptado > 0 ? round2(lucroEntregue / capitalCaptado * 100) : null

    // Deals simultâneos em execução
    const dealsSilmultaneos = negocios.filter(n => n.fase !== 'Vendido').length

    // ════════════════════════════════════════════════════════════
    // TRACKER KPIs — Framework completo (secções 1.1 a 3.3)
    // ════════════════════════════════════════════════════════════

    // Helper: filtra por período
    const isQuarter = (dateStr, y, q) => {
      if (!dateStr) return false
      const d = new Date(dateStr)
      return d.getFullYear() === y && Math.ceil((d.getMonth() + 1) / 3) === q
    }
    const isSemester = (dateStr, y, s) => {
      if (!dateStr) return false
      const d = new Date(dateStr)
      return d.getFullYear() === y && (s === 1 ? d.getMonth() < 6 : d.getMonth() >= 6)
    }
    const currentQuarter = Math.ceil(month / 3)
    const currentSemester = month <= 6 ? 1 : 2
    const isThisWeek = (dateStr) => {
      if (!dateStr) return false
      const d = new Date(dateStr)
      const diffDays = Math.floor((now - d) / 86400000)
      return diffDays >= 0 && diffDays < 7
    }

    // ── 1.1 RECEITA / FATURAÇÃO ─────────────────────────────────

    // Wholesaling deals
    const negWH = negocios.filter(n => n.categoria === 'Wholesalling')
    const negWHFechados = negWH.filter(n => n.fase === 'Vendido')
    const negWHAno = negWH.filter(n => isYear(n.dataVenda || n.data, ano))
    const negWHFechadosAno = negWHFechados.filter(n => isYear(n.dataVenda, ano))
    const whReceitaAnual = round2(negWHFechadosAno.reduce((s,n) => s + (n.lucroReal || n.lucroEstimado), 0))
    const whReceitaTrimestral = round2(negWHFechados
      .filter(n => isQuarter(n.dataVenda, ano, currentQuarter))
      .reduce((s,n) => s + (n.lucroReal || n.lucroEstimado), 0))
    const whReceitaSemestral = round2(negWHFechados
      .filter(n => isSemester(n.dataVenda, ano, currentSemester))
      .reduce((s,n) => s + (n.lucroReal || n.lucroEstimado), 0))
    const whLucros = negWHFechados.filter(n => n.lucroReal > 0 || n.lucroEstimado > 0).map(n => n.lucroReal || n.lucroEstimado)
    const whFaturacaoMedia = avg(whLucros)
    const whFaturacaoMinima = whLucros.length > 0 ? Math.min(...whLucros) : null
    const whPctAcimaMedia = whLucros.length > 0 && whFaturacaoMedia
      ? round2(whLucros.filter(v => v >= whFaturacaoMedia).length / whLucros.length * 100) : null

    // CAEP deals
    const negCAEP = negocios.filter(n => n.categoria === 'CAEP')
    const negCAEPFechados = negCAEP.filter(n => n.fase === 'Vendido')
    const negCAEPAno = negCAEPFechados.filter(n => isYear(n.dataVenda, ano))
    const caepQuotaSomnium = negCAEP.map(n => n.quotaSomnium || round2((n.lucroReal || n.lucroEstimado) * 0.267))
    const caepQuotaTotal = round2(caepQuotaSomnium.reduce((s,v) => s + v, 0))
    const caepQuotaMedia = avg(caepQuotaSomnium.filter(v => v > 0))
    const caepFaturacaoAnual = round2(negCAEPAno.reduce((s,n) => s + (n.quotaSomnium || (n.lucroReal || n.lucroEstimado) * 0.267), 0))
    const caepFaturacaoMedia = avg(negCAEPFechados.map(n => n.quotaSomnium || (n.lucroReal || n.lucroEstimado) * 0.267).filter(v => v > 0))
    // Desvio prazo: data real vs estimada
    const caepDesviosPrazo = negCAEP
      .filter(n => n.dataVenda && n.dataEstimada)
      .map(n => ({ movimento: n.movimento, desvio: daysBetween(n.dataEstimada, n.dataVenda) }))
    // Lucro estimado vs real
    const caepEstVsReal = negCAEPFechados
      .filter(n => n.lucroEstimado > 0)
      .map(n => ({ movimento: n.movimento, estimado: n.lucroEstimado, real: n.lucroReal, desvio: n.lucroReal > 0 ? round2((n.lucroReal - n.lucroEstimado) / n.lucroEstimado * 100) : null }))

    const trackerReceita = {
      wholesaling: {
        receitaAnual: whReceitaAnual, receitaTrimestral: whReceitaTrimestral,
        receitaSemestral: whReceitaSemestral,
        faturacaoMedia: whFaturacaoMedia, faturacaoMinima: whFaturacaoMinima,
        pctAcimaMedia: whPctAcimaMedia,
        acumuladoVsMeta: round2(whReceitaAnual / 50000 * 100),
        metaAnual: 50000, metaTrimestral: 12500, metaSemestral: 25000,
        nDeals: negWH.length, nFechados: negWHFechados.length,
      },
      caep: {
        quotaSomniumTotal: caepQuotaTotal, quotaMediaPorNegocio: caepQuotaMedia,
        faturacaoAnual: caepFaturacaoAnual, faturacaoMedia: caepFaturacaoMedia,
        acumuladoVsMeta: round2(caepFaturacaoAnual / 50000 * 100),
        metaAnual: 50000,
        desviosPrazo: caepDesviosPrazo, lucroEstVsReal: caepEstVsReal,
        nDeals: negCAEP.length, nFechados: negCAEPFechados.length,
      },
    }

    // ── 1.2 TAXA DE CONVERSÃO ───────────────────────────────────

    // Imóveis — funil detalhado
    const imComChamada = imoveis.filter(i => !!i.dataChamada).length
    const imComVisita = imoveis.filter(i => !!i.dataVisita).length
    const imComProposta = imoveis.filter(i => !!i.dataProposta).length
    const imComFecho = contratosAssinados  // negocios.length
    const convImAddToChamada = leadsGerados > 0 ? round2(imComChamada / leadsGerados * 100) : null
    const convImChamadaToVisita = imComChamada > 0 ? round2(imComVisita / imComChamada * 100) : null
    const convImVisitaToProposta = imComVisita > 0 ? round2(imComProposta / imComVisita * 100) : null
    const convImPropostaToFecho = imComProposta > 0 ? round2(imComFecho / imComProposta * 100) : null
    const convImGlobal = leadsGerados > 0 ? round2(imComFecho / leadsGerados * 100) : null
    // Mix WH/CAEP
    const mixWH = negocios.length > 0 ? round2(negWH.length / negocios.length * 100) : null
    const mixCAEP = negocios.length > 0 ? round2(negCAEP.length / negocios.length * 100) : null

    // Investidores — funil detalhado
    const invComReuniao = investidores.filter(i => !!i.dataReuniao).length
    const invClassificados = investidores.filter(i => i.classificacao.length > 0).length
    const invComInvestimento = investidores.filter(i => i.montanteInvestido > 0).length
    const convInvContactToReuniao = total > 0 ? round2(invComReuniao / total * 100) : null
    const convInvReuniaoToClassif = invComReuniao > 0 ? round2(invClassificados / invComReuniao * 100) : null
    const convInvClassifTo1st = invClassificados > 0 ? round2(invComInvestimento / invClassificados * 100) : null
    const convInvGlobal = total > 0 ? round2(emParceria.length / total * 100) : null

    // Consultores — funil detalhado
    const CONS_EM_PARCERIA = new Set(['Consultores em Parceria', 'Acesso imoveis Off market'])
    const CONS_ATIVOS_SET = new Set(['Aberto Parcerias', 'Follow up', 'Follow Up', 'Acesso imoveis Off market', 'Consultores em Parceria'])
    const consComCall = consultoresRaw.filter(c => !!c.dataPrimeiraCall).length
    const consAtivos = consultoresRaw.filter(c => CONS_ATIVOS_SET.has(c.estatuto)).length
    const consEmParceria = consultoresRaw.filter(c => CONS_EM_PARCERIA.has(c.estatuto)).length
    const consComNegocio = consultoresRaw.filter(c => c.lucroGerado > 0 || c.imoveisEnviados > 0).length
    // Consultores que trouxeram negócios que fecharam
    const consComNegocioFechado = consultoresRaw.filter(c => c.lucroGerado > 0).length
    const convConsContactToCall = consultoresRaw.length > 0 ? round2(consComCall / consultoresRaw.length * 100) : null
    const convConsCallToAtivo = consComCall > 0 ? round2(consAtivos / consComCall * 100) : null
    const convConsAtivoToNegocio = consAtivos > 0 ? round2(consComNegocio / consAtivos * 100) : null
    const convConsGlobal = consultoresRaw.length > 0 ? round2(consComNegocioFechado / consultoresRaw.length * 100) : null

    const trackerConversao = {
      imoveis: {
        addToChamada: convImAddToChamada, metaAddToChamada: 80,
        chamadaToVisita: convImChamadaToVisita, metaChamadaToVisita: 35,
        visitaToProposta: convImVisitaToProposta, metaVisitaToProposta: 50,
        propostaToFecho: convImPropostaToFecho, metaPropostaToFecho: 35,
        global: convImGlobal, metaGlobal: 6,
        mixWH, mixCAEP,
        totais: { leads: leadsGerados, chamadas: imComChamada, visitas: imComVisita, propostas: imComProposta, fechos: imComFecho },
      },
      investidores: {
        contactToReuniao: convInvContactToReuniao, metaContactToReuniao: 40,
        reuniaoToClassificado: convInvReuniaoToClassif, metaReuniaoToClassificado: 50,
        classificadoTo1st: convInvClassifTo1st, metaClassificadoTo1st: 30,
        global: convInvGlobal, metaGlobal: 15,
        totais: { contactos: total, reunioes: invComReuniao, classificados: invClassificados, investidores: invComInvestimento, emParceria: emParceria.length },
      },
      consultores: {
        contactToCall: convConsContactToCall, metaContactToCall: 70,
        callToAtivo: convConsCallToAtivo, metaCallToAtivo: 30,
        ativoToNegocio: convConsAtivoToNegocio, metaAtivoToNegocio: 50,
        global: convConsGlobal, metaGlobal: 5,
        totais: { contactos: consultoresRaw.length, calls: consComCall, ativos: consAtivos, comNegocio: consComNegocio, comFecho: consComNegocioFechado },
      },
    }

    // ── 1.3 TICKET MÉDIO ────────────────────────────────────────

    // Wholesaling
    const whLucroMedio = avg(negWHFechados.filter(n => n.lucroReal > 0).map(n => n.lucroReal)) || whFaturacaoMedia
    const whLucroMinimo = negWHFechados.filter(n => n.lucroReal > 0).length > 0
      ? Math.min(...negWHFechados.filter(n => n.lucroReal > 0).map(n => n.lucroReal)) : whFaturacaoMinima

    // CAEP
    const caepCapitalMedioPorNegocio = avg(negCAEP.filter(n => n.capitalTotal > 0).map(n => n.capitalTotal))
    const caepCapitalMedioPorInvestidor = (() => {
      const caps = negCAEP.filter(n => n.capitalTotal > 0 && n.nInvestidores > 0)
      return avg(caps.map(n => n.capitalTotal / n.nInvestidores))
    })()
    const caepNMedioInvestidores = avg(negCAEP.filter(n => n.nInvestidores > 0).map(n => n.nInvestidores))
    const caepLucroSobreCapital = (() => {
      const caps = negCAEP.filter(n => n.capitalTotal > 0)
      const lucro = caps.reduce((s,n) => s + (n.quotaSomnium || (n.lucroReal || n.lucroEstimado) * 0.267), 0)
      const capital = caps.reduce((s,n) => s + n.capitalTotal, 0)
      return capital > 0 ? round2(lucro / capital * 100) : null
    })()
    const caepLucroPorMes = (() => {
      const deals = negCAEP.filter(n => n.dataCompra && n.dataVenda)
      return avg(deals.map(n => {
        const meses = daysBetween(n.dataCompra, n.dataVenda) / 30
        const quota = n.quotaSomnium || (n.lucroReal || n.lucroEstimado) * 0.267
        return meses > 0 ? round2(quota / meses) : null
      }).filter(v => v != null))
    })()
    const caepRoiInvestidor = avg(investidores.filter(i => i.roiInvestidor > 0).map(i => i.roiInvestidor))

    // Consultores
    const consAskPriceMedio = avg(imoveis.filter(i => i.nomeConsultor && i.askPrice > 0).map(i => i.askPrice))
    const consLucroMedioGerado = avg(consultoresRaw.filter(c => c.lucroGerado > 0).map(c => c.lucroGerado))
    const pctNegociosViaConsultor = negocios.length > 0
      ? round2(negocios.filter(n => n.consultorIds.length > 0).length / negocios.length * 100) : null
    const rankingConsultores = consultoresRaw
      .filter(c => c.lucroGerado > 0)
      .map(c => ({ nome: c.nome, lucroGerado: c.lucroGerado, classificacao: c.classificacao }))
      .sort((a,b) => b.lucroGerado - a.lucroGerado)

    const trackerTicketMedio = {
      wholesaling: {
        lucroMedio: whLucroMedio, metaLucroMedio: 8333,
        lucroMinimo: whLucroMinimo, metaLucroMinimo: 5000, metaAlvo: 10000,
        pctAcimaMedia: whPctAcimaMedia,
      },
      caep: {
        capitalMedioPorNegocio: caepCapitalMedioPorNegocio,
        capitalMedioPorInvestidor: caepCapitalMedioPorInvestidor,
        nMedioInvestidores: caepNMedioInvestidores,
        lucroSomniumSobreCapital: caepLucroSobreCapital, metaLucroSobreCapital: 8,
        lucroSomniumPorMes: caepLucroPorMes, metaLucroPorMes: 2500,
        roiInvestidor: caepRoiInvestidor, metaRoiInvestidor: 20,
      },
      consultores: {
        askPriceMedio: consAskPriceMedio,
        lucroMedioGerado: consLucroMedioGerado, metaLucroMedio: 8000,
        pctNegociosViaConsultor, metaPctViaConsultor: 40,
        rankingValor: rankingConsultores.slice(0, 10),
      },
    }

    // ── 1.4 MARGEM DE LUCRO ────────────────────────────────────

    const margensPorNegocio = negocios.map(n => {
      // Encontrar imóvel relacionado para ask price
      const imovelRel = imoveis.find(i => n.imovel.includes(i.id))
      const askPrice = imovelRel?.askPrice || 0
      const custoTotal = askPrice + (n.custoRealObra || imovelRel?.custoObra || 0)
      const margemBruta = askPrice > 0 ? round2((n.lucroEstimado || 0) / askPrice * 100) : null
      const margemLiquida = margemBruta != null ? round2(margemBruta * 0.79) : null // ~21% IRC
      const desvioObra = n.custoRealObra > 0 && imovelRel?.custoObra > 0
        ? round2((n.custoRealObra - imovelRel.custoObra) / imovelRel.custoObra * 100) : null
      return { movimento: n.movimento, categoria: n.categoria, margemBruta, margemLiquida, desvioObra }
    })

    const trackerMargem = {
      wholesaling: {
        margemBrutaMedia: avg(margensPorNegocio.filter(m => m.categoria === 'Wholesalling' && m.margemBruta != null).map(m => m.margemBruta)),
        margemLiquidaMedia: avg(margensPorNegocio.filter(m => m.categoria === 'Wholesalling' && m.margemLiquida != null).map(m => m.margemLiquida)),
        desvioObraMedia: avg(margensPorNegocio.filter(m => m.categoria === 'Wholesalling' && m.desvioObra != null).map(m => m.desvioObra)),
      },
      caep: {
        roiMedio: avg(negCAEP.filter(n => n.capitalTotal > 0).map(n => {
          const lucro = n.lucroReal || n.lucroEstimado
          return lucro > 0 ? round2(lucro / n.capitalTotal * 100) : null
        }).filter(v => v != null)),
        margemSomniumPct: 26.7,
        desvioObraMedia: avg(margensPorNegocio.filter(m => m.categoria === 'CAEP' && m.desvioObra != null).map(m => m.desvioObra)),
      },
      porNegocio: margensPorNegocio.filter(m => m.margemBruta != null),
    }

    // ── 2.1 CAC (Custo de Aquisição) ─────────────────────────────

    const CUSTO_HORA = 15
    const CUSTOS_FIXOS_MENSAIS = 360.40
    const burnRateMensal = round2(despesas.filter(d => d.timing === 'Mensalmente').reduce((s,d) => s + d.custoMensal, 0) + despesas.filter(d => d.timing === 'Anual').reduce((s,d) => s + (d.custoAnual || 0) / 12, 0)) || CUSTOS_FIXOS_MENSAIS
    // Meses desde início (usar data mais antiga de qualquer registo)
    const datasIniciais = [
      ...imoveis.map(i => i.dataAdicionado).filter(Boolean),
      ...investidores.map(i => i.dataPrimeiroContacto).filter(Boolean),
      ...consultoresRaw.map(c => c.dataInicio || c.dataPrimeiraCall).filter(Boolean),
    ].map(d => new Date(d)).sort((a,b) => a - b)
    const dataInicio = datasIniciais.length > 0 ? datasIniciais[0] : new Date(ano, 0, 1)
    const mesesOperacao = Math.max(1, Math.ceil((now - dataInicio) / (30.44 * 86400000)))
    const custoTotalOperacao = round2(burnRateMensal * mesesOperacao)

    // Imóveis CAC
    const cacPorNegocioFechado = imComFecho > 0 ? round2(custoTotalOperacao / imComFecho) : null
    const custoPorImovelAdd = leadsGerados > 0 ? round2(custoTotalOperacao / leadsGerados) : null
    const custoPorVisita = imComVisita > 0 ? round2(custoTotalOperacao / imComVisita) : null
    const custoPorEstudo = imoveis.filter(i => !!i.dataEstudoMercado).length > 0
      ? round2(custoTotalOperacao / imoveis.filter(i => !!i.dataEstudoMercado).length) : null
    const chamadasPorVisita = imComVisita > 0 ? round2(imComChamada / imComVisita) : null
    const visitasPorProposta = imComProposta > 0 ? round2(imComVisita / imComProposta) : null
    const propostasPorNegocio = imComFecho > 0 ? round2(imComProposta / imComFecho) : null

    // Investidores CAC
    const custoPorInvestidorAtivo = emParceria.length > 0 ? round2(custoTotalOperacao * 0.3 / emParceria.length) : null
    const tempoAte1stInvest = avg(investidores
      .filter(i => i.dataPrimeiroContacto && i.dataCapitalTransferido)
      .map(i => daysBetween(i.dataPrimeiroContacto, i.dataCapitalTransferido))
      .filter(v => v != null && v > 0 && v < 730))

    // Consultores CAC
    const custoPorConsultorAtivo = consAtivos > 0 ? round2(custoTotalOperacao * 0.2 / consAtivos) : null
    const consDescontinuados = consultoresRaw.filter(c => c.estatuto === 'Cold Call' || !CONS_ATIVOS_SET.has(c.estatuto)).length
    const descontinuadosVsAtivos = consAtivos > 0 ? round2(consDescontinuados / consAtivos) : null

    // Ferramentas / receita
    const receitaTotal = round2(negocios.reduce((s,n) => s + (n.lucroReal || n.lucroEstimado), 0))
    const ferramentasSobreReceita = receitaTotal > 0
      ? round2(burnRateMensal * mesesOperacao / receitaTotal * 100) : null

    const trackerCAC = {
      constantes: { custoHora: CUSTO_HORA, custosFixosMensais: CUSTOS_FIXOS_MENSAIS, burnRateMensal, mesesOperacao, custoTotalOperacao },
      imoveis: {
        cacPorNegocio: cacPorNegocioFechado, metaCACNegocio: 600,
        custoPorImovel: custoPorImovelAdd, metaCustoPorImovel: 45,
        custoPorVisita, metaCustoPorVisita: 30,
        custoPorEstudo, metaCustoPorEstudo: 100,
        chamadasPorVisita, metaChamadasPorVisita: 3,
        visitasPorProposta, metaVisitasPorProposta: 2,
        propostasPorNegocio, metaPropostasPorNegocio: 3,
      },
      investidores: {
        custoPorInvestidorAtivo, metaCusto: 150,
        tempoAte1stInvest, metaTempo: 90,
      },
      consultores: {
        custoPorConsultorAtivo, metaCusto: 50,
        descontinuadosVsAtivos, metaRatio: 5,
      },
      ferramentas: {
        ferramentasSobreReceita, metaPct: 5,
      },
    }

    // ── 2.2 CICLO DE VENDAS ─────────────────────────────────────

    // Imóveis — tempo entre fases
    const cicloImLeadToChamada = avg(imoveis.map(i => daysBetween(i.dataAdicionado, i.dataChamada)).filter(v => v != null && v >= 0 && v < 365))
    const cicloImChamadaToVisita = avg(imoveis.map(i => daysBetween(i.dataChamada, i.dataVisita)).filter(v => v != null && v >= 0 && v < 365))
    const cicloImVisitaToEstudo = avg(imoveis.map(i => daysBetween(i.dataVisita, i.dataEstudoMercado)).filter(v => v != null && v >= 0 && v < 365))
    const cicloImEstudoToProposta = avg(imoveis.map(i => daysBetween(i.dataEstudoMercado, i.dataProposta)).filter(v => v != null && v >= 0 && v < 365))
    const cicloImPropostaToFecho = avg(imoveis.map(i => daysBetween(i.dataProposta, i.dataPropostaAceite)).filter(v => v != null && v >= 0 && v < 365))
    const cicloImLeadToFecho = avg(imoveis
      .filter(i => i.dataAdicionado && i.dataPropostaAceite)
      .map(i => daysBetween(i.dataAdicionado, i.dataPropostaAceite))
      .filter(v => v != null && v >= 0 && v < 730))

    // Fase com maior demora
    const fasesIm = [
      { fase: 'Lead → Chamada', dias: cicloImLeadToChamada },
      { fase: 'Chamada → Visita', dias: cicloImChamadaToVisita },
      { fase: 'Visita → Estudo', dias: cicloImVisitaToEstudo },
      { fase: 'Estudo → Proposta', dias: cicloImEstudoToProposta },
      { fase: 'Proposta → Fecho', dias: cicloImPropostaToFecho },
    ].filter(f => f.dias != null).sort((a,b) => b.dias - a.dias)
    const faseMaiorDemora = fasesIm.length > 0 ? fasesIm[0] : null

    // Investidores — tempo entre fases
    const cicloInvContactoToReuniao = avg(investidores
      .map(i => daysBetween(i.dataPrimeiroContacto, i.dataReuniao))
      .filter(v => v != null && v >= 0 && v < 365))
    const cicloInvNegocioToAprovacao = avg(investidores
      .filter(i => i.dataApresentacaoNegocio && i.dataAprovacaoNegocio)
      .map(i => daysBetween(i.dataApresentacaoNegocio, i.dataAprovacaoNegocio))
      .filter(v => v != null && v >= 0 && v < 365))
    const cicloInvContactoToCapital = tempoMedioCaptacao // já calculado

    // Consultores — tempo entre fases
    const cicloConsCallToNegocio = avg(consultoresRaw
      .filter(c => c.dataPrimeiraCall && c.lucroGerado > 0)
      .map(c => {
        // Usar data follow up como proxy para 1º negócio
        const dataRef = c.dataFollowUp || c.dataProximoFollowUp
        return daysBetween(c.dataPrimeiraCall, dataRef)
      })
      .filter(v => v != null && v >= 0 && v < 365))
    const cicloConsFollowUpMedio = avg(consultoresRaw
      .filter(c => c.dataFollowUp && c.dataProximoFollowUp)
      .map(c => daysBetween(c.dataFollowUp, c.dataProximoFollowUp))
      .filter(v => v != null && v > 0 && v < 180))

    const trackerCiclo = {
      imoveis: {
        leadToChamada: cicloImLeadToChamada, metaLeadToChamada: 1,
        chamadaToVisita: cicloImChamadaToVisita, metaChamadaToVisita: 7,
        visitaToEstudo: cicloImVisitaToEstudo, metaVisitaToEstudo: 14,
        estudoToProposta: cicloImEstudoToProposta, metaEstudoToProposta: 7,
        propostaToFecho: cicloImPropostaToFecho, metaPropostaToFecho: 30,
        leadToFechoTotal: cicloImLeadToFecho, metaLeadToFecho: 60,
        faseMaiorDemora,
        fases: fasesIm,
      },
      investidores: {
        contactoToReuniao: cicloInvContactoToReuniao, metaContactoToReuniao: 14,
        negocioToAprovacao: cicloInvNegocioToAprovacao, metaNegocioToAprovacao: 14,
        contactoToCapitalTotal: cicloInvContactoToCapital, metaContactoToCapital: 90,
      },
      consultores: {
        callTo1stNegocio: cicloConsCallToNegocio, metaCallToNegocio: 30,
        followUpMedio: cicloConsFollowUpMedio, metaFollowUp: 15,
      },
    }

    // ── 2.3 MOTIVO DE PERDA ─────────────────────────────────────

    // Imóveis — já temos motivosDescarte, expandir
    const motivosPorPct = Object.entries(motivosDescarte).map(([motivo, count]) => ({
      motivo, count, pct: imoveisDescartados.length > 0 ? round2(count / imoveisDescartados.length * 100) : 0,
    })).sort((a,b) => b.count - a.count)

    // Fase média de descarte
    const FASES_ORDEM = ['Adicionado', 'Pendentes', 'Em Análise', 'Visita Marcada', 'Follow UP', 'Estudo de VVR', 'Enviar proposta ao investidor']
    const faseDescarte = {}
    for (const i of imoveisDescartados) {
      // Última fase atingida baseada nas datas
      let ultimaFase = 'Adicionado'
      if (i.dataChamada) ultimaFase = 'Chamada'
      if (i.dataVisita) ultimaFase = 'Visita'
      if (i.dataEstudoMercado) ultimaFase = 'Estudo'
      if (i.dataProposta) ultimaFase = 'Proposta'
      faseDescarte[ultimaFase] = (faseDescarte[ultimaFase] ?? 0) + 1
    }

    // Investidores — motivos
    const motivosNaoAprovacao = {}
    const motivosInatividade = {}
    for (const inv of investidores) {
      if (inv.motivoNaoAprovacao) {
        motivosNaoAprovacao[inv.motivoNaoAprovacao] = (motivosNaoAprovacao[inv.motivoNaoAprovacao] ?? 0) + 1
      }
      if (inv.motivoInatividade) {
        motivosInatividade[inv.motivoInatividade] = (motivosInatividade[inv.motivoInatividade] ?? 0) + 1
      }
    }

    // Consultores — motivos descontinuação
    const motivosDescontinuacao = {}
    const consDescontinuadosList = consultoresRaw.filter(c => c.motivoDescontinuacao)
    for (const c of consDescontinuadosList) {
      motivosDescontinuacao[c.motivoDescontinuacao] = (motivosDescontinuacao[c.motivoDescontinuacao] ?? 0) + 1
    }
    const tempoMedioAteDescontinuacao = avg(consultoresRaw
      .filter(c => !CONS_ATIVOS_SET.has(c.estatuto) && c.dataPrimeiraCall)
      .map(c => {
        const dataFim = c.dataFollowUp || c.dataProximoFollowUp
        return daysBetween(c.dataPrimeiraCall, dataFim)
      })
      .filter(v => v != null && v > 0 && v < 365))

    const trackerMotivosPerda = {
      imoveis: {
        top3: motivosPorPct.slice(0, 3),
        todosPorPct: motivosPorPct,
        faseMediaDescarte: Object.entries(faseDescarte).map(([fase, count]) => ({ fase, count })).sort((a,b) => b.count - a.count),
        taxaDescarte: leadsGerados > 0 ? round2(imoveisDescartados.length / leadsGerados * 100) : 0,
      },
      investidores: {
        motivosNaoAprovacao: Object.entries(motivosNaoAprovacao).map(([motivo, count]) => ({ motivo, count })).sort((a,b) => b.count - a.count),
        motivosInatividade: Object.entries(motivosInatividade).map(([motivo, count]) => ({ motivo, count })).sort((a,b) => b.count - a.count),
      },
      consultores: {
        motivosDescontinuacao: Object.entries(motivosDescontinuacao).map(([motivo, count]) => ({ motivo, count })).sort((a,b) => b.count - a.count),
        descontinuadosVsAtivos: descontinuadosVsAtivos,
        tempoMedioAteDescontinuacao, metaTempo: 30,
      },
    }

    // ── 2.4 VOLUME DE ATIVIDADES ─────────────────────────────────

    // Semana atual e mês atual
    const imAddSemana = imoveis.filter(i => isThisWeek(i.dataAdicionado)).length
    const imAddMes = imoveisDoMes.length
    const imChamadasSemana = imoveis.filter(i => isThisWeek(i.dataChamada)).length
    const imChamadasMes = imoveis.filter(i => isMonth(i.dataChamada, ano, month)).length
    const imVisitasSemana = imoveis.filter(i => isThisWeek(i.dataVisita)).length
    const imVisitasMes = imoveis.filter(i => isMonth(i.dataVisita, ano, month)).length
    const imEstudosMes = imoveis.filter(i => isMonth(i.dataEstudoMercado, ano, month)).length
    const imPropostasMes = imoveis.filter(i => isMonth(i.dataProposta, ano, month)).length
    const imFollowUpAtivos = imoveis.filter(i => i.estado === 'Follow UP').length

    // Investidores volume
    const invNovosContactadosSemana = investidores.filter(i => isThisWeek(i.dataPrimeiroContacto)).length
    const invReunioesSemana = investidores.filter(i => isThisWeek(i.dataReuniao)).length
    const invSemContacto30d = investidores.filter(i => {
      const ult = i.dataUltimoContacto || i.dataReuniao || i.dataPrimeiroContacto
      if (!ult) return true
      return Math.floor((now - new Date(ult)) / 86400000) > 30
    }).length

    // Consultores volume
    const consFollowUpsSemana = consultoresRaw.filter(c => isThisWeek(c.dataFollowUp)).length
    const consSemContacto15d = consultoresRaw.filter(c => {
      if (!CONS_ATIVOS_SET.has(c.estatuto)) return false
      const ult = c.dataProximoFollowUp || c.dataFollowUp
      if (!ult) return true
      return Math.floor((now - new Date(ult)) / 86400000) > 15
    }).length
    const consAtivosFollowUpEmDia = consultoresRaw.filter(c => {
      if (!CONS_ATIVOS_SET.has(c.estatuto)) return false
      if (!c.dataProximoFollowUp) return false
      return new Date(c.dataProximoFollowUp) >= now
    }).length

    const trackerVolume = {
      imoveis: {
        addSemana: imAddSemana, metaAddSemana: 10,
        addMes: imAddMes,
        chamadasSemana: imChamadasSemana, metaChamadasSemana: 8,
        chamadasMes: imChamadasMes,
        visitasSemana: imVisitasSemana, metaVisitasSemana: 2,
        visitasMes: imVisitasMes,
        estudosMes: imEstudosMes, metaEstudosMes: 1,
        propostasMes: imPropostasMes, metaPropostasMes: 1,
        followUpAtivos: imFollowUpAtivos, metaFollowUpAtivos: 5,
      },
      investidores: {
        novosContactadosSemana: invNovosContactadosSemana, metaNovos: 3,
        reunioesSemana: invReunioesSemana, metaReunioes: 2,
        semContacto30d: invSemContacto30d, metaSemContacto: 0,
      },
      consultores: {
        followUpsSemana: consFollowUpsSemana, metaFollowUps: 10,
        semContacto15d: consSemContacto15d, metaSemContacto: 0,
        ativosFollowUpEmDia: consAtivosFollowUpEmDia, metaAtivosEmDia: 5,
      },
    }

    // ── 3.1 LTV ─────────────────────────────────────────────────

    // Investidores LTV
    const ltvInvestidores = investidores
      .filter(i => i.montanteInvestido > 0)
      .map(i => ({
        nome: i.nome, ltv: i.montanteInvestido, negocios: i.numeroNegocios,
        status: i.status, classificacao: i.classificacao,
        roiInvestidor: i.roiInvestidor, roiAnualizado: i.roiAnualizadoInvestidor,
      }))
      .sort((a,b) => b.ltv - a.ltv)
    const ltvAcumulado = round2(investidores.reduce((s,i) => s + i.montanteInvestido, 0))
    const capitalMobilizado = ltvAcumulado

    // Consultores LTV
    const ltvConsultores = consultoresRaw
      .filter(c => c.lucroGerado > 0)
      .map(c => ({ nome: c.nome, ltv: c.lucroGerado, estatuto: c.estatuto, classificacao: c.classificacao }))
      .sort((a,b) => b.ltv - a.ltv)

    const trackerLTV = {
      investidores: {
        porInvestidor: ltvInvestidores, metaLTV: 25000,
        ltvAcumulado, capitalMobilizado,
      },
      consultores: {
        porConsultor: ltvConsultores, metaLTV: 8000,
        top5: ltvConsultores.slice(0, 5),
      },
    }

    // ── 3.2 TAXA DE RECOMPRA ─────────────────────────────────────

    const invQueReinvestiram = investidores.filter(i => i.numeroNegocios > 1)
    const nReinvestiram2026 = invQueReinvestiram.filter(i =>
      isYear(i.dataCapitalTransferido, 2026) || isYear(i.dataAprovacaoNegocio, 2026)
    ).length
    const consCom2Negocios = consultoresRaw.filter(c => c.lucroGerado > 0 && c.imoveisEnviados >= 2)

    const trackerRecompra = {
      investidores: {
        nReinvestiram: invQueReinvestiram.length,
        nReinvestiram2026, metaReinvestiram: 1,
      },
      consultores: {
        pctCom2Negocios: consultoresRaw.length > 0 ? round2(consCom2Negocios.length / consultoresRaw.length * 100) : null,
        nCom2Negocios: consCom2Negocios.length, metaN: 2,
      },
    }

    // ── 3.3 CHURN RATE ───────────────────────────────────────────

    const invInativosSem60d = investidores.filter(i => {
      if (ESTADOS_PARCERIA.has(i.status)) return false
      const ult = i.dataUltimoContacto || i.dataReuniao || i.dataPrimeiroContacto
      if (!ult) return false
      return Math.floor((now - new Date(ult)) / 86400000) > 60
    }).length

    const invPerdidos = investidores.filter(i =>
      i.motivoInatividade || i.motivoNaoAprovacao
    ).length

    const consPctDescontinuados = consultoresRaw.length > 0
      ? round2(consDescontinuados / consultoresRaw.length * 100) : null
    const consInativosMais30d = consultoresRaw.filter(c => {
      if (!CONS_ATIVOS_SET.has(c.estatuto)) return false
      const ult = c.dataProximoFollowUp || c.dataFollowUp
      if (!ult) return true
      return Math.floor((now - new Date(ult)) / 86400000) > 30
    }).length

    const trackerChurn = {
      investidores: {
        inativosSem60d: invInativosSem60d, metaInativos: 0,
        perdidosPeriodo: invPerdidos,
        motivoMaisFrequente: Object.entries(motivosInatividade).sort((a,b) => b[1] - a[1])[0]?.[0] || null,
      },
      consultores: {
        pctDescontinuados: consPctDescontinuados, metaPct: 60,
        inativosMais30d: consInativosMais30d, metaInativos: 0,
        tempoMedioAteDescontinuacao, metaTempo: 30,
        motivoMaisFrequente: Object.entries(motivosDescontinuacao).sort((a,b) => b[1] - a[1])[0]?.[0] || null,
      },
    }

    // ════════════════════════════════════════════════════════════
    // KPIs AVANÇADOS — Métricas em falta identificadas na análise
    // ════════════════════════════════════════════════════════════

    // ── Pipeline Velocity ──
    // (N.º deals × ticket médio × win rate) / ciclo em dias
    const ticketMedioGlobal = negocios.length > 0
      ? round2(negocios.reduce((s,n) => s + (n.lucroEstimado || 0), 0) / negocios.length) : 0
    const winRate = negocios.length > 0
      ? round2(negocios.filter(n => n.fase === 'Vendido').length / negocios.length * 100) : 0
    const cicloMedioDias = velocidadeCicloCompleto || cicloImLeadToFecho || 60
    const pipelineVelocity = cicloMedioDias > 0 && negocios.length > 0
      ? round2((negocios.length * ticketMedioGlobal * (winRate / 100)) / cicloMedioDias) : null

    // ── Lead Response Time ──
    // Tempo entre data adicionado e primeira acção (chamada, visita, estudo)
    const leadResponseTimes = imoveis.map(i => {
      if (!i.dataAdicionado) return null
      const primeiraAccao = [i.dataChamada, i.dataVisita, i.dataEstudoMercado].filter(Boolean).sort()[0]
      if (!primeiraAccao) return null
      return daysBetween(i.dataAdicionado, primeiraAccao)
    }).filter(v => v != null && v >= 0 && v < 365)
    const leadResponseTimeMedio = avg(leadResponseTimes)
    const leadResponseTimeSemana = avg(imoveis
      .filter(i => isThisWeek(i.dataAdicionado))
      .map(i => {
        const primeiraAccao = [i.dataChamada, i.dataVisita].filter(Boolean).sort()[0]
        return primeiraAccao ? daysBetween(i.dataAdicionado, primeiraAccao) : null
      }).filter(v => v != null && v >= 0))
    const leadsNaoContactados = imoveis.filter(i =>
      i.dataAdicionado && !i.dataChamada && !i.dataVisita &&
      !ESTADOS_NEGATIVOS_SET.has(i.estado)
    ).length

    // ── Deal Qualification Score ──
    // Score automático: ROI estimado × liquidez da zona × spread
    const dealScores = imoveisAtivos.map(i => {
      let score = 0
      // ROI: >20% = 30pts, >10% = 20pts, >0 = 10pts
      if (i.roi > 20) score += 30; else if (i.roi > 10) score += 20; else if (i.roi > 0) score += 10
      // Spread: ask > proposta indica margem
      if (i.askPrice > 0 && i.valorProposta > 0) {
        const spread = (i.askPrice - i.valorProposta) / i.askPrice * 100
        if (spread > 15) score += 20; else if (spread > 5) score += 10
      }
      // Dados completos: cada campo +5pts
      if (i.origem) score += 5
      if (i.zonas?.length > 0) score += 5
      if (i.modeloNegocio) score += 5
      if (i.custoObra > 0) score += 5
      if (i.valorVendaRemodelado > 0) score += 10
      // Estado avançado
      if (ESTADOS_AVANCADOS_SET.has(i.estado)) score += 10
      return { nome: i.nome, estado: i.estado, score, roi: i.roi, modeloNegocio: i.modeloNegocio }
    }).sort((a,b) => b.score - a.score)

    // ── Win/Loss Ratio por Fonte ──
    const winLossPorFonte = {}
    for (const i of imoveis) {
      const origem = i.origem ?? 'Outro'
      if (!winLossPorFonte[origem]) winLossPorFonte[origem] = { total: 0, wins: 0, losses: 0, ativos: 0 }
      winLossPorFonte[origem].total++
      if (ESTADOS_NEGATIVOS_SET.has(i.estado)) winLossPorFonte[origem].losses++
      else winLossPorFonte[origem].ativos++
    }
    // Associar wins via negócios com imóvel ligado
    for (const n of negocios) {
      const imovelRel = imoveis.find(i => n.imovel.includes(i.id))
      if (imovelRel) {
        const origem = imovelRel.origem ?? 'Outro'
        if (winLossPorFonte[origem]) winLossPorFonte[origem].wins++
      }
    }
    const winLossBySource = Object.entries(winLossPorFonte).map(([fonte, v]) => ({
      fonte, total: v.total, wins: v.wins, losses: v.losses, ativos: v.ativos,
      winRate: v.total > 0 ? round2(v.wins / v.total * 100) : 0,
      lossRate: v.total > 0 ? round2(v.losses / v.total * 100) : 0,
    })).sort((a,b) => b.winRate - a.winRate)

    // ── Consultant Activation Rate (real — últimos 30 dias) ──
    const consEnviaramUltimos30d = consultoresRaw.filter(c => {
      // Consultor que teve actividade nos últimos 30 dias
      const datas = [c.dataFollowUp, c.dataProximoFollowUp, c.dataPrimeiraCall].filter(Boolean)
      return datas.some(d => daysBetween(d, now.toISOString().slice(0,10)) != null &&
        Math.abs(daysBetween(d, now.toISOString().slice(0,10))) <= 30)
    }).length
    const consultantActivationRate = consultoresRaw.length > 0
      ? round2(consEnviaramUltimos30d / consultoresRaw.length * 100) : null

    // ── Follow-up Effectiveness ──
    // % de investidores com follow-up que avançaram de fase
    const invComFollowUp = investidores.filter(i => i.dataUltimoContacto).length
    const invQueAvancaram = investidores.filter(i =>
      i.dataUltimoContacto && ESTADOS_PROPOSTA_INV.has(i.status)
    ).length
    const followUpEffectivenessInv = invComFollowUp > 0
      ? round2(invQueAvancaram / invComFollowUp * 100) : null

    const consComFollowUp = consultoresRaw.filter(c => c.dataFollowUp).length
    const consQueAvancaram = consultoresRaw.filter(c =>
      c.dataFollowUp && CONS_EM_PARCERIA.has(c.estatuto)
    ).length
    const followUpEffectivenessCons = consComFollowUp > 0
      ? round2(consQueAvancaram / consComFollowUp * 100) : null

    // ── Zona / Geography Performance ──
    const zonaPerformance = {}
    for (const i of imoveis) {
      const z = i.zonas?.[0] || i.zona || 'Sem zona'
      if (!zonaPerformance[z]) zonaPerformance[z] = {
        total: 0, ativos: 0, descartados: 0, comDeal: 0,
        roiTotal: 0, roiCount: 0, askTotal: 0, cicloTotal: 0, cicloCount: 0,
      }
      zonaPerformance[z].total++
      if (ESTADOS_NEGATIVOS_SET.has(i.estado)) zonaPerformance[z].descartados++
      else zonaPerformance[z].ativos++
      if (i.roi > 0) { zonaPerformance[z].roiTotal += i.roi; zonaPerformance[z].roiCount++ }
      if (i.askPrice > 0) zonaPerformance[z].askTotal += i.askPrice
      const ciclo = daysBetween(i.dataAdicionado, i.dataPropostaAceite || i.dataProposta)
      if (ciclo && ciclo > 0 && ciclo < 365) { zonaPerformance[z].cicloTotal += ciclo; zonaPerformance[z].cicloCount++ }
    }
    // Associar deals por zona
    for (const n of negocios) {
      const imovelRel = imoveis.find(i => n.imovel.includes(i.id))
      if (imovelRel) {
        const z = imovelRel.zonas?.[0] || imovelRel.zona || 'Sem zona'
        if (zonaPerformance[z]) zonaPerformance[z].comDeal++
      }
    }
    const zonaStats = Object.entries(zonaPerformance).map(([zona, v]) => ({
      zona, total: v.total, ativos: v.ativos, descartados: v.descartados, comDeal: v.comDeal,
      roiMedio: v.roiCount > 0 ? round2(v.roiTotal / v.roiCount) : null,
      askMedio: v.total > 0 ? round2(v.askTotal / v.total) : null,
      cicloMedio: v.cicloCount > 0 ? round2(v.cicloTotal / v.cicloCount) : null,
      winRate: v.total > 0 ? round2(v.comDeal / v.total * 100) : 0,
      taxaDescarte: v.total > 0 ? round2(v.descartados / v.total * 100) : 0,
    })).filter(z => z.total > 0).sort((a,b) => b.total - a.total)

    // ── CAC por Cohort Mensal ──
    const cacCohort = {}
    for (const i of imoveis) {
      if (!i.dataAdicionado) continue
      const m = i.dataAdicionado.substring(0, 7)
      if (!cacCohort[m]) cacCohort[m] = { leads: 0, chamadas: 0, visitas: 0, propostas: 0, fechos: 0 }
      cacCohort[m].leads++
      if (i.dataChamada) cacCohort[m].chamadas++
      if (i.dataVisita) cacCohort[m].visitas++
      if (i.dataProposta) cacCohort[m].propostas++
    }
    for (const n of negocios) {
      const imovelRel = imoveis.find(i => n.imovel.includes(i.id))
      if (imovelRel?.dataAdicionado) {
        const m = imovelRel.dataAdicionado.substring(0, 7)
        if (cacCohort[m]) cacCohort[m].fechos++
      }
    }
    const cacPorCohort = Object.entries(cacCohort).map(([mes, v]) => ({
      mes, ...v,
      custoMes: burnRateMensal,
      cacPorLead: v.leads > 0 ? round2(burnRateMensal / v.leads) : null,
      cacPorDeal: v.fechos > 0 ? round2(burnRateMensal / v.fechos) : null,
      taxaConversao: v.leads > 0 ? round2(v.fechos / v.leads * 100) : 0,
    })).sort((a,b) => a.mes.localeCompare(b.mes))

    // ── RE Financial Metrics ──
    // Cash-on-Cash Return (retorno sobre capital próprio)
    // IRR simplificado, Equity Multiple
    const reFinancials = negocios.map(n => {
      const imovelRel = imoveis.find(i => n.imovel.includes(i.id))
      const capitalProprio = (imovelRel?.askPrice || 0) + (n.custoRealObra || imovelRel?.custoObra || 0) - (n.capitalTotal || 0)
      const lucro = n.lucroReal || n.lucroEstimado || 0
      const cashOnCash = capitalProprio > 0 ? round2(lucro / capitalProprio * 100) : null
      // Holding em meses
      const holdingDays = daysBetween(n.dataCompra || n.data, n.dataVenda || now.toISOString().slice(0,10))
      const holdingMonths = holdingDays ? round2(holdingDays / 30.44) : null
      // IRR simplificado (anualizado)
      const irr = cashOnCash != null && holdingMonths && holdingMonths > 0
        ? round2(Math.pow(1 + cashOnCash / 100, 12 / holdingMonths) * 100 - 100) : null
      // Equity Multiple
      const equityMultiple = capitalProprio > 0 ? round2((capitalProprio + lucro) / capitalProprio) : null
      // DPI (Distributions to Paid-In) — para investidores
      const dpi = n.capitalTotal > 0 && n.lucroReal > 0
        ? round2(n.lucroReal / n.capitalTotal) : null
      return {
        movimento: n.movimento, categoria: n.categoria, fase: n.fase,
        capitalProprio: round2(capitalProprio), capitalPassivo: n.capitalTotal,
        lucro, cashOnCash, holdingMonths, irr, equityMultiple, dpi,
      }
    })

    // ── Weekly Activity Score (Leading Indicators) ──
    const weeklyActivity = {
      imoveisAdicionados: { valor: imAddSemana, meta: 10 },
      chamadasFeitas: { valor: imChamadasSemana, meta: 8 },
      visitasRealizadas: { valor: imVisitasSemana, meta: 2 },
      followUpsInvestidores: { valor: investidores.filter(i => isThisWeek(i.dataUltimoContacto)).length, meta: 5 },
      followUpsConsultores: { valor: consFollowUpsSemana, meta: 10 },
      reunioesInvestidores: { valor: invReunioesSemana, meta: 2 },
    }
    const weeklyScore = (() => {
      const items = Object.values(weeklyActivity)
      const totalPct = items.reduce((s, i) => s + Math.min(100, Math.round(i.valor / i.meta * 100)), 0)
      return round2(totalPct / items.length)
    })()

    // ── OKRs Q2 2026 ──
    const okrs = [
      {
        objectivo: 'Fechar o primeiro deal WH',
        krs: [
          { kr: '10 imóveis adicionados/semana × 4 semanas', valor: imAddSemana, meta: 10, unidade: '/sem', tipo: 'semanal' },
          { kr: '4 visitas realizadas', valor: imComVisita, meta: 4, unidade: '', tipo: 'acumulado' },
          { kr: '2 propostas enviadas', valor: imComProposta, meta: 2, unidade: '', tipo: 'acumulado' },
          { kr: '1 contrato assinado', valor: contratosAssinados, meta: 1, unidade: '', tipo: 'acumulado' },
        ],
      },
      {
        objectivo: 'Captar primeiro capital passivo',
        krs: [
          { kr: 'Contactar 20 investidores sem contacto >30d', valor: Math.max(0, 20 - invSemContacto30d), meta: 20, unidade: '', tipo: 'acumulado' },
          { kr: '3 reuniões com investidores A/B', valor: investidores.filter(i => i.classificacao.some(c => ['A','B'].includes(c)) && i.dataReuniao).length, meta: 3, unidade: '', tipo: 'acumulado' },
          { kr: '1 NDA assinado', valor: investidores.filter(i => i.ndaAssinado).length, meta: 1, unidade: '', tipo: 'acumulado' },
          { kr: '1 transferência de capital', valor: comCapital, meta: 1, unidade: '', tipo: 'acumulado' },
        ],
      },
      {
        objectivo: 'Activar rede de consultores',
        krs: [
          { kr: '10 follow-ups/semana × 4 semanas', valor: consFollowUpsSemana, meta: 10, unidade: '/sem', tipo: 'semanal' },
          { kr: '5 consultores com follow-up em dia', valor: consAtivosFollowUpEmDia, meta: 5, unidade: '', tipo: 'acumulado' },
          { kr: '2 imóveis via consultores/mês', valor: imoveis.filter(i => i.nomeConsultor && isMonth(i.dataAdicionado, ano, month)).length, meta: 2, unidade: '/mês', tipo: 'mensal' },
          { kr: 'Data Primeira Call em consultores ativos', valor: consultoresRaw.filter(c => CONS_ATIVOS_SET.has(c.estatuto) && c.dataPrimeiraCall).length, meta: consAtivos, unidade: '', tipo: 'acumulado' },
        ],
      },
      {
        objectivo: 'Disciplina de dados ≥ 80%',
        krs: [
          { kr: '0 motivos descarte "Não registado"', valor: Math.max(0, (motivosDescarte['Não registado'] ?? 0)), meta: 0, unidade: '', tipo: 'zero', invertido: true },
          { kr: '100% imóveis ativos com Modelo Negócio', valor: imoveisAtivos.filter(i => i.modeloNegocio).length, meta: imoveisAtivos.length, unidade: '', tipo: 'acumulado' },
          { kr: '100% investidores A/B com Data Último Contacto', valor: investClassif.filter(i => i.dataUltimoContacto).length, meta: investClassif.length, unidade: '', tipo: 'acumulado' },
        ],
      },
    ]
    // Calculate OKR progress
    for (const okr of okrs) {
      let totalPct = 0
      for (const kr of okr.krs) {
        if (kr.invertido) {
          kr.progresso = kr.valor === 0 ? 100 : 0
        } else {
          kr.progresso = kr.meta > 0 ? Math.min(100, round2(kr.valor / kr.meta * 100)) : 0
        }
        totalPct += kr.progresso
      }
      okr.progresso = round2(totalPct / okr.krs.length)
    }

    const trackerAvancado = {
      pipelineVelocity: { valor: pipelineVelocity, ticketMedio: ticketMedioGlobal, winRate, cicloMedioDias },
      leadResponseTime: { medio: leadResponseTimeMedio, semana: leadResponseTimeSemana, naoContactados: leadsNaoContactados, metaDias: 1 },
      dealQualification: dealScores,
      winLossBySource: winLossBySource,
      consultantActivation: { taxa: consultantActivationRate, activosReais: consEnviaramUltimos30d, totalConsultores: consultoresRaw.length },
      followUpEffectiveness: { investidores: followUpEffectivenessInv, consultores: followUpEffectivenessCons },
      zonaPerformance: zonaStats,
      cacCohort: cacPorCohort,
      reFinancials,
      weeklyActivity: { ...weeklyActivity, score: weeklyScore },
      okrs,
    }

    res.json({
      updatedAt: new Date().toISOString(),

      // ── Top KPIs ──
      top: {
        receitaPrevistaMes:   receitaMes,
        dealsFechadosMes:     dealsMes.length,
        capitalPassivoCaptado: capitalCaptado,
        velocidadeMediaCiclo: tempoMedioNegociacao,
        weeklyScore,
      },

      // ── Pipeline 1 — Imóveis ──
      pipeline1: {
        funil: [
          { label: 'Leads gerados',        value: leadsGerados },
          { label: 'Analisados (VVR/CAEP)', value: analisados },
          { label: 'Propostas enviadas',    value: propostasEnviadas },
          { label: 'Contratos assinados',   value: contratosAssinados },
          { label: 'Escrituras concluídas', value: escriturasConcluidas },
        ],
        taxaConversao:        taxaConversaoP1,
        spreadMedio:          spreadMedio,
        descontoMercado:      descontoMercado,
        abaixoLimiarFF:       abaixoLimiar,
        nDueDiligence,
        tempoMedioNegociacao,
        motivosDescarte:      Object.entries(motivosDescarte)
          .map(([motivo, count]) => ({ motivo, count }))
          .sort((a,b) => b.count - a.count),
        descarteOrigem:       descarteOrigemList,
        modeloNegocio:        Object.entries(modeloCount)
          .filter(([,v]) => v > 0)
          .map(([modelo, count]) => ({ modelo, count })),
        imoveisDoMes:         imoveisDoMes.length,
        taxaDescarte:         leadsGerados > 0
          ? round2(imoveisDescartados.length / leadsGerados * 100) : 0,
      },

      // ── Pipeline 2 — Consultores/Equipa (via Faturação) ──
      pipeline2: {
        dealsPorCategoria,
        dealsFechadosMes:    dealsMes.length,
        receitaMes,
        margemWholesaling,
        margemFF,
        holdingMedio,
        pctDealsCapitalPassivo,
        totalDeals:          negocios.length,
        dealsFechados:       negocios.filter(n => n.fase === 'Vendido').length,
        taxaRealizacao:      negocios.length > 0
          ? round2(negocios.filter(n=>n.fase==='Vendido').length / negocios.length * 100) : 0,
      },

      // ── Pipeline 3 — Investidores ──
      pipeline3: {
        funil: [
          { label: 'Contactos prospetados', value: total },
          { label: 'Reunião realizada',      value: comReuniao },
          { label: 'Proposta enviada',       value: comProposta },
          { label: 'Contrato / NDA',         value: comNDA },
          { label: 'Capital transferido',    value: comCapital },
        ],
        capitalCaptado,
        investidoresAtivos:   emParceria.length,
        ticketMedio,
        taxaConversao:        taxaConversaoInv,
        taxaRetencao,
        roiEntregue,
        tempoMedioCaptacao,
        capitalDisponivel,
        capitalAlocado,
        ratioCaptacaoAlocacao: capitalDisponivel > 0
          ? round2(capitalAlocado / capitalDisponivel * 100) : null,
        investEmPipeline,
        ltvTop5:              ltvPorInvestidor.slice(0, 5),
      },

      // ── Transversais ──
      transversal: {
        ratioDealFlowCapital,
        pctDealsCapitalPassivo,
        velocidadeCicloCompleto,
        roe,
        dealsSilmultaneos,
        cumpreProjeccao,
        margemWholesaling,
        margemFF,
        pipelineValue,
        capitalDisponivel,
      },

      // ── Tracker KPIs (1.1 a 3.3) ──
      tracker: {
        receita:       trackerReceita,
        conversao:     trackerConversao,
        ticketMedio:   trackerTicketMedio,
        margem:        trackerMargem,
        cac:           trackerCAC,
        ciclo:         trackerCiclo,
        motivosPerda:  trackerMotivosPerda,
        volume:        trackerVolume,
        ltv:           trackerLTV,
        recompra:      trackerRecompra,
        churn:         trackerChurn,
      },

      // ── KPIs Avançados + OKRs ──
      avancado: trackerAvancado,
    })
  } catch (err) {
    console.error('[metricas]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// GOOGLE CALENDAR — Leitura e escrita de eventos
// ════════════════════════════════════════════════════════════════
let gcal = null
try {
  const { readFileSync, existsSync } = await import('fs')
  const { google } = await import('googleapis')

  const serviceCredPath = path.join(__dirname, 'google-credentials.json')
  const oauthCredPath = path.join(__dirname, 'google-oauth.json')
  const tokenPath = path.join(__dirname, 'google-token.json')

  const saScopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ]

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    // Service Account via env var (Render produção)
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim()
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    const creds = JSON.parse(json)
    const gAuth = new google.auth.GoogleAuth({ credentials: creds, scopes: saScopes })
    gcal = google.calendar({ version: 'v3', auth: gAuth })
    console.log('[gcal] Google Calendar conectado (Service Account env)')
  } else if (existsSync(serviceCredPath)) {
    // Service Account auth via ficheiro (local dev)
    const creds = JSON.parse(readFileSync(serviceCredPath, 'utf8'))
    const gAuth = new google.auth.GoogleAuth({ credentials: creds, scopes: saScopes })
    gcal = google.calendar({ version: 'v3', auth: gAuth })
    console.log('[gcal] Google Calendar conectado (Service Account ficheiro)')
  } else if (existsSync(oauthCredPath) && existsSync(tokenPath)) {
    // OAuth2 auth via ficheiros (local dev)
    const oauthCreds = JSON.parse(readFileSync(oauthCredPath, 'utf8'))
    const { client_id, client_secret } = oauthCreds.installed || oauthCreds.web
    const oauth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333')
    const tokens = JSON.parse(readFileSync(tokenPath, 'utf8'))
    oauth2.setCredentials(tokens)
    oauth2.on('tokens', (newTokens) => {
      const merged = { ...tokens, ...newTokens }
      import('fs').then(fs => {
        try { fs.writeFileSync(tokenPath, JSON.stringify(merged, null, 2)) } catch {}
      })
    })
    gcal = google.calendar({ version: 'v3', auth: oauth2 })
    console.log('[gcal] Google Calendar conectado (OAuth2 ficheiros)')
  } else {
    // OAuth2 via env vars (Render produção)
    const { getGoogleAuth } = await import('./src/db/googleAuth.js')
    const auth = getGoogleAuth()
    if (!auth) {
      throw new Error('Sem credenciais: nem ficheiros nem GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN definidos')
    }
    gcal = google.calendar({ version: 'v3', auth })
    console.log('[gcal] Google Calendar conectado (OAuth2 env)')
  }
} catch (e) {
  console.warn('[gcal] Google Calendar não disponível:', e.message)
}

const GCAL_ID = process.env.GOOGLE_CALENDAR_ID || 'somniumprs@gmail.com'

app.get('/api/calendar/status', async (req, res) => {
  const status = {
    gcal_ok: !!gcal,
    calendar_id: GCAL_ID,
    credentials_source: null,
  }
  const { existsSync } = await import('fs')
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) status.credentials_source = 'service_account_env'
  else if (existsSync(path.join(__dirname, 'google-credentials.json'))) status.credentials_source = 'service_account_file'
  else if (existsSync(path.join(__dirname, 'google-token.json'))) status.credentials_source = 'oauth2_file'
  else if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) status.credentials_source = 'oauth2_env'
  else status.credentials_source = 'missing'

  if (gcal) {
    try {
      const r = await gcal.events.list({ calendarId: GCAL_ID, maxResults: 1 })
      status.can_read = true
      status.sample_count = r.data.items?.length ?? 0
    } catch (e) {
      status.can_read = false
      status.read_error = e.message
    }

    // Identificar a conta OAuth2 autenticada
    try {
      const { google } = await import('googleapis')
      const oauth2 = google.oauth2({ version: 'v2', auth: gcal.context._options.auth })
      const info = await oauth2.userinfo.get()
      status.authenticated_as = info.data.email
    } catch {}

    // Metadados do calendário (confirmar acesso de escrita)
    try {
      const cal = await gcal.calendarList.get({ calendarId: GCAL_ID })
      status.calendar_access_role = cal.data.accessRole
      status.calendar_summary = cal.data.summary
    } catch (e) {
      status.calendar_access_error = e.message
    }

    // Estatísticas de tarefas
    try {
      const pgPool = (await import('./src/db/pg.js')).default
      const monday = (() => {
        const d = new Date(); const dow = (d.getDay() + 6) % 7
        d.setDate(d.getDate() - dow); d.setHours(0,0,0,0)
        return d.toISOString().slice(0,10)
      })()
      const { rows: [row] } = await pgPool.query(
        `SELECT
          COUNT(*) FILTER (WHERE inicio IS NOT NULL) AS com_data,
          COUNT(*) FILTER (WHERE inicio IS NOT NULL AND inicio >= $1) AS desta_semana,
          COUNT(*) FILTER (WHERE inicio IS NOT NULL AND inicio >= $1 AND gcal_event_id IS NOT NULL) AS desta_semana_sincronizadas,
          COUNT(*) FILTER (WHERE inicio IS NOT NULL AND inicio >= $1 AND gcal_event_id IS NULL) AS desta_semana_pendentes
         FROM tarefas`,
        [monday]
      )
      status.tarefas = { monday_filter: monday, ...row }
    } catch (e) { status.tarefas_error = e.message }
  }
  res.json(status)
})

// Endpoint publico para forcar backfill + debug (so expoe contagens, nao dados)
app.post('/api/calendar/backfill', async (req, res) => {
  if (!gcal) return res.status(503).json({ error: 'gcal nao configurado' })
  if (process.env.INTERNAL_API_KEY && req.query.key !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ error: 'forbidden' })
  }
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    const { buildEventForDebug, pushTarefaToGCal } = await import('./src/db/calendarSync.js')
    const monday = (() => {
      const d = new Date(); const dow = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - dow); d.setHours(0,0,0,0)
      return d.toISOString().slice(0,10)
    })()
    const sinceDate = req.query.all === '1' ? null : (req.query.since || monday)
    const params = sinceDate ? [sinceDate] : []
    const cond = sinceDate ? ' AND inicio >= $1' : ''
    const { rows } = await pgPool.query(
      `SELECT * FROM tarefas WHERE gcal_event_id IS NULL AND inicio IS NOT NULL${cond}`,
      params
    )

    const log = []
    let created = 0, failed = 0
    for (const t of rows) {
      const entry = {
        id: t.id,
        tarefa: t.tarefa,
        inicio_raw: t.inicio,
        status: t.status,
      }
      // Construir o evento localmente para expor erro detalhado
      let inicio = t.inicio instanceof Date ? t.inicio.toISOString() : String(t.inicio || '')
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inicio)) inicio += ':00'
      const isDiaInteiro = /^\d{4}-\d{2}-\d{2}$/.test(inicio)
      let fim = t.fim instanceof Date ? t.fim.toISOString() : (t.fim ? String(t.fim) : null)
      if (fim && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fim)) fim += ':00'
      if (!fim && !isDiaInteiro) {
        fim = new Date(new Date(inicio).getTime() + ((t.tempo_horas || 1) * 3600000)).toISOString()
      }
      const resource = isDiaInteiro
        ? { summary: t.tarefa, description: t.funcionario ? `Funcionário: ${t.funcionario}` : '',
            start: { date: inicio }, end: { date: (fim || inicio).slice(0, 10) } }
        : { summary: t.tarefa, description: t.funcionario ? `Funcionário: ${t.funcionario}` : '',
            start: { dateTime: inicio, timeZone: 'Europe/Lisbon' },
            end: { dateTime: fim, timeZone: 'Europe/Lisbon' } }
      entry.resource = resource
      try {
        const r = await gcal.events.insert({ calendarId: GCAL_ID, resource })
        const eventId = r.data.id
        await pgPool.query(
          'UPDATE tarefas SET gcal_event_id = $1, gcal_synced_at = $2 WHERE id = $3',
          [eventId, new Date().toISOString(), t.id]
        )
        created++; entry.result = 'created'; entry.eventId = eventId
      } catch (e) {
        failed++; entry.result = 'error'
        entry.error = e.errors?.[0]?.message || e.response?.data?.error?.message || e.message
        entry.code = e.code
      }
      log.push(entry)
    }
    res.json({ ok: true, sinceDate, candidatos: rows.length, created, failed, log })
  } catch (e) { res.status(500).json({ error: e.message, stack: e.stack }) }
})

// Ler eventos da semana (ou período custom)
app.get('/api/calendar/events', async (req, res) => {
  if (!gcal) return res.json({ events: [], total: 0, gcal_ok: false })
  try {
    const days = parseInt(req.query.days) || 7
    const past = parseInt(req.query.past) || 0
    const now = new Date()
    const timeMin = new Date(now)
    timeMin.setDate(timeMin.getDate() - past)
    const timeMax = new Date(now)
    timeMax.setDate(timeMax.getDate() + days)

    const r = await gcal.events.list({
      calendarId: GCAL_ID,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    })
    const events = (r.data.items ?? []).map(e => ({
      id: e.id,
      titulo: e.summary || '(sem título)',
      descricao: e.description || '',
      inicio: e.start?.dateTime || e.start?.date,
      fim: e.end?.dateTime || e.end?.date,
      diaInteiro: !!e.start?.date && !e.start?.dateTime,
      local: e.location || '',
      link: e.htmlLink,
    }))
    res.json({ events, total: events.length })
  } catch (e) {
    console.error('[gcal] events:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Criar evento no Google Calendar (a partir de uma tarefa)
app.post('/api/calendar/events', async (req, res) => {
  if (!gcal) return res.status(503).json({ error: 'Google Calendar não configurado' })
  try {
    const { titulo, descricao, inicio, fim, diaInteiro } = req.body
    if (!titulo || !inicio) return res.status(400).json({ error: 'titulo e inicio são obrigatórios' })

    const event = {
      summary: titulo,
      description: descricao || '',
    }
    if (diaInteiro) {
      event.start = { date: inicio.slice(0, 10) }
      event.end = { date: (fim || inicio).slice(0, 10) }
    } else {
      event.start = { dateTime: inicio, timeZone: 'Europe/Lisbon' }
      event.end = { dateTime: fim || new Date(new Date(inicio).getTime() + 3600000).toISOString(), timeZone: 'Europe/Lisbon' }
    }

    const r = await gcal.events.insert({ calendarId: GCAL_ID, resource: event })
    res.json({ ok: true, eventId: r.data.id, link: r.data.htmlLink })
  } catch (e) {
    console.error('[gcal] create:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ════════════════════════════════════════════════════════════════
// TAREFAS CRUD DIRECTO (independente do Notion)
// ════════════════════════════════════════════════════════════════
app.get('/api/tarefas', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    const { limit = 100, status, funcionario } = req.query
    let q = 'SELECT * FROM tarefas'
    const params = []
    const conds = []
    if (status) { conds.push(`status = $${params.length + 1}`); params.push(status) }
    if (funcionario) { conds.push(`funcionario ILIKE $${params.length + 1}`); params.push(`%${funcionario}%`) }
    if (conds.length) q += ' WHERE ' + conds.join(' AND ')
    q += ' ORDER BY inicio DESC NULLS LAST LIMIT $' + (params.length + 1)
    params.push(+limit)
    const { rows } = await pgPool.query(q, params)
    res.json({ data: rows, total: rows.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/tarefas', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    const { pushTarefaToGCal } = await import('./src/db/calendarSync.js')
    const { tarefa, status, categoria, inicio, fim, funcionario, tempo_horas } = req.body
    if (!tarefa) return res.status(400).json({ error: 'tarefa é obrigatória' })
    const id = (await import('crypto')).randomUUID()
    const now = new Date().toISOString()
    const horas = tempo_horas || (inicio && fim
      ? round2((new Date(fim) - new Date(inicio)) / 3600000) : 0)
    await pgPool.query(
      `INSERT INTO tarefas (id, tarefa, status, categoria, inicio, fim, funcionario, tempo_horas, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, tarefa, status || 'A fazer', categoria || null, inicio || null, fim || null, funcionario || null, horas, now, now]
    )
    // Sync automático com Google Calendar
    if (inicio) {
      pushTarefaToGCal(gcal, GCAL_ID, { id, tarefa, status: status || 'A fazer', inicio, fim, funcionario, tempo_horas: horas })
        .catch(e => console.error('[gcal-sync] auto-push:', e.message))
    }
    res.status(201).json({ id, tarefa, status: status || 'A fazer', inicio, fim, funcionario, tempo_horas: horas })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/tarefas/:id', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    const { updateGCalEvent, pushTarefaToGCal } = await import('./src/db/calendarSync.js')
    const { tarefa, status, categoria, inicio, fim, funcionario, tempo_horas } = req.body
    const now = new Date().toISOString()
    const horas = tempo_horas || (inicio && fim
      ? round2((new Date(fim) - new Date(inicio)) / 3600000) : undefined)
    const sets = []; const params = []
    if (tarefa !== undefined) { sets.push(`tarefa = $${params.length + 1}`); params.push(tarefa) }
    if (status !== undefined) { sets.push(`status = $${params.length + 1}`); params.push(status) }
    if (categoria !== undefined) { sets.push(`categoria = $${params.length + 1}`); params.push(categoria) }
    if (inicio !== undefined) { sets.push(`inicio = $${params.length + 1}`); params.push(inicio) }
    if (fim !== undefined) { sets.push(`fim = $${params.length + 1}`); params.push(fim) }
    if (funcionario !== undefined) { sets.push(`funcionario = $${params.length + 1}`); params.push(funcionario) }
    if (horas !== undefined) { sets.push(`tempo_horas = $${params.length + 1}`); params.push(horas) }
    sets.push(`updated_at = $${params.length + 1}`); params.push(now)
    params.push(req.params.id)
    const { rowCount } = await pgPool.query(
      `UPDATE tarefas SET ${sets.join(', ')} WHERE id = $${params.length}`, params
    )
    if (!rowCount) return res.status(404).json({ error: 'Não encontrada' })
    // Sync com GCal
    const { rows: [updated] } = await pgPool.query('SELECT * FROM tarefas WHERE id = $1', [req.params.id])
    if (updated) {
      if (updated.gcal_event_id) {
        updateGCalEvent(gcal, GCAL_ID, updated).catch(e => console.error('[gcal-sync]', e.message))
      } else if (updated.inicio) {
        pushTarefaToGCal(gcal, GCAL_ID, updated).catch(e => console.error('[gcal-sync]', e.message))
      }
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/tarefas/:id', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    const { deleteGCalEvent } = await import('./src/db/calendarSync.js')
    // Buscar gcal_event_id antes de apagar
    const { rows: [tarefa] } = await pgPool.query('SELECT gcal_event_id FROM tarefas WHERE id = $1', [req.params.id])
    const { rowCount } = await pgPool.query('DELETE FROM tarefas WHERE id = $1', [req.params.id])
    if (!rowCount) return res.status(404).json({ error: 'Não encontrada' })
    // Apagar evento do GCal
    if (tarefa?.gcal_event_id) {
      deleteGCalEvent(gcal, GCAL_ID, tarefa.gcal_event_id).catch(e => console.error('[gcal-sync]', e.message))
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════════════════════════════
// SYNC BIDIRECIONAL TAREFAS ↔ GOOGLE CALENDAR
// ════════════════════════════════════════════════════════════════

// Helper: segunda-feira da semana corrente em ISO (YYYY-MM-DD)
function mondayOfCurrentWeek() {
  const d = new Date()
  const dow = (d.getDay() + 6) % 7 // 0 = segunda
  d.setDate(d.getDate() - dow)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

// Sync manual bidirecional. ?since=YYYY-MM-DD (default: segunda desta semana). ?all=1 ignora filtro.
app.post('/api/calendar/sync', async (req, res) => {
  try {
    const { pushAllTarefas, pullGCalToTarefas } = await import('./src/db/calendarSync.js')
    const sinceDate = req.query.all === '1' ? undefined : (req.query.since || mondayOfCurrentWeek())
    const push = await pushAllTarefas(gcal, GCAL_ID, { sinceDate })
    const pull = await pullGCalToTarefas(gcal, GCAL_ID, { days: parseInt(req.query.days) || 30 })
    res.json({ ok: true, sinceDate: sinceDate || null, push, pull })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Pull manual (GCal → tarefas)
app.post('/api/calendar/pull', async (req, res) => {
  try {
    const { pullGCalToTarefas } = await import('./src/db/calendarSync.js')
    const result = await pullGCalToTarefas(gcal, GCAL_ID, { days: parseInt(req.query.days) || 30 })
    res.json({ ok: true, ...result })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Auto-sync bidirecional a cada 15 minutos
if (gcal) {
  const GCAL_SYNC_INTERVAL = 15 * 60 * 1000
  async function autoSyncCalendar() {
    try {
      const { pushAllTarefas, pullGCalToTarefas } = await import('./src/db/calendarSync.js')
      const push = await pushAllTarefas(gcal, GCAL_ID, { sinceDate: mondayOfCurrentWeek() })
      const pull = await pullGCalToTarefas(gcal, GCAL_ID, { days: 30 })
      if (push.created || push.updated || pull.created || pull.updated) {
        console.log(`[gcal-sync] Auto: push=${push.created}+${push.updated} pull=${pull.created}+${pull.updated}`)
      }
    } catch (e) {
      console.error('[gcal-sync] Auto erro:', e.message)
    }
  }
  setTimeout(autoSyncCalendar, 30000)
  setInterval(autoSyncCalendar, GCAL_SYNC_INTERVAL)
  console.log('[gcal-sync] Auto-sync bidirecional ativo (a cada 15 min)')
}

// ── Auto-sync Fireflies (a cada 15 min) ──────────────────────
try {
  const { isConfigured } = await import('./src/db/firefliesSync.js')
  if (isConfigured()) {
    const FF_SYNC_INTERVAL = 15 * 60 * 1000
    async function autoSyncFireflies() {
      try {
        const { syncFireflies } = await import('./src/db/firefliesSync.js')
        const { autoFillInvestidor } = await import('./src/db/meetingAnalysis.js')
        const pgPool = (await import('./src/db/pg.js')).default

        const result = await syncFireflies()
        if (result.created > 0) {
          console.log(`[fireflies] Auto-sync: ${result.created} novas reuniões importadas`)

          // Auto-analisar e preencher investidores
          const { rows: novas } = await pgPool.query(
            "SELECT id FROM reunioes WHERE entidade_tipo = 'investidores' AND entidade_id IS NOT NULL AND analise_completa IS NULL ORDER BY created_at DESC LIMIT $1",
            [result.created]
          )
          for (const r of novas) {
            try { await autoFillInvestidor(r.id) } catch {}
          }
          if (novas.length > 0) console.log(`[fireflies] Auto-fill: ${novas.length} investidores actualizados`)
        }
      } catch (e) {
        console.error('[fireflies] Auto-sync erro:', e.message)
      }
    }
    setTimeout(autoSyncFireflies, 60000) // primeiro sync 1 min após arranque
    setInterval(autoSyncFireflies, FF_SYNC_INTERVAL + Math.random() * 30000) // jitter até 30s
    console.log('[fireflies] Auto-sync ativo (a cada 15 min)')
  }
} catch (e) {
  console.warn('[fireflies] Auto-sync não disponível:', e.message)
}

// ── Auto-sync Google Forms (a cada 15 min) ───────────────────
try {
  const { isConfigured: formsConfigured, syncForms } = await import('./src/db/formsSync.js')
  if (formsConfigured()) {
    const FORMS_SYNC_INTERVAL = 15 * 60 * 1000
    async function autoSyncForms() {
      try {
        const result = await syncForms()
        if (result.created > 0 || result.updated > 0) {
          console.log(`[forms] Auto-sync: ${result.created} novos, ${result.updated} actualizados, ${result.skipped} inalterados`)
        }
      } catch (e) {
        console.error('[forms] Auto-sync erro:', e.message)
      }
    }
    setTimeout(autoSyncForms, 180000) // 3 min após arranque (staggered)
    setInterval(autoSyncForms, FORMS_SYNC_INTERVAL + Math.random() * 30000) // jitter até 30s
    console.log('[forms] Auto-sync Google Forms ativo (a cada 15 min)')
  }
} catch (e) {
  console.warn('[forms] Auto-sync não disponível:', e.message)
}

// ════════════════════════════════════════════════════════════════
// OKRs — Objectivos e Key Results editáveis
// ════════════════════════════════════════════════════════════════

// Listar OKRs com KRs e progresso calculado
app.get('/api/okrs', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    const { trimestre } = req.query
    let q = 'SELECT * FROM okrs'
    const params = []
    if (trimestre) { q += ' WHERE trimestre = $1'; params.push(trimestre) }
    q += ' ORDER BY ordem, created_at'
    const { rows: okrs } = await pgPool.query(q, params)

    if (okrs.length === 0) return res.json([])

    // Buscar TODOS os KRs de uma vez (fix N+1)
    const okrIds = okrs.map(o => o.id)
    const { rows: allKrs } = await pgPool.query(
      'SELECT * FROM okr_krs WHERE okr_id = ANY($1) ORDER BY ordem, created_at',
      [okrIds]
    )

    // Pre-calcular todas as fontes de uma vez
    const fontes = [...new Set(allKrs.map(kr => kr.fonte).filter(Boolean))]
    const fonteValues = await calcAllKRValues(fontes, pgPool)

    // Agrupar KRs por OKR e calcular progresso
    const krsByOkr = {}
    for (const kr of allKrs) {
      kr.valor = fonteValues[kr.fonte] ?? 0
      if (kr.invertido) {
        kr.progresso = kr.valor === 0 ? 100 : Math.max(0, Math.round((1 - kr.valor / kr.meta) * 100))
      } else {
        kr.progresso = kr.meta > 0 ? Math.min(100, Math.round(kr.valor / kr.meta * 100)) : 0
      }
      if (!krsByOkr[kr.okr_id]) krsByOkr[kr.okr_id] = []
      krsByOkr[kr.okr_id].push(kr)
    }

    for (const okr of okrs) {
      okr.krs = krsByOkr[okr.id] || []
      okr.progresso = okr.krs.length > 0 ? Math.round(okr.krs.reduce((s, kr) => s + kr.progresso, 0) / okr.krs.length) : 0
    }
    res.json(okrs)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Mapa fonte → query SQL
const KR_FONTE_QUERIES = {
  imoveis_semana: "SELECT COUNT(*) as c FROM imoveis WHERE data_adicionado >= NOW() - INTERVAL '7 days'",
  imoveis_com_visita: "SELECT COUNT(*) as c FROM imoveis WHERE data_visita IS NOT NULL",
  imoveis_com_proposta: "SELECT COUNT(*) as c FROM imoveis WHERE data_proposta IS NOT NULL",
  negocios_total: "SELECT COUNT(*) as c FROM negocios",
  negocios_vendidos: "SELECT COUNT(*) as c FROM negocios WHERE fase = 'Vendido'",
  investidores_sem_contacto_30d: "SELECT COUNT(*) as c FROM investidores WHERE data_ultimo_contacto IS NULL OR data_ultimo_contacto < NOW() - INTERVAL '30 days'",
  investidores_ab_reuniao: "SELECT COUNT(*) as c FROM investidores WHERE classificacao IN ('A','B') AND data_reuniao IS NOT NULL",
  investidores_nda: "SELECT COUNT(*) as c FROM investidores WHERE nda_assinado = 1",
  investidores_capital: "SELECT COUNT(*) as c FROM investidores WHERE montante_investido > 0",
  consultores_followup_semana: "SELECT COUNT(*) as c FROM consultores WHERE data_follow_up >= NOW() - INTERVAL '7 days'",
  consultores_followup_em_dia: "SELECT COUNT(*) as c FROM consultores WHERE data_proximo_follow_up >= NOW() AND estatuto IN ('Aberto Parcerias','Follow up','Acesso imoveis Off market','Consultores em Parceria')",
  consultores_com_call: "SELECT COUNT(*) as c FROM consultores WHERE data_primeira_call IS NOT NULL AND estatuto IN ('Aberto Parcerias','Follow up','Acesso imoveis Off market','Consultores em Parceria')",
  consultores_ativos: "SELECT COUNT(*) as c FROM consultores WHERE estatuto IN ('Aberto Parcerias','Follow up','Acesso imoveis Off market','Consultores em Parceria')",
  imoveis_sem_modelo: "SELECT COUNT(*) as c FROM imoveis WHERE (modelo_negocio IS NULL OR modelo_negocio = '') AND estado NOT IN ('Descartado','Nao interessa','Não interessa')",
  imoveis_com_modelo: "SELECT COUNT(*) as c FROM imoveis WHERE modelo_negocio IS NOT NULL AND modelo_negocio != '' AND estado NOT IN ('Descartado','Nao interessa','Não interessa')",
  imoveis_ativos: "SELECT COUNT(*) as c FROM imoveis WHERE estado NOT IN ('Descartado','Nao interessa','Não interessa')",
  investidores_ab_contacto: "SELECT COUNT(*) as c FROM investidores WHERE classificacao IN ('A','B') AND data_ultimo_contacto IS NOT NULL",
  investidores_ab_total: "SELECT COUNT(*) as c FROM investidores WHERE classificacao IN ('A','B')",
}

// Calcular TODOS os valores de KR em batch (uma query por fonte única)
async function calcAllKRValues(fontes, pgPool) {
  const results = {}
  await Promise.all(fontes.map(async (fonte) => {
    const sql = KR_FONTE_QUERIES[fonte]
    if (!sql) { results[fonte] = 0; return }
    try {
      const { rows } = await pgPool.query(sql)
      results[fonte] = parseInt(rows[0].c)
    } catch { results[fonte] = 0 }
  }))
  return results
}

// Legacy single KR calc (kept for backward compat)
async function calcKRValue(kr, pgPool) {
  if (!kr.fonte) return 0
  const values = await calcAllKRValues([kr.fonte], pgPool)
  return values[kr.fonte] ?? 0
}

// Criar OKR
app.post('/api/okrs', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    const { trimestre, objectivo, ordem, krs } = req.body
    if (!trimestre || !objectivo) return res.status(400).json({ error: 'trimestre e objectivo são obrigatórios' })
    const id = (await import('crypto')).randomUUID()
    const now = new Date().toISOString()
    await pgPool.query('INSERT INTO okrs (id, trimestre, objectivo, ordem, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, trimestre, objectivo, ordem || 0, now, now])

    // Criar KRs se fornecidos
    if (krs?.length) {
      for (let i = 0; i < krs.length; i++) {
        const kr = krs[i]
        const krId = (await import('crypto')).randomUUID()
        await pgPool.query(
          'INSERT INTO okr_krs (id, okr_id, kr, meta, unidade, tipo, fonte, invertido, ordem, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [krId, id, kr.kr, kr.meta || 1, kr.unidade || '', kr.tipo || 'acumulado', kr.fonte || null, kr.invertido || false, i, now, now]
        )
      }
    }
    res.status(201).json({ id, trimestre, objectivo })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Actualizar OKR
app.put('/api/okrs/:id', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    const { objectivo, ordem } = req.body
    const now = new Date().toISOString()
    await pgPool.query('UPDATE okrs SET objectivo = COALESCE($1, objectivo), ordem = COALESCE($2, ordem), updated_at = $3 WHERE id = $4',
      [objectivo, ordem, now, req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Apagar OKR (cascade apaga KRs)
app.delete('/api/okrs/:id', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    await pgPool.query('DELETE FROM okrs WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// CRUD para KRs individuais
app.post('/api/okrs/:okrId/krs', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    const { kr, meta, unidade, tipo, fonte, invertido, ordem } = req.body
    const id = (await import('crypto')).randomUUID()
    const now = new Date().toISOString()
    await pgPool.query(
      'INSERT INTO okr_krs (id, okr_id, kr, meta, unidade, tipo, fonte, invertido, ordem, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [id, req.params.okrId, kr, meta || 1, unidade || '', tipo || 'acumulado', fonte || null, invertido || false, ordem || 0, now, now]
    )
    res.status(201).json({ id })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/okr-krs/:id', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    const { kr, meta, unidade, tipo, fonte, invertido, ordem } = req.body
    const sets = []; const params = []
    if (kr !== undefined) { sets.push(`kr = $${params.length+1}`); params.push(kr) }
    if (meta !== undefined) { sets.push(`meta = $${params.length+1}`); params.push(meta) }
    if (unidade !== undefined) { sets.push(`unidade = $${params.length+1}`); params.push(unidade) }
    if (tipo !== undefined) { sets.push(`tipo = $${params.length+1}`); params.push(tipo) }
    if (fonte !== undefined) { sets.push(`fonte = $${params.length+1}`); params.push(fonte) }
    if (invertido !== undefined) { sets.push(`invertido = $${params.length+1}`); params.push(invertido) }
    if (ordem !== undefined) { sets.push(`ordem = $${params.length+1}`); params.push(ordem) }
    sets.push(`updated_at = $${params.length+1}`); params.push(new Date().toISOString())
    params.push(req.params.id)
    await pgPool.query(`UPDATE okr_krs SET ${sets.join(',')} WHERE id = $${params.length}`, params)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/okr-krs/:id', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    await pgPool.query('DELETE FROM okr_krs WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Fontes disponíveis para auto-cálculo de KRs
app.get('/api/okrs/fontes', async (_req, res) => {
  res.json([
    { id: 'imoveis_semana', label: 'Imóveis adicionados esta semana' },
    { id: 'imoveis_com_visita', label: 'Imóveis com visita realizada' },
    { id: 'imoveis_com_proposta', label: 'Imóveis com proposta enviada' },
    { id: 'imoveis_ativos', label: 'Total imóveis ativos' },
    { id: 'imoveis_com_modelo', label: 'Imóveis com Modelo de Negócio preenchido' },
    { id: 'imoveis_sem_modelo', label: 'Imóveis SEM Modelo de Negócio (invertido)' },
    { id: 'negocios_total', label: 'Total negócios' },
    { id: 'negocios_vendidos', label: 'Negócios vendidos' },
    { id: 'investidores_sem_contacto_30d', label: 'Investidores sem contacto >30d (invertido)' },
    { id: 'investidores_ab_reuniao', label: 'Investidores A/B com reunião' },
    { id: 'investidores_nda', label: 'Investidores com NDA assinado' },
    { id: 'investidores_capital', label: 'Investidores com capital transferido' },
    { id: 'investidores_ab_contacto', label: 'Investidores A/B com contacto recente' },
    { id: 'investidores_ab_total', label: 'Total investidores A/B' },
    { id: 'consultores_followup_semana', label: 'Follow-ups consultores esta semana' },
    { id: 'consultores_followup_em_dia', label: 'Consultores ativos com follow-up em dia' },
    { id: 'consultores_com_call', label: 'Consultores ativos com Data Primeira Call' },
    { id: 'consultores_ativos', label: 'Total consultores ativos' },
    { id: null, label: '(Manual — introduzir valor à mão)' },
  ])
})

// Seed OKRs Q2 2026 se tabela vazia
app.post('/api/okrs/seed-q2', async (req, res) => {
  try {
    const pgPool = (await import('./src/db/pg.js')).default
    const { rows } = await pgPool.query("SELECT COUNT(*) as c FROM okrs WHERE trimestre = 'Q2 2026'")
    if (parseInt(rows[0].c) > 0) return res.json({ ok: true, message: 'OKRs Q2 já existem' })

    const crypto = await import('crypto')
    const now = new Date().toISOString()
    const okrsData = [
      { obj: 'Fechar o primeiro deal WH', krs: [
        { kr: '10 imóveis adicionados/semana × 4 semanas', meta: 10, unidade: '/sem', fonte: 'imoveis_semana' },
        { kr: '4 visitas realizadas', meta: 4, fonte: 'imoveis_com_visita' },
        { kr: '2 propostas enviadas', meta: 2, fonte: 'imoveis_com_proposta' },
        { kr: '1 contrato assinado', meta: 1, fonte: 'negocios_total' },
      ]},
      { obj: 'Captar primeiro capital passivo', krs: [
        { kr: '3 reuniões com investidores A/B', meta: 3, fonte: 'investidores_ab_reuniao' },
        { kr: '1 NDA assinado', meta: 1, fonte: 'investidores_nda' },
        { kr: '1 transferência de capital', meta: 1, fonte: 'investidores_capital' },
      ]},
      { obj: 'Activar rede de consultores', krs: [
        { kr: '10 follow-ups/semana × 4 semanas', meta: 10, unidade: '/sem', fonte: 'consultores_followup_semana' },
        { kr: '5 consultores com follow-up em dia', meta: 5, fonte: 'consultores_followup_em_dia' },
        { kr: 'Data Primeira Call em consultores ativos', meta: 0, fonte: 'consultores_com_call' },
      ]},
      { obj: 'Disciplina de dados ≥ 80%', krs: [
        { kr: '0 imóveis ativos sem Modelo Negócio', meta: 0, fonte: 'imoveis_sem_modelo', invertido: true },
        { kr: '100% investidores A/B com contacto', meta: 0, fonte: 'investidores_ab_contacto' },
      ]},
    ]
    for (let i = 0; i < okrsData.length; i++) {
      const o = okrsData[i]
      const okrId = crypto.randomUUID()
      await pgPool.query('INSERT INTO okrs (id, trimestre, objectivo, ordem, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [okrId, 'Q2 2026', o.obj, i, now, now])
      for (let j = 0; j < o.krs.length; j++) {
        const kr = o.krs[j]
        const krId = crypto.randomUUID()
        // Para KRs de disciplina, meta = total do universo (calculado depois)
        await pgPool.query(
          'INSERT INTO okr_krs (id, okr_id, kr, meta, unidade, tipo, fonte, invertido, ordem, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [krId, okrId, kr.kr, kr.meta, kr.unidade || '', 'acumulado', kr.fonte, kr.invertido || false, j, now, now]
        )
      }
    }
    res.json({ ok: true, created: okrsData.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════════════════════════════
// TIME TRACKING — Operações & Horas
// ════════════════════════════════════════════════════════════════
app.get('/api/time-tracking', async (req, res) => {
  try {
    const [tarefas, negocios, despesas] = await Promise.all([
      getTarefas(),
      getNegócios(),
      getDespesas().catch(() => []),
    ])

    const now = new Date()
    const { ano, month } = getMesAtual()
    const CUSTO_HORA = 15

    // Filtrar outliers (>24h numa tarefa = erro de dados)
    const tarefasValidas = tarefas.filter(t => t.tempoHoras > 0 && t.tempoHoras <= 24)
    const totalHoras = round2(tarefasValidas.reduce((s, t) => s + t.tempoHoras, 0))
    const totalTarefas = tarefasValidas.length

    // ── Por funcionário (split: tarefas comuns contam para ambos) ──
    const NOMES_EQUIPA = ['João Abreu', 'Alexandre Mendes']
    const porFuncionario = {}
    for (const nome of NOMES_EQUIPA) porFuncionario[nome] = { horas: 0, tarefas: 0, concluidas: 0 }
    for (const t of tarefasValidas) {
      const f = t.funcionario || ''
      // Se contém ambos nomes (separados por vírgula), atribuir a cada um
      const pessoas = NOMES_EQUIPA.filter(n => f.includes(n))
      if (pessoas.length === 0) pessoas.push('Não atribuído')
      for (const p of pessoas) {
        if (!porFuncionario[p]) porFuncionario[p] = { horas: 0, tarefas: 0, concluidas: 0 }
        porFuncionario[p].horas += t.tempoHoras  // horas completas para cada pessoa
        porFuncionario[p].tarefas++
        if (t.status === 'Concluída') porFuncionario[p].concluidas++
      }
    }
    const funcionarios = Object.entries(porFuncionario)
      .filter(([, v]) => v.tarefas > 0)
      .map(([nome, v]) => ({
        nome, horas: round2(v.horas), tarefas: v.tarefas, concluidas: v.concluidas,
        custoTotal: round2(v.horas * CUSTO_HORA),
        taxaConclusao: v.tarefas > 0 ? round2(v.concluidas / v.tarefas * 100) : 0,
      })).sort((a, b) => b.horas - a.horas)

    // ── Por mês ──
    const porMes = {}
    for (const t of tarefasValidas) {
      if (!t.inicio) continue
      const m = t.inicio.substring(0, 7)
      if (!porMes[m]) porMes[m] = { horas: 0, tarefas: 0, custoHoras: 0 }
      porMes[m].horas += t.tempoHoras
      porMes[m].tarefas++
      porMes[m].custoHoras += t.tempoHoras * CUSTO_HORA
    }
    const meses = Object.entries(porMes)
      .map(([mes, v]) => ({ mes, horas: round2(v.horas), tarefas: v.tarefas, custoHoras: round2(v.custoHoras) }))
      .sort((a, b) => a.mes.localeCompare(b.mes))

    // ── Por mês + funcionário (split tarefas comuns) ──
    const porMesFunc = {}
    for (const t of tarefasValidas) {
      if (!t.inicio) continue
      const m = t.inicio.substring(0, 7)
      const f = t.funcionario || ''
      const pessoas = NOMES_EQUIPA.filter(n => f.includes(n))
      if (pessoas.length === 0) pessoas.push('Não atribuído')
      for (const p of pessoas) {
        const key = `${m}|${p}`
        if (!porMesFunc[key]) porMesFunc[key] = { mes: m, funcionario: p, horas: 0, tarefas: 0 }
        porMesFunc[key].horas += t.tempoHoras
        porMesFunc[key].tarefas++
      }
    }
    const mesesFuncionario = Object.values(porMesFunc)
      .filter(v => v.tarefas > 0)
      .map(v => ({ ...v, horas: round2(v.horas) }))
      .sort((a, b) => a.mes.localeCompare(b.mes) || a.funcionario.localeCompare(b.funcionario))

    // ── Por tipo de actividade (normalizado) ──
    const CATEGORIAS = {
      'Cold Call': /cold call/i,
      'Pesquisa de Imóveis': /pesquisa.*im[oó]ve/i,
      'Estudo de Mercado': /estudo.*mercado/i,
      'Follow Up Consultores': /follow.*up.*consult/i,
      'Follow Up Investidores': /follow.*up.*invest|contacto.*invest/i,
      'Reunião Investidores': /reuni[ãa]o.*invest|call.*invest/i,
      'Reunião de Equipa Somnium': /reuni[ãa]o.*(semanal|lu[ií]s|parceria|equipa)/i,
      'Visita': /visita/i,
      'Proposta': /proposta/i,
      'Apresentação de Negócios': /apresenta[çc][ãa]o|revis[ãa]o.*apresenta/i,
      'SOP / Formação': /sop|forma[çc][ãa]o/i,
      'Planeamento': /planeamento|an[aá]lise.*semanal|defini[çc][ãa]o|contabiliza/i,
      'Implementação com IA': /dashboard|claude.*code|notion|crm|tech|otimiza[çc][ãa]o.*notion|implementa[çc][ãa]o.*claude/i,
      'Análise de Negócio': /an[aá]lise.*neg[oó]cio|analise.*potencial/i,
      'Contacto Consultores': /contacto.*consult|cold.*call.*consult/i,
    }
    const porCategoria = {}
    for (const t of tarefasValidas) {
      // Usar categoria guardada na DB; fallback para regex se vazia
      let cat = t.categoria || null
      if (!cat) {
        cat = 'Outros'
        for (const [nome, regex] of Object.entries(CATEGORIAS)) {
          if (regex.test(t.tarefa)) { cat = nome; break }
        }
      }
      if (!porCategoria[cat]) porCategoria[cat] = { horas: 0, tarefas: 0 }
      porCategoria[cat].horas += t.tempoHoras
      porCategoria[cat].tarefas++
    }
    const categorias = Object.entries(porCategoria)
      .map(([categoria, v]) => ({
        categoria, horas: round2(v.horas), tarefas: v.tarefas,
        pctHoras: totalHoras > 0 ? round2(v.horas / totalHoras * 100) : 0,
        custoTotal: round2(v.horas * CUSTO_HORA),
      }))
      .sort((a, b) => b.horas - a.horas)

    // ── Mês actual ──
    const horasMesActual = round2(tarefasValidas
      .filter(t => t.inicio && isMonth(t.inicio, ano, month))
      .reduce((s, t) => s + t.tempoHoras, 0))
    const tarefasMesActual = tarefasValidas.filter(t => t.inicio && isMonth(t.inicio, ano, month)).length

    // ── Semana actual ──
    const horasSemana = round2(tarefasValidas
      .filter(t => {
        if (!t.inicio) return false
        const d = new Date(t.inicio)
        return (now - d) / 86400000 < 7
      })
      .reduce((s, t) => s + t.tempoHoras, 0))

    // ── KPIs derivados ──
    // Revenue per hour
    const receitaTotal = round2(negocios.reduce((s, n) => s + (n.lucroReal || n.lucroEstimado), 0))
    const receitaRealizada = round2(negocios.filter(n => n.fase === 'Vendido').reduce((s, n) => s + n.lucroReal, 0))
    const rph = totalHoras > 0 ? round2(receitaTotal / totalHoras) : null
    const rphRealizado = totalHoras > 0 && receitaRealizada > 0 ? round2(receitaRealizada / totalHoras) : null

    // Custo por hora (horas × 15€ + custos fixos rateados)
    const burnRateMensal = round2(despesas.filter(d => d.timing === 'Mensalmente').reduce((s, d) => s + d.custoMensal, 0) + despesas.filter(d => d.timing === 'Anual').reduce((s,d) => s + (d.custoAnual || 0) / 12, 0)) || 360.40
    const custoHorasTotal = round2(totalHoras * CUSTO_HORA)
    const mesesOp = meses.length || 1
    const custoFixoTotal = round2(burnRateMensal * mesesOp)
    const custoOperacaoTotal = round2(custoHorasTotal + custoFixoTotal)

    // Horas por deal
    const horasPorDeal = negocios.length > 0 ? round2(totalHoras / negocios.length) : null
    const custoPorDeal = negocios.length > 0 ? round2(custoOperacaoTotal / negocios.length) : null

    // Produtividade (horas concluídas / horas totais)
    const horasConcluidas = round2(tarefasValidas.filter(t => t.status === 'Concluída').reduce((s, t) => s + t.tempoHoras, 0))
    const taxaProdutividade = totalHoras > 0 ? round2(horasConcluidas / totalHoras * 100) : null

    // Horas por tipo de actividade comercial (para CAC refinado)
    const horasProspeccao = round2((porCategoria['Cold Call']?.horas ?? 0) + (porCategoria['Pesquisa de Imóveis']?.horas ?? 0) + (porCategoria['Contacto Consultores']?.horas ?? 0))
    const horasAnalise = round2((porCategoria['Estudo de Mercado']?.horas ?? 0) + (porCategoria['Análise de Negócio']?.horas ?? 0))
    const horasRelacional = round2((porCategoria['Follow Up Consultores']?.horas ?? 0) + (porCategoria['Follow Up Investidores']?.horas ?? 0) +
      (porCategoria['Reunião Investidores']?.horas ?? 0))
    const horasGestao = round2((porCategoria['Planeamento']?.horas ?? 0) + (porCategoria['SOP / Formação']?.horas ?? 0) +
      (porCategoria['Implementação com IA']?.horas ?? 0) + (porCategoria['Reunião de Equipa Somnium']?.horas ?? 0))

    // Status das tarefas
    const statusTarefas = { aFazer: 0, emAndamento: 0, concluida: 0, atrasada: 0 }
    for (const t of tarefas) {
      if (t.status === 'Concluída') statusTarefas.concluida++
      else if (t.status === 'Em andamento') statusTarefas.emAndamento++
      else if (t.status === 'Atrasada') statusTarefas.atrasada++
      else statusTarefas.aFazer++
    }

    res.json({
      updatedAt: new Date().toISOString(),
      resumo: {
        totalHoras, totalTarefas, horasMesActual, tarefasMesActual, horasSemana,
        custoHora: CUSTO_HORA, custoHorasTotal, custoFixoTotal, custoOperacaoTotal,
        horasConcluidas, taxaProdutividade,
        statusTarefas,
      },
      kpis: {
        rph, rphRealizado, receitaTotal, receitaRealizada,
        horasPorDeal, custoPorDeal,
        horasProspeccao, horasAnalise, horasRelacional, horasGestao,
        pctProspeccao: totalHoras > 0 ? round2(horasProspeccao / totalHoras * 100) : null,
        pctAnalise: totalHoras > 0 ? round2(horasAnalise / totalHoras * 100) : null,
        pctRelacional: totalHoras > 0 ? round2(horasRelacional / totalHoras * 100) : null,
        pctGestao: totalHoras > 0 ? round2(horasGestao / totalHoras * 100) : null,
      },
      funcionarios,
      meses,
      mesesFuncionario,
      categorias,
    })
  } catch (err) {
    console.error('[time-tracking]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// ALERTAS — Centro de atenção do CEO
// ════════════════════════════════════════════════════════════════
app.get('/api/alertas', async (req, res) => {
  try {
    const [imoveis, investidores, consultoresRaw, negocios] = await Promise.all([
      getImóveis().catch(() => []),
      getInvestidores(),
      getConsultores().catch(() => []),
      getNegócios(),
    ])
    const now = new Date()
    const alerts = []

    // ── Investidores sem contacto >7 dias ──
    for (const inv of investidores) {
      const diasSem = inv.diasSemContacto ?? (() => {
        const ultima = inv.dataUltimoContacto ?? inv.dataReuniao ?? inv.dataPrimeiroContacto
        if (!ultima) return null
        return Math.floor((now - new Date(ultima)) / 86400000)
      })()
      if (diasSem != null && diasSem > 7 && !['Investidor em parceria', 'Em Parceria'].includes(inv.status)) {
        alerts.push({
          tipo: 'inatividade_investidor',
          severidade: diasSem > 30 ? 'critico' : diasSem > 14 ? 'aviso' : 'info',
          entidade: inv.nome,
          mensagem: `${diasSem} dias sem contacto`,
          status: inv.status,
          id: inv.id,
        })
      }
    }

    // ── Consultores com follow-up atrasado ──
    const CONS_ATIVOS = new Set(['Aberto Parcerias', 'Em Parceria', 'Follow up', 'Follow Up', 'Acesso imoveis Off market'])
    for (const c of consultoresRaw) {
      if (!CONS_ATIVOS.has(c.estatuto)) continue
      if (c.dataProximoFollowUp && new Date(c.dataProximoFollowUp) < now) {
        const diasAtraso = Math.floor((now - new Date(c.dataProximoFollowUp)) / 86400000)
        alerts.push({
          tipo: 'followup_consultor',
          severidade: diasAtraso > 14 ? 'critico' : diasAtraso > 7 ? 'aviso' : 'info',
          entidade: c.nome,
          mensagem: `Follow-up atrasado ${diasAtraso} dias`,
          status: c.estatuto,
          id: c.id,
        })
      }
    }

    // ── Consultores: sem primeiro contacto >48h / inativo >15d ──
    try {
      const { query: pgQuery } = await import('./src/db/pg.js')
      const { rows: pgConsultores } = await pgQuery('SELECT id, nome, estatuto, created_at FROM consultores')
      const { rows: todasInteracoes } = await pgQuery('SELECT consultor_id, data_hora FROM consultor_interacoes')
      const interacoesPorConsultor = {}
      for (const i of todasInteracoes) {
        if (!interacoesPorConsultor[i.consultor_id]) interacoesPorConsultor[i.consultor_id] = []
        interacoesPorConsultor[i.consultor_id].push(i)
      }

      const ESTATUTOS_ATIVOS = ['Follow up', 'Aberto Parcerias', 'Acesso imoveis Off market', 'Consultores em Parceria']
      for (const c of pgConsultores) {
        const horasCriado = (now - new Date(c.created_at)) / 3600000
        const interacoesCons = interacoesPorConsultor[c.id] || []

        // VERMELHO: criado há >48h sem primeiro contacto registado (só consultores activos, não Cold Call)
        if (horasCriado > 48 && interacoesCons.length === 0 && ESTATUTOS_ATIVOS.includes(c.estatuto)) {
          alerts.push({
            tipo: 'consultor_sem_contacto_48h',
            severidade: 'critico',
            entidade: c.nome,
            mensagem: `Criado há ${Math.floor(horasCriado)}h sem contacto registado`,
            status: c.estatuto,
            id: c.id,
          })
        }

        // LARANJA: último contacto há >15 dias sem imóvel recebido entretanto
        if (interacoesCons.length > 0) {
          const ultimaData = interacoesCons.reduce((max, i) => {
            const d = new Date(i.data_hora)
            return d > max ? d : max
          }, new Date(0))
          const diasSemContacto = Math.floor((now - ultimaData) / 86400000)
          if (diasSemContacto > 15) {
            const imoveisConsultor = imoveis.filter(im => im.nomeConsultor?.trim().toLowerCase() === c.nome?.trim().toLowerCase())
            const imovelRecente = imoveisConsultor.some(im =>
              im.dataAdicionado && new Date(im.dataAdicionado) > ultimaData
            )
            if (!imovelRecente) {
              alerts.push({
                tipo: 'consultor_inativo_15d',
                severidade: 'aviso',
                entidade: c.nome,
                mensagem: `${diasSemContacto} dias sem contacto`,
                status: c.estatuto,
                id: c.id,
              })
            }
          }
        }
      }
    } catch (e) {
      console.warn('[alertas] Erro ao verificar interacções consultores:', e.message)
    }

    // ── Imóveis parados na mesma fase >5 dias ──
    const ESTADOS_NEG = new Set(['Descartado', 'Nao interessa', 'Não interessa', 'Cancelado'])
    const ESTADOS_FINAIS = new Set([...ESTADOS_NEG, 'Vendido', 'Wholesaling', 'Negócio em Curso'])
    for (const im of imoveis) {
      if (ESTADOS_FINAIS.has(im.estado)) continue
      const ultimaData = im.dataPropostaAceite ?? im.dataProposta ?? im.dataEstudoMercado ?? im.dataVisita ?? im.dataChamada ?? im.dataAdicionado
      if (!ultimaData) continue
      const diasParado = Math.floor((now - new Date(ultimaData)) / 86400000)
      if (diasParado > 5) {
        alerts.push({
          tipo: 'imovel_parado',
          severidade: diasParado > 15 ? 'critico' : diasParado > 7 ? 'aviso' : 'info',
          entidade: im.nome,
          mensagem: `${diasParado} dias na fase "${im.estado}"`,
          estado: im.estado,
          id: im.id,
        })
      }
    }

    // ── Campos obrigatórios em falta ──
    const camposEmFalta = []

    for (const im of imoveis) {
      const missing = []
      if (!im.dataAdicionado) missing.push('Data Adicionado')
      if (!im.origem) missing.push('Origem')
      if (!im.zona && im.zonas?.length === 0) missing.push('Zona')
      if (!im.tipologia) missing.push('Tipologia')
      if (ESTADOS_NEG.has(im.estado) && !im.motivoDescarte) missing.push('Motivo Descarte')
      if (['Wholesaling', 'Negócio em Curso'].includes(im.estado) && !im.modeloNegocio) missing.push('Modelo de Negócio')
      if (missing.length > 0) camposEmFalta.push({ db: 'Imóveis', nome: im.nome, campos: missing, id: im.id })
    }

    for (const inv of investidores) {
      const missing = []
      if (!inv.dataPrimeiroContacto) missing.push('Data Primeiro Contacto')
      if (!inv.origem) missing.push('Origem')
      if (inv.classificacao.length === 0 && ['Investidor em espera', 'Investidor em parceria', 'Em Parceria'].includes(inv.status)) missing.push('Classificação')
      if (['Investidor em parceria', 'Em Parceria'].includes(inv.status) && inv.montanteInvestido === 0) missing.push('Montante Investido')
      if (missing.length > 0) camposEmFalta.push({ db: 'Investidores', nome: inv.nome, campos: missing, id: inv.id })
    }

    for (const c of consultoresRaw) {
      const missing = []
      if (!c.contacto) missing.push('Contacto')
      if (c.imobiliaria.length === 0) missing.push('Imobiliária')
      if (CONS_ATIVOS.has(c.estatuto) && !c.dataFollowUp && !c.dataProximoFollowUp) missing.push('Data Follow Up')
      if (missing.length > 0) camposEmFalta.push({ db: 'Consultores', nome: c.nome, campos: missing, id: c.id })
    }

    for (const neg of negocios) {
      const missing = []
      if (!neg.categoria) missing.push('Categoria')
      if (!neg.fase) missing.push('Fase')
      if (neg.lucroEstimado === 0) missing.push('Lucro Estimado')
      if (neg.fase === 'Vendido' && neg.lucroReal === 0) missing.push('Lucro Real')
      if (neg.fase === 'Vendido' && !neg.dataVenda) missing.push('Data de Venda')
      if (missing.length > 0) camposEmFalta.push({ db: 'Faturação', nome: neg.movimento, campos: missing, id: neg.id })
    }

    // ── Alertas de análises de rentabilidade ──
    try {
      const { query: pgQuery } = await import('./src/db/pg.js')
      const { rows: analisesActivas } = await pgQuery(`
        SELECT a.*, i.nome as imovel_nome FROM analises a
        JOIN imoveis i ON i.id = a.imovel_id
        WHERE a.activa = true
      `)
      for (const an of analisesActivas) {
        // Risco de prejuízo no pior cenário
        const st = typeof an.stress_tests === 'string' ? JSON.parse(an.stress_tests || 'null') : an.stress_tests
        if (st?.pior?.lucro_liquido < 0) {
          alerts.push({
            tipo: 'stress_prejuizo',
            severidade: an.lucro_liquido < 0 ? 'critico' : 'aviso',
            entidade: an.imovel_nome,
            mensagem: `Pior cenário: ${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(st.pior.lucro_liquido)} de prejuízo`,
            id: an.imovel_id,
          })
        }
        // RA baixo
        if (an.retorno_anualizado > 0 && an.retorno_anualizado < 8) {
          alerts.push({
            tipo: 'ra_baixo',
            severidade: 'aviso',
            entidade: an.imovel_nome,
            mensagem: `Retorno anualizado de apenas ${an.retorno_anualizado}%`,
            id: an.imovel_id,
          })
        }
        // VPT > compra
        if (an.vpt > an.compra && an.compra > 0) {
          alerts.push({
            tipo: 'vpt_superior',
            severidade: 'info',
            entidade: an.imovel_nome,
            mensagem: 'VPT superior ao preço de compra — IMT calculado sobre VPT',
            id: an.imovel_id,
          })
        }
        // Isenção IMT a caducar (>10 meses e finalidade empresa c/ isenção)
        if (an.finalidade === 'Empresa_isencao' && an.meses > 10) {
          alerts.push({
            tipo: 'imt_caducidade',
            severidade: an.meses > 12 ? 'critico' : 'aviso',
            entidade: an.imovel_nome,
            mensagem: `Isenção IMT caduca aos 12 meses — prazo estimado: ${an.meses}m`,
            id: an.imovel_id,
          })
        }
      }
    } catch (e) {
      console.warn('[alertas] Erro ao verificar análises:', e.message)
    }

    // Sort by severity
    const SEV_ORDER = { critico: 0, aviso: 1, info: 2 }
    alerts.sort((a, b) => (SEV_ORDER[a.severidade] ?? 3) - (SEV_ORDER[b.severidade] ?? 3))

    res.json({
      updatedAt: new Date().toISOString(),
      alertas: alerts,
      camposEmFalta,
      resumo: {
        total: alerts.length,
        criticos: alerts.filter(a => a.severidade === 'critico').length,
        avisos: alerts.filter(a => a.severidade === 'aviso').length,
        info: alerts.filter(a => a.severidade === 'info').length,
        camposIncompletos: camposEmFalta.length,
      },
    })
  } catch (err) {
    console.error('[alertas]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// DATA HEALTH — Relatório de higiene de dados
// ════════════════════════════════════════════════════════════════
app.get('/api/data-health', async (req, res) => {
  try {
    const [imoveis, investidores, consultoresRaw, negocios, despesas] = await Promise.all([
      getImóveis().catch(() => []),
      getInvestidores(),
      getConsultores().catch(() => []),
      getNegócios(),
      getDespesas(),
    ])

    function pctFilled(arr, accessor) {
      if (arr.length === 0) return 0
      const filled = arr.filter(item => {
        const v = accessor(item)
        return v !== null && v !== undefined && v !== '' && v !== 0 && !(Array.isArray(v) && v.length === 0)
      }).length
      return round2(filled / arr.length * 100)
    }

    const health = {
      imoveis: {
        total: imoveis.length,
        campos: {
          'Nome':              pctFilled(imoveis, i => i.nome),
          'Ask Price':         pctFilled(imoveis, i => i.askPrice),
          'Estado':            pctFilled(imoveis, i => i.estado),
          'Data Adicionado':   pctFilled(imoveis, i => i.dataAdicionado),
          'Origem':            pctFilled(imoveis, i => i.origem),
          'Zona':              pctFilled(imoveis, i => i.zonas?.length > 0 ? i.zonas : null),
          'Tipologia':         pctFilled(imoveis, i => i.tipologia),
          'Data Chamada':      pctFilled(imoveis, i => i.dataChamada),
          'Data Visita':       pctFilled(imoveis, i => i.dataVisita),
          'Data Estudo':       pctFilled(imoveis, i => i.dataEstudoMercado),
          'Data Proposta':     pctFilled(imoveis, i => i.dataProposta),
          'Modelo Negócio':    pctFilled(imoveis, i => i.modeloNegocio),
          'ROI':               pctFilled(imoveis, i => i.roi),
          'Motivo Descarte':   pctFilled(imoveis.filter(i => new Set(['Descartado','Nao interessa','Não interessa']).has(i.estado)), i => i.motivoDescarte),
        },
      },
      investidores: {
        total: investidores.length,
        campos: {
          'Nome':               pctFilled(investidores, i => i.nome),
          'Status':             pctFilled(investidores, i => i.status),
          'Origem':             pctFilled(investidores, i => i.origem),
          'Data 1º Contacto':   pctFilled(investidores, i => i.dataPrimeiroContacto),
          'Data Reunião':       pctFilled(investidores, i => i.dataReuniao),
          'Data Último Contacto': pctFilled(investidores, i => i.dataUltimoContacto),
          'Classificação':      pctFilled(investidores, i => i.classificacao?.length > 0 ? i.classificacao : null),
          'Capital Mínimo':     pctFilled(investidores, i => i.capitalMin),
          'Capital Máximo':     pctFilled(investidores, i => i.capitalMax),
          'Montante Investido': pctFilled(investidores, i => i.montanteInvestido),
          'NDA Assinado':       pctFilled(investidores, i => i.ndaAssinado ? 'sim' : null),
          'Estratégia':         pctFilled(investidores, i => i.estrategia?.length > 0 ? i.estrategia : null),
          'Tipo Investidor':    pctFilled(investidores, i => i.tipoInvestidor?.length > 0 ? i.tipoInvestidor : null),
          'ROI Investidor %':   pctFilled(investidores, i => i.roiInvestidor),
        },
      },
      consultores: {
        total: consultoresRaw.length,
        campos: {
          'Nome':               pctFilled(consultoresRaw, c => c.nome),
          'Estatuto':           pctFilled(consultoresRaw, c => c.estatuto),
          'Contacto':           pctFilled(consultoresRaw, c => c.contacto),
          'Imobiliária':        pctFilled(consultoresRaw, c => c.imobiliaria?.length > 0 ? c.imobiliaria : null),
          'Email':              pctFilled(consultoresRaw, c => c.email),
          'Zona Atuação':       pctFilled(consultoresRaw, c => c.zonas?.length > 0 ? c.zonas : null),
          'Data Follow Up':     pctFilled(consultoresRaw, c => c.dataFollowUp),
          'Imóveis Enviados':   pctFilled(consultoresRaw, c => c.imoveisEnviados),
          'Imóveis Off/Market': pctFilled(consultoresRaw, c => c.imoveisOffMarket),
          'Data 1ª Call':       pctFilled(consultoresRaw, c => c.dataPrimeiraCall),
          'Classificação':      pctFilled(consultoresRaw, c => c.classificacao),
        },
      },
      faturacao: {
        total: negocios.length,
        campos: {
          'Movimento':       pctFilled(negocios, n => n.movimento),
          'Categoria':       pctFilled(negocios, n => n.categoria),
          'Fase':            pctFilled(negocios, n => n.fase),
          'Lucro Estimado':  pctFilled(negocios, n => n.lucroEstimado),
          'Lucro Real':      pctFilled(negocios, n => n.lucroReal),
          'Data':            pctFilled(negocios, n => n.data),
          'Data Compra':     pctFilled(negocios, n => n.dataCompra),
          'Data Venda':      pctFilled(negocios, n => n.dataVenda),
          'Capital Total':   pctFilled(negocios, n => n.capitalTotal),
          'Nº Investidores': pctFilled(negocios, n => n.nInvestidores),
        },
      },
      despesas: {
        total: despesas.length,
        campos: {
          'Movimento':       pctFilled(despesas, d => d.movimento),
          'Categoria':       pctFilled(despesas, d => d.categoria),
          'Timing':          pctFilled(despesas, d => d.timing),
          'Custo Mensal':    pctFilled(despesas, d => d.custoMensal),
          'Data':            pctFilled(despesas, d => d.data),
        },
      },
    }

    // Score global: média das médias de cada DB
    for (const db of Object.values(health)) {
      const vals = Object.values(db.campos)
      db.scoreMedio = vals.length > 0 ? round2(vals.reduce((s, v) => s + v, 0) / vals.length) : 0
    }

    const scoreGlobal = round2(Object.values(health).reduce((s, db) => s + db.scoreMedio, 0) / Object.keys(health).length)

    res.json({ updatedAt: new Date().toISOString(), scoreGlobal, databases: health })
  } catch (err) {
    console.error('[data-health]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// AUTOMAÇÕES — Scoring, Auto-dates, ROI, Pipeline→Faturação
// ════════════════════════════════════════════════════════════════

// ── Scoring automático de investidores ──
app.post('/api/automation/score-investidores', async (req, res) => {
  try {
    const investidores = await getInvestidores()
    const updated = []

    for (const inv of investidores) {
      let score = 0
      // Capital definido (+20)
      if (inv.capitalMin > 0 || inv.capitalMax > 0) score += 20
      // Reunião realizada (+20)
      if (inv.dataReuniao) score += 20
      // NDA assinado (+15)
      if (inv.ndaAssinado) score += 15
      // Estratégia definida (+10)
      if (inv.estrategia?.length > 0) score += 10
      // Tipo definido (+10)
      if (inv.tipoInvestidor?.length > 0) score += 10
      // Email (+5)
      if (inv.nome) score += 5 // tem contacto
      // Contacto (+5)
      if (inv.dataPrimeiroContacto) score += 5
      // Classificação automática
      let classificacao
      if (score >= 80) classificacao = 'A'
      else if (score >= 60) classificacao = 'B'
      else if (score >= 35) classificacao = 'C'
      else classificacao = 'D'

      const currentScore = inv.pontuacao
      const currentClass = inv.classificacao?.[0]
      if (currentScore !== score || currentClass !== classificacao) {
        try {
          await notion.pages.update({
            page_id: inv.id,
            properties: {
              'Pontuação Classificação': { number: score },
              'Classificação': { multi_select: [{ name: classificacao }] },
            },
          })
          updated.push({ nome: inv.nome, score, classificacao, anterior: { score: currentScore, class: currentClass } })
        } catch (e) {
          console.error(`[score-inv] Erro ao atualizar ${inv.nome}:`, e.message)
        }
      }
    }

    cache.delete('inv') // Invalidate cache
    res.json({ ok: true, atualizados: updated.length, detalhes: updated })
  } catch (err) {
    console.error('[score-investidores]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Scoring automático de consultores ──
app.post('/api/automation/score-consultores', async (req, res) => {
  try {
    const [consultoresRaw, imoveis] = await Promise.all([getConsultores().catch(() => []), getImóveis().catch(() => [])])
    const updated = []

    for (const c of consultoresRaw) {
      let score = 0
      const leads = imoveis.filter(i => i.nomeConsultor?.trim() === c.nome)
      // Leads enviados (+3 por lead, max 30)
      score += Math.min(leads.length * 3, 30)
      // Off-market (+10 por imóvel, max 30)
      score += Math.min((c.imoveisOffMarket || 0) * 10, 30)
      // Follow-up em dia (+15)
      if (c.dataProximoFollowUp && new Date(c.dataProximoFollowUp) >= new Date()) score += 15
      // Email disponível (+5)
      if (c.email) score += 5
      // Imobiliária definida (+5)
      if (c.imobiliaria?.length > 0) score += 5
      // Zonas definidas (+5)
      if (c.zonas?.length > 0) score += 5
      // Tem imóveis enviados (+10)
      if (c.imoveisEnviados > 0) score += 10

      let classificacao
      if (score >= 70) classificacao = 'A'
      else if (score >= 45) classificacao = 'B'
      else if (score >= 20) classificacao = 'C'
      else classificacao = 'D'

      const currentClass = c.classificacao
      if (currentClass !== classificacao) {
        try {
          await notion.pages.update({
            page_id: c.id,
            properties: {
              'Classificação': { select: { name: classificacao } },
            },
          })
          updated.push({ nome: c.nome, score, classificacao, anterior: currentClass })
        } catch (e) {
          console.error(`[score-cons] Erro ao atualizar ${c.nome}:`, e.message)
        }
      }
    }

    cache.delete('cons')
    res.json({ ok: true, atualizados: updated.length, detalhes: updated })
  } catch (err) {
    console.error('[score-consultores]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Cálculo automático de ROI em imóveis ──
app.post('/api/automation/calc-roi', async (req, res) => {
  try {
    const imoveis = await getImóveis()
    const updated = []

    for (const im of imoveis) {
      if (im.askPrice <= 0) continue
      const custoTotal = im.askPrice + (im.custoObra || 0)
      if (custoTotal <= 0) continue

      let roi = null, roiAnualizado = null
      if (im.valorVendaRemodelado > 0) {
        // ROI = (VVR - custo total) / custo total * 100
        roi = round2((im.valorVendaRemodelado - custoTotal) / custoTotal * 100)
      } else if (im.valorProposta > 0 && im.valorProposta < im.askPrice) {
        // Wholesaling: spread / ask price * 100
        roi = round2((im.askPrice - im.valorProposta) / im.askPrice * 100)
      }

      if (roi === null) continue

      // ROI anualizado: assume 6 meses por deal se não há datas
      const meses = daysBetween(im.dataAdicionado, im.dataPropostaAceite)
        ? daysBetween(im.dataAdicionado, im.dataPropostaAceite) / 30
        : 6
      roiAnualizado = meses > 0 ? round2(roi * (12 / meses)) : roi

      const needsUpdate = Math.abs((im.roi || 0) - roi) > 0.1 || Math.abs((im.roiAnualizado || 0) - roiAnualizado) > 0.1
      if (needsUpdate) {
        try {
          await notion.pages.update({
            page_id: im.id,
            properties: {
              'ROI': { number: roi },
              'ROI Anualizado': { number: roiAnualizado },
            },
          })
          updated.push({ nome: im.nome, roi, roiAnualizado })
        } catch (e) {
          console.error(`[calc-roi] Erro ao atualizar ${im.nome}:`, e.message)
        }
      }
    }

    cache.delete('imo')
    res.json({ ok: true, atualizados: updated.length, detalhes: updated })
  } catch (err) {
    console.error('[calc-roi]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Auto-preenchimento de datas ──
app.post('/api/automation/auto-dates', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const [investidores, consultoresRaw] = await Promise.all([getInvestidores(), getConsultores().catch(() => [])])
    const updated = []

    // Investidores: preencher Data de Último Contacto baseado em status avançado
    const INV_AVANCADOS = new Set(['Follow Up', 'Investidor em espera', 'Investidor em parceria', 'Em Parceria', 'Call marcada', 'Call Marcada'])
    for (const inv of investidores) {
      const props = {}
      // Se tem reunião marcada mas não tem Data Reunião → não preencher (precisa ser data real)
      // Se o status avançou mas Data de Último Contacto é vazio → preencher com hoje
      if (!inv.dataUltimoContacto && INV_AVANCADOS.has(inv.status)) {
        props['Data de Último Contacto'] = { date: { start: today } }
      }
      if (Object.keys(props).length > 0) {
        try {
          await notion.pages.update({ page_id: inv.id, properties: props })
          updated.push({ db: 'Investidores', nome: inv.nome, campos: Object.keys(props) })
        } catch (e) {
          console.error(`[auto-dates] Erro investidor ${inv.nome}:`, e.message)
        }
      }
    }

    // Consultores: preencher Data Primeira Call se tem follow-up mas não tem 1ª call
    for (const c of consultoresRaw) {
      const props = {}
      if (!c.dataPrimeiraCall && c.dataFollowUp) {
        props['Data Primeira Call'] = { date: { start: c.dataFollowUp } }
      }
      if (Object.keys(props).length > 0) {
        try {
          await notion.pages.update({ page_id: c.id, properties: props })
          updated.push({ db: 'Consultores', nome: c.nome, campos: Object.keys(props) })
        } catch (e) {
          console.error(`[auto-dates] Erro consultor ${c.nome}:`, e.message)
        }
      }
    }

    cache.delete('inv')
    cache.delete('cons')
    res.json({ ok: true, atualizados: updated.length, detalhes: updated })
  } catch (err) {
    console.error('[auto-dates]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Pipeline imóveis → Faturação ──
app.post('/api/automation/pipeline-to-faturacao', async (req, res) => {
  try {
    const [imoveis, negocios] = await Promise.all([getImóveis(), getNegócios()])
    const created = []

    // Imóveis que passaram para um modelo de negócio definido
    const ESTADOS_PROJECTO = ['Wholesaling', 'Fix and Flip', 'CAEP', 'Mediação Imobiliária', 'Negócio em Curso']
    const imoveisComNegocio = new Set(negocios.flatMap(n => n.imovel))
    const candidatos = imoveis.filter(im =>
      ESTADOS_PROJECTO.includes(im.estado) &&
      !imoveisComNegocio.has(im.id)
    )

    for (const im of candidatos) {
      try {
        // Determinar categoria a partir do estado do pipeline
        let categoria = 'Wholesalling'
        if (im.estado === 'Fix and Flip') categoria = 'Fix and Flip'
        else if (im.estado === 'CAEP') categoria = 'CAEP'
        else if (im.estado === 'Mediação Imobiliária') categoria = 'Mediação Imobiliária'

        const hoje = new Date().toISOString().slice(0, 10)

        // Criar no PostgreSQL (lucro_estimado = 0, será calculado pela análise)
        const { rows: [newNeg] } = await pool.query(
          `INSERT INTO negocios (movimento, categoria, fase, lucro_estimado, data, imovel_id, pagamento_em_falta, created_at, updated_at)
           VALUES ($1, $2, 'Fase de obras', 0, $3, $4, 1, NOW(), NOW()) RETURNING id`,
          [im.nome, categoria, hoje, im.id]
        )

        // Se já existir análise activa para este imóvel, propagar faturação expectável
        const { rows: analises } = await pool.query(
          'SELECT id, calculados FROM analises WHERE imovel_id = $1 AND activa = true LIMIT 1', [im.id]
        )
        if (analises.length > 0) {
          const calc = typeof analises[0].calculados === 'string' ? JSON.parse(analises[0].calculados) : (analises[0].calculados || {})
          const lucroBruto = calc.lucro_bruto || 0
          const vvr = calc.vvr || 0
          let lucroEstimado = 0
          if (categoria === 'Wholesalling') lucroEstimado = Math.round(lucroBruto * 0.1 * 100) / 100
          else if (categoria === 'Mediação Imobiliária') lucroEstimado = Math.round(vvr * 0.025 * 100) / 100
          else if (categoria === 'CAEP') lucroEstimado = Math.round(lucroBruto * 0.4 * (2 / 3) * 100) / 100
          else lucroEstimado = calc.lucro_liquido || 0
          if (lucroEstimado > 0) {
            await pool.query('UPDATE negocios SET lucro_estimado = $1, updated_at = NOW() WHERE id = $2', [lucroEstimado, newNeg.id])
          }
        }

        // Sync Notion (se configurado)
        try {
          if (DB.negócios) {
            await notion.pages.create({
              parent: { database_id: DB.negócios },
              properties: {
                'Movimento': { title: [{ text: { content: im.nome } }] },
                'Categoria': { select: { name: categoria } },
                'Fase': { select: { name: 'Fase de obras' } },
                'Lucro estimado': { number: 0 },
                'Data': { date: { start: hoje } },
                'Imóvel': { relation: [{ id: im.id }] },
              },
            })
          }
        } catch (e) { console.error(`[pipeline-to-fat] Notion sync ${im.nome}:`, e.message) }

        created.push({ nome: im.nome, categoria })
      } catch (e) {
        console.error(`[pipeline-to-fat] Erro ao criar ${im.nome}:`, e.message)
      }
    }

    cache.delete('neg')
    res.json({ ok: true, criados: created.length, detalhes: created })
  } catch (err) {
    console.error('[pipeline-to-faturacao]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Correr todas as automações de uma vez ──
app.post('/api/automation/run-all', async (req, res) => {
  try {
    const base = 'http://localhost:3001'
    const results = {}

    const endpoints = ['auto-dates', 'score-investidores', 'score-consultores', 'calc-roi', 'pipeline-to-faturacao']
    for (const ep of endpoints) {
      try {
        const r = await fetch(`${base}/api/automation/${ep}`, { method: 'POST' })
        results[ep] = await r.json()
      } catch (e) {
        results[ep] = { error: e.message }
      }
    }

    res.json({ ok: true, results })
  } catch (err) {
    console.error('[run-all]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Em produção serve o frontend compilado (DEPOIS de todas as APIs)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('/{*splat}', (req, res, next) => {
    // Não interceptar rotas /api
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
}

// ── Auto-migrate on startup if DB is empty ──
async function autoMigrate() {
  try {
    const pool = (await import('./src/db/pg.js')).default
    const { syncAllFromNotion } = await import('./src/db/sync.js')
    const { rows } = await pool.query('SELECT COUNT(*) as c FROM imoveis')
    const count = parseInt(rows[0].c)
    if (count === 0) {
      console.log('[startup] DB vazia — a migrar do Notion...')
      const results = await syncAllFromNotion()
      const total = Object.values(results).reduce((s, r) => s + (r.total ?? 0), 0)
      console.log(`[startup] Migração completa: ${total} registos`)
    } else {
      console.log(`[startup] DB OK — ${count} imóveis + mais`)
    }
  } catch (e) {
    console.warn('[startup] Auto-migrate falhou:', e.message)
  }
}

const PORT = process.env.PORT ?? 3001
autoMigrate().then(() => {
  app.listen(PORT, async () => {
    console.log(`[server] a correr na porta ${PORT}`)

    // Sync lucro_real a partir de tranches confirmadas (corrige dados legacy)
    try {
      const { rows } = await pool.query('SELECT id, pagamentos_faseados, pagamento_em_falta FROM negocios')
      let fixed = 0
      for (const r of rows) {
        let pags = []
        try { pags = typeof r.pagamentos_faseados === 'string' ? JSON.parse(r.pagamentos_faseados || '[]') : (r.pagamentos_faseados || []) } catch { continue }
        if (!pags.length) continue
        const totalRecebido = Math.round(pags.filter(p => p.recebido).reduce((s, p) => s + (parseFloat(p.valor) || 0), 0) * 100) / 100
        const emFalta = pags.every(p => p.recebido) ? 0 : 1
        await pool.query('UPDATE negocios SET lucro_real = $1, pagamento_em_falta = $2 WHERE id = $3 AND (lucro_real IS DISTINCT FROM $1 OR pagamento_em_falta IS DISTINCT FROM $2)', [totalRecebido, emFalta, r.id])
        fixed++
      }
      if (fixed) console.log(`[sync] lucro_real recalculado para ${fixed} negócios com tranches`)
    } catch (e) { console.error('[sync] Erro ao sincronizar lucro_real:', e.message) }

    // Auto-registo mensal de despesas recorrentes (subscrições)
    async function registarDespesasMensais() {
      try {
        const { rows: subs } = await pool.query("SELECT * FROM despesas WHERE timing IN ('Mensalmente', 'Anual')")
        const hoje = new Date()
        const mesActual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
        let criados = 0

        for (const sub of subs) {
          const dataSub = sub.data ? new Date(sub.data) : null
          const diaPagamento = dataSub ? dataSub.getDate() : 1

          if (sub.timing === 'Anual') {
            // Anuais: registo único no mês de pagamento, valor total
            const mesPagamento = dataSub ? dataSub.getMonth() + 1 : 1
            if (hoje.getMonth() + 1 !== mesPagamento) continue // não é o mês de pagamento
            if (hoje.getDate() < diaPagamento) continue // dia ainda não chegou
            const valor = sub.custo_anual || 0
            if (valor <= 0) continue

            const dataRegisto = `${mesActual}-${String(diaPagamento).padStart(2, '0')}`
            const { rows: existente } = await pool.query(
              "SELECT id FROM despesas WHERE timing = 'Registado' AND movimento = $1 AND data LIKE $2",
              [sub.movimento, `${mesActual}%`]
            )
            if (existente.length > 0) continue

            const id = `auto-${sub.id}-${mesActual}`
            await pool.query(
              `INSERT INTO despesas (id, movimento, categoria, data, custo_mensal, custo_anual, timing, notas, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $5, 'Registado', $6, NOW(), NOW())
               ON CONFLICT (id) DO NOTHING`,
              [id, sub.movimento, sub.categoria, dataRegisto, valor, 'Subscrição anual']
            )
            criados++
          } else {
            // Mensais: registo todos os meses, valor mensal
            if (hoje.getDate() < diaPagamento) continue
            const valor = sub.custo_mensal || 0
            if (valor <= 0) continue

            const dataRegisto = `${mesActual}-${String(diaPagamento).padStart(2, '0')}`
            const { rows: existente } = await pool.query(
              "SELECT id FROM despesas WHERE timing = 'Registado' AND movimento = $1 AND data LIKE $2",
              [sub.movimento, `${mesActual}%`]
            )
            if (existente.length > 0) continue

            const id = `auto-${sub.id}-${mesActual}`
            await pool.query(
              `INSERT INTO despesas (id, movimento, categoria, data, custo_mensal, custo_anual, timing, notas, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $5, 'Registado', $6, NOW(), NOW())
               ON CONFLICT (id) DO NOTHING`,
              [id, sub.movimento, sub.categoria, dataRegisto, valor, 'Subscrição mensal']
            )
            criados++
          }
        }
        if (criados > 0) console.log(`[despesas] ${criados} registo(s) mensal(is) criado(s) automaticamente`)
      } catch (e) { console.error('[despesas] Erro auto-registo:', e.message) }
    }
    await registarDespesasMensais()

    // Agendar auto-registo diário à meia-noite
    function scheduleDespesas() {
      const now = new Date()
      const nextMidnight = new Date(now)
      nextMidnight.setHours(0, 10, 0, 0)
      if (nextMidnight <= now) nextMidnight.setDate(nextMidnight.getDate() + 1)
      setTimeout(() => {
        registarDespesasMensais()
        setInterval(registarDespesasMensais, 24 * 60 * 60 * 1000)
      }, nextMidnight - now)
    }
    scheduleDespesas()

    // Backup automático diário (corre 1x por dia às 3:00 AM)
    function scheduleBackup() {
      const now = new Date()
      const next3am = new Date(now)
      next3am.setHours(3, 0, 0, 0)
      if (next3am <= now) next3am.setDate(next3am.getDate() + 1)
      const ms = next3am - now
      setTimeout(async () => {
        try {
          console.log('[backup] A correr backup automático diário...')
          await fetch(`http://localhost:${PORT}/api/crm/backup/auto`, { method: 'POST' })
          console.log('[backup] Backup diário concluído')
        } catch (e) { console.error('[backup] Erro:', e.message) }
        // Agendar o próximo
        setInterval(async () => {
          try {
            await fetch(`http://localhost:${PORT}/api/crm/backup/auto`, { method: 'POST' })
            console.log('[backup] Backup diário concluído')
          } catch (e) { console.error('[backup] Erro:', e.message) }
        }, 24 * 60 * 60 * 1000)
      }, ms)
      console.log(`[backup] Próximo backup em ${Math.round(ms / 3600000)}h (às 03:00)`)
    }
    scheduleBackup()

    // Backup imediato ao iniciar (se nunca houve)
    fetch(`http://localhost:${PORT}/api/crm/backup/list`)
      .then(r => r.json())
      .then(list => {
        if (!list.length) {
          console.log('[backup] Primeiro backup...')
          fetch(`http://localhost:${PORT}/api/crm/backup/auto`, { method: 'POST' }).catch(() => {})
        }
      }).catch(() => {})
  })
})
