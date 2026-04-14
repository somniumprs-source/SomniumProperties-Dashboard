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
 * @param {string} [text] — corpo texto alternativo
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
export async function sendEmail(subject, html, text) {
  if (!isConfigured()) {
    console.warn('[email] SMTP não configurado — email não enviado')
    return { ok: false, error: 'SMTP não configurado' }
  }
  try {
    const info = await getTransporter().sendMail({
      from: EMAIL_FROM,
      to: EMAIL_TO,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    })
    console.log('[email] Enviado:', subject, '→', info.messageId)
    return { ok: true, messageId: info.messageId }
  } catch (e) {
    console.error('[email] Erro:', e.message)
    return { ok: false, error: e.message }
  }
}

/**
 * Envia email de escalada do agente WhatsApp.
 */
export async function sendEscalacaoEmail({ consultorNome, consultorTelefone, pergunta, historico, respostaDada }) {
  const subject = `Somnium — Escalada: ${consultorNome}`
  const html = `
    <h2 style="color:#C9A84C;">Escalada do Agente WhatsApp</h2>
    <p><strong>Consultor:</strong> ${consultorNome} (${consultorTelefone})</p>
    <p><strong>Pergunta/Situação:</strong></p>
    <blockquote style="border-left:3px solid #C9A84C;padding-left:12px;color:#555;">${pergunta}</blockquote>
    <p><strong>Resposta dada pelo agente:</strong></p>
    <blockquote style="border-left:3px solid #999;padding-left:12px;color:#555;">${respostaDada || 'Nenhuma — aguarda decisão humana'}</blockquote>
    ${historico ? `<p><strong>Histórico recente:</strong></p><pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:12px;">${historico}</pre>` : ''}
    <hr>
    <p style="font-size:11px;color:#999;">Gerado automaticamente pelo agente Somnium</p>
  `
  return sendEmail(subject, html)
}
