// Rasterizacao SVG -> PNG para Edge Functions. Port de rasterizarSvgParaPng()
// de src/lib/estudoLocalizacao.js. @resvg/resvg-js (nativo) nao corre em Deno ->
// usamos @resvg/resvg-wasm. Diferencas: initWasm() uma vez; fontes via fontBuffers
// (Uint8Array) em vez de fontFiles (paths). Validado no spike (resvg_test.ts).

import { initWasm, Resvg } from "@resvg/resvg-wasm";

const PNG_TARGET_WIDTH = 1100;

// Binario wasm: por defeito do CDN (jsdelivr) pinado a 2.6.2; override por env.
const WASM_URL = Deno.env.get("RESVG_WASM_URL") ||
  "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm";

// Fontes Inter (public/fonts/*.ttf). Em dev (import.meta.url file://) leem-se do
// disco; em deploy a pasta public NAO vai no eszip — logo obtem-se por fetch do
// Supabase Storage (bucket Imoveis publico, assets/fonts/). Base configuravel por
// env; default deriva de SUPABASE_URL. Mantemos o bundle pequeno (limite apertado
// das Edge Functions) ao nao embeber os ~200KB de fontes no codigo.
const FONT_NAMES = ["Inter-Regular.ttf", "Inter-SemiBold.ttf", "Inter-Bold.ttf"];
const FONT_LOCAL = FONT_NAMES.map((n) =>
  new URL(`../../../public/fonts/${n}`, import.meta.url)
);
const FONT_REMOTE_BASE = (Deno.env.get("INTER_FONTS_BASE_URL") ||
  `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/Imoveis/assets/fonts`)
  .replace(/\/$/, "");

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = initWasm(fetch(WASM_URL));
  return wasmReady;
}

async function loadFont(i: number): Promise<Uint8Array> {
  // Dev/spike: ficheiro local resolve por import.meta.url.
  try {
    return await Deno.readFile(FONT_LOCAL[i]);
  } catch {
    // Deploy: ler do Storage publico.
    const res = await fetch(`${FONT_REMOTE_BASE}/${FONT_NAMES[i]}`);
    if (!res.ok) {
      throw new Error(
        `Falha a obter fonte ${FONT_NAMES[i]} de ${FONT_REMOTE_BASE}: HTTP ${res.status}`,
      );
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}

let fontBuffers: Uint8Array[] | null = null;
async function loadFonts(): Promise<Uint8Array[]> {
  if (fontBuffers) return fontBuffers;
  fontBuffers = await Promise.all(FONT_NAMES.map((_, i) => loadFont(i)));
  return fontBuffers;
}

export async function rasterizarSvgParaPng(
  svg: string,
  { largura = PNG_TARGET_WIDTH }: { largura?: number } = {},
): Promise<Uint8Array> {
  await ensureWasm();
  const fonts = await loadFonts();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: largura },
    font: {
      fontBuffers: fonts,
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
  });
  return resvg.render().asPng();
}
