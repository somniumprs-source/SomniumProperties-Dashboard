/**
 * Verificação de assinatura de eventos Slack (Events API) + resolução do
 * nome real de um utilizador Slack (para o campo `funcionario` das tarefas).
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
import { createHmac, timingSafeEqual } from 'crypto'

export function verifySlackSignature({ signingSecret, signature, timestamp, rawBody }) {
  if (!signingSecret || !signature || !timestamp || !rawBody) return false
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false // >5min: possível replay
  const base = `v0:${timestamp}:${rawBody}`
  const expected = 'v0=' + createHmac('sha256', signingSecret).update(base).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

const _userNameCache = new Map()

export async function resolveSlackUserName(userId) {
  if (!userId) return null
  if (_userNameCache.has(userId)) return _userNameCache.get(userId)
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return null
  try {
    const r = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const j = await r.json()
    const nome = j?.ok ? (j.user?.profile?.real_name || j.user?.real_name || j.user?.name) : null
    if (nome) _userNameCache.set(userId, nome)
    return nome || null
  } catch {
    return null
  }
}
