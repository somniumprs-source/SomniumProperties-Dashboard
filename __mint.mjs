import { chromium } from 'playwright'
const BASE='http://localhost:5199'
const b=await chromium.launch()
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2})
const p=await ctx.newPage()
const errs=[];p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,120))});p.on('pageerror',e=>errs.push('PE:'+e.message.slice(0,120)))
const log=[]
// 1. Hamburger menu
await p.goto(BASE+'/crm',{waitUntil:'networkidle',timeout:20000}); await p.waitForTimeout(1500)
await p.locator('button.md\\:hidden').first().click().catch(e=>log.push('menu click fail'))
await p.waitForTimeout(700); await p.screenshot({path:'/tmp/mshots/i1-menu.png'})
log.push('menu opened')
// close menu (click overlay)
await p.locator('.bg-black.bg-opacity-50').click({position:{x:350,y:400}}).catch(()=>{})
await p.waitForTimeout(400)
// 2. Switch to Tabela view
const tab=p.locator('button',{hasText:/^Tabela$/}).first()
await tab.click().catch(e=>log.push('tabela click fail:'+e.message.slice(0,40)))
await p.waitForTimeout(1500); await p.screenshot({path:'/tmp/mshots/i2-crm-table-cards.png'})
log.push('tabela view -> cards')
// measure mini KPI strip overflow + any element overflowing viewport
const wide=await p.evaluate(()=>{
  const vw=document.documentElement.clientWidth;const bad=[]
  document.querySelectorAll('*').forEach(el=>{const r=el.getBoundingClientRect();if(r.right>vw+3&&r.width>80&&r.width<vw*3){bad.push((el.className&&el.className.toString().slice(0,50))+' w='+Math.round(r.width)+' right='+Math.round(r.right))}})
  return bad.slice(0,6)
})
log.push('overflowing els: '+JSON.stringify(wide))
// 3. Click first card name to open DetailPanel
await p.locator('.md\\:hidden button').filter({hasText:/.{4,}/}).first().click().catch(e=>log.push('card click fail'))
await p.waitForTimeout(2000); await p.screenshot({path:'/tmp/mshots/i3-detail.png'})
const hasDetail=await p.evaluate(()=>!!document.body.innerText.match(/Voltar|Editar|Ficha/))
log.push('detail panel opened: '+hasDetail)
console.log(JSON.stringify({log,errs:errs.slice(0,6)},null,1))
await b.close()
