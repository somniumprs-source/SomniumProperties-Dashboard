// Captura todos os map*.html para PNG usando o Chromium do Playwright (sem chave de API).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const HERE = __dirname;
  const files = fs.readdirSync(HERE).filter(f => /^map.*\.html$/.test(f));
  const browser = await chromium.launch();
  for (const f of files) {
    const html = fs.readFileSync(path.join(HERE, f), 'utf8');
    const wm = html.match(/#map\{width:(\d+)px;height:(\d+)px\}/);
    const W = wm ? +wm[1] : 1240, H = wm ? +wm[2] : 1040;
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    await page.goto('file://' + path.join(HERE, f), { waitUntil: 'networkidle' });
    await page.waitForTimeout(3200);
    const out = f.replace(/\.html$/, '.png');
    await page.locator('#map').screenshot({ path: path.join(HERE, out) });
    await page.close();
    console.log(out, 'capturado');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
