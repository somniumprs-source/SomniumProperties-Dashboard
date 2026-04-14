/**
 * WhatsApp Agent — Agente IA "Alexandre" da Somnium Properties.
 * Recebe mensagens via Twilio webhook, acumula com timer, processa com Claude API.
 */
import pool from './pg.js'
import { randomUUID } from 'crypto'
import { detectPortalLink, fetchPortalData } from './portalFetch.js'
import { sendEscalacaoEmail } from './emailService.js'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER

// ── Acumulador de mensagens (por número, com timer) ─────────
const messageBuffers = new Map() // phone → { messages: [], timer: null, urgente: false }

const URGENCY_WORDS = ['urgente', 'esta semana', 'outro investidor', 'já tem visitas', 'vai sair do mercado', 'aceitam proposta', 'ja tem visitas', 'aceitam']

function isUrgent(text) {
  const lower = (text || '').toLowerCase()
  return URGENCY_WORDS.some(w => lower.includes(w))
}

// ── Enviar WhatsApp via Twilio ──────────────────────────────
async function sendWhatsApp(to, body) {
  try {
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_NUMBER) {
      console.warn('[whatsapp] Twilio não configurado')
      return null
    }
    const twilio = (await import('twilio')).default
    const client = twilio(TWILIO_SID, TWILIO_TOKEN)
    const msg = await client.messages.create({
      from: TWILIO_NUMBER,
      to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
      body,
    })
    console.log('[whatsapp] Enviado:', msg.sid, '→', to)
    return msg
  } catch (e) {
    console.error('[whatsapp] Erro envio:', e.message)
    return null
  }
}

// ── Horário activo ──────────────────────────────────────────
function isActiveHours() {
  const now = new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' })
  const hour = new Date(now).getHours()
  return hour >= 8 && hour < 23.5
}

// ── System Prompt ───────────────────────────────────────────
const SYSTEM_PROMPT = `
És o Alexandre, comercial da Somnium Properties.

IDENTIDADE:
Nome: Alexandre · Empresa: Somnium Properties
Horário activo: 08:00–23:30 (Europe/Lisbon)
Fora de horário: acumula, responde às 08:00 com "Bom dia"

TOM E ESTILO:
Profissional mas acessível. Elegante sem ser formal.
Máximo 3 linhas por mensagem.
Nunca "conforme", "relativamente", "neste sentido".
Cada mensagem tem sempre um propósito.
Primeiro contacto: directo e informal.
Relação existente: amigável, pode referenciar contexto anterior.

ZONAS DE INTERESSE:
Concelho de Coimbra (todas as freguesias)
Zona central de Condeixa-a-Nova
Ventosa do Bairro (Mealhada)
Outras zonas: nunca confirmar nem rejeitar — pedir dados e deixar para análise interna.

CRITÉRIOS SOP §5.1:
Obrigatório: Equity com margem negocial
  Sinais: imóvel antigo (anterior a 2000), preço abaixo da média, "dão desconto", margem implícita
Adicional mínimo 1:
  Obras: "precisa de obras", "para remodelar", "degradado"
  Pressão de venda: emigração, herança, divórcio, lar, prazo concreto, "quer resolver depressa"
Combinações:
  Equity + Obras + Pressão = OURO
  Equity + Obras = QUALIFICADO
  Equity + Pressão = QUALIFICADO
  Só Equity = TRIAGEM
  Sem Equity = IGNORAR
Valor máximo de aquisição: 250.000€

DECISÕES:
ADICIONAR: 2+ critérios, confiança >= 60% → CRM estado Pré-aprovação + notificação
TRIAGEM: imóvel detectado, info insuficiente → pede max 2 campos em falta → reminder diferente às 24h → triagem manual às 48h + email
IGNORAR: sem equity, casual, dispersão → sem resposta, sem custo
RESPONDER_CRITERIOS: pergunta sobre o que procuramos → explica perfil de forma natural, fica à escuta
RESPONDER_QUEM_SOMOS: não sabe quem somos → apresenta Somnium + critérios numa mensagem
AGUARDAR: "vou verificar", "já te digo", "ok" → sem resposta, timer 48h
DUPLICADO: imóvel já no CRM → "Esse imóvel já está no nosso radar"
ESCALAR: proposta, compromisso, financeiro, pergunta sem resposta → "Vou verificar e dou-te feedback" + email

PORTAL vs OFF-MARKET:
Portal: "Vi o imóvel. Vou analisar e dou-te retorno ainda hoje."
Off-Market: "Off-market é exactamente onde nos movemos mais rápido. Dá-me os detalhes."

URGÊNCIA (timer 30s, flag URGENTE, alerta 1h):
"urgente", "esta semana", "outro investidor", "já tem visitas", "vai sair do mercado"

ESCALADA POR EMAIL:
Situações: proposta, compromisso, financeiro, pergunta sem resposta
Resposta: "Vou verificar e dou-te feedback."

LIMITES ABSOLUTOS:
Nunca: "vamos avançar", "temos interesse"
Nunca: comprometer valor ou proposta
Nunca: confirmar disponibilidade financeira
Nunca: revelar critérios internos
Nunca: responder fora de 08:00–23:30

Devolve SEMPRE JSON com este schema exacto:
{
  "decisao": "ADICIONAR|TRIAGEM|IGNORAR|RESPONDER_CRITERIOS|RESPONDER_QUEM_SOMOS|AGUARDAR|DUPLICADO|ESCALAR",
  "prioridade": "OURO|NORMAL|URGENTE|null",
  "confianca": 0-100,
  "resposta_consultor": "texto|null",
  "escalar_email": true|false,
  "imovel": {
    "tipologia": "string|null",
    "zona": "string|null",
    "ask_price": "number|null",
    "area_m2": "number|null",
    "tipo": "PORTAL|OFF-MARKET",
    "link_anuncio": "string|null",
    "ano_construcao": "number|null",
    "criterios": {
      "equity": true|false|null,
      "obras": true|false|null,
      "pressao_venda": true|false|null
    },
    "notas": "string"
  },
  "motivo": "string"
}
`

// ── Processar mensagens acumuladas ──────────────────────────
async function processMessages(phone) {
  const buffer = messageBuffers.get(phone)
  if (!buffer || buffer.messages.length === 0) return
  messageBuffers.delete(phone)

  const combinedText = buffer.messages.map(m => m.body).join('\n')
  const urgente = buffer.urgente
  const now = new Date()

  console.log(`[agent] Processando ${buffer.messages.length} msgs de ${phone} (urgente: ${urgente})`)

  try {
    // 1. Identificar consultor
    const cleanPhone = phone.replace('whatsapp:', '').replace(/\s/g, '')
    const { rows } = await pool.query(
      "SELECT * FROM consultores WHERE REPLACE(REPLACE(contacto, ' ', ''), '+', '') LIKE $1 OR contacto LIKE $2",
      [`%${cleanPhone.slice(-9)}`, `%${cleanPhone.slice(-9)}%`]
    )
    let consultor = rows[0]

    if (!consultor) {
      // Criar novo consultor classe D
      const id = randomUUID()
      const nowStr = now.toISOString()
      await pool.query(
        `INSERT INTO consultores (id, nome, contacto, estatuto, estado_avaliacao, classificacao, created_at, updated_at)
         VALUES ($1, $2, $3, 'Cold Call', 'Em avaliação', 'D', $4, $4)`,
        [id, `Consultor ${cleanPhone.slice(-4)}`, cleanPhone, nowStr]
      )
      const { rows: [novo] } = await pool.query('SELECT * FROM consultores WHERE id = $1', [id])
      consultor = novo
      console.log(`[agent] Novo consultor criado: ${consultor.nome} (${cleanPhone})`)
    }

    // 2. Verificar controlo manual
    if (consultor.controlo_manual) {
      console.log(`[agent] ${consultor.nome} em controlo manual — ignorado`)
      // Registar no log mesmo assim
      await pool.query(
        'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), consultor.id, now.toISOString(), 'whatsapp', 'Resposta', combinedText]
      )
      return
    }

    // 3. Verificar horário
    if (!isActiveHours()) {
      console.log(`[agent] Fora de horário — acumulado para 08:00`)
      await pool.query(
        'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), consultor.id, now.toISOString(), 'whatsapp', 'Resposta', combinedText]
      )
      return
    }

    // 4. Fetch portal data se houver link
    let portalData = null
    const portalLink = detectPortalLink(combinedText)
    if (portalLink) {
      console.log(`[agent] Link detectado: ${portalLink.portal} — ${portalLink.url}`)
      portalData = await fetchPortalData(portalLink.url)
    }

    // 5. Carregar histórico recente
    const { rows: historico } = await pool.query(
      'SELECT direcao, notas, data_hora FROM consultor_interacoes WHERE consultor_id = $1 ORDER BY data_hora DESC LIMIT 10',
      [consultor.id]
    )
    const historicoText = historico.reverse().map(h =>
      `[${new Date(h.data_hora).toLocaleString('pt-PT')}] ${h.direcao === 'Enviado' ? 'Alexandre' : consultor.nome}: ${h.notas}`
    ).join('\n')

    // 6. Verificar duplicado
    const { rows: imoveisExistentes } = await pool.query('SELECT nome, zona, tipologia, ask_price FROM imoveis')

    // 7. Chamar Claude API
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

    const userContent = `
CONSULTOR: ${consultor.nome} (${consultor.contacto}) — Classe ${consultor.classificacao || 'D'} — ${consultor.estatuto}
AGÊNCIA: ${(() => { try { return JSON.parse(consultor.imobiliaria || '[]').join(', ') } catch { return 'Desconhecida' } })()}
PRIMEIRO CONTACTO: ${historico.length === 0 ? 'SIM' : 'NÃO — já temos histórico'}

HISTÓRICO RECENTE:
${historicoText || '(sem histórico)'}

${portalData ? `DADOS EXTRAÍDOS DO PORTAL (${portalLink.portal}):
Link: ${portalLink.url}
Tipologia: ${portalData.tipologia || '?'}
Zona: ${portalData.zona || '?'}
Preço: ${portalData.ask_price || '?'}€
Área: ${portalData.area_m2 || '?'}m²
Ano: ${portalData.ano_construcao || '?'}
` : ''}

IMÓVEIS JÁ NO CRM (para detecção de duplicado):
${imoveisExistentes.map(i => `- ${i.nome} | ${i.zona || '?'} | ${i.tipologia || '?'} | ${i.ask_price || '?'}€`).join('\n')}

MENSAGEM${buffer.messages.length > 1 ? 'S' : ''} DO CONSULTOR:
${combinedText}

${urgente ? '⚠️ URGÊNCIA DETECTADA — prioridade máxima' : ''}
`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        { role: 'user', content: userContent }
      ],
      system: SYSTEM_PROMPT,
    })

    const responseText = response.content[0]?.text || '{}'
    let decision
    try {
      // Extrair JSON (pode estar envolvido em markdown)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      decision = JSON.parse(jsonMatch?.[0] || responseText)
    } catch {
      console.error('[agent] Resposta inválida do Claude:', responseText.slice(0, 200))
      return
    }

    console.log(`[agent] Decisão: ${decision.decisao} | Prioridade: ${decision.prioridade} | Confiança: ${decision.confianca}`)

    // 8. Registar interacção do consultor
    await pool.query(
      'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
      [randomUUID(), consultor.id, now.toISOString(), 'whatsapp', 'Resposta', combinedText]
    )

    // 9. Enviar resposta se existir
    if (decision.resposta_consultor) {
      await sendWhatsApp(phone, decision.resposta_consultor)
      // Registar resposta do agente
      await pool.query(
        'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), consultor.id, new Date().toISOString(), 'whatsapp', 'Enviado', `[AGENTE] ${decision.resposta_consultor}`]
      )
    }

    // 10. Actuar conforme decisão
    if (decision.decisao === 'ADICIONAR' && decision.imovel) {
      // Verificar duplicado (zona + tipologia + preço ±10%)
      const im = decision.imovel
      const isDuplicate = imoveisExistentes.some(e => {
        if (!im.zona || !e.zona) return false
        const zonaSimilar = e.zona.toLowerCase().includes(im.zona.toLowerCase()) || im.zona.toLowerCase().includes(e.zona?.toLowerCase())
        const tipoSimilar = im.tipologia && e.tipologia && e.tipologia.toLowerCase() === im.tipologia.toLowerCase()
        const precoSimilar = im.ask_price && e.ask_price && Math.abs(e.ask_price - im.ask_price) / e.ask_price <= 0.10
        return zonaSimilar && (tipoSimilar || precoSimilar)
      })

      if (isDuplicate) {
        if (decision.resposta_consultor) {
          await sendWhatsApp(phone, 'Esse imóvel já está no nosso radar — estamos a acompanhar a situação. Se houver novidade do lado do proprietário avisa-nos.')
        }
        console.log('[agent] Duplicado detectado — não criado no CRM')
      } else {
        // Criar imóvel em Pré-aprovação
        const imovelId = randomUUID()
        await pool.query(
          `INSERT INTO imoveis (id, nome, estado, nome_consultor, origem, tipo_oportunidade, link, tipologia, zona, ask_price, area_util, notas, created_at, updated_at, data_adicionado)
           VALUES ($1, $2, 'Pré-aprovação', $3, 'Consultor', $4, $5, $6, $7, $8, $9, $10, $11, $11, $12)`,
          [
            imovelId,
            im.tipologia && im.zona ? `${im.tipologia} ${im.zona}` : `Imóvel ${consultor.nome}`,
            consultor.nome,
            im.tipo === 'PORTAL' ? 'Portal' : 'Off-Market',
            im.link_anuncio || portalLink?.url || null,
            im.tipologia, im.zona, im.ask_price || 0, im.area_m2 || null,
            `[Agente] ${decision.motivo || ''}\nPrioridade: ${decision.prioridade || 'NORMAL'}\nConfiança: ${decision.confianca}%\nCritérios: equity=${im.criterios?.equity}, obras=${im.criterios?.obras}, pressão=${im.criterios?.pressao_venda}`,
            now.toISOString(), now.toISOString().slice(0, 10),
          ]
        )
        console.log(`[agent] Imóvel criado em Pré-aprovação: ${imovelId}`)
      }
    }

    // 11. Escalada por email
    if (decision.escalar_email) {
      await sendEscalacaoEmail({
        consultorNome: consultor.nome,
        consultorTelefone: consultor.contacto,
        pergunta: combinedText,
        historico: historicoText,
        respostaDada: decision.resposta_consultor,
      })
    }

    // 12. Actualizar consultor
    await pool.query(
      'UPDATE consultores SET updated_at = $1 WHERE id = $2',
      [now.toISOString(), consultor.id]
    )

  } catch (e) {
    console.error('[agent] Erro processamento:', e.message)
  }
}

// ── Receber mensagem WhatsApp ───────────────────────────────
export function receiveWhatsAppMessage(from, body, isFromAgent = true) {
  const phone = from.replace('whatsapp:', '')

  // Se mensagem vem de humano (não do agente) → handoff
  if (!isFromAgent) {
    pool.query('UPDATE consultores SET controlo_manual = true, updated_at = $1 WHERE REPLACE(REPLACE(contacto, \' \', \'\'), \'+\', \'\') LIKE $2',
      [new Date().toISOString(), `%${phone.slice(-9)}%`]
    ).catch(e => console.warn('[agent] Erro handoff:', e.message))
    return
  }

  let buffer = messageBuffers.get(phone)
  if (!buffer) {
    // Primeiro mensagem — iniciar timer
    const urgente = isUrgent(body)
    const timerMs = urgente ? 30000 : 120000 // 30s urgente, 120s normal
    buffer = {
      messages: [],
      urgente,
      timer: setTimeout(() => processMessages(phone), timerMs),
    }
    messageBuffers.set(phone, buffer)
    console.log(`[agent] Timer iniciado para ${phone}: ${timerMs / 1000}s (urgente: ${urgente})`)
  }

  // Acumular (timer NÃO reinicia)
  buffer.messages.push({ body, timestamp: new Date().toISOString() })
  if (isUrgent(body)) buffer.urgente = true
}

// ── Enviar mensagem WhatsApp (para follow-ups) ──────────────
export { sendWhatsApp }

// ── Verificar se está configurado ───────────────────────────
export function isConfigured() {
  return !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_NUMBER && ANTHROPIC_KEY)
}
