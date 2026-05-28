// Rasterizacao SVG -> PNG para Edge Functions. Port de rasterizarSvgParaPng()
// de src/lib/estudoLocalizacao.js. @resvg/resvg-js (nativo) nao corre em Deno ->
// usamos @resvg/resvg-wasm. Diferencas: initWasm() uma vez; fontes via fontBuffers
// (Uint8Array) em vez de fontFiles (paths). Validado no spike (resvg_test.ts).

import { initWasm, Resvg } from "@resvg/resvg-wasm";

const PNG_TARGET_WIDTH = 1100;

// Binario wasm: por defeito do CDN (jsdelivr) pinado a 2.6.2; override por env.
const WASM_URL = Deno.env.get("RESVG_WASM_URL") ||
  "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm";

// Fontes Inter empacotadas no repo (public/fonts/*.ttf). Em local resolvem por
// import.meta.url; em deploy precisam de ser incluidas no bundle da funcao
// (tratar na fase de deploy — copiar para junto da funcao se o eszip nao as apanhar).
const FONT_FILES = [
  new URL("../../../public/fonts/Inter-Regular.ttf", import.meta.url),
  new URL("../../../public/fonts/Inter-SemiBold.ttf", import.meta.url),
  new URL("../../../public/fonts/Inter-Bold.ttf", import.meta.url),
];

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = initWasm(fetch(WASM_URL));
  return wasmReady;
}

let fontBuffers: Uint8Array[] | null = null;
async function loadFonts(): Promise<Uint8Array[]> {
  if (fontBuffers) return fontBuffers;
  fontBuffers = await Promise.all(FONT_FILES.map((u) => Deno.readFile(u)));
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
