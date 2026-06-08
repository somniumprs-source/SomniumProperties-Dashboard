// Gera a imagem de partilha (Open Graph) da landing /investir.
// Reutilizável: editar o HTML abaixo e correr `node scripts/render-og-image.mjs`.
// Output: public/investir/assets/landing/og-image.jpg (1200x630).
import { chromium } from 'playwright';
import path from 'path';

const OUT = path.resolve('public/investir/assets/landing/og-image.jpg');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,500;1,500&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--gold:#C9A84C;--gold-light:#E8D08A}
  .stage{width:1200px;height:630px;position:relative;overflow:hidden;
    background:radial-gradient(ellipse 90% 120% at 78% 50%, #211c12 0%, #131210 45%, #0d0d0d 100%);
    font-family:'Inter',sans-serif;padding:72px 80px}
  .brand{display:flex;align-items:center;gap:16px}
  .mark{width:58px;height:58px;border-radius:10px;background:var(--gold);color:#0d0d0d;
    display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-weight:500;font-size:38px}
  .brand-name{font-size:27px;font-weight:700;color:#fff;letter-spacing:-.01em;line-height:1}
  .brand-loc{font-size:12.5px;font-weight:600;letter-spacing:.22em;color:var(--gold);margin-top:6px}
  .eyebrow{display:flex;align-items:center;gap:14px;margin-top:74px;
    font-size:14px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--gold)}
  .eyebrow::before{content:'';width:38px;height:2px;background:var(--gold)}
  .title{font-family:'Cormorant Garamond',serif;font-weight:500;color:#fff;
    font-size:78px;line-height:1.04;letter-spacing:-.01em;margin-top:24px}
  .title em{font-style:italic;color:var(--gold)}
  .sub{font-size:22px;font-weight:400;color:#c9c7c2;line-height:1.5;margin-top:26px;max-width:760px}
  .pills{display:flex;gap:14px;margin-top:34px}
  .pill{font-size:17px;font-weight:600;color:var(--gold-light);
    border:1.5px solid rgba(201,168,76,.5);border-radius:999px;padding:11px 22px}
</style></head>
<body>
  <div class="stage">
    <div class="brand">
      <div class="mark">S</div>
      <div>
        <div class="brand-name">Somnium Properties</div>
        <div class="brand-loc">COIMBRA · PORTUGAL</div>
      </div>
    </div>
    <div class="eyebrow">Investimento imobiliário com método</div>
    <div class="title">Tens capital.<br>Nós temos os <em>negócios</em>.</div>
    <div class="sub">Imobiliário em Coimbra e no Porto, analisado e estruturado pela Somnium. Passivo ou ativo — escolhes tu.</div>
    <div class="pills">
      <div class="pill">Passivo ou ativo</div>
      <div class="pill">6–12 meses</div>
      <div class="pill">Tickets desde 25 000 €</div>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT, type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log('OG image escrita em', OUT);
