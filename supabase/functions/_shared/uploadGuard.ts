// Valida uploads antes de gravar no Storage público. Em dev, o multer aplica
// `fileFilter`/`limits.fileSize` (ver src/db/routes.js); em produção (Edge
// Functions) estas rotas aceitavam qualquer extensão/Content-Type vindo do
// cliente sem qualquer verificação, nem impunham o limite de tamanho anunciado
// nas mensagens de erro — permitindo, por exemplo, subir um .html/.svg com
// JavaScript embutido para um bucket público (stored XSS no domínio do
// Storage) ou um ficheiro gigante (DoS).
const DOC_EXT = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic"];
const AUDIO_EXT = [".mp3", ".m4a", ".wav", ".ogg", ".webm", ".mp4", ".aac"];
const OFFICE_EXT = [...DOC_EXT, ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv"];
const DEFAULT_ALLOWED_EXT = new Set(DOC_EXT);
export const AUDIO_ALLOWED_EXT = new Set(AUDIO_EXT);
// Documentos de reunião/relatório internos — além de PDF/imagem, aceitam
// formatos de escritório (actas, decks) que os outros uploads não precisam.
export const OFFICE_ALLOWED_EXT = new Set(OFFICE_EXT);
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

// Rate limit por utilizador (ou IP, se não autenticado) para os endpoints de
// upload — antes eram só protegidos pelo guard de módulo/role, sem limite de
// quantas vezes um utilizador (mesmo legítimo, mesmo comprometido) pode
// escrever no Storage por hora. Em memória por isolate: best-effort, não é
// garantia entre isolates, mas sobe o custo de um flood automatizado.
const _uploadBuckets = new Map<string, { count: number; resetAt: number }>();
export function checkUploadRateLimit(key: string, max = 30, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const bucket = _uploadBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    _uploadBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}
export function uploadRateLimitKey(c: any, userId?: string | null): string {
  if (userId) return `u:${userId}`;
  const ip = (c.req.header("x-forwarded-for") || "").split(",")[0].trim();
  return `ip:${ip || "unknown"}`;
}

export function assertSafeUpload(
  file: { name?: string | null; size: number },
  maxBytes = DEFAULT_MAX_BYTES,
  allowedExt: Set<string> = DEFAULT_ALLOWED_EXT,
): void {
  const ext = (file.name?.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
  if (!allowedExt.has(ext)) {
    throw new Error(`Tipo de ficheiro não permitido${ext ? ` (${ext})` : ""}. Aceites: ${[...allowedExt].join(", ")}.`);
  }
  if (file.size > maxBytes) {
    throw new Error(`Ficheiro demasiado grande (máx. ${Math.round(maxBytes / 1024 / 1024)}MB).`);
  }
}
