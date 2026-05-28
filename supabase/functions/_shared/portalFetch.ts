// Portal Fetch — extrai dados de anuncios imobiliarios a partir de URLs.
// Port de src/db/portalFetch.js. Diferencas para Deno/Edge:
//  - Playwright (Chromium local) nao corre em Edge Functions -> browser REMOTO
//    via Browserless `/content` (HTML renderizado por HTTP). Env: BROWSERLESS_URL,
//    BROWSERLESS_TOKEN. A extraccao extra de domImages (page.evaluate) cai; o
//    HTML ja vem renderizado, por isso o parseHtml (og:image/JSON-LD/img/data-src)
//    apanha a maioria das fotos.
//  - downloadPortalPhotos guarda em Supabase Storage (sem fallback de disco).
import { uploadPublic } from "./storage.ts";

const MAX_PHOTOS = 15;
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const PHOTO_TIMEOUT = 8000;

const EXCLUDE_PATTERNS = /logo|avatar|icon|placeholder|sprite|banner|badge|favicon|widget|button|arrow|pixel|tracking|blank|spacer|captcha/i;

const PORTAL_PATTERNS = [
  { name: "Idealista", pattern: /idealista\.pt/i },
  { name: "Imovirtual", pattern: /imovirtual\.com/i },
  { name: "Supercasa", pattern: /supercasa\.pt/i },
  { name: "ERA", pattern: /era\.pt/i },
  { name: "RE/MAX", pattern: /remax\.pt/i },
  { name: "KW", pattern: /kw(portugal|union)?\.pt/i },
  { name: "Zome", pattern: /zome\.pt/i },
  { name: "Century21", pattern: /century21\.pt/i },
  { name: "Homelusa", pattern: /homelusa\.pt/i },
  { name: "CasasPrime", pattern: /casasprime\.pt/i },
];

export function detectPortalLink(text: string): { url: string; portal: string } | null {
  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!urlMatch) return null;
  const url = urlMatch[0];
  const portal = PORTAL_PATTERNS.find((p) => p.pattern.test(url));
  if (!portal) return null;
  return { url, portal: portal.name };
}

interface PortalData {
  tipologia: string | null;
  zona: string | null;
  ask_price: number | null;
  area_m2: number | null;
  referencia: string | null;
  ano_construcao: number | null;
  fotos_urls: string[];
}

export async function fetchPortalData(url: string): Promise<PortalData | null> {
  // 1. Fetch simples (rapido, sem browser)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-PT,pt;q=0.9",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const html = await res.text();
      const parsed = parseHtml(html, url);
      if (parsed.tipologia || parsed.ask_price || parsed.zona || parsed.fotos_urls.length > 0) {
        console.log("[portalFetch] Fetch simples OK:", url);
        return parsed;
      }
    }
  } catch (e) {
    console.warn("[portalFetch] Fetch simples falhou:", (e as Error).message);
  }

  // 2. Fallback: browser remoto (Browserless)
  console.log("[portalFetch] A tentar com Browserless:", url);
  return fetchWithBrowserless(url);
}

async function fetchWithBrowserless(url: string): Promise<PortalData | null> {
  const base = Deno.env.get("BROWSERLESS_URL");
  const token = Deno.env.get("BROWSERLESS_TOKEN");
  if (!base) {
    console.warn("[portalFetch] BROWSERLESS_URL nao configurado — sem fallback de browser");
    return null;
  }
  try {
    const endpoint = `${base.replace(/\/$/, "")}/content${token ? `?token=${token}` : ""}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        gotoOptions: { waitUntil: "networkidle2", timeout: 20000 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[portalFetch] Browserless HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    const result = parseHtml(html, url);
    console.log(
      `[portalFetch] Browserless OK: ${result.fotos_urls.length} fotos, tipologia=${result.tipologia}, zona=${result.zona}`,
    );
    return result;
  } catch (e) {
    console.warn("[portalFetch] Browserless falhou:", (e as Error).message);
    return null;
  }
}

function parseHtml(html: string, url: string): PortalData {
  const result: PortalData = {
    tipologia: null,
    zona: null,
    ask_price: null,
    area_m2: null,
    referencia: null,
    ano_construcao: null,
    fotos_urls: [],
  };

  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] || "";
  const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1] || "";
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "";
  const fullText = `${ogTitle} ${ogDesc} ${title}`;

  const tipoMatch = fullText.match(/\b([TM]\d+)\b/i) ||
    fullText.match(/\b(moradia|apartamento|pr[eé]dio|loft|duplex|vivenda)\b/i);
  if (tipoMatch) result.tipologia = tipoMatch[1];

  const priceMatch = fullText.match(/(\d[\d\s.,]*)\s*€/) || html.match(/price[^>]*>[\s€]*(\d[\d\s.,]*)/i);
  if (priceMatch) {
    const cleaned = priceMatch[1].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    if (num > 1000 && num < 10000000) result.ask_price = num;
  }

  const areaMatch = fullText.match(/(\d+[\d.,]*)\s*m[²2]/i);
  if (areaMatch) {
    const num = parseFloat(areaMatch[1].replace(",", "."));
    if (num > 10 && num < 5000) result.area_m2 = num;
  }

  const zonaPatterns = [
    /(?:em|in)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de|do|da|dos|das)\s+)?[A-ZÀ-Ú]?[a-zà-ú]*)/,
    /Coimbra[,\s]+([^,\-"]+)/i,
    /(?:Santo|Santa|São)\s+[A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de|do|da|dos|das)\s+[A-ZÀ-Ú]?[a-zà-ú]*)*/,
  ];
  for (const p of zonaPatterns) {
    const m = fullText.match(p);
    if (m) {
      result.zona = (m[1] || m[0]).trim();
      break;
    }
  }

  const refMatch = url.match(/\/(\d{7,10})\/?/) || html.match(/ref[eê]r[eê]ncia[^>]*>[\s:]*([A-Z0-9\-]+)/i);
  if (refMatch) result.referencia = refMatch[1];

  const anoMatch = fullText.match(/(?:ano|constru[çc][aã]o|built)[^0-9]*(\d{4})/i);
  if (anoMatch) {
    const ano = parseInt(anoMatch[1]);
    if (ano >= 1800 && ano <= 2030) result.ano_construcao = ano;
  }

  const imageUrls = new Set<string>();

  const ogImages = html.matchAll(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/gi);
  for (const m of ogImages) if (m[1]) imageUrls.add(m[1]);

  const jsonLdBlocks = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const images = data.image || data.photo?.map((p: any) => p.contentUrl) || [];
      const arr = Array.isArray(images) ? images : [images];
      for (const img of arr) {
        if (typeof img === "string" && img.startsWith("http")) imageUrls.add(img);
      }
    } catch { /* JSON invalido */ }
  }

  const imgTags = html.matchAll(/<img[^>]+src="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi);
  for (const m of imgTags) if (m[1]) imageUrls.add(m[1]);

  const lazySrcs = html.matchAll(/data-(?:src|lazy|original)="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi);
  for (const m of lazySrcs) if (m[1]) imageUrls.add(m[1]);

  const baseUrl = new URL(url).origin;
  result.fotos_urls = [...imageUrls]
    .map((u) => u.startsWith("//") ? `https:${u}` : u)
    .map((u) => u.startsWith("/") ? `${baseUrl}${u}` : u)
    .filter((u) => u.startsWith("http"))
    .filter((u) => !EXCLUDE_PATTERNS.test(u))
    .filter((u) => !u.includes("1x1"))
    .filter((u) => !u.includes("data:image"))
    .slice(0, MAX_PHOTOS);

  return result;
}

interface FotoMeta {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
  uploaded_at: string;
}

// Descarrega fotos e guarda em Supabase Storage (bucket "Imoveis", publico).
export async function downloadPortalPhotos(imovelId: string, fotosUrls: string[]): Promise<FotoMeta[]> {
  if (!fotosUrls?.length) return [];
  const fotos: FotoMeta[] = [];

  for (let i = 0; i < fotosUrls.length; i++) {
    const imageUrl = fotosUrls[i];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PHOTO_TIMEOUT);
      const res = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "image/*",
          "Referer": imageUrl,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) continue;

      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length < 1000 || bytes.length > MAX_PHOTO_SIZE) continue;

      const extMap: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
      const ext = extMap[contentType] || ".jpg";
      const fileId = crypto.randomUUID();
      const filename = `${fileId}${ext}`;
      const storagePath = `imoveis/${imovelId}/${filename}`;

      let filePath: string;
      try {
        filePath = await uploadPublic("Imoveis", storagePath, bytes, contentType);
      } catch (e) {
        console.warn(`[portalFetch] Erro Storage upload foto ${i + 1}:`, (e as Error).message);
        continue;
      }

      fotos.push({
        id: fileId,
        name: `portal-foto-${i + 1}${ext}`,
        path: filePath,
        type: contentType,
        size: bytes.length,
        uploaded_at: new Date().toISOString(),
      });
      console.log(`[portalFetch] Foto ${i + 1}/${fotosUrls.length} importada (${(bytes.length / 1024).toFixed(0)}KB)`);
    } catch (e) {
      console.warn(`[portalFetch] Erro ao descarregar foto ${i + 1}:`, (e as Error).message);
    }
  }
  return fotos;
}
