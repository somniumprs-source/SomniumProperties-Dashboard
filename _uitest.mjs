import { chromium } from 'playwright'
const IMOVEL = process.argv[2]
const errors = []
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', m => { if (m.type()==='error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('PAGEERROR: '+e.message))
await page.goto(`http://localhost:5173/crm?detail=${IMOVEL}`, { waitUntil:'networkidle', timeout:30000 })
await page.waitForTimeout(2500)
// clicar aba Visitas
const visitasTab = page.getByText('Visitas', { exact:true }).first()
await visitasTab.click().catch(()=>{})
await page.waitForTimeout(1500)
// abrir ficha: clicar no botao "Ficha"
const fichaBtn = page.getByRole('button', { name:/Ficha/i }).first()
await fichaBtn.click().catch(e=>errors.push('clickFicha: '+e.message))
await page.waitForTimeout(1200)
const modalVisible = await page.getByText('Ficha de Visita').first().isVisible().catch(()=>false)
const temChecklist = await page.getByText('Estrutura e exterior').first().isVisible().catch(()=>false)
const temDecisao = await page.getByText(/Avançar para estudo de mercado/).first().isVisible().catch(()=>false)
console.log('modal visivel:', modalVisible, '| checklist:', temChecklist, '| decisao:', temDecisao)
await page.screenshot({ path:'/tmp/ficha-modal.png', fullPage:false })
// marcar uma decisao + guardar
await page.getByRole('radio').first().check().catch(()=>{})
await page.getByRole('button', { name:/Guardar ficha/i }).click().catch(e=>errors.push('guardar: '+e.message))
await page.waitForTimeout(2000)
const badge = await page.getByText('Ficha preenchida').first().isVisible().catch(()=>false)
console.log('badge "Ficha preenchida" apos guardar:', badge)
await page.screenshot({ path:'/tmp/ficha-after.png', fullPage:false })
console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0,8) : 'nenhum')
await browser.close()
process.exit(0)
