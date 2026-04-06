#!/usr/bin/env node
/**
 * Melhora o layout interno do Departamento Financeiro e Departamento Comercial
 * com secções estruturadas, KPIs actuais e ligações às DBs.
 */
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
function loadEnv() {
  const envPath = path.join(__dirname, '../.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
loadEnv()

const TOKEN = process.env.NOTION_API_KEY
if (!TOKEN) { console.error('NOTION_API_KEY not set'); process.exit(1) }

function nReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'api.notion.com', path, method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }
    const req = https.request(options, res => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        const json = JSON.parse(raw)
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json)
        else reject(new Error(`Notion ${res.statusCode}: ${raw.slice(0, 300)}`))
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function getChildren(id) {
  const r = await nReq('GET', `/v1/blocks/${id}/children?page_size=100`)
  return r.results ?? []
}
async function archiveBlock(id) {
  await nReq('PATCH', `/v1/blocks/${id}`, { archived: true })
}
async function append(id, children) {
  // Notion max 100 children per request
  for (let i = 0; i < children.length; i += 50) {
    await nReq('PATCH', `/v1/blocks/${id}/children`, { children: children.slice(i, i + 50) })
  }
}

// ── Block builders ─────────────────────────────────────────────────────────
const h1 = (text, color = 'default') => ({
  object: 'block', type: 'heading_1',
  heading_1: { rich_text: [{ type: 'text', text: { content: text }, annotations: { color } }] },
})
const h2 = (text, color = 'default') => ({
  object: 'block', type: 'heading_2',
  heading_2: { rich_text: [{ type: 'text', text: { content: text }, annotations: { color } }] },
})
const h3 = (text, color = 'default') => ({
  object: 'block', type: 'heading_3',
  heading_3: { rich_text: [{ type: 'text', text: { content: text }, annotations: { color } }] },
})
const p = (text, color = 'default', bold = false) => ({
  object: 'block', type: 'paragraph',
  paragraph: { rich_text: [{ type: 'text', text: { content: text }, annotations: { color, bold } }] },
})
const pLink = (text, url) => ({
  object: 'block', type: 'paragraph',
  paragraph: { rich_text: [{ type: 'text', text: { content: text, link: { url } }, annotations: { bold: true, color: 'blue' } }] },
})
const divider = () => ({ object: 'block', type: 'divider', divider: {} })
const callout = (lines, emoji, color = 'gray_background') => ({
  object: 'block', type: 'callout',
  callout: {
    rich_text: lines.map((line, i) => ({
      type: 'text',
      text: { content: line + (i < lines.length - 1 ? '\n' : '') },
      annotations: i === 0 ? { bold: true } : { color: 'gray' },
    })),
    icon: { type: 'emoji', emoji },
    color,
  },
})
const bullet = (text, color = 'default') => ({
  object: 'block', type: 'bulleted_list_item',
  bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text }, annotations: { color } }] },
})

// ── FINANCEIRO ─────────────────────────────────────────────────────────────
const FINANCEIRO_ID = '6a51b61c-e89f-476c-a8b0-69391ab742b2'

const financeiroBlocks = [
  // Header
  callout(['DEPARTAMENTO FINANCEIRO', 'Wholesaling Imobiliário · Controlo de Negócios & Despesas'], '💰'),
  divider(),

  // Dashboard link
  callout(['Dashboard Web — Financeiro', 'localhost:5173/financeiro  ·  KPIs, Cashflow e Despesas em tempo real'], '🖥️', 'blue_background'),
  divider(),

  // Negócios activos
  h2('💼  Negócios Ativos', 'default'),
  p('Pipeline de lucro estimado por negócio. Atualizado automaticamente via Notion.', 'gray'),
  p(''),
  bullet('Cedência de Posição T2 Condeixa — Wholesalling — €3.000 est. — Fase de obras', 'default'),
  bullet('Cedência de Posição Prédio Bencanta — Wholesalling — €24.000 est. — Fase de obras', 'default'),
  bullet('Angariação 1,25% Prédio Bencanta — Mediação Imobiliária — €10.000 est. — Fase de venda', 'default'),
  p(''),
  callout(['Pipeline de Lucro Total: €37.000', 'Todos os pagamentos pendentes — nenhum recebido ainda.'], '📊', 'yellow_background'),
  divider(),

  // Despesas
  h2('💸  Despesas Operacionais', 'default'),
  p('Custos fixos mensais e pontuais da empresa.', 'gray'),
  p(''),
  bullet('Claude Code — €221,40/mês (Ferramentas)', 'default'),
  bullet('Notion — €23,50/mês (Ferramentas)', 'default'),
  bullet('Skool Andre Vedor — €33/mês (Subscrição)', 'default'),
  bullet('Skool Programa Investir Imobiliário — €2.148 único', 'default'),
  bullet('Medidor Laser Dexter — €74,99 único (Material)', 'default'),
  p(''),
  callout(['Burn Rate Mensal: ~€278/mês', 'Burn Rate Anual: ~€3.336/ano'], '🔥', 'red_background'),
  divider(),

  // Métricas
  h2('📈  Métricas Chave', 'default'),
  p(''),
  bullet('Runway estimado: ~133 meses (€37.000 pendente ÷ €278/mês burn rate)', 'default'),
  bullet('Negócios ativos: 3', 'default'),
  bullet('Lucro real recebido: €0 (todos pendentes)', 'default'),
  bullet('Categorias: Wholesalling (2) · Mediação Imobiliária (1)', 'default'),
  divider(),

  // Fluxo de trabalho
  h2('🔄  Fluxo de Trabalho Mensal', 'default'),
  p('Ciclo de actualização de dados financeiros.', 'gray'),
  p(''),
  bullet('Semana 1: Registar novos negócios na base Faturação', 'default'),
  bullet('Semana 2: Actualizar fases e datas estimadas', 'default'),
  bullet('Semana 3: Confirmar pagamentos recebidos (desmarcar "Pagamento em falta")', 'default'),
  bullet('Semana 4: Rever despesas — adicionar novos custos', 'default'),
  divider(),

  // Bases de dados
  h2('🗄️  Bases de Dados', 'default'),
  p(''),
  pLink('→ Base de Dados: Faturação (negócios)', 'https://www.notion.so/ecbb876ee01e4e65b8f561499d42a2b2'),
  pLink('→ Base de Dados: Despesas Operacionais', 'https://www.notion.so/ae764d5955004c1bb0fba7705bb6931c'),
  divider(),

  // Footer
  p('SOMNIUM PROPERTIES  ·  Departamento Financeiro', 'gray'),
]

// ── COMERCIAL ──────────────────────────────────────────────────────────────
const COMERCIAL_ID = '8c1965bc-3ac0-49c3-a128-9958f2796dbd'

const comercialBlocks = [
  // Header
  callout(['DEPARTAMENTO COMERCIAL & VENDAS', 'Pipeline de Imóveis · Gestão de Investidores · Rede de Empreiteiros'], '🏡'),
  divider(),

  // Dashboard link
  callout(['Dashboard Web — Comercial', 'localhost:5173/comercial  ·  Pipeline, Investidores e Empreiteiros em tempo real'], '🖥️', 'blue_background'),
  divider(),

  // Investidores
  h2('🤝  Investidores', 'default'),
  p('Base de investidores qualificados por classificação A/B/C/D.', 'gray'),
  p(''),
  callout([
    'Estado Atual: 37 investidores registados',
    '3 em parceria ativa (Tiago Barata A · Luís Pedro A · Fernando Morais B)',
    '10 com call marcada · 9 a marcar call · 6 em follow-up',
  ], '👥', 'green_background'),
  p(''),
  bullet('Classe A: Luis Gouveia (€500k–1M) · Cíntia Bisolo · Tiago Barata · Luís Pedro · Daniela Gaspar', 'default'),
  bullet('Classe B: Élsio Mota (€50k) · Hugo Batista (€20k–80k) · Fernando Morais (€25k–50k) · Nuno Santos', 'default'),
  bullet('Classe C: Francisco Maximiano · António Costa', 'default'),
  bullet('Origem principal: Skool (maioria) · Grupos WhatsApp · Referenciação', 'default'),
  p(''),
  callout(['Automação WhatsApp (Make)', 'Campos D-2, D-1 e D-0 activam envio automático de mensagens de confirmação.'], '🤖', 'gray_background'),
  divider(),

  // Pipeline imóveis
  h2('🏠  Pipeline de Imóveis', 'default'),
  p('Oportunidades imobiliárias desde o lead até à cedência/venda.', 'gray'),
  p(''),
  callout(['⚠️  Base de Dados não partilhada com o Dashboard', 'Para activar: abrir Pipeline Imóveis → ... → Adicionar conexões → Claude Code'], '⚠️', 'yellow_background'),
  p(''),
  bullet('Funil: Em análise → Follow UP → Estudo de VVR → Enviar proposta ao investidor → Wholesaling', 'gray'),
  divider(),

  // Empreiteiros
  h2('🔨  Empreiteiros', 'default'),
  p('Rede de empreiteiros para obras de reabilitação e construção.', 'gray'),
  p(''),
  callout([
    'Estado Atual: 2 empreiteiros registados (ambos Em Avaliação)',
    'Pai Fernando Morais — Obra geral · Coimbra/Figueira (ref. Fernando Morais)',
    'Sr. Nuno — Obra geral · Coimbra (ref. interna)',
  ], '🏗️', 'yellow_background'),
  p(''),
  bullet('Critérios de qualificação: ≥3 referências · Seguro RC ativo · Contrato formalizado', 'default'),
  bullet('Especialidades disponíveis: Obra geral, Remodelação, Elétrica, Canalização, Carpintaria', 'default'),
  divider(),

  // Processos
  h2('📋  Processos Comerciais (SOPs)', 'default'),
  p('Procedimentos operacionais padronizados para a equipa comercial.', 'gray'),
  p(''),
  bullet('SOP 1 — Pesquisa de Negócios Imobiliários', 'default'),
  bullet('SOP 2 — Procura e Classificação de Investidores Parceiros', 'default'),
  bullet('SOP 3 — Procura de Empreiteiros', 'default'),
  bullet('SOP 4 — Estudo de Mercado', 'default'),
  bullet('SOP 9 — Confirmação de Call', 'default'),
  bullet('SOP 10 — Apresentação de Negócios aos Investidores', 'default'),
  bullet('SOP 11 — Onboarding Investidores', 'default'),
  divider(),

  // Bases de dados
  h2('🗄️  Bases de Dados', 'default'),
  p(''),
  pLink('→ Base de Dados: Lista Investidores', 'https://www.notion.so/90eaabfd27e24aa0931d0cbbd6ec4411'),
  pLink('→ Base de Dados: Empreiteiros', 'https://www.notion.so/c032cba7569c415cb1d28b34754da4bc'),
  pLink('→ Base de Dados: Pipeline de Leads / Imóveis', 'https://www.notion.so/30dc6d45a01f804aabbc-dedfb2f15c57'),
  divider(),

  // Footer
  p('SOMNIUM PROPERTIES  ·  Departamento Comercial & Vendas', 'gray'),
]

// ── Main ───────────────────────────────────────────────────────────────────
async function processPage(id, name, blocks) {
  console.log(`\n── ${name}`)

  // ONLY archive blocks that were added by our scripts (callout, heading, paragraph, divider, bulleted_list_item)
  // NEVER touch child_page or child_database — these link to real data
  const SAFE_TO_ARCHIVE = new Set(['callout','heading_1','heading_2','heading_3','paragraph','divider','bulleted_list_item','numbered_list_item'])
  const existing = await getChildren(id)
  let archived = 0
  for (const b of existing) {
    if (SAFE_TO_ARCHIVE.has(b.type)) {
      try { await archiveBlock(b.id); archived++ } catch {}
    }
  }
  if (archived) console.log(`  ✓ Arquivados ${archived} blocos de texto antigos`)

  // Append new layout
  await append(id, blocks)
  console.log(`  ✓ Layout aplicado (${blocks.length} blocos)`)
}

async function main() {
  await processPage(FINANCEIRO_ID, 'Departamento Financeiro', financeiroBlocks)
  await processPage(COMERCIAL_ID, 'Departamento Comercial', comercialBlocks)
  console.log('\n✅ Ambos os departamentos actualizados.')
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
