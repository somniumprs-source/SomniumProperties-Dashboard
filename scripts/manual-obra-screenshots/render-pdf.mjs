import { chromium } from 'playwright'
import path from 'path'
import { mkdirSync } from 'fs'
mkdirSync('/tmp/pdf-pages', { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 } })
const page = await ctx.newPage()

// Carregar PDF.js viewer com o nosso ficheiro
const pdfPath = '/Users/alexandremendes/Desktop/Somnium Properties/SomniumProperties-Dashboard/Manual_Orcamento_Obra_Somnium.pdf'

// Embutir o PDF numa página HTML que usa PDF.js do CDN
const html = `<!DOCTYPE html><html><head>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<style>body{margin:0;background:#444}.p{display:block;margin:10px auto;background:white;box-shadow:0 0 5px #000}</style>
</head><body>
<div id="container"></div>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const url = 'file://${pdfPath}';
(async () => {
  const pdf = await pdfjsLib.getDocument(url).promise;
  window.totalPages = pdf.numPages;
  const container = document.getElementById('container');
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const viewport = p.getViewport({ scale: 1.2 });
    const canvas = document.createElement('canvas');
    canvas.className = 'p';
    canvas.id = 'page-' + i;
    canvas.width = viewport.width; canvas.height = viewport.height;
    container.appendChild(canvas);
    await p.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
  window.done = true;
})();
</script></body></html>`

await page.setContent(html)
await page.waitForFunction(() => window.done, { timeout: 60000 })
const total = await page.evaluate(() => window.totalPages)
console.log('Total páginas:', total)
for (let i = 1; i <= total; i++) {
  const el = await page.locator(`#page-${i}`)
  await el.screenshot({ path: `/tmp/pdf-pages/p${String(i).padStart(2,'0')}.png` })
}
await browser.close()
console.log('Done.')
