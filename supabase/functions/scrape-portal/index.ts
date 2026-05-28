// Edge Function "scrape-portal" — importacao de imoveis por URL.
// Usa _shared/portalFetch.ts (browser remoto Browserless + Storage). O caminho
// de fetch simples corre sem browser; o fallback usa BROWSERLESS_URL/TOKEN.
import { createApp } from "../_shared/hono.ts";
import { detectPortalLink, downloadPortalPhotos, fetchPortalData } from "../_shared/portalFetch.ts";

const app = createApp("/scrape-portal");

// Deteccao de link de portal num texto (util para o agente WhatsApp/inbound).
app.post("/detect", async (c) => {
  try {
    const { text } = await c.req.json().catch(() => ({}));
    if (!text) return c.json({ error: "Texto vazio" }, 400);
    return c.json({ link: detectPortalLink(text) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// Extrai dados do anuncio a partir do URL (fetch simples -> Browserless).
app.post("/fetch", async (c) => {
  try {
    const { url } = await c.req.json().catch(() => ({}));
    if (!url || !/^https?:\/\//i.test(url)) return c.json({ error: "URL invalido" }, 400);
    const data = await fetchPortalData(url);
    if (!data) return c.json({ error: "Nao foi possivel extrair dados do URL", data: null }, 502);
    return c.json({ data });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// Descarrega fotos do anuncio e guarda no Storage, associadas ao imovel.
app.post("/photos", async (c) => {
  try {
    const { imovelId, fotosUrls } = await c.req.json().catch(() => ({}));
    if (!imovelId) return c.json({ error: "imovelId em falta" }, 400);
    if (!Array.isArray(fotosUrls) || fotosUrls.length === 0) return c.json({ fotos: [] });
    const fotos = await downloadPortalPhotos(imovelId, fotosUrls);
    return c.json({ fotos });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.get("/_health", (c) => c.json({ ok: true, fn: "scrape-portal" }));

Deno.serve(app.fetch);
