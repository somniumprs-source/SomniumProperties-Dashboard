// Renderiza cada página do PDF como PNG via PDF.js (CDN) + Playwright,
// para inspeccionar visualmente se há páginas em branco.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'fs'

const PDF = '/Users/alexandremendes/Desktop/Somnium Properties/SomniumProperties-Dashboard/Manual_Orcamento_Obra_Somnium.pdf'
const OUT = '/Users/alexandremendes/Desktop/Somnium Properties/SomniumProperties-Dashboard/scripts/manual-obra-screenshots/pdf-pages'
mkdirSync(OUT, { recursive: true })

const buf = readFileSync(PDF)
const b64 = buf.toString('base64')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 } })
const page = await ctx.newPage()

const html = `<!DOCTYPE html><html><head>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<style>body{margin:0;background:#444}.p{display:block;margin:8px auto;background:white;box-shadow:0 0 4px #000}</style>
</head><body>
<div id="container"></div>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const b64 = "${b64}";
const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
(async () => {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  window.totalPages = pdf.numPages;
  const container = document.getElementById('container');
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const viewport = p.getViewport({ scale: 1.0 });
    const canvas = document.createElement('canvas');
    canvas.className = 'p'; canvas.id = 'page-' + i;
    canvas.width = viewport.width; canvas.height = viewport.height;
    container.appendChild(canvas);
    await p.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
  window.done = true;
})();
</script></body></html>`

await page.setContent(html)
await page.waitForFunction(() => window.done, { timeout: 90000 })
const total = await page.evaluate(() => window.totalPages)
console.log('Total páginas:', total)
for (let i = 1; i <= total; i++) {
  const el = await page.locator(`#page-${i}`)
  await el.screenshot({ path: `${OUT}/p${String(i).padStart(2,'0')}.png` })
}
await browser.close()
console.log('Done.')
