// Captura map.html para map.png usando o Chromium do Playwright (sem chave de API).
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const HERE = __dirname;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(HERE, 'map.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500); // garantir tiles carregadas
  await page.locator('#map').screenshot({ path: path.join(HERE, 'map.png') });
  await browser.close();
  console.log('map.png capturado');
})().catch(e => { console.error(e); process.exit(1); });
