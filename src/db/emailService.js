/**
 * Email service — wrapper nodemailer para envio de relatórios.
 * Credenciais lidas exclusivamente de variáveis de ambiente.
 */
import nodemailer from 'nodemailer'

const {
  EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_PASS,
  EMAIL_FROM, EMAIL_TO,
} = process.env

let transporter = null

export function isConfigured() {
  return !!(EMAIL_SMTP_HOST && EMAIL_SMTP_USER && EMAIL_SMTP_PASS && EMAIL_FROM && EMAIL_TO)
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: EMAIL_SMTP_HOST,
      port: parseInt(EMAIL_SMTP_PORT || '587'),
      secure: parseInt(EMAIL_SMTP_PORT || '587') === 465,
      auth: { user: EMAIL_SMTP_USER, pass: EMAIL_SMTP_PASS },
    })
  }
  return transporter
}

/**
 * Envia email.
 * @param {string} subject
 * @param {string} html — corpo HTML
 * @param {string|object} [textOrOpts] — corpo texto alternativo OU { to, text } para destinatário custom
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
export async function sendEmail(subject, html, textOrOpts) {
  if (!isConfigured()) {
    console.warn('[email] SMTP não configurado — email não enviado')
    return { ok: false, error: 'SMTP não configurado' }
  }
  // Suporta forma antiga sendEmail(subject, html, text) e nova sendEmail(subject, html, { to, text, attachments })
  let to = EMAIL_TO
  let text, attachments
  if (typeof textOrOpts === 'string') text = textOrOpts
  else if (textOrOpts && typeof textOrOpts === 'object') {
    to = textOrOpts.to || EMAIL_TO
    text = textOrOpts.text
    attachments = textOrOpts.attachments
  }
  try {
    const info = await getTransporter().sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
      ...(attachments ? { attachments } : {}),
    })
    console.log('[email] Enviado:', subject, '→', to, info.messageId)
    return { ok: true, messageId: info.messageId }
  } catch (e) {
    console.error('[email] Erro:', e.message)
    return { ok: false, error: e.message }
  }
}
