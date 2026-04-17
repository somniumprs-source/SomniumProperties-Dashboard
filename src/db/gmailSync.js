/**
 * Gmail Sync — organizar emails por departamento.
 * Cria labels Somnium/* e permite classificar, mover e marcar como lido.
 */
import { google } from 'googleapis'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OAUTH_PATH = path.join(ROOT, 'google-oauth.json')
const TOKEN_PATH = path.join(ROOT, 'google-token.json')

// Labels por departamento (sem cores customizadas — Gmail tem paleta muito restrita)
const DEPARTMENT_LABELS = [
  'Somnium/Comercial',
  'Somnium/Comercial/Investidores',
  'Somnium/Comercial/Consultores',
  'Somnium/Comercial/Negocios',
  'Somnium/Financeiro',
  'Somnium/Financeiro/Despesas',
  'Somnium/Financeiro/Facturas',
  'Somnium/Administrativo',
  'Somnium/Administrativo/Plataformas',
  'Somnium/Administrativo/Alertas',
  'Somnium/Newsletter',
  'Somnium/Arquivo',
]

// Regras de classificacao automatica (from/subject → label)
const AUTO_RULES = [
  // Comercial
  { match: from => /supercasa|idealista.*imovel|casa\s*sapo/i.test(from), label: 'Somnium/Comercial' },
  { match: (from, subject) => /investidor|capital|proposta.*invest/i.test(subject), label: 'Somnium/Comercial/Investidores' },
  { match: (from, subject) => /consultor|agente.*imobil|parceria/i.test(subject), label: 'Somnium/Comercial/Consultores' },
  { match: (from, subject) => /contrato|cpcv|escritura|negocio/i.test(subject), label: 'Somnium/Comercial/Negocios' },
  // Financeiro
  { match: (from, subject) => /factura|fatura|pagamento|recibo|invoice/i.test(subject), label: 'Somnium/Financeiro/Facturas' },
  { match: (from, subject) => /despesa|custo|orcamento|contabilidade|banco/i.test(subject), label: 'Somnium/Financeiro/Despesas' },
  { match: from => /twilio.*noreply|twilio.*donotreply/i.test(from), label: 'Somnium/Financeiro' },
  // Administrativo
  { match: from => /railway|render|github|vercel|netlify/i.test(from), label: 'Somnium/Administrativo/Alertas' },
  { match: from => /google.*no-reply|accounts\.google/i.test(from), label: 'Somnium/Administrativo' },
  { match: from => /fireflies/i.test(from), label: 'Somnium/Administrativo' },
  { match: from => /skool|notion|supabase/i.test(from), label: 'Somnium/Administrativo/Plataformas' },
  { match: from => /facebook|instagram|linkedin|meta/i.test(from), label: 'Somnium/Administrativo/Plataformas' },
  // Newsletter
  { match: from => /idealista.*news|newsletter|noreply.*news|digest/i.test(from), label: 'Somnium/Newsletter' },
  { match: (from, subject) => /weekly digest|newsletter|novidades/i.test(subject), label: 'Somnium/Newsletter' },
  // Promocional
  { match: from => /growth\.twilio|team\.twilio|teamtwilio/i.test(from), label: 'Somnium/Arquivo' },
  { match: from => /hello@render\.com/i.test(from), label: 'Somnium/Arquivo' },
  { match: from => /idealista.*mailing/i.test(from), label: 'Somnium/Arquivo' },
]

function getGmail() {
  if (!existsSync(OAUTH_PATH) || !existsSync(TOKEN_PATH)) return null
  const creds = JSON.parse(readFileSync(OAUTH_PATH, 'utf8'))
  const { client_id, client_secret } = creds.installed || creds.web
  const oauth2 = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3333')
  oauth2.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, 'utf8')))
  return google.gmail({ version: 'v1', auth: oauth2 })
}

export function isConfigured() {
  return existsSync(OAUTH_PATH) && existsSync(TOKEN_PATH)
}

/**
 * Criar todos os labels Somnium/* se nao existirem.
 * Retorna mapa { nome: id }
 */
export async function ensureLabels() {
  const gmail = getGmail()
  if (!gmail) throw new Error('Gmail nao configurado')

  // Buscar labels existentes
  const { data } = await gmail.users.labels.list({ userId: 'me' })
  const existing = new Map(data.labels.map(l => [l.name, l.id]))
  const labelMap = {}

  // Criar labels em falta (pais primeiro, filhos depois — ja ordenados)
  for (const name of DEPARTMENT_LABELS) {
    if (existing.has(name)) {
      labelMap[name] = existing.get(name)
    } else {
      const { data: created } = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      })
      labelMap[name] = created.id
      console.log(`[gmail] Label criado: ${name}`)
    }
  }

  return labelMap
}

/**
 * Classificar um email automaticamente baseado nas regras.
 * Retorna o nome do label ou null.
 */
export function classifyEmail(from, subject) {
  for (const rule of AUTO_RULES) {
    if (rule.match(from, subject)) return rule.label
  }
  return null
}

/**
 * Aplicar label a uma mensagem e marcar como lida.
 */
export async function organizeMessage(messageId, labelName, markRead = true) {
  const gmail = getGmail()
  if (!gmail) throw new Error('Gmail nao configurado')

  const labelMap = await ensureLabels()
  const labelId = labelMap[labelName]
  if (!labelId) throw new Error(`Label ${labelName} nao encontrado`)

  const modify = { addLabelIds: [labelId] }
  if (markRead) modify.removeLabelIds = ['UNREAD']

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: modify,
  })

  return { messageId, label: labelName, read: markRead }
}

/**
 * Organizar batch de mensagens.
 * Recebe array de { messageId, label, markRead }
 */
export async function organizeBatch(messages) {
  const gmail = getGmail()
  if (!gmail) throw new Error('Gmail nao configurado')

  const labelMap = await ensureLabels()
  const results = []

  for (const msg of messages) {
    try {
      const labelId = labelMap[msg.label]
      if (!labelId) {
        results.push({ messageId: msg.messageId, error: `Label ${msg.label} nao encontrado` })
        continue
      }

      const modify = { addLabelIds: [labelId] }
      if (msg.markRead !== false) modify.removeLabelIds = ['UNREAD']

      await gmail.users.messages.modify({
        userId: 'me',
        id: msg.messageId,
        requestBody: modify,
      })

      results.push({ messageId: msg.messageId, label: msg.label, ok: true })
    } catch (e) {
      results.push({ messageId: msg.messageId, error: e.message })
    }
  }

  return results
}

/**
 * Organizar automaticamente todos os emails nao lidos.
 * Busca emails, classifica por regras, aplica labels, marca como lido.
 */
export async function autoOrganize() {
  const gmail = getGmail()
  if (!gmail) throw new Error('Gmail nao configurado')

  await ensureLabels()

  const labelMap = await ensureLabels()
  const details = []
  let organized = 0
  let skipped = 0
  let totalProcessed = 0
  let pageToken = undefined

  // Processar todas as paginas de emails nao lidos
  do {
    const listParams = { userId: 'me', q: 'is:unread', maxResults: 500 }
    if (pageToken) listParams.pageToken = pageToken

    const { data } = await gmail.users.messages.list(listParams)

    if (!data.messages || data.messages.length === 0) break

    // Processar em batches de 20 para nao sobrecarregar a API
    for (let i = 0; i < data.messages.length; i++) {
      const msg = data.messages[i]
      try {
        const { data: full } = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject'],
        })

        const headers = {}
        for (const h of full.payload.headers) {
          headers[h.name] = h.value
        }

        const label = classifyEmail(headers.From || '', headers.Subject || '')

        if (label) {
          const labelId = labelMap[label]
          if (labelId) {
            await gmail.users.messages.modify({
              userId: 'me',
              id: msg.id,
              requestBody: { addLabelIds: [labelId], removeLabelIds: ['UNREAD'] },
            })
            details.push({ id: msg.id, from: headers.From, subject: headers.Subject, label, action: 'organized' })
            organized++
          }
        } else {
          // Sem regra — marcar como lido e mover para Arquivo
          const arquivoId = labelMap['Somnium/Arquivo']
          if (arquivoId) {
            await gmail.users.messages.modify({
              userId: 'me',
              id: msg.id,
              requestBody: { addLabelIds: [arquivoId], removeLabelIds: ['UNREAD'] },
            })
          } else {
            await gmail.users.messages.modify({
              userId: 'me',
              id: msg.id,
              requestBody: { removeLabelIds: ['UNREAD'] },
            })
          }
          details.push({ id: msg.id, from: headers.From, subject: headers.Subject, label: 'Somnium/Arquivo', action: 'archived' })
          skipped++
        }

        totalProcessed++
        if (totalProcessed % 50 === 0) console.log(`[gmail] Processados ${totalProcessed} emails...`)
      } catch (e) {
        console.error(`[gmail] Erro ao processar ${msg.id}: ${e.message}`)
        totalProcessed++
      }
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  return {
    processed: totalProcessed,
    organized,
    skipped,
    details: details.slice(-50), // ultimos 50 para nao explodir a resposta
  }
}
