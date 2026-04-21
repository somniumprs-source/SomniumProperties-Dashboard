/**
 * Notification Service — envia emails de notificacao WhatsApp via Gmail API.
 * Cria automaticamente o label "Consultores" no Gmail.
 * Reutiliza o padrao OAuth de gmailSync.js.
 */
import { google } from 'googleapis'
import { getGoogleAuth, isGoogleConfigured } from './googleAuth.js'

const LABEL_NAME = 'Consultores'
let cachedLabelId = null

function getGmail() {
  const auth = getGoogleAuth()
  if (!auth) return null
  return google.gmail({ version: 'v1', auth })
}

export function isConfigured() {
  return isGoogleConfigured()
}

/**
 * Obter ou criar o label "Consultores" no Gmail.
 */
async function ensureLabel(gmail) {
  if (cachedLabelId) return cachedLabelId

  const { data } = await gmail.users.labels.list({ userId: 'me' })
  const existing = data.labels.find(l => l.name === LABEL_NAME)
  if (existing) {
    cachedLabelId = existing.id
    return cachedLabelId
  }

  // Criar label
  const { data: newLabel } = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: LABEL_NAME,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  })
  cachedLabelId = newLabel.id
  console.log(`[notif] Label "${LABEL_NAME}" criado no Gmail: ${cachedLabelId}`)
  return cachedLabelId
}

/**
 * Construir email MIME raw para Gmail API.
 */
function buildMimeEmail({ to, subject, html }) {
  const boundary = '----=_Part_' + Date.now()
  const lines = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    html.replace(/<[^>]+>/g, ''),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '',
    `--${boundary}--`,
  ]
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

/**
 * Enviar notificacao de interaccao WhatsApp por email.
 * O email e automaticamente colocado no label "Consultores".
 *
 * @param {Object} params
 * @param {string} params.consultorNome — nome do consultor
 * @param {string} params.direcao — 'Recebido' ou 'Enviado'
 * @param {string} params.mensagem — texto da mensagem
 * @param {string} [params.decisao] — decisao do agente (ADICIONAR, TRIAGEM, etc.)
 * @param {string} [params.prioridade] — prioridade (OURO, NORMAL, URGENTE)
 * @param {number} [params.confianca] — nivel de confianca (0-100)
 */
export async function sendWhatsAppNotification({ consultorNome, direcao, mensagem, decisao, prioridade, confianca }) {
  const gmail = getGmail()
  if (!gmail) {
    console.warn('[notif] Gmail nao configurado — notificacao nao enviada')
    return
  }

  try {
    const labelId = await ensureLabel(gmail)

    // Obter email do utilizador autenticado
    const { data: profile } = await gmail.users.getProfile({ userId: 'me' })
    const userEmail = profile.emailAddress

    const isRecebido = direcao === 'Recebido'
    const subject = isRecebido
      ? `[Consultores] ${consultorNome} enviou mensagem`
      : `[Consultores] Agente respondeu a ${consultorNome}`

    const decisaoHtml = decisao
      ? `<p style="margin:8px 0 0;font-size:12px;color:#666;">
          <strong>Decisao:</strong> ${decisao}
          ${prioridade ? ` | <strong>Prioridade:</strong> ${prioridade}` : ''}
          ${confianca != null ? ` | <strong>Confianca:</strong> ${confianca}%` : ''}
        </p>`
      : ''

    const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:500px;margin:0 auto;">
      <div style="background:${isRecebido ? '#25D366' : '#C9A84C'};color:white;padding:12px 16px;border-radius:8px 8px 0 0;">
        <strong>${isRecebido ? 'Mensagem recebida' : 'Resposta do agente'}</strong>
        <span style="float:right;font-size:12px;">${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div style="border:1px solid #e5e5e5;border-top:0;padding:16px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 8px;font-size:13px;color:#888;">
          <strong>${isRecebido ? consultorNome : 'Agente Alexandre'}</strong> via WhatsApp
        </p>
        <div style="background:${isRecebido ? '#fff' : '#DCF8C6'};padding:12px;border-radius:8px;border:1px solid #e5e5e5;">
          <p style="margin:0;font-size:14px;color:#333;white-space:pre-line;">${(mensagem || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>
        ${decisaoHtml}
        <p style="margin:12px 0 0;font-size:11px;color:#aaa;">
          Somnium Properties — Agente WhatsApp
        </p>
      </div>
    </div>`

    const raw = buildMimeEmail({ to: userEmail, subject, html })

    // Enviar email e aplicar label
    const { data: sent } = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    })

    // Aplicar label "Consultores" ao email enviado
    if (sent.id && labelId) {
      await gmail.users.messages.modify({
        userId: 'me',
        id: sent.id,
        requestBody: { addLabelIds: [labelId] },
      })
    }

    console.log(`[notif] Email enviado: ${subject} (${sent.id})`)
  } catch (e) {
    console.error('[notif] Erro ao enviar notificacao:', e.message)
  }
}
