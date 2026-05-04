import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HTML = path.resolve(__dirname, 'mockup.html')

const SHOTS = [
  'shot-header',
  'shot-pisos',
  'shot-seccao',
  'shot-fiscal',
  'shot-aviso',
]

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1240, height: 900 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.goto('file://' + HTML)
await page.waitForLoadState('networkidle')

for (const id of SHOTS) {
  const el = await page.locator(`#${id}`)
  const out = path.resolve(__dirname, `${id}.png`)
  await el.screenshot({ path: out })
  console.log('  ✓', out)
}

await browser.close()
console.log('Done.')
