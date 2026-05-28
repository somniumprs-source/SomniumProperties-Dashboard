// Spike 2: @resvg/resvg-wasm em Deno. Prova: init wasm, render SVG->PNG com fontes Inter.
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

const FONTS = [
  new URL("../../public/fonts/Inter-Regular.ttf", import.meta.url),
  new URL("../../public/fonts/Inter-SemiBold.ttf", import.meta.url),
  new URL("../../public/fonts/Inter-Bold.ttf", import.meta.url),
];

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">
  <rect width="600" height="200" fill="#0d0d0d"/>
  <rect x="0" y="0" width="600" height="8" fill="#C9A84C"/>
  <text x="24" y="70" font-family="Inter" font-size="28" font-weight="700" fill="#C9A84C">Estudo de Localizacao</text>
  <text x="24" y="110" font-family="Inter" font-size="16" fill="#ffffff">Rasterizacao SVG para PNG via resvg-wasm</text>
  <text x="24" y="150" font-family="Inter" font-size="13" fill="#cccccc">Coimbra, Portugal — teste de fontes embutidas</text>
</svg>`;

async function main() {
  console.log("[resvg] a inicializar wasm...");
  await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));

  const fontBuffers = await Promise.all(FONTS.map((u) => Deno.readFile(u)));

  const resvg = new Resvg(SVG, {
    fitTo: { mode: "width", value: 1100 },
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: "Inter" },
  });
  const png = resvg.render().asPng();
  await Deno.writeFile(new URL("./out_resvg.png", import.meta.url), png);

  // PNG magic bytes: 89 50 4E 47
  const ok = png.length > 1000 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47;
  console.log(`[resvg] bytes=${png.length} magic=${png[0].toString(16)} ${png[1].toString(16)} ${png[2].toString(16)} ${png[3].toString(16)}`);
  console.log(`[resvg] RESULTADO: ${ok ? "PASS (gera PNG valido)" : "FAIL"}`);
}

main().catch((e) => { console.error("[resvg] FAIL:", e); Deno.exit(1); });
