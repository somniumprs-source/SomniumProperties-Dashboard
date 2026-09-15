// Bloqueia SSRF em endpoints que fazem fetch server-side de um URL fornecido
// pelo cliente (scrape de fotos/portais, download de documento por URL).
// Verificação por hostname/IP literal (sem resolver DNS) — cobre o caso comum
// de alguém apontar directamente para um recurso interno (localhost, rede
// privada, endpoint de metadata da cloud 169.254.169.254). Não protege contra
// DNS rebinding (exigiria resolver e fixar o IP na própria ligação), mas essa
// classe de ataque é bem mais difícil de montar do que simplesmente colar um
// URL interno num campo "link do anúncio".
const BLOCKED_HOSTNAMES = new Set([
  "localhost", "0.0.0.0", "::1", "metadata.google.internal",
]);

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + metadata cloud
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 0) return true;
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase();
  return h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd");
}

/**
 * Valida que `raw` é um URL http(s) público antes de o servidor lhe fazer fetch.
 * Lança erro (mensagem amigável) se for um destino interno/não permitido.
 */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL inválido");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Só são permitidos URLs http/https");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error("Destino não permitido");
  if (host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Destino não permitido");
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) throw new Error("Destino não permitido");
  return url;
}
