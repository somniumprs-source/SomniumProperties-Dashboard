// Valida uploads antes de gravar no Storage público. Em dev, o multer aplica
// `fileFilter`/`limits.fileSize` (ver src/db/routes.js); em produção (Edge
// Functions) estas rotas aceitavam qualquer extensão/Content-Type vindo do
// cliente sem qualquer verificação, nem impunham o limite de tamanho anunciado
// nas mensagens de erro — permitindo, por exemplo, subir um .html/.svg com
// JavaScript embutido para um bucket público (stored XSS no domínio do
// Storage) ou um ficheiro gigante (DoS).
const ALLOWED_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic"]);
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

export function assertSafeUpload(
  file: { name?: string | null; size: number },
  maxBytes = DEFAULT_MAX_BYTES,
): void {
  const ext = (file.name?.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`Tipo de ficheiro não permitido${ext ? ` (${ext})` : ""}. Aceites: PDF, JPG, PNG, WEBP, HEIC.`);
  }
  if (file.size > maxBytes) {
    throw new Error(`Ficheiro demasiado grande (máx. ${Math.round(maxBytes / 1024 / 1024)}MB).`);
  }
}
