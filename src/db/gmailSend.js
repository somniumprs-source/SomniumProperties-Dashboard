/**
 * Envio de email pela conta Google ligada ao CRM (somniumprs@gmail.com), via
 * API do Gmail. Para emails pessoais a leads/investidores: saem da caixa real,
 * ficam em "Enviados" e as respostas caem na mesma conversa. Usa o scope
 * gmail.modify, que já inclui o envio.
 * Espelho em supabase/functions/_shared/gmailSend.ts (manter em sync).
 */
import { google } from 'googleapis'
import { getGoogleAuth } from './googleAuth.js'

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')
const cabecalho = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)
const dobrar = (s) => s.replace(/.{1,76}/g, '$&\r\n')

function mensagemMime({ fromName, fromEmail, to, subject, html, text, replyTo }) {
  const fronteira = `somnium_${Date.now().toString(36)}`
  const linhas = [
    `From: ${cabecalho(fromName)} <${fromEmail}>`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${cabecalho(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${fronteira}"`,
    '',
    `--${fronteira}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    dobrar(b64(text || html.replace(/<[^>]+>/g, ''))),
    `--${fronteira}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    dobrar(b64(html)),
    `--${fronteira}--`,
  ]
  return Buffer.from(linhas.join('\r\n'), 'utf8').toString('base64url')
}

/**
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
export async function sendGmail({ to, subject, html, text, replyTo, fromName = 'Alexandre Mendes | Somnium Properties', fromEmail = 'somniumprs@gmail.com' }) {
  const auth = getGoogleAuth()
  if (!auth) return { ok: false, error: 'Google OAuth não configurado' }
  try {
    const api = google.gmail({ version: 'v1', auth })
    const { data } = await api.users.messages.send({
      userId: 'me',
      requestBody: { raw: mensagemMime({ fromName, fromEmail, to, subject, html, text, replyTo }) },
    })
    console.log('[gmail-send] Enviado:', subject, '->', to, data.id)
    return { ok: true, messageId: data.id }
  } catch (e) {
    console.error('[gmail-send] Erro:', e.message)
    return { ok: false, error: e.message }
  }
}
