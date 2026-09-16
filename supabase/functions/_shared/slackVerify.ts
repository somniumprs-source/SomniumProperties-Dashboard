// Verificação de assinatura de eventos Slack (Events API) + resolução do
// nome real de um utilizador Slack (para o campo `funcionario` das tarefas).
// https://api.slack.com/authentication/verifying-requests-from-slack
// Port de src/db/slackVerify.js (HMAC via Web Crypto em vez de node:crypto).

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifySlackSignature(
  { signingSecret, signature, timestamp, rawBody }:
  { signingSecret: string; signature: string; timestamp: string; rawBody: string },
): Promise<boolean> {
  if (!signingSecret || !signature || !timestamp || !rawBody) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false; // >5min: possível replay
  const base = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + await hmacSha256Hex(signingSecret, base);
  return timingSafeEqualStr(expected, signature);
}

const _userNameCache = new Map<string, string>();

export async function resolveSlackUserName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  if (_userNameCache.has(userId)) return _userNameCache.get(userId)!;
  const token = Deno.env.get("SLACK_BOT_TOKEN") || "";
  if (!token) return null;
  try {
    const r = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    const nome = j?.ok ? (j.user?.profile?.real_name || j.user?.real_name || j.user?.name) : null;
    if (nome) _userNameCache.set(userId, nome);
    return nome || null;
  } catch {
    return null;
  }
}
