/**
 * Documentos PDF profissionais por fase do imóvel.
 * Layout empresarial Somnium Properties — mobile-friendly.
 */
import PDFDocument from 'pdfkit'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { rasterizarSvgParaPng } from '../lib/estudoLocalizacao.js'
import { LOGO_BLACK_PNG } from './logoBlack.js'
import { calcMetricsExtra, MULT, EUR_M2, RACIO, PCT_DEC, EUR_S, colorMargem, colorPositivo } from './calcMetricsExtra.js'
import pool from './pg.js'
import { calcOrcamentoObra, SECCOES_ORDEM, SECCOES_OBRA, SECCOES_LABELS } from './orcamentoObraEngine.js'
import { resolveDealData } from './dossier/dataResolver.js'
import { computeMOIC, computePayback, formatMOIC, formatPayback } from './dossier/metrics.js'
import { renderDocumentacaoChecklist } from './dossier/sections/documentacao.js'
import { renderAssumptionsAndGlossary } from './dossier/sections/assumptionsGlossary.js'
import { computeContentHash, shortHash } from './dossier/contentHash.js'
import { CHECKLIST_SECTIONS, MEDICAO_COMPARTIMENTOS, OBRA_TRABALHOS, RELATORIO_OBRAS, DECISOES, GRAUS_OBRA, normalizeFicha } from '../constants/fichaVisitaSchema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STRESS_DIR = path.resolve(__dirname, '../../public/uploads/stress_tests')

// Helpers regionais — substituem hardcodes "Coimbra · Portugal" pelo distrito
// correcto do imóvel. Default "Coimbra" para retro-compatibilidade do legacy.
function regiaoDoImovel(im) {
  return im?.regiao === 'AMP' ? 'AMP' : 'Coimbra'
}
function distritoDoImovel(im) {
  // Prioridade: campo explícito > concelho conhecido > inferido pela região.
  if (im?.distrito) return im.distrito
  if (im?.concelho === 'Porto' || im?.concelho === 'Vila Nova de Gaia') return 'Porto'
  if (im?.concelho === 'Santa Maria da Feira') return 'Aveiro'
  return regiaoDoImovel(im) === 'AMP' ? 'Porto' : 'Coimbra'
}
function localizacaoTexto(im, opts = {}) {
  // Devolve "{zona}, {distrito}" ou "{distrito}, Portugal" sem assumir Coimbra.
  const distrito = distritoDoImovel(im)
  const zona = im?.zona || im?.freguesia || im?.concelho
  if (opts.completo) {
    return zona ? `Zona de ${zona}, ${distrito}` : `${distrito}, Portugal`
  }
  return zona ? ` na zona de ${zona}, ${distrito}` : ` em ${distrito}`
}

// Design tokens (reference: Proposta de Investimento Somnium)
const C = {
  gold: '#C9A84C', black: '#0d0d0d', white: '#ffffff',
  bg: '#f7f6f2', body: '#2a2a2a', muted: '#888888',
  border: '#e0ddd5', light: '#f0efe9', accent: '#1a1a1a',
  headerBg: '#f0efe9', totalBg: '#f5f3ee',
  green: '#2d6a2d', red: '#8b2020', blue: '#6366f1',
}
const ML = 50, MR = 50 // margins
const PW = 595.28, PH = 841.89
const CW = PW - ML - MR // content width

const EUR = v => v == null || v === 0 ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const PCT = v => v == null ? '—' : `${v}%`
const FDATE = d => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('pt-PT') } catch { return d } }
const NOW = () => new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

// Limpa items de listas multi-linha (pontos_fortes, riscos, etc.):
// remove qualquer combinacao de backticks/aspas (ASCII e variantes
// unicode tipo U+2018/U+02CB, frequentemente auto-substituidos por
// editores), numeracao "1." / "1)" e bullets pre-existentes (•, ▸, *,
// -, en/em dash). Aplica os passes em loop ate estabilizar para apanhar
// padroes intercalados (`` `1.\`Zona ``, `` ``1)\`Zona ``, etc.).
const QUOTE_LIKE_RE = /^[`´ʻ-ʽˊˋ‘’“”'"\s]+/
const BULLET_RE = /^[•▸▪◦*\-–—]+\s*/
const NUMBERING_RE = /^\d+\s*[.)]\s*/

function parseListItems(text) {
  if (!text) return []
  return String(text)
    .split(/\r?\n/)
    .map(s => {
      let cur = s.trim()
      let prev = ''
      while (cur !== prev) {
        prev = cur
        cur = cur.replace(QUOTE_LIKE_RE, '').replace(BULLET_RE, '').replace(NUMBERING_RE, '').trim()
      }
      // Fallback agressivo: qualquer caractere remanescente que nao seja
      // letra/digito unicode (apanha variantes exoticas — U+275B, U+275C,
      // U+201F, modifier letters, etc. — que escapem ao char class fixo).
      cur = cur.replace(/^[^\p{L}\p{N}]+/u, '').trim()
      return cur
    })
    .filter(Boolean)
}

// Limpa um campo multi-linha mantendo as quebras de linha — usado por
// renderers que mostram pontos_fortes/fracos como texto corrido.
function cleanMultilineText(text) {
  return parseListItems(text).join('\n')
}

// Parse fotos JSON from imovel — only images, max 6 for PDF
function parseFotos(im) {
  // Se a galeria já foi pré-carregada (buffers via preloadFotosGaleria),
  // usá-la directamente — já vem filtrada e com `_data` para o render.
  if (Array.isArray(im?._fotosGaleria)) return im._fotosGaleria
  try {
    const all = typeof im.fotos === 'string' ? JSON.parse(im.fotos || '[]') : (im.fotos || [])
    return all
      .filter(f => f.folder !== 'documentos' && (f.type?.startsWith('image/') || f.path?.match(/\.(jpg|jpeg|png|webp)$/i)))
      .slice(0, 6) // max 6 photos in PDF
  } catch { return [] }
}

// ── Estado → Documentos ──────────────────────────────────────
const ESTADO_DOC_MAP = {
  'Adicionado':                      ['ficha_imovel'],
  'Necessidade de Visita':           ['ficha_visita'],
  'Estudo de VVR':                   ['analise_rentabilidade', 'estudo_comparaveis'],
  'Criar Proposta ao Proprietário':  ['proposta_formal'],
  'Enviar proposta ao Proprietário': ['proposta_formal'],
  'Em negociação':                   ['resumo_negociacao'],
  'Enviar proposta ao investidor':   ['dossier_investidor', 'proposta_investimento_anonima', 'proposta_cedencia_posicao'],
  'Follow Up após proposta':         ['ficha_follow_up'],
  'Follow UP':                       ['ficha_follow_up'],
  'Descartado':                      ['ficha_descarte'],
}

export function getDocsForEstado(estado) { return ESTADO_DOC_MAP[estado] || [] }

const DOC_LABELS = {
  ficha_imovel: 'Ficha do Imóvel',
  ficha_visita: 'Ficha de Visita',
  analise_rentabilidade: 'Análise de Rentabilidade',
  estudo_comparaveis: 'Estudo de Comparáveis',
  proposta_formal: 'Proposta ao Proprietário',
  dossier_investidor: 'Dossier de Investimento',
  proposta_investimento_anonima: 'Proposta de Investimento (Anónima)',
  proposta_cedencia_posicao: 'Proposta de Cedência de Posição',
  resumo_negociacao: 'Resumo de Negociação',
  ficha_follow_up: 'Ficha de Follow Up',
  ficha_descarte: 'Ficha de Descarte',
  relatorio_documental: 'Relatório Documental',
}

// PNG magic number: 0x89 0x50 0x4E 0x47
function isPng(buf) { return buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 }
// JPEG magic: FF D8 FF
function isJpeg(buf) { return buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF }

// Le dimensoes do header PNG (IHDR chunk: bytes 16-19 width, 20-23 height, big-endian).
function pngDimensions(buf) {
  if (!isPng(buf) || buf.length < 24) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

// Garante que o buffer e PNG ou JPEG (formatos aceites pelo PDFKit).
// Se for SVG (legacy estudo de localizacao), rasteriza on-the-fly.
function normalizarImagemParaPdf(buf) {
  if (!buf || buf.length === 0) return null
  if (isPng(buf) || isJpeg(buf)) return buf
  // Heuristica SVG: comeca com '<' (talvez apos BOM/whitespace)
  const head = buf.slice(0, 256).toString('utf8').trimStart()
  if (head.startsWith('<?xml') || head.startsWith('<svg')) {
    try { return rasterizarSvgParaPng(buf.toString('utf8')) } catch { return null }
  }
  return null
}

// Helper: fetch com timeout abortavel. Producao em Render fica vulneravel
// a fetches que demoram >60s (rede lenta para Supabase, etc.); sem timeout
// o gerador de PDF hangs ate o browser desistir, devolvendo "nada acontece".
// Falha silenciosa retorna null — caller faz fallback.
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return null
    return Buffer.from(await r.arrayBuffer())
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn(`[pdf-preload] fetch abortado apos ${timeoutMs}ms: ${url.slice(0, 80)}...`)
    } else {
      console.warn(`[pdf-preload] fetch falhou: ${url.slice(0, 80)}... (${e.message})`)
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Reduz o peso das fotos para o PDF via transformação de imagens do Supabase
// Storage (resize feito no servidor — não sobrecarrega o isolate da Edge
// Function, ao contrário de embeber a foto em resolução total). Converte
// .../object/public/<path> em .../render/image/public/<path>?width=&quality=.
// Só aplica a URLs do próprio Storage público; outras passam intactas. format=origin
// mantém PNG/JPEG (o PDFKit não aceita WebP). PNG não recomprime por qualidade,
// por isso usa largura menor. Sem isto, fotos em resolução total geravam dossiers
// de dezenas de MB que estouravam os limites de memória/CPU da Edge Function.
function urlFotoReduzida(url, isPng) {
  const marker = '/storage/v1/object/public/'
  const i = typeof url === 'string' ? url.indexOf(marker) : -1
  if (i === -1) return url
  const base = url.slice(0, i)
  const objectPath = url.slice(i + marker.length)
  const width = isPng ? 600 : 1000
  return `${base}/storage/v1/render/image/public/${objectPath}?width=${width}&quality=60&format=origin`
}

// PNG->JPEG via lib pura-JS leve (upng-js decode + jpeg-js encode), para caberem
// TODAS as fotos no dossier sem o tornar pesado. Escolhidas por serem minusculas
// (~150KB) ao contrario do imagescript (~10MB, estoirava o limite do bundle da
// Edge Function). Import dinamico tardio + guardas: se as libs nao carregarem ou
// falharem, devolve o buffer original (degrada com seguranca). Pressupoe imagem
// ja reduzida (urlFotoReduzida), pelo que o decode e barato.
let _imgLibs // undefined=por tentar · null=indisponivel · {UPNG,jpeg}=carregado
async function carregarImgLibs() {
  if (_imgLibs !== undefined) return _imgLibs
  try {
    const [upng, jpegMod] = await Promise.all([import('upng-js'), import('jpeg-js')])
    const UPNG = upng.default || upng
    const jpeg = jpegMod.default || jpegMod
    _imgLibs = (UPNG?.decode && jpeg?.encode) ? { UPNG, jpeg } : null
  } catch { _imgLibs = null }
  return _imgLibs
}
async function reencodeParaJpeg(buf) {
  try {
    const libs = await carregarImgLibs()
    if (!libs) return buf
    const png = libs.UPNG.decode(buf)
    const rgba = new Uint8Array(libs.UPNG.toRGBA8(png)[0])
    const out = libs.jpeg.encode({ data: rgba, width: png.width, height: png.height }, 60).data
    const jbuf = Buffer.from(out)
    return (jbuf.length > 2 && jbuf[0] === 0xFF && jbuf[1] === 0xD8) ? jbuf : buf
  } catch { return buf }
}

// Pré-carrega imagem de localização (URL Supabase ou path local) e
// devolve novo objecto imóvel com `_localizacaoImgData` (Buffer) injectado.
// Aceita SVG legacy: rasteriza para PNG antes de entregar ao renderer.
// Se a URL falhar, devolve o imóvel original — o renderer mostra fallback.
async function preloadLocalizacao(imovel) {
  const url = imovel?.localizacao_imagem
  if (!url) return imovel
  try {
    let buf = null
    if (url.startsWith('http')) {
      buf = await fetchWithTimeout(url)
      if (!buf) return imovel
    } else {
      const localPath = path.resolve(__dirname, '../..', 'public', url.replace(/^\//, ''))
      if (existsSync(localPath)) buf = readFileSync(localPath)
    }
    const png = normalizarImagemParaPdf(buf)
    if (png) return { ...imovel, _localizacaoImgData: png }
  } catch { /* ignore — renderer mostra fallback */ }
  return imovel
}

// Pré-carrega a captura do estudo de mercado externo (Alfredo) guardada em
// `analise.comparaveis.meta.alfredo_imagem`. Devolve nova analise com
// `_alfredoImgData` (Buffer PNG/JPEG) injectado. Se a URL falhar, devolve
// a analise original — o renderer omite a seccao silenciosamente.
async function preloadAlfredoImagem(analise) {
  if (!analise) return analise
  let raw = analise.comparaveis
  if (typeof raw === 'string') { try { raw = JSON.parse(raw || 'null') } catch { raw = null } }
  const url = (raw && !Array.isArray(raw) && raw.meta) ? raw.meta.alfredo_imagem : null
  if (!url) return analise
  try {
    let buf = null
    if (url.startsWith('http')) {
      buf = await fetchWithTimeout(url)
      if (!buf) return analise
    } else {
      const localPath = path.resolve(__dirname, '../..', 'public', url.replace(/^\//, ''))
      if (existsSync(localPath)) buf = readFileSync(localPath)
    }
    const png = normalizarImagemParaPdf(buf)
    if (png) return { ...analise, _alfredoImgData: png }
  } catch { /* ignore — renderer omite */ }
  return analise
}

// Pré-carrega a foto principal do imóvel (URL Supabase ou path local) e
// devolve novo objecto com `_heroFotoData` (Buffer) injectado. A foto principal
// é a marcada com `cover: true`, ou senão a primeira da lista filtrada.
async function preloadHeroFoto(imovel) {
  const fotos = parseFotos(imovel)
  if (fotos.length === 0) return imovel
  const main = fotos.find(f => f.cover) || fotos[0]
  const url = main?.path
  if (!url) return imovel
  try {
    let buf = null
    const isPngFoto = /\.png(\?|$)/i.test(url) || main.type === 'image/png'
    if (url.startsWith('http')) {
      buf = await fetchWithTimeout(urlFotoReduzida(url, isPngFoto)) || await fetchWithTimeout(url)
      if (!buf) return imovel
    } else {
      const localPath = path.resolve(__dirname, '../..', 'public', url.replace(/^\//, ''))
      if (existsSync(localPath)) buf = readFileSync(localPath)
    }
    if (buf && isPngFoto) buf = await reencodeParaJpeg(buf)
    if (buf && (isPng(buf) || isJpeg(buf))) {
      return { ...imovel, _heroFotoData: buf }
    }
  } catch { /* ignore — renderer omite foto */ }
  return imovel
}

// Pré-carrega as fotos da galeria (até 6) como buffers prontos para PDF,
// suportando URLs remotas (Supabase) e paths locais — tal como a hero foto.
// Devolve novo objecto com `_fotosGaleria` (cada foto com `_data` Buffer).
// Sem isto, em produção as fotos (URLs Supabase) não carregavam porque o
// render só lia do disco local.
async function preloadFotosGaleria(imovel) {
  if (Array.isArray(imovel?._fotosGaleria)) return imovel
  // Todas as fotos (excepto a pasta "documentos"), não apenas 6 — o dossier
  // mostra todas. O peso é mantido baixo pela transformação do Supabase (resize)
  // + orçamento de bytes, para o PDF caber nos limites da Edge Function.
  let all = []
  try { all = typeof imovel.fotos === 'string' ? JSON.parse(imovel.fotos || '[]') : (imovel.fotos || []) } catch { all = [] }
  const fotos = all
    .filter(f => f.folder !== 'documentos' && (f.type?.startsWith('image/') || f.path?.match(/\.(jpg|jpeg|png|webp)$/i)))
    .slice(0, 30)
  if (fotos.length === 0) return imovel
  const carregadas = []
  let totalBytes = 0
  const ORCAMENTO_BYTES = 6 * 1024 * 1024 // tecto do total de imagens embebidas no PDF
  for (const foto of fotos) {
    const url = foto?.path
    if (!url) continue
    const isPngFoto = /\.png(\?|$)/i.test(url) || foto.type === 'image/png'
    try {
      let buf = null
      if (url.startsWith('http')) {
        // Versão reduzida (Supabase render); se falhar, cai para a original.
        buf = await fetchWithTimeout(urlFotoReduzida(url, isPngFoto)) || await fetchWithTimeout(url)
      } else {
        const localPath = path.resolve(__dirname, '../..', 'public', url.replace(/^\//, ''))
        if (existsSync(localPath)) buf = readFileSync(localPath)
      }
      let img = normalizarImagemParaPdf(buf)
      if (!img) continue
      // PNG não comprime por qualidade → re-encoda para JPEG pequeno, para
      // caberem todas as fotos no orçamento (com fallback se a lib não estiver).
      if (isPngFoto) img = await reencodeParaJpeg(img)
      // Inclui sempre a 1.ª; as seguintes só enquanto couberem no orçamento.
      if (carregadas.length > 0 && totalBytes + img.length > ORCAMENTO_BYTES) break
      carregadas.push({ ...foto, _data: img })
      totalBytes += img.length
    } catch { /* salta foto que falhe — não bloqueia o documento */ }
  }
  return carregadas.length > 0 ? { ...imovel, _fotosGaleria: carregadas } : imovel
}

// Carrega o orçamento detalhado da aba "Obra" (orcamentos_obra) e
// devolve o resultado já calculado por calcOrcamentoObra. Devolve
// null se não existir ou falhar — os renderers fazem fallback aos
// agregados da análise.
async function preloadOrcamentoObra(im) {
  if (!im?.id || im._orcamento !== undefined) return im
  try {
    const { rows: [orc] } = await pool.query(
      'SELECT * FROM orcamentos_obra WHERE imovel_id = $1', [im.id]
    )
    if (!orc) return { ...im, _orcamento: null }
    const calc = calcOrcamentoObra(orc)
    return { ...im, _orcamento: { ...orc, calc } }
  } catch (e) {
    console.error('[pdfImovelDocs] preloadOrcamentoObra falhou:', e.message)
    return { ...im, _orcamento: null }
  }
}

// Tipos de documento que embutem a imagem do estudo de localização.
export const DOCS_COM_LOCALIZACAO = ['relatorio_investimento', 'dossier_investidor', 'proposta_investimento_anonima', 'proposta_cedencia_posicao']
export function docEmbedeLocalizacao(tipo) { return DOCS_COM_LOCALIZACAO.includes(tipo) }

export async function generateDoc(tipo, imovel, analise = null) {
  const fn = GENERATORS[tipo]
  if (!fn) return null
  // Tipos investidor precisam da imagem de localização pré-carregada
  // (Supabase URL exige fetch async; o resto do render é síncrono).
  const investidor = DOCS_COM_LOCALIZACAO
  const comFotoHero = ['ficha_imovel', ...investidor]
  // Tipos que mostram o orçamento de obra detalhado consomem o que
  // foi preenchido na aba "Obra" (orcamentos_obra) — e não apenas
  // os agregados da analise activa.
  const comOrcamentoObra = ['dossier_investidor', 'proposta_investimento_anonima', 'proposta_cedencia_posicao']
  // Tipos que mostram galeria de fotografias do imóvel.
  const comGaleria = ['ficha_imovel', 'dossier_investidor', 'proposta_cedencia_posicao']
  let im = imovel
  let an = analise
  if (investidor.includes(tipo)) im = await preloadLocalizacao(im)
  if (comFotoHero.includes(tipo)) im = await preloadHeroFoto(im)
  if (comGaleria.includes(tipo)) im = await preloadFotosGaleria(im)
  if (comOrcamentoObra.includes(tipo)) im = await preloadOrcamentoObra(im)
  if (tipo === 'estudo_comparaveis' || tipo === 'dossier_investidor' || tipo === 'proposta_cedencia_posicao') an = await preloadAlfredoImagem(an)
  return fn(im, an)
}

// ══════════════════════════════════════════════════════════════
// LAYOUT SYSTEM — Professional, mobile-friendly
// ══════════════════════════════════════════════════════════════

// Patch PDFDocument para neutralizar NaN/Infinity em coordenadas e
// dimensoes, antes que cheguem ao buffer interno e expludam em doc.end().
// PDFKit so valida numeros na serializacao final, pelo que sem este guard
// um unico calculo errado num renderer deita abaixo o PDF inteiro.
let __pdfkitPatched = false
function patchPDFKitNaNGuard() {
  if (__pdfkitPatched) return
  __pdfkitPatched = true
  const num = v => (typeof v === 'number' && !isFinite(v)) ? 0 : v
  const wrapPositional = (proto, method, knownNumericIndices) => {
    if (typeof proto[method] !== 'function') return
    const orig = proto[method]
    proto[method] = function(...args) {
      let dirty = false
      for (const i of knownNumericIndices) {
        if (i < args.length && typeof args[i] === 'number' && !isFinite(args[i])) {
          dirty = true; args[i] = 0
        }
      }
      // Sanear opts.width/height/x/y se ultimo arg for objecto
      const last = args[args.length - 1]
      if (last && typeof last === 'object' && !Array.isArray(last)) {
        for (const k of ['width', 'height', 'x', 'y', 'lineGap', 'characterSpacing', 'indent']) {
          if (typeof last[k] === 'number' && !isFinite(last[k])) {
            dirty = true; last[k] = 0
          }
        }
        if (Array.isArray(last.fit)) {
          last.fit = last.fit.map(v => (typeof v === 'number' && !isFinite(v)) ? 0 : v)
        }
      }
      if (dirty) console.warn(`[pdfkit-guard] ${method} recebeu NaN/Infinity — saneado para 0`)
      return orig.apply(this, args)
    }
  }
  const proto = PDFDocument.prototype
  // Drawing primitives (x,y,w,h) e variantes
  wrapPositional(proto, 'rect', [0, 1, 2, 3])
  wrapPositional(proto, 'roundedRect', [0, 1, 2, 3, 4])
  wrapPositional(proto, 'circle', [0, 1, 2])
  wrapPositional(proto, 'moveTo', [0, 1])
  wrapPositional(proto, 'lineTo', [0, 1])
  wrapPositional(proto, 'image', [1, 2])
  wrapPositional(proto, 'text', [1, 2])
  wrapPositional(proto, 'fontSize', [0])
  wrapPositional(proto, 'lineWidth', [0])
  wrapPositional(proto, 'translate', [0, 1])
  wrapPositional(proto, 'scale', [0, 1])

  // heightOfString e widthOfString podem retornar NaN para strings com
  // chars que a fonte nao suporta. Wrappar para devolver fallback.
  if (typeof proto.heightOfString === 'function') {
    const origH = proto.heightOfString
    proto.heightOfString = function(text, opts) {
      const safeText = (text == null) ? '' : String(text)
      const r = origH.call(this, safeText, opts)
      if (typeof r !== 'number' || !isFinite(r)) {
        console.warn(`[pdfkit-guard] heightOfString devolveu valor invalido (${r}) para "${safeText.slice(0,30)}" — usando fallback 12`)
        return 12 // fallback razoavel para uma linha de texto
      }
      return r
    }
  }
  if (typeof proto.widthOfString === 'function') {
    const origW = proto.widthOfString
    proto.widthOfString = function(text, opts) {
      const safeText = (text == null) ? '' : String(text)
      const r = origW.call(this, safeText, opts)
      if (typeof r !== 'number' || !isFinite(r)) {
        console.warn(`[pdfkit-guard] widthOfString devolveu valor invalido (${r}) para "${safeText.slice(0,30)}" — usando fallback 50`)
        return 50
      }
      return r
    }
  }

  // CRITICO: annotate() recebe (x, y, w, h, options) e gera options.Rect
  // que e [x1,y1,x2,y2]. Se qualquer for NaN, o array contem NaN e PDFKit
  // explode na serializacao com "unsupported number: NaN" — frustrando os
  // try/catch nos renderers porque a falha ocorre em doc.end().
  // Sanitizar entradas para 0 antes de delegar.
  if (typeof proto.annotate === 'function') {
    const origAnn = proto.annotate
    proto.annotate = function(x, y, w, h, options) {
      const sx = (typeof x === 'number' && isFinite(x)) ? x : 0
      const sy = (typeof y === 'number' && isFinite(y)) ? y : 0
      const sw = (typeof w === 'number' && isFinite(w) && w > 0) ? w : 1
      const sh = (typeof h === 'number' && isFinite(h) && h > 0) ? h : 1
      if (sx !== x || sy !== y || sw !== w || sh !== h) {
        console.warn(`[pdfkit-guard] annotate(${x},${y},${w},${h}) saneado para (${sx},${sy},${sw},${sh})`)
      }
      return origAnn.call(this, sx, sy, sw, sh, options)
    }
  }

  // Patch defensivo do PDFObject.number para nunca atirar — converter
  // NaN/Infinity para 0 com warning. PDFObject e interno ao pdfkit.js;
  // acedemos via require() porque PDFDocument expoe-o internamente.
  try {
    const pdfkitPath = new URL('../../node_modules/pdfkit/js/pdfkit.js', import.meta.url)
    // Nao podemos importar PDFObject directamente; em vez disso, monkey-patch
    // qualquer Float/Integer Array que vai serializar. Cobertura via annotate
    // acima resolve o caso pratico.
  } catch {}
}
patchPDFKitNaNGuard()

class DocBuilder {
  constructor(title, subtitle, imovel, opts = {}) {
    // Metadata do PDF — Title/Author/Subject/Keywords/Producer.
    // Para a Anonima, o GENERATOR ja sobrescreve `imovel.nome` para
    // 'OPORTUNIDADE DE INVESTIMENTO' antes de chamar o construtor, pelo
    // que `imovel.nome` aqui ja vem stripped — seguro usar no Subject.
    const im = imovel || {}
    const metaSubjectName = im.nome || 'Imovel'
    const info = {
      Title: String(title || 'Documento Somnium'),
      Author: 'Somnium Properties',
      Subject: `${title} — ${metaSubjectName}`,
      Keywords: ['Somnium Properties', 'Investimento Imobiliario', title].filter(Boolean).join(', '),
      Producer: 'Somnium CRM',
      Creator: 'Somnium CRM',
    }
    this.doc = new PDFDocument({ size: 'A4', autoFirstPage: false, bufferPages: true, info })
    // Setter sanitizador de this.y
    let _y = 0
    Object.defineProperty(this, 'y', {
      get: () => _y,
      set: (v) => {
        if (typeof v !== 'number' || !isFinite(v)) {
          console.warn(`[docbuilder] this.y recebeu valor invalido (${v}) — repondo para 60`)
          _y = 60
        } else {
          _y = v
        }
      },
      enumerable: true,
      configurable: false,
    })
    this.imovel = imovel
    this.style = opts.style || 'default'
    this.title = title
    this.heroItems = opts.heroItems || null
    // Sections collection para indice (TOC). Activado apenas para tipos
    // que beneficiam de TOC (Dossier de Investimento e investidor relatorios).
    this._sections = opts.withIndex ? [] : null
    this._tocPageIndex = null
    this._drawCover(title, subtitle)
    if (this._sections) {
      // Reservar pagina para TOC (sera preenchida no fim via applyIndex)
      this.newPage()
      const range = this.doc.bufferedPageRange()
      this._tocPageIndex = range.start + range.count - 1
      // Marcador minimo (sera limpo no applyIndex)
    }
    this.newPage()
  }

  _drawCover(title, subtitle) {
    const d = this.doc
    const im = this.imovel
    d.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })

    // Capa unificada — logo 480px, bloco centrado vertical entre barra superior e footer
    // (estilo investor passou a usar a mesma capa; hero box já não é desenhado aqui)
    d.rect(0, 0, PW, 6).fill(C.gold)
    const LW = 450
    const LH = LW / (1516 / 614)        // ≈ 194.4 (proporção real do logo-dark.png)
    const BLOCK_H = LH + 35 + 1.5 + 25 + 37 + 15 + 13 + 12 + 13 + 25 + 0.5 + 15 + 12
    const LY = 6 + ((PH - 65 - 6) - BLOCK_H) / 2
    try { d.image(LOGO_BLACK_PNG, (PW - LW) / 2, LY, { width: LW }) } catch {}
    const accent1Y = LY + LH + 35
    const titleY   = accent1Y + 1.5 + 25
    const subY     = titleY + 37 + 15
    const subtitleY = subY + 13 + 12
    const accent2Y = subtitleY + 13 + 25
    const dateY    = accent2Y + 0.5 + 15
    d.rect(PW / 2 - 30, accent1Y, 60, 1.5).fill(C.gold)
    d.fontSize(28).fillColor(C.body).text(title, ML, titleY, { width: CW, align: 'center' })
    const sub = [im.nome, im.zona].filter(Boolean).join(' · ').toUpperCase()
    if (sub) d.fontSize(10).fillColor(C.gold).text(sub, ML, subY, { width: CW, align: 'center', characterSpacing: 1.5 })
    if (subtitle) d.fontSize(10).fillColor(C.muted).text(subtitle + ' · ' + distritoDoImovel(im) + ' · Portugal', ML, subtitleY, { width: CW, align: 'center' })
    d.rect(ML + 80, accent2Y, CW - 160, 0.5).fill(C.gold)
    d.fontSize(9).fillColor(C.muted).text(NOW(), ML, dateY, { width: CW, align: 'center' })
    d.rect(ML, PH - 65, CW, 0.5).fill(C.gold)
    d.fontSize(7).fillColor(C.muted).text('Somnium Properties · Investimento Imobiliário', ML, PH - 52, { width: CW, align: 'center' })
    d.fontSize(7).fillColor(C.muted).text(`Documento Confidencial · ${NOW()}`, ML, PH - 40, { width: CW, align: 'center' })
    d.rect(0, PH - 6, PW, 6).fill(C.gold)
  }

  // No-op (compatibilidade): hero items agora são passados via opts.heroItems
  // no constructor e desenhados dentro de _drawCover.
  drawCoverHero() { return this }

  newPage() {
    // CRÍTICO: margin:0 impede o PDFKit de auto-paginar quando texto wrap
    // ultrapassa a margem inferior. Toda a paginação é controlada manualmente
    // via this.y + ensure() — nunca implícita pelo PDFKit. Isto elimina as
    // páginas pares em branco causadas por auto-page seguido de newPage manual.
    this.doc.addPage({ size: 'A4', margin: 0 })
    const d = this.doc
    if (this.style === 'investor') {
      try { d.image(LOGO_BLACK_PNG, ML, 18, { height: 16 }) } catch {}
      d.fontSize(7).fillColor(C.muted).text(this.title || 'Relatório de Investimento', ML, 22, { width: CW, align: 'right', lineBreak: false })
      d.rect(ML, 42, CW, 1).fill(C.gold)
      d.rect(ML, PH - 42, CW, 0.4).fill(C.gold)
      d.fontSize(6.5).fillColor(C.muted).text(`Confidencial · Somnium Properties · ${NOW()}`, ML, PH - 35, { width: CW, align: 'center', lineBreak: false })
    } else {
      try { d.image(LOGO_BLACK_PNG, ML, 15, { height: 22 }) } catch {}
      d.rect(ML, 45, CW, 1.5).fill(C.gold)
      d.rect(ML, PH - 45, CW, 0.5).fill(C.gold)
    }
    this.y = 60
    return this
  }

  // Bloco "Pontos fortes / Pontos fracos / Riscos" — usa campos do imóvel.
  // Renderiza apenas as colunas que tiverem conteúdo. Calcula altura
  // máxima das três colunas antes de desenhar para evitar sobreposição
  // e auto-paginação do PDFKit.
  pontosFortesFracosRiscos() {
    const im = this.imovel || {}
    const blocks = [
      { label: 'PONTOS FORTES',  text: im.pontos_fortes,  color: C.green },
      { label: 'PONTOS FRACOS',  text: im.pontos_fracos,  color: C.red },
      { label: 'RISCOS',         text: im.riscos,         color: C.gold },
    ].filter(b => b.text && String(b.text).trim())
    if (blocks.length === 0) return this

    const gap = 12
    const colW = (CW - (blocks.length - 1) * gap) / blocks.length
    const labelH = 18
    const itemLineGap = 3
    const itemFontSize = 8.5
    const bulletW = 12          // largura reservada para o triangulo
    const itemPadL = 2          // recuo do texto a partir do triangulo
    const textW = colW - bulletW - itemPadL
    const itemSpacing = 7       // espaco entre items
    const headerGap = 12        // gap entre header colorido e primeiro item

    // Pre-calculo: altura de cada coluna (cabecalho + items wrappable)
    this.doc.fontSize(itemFontSize)
    const colHeights = blocks.map(b => {
      const items = parseListItems(b.text)
      let h = labelH + headerGap
      items.forEach((it, idx) => {
        h += this.doc.heightOfString(it, { width: textW, lineGap: itemLineGap })
        if (idx < items.length - 1) h += itemSpacing
      })
      return { h, items }
    })
    const blockH = Math.max(...colHeights.map(c => c.h))

    // Anti-orfao: garantir espaco para header + bloco antes de desenhar
    // o titulo. Caso contrario o titulo ficaria sozinho no fundo de uma
    // pagina e o conteudo das colunas saltaria para a seguinte.
    const headerH = 32
    this.ensure(headerH + blockH + 8)
    this.header('PONTOS FORTES, PONTOS FRACOS E RISCOS')
    const startY = this.y

    blocks.forEach((b, i) => {
      const x = ML + i * (colW + gap)
      const { items } = colHeights[i]
      // Header colorido
      this.doc.roundedRect(x, startY, colW, labelH, 4).fill(b.color)
      this.doc.fontSize(7.5).fillColor(C.white).text(b.label, x + 10, startY + 6, {
        width: colW - 20, characterSpacing: 1.2, lineBreak: false,
      })
      // Items
      let cy = startY + labelH + headerGap
      items.forEach((it, idx) => {
        this.doc.fontSize(itemFontSize).fillColor(C.body)
        const itemH = this.doc.heightOfString(it, { width: textW, lineGap: itemLineGap })
        // Triangulo desenhado a primitives (▸ nao existe na fonte default)
        const tx = x + 2, ty = cy + 3
        this.doc.polygon([tx, ty], [tx + 4, ty + 3], [tx, ty + 6]).fill(b.color)
        this.doc.fillColor(C.body).text(it, x + bulletW, cy, { width: textW, lineGap: itemLineGap })
        cy += itemH + (idx < items.length - 1 ? itemSpacing : 0)
      })
    })

    this.y = startY + blockH + 10
    return this
  }

  // Tabela "Risco → Estratégia de mitigação". Empareja linha-a-linha o
  // conteúdo de im.riscos com im.mitigacao_riscos. Linhas extra de qualquer
  // dos lados ficam isoladas (sem par). Só renderiza se houver mitigações
  // definidas — caso contrário a coluna 'Riscos' do bloco anterior basta.
  // opts.skipHeader=true → não desenha o header de secção (caller já o emitiu como subheader)
  riscosMitigacao(opts = {}) {
    const im = this.imovel || {}
    const riscos = parseListItems(im.riscos)
    const mitig  = parseListItems(im.mitigacao_riscos)
    if (mitig.length === 0) return this

    const n = Math.max(riscos.length, mitig.length)
    const pairs = []
    for (let i = 0; i < n; i++) pairs.push({ r: riscos[i] || '—', m: mitig[i] || '—' })

    const colR = Math.floor((CW - 12) * 0.42)
    const colM = CW - 12 - colR
    const padX = 10, padY = 7, gap = 12

    // Anti-orfao: estimar altura da primeira linha (par) + cabecalho da
    // tabela + header de seccao para garantir que o titulo nao fica
    // sozinho no fundo de uma pagina. Calcula com a primeira linha.
    this.doc.fontSize(8.5)
    const hR0 = this.doc.heightOfString(pairs[0]?.r || '—', { width: colR - padX * 2 - 6, lineGap: 3 })
    const hM0 = this.doc.heightOfString(pairs[0]?.m || '—', { width: colM - padX - 14, lineGap: 3 })
    const firstRowH = Math.max(hR0, hM0) + padY * 2
    const headerSeccaoH = opts.skipHeader ? 0 : 32, tableHeaderH = 24
    this.ensure(headerSeccaoH + tableHeaderH + firstRowH + 8)

    if (!opts.skipHeader) this.header('ANÁLISE DE RISCO E MITIGAÇÃO')

    // Cabecalho
    this.ensure(24)
    this.doc.rect(ML, this.y, CW, 22).fill(C.headerBg)
    this.doc.fontSize(7.5).fillColor(C.gold).text('RISCO', ML + padX, this.y + padY, { width: colR - padX, characterSpacing: 1, lineBreak: false })
    this.doc.fontSize(7.5).fillColor(C.gold).text('ESTRATÉGIA DE MITIGAÇÃO', ML + colR + gap, this.y + padY, { width: colM, characterSpacing: 1, lineBreak: false })
    this.y += 24

    pairs.forEach(({ r, m }) => {
      this.doc.fontSize(8.5)
      const hR = this.doc.heightOfString(r, { width: colR - padX * 2 - 6, lineGap: 3 })
      const hM = this.doc.heightOfString(m, { width: colM - padX - 14, lineGap: 3 })
      const rowH = Math.max(hR, hM) + padY * 2
      this.ensure(rowH + 1)
      // Triangulo vermelho (risco)
      const tx1 = ML + 2, ty1 = this.y + padY + 2
      this.doc.polygon([tx1, ty1], [tx1 + 4, ty1 + 3], [tx1, ty1 + 6]).fill(C.red)
      this.doc.fillColor(C.body).fontSize(8.5).text(r, ML + padX, this.y + padY, { width: colR - padX * 2 - 6, lineGap: 3 })
      // Seta verde (mitigacao) — desenhada com primitives (-> nao renderiza)
      const ax = ML + colR + 2, ay = this.y + padY + 4
      this.doc.lineWidth(1.2).strokeColor(C.green)
      this.doc.moveTo(ax, ay).lineTo(ax + 7, ay).stroke()
      this.doc.polygon([ax + 5, ay - 2.5], [ax + 8.5, ay], [ax + 5, ay + 2.5]).fill(C.green)
      this.doc.fillColor(C.body).fontSize(8.5).text(m, ML + colR + gap, this.y + padY, { width: colM - padX - 14, lineGap: 3 })
      this.doc.rect(ML, this.y + rowH - 0.5, CW, 0.3).fill(C.border)
      this.y += rowH
    })
    this.y += 4
    return this
  }

  // Imagem de localizacao (estudo composto: mapa satelite + cards + tabela
  // de POIs). Renderiza a imagem ao tamanho natural maximizado: largura
  // CW completa, altura conforme aspect ratio real do PNG, encolhendo se
  // ultrapassar o espaco vertical disponivel ate ao fundo da pagina. O
  // SVG do estudo ja tem o seu proprio cabecalho — nao adicionamos um
  // header redundante.
  localizacao() {
    const im = this.imovel || {}
    const url = im.localizacao_imagem
    const cached = im._localizacaoImgData
    if (!url && !cached) return this

    let imgData = cached || null
    if (!imgData && url && !url.startsWith('http')) {
      const localPath = path.resolve(__dirname, '../..', 'public', url.replace(/^\//, ''))
      if (existsSync(localPath)) { try { imgData = readFileSync(localPath) } catch {} }
    }
    if (!imgData) {
      this.header('LOCALIZAÇÃO')
      this.note('Imagem de localização não disponível neste momento.')
      return this
    }

    // Aspect ratio real (h/w). Fallback ~1.4 cobre o estudo padrao quando
    // nao temos um PNG (improvavel — preloadLocalizacao normaliza tudo).
    const dims = pngDimensions(imgData)
    const ratio = dims ? dims.h / dims.w : 1.4

    // Caixa: largura CW, altura natural, encolhe se nao couber na pagina.
    const availH = PH - this.y - 50
    let drawW = CW
    let drawH = drawW * ratio
    if (drawH > availH) { drawH = availH; drawW = drawH / ratio }
    const x = ML + (CW - drawW) / 2

    let drawn = false
    this.doc.save()
    try {
      this.doc.roundedRect(x, this.y, drawW, drawH, 4).clip()
      this.doc.image(imgData, x, this.y, { width: drawW, height: drawH })
      drawn = true
    } catch {
      // PDFKit recusou o buffer (formato nao suportado e nao normalizado)
    }
    this.doc.restore()
    if (drawn) {
      this.doc.roundedRect(x, this.y, drawW, drawH, 4).lineWidth(0.5).stroke(C.border)
      this.y += drawH + 8
    } else {
      this.header('LOCALIZAÇÃO')
      this.note('Imagem de localização não disponível neste momento.')
    }
    return this
  }

  ensure(needed) {
    // Margem inferior de 70 (em vez de 50) para evitar que o PDFKit
    // auto-pagine entre a chamada ensure() e a escrita seguinte.
    if (this.y > 50 && this.y + needed > PH - 70) this.newPage()
    return this
  }

  // Section header — caixa preta com texto a dourado (estilo stamp corporativo).
  // Maior peso visual: bloco solido com padding generoso, texto Bold 14pt em
  // dourado, characterSpacing alargado. Anti-orfao: reserva header + 80pt.
  header(title) {
    const upper = (title || '').toUpperCase()
    const padX = 14
    const padY = 9
    this.doc.font('Helvetica-Bold').fontSize(14)
    const titleH = this.doc.heightOfString(upper, { width: CW - padX * 2, characterSpacing: 0.6 })
    const boxH = titleH + padY * 2
    this.ensure(boxH + 8 + 80)
    if (this._sections) {
      try {
        const range = this.doc.bufferedPageRange()
        const currentPageIndex = range.start + range.count - 1
        this._sections.push({ title, pageIndex: currentPageIndex, level: 1 })
      } catch {}
    }
    // Caixa preta solida
    this.doc.rect(ML, this.y, CW, boxH).fill(C.black)
    // Faixa dourada fina a esquerda (5pt) — accent
    this.doc.rect(ML, this.y, 5, boxH).fill(C.gold)
    // Titulo em dourado
    this.doc.font('Helvetica-Bold').fontSize(14).fillColor(C.gold)
      .text(upper, ML + padX, this.y + padY, { width: CW - padX * 2, characterSpacing: 0.6, lineBreak: false })
    this.y += boxH + 12
    // Reset
    this.doc.font('Helvetica').fontSize(9).fillColor(C.body)
    return this
  }

  // Sub-header (lighter, smaller). Anti-orfao igual ao header.
  subheader(title) {
    const upper = (title || '').toUpperCase()
    this.doc.fontSize(9.5)
    const titleH = this.doc.heightOfString(upper, { width: CW, characterSpacing: 0.3 })
    this.ensure(titleH + 12 + 60)
    this.doc.fillColor(C.body).text(upper, ML, this.y, { width: CW, characterSpacing: 0.3 })
    this.y += titleH + 2
    this.doc.rect(ML, this.y, 40, 1).fill(C.gold)
    this.y += 8
    return this
  }

  // Section subtitle (gold underline)
  section(title) {
    this.ensure(28)
    this.doc.fontSize(11).fillColor(C.body).text(title, ML, this.y, { lineBreak: false })
    this.y += 15
    this.doc.rect(ML, this.y, 30, 2).fill(C.gold)
    this.doc.rect(ML + 32, this.y + 0.5, CW - 32, 0.5).fill(C.border)
    this.y += 10
    return this
  }

  // Data row (label + value in a clean box)
  row(label, value, options = {}) {
    this.ensure(30)
    const alt = options.alt
    if (alt) this.doc.roundedRect(ML, this.y, CW, 26, 3).fill(C.light)
    this.doc.fontSize(7).fillColor(C.muted).text(label.toUpperCase(), ML + 12, this.y + 5, { width: 155, lineBreak: false })
    this.doc.fontSize(9).fillColor(C.body).text(String(value || '—'), ML + 175, this.y + 4, { width: CW - 190 })
    this.y = Math.max(this.y + 26, this.doc.y + 2)
    return this
  }

  // Editable field (label + rounded input box — mobile friendly)
  input(label, value, options = {}) {
    this.ensure(options.tall ? 60 : 38)
    const h = options.tall ? 50 : 26
    this.doc.fontSize(7).fillColor(C.muted).text(label.toUpperCase(), ML, this.y, { lineBreak: false })
    this.y += 11
    this.doc.roundedRect(ML, this.y, options.half ? CW / 2 - 5 : CW, h, 4).lineWidth(0.5).stroke(C.border)
    if (value) {
      this.doc.fontSize(9).fillColor(C.body).text(String(value), ML + 8, this.y + 6, { width: (options.half ? CW / 2 - 20 : CW - 16) })
    }
    this.y += h + 6
    return this
  }

  // Two inputs side by side
  inputRow(label1, value1, label2, value2) {
    this.ensure(38)
    const halfW = CW / 2 - 5
    // Left
    this.doc.fontSize(7).fillColor(C.muted).text(label1.toUpperCase(), ML, this.y, { lineBreak: false })
    this.doc.fontSize(7).fillColor(C.muted).text(label2.toUpperCase(), ML + halfW + 10, this.y, { lineBreak: false })
    this.y += 11
    this.doc.roundedRect(ML, this.y, halfW, 26, 4).lineWidth(0.5).stroke(C.border)
    this.doc.roundedRect(ML + halfW + 10, this.y, halfW, 26, 4).lineWidth(0.5).stroke(C.border)
    if (value1) this.doc.fontSize(9).fillColor(C.body).text(String(value1), ML + 8, this.y + 6, { width: halfW - 16, lineBreak: false })
    if (value2) this.doc.fontSize(9).fillColor(C.body).text(String(value2), ML + halfW + 18, this.y + 6, { width: halfW - 16, lineBreak: false })
    this.y += 32
    return this
  }

  // Checkbox item (large touch target for mobile)
  check(text, checked = false) {
    this.ensure(24)
    this.doc.roundedRect(ML + 2, this.y + 2, 14, 14, 3).lineWidth(0.5).stroke(C.border)
    if (checked) {
      // Check desenhado a primitives (✓ nao renderiza na fonte default)
      this.doc.lineWidth(1.4).strokeColor(C.green)
      this.doc.moveTo(ML + 5, this.y + 9).lineTo(ML + 8, this.y + 12).lineTo(ML + 13, this.y + 6).stroke()
    }
    this.doc.fontSize(9).fillColor(C.body).text(text, ML + 24, this.y + 3, { width: CW - 30 })
    this.y = Math.max(this.y + 22, this.doc.y + 4)
    return this
  }

  // Info text
  text(content, options = {}) {
    const fontSize = options.size || 9
    const lineGap = options.lineGap || 4
    this.doc.fontSize(fontSize)
    const h = this.doc.heightOfString(String(content || ''), { width: CW, lineGap })
    this.ensure(h + 8)
    this.doc.fillColor(options.color || C.body).text(String(content || ''), ML, this.y, { width: CW, lineGap })
    this.y += h + 6
    return this
  }

  // Highlighted box (for important info)
  highlight(label, value, color = C.gold) {
    this.ensure(40)
    this.doc.roundedRect(ML, this.y, CW, 34, 4).fill(color).opacity(0.08)
    this.doc.opacity(1)
    this.doc.roundedRect(ML, this.y, CW, 34, 4).lineWidth(0.5).stroke(color)
    this.doc.fontSize(7).fillColor(C.muted).text(label.toUpperCase(), ML + 12, this.y + 5, { lineBreak: false })
    this.doc.fontSize(12).fillColor(C.body).text(String(value || '—'), ML + 12, this.y + 16, { lineBreak: false })
    this.y += 40
    return this
  }

  // Spacing
  space(px = 8) { this.y += px; return this }

  // Numbered step
  step(num, text) {
    this.doc.fontSize(9)
    const h = this.doc.heightOfString(String(text || ''), { width: CW - 30 })
    this.ensure(Math.max(22, h + 8))
    this.doc.circle(ML + 8, this.y + 8, 8).fill(C.gold)
    this.doc.fontSize(8).fillColor(C.white).text(String(num), ML + 3, this.y + 4, { width: 10, align: 'center', lineBreak: false })
    this.doc.fontSize(9).fillColor(C.body).text(text, ML + 24, this.y + 3, { width: CW - 30 })
    this.y += Math.max(20, h + 4)
    return this
  }

  // Photo gallery — grid of property photos
  photos(fotos, title = 'GALERIA FOTOGRÁFICA') {
    if (!fotos || fotos.length === 0) return this
    this.header(title)
    const ROOT = path.resolve(__dirname, '../..')
    const imgSize = (CW - 10) / 2 // 2 columns
    const imgHeight = imgSize * 0.65 // 4:3ish ratio
    let col = 0
    for (const foto of fotos) {
      // Skip non-image files
      if (!foto.type?.startsWith('image/') && !foto.path?.match(/\.(jpg|jpeg|png|webp)$/i)) continue
      try {
        // Buffer pré-carregado (URLs remotas Supabase) ou leitura do disco local.
        let imgData = foto._data || null
        if (!imgData) {
          if (!foto.path || /^https?:\/\//i.test(foto.path)) continue // remota sem buffer → salta
          imgData = readFileSync(path.join(ROOT, 'public', foto.path))
        }
        this.ensure(imgHeight + 20)
        const x = ML + col * (imgSize + 10)
        this.doc.save()
        this.doc.roundedRect(x, this.y, imgSize, imgHeight, 4).clip()
        this.doc.image(imgData, x, this.y, { width: imgSize, height: imgHeight, fit: [imgSize, imgHeight], align: 'center', valign: 'center' })
        this.doc.restore()
        // Border
        this.doc.roundedRect(x, this.y, imgSize, imgHeight, 4).lineWidth(0.5).stroke(C.border)
        col++
        if (col >= 2) {
          col = 0
          this.y += imgHeight + 8
        }
      } catch {
        // File not found — skip silently
      }
    }
    if (col > 0) this.y += imgHeight + 8 // close last row
    this.space(4)
    return this
  }

  // Bullet point
  bullet(text) {
    this.doc.fontSize(9)
    const h = this.doc.heightOfString(String(text || ''), { width: CW - 14, lineGap: 3 })
    this.ensure(h + 8)
    // Triangulo desenhado a primitives (▸ nao existe na fonte default)
    const tx = ML + 1, ty = this.y + 3
    this.doc.polygon([tx, ty], [tx + 4, ty + 3], [tx, ty + 6]).fill(C.gold)
    this.doc.fillColor(C.body).text(String(text || ''), ML + 14, this.y, { width: CW - 14, lineGap: 3 })
    this.y += h + 4
    return this
  }

  // Table header
  tableHeader(cols) {
    this.ensure(22)
    this.doc.rect(ML, this.y, CW, 20).fill(C.black)
    let x = ML + 8
    for (const [label, w] of cols) {
      this.doc.fontSize(7).fillColor(C.gold).text(label.toUpperCase(), x, this.y + 6, { width: w, lineBreak: false })
      x += w
    }
    this.y += 22
    return this
  }

  // Table row
  tableRow(values, widths, alt = false) {
    this.ensure(22)
    if (alt) this.doc.rect(ML, this.y, CW, 20).fill(C.light)
    let x = ML + 8
    for (let i = 0; i < values.length; i++) {
      this.doc.fontSize(8).fillColor(C.body).text(String(values[i] || '—'), x, this.y + 5, { width: widths[i], lineBreak: false })
      x += widths[i]
    }
    this.y += 22
    return this
  }

  // ── Metodos empresariais (minimalistas, sem caixas escuras) ─

  // KPI grid — thin bordered cells, like the reference document
  bigNumbers(items) {
    const colW = CW / items.length
    // Suporta `value` em string ou array de linhas (forca quebra), e `valueColor` opcional por item
    const valueLines = (item) => {
      if (Array.isArray(item.value)) return item.value.map(v => String(v))
      return [String(item.value || '—')]
    }
    // Auto-shrink se texto largo, considerando wrap em multiplas linhas
    const fitSize = (line) => {
      const maxW = colW - 20
      let size = 16
      while (size >= 10) {
        const w = this.doc.fontSize(size).widthOfString(line)
        if (w <= maxW) return size
        size -= 1
      }
      return 10
    }
    // Pre-calcular dimensoes
    let maxValueH = 22
    items.forEach(item => {
      const lines = valueLines(item)
      const baseSize = lines.length > 1 ? 14 : 16
      const sizes = lines.map(l => Math.min(baseSize, fitSize(l)))
      const totalH = sizes.reduce((s, sz) => s + sz + 2, 0)
      if (totalH > maxValueH) maxValueH = totalH
    })
    let maxSubH = 0
    items.forEach(item => {
      if (item.sub) {
        const h = this.doc.fontSize(7).heightOfString(item.sub, { width: colW - 20, lineGap: 2 })
        if (h > maxSubH) maxSubH = h
      }
    })
    const cellH = Math.max(50, 16 + maxValueH + 4 + maxSubH + 8)
    this.ensure(cellH + 6)
    this.doc.rect(ML, this.y, CW, cellH).lineWidth(0.5).stroke(C.border)
    items.forEach((item, i) => {
      const x = ML + i * colW
      if (i > 0) this.doc.rect(x, this.y, 0.5, cellH).fill(C.border)
      this.doc.fontSize(7).fillColor(C.muted).text((item.label || '').toUpperCase(), x + 10, this.y + 8, { width: colW - 20, lineBreak: false, characterSpacing: 0.3 })
      const lines = valueLines(item)
      const baseSize = lines.length > 1 ? 14 : 16
      const valColor = item.valueColor || C.body
      let yLine = this.y + 22
      lines.forEach((ln) => {
        const sz = Math.min(baseSize, fitSize(ln))
        this.doc.fontSize(sz).fillColor(valColor).text(ln, x + 10, yLine, { width: colW - 20, lineBreak: false })
        yLine += sz + 2
      })
      if (item.sub) {
        const subY = this.y + 16 + maxValueH + 4
        this.doc.fontSize(7).fillColor(C.muted).text(item.sub, x + 10, subY, { width: colW - 20, lineGap: 2 })
      }
    })
    this.y += cellH + 6
    return this
  }

  // Dados inline — label: valor lado a lado, compacto
  inlineData(items) {
    this.ensure(16)
    const colW = CW / items.length
    items.forEach((item, i) => {
      const x = ML + i * colW
      this.doc.fontSize(7.5).fillColor(C.muted).text(`${item.label}: `, x, this.y + 2, { width: colW - 4, continued: true, lineBreak: false }).fillColor(C.body).text(String(item.value || '—'), { lineBreak: false })
    })
    this.y += 16
    return this
  }

  // Professional table — warm header, generous rows (reference style)
  // Cada linha é verificada individualmente para evitar overflow auto-paginado.
  // row.link → torna o valor clicável (sublinhado, cor gold)
  simpleTable(rows) {
    rows.forEach(row => {
      const isTotal = row.total
      const fontSize = isTotal ? 9.5 : 8.5
      const labelW = 310
      const valueW = CW - 330
      this.doc.fontSize(fontSize)
      const labelH = this.doc.heightOfString(row.label || '', { width: labelW })
      const valueH = this.doc.heightOfString(String(row.value || '—'), { width: valueW })
      const contentH = Math.max(labelH, valueH)
      const rowH = Math.max(isTotal ? 26 : 22, contentH + 12)
      this.ensure(rowH + 1)
      if (isTotal) this.doc.rect(ML, this.y, CW, rowH).fill(C.totalBg)
      this.doc.fontSize(fontSize).fillColor(C.body).text(row.label || '', ML + 10, this.y + 6, { width: labelW })
      const valColor = row.color || (row.link ? C.gold : (isTotal ? C.gold : C.body))
      const valOpts = { width: valueW, align: 'right' }
      if (row.link) { valOpts.link = row.link; valOpts.underline = true }
      this.doc.fontSize(fontSize).fillColor(valColor).text(String(row.value || '—'), ML + 320, this.y + 6, valOpts)
      this.doc.rect(ML, this.y + rowH - 0.3, CW, 0.3).fill(C.border)
      this.y += rowH
    })
    this.y += 4
    return this
  }

  // Two-column rows — duas listas de pares label/valor renderizadas lado a lado.
  // Util para fichas individuais: atributos esquerda, ajustes direita.
  // Cada row: { label, value, color?, total? }. total: true ⇒ fundo destacado + bold + dourado.
  // Altura de cada linha calculada dinamicamente conforme texto (suporta wrap).
  twoColRows(leftRows, rightRows) {
    const colW = CW / 2
    const labelW = colW * 0.58
    const valueW = colW * 0.42 - 12
    const max = Math.max(leftRows.length, rightRows.length)
    const measure = (row, total) => {
      if (!row) return 0
      const fs = total ? 9 : 8.5
      this.doc.fontSize(fs)
      const lh = this.doc.heightOfString(row.label || '', { width: labelW - 4 })
      const vh = this.doc.heightOfString(String(row.value || '—'), { width: valueW })
      return Math.max(lh, vh)
    }
    const renderHalf = (row, x0, y0, total) => {
      if (!row) return
      const labelX = x0 + 8
      const valueX = x0 + 8 + labelW
      const fontSize = total ? 9 : 8.5
      const valColor = row.color || (total ? C.gold : C.body)
      this.doc.fontSize(fontSize).fillColor(C.body).text(row.label || '', labelX, y0 + 6, { width: labelW - 4 })
      this.doc.fontSize(fontSize).fillColor(valColor).text(String(row.value || '—'), valueX, y0 + 6, { width: valueW, align: 'right' })
    }
    for (let i = 0; i < max; i++) {
      const left = leftRows[i]
      const right = rightRows[i]
      const isTotal = (left?.total || right?.total)
      const contentH = Math.max(measure(left, isTotal), measure(right, isTotal))
      const rowH = Math.max(isTotal ? 24 : 20, contentH + 12)
      this.ensure(rowH + 1)
      if (isTotal) this.doc.rect(ML, this.y, CW, rowH).fill(C.totalBg)
      this.doc.rect(ML + colW, this.y + 2, 0.4, rowH - 4).fill(C.border)
      renderHalf(left, ML, this.y, left?.total)
      renderHalf(right, ML + colW, this.y, right?.total)
      this.doc.rect(ML, this.y + rowH - 0.3, CW, 0.3).fill(C.border)
      this.y += rowH
    }
    this.y += 4
    return this
  }

  // Column table — warm gray header with gold labels (reference style)
  // Cada linha verificada individualmente para evitar overflow auto-paginado.
  // Altura de cada linha calculada dinamicamente conforme conteudo (suporta wrap).
  colTable(headers, rows) {
    this.ensure(24)
    this.doc.rect(ML, this.y, CW, 22).fill(C.headerBg)
    let x = ML + 8
    for (const [label, w] of headers) {
      this.doc.fontSize(7.5).fillColor(C.gold).text(label, x, this.y + 6, { width: w, lineBreak: false })
      x += w
    }
    this.y += 24
    const measureRow = (vals, isTotal) => {
      let maxH = 0
      const fs = isTotal ? 9 : 8.5
      this.doc.fontSize(fs)
      for (let i = 0; i < vals.length; i++) {
        const cell = vals[i]
        const val = cell?.value !== undefined ? cell.value : cell
        const h = this.doc.heightOfString(String(val || '—'), { width: headers[i][1] })
        if (h > maxH) maxH = h
      }
      return maxH
    }
    rows.forEach(row => {
      const isTotal = row._total
      const vals = row._values || row
      const contentH = measureRow(vals, isTotal)
      const rowH = Math.max(isTotal ? 26 : 24, contentH + 12)
      this.ensure(rowH + 1)
      if (isTotal) this.doc.rect(ML, this.y, CW, rowH).fill(C.totalBg)
      x = ML + 8
      for (let i = 0; i < vals.length; i++) {
        const cell = vals[i]
        const val = cell?.value !== undefined ? cell.value : cell
        const clr = cell?.color || C.body
        const link = cell?.link
        const opts = { width: headers[i][1] }
        if (link) { opts.link = link; opts.underline = true }
        this.doc.fontSize(isTotal ? 9 : 8.5).fillColor(clr).text(String(val || '—'), x, this.y + 6, opts)
        x += headers[i][1]
      }
      this.doc.rect(ML, this.y + rowH - 0.3, CW, 0.3).fill(C.border)
      this.y += rowH
    })
    this.y += 4
    return this
  }

  // Metrica simples — label + valor
  metric(label, value, options = {}) {
    this.ensure(16)
    const { total } = options
    if (total) { this.doc.rect(ML, this.y - 1, CW, 0.5).fill(C.body); this.y += 3 }
    this.doc.fontSize(total ? 9 : 8.5).fillColor(C.body).text(label, ML + 4, this.y + 1, { width: 320, lineBreak: false })
    this.doc.fontSize(total ? 9 : 8.5).fillColor(C.body).text(String(value || '—'), ML + 330, this.y + 1, { width: CW - 334, align: 'right', lineBreak: false })
    if (!total) this.doc.rect(ML, this.y + 13, CW, 0.2).fill('#e0ddd5')
    this.y += total ? 18 : 14
    return this
  }

  // Narrative text block
  textBlock(content) {
    this.doc.fontSize(9)
    const h = this.doc.heightOfString(String(content || ''), { width: CW, lineGap: 4 })
    this.ensure(h + 12)
    this.doc.fillColor(C.body).text(String(content || ''), ML, this.y, { width: CW, lineGap: 4, align: 'justify' })
    this.y += h + 8
    return this
  }

  // Note/pressuposto
  note(text) {
    this.doc.fontSize(7.5)
    const h = this.doc.heightOfString(String(text || ''), { width: CW, lineGap: 3 })
    this.ensure(h + 8)
    this.doc.fillColor(C.muted).text(String(text || ''), ML, this.y, { width: CW, lineGap: 3 })
    this.y += h + 4
    return this
  }

  verdict(text, isPositive) {
    this.doc.fontSize(9.5)
    const h = this.doc.heightOfString(String(text || ''), { width: CW, lineGap: 2 })
    this.ensure(h + 10)
    this.doc.fillColor(isPositive ? C.green : C.red).text(String(text || ''), ML, this.y, { width: CW, lineGap: 2 })
    this.y += h + 8
    return this
  }

  // Linha com 2 pares label/valor lado a lado (cada par ocupa metade da largura).
  // Útil quando dois campos são complementares e devem ser lidos juntos.
  splitRow(left, right) {
    const rowH = 22
    this.ensure(rowH + 1)
    const halfW = CW / 2
    const labelW = 95
    const valW = halfW - labelW - 20
    this.doc.fontSize(8.5)
    // Esquerda
    this.doc.fillColor(C.body).text(left.label || '', ML + 10, this.y + 6, { width: labelW, lineBreak: false })
    const lOpts = { width: valW, align: 'right', lineBreak: false }
    if (left.link) { lOpts.link = left.link; lOpts.underline = true }
    this.doc.fillColor(left.link ? C.gold : C.body).text(String(left.value || '—'), ML + 10 + labelW, this.y + 6, lOpts)
    // Direita
    this.doc.fillColor(C.body).text(right.label || '', ML + halfW + 10, this.y + 6, { width: labelW, lineBreak: false })
    const rOpts = { width: valW, align: 'right', lineBreak: false }
    if (right.link) { rOpts.link = right.link; rOpts.underline = true }
    this.doc.fillColor(right.link ? C.gold : C.body).text(String(right.value || '—'), ML + halfW + 10 + labelW, this.y + 6, rOpts)
    this.doc.rect(ML, this.y + rowH, CW, 0.3).fill(C.border)
    this.y += rowH
    return this
  }

  // Carimbo "Ficha gerada em <data> · Versão N" antes do disclaimer.
  // Lê de this.imovel._version e this.imovel._generatedAt (injectados em persistDocumento).
  versionStamp() {
    const im = this.imovel || {}
    if (!im._version) return this
    const dt = im._generatedAt ? new Date(im._generatedAt) : new Date()
    const dateStr = dt.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
    const txt = `Ficha gerada em ${dateStr} · Versão ${im._version}`
    this.doc.fontSize(7).fillColor(C.muted)
    const h = this.doc.heightOfString(txt, { width: CW })
    this.ensure(h + 6)
    this.doc.text(txt, ML, this.y, { width: CW, align: 'right' })
    this.y += h + 4
    return this
  }

  disclaimer() {
    const txt = 'Este documento é preparado para fins informativos e não constitui aconselhamento financeiro ou fiscal. Os valores são estimativas e podem variar. Somnium Properties — Confidencial.'
    this.doc.fontSize(6.5)
    const h = this.doc.heightOfString(txt, { width: CW, lineGap: 2 })
    this.ensure(h + 14)
    this.doc.rect(ML, this.y, CW, 0.3).fill(C.border)
    this.y += 6
    this.doc.fillColor(C.muted).text(txt, ML, this.y, { width: CW, lineGap: 2 })
    this.y += h + 4
    return this
  }

  // Indice (TOC) — preenche a pagina reservada apos a capa com a lista de
  // seccoes registadas via header(). Chamada antes de applyFooter() / end().
  // No-op se a opcao withIndex nao foi activada no construtor.
  applyIndex() {
    if (!this._sections || this._tocPageIndex == null) return this
    if (this._sections.length === 0) return this
    try {
      // Deduplicar pelos titulos (alguns headers repetem-se em sub-renderers)
      const seen = new Set()
      const unique = []
      for (const s of this._sections) {
        if (!s || !s.title) continue
        const key = s.title.trim().toUpperCase()
        if (seen.has(key)) continue
        seen.add(key)
        unique.push(s)
      }
      this.doc.switchToPage(this._tocPageIndex)
      const d = this.doc
      const x = ML
      let y = 70
      // Titulo
      d.fontSize(18).fillColor(C.body).text('ÍNDICE', x, y, { width: CW, lineBreak: false })
      y += 30
      d.rect(x, y, CW, 1.5).fill(C.gold)
      y += 24
      // Calcular paginas livres (max 30 entradas para nao overflow)
      const items = unique.slice(0, 30)
      const lineGap = 8
      for (const s of items) {
        d.fontSize(10).fillColor(C.body)
        const titleStr = (s.title || '').toString()
        const pageStr = String((s.pageIndex || 0) + 1)
        const titleW = CW - 40
        const titleMax = titleW * 0.85
        // Title
        d.text(titleStr, x, y, { width: titleMax, lineBreak: false, ellipsis: true })
        // Page number (right-aligned)
        d.text(pageStr, x + CW - 30, y, { width: 25, align: 'right', lineBreak: false })
        // Linha dotted via dash() — eficiente (1 stroke vs centenas de rects)
        const titleActualW = Math.min(d.widthOfString(titleStr), titleMax)
        const dotsStartX = x + titleActualW + 6
        const dotsEndX = x + CW - 36
        if (dotsEndX > dotsStartX + 4) {
          d.save()
          d.lineWidth(0.6).strokeColor(C.muted).dash(1, { space: 2 })
          d.moveTo(dotsStartX, y + 7).lineTo(dotsEndX, y + 7).stroke()
          d.undash()
          d.restore()
        }
        y += 12 + lineGap
        if (y > PH - 80) break
      }
    } catch (e) {
      console.warn('[docbuilder] applyIndex falhou:', e.message, '\n', e.stack)
    }
    return this
  }

  // Footer aplicado a todas as paginas — chamada UMA VEZ antes de end().
  // Le metadata injectada pelo persistDocumento em this.imovel:
  //   _version, _generatedAt, _documentId, _tipoLabel, _pdfHashShort.
  // Se nada estiver injectado (geracao on-demand sem persistencia), faz no-op.
  applyFooter() {
    const im = this.imovel || {}
    const version = im._version
    const docId = im._documentId
    const hash = im._pdfHashShort
    const label = im._tipoLabel || this.title || 'Documento'
    const generatedAt = im._generatedAt ? new Date(im._generatedAt) : new Date()
    const dateStr = generatedAt.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })

    // Sem versao nem id, nao ha footer util — sair em silencio.
    if (!version && !docId && !hash) return this

    try {
      const range = this.doc.bufferedPageRange()
      const total = range.count
      // Footer ocupa ~10pt acima da linha gold ja desenhada por newPage()
      // (em PH - 45). Escrevemos a 1pt abaixo da linha, dentro da margem
      // existente. O texto e cinza claro, fontsize 6 — discreto mas legivel.
      for (let i = 0; i < total; i++) {
        const pageIndex = range.start + i
        this.doc.switchToPage(pageIndex)
        const parts = [
          label,
          version ? `v${version}` : null,
          dateStr,
          docId ? `ID ${docId}` : null,
          `Pag ${i + 1}/${total}`,
          hash ? `Hash ${hash}` : null,
        ].filter(Boolean)
        const text = parts.join(' · ')
        // PH-24: abaixo da linha "Confidencial..." do newPage (PH-35), evitando
        // a sobreposição de texto no rodapé dos documentos de investidor.
        this.doc.fontSize(6).fillColor(C.muted)
          .text(text, ML, PH - 24, { width: CW, align: 'center', lineBreak: false })
      }
    } catch {
      // bufferedPageRange so funciona com bufferPages: true — ja activado
      // no construtor. Se mesmo assim falhar, nao bloquear a geracao.
    }
    return this
  }

  end() { this.doc.end(); return this.doc }
}

// ══════════════════════════════════════════════════════════════
// STRESS TEST RENDERER — layout duas colunas (custos | retornos)
// ══════════════════════════════════════════════════════════════

function renderStressTests(b, a, opts = {}) {
  let st = a.stress_tests
  if (!st) return
  if (typeof st === 'string') try { st = JSON.parse(st) } catch { return }
  if (!st) return

  if (opts.newPage) b.newPage()
  b.header(opts.title || 'ANÁLISE DE SENSIBILIDADE — STRESS TESTS')

  // Tentar usar screenshot da UI (capturado pelo frontend)
  const screenshotPath = path.join(STRESS_DIR, `${a.id}.png`)
  if (a.id && existsSync(screenshotPath)) {
    try {
      const imgData = readFileSync(screenshotPath)
      // Calcular altura proporcional para a largura do conteudo
      const imgWidth = CW
      const imgHeight = imgWidth * 0.55 // ratio aproximado do componente
      b.ensure(imgHeight + 20)
      b.doc.image(imgData, ML, b.y, { width: imgWidth, fit: [imgWidth, imgHeight] })
      b.y += imgHeight + 10
      b.disclaimer()
      return
    } catch (e) {
      // Fallback para layout programatico se imagem falhar
    }
  }

  // Fallback: layout programatico
  const resiliente = st.veredicto === 'resiliente'
  b.verdict(
    resiliente ? 'Investimento resiliente — mantém resultado positivo em todos os cenários testados.' : 'Atenção — identificados cenários com risco de prejuízo.',
    resiliente
  )
  b.space(4)

  b.bigNumbers([
    { label: 'Pior Cenário', value: EUR(st.pior?.lucro_liquido) },
    { label: 'Cenário Base', value: EUR(st.base?.lucro_liquido) },
    { label: 'Melhor Cenário', value: EUR(st.melhor?.lucro_liquido) },
  ])
  b.space(4)

  b.simpleTable([
    ...(st.base ? [{ label: 'Base — RA', value: PCT(st.base.retorno_anualizado) }] : []),
    ...(st.pior ? [{ label: 'Pior Cenário — RA', value: PCT(st.pior.retorno_anualizado) }] : []),
    ...(st.melhor ? [{ label: 'Melhor Cenário — RA', value: PCT(st.melhor.retorno_anualizado) }] : []),
  ])

  if (st.downside?.length) {
    b.space(4)
    b.subheader('Cenários de Risco (Downside)')
    b.colTable(
      [['Cenário', 100], ['Descrição', 140], ['Lucro Líq.', 75], ['Delta', 65], ['RA', 55]],
      st.downside.map(s => ({ _values: [s.label, s.descricao || '', EUR(s.lucro_liquido), EUR(s.delta), PCT(s.retorno_anualizado)] }))
    )
  }

  if (st.upside?.length) {
    b.space(4)
    b.subheader('Cenários Favoráveis (Upside)')
    b.colTable(
      [['Cenário', 100], ['Descrição', 140], ['Lucro Líq.', 75], ['Delta', 65], ['RA', 55]],
      st.upside.map(s => ({ _values: [s.label, s.descricao || '', EUR(s.lucro_liquido), EUR(s.delta), PCT(s.retorno_anualizado)] }))
    )
  }

  // Sub-tabela: Sensibilidade ao Prazo de Detenção
  const m = opts.metrics
  if (m && Array.isArray(m.sensibilidade_prazo) && m.sensibilidade_prazo.length > 0) {
    b.space(3)
    b.subheader('Sensibilidade ao Prazo de Detenção')
    const rows = m.sensibilidade_prazo.map(s => {
      const ra = s.ra_simples_pp
      const cor = s.is_base ? '#8C6A30' : (ra > 20 ? '#1B5E20' : (ra < 5 ? '#8B1A1A' : C.body))
      const label = `${s.prazo} meses${s.is_base ? ' (base)' : ''}`
      const sinal = s.premio_pp >= 0 ? '+' : ''
      return {
        _values: [
          { value: label, color: cor },
          { value: EUR(s.lucro_liquido), color: cor },
          { value: ra.toFixed(1) + '%', color: cor },
          { value: s.is_base ? '—' : (s.delta_pp.toFixed(1) + ' pp'), color: cor },
          { value: sinal + s.premio_pp.toFixed(1) + ' pp', color: cor },
        ],
      }
    })
    b.colTable(
      [['Prazo', 100], ['Lucro Líquido', 110], ['RA Simples', 80], ['Delta vs Base', 95], ['Prémio s/ DP', 85]],
      rows
    )
    b.note('O Retorno Anualizado é sensível ao prazo de detenção. O lucro absoluto mantém-se estável; o que varia é a eficiência temporal do capital. Referência: Depósito a Prazo Portugal ~3,5% a.a. · OT Portugal 2 anos ~3,0% a.a.')
  }
}

// ══════════════════════════════════════════════════════════════
// RENDER FUNCTIONS — desenham conteudo num DocBuilder existente.
// Os GENERATORS criam DocBuilder + capa e delegam aqui;
// generateCompiledReport chama-as inline para combinar seccoes.
// ══════════════════════════════════════════════════════════════

// Campos críticos para "completude" da Ficha — apenas os que devem ser
// preenchidos antes da Ficha ser considerada pronta para apresentar/enviar.
const FICHA_CAMPOS_CRITICOS = [
  'nome', 'morada', 'freguesia', 'concelho',
  'artigo_matricial', 'descricao_predial', 'fracao', 'regime_propriedade',
  'tipologia', 'area_bruta', 'andar', 'predio_tipo', 'tem_elevador', 'ano_construcao',
  'certificado_energetico', 'vpt', 'imi_anual',
  'proprietario_nome', 'proprietario_nif', 'proprietario_contacto',
  'motivo_venda_declarado', 'data_anuncio', 'origem', 'tipo_oportunidade',
  'modelo_negocio', 'ask_price',
]
function fichaCompletude(im) {
  let filled = 0
  for (const k of FICHA_CAMPOS_CRITICOS) {
    const v = im?.[k]
    if (v == null) continue
    if (Array.isArray(v) && v.length === 0) continue
    if (typeof v === 'string' && v.trim() === '') continue
    filled++
  }
  return { filled, total: FICHA_CAMPOS_CRITICOS.length }
}

function renderFichaImovel(b, im) {
  const M2 = v => (v == null || v === '' ? '—' : `${v} m²`)
  const NUM = v => (v == null || v === '' ? '—' : String(v))
  const ARR = v => (Array.isArray(v) && v.length ? v.join(', ') : '—')
  const precoM2 = (im.ask_price && im.area_bruta) ? Math.round(im.ask_price / im.area_bruta) : null
  const comp = fichaCompletude(im)

  b.inlineData([
    { label: 'REF', value: im.ref_interna || im.id?.slice(0, 8) },
    { label: 'Estado', value: (im.estado || '').replace(/^\d+-/, '') },
    { label: 'Adicionado', value: FDATE(im.data_adicionado) },
    { label: 'Completude', value: `${comp.filled}/${comp.total}` },
  ])
  b.space(3)

  // 1. IDENTIFICAÇÃO REGISTRAL
  b.header('1. IDENTIFICAÇÃO REGISTRAL')
  // Link Maps: prefere coordenadas (mais preciso); fallback para morada
  const mapsLink = (im.coordenadas_lat && im.coordenadas_lng)
    ? `https://www.google.com/maps/search/?api=1&query=${im.coordenadas_lat},${im.coordenadas_lng}`
    : (im.morada ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(im.morada)}` : null)
  const rows1 = [
    { label: 'Designação', value: im.nome },
    // Morada é a própria linha clicável (sem duplicar com Coordenadas)
    { label: 'Morada', value: im.morada || '—', link: im.morada ? mapsLink : undefined },
    { label: 'Freguesia', value: im.freguesia },
    { label: 'Concelho', value: im.concelho },
  ]
  // Mostrar distrito sempre (independentemente da região, para clareza com
  // imóveis AMP). Antes só mostrava se ≠ Coimbra, escondendo-o por defeito.
  rows1.push({ label: 'Distrito', value: distritoDoImovel(im) })
  rows1.push(
    { label: 'Artigo Matricial', value: im.artigo_matricial },
    { label: 'Descrição Predial', value: im.descricao_predial },
    { label: 'Fração', value: im.fracao },
    { label: 'Regime de Propriedade', value: im.regime_propriedade },
  )
  b.simpleTable(rows1)
  b.space(3)

  // 2. CARACTERIZAÇÃO FÍSICA
  b.header('2. CARACTERIZAÇÃO FÍSICA')
  const hasUtil  = im.area_util  != null && im.area_util  !== ''
  const hasBruta = im.area_bruta != null && im.area_bruta !== ''
  const areaRows = []
  if (hasUtil) areaRows.push({ label: 'Área Útil', value: M2(im.area_util) })
  if (hasBruta || !hasUtil) areaRows.push({ label: 'Área Bruta Privativa (ABP)', value: M2(im.area_bruta) })
  areaRows.push({ label: 'Área Bruta Dependente (ABD)', value: M2(im.area_bruta_dependente) })
  b.simpleTable([
    { label: 'Tipologia', value: im.tipologia },
    ...areaRows,
    { label: 'Andar', value: im.andar },
    { label: 'Nº Pisos do Prédio', value: NUM(im.numero_pisos_predio) },
    { label: 'Tipo de Prédio', value: im.predio_tipo },
    { label: 'Elevador', value: im.tem_elevador },
    { label: 'Ano de Construção', value: NUM(im.ano_construcao) },
    { label: 'Classificação Reg. Urbana (CRU)', value: im.cru },
    { label: 'Licença de Utilização', value: im.licenca_utilizacao },
  ])
  b.space(3)

  // 3. SITUAÇÃO LEGAL E FISCAL
  b.header('3. SITUAÇÃO LEGAL E FISCAL')
  b.simpleTable([
    { label: 'Certificado Energético', value: im.certificado_energetico },
    { label: 'Nº CE', value: im.numero_ce },
    { label: 'VPT (Valor Patrimonial Tributário)', value: EUR(im.vpt) },
    { label: 'IMI Anual', value: EUR(im.imi_anual) },
    { label: 'Condomínio Mensal (anunciado)', value: EUR(im.condominio_mensal_anunciado) },
    { label: 'Ónus / Encargos', value: ARR(im.onus_registados) },
  ])
  b.space(3)

  // 4. PROPRIETÁRIO E CAPTAÇÃO
  b.header('4. PROPRIETÁRIO E CAPTAÇÃO')
  b.simpleTable([
    { label: 'Proprietário', value: im.proprietario_nome },
    { label: 'NIF', value: im.proprietario_nif },
    { label: 'Contacto', value: im.proprietario_contacto },
    { label: 'Motivo de Venda Declarado', value: im.motivo_venda_declarado },
    { label: 'Data do Anúncio', value: FDATE(im.data_anuncio) },
    { label: 'Tempo no Mercado (dias)', value: NUM(im.tempo_no_mercado_dias) },
  ])
  // Origem + Tipo de Oportunidade lado a lado (campos complementares: canal e natureza)
  b.splitRow(
    { label: 'Origem', value: im.origem || '—' },
    { label: 'Tipo de Oportunidade', value: im.tipo_oportunidade || '—' },
  )
  b.simpleTable([
    { label: 'Modelo de Negócio', value: im.modelo_negocio },
    { label: 'Data de Captação', value: FDATE(im.data_adicionado) },
    { label: 'Consultor', value: im.nome_consultor },
    { label: 'Link Anúncio', value: im.link, link: im.link?.startsWith('http') ? im.link : undefined },
  ])
  b.space(3)
  b.header('PREÇO DE AQUISIÇÃO')
  b.bigNumbers([
    { label: 'Preço Pedido', value: EUR(im.ask_price) },
    { label: '€/m² ABP', value: precoM2 ? EUR(precoM2) : '—' },
    { label: 'ABP', value: M2(im.area_bruta) },
  ])
  b.space(3)

  // GALERIA FOTOGRÁFICA — todas as fotos da aba (pré-carregadas em _fotosGaleria)
  const fotosGaleria = parseFotos(im)
  if (fotosGaleria.length > 0) { b.space(4); b.photos(fotosGaleria, 'GALERIA FOTOGRÁFICA') }

  if (im.notas) { b.space(4); b.header('NOTAS INTERNAS'); b.text(im.notas) }

  // Stamp final: data de geração + versão (se foram injectados pelo lifecycle)
  b.space(3)
  b.versionStamp()
}

function renderFichaVisita(b, im, analise = null) {
  const fotos = parseFotos(im)
  // VVR/Obra/ROI preferem a análise activa (mesma fonte da calculadora);
  // fallback aos campos denormalizados do imóvel se não houver análise.
  const a = analise || {}
  const vvrEst = a.vvr ?? im.valor_venda_remodelado
  const obraEst = a.obra_com_iva ?? im.custo_estimado_obra
  const roiEst = a.retorno_total ?? im.roi
  const roiAnuEst = a.retorno_anualizado ?? im.roi_anualizado
  // Ficha preenchida (de uma visita) injectada em im._fichaVisita; quando ausente,
  // a ficha sai como template em branco (comportamento original).
  const fv = im._fichaVisita ? normalizeFicha(im._fichaVisita) : null
  const chk = active => fv ? (active ? 'X' : '') : '□'
  b.header('IDENTIFICAÇÃO DO IMÓVEL')
  b.simpleTable([
    { label: 'Nome / Referência', value: im.nome },
    { label: 'Tipologia', value: im.tipologia },
    { label: 'Zona', value: im.zona },
    { label: 'Modelo de Negócio', value: im.modelo_negocio },
    { label: 'Origem do Lead', value: im.origem },
    { label: 'Consultor Responsável', value: im.nome_consultor },
    { label: 'Data Adicionado', value: FDATE(im.data_adicionado) },
    { label: 'Data da Chamada', value: FDATE(im.data_chamada) },
    { label: 'Data da Visita', value: FDATE(im.data_visita) },
    { label: 'Link do Anúncio', value: im.link || '—' },
  ])
  b.space(4)

  b.header('ÁREAS E CARACTERÍSTICAS')
  b.simpleTable([
    { label: 'Área Bruta', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    { label: 'Preço por m² (Ask)', value: im.ask_price && im.area_bruta ? EUR(Math.round(im.ask_price / im.area_bruta)) + '/m²' : '—' },
  ])
  b.space(4)

  b.header('ENQUADRAMENTO FINANCEIRO')
  b.bigNumbers([
    { label: 'Ask Price', value: EUR(im.ask_price) },
    { label: 'Proposta Estimada', value: EUR(im.valor_proposta) },
    { label: 'VVR Estimado', value: EUR(vvrEst) },
  ])
  b.simpleTable([
    { label: 'Custo Estimado de Obra', value: EUR(obraEst) },
    { label: 'ROI Estimado', value: PCT(roiEst) },
    { label: 'ROI Anualizado Estimado', value: PCT(roiAnuEst) },
    { label: 'Desconto face ao Ask Price', value: im.ask_price && im.valor_proposta ? PCT(Math.round((1 - im.valor_proposta / im.ask_price) * 100)) : '—' },
  ])
  b.space(4)

  if (fotos.length > 0) b.photos(fotos, 'FOTOGRAFIAS DO ANÚNCIO')

  b.header('PONTOS A AVALIAR NA VISITA')
  b.subheader('Estrutural')
  b.simpleTable([
    'Fachada: fissuras, humidade, descasque de reboco, eflorescências',
    'Telhado / cobertura: telhas partidas, infiltrações, isolamento térmico',
    'Fundações: assentamentos visíveis, fissuras em escada',
    'Paredes interiores: fissuras, humidade ascendente, bolor',
    'Tectos: manchas de água, deformações, descasque',
    'Pavimentos: nivelamento, estado do revestimento, soalho podre',
    'Laje / estrutura: vigas expostas, ferrugem em armaduras, flexão',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Instalações Técnicas')
  b.simpleTable([
    'Quadro eléctrico: disjuntores, terra, estado geral, potência contratada',
    'Tomadas e interruptores: quantidade e funcionamento',
    'Canalização de água: pressão, tubagens (cobre, PPR, ferro), fugas',
    'Esgotos: cheiros, escoamento lento, caixas de visita',
    'Aquecimento: tipo de sistema (central, esquentador, caldeira), estado',
    'Gás: tipo de instalação, certificação, segurança',
    'Ventilação: VMC, exaustores, ventilação natural nas casas de banho',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Caixilharia e Isolamento')
  b.simpleTable([
    'Janelas: material (alumínio, PVC, madeira), vidro simples ou duplo',
    'Estores / portadas: funcionamento e estado',
    'Isolamento térmico: paredes exteriores, cobertura, pontes térmicas',
    'Isolamento acústico: ruído exterior, entre fracções',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Espaços Húmidos')
  b.simpleTable([
    'Cozinha: bancada, armários, equipamentos, ventilação, ponto de água',
    'WC: louças sanitárias, torneiras, impermeabilização, ventilação',
    'Azulejos: estado, fissuras, descolamentos',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.subheader('Envolvente e Localização')
  b.simpleTable([
    'Orientação solar e luminosidade natural dos compartimentos',
    'Acessos ao imóvel: estrada, passeios, rampa, escadas',
    'Estacionamento: garagem, lugar de parqueamento, rua',
    'Vizinhança: tipo de zona, ruído, segurança, serviços próximos',
    'Transportes públicos e acessos rodoviários',
    'Possibilidade de ampliação ou alteração de layout (PDM)',
    'Existência de logradouro, quintal ou terraço',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.header('PERGUNTAS AO PROPRIETÁRIO / MEDIADOR')
  b.subheader('Motivação e Urgência')
  b.simpleTable([
    'Há quanto tempo está à venda? Já baixou o preço?',
    'Motivo da venda? (herança, divórcio, emigração, necessidade financeira)',
    'Existe urgência na venda? Prazo pretendido?',
    'Está aberto a CPCV com sinal reduzido?',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)
  b.subheader('Negociação e Valor')
  b.simpleTable([
    'Valor mínimo que aceita? Margem de negociação?',
    'Já recebeu outras propostas? Qual o valor?',
    'Aceita permuta ou pagamento faseado?',
    'Quem é o decisor? (um proprietário, vários herdeiros, tribunal)',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)
  b.subheader('Situação Jurídica e Técnica')
  b.simpleTable([
    'Algum problema estrutural ou legal conhecido?',
    'Documentação em dia? (caderneta, certidão permanente, licença)',
    'Existem ónus, hipotecas, penhoras ou litígios?',
    'Área real corresponde à área registada? Há áreas não licenciadas?',
    'Existem obras recentes não declaradas?',
    'O imóvel está arrendado ou ocupado?',
    'Condomínio: valor mensal, dívidas, obras previstas no prédio?',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  b.header('DOCUMENTOS A SOLICITAR')
  b.subheader('Obrigatórios')
  b.simpleTable([
    'Caderneta predial urbana (actualizada)',
    'Certidão permanente do registo predial (com encargos)',
    'Licença de utilização',
    'Certificado energético',
    'Plantas do imóvel (aprovadas pela Câmara)',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)
  b.subheader('Complementares')
  b.simpleTable([
    'Ficha técnica da habitação (pós-2004)',
    'Declaração de dívidas ao condomínio',
    'Certidão de teor (se herança)',
    'Habilitação de herdeiros (se herança)',
    'Planta de localização e extracto do PDM',
    'Projecto de arquitectura (se disponível)',
    'Certificado de conformidade das instalações de gás',
  ].map(p => ({ label: `□  ${p}`, value: '' })))
  b.space(4)

  if (im.notas) {
    b.header('NOTAS DO CRM')
    b.textBlock(im.notas)
    b.space(4)
  }

  b.header('NOTAS DE CAMPO (PRÉ-VISITA)')
  const nc = fv?.preVisita?.notasCampo || {}
  b.input('Impressão geral do contacto telefónico', nc.impressaoContacto || '', { tall: true })
  b.input('Pontos críticos a confirmar na visita', nc.pontosCriticos || '', { tall: true })
  b.input('Estratégia de negociação a adoptar', nc.estrategia || '', { tall: true })
  b.space(4)

  b.newPage()
  b.header('CHECKLIST DE VISITA')
  b.note('B = Bom (sem intervenção)  ·  R = Razoável (intervenção ligeira)  ·  M = Mau (intervenção profunda)  ·  N/A = Não aplicável')
  b.space(4)

  const colHeadersBRM = [['Elemento', 250], ['B', 40], ['R', 40], ['M', 40], ['Observações', 100]]
  for (const sec of CHECKLIST_SECTIONS) {
    const ans = fv?.checklists?.[sec.key] || []
    b.header(sec.pdfHeader)
    b.colTable(colHeadersBRM, sec.items.map((item, i) => {
      const r = ans[i]?.rating || ''
      const obs = ans[i]?.obs || ''
      const obsCell = r === 'NA' ? (obs ? `N/A · ${obs}` : 'N/A') : obs
      return { _values: [item, chk(r === 'B'), chk(r === 'R'), chk(r === 'M'), obsCell] }
    }))
    b.space(4)
  }

  b.header('9. CONFIRMAÇÃO DE ÁREAS E MEDIÇÕES')
  b.note('Medir ou estimar as áreas reais e comparar com o anunciado / registado.')
  b.colTable(
    [['Compartimento', 200], ['Medição (m²)', 130], ['Observações', 150]],
    MEDICAO_COMPARTIMENTOS.map((item, i) => ({ _values: [item, fv?.medicoes?.[i]?.m2 || '', fv?.medicoes?.[i]?.obs || ''] }))
  )
  b.space(2)
  b.simpleTable([
    { label: 'Área Bruta Anunciada', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    { label: 'Área Bruta Medida / Estimada', value: fv?.areaMedida ? `${fv.areaMedida} m²` : '__________ m²' },
    { label: 'Discrepância', value: fv ? (fv.discrepancia ? 'Sim' : 'Não') : '□ Sim  □ Não' },
  ])
  b.space(4)

  b.header('10. ESTIMATIVA PRELIMINAR DE OBRA')
  b.note('Registo rápido dos trabalhos necessários observados na visita.')
  b.colTable(
    [['Trabalho', 230], ['Necessário?', 80], ['Grau', 80], ['Custo Est.', 90]],
    OBRA_TRABALHOS.map((item, i) => {
      const o = fv?.estimativaObra?.[i]
      const nec = fv ? (o?.necessario ? 'Sim' : 'Não') : '□ S  □ N'
      const grau = fv ? (GRAUS_OBRA.find(g => g.key === o?.grau)?.label || '—') : '□ L  □ P'
      const custo = fv ? (o?.custo ? `€ ${o.custo}` : '—') : '€ _____'
      return { _values: [item, nec, grau, custo] }
    })
  )
  b.note('L = Ligeira  ·  P = Profunda')
  b.space(2)
  b.highlight('Total Estimado de Obra (campo)', fv?.totalObra ? `€ ${fv.totalObra}` : '€ _______________')
  b.space(4)

  b.newPage()
  b.header('RELATÓRIO DE VISITA')
  const rel = fv?.relatorio || {}
  b.subheader('Estado Real do Imóvel')
  b.input('Descrição geral do estado encontrado', rel.estadoReal || '', { tall: true })
  b.space(4)
  b.subheader('Obras Necessárias')
  b.colTable(
    [['Trabalho', 280], ['Custo Estimado', 200]],
    RELATORIO_OBRAS.map((item, i) => ({ _values: [item, rel.obras?.[i]?.custo ? `€ ${rel.obras[i].custo}` : '________________'] }))
  )
  b.space(4)
  b.header('IMPRESSÃO GERAL')
  b.input('Pontos fortes do imóvel', rel.pontosFortes || '', { tall: true })
  b.input('Pontos fracos / riscos identificados', rel.pontosFracos || '', { tall: true })
  b.input('Potencial de valorização', rel.potencial || '', { tall: true })
  b.space(4)
  b.header('DECISÃO')
  b.simpleTable(DECISOES.map(d => ({
    label: `${fv ? (rel.decisao === d.key ? '[X]' : '[  ]') : '□'}  ${d.label}`,
    value: '',
  })))
  b.space(4)
  b.input('Justificação da decisão', rel.justificacao || '', { tall: true })
  b.input('Próximos passos', rel.proximosPassos || '', { tall: true })
}

function renderResumoExecutivo(b, im, a, m) {
  const compra = a.compra || im.valor_proposta || im.ask_price || 0
  const obra = a.obra_com_iva || a.obra || im.custo_estimado_obra || 0
  const vvr = a.vvr || im.valor_venda_remodelado || 0

  b.header('RESUMO EXECUTIVO')

  // Tese de investimento
  const teseTexto = im.tese_investimento ||
    `Aquisição e reabilitação de ${im.tipologia || 'imóvel'} em ${im.zona || im.concelho || 'localização a definir'}, com venda após obra. Capital necessário: ${EUR(a.capital_necessario)}. Retorno líquido estimado: ${EUR(a.lucro_liquido)} em ${a.meses || 0} meses (RA: ${PCT(a.retorno_anualizado)}).`

  // Caixa preta com tese
  const teseH = b.doc.heightOfString(teseTexto, { width: CW - 24, lineGap: 3 })
  const boxH = teseH + 28
  b.ensure(boxH + 6)
  b.doc.rect(ML, b.y, CW, boxH).fill(C.black)
  b.doc.rect(ML, b.y, 4, boxH).fill(C.gold)
  b.doc.fontSize(7).fillColor(C.gold).text('TESE DE INVESTIMENTO', ML + 14, b.y + 8, { width: CW - 24, characterSpacing: 1, lineBreak: false })
  b.doc.fontSize(9).fillColor('#f0efe9').text(teseTexto, ML + 14, b.y + 22, { width: CW - 24, lineGap: 3 })
  b.y += boxH + 8

  // Hero KPIs — grid 3x3 (9 metricas com nome completo)
  const tempoLabel = (() => {
    const meses = parseFloat(a.meses)
    if (!isFinite(meses) || meses <= 0) return '—'
    if (meses < 12) return `${meses} meses`
    const anos = Math.floor(meses / 12)
    const restoMeses = Math.round(meses - anos * 12)
    return restoMeses > 0 ? `${anos}a ${restoMeses}m` : `${anos} anos`
  })()
  const cooLabel = (() => {
    const ra = parseFloat(a.retorno_anualizado)
    if (!isFinite(ra) || ra <= 0) return '—'
    const mult = ra / 3.5
    if (!isFinite(mult)) return '—'
    return `${mult.toFixed(1)}x`
  })()
  b.bigNumbers([
    { label: 'Capital Necessário', value: EUR(a.capital_necessario || compra + obra), sub: '(Capital próprio a adiantar, líquido de financiamento)' },
    { label: 'Lucro Bruto', value: EUR(a.lucro_bruto), sub: '(VVR - Custo Total do Projecto, antes de impostos)' },
  ])
  b.space(2)
  b.bigNumbers([
    { label: 'MOIC', value: MULT(m.moic), sub: '(Múltiplo do capital investido — quanto recebe por cada €)' },
    { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado), sub: '(RA simples — retorno total convertido para base anual)' },
  ])
  b.space(2)
  b.bigNumbers([
    { label: 'Cash-on-Cash', value: PCT(a.cash_on_cash), sub: '(Lucro líquido / capital empregue no projecto)' },
    { label: 'ROI', value: PCT_DEC(m.roe_sem_alav), sub: '(Return on Investment — retorno sobre o capital total empregue)' },
  ])
  b.space(2)
  b.bigNumbers([
    { label: 'Tempo de Permanência do Capital', value: tempoLabel, sub: '(Período em que o capital está alocado ao projecto)' },
    { label: 'Custo de Oportunidade', value: cooLabel, sub: '(Quantas vezes o RA supera um depósito a prazo a 3,5%)' },
  ])
  b.space(4)

  // Estratégia de Saída
  b.subheader('Estratégia de Saída')
  const exitLabel = m.has_renda
    ? `Arrendamento (~${EUR_S(m.exit_arrendamento.renda_mensal)}/mês · yield ${PCT_DEC(m.exit_arrendamento.yield_liquido)})`
    : 'Não definido'
  const prazoMaxLabel = m.prazo_max_meses != null ? `${m.prazo_max_meses} meses` : '—'
  const tipoOperacaoLabel = im.tipo_operacao === 'Arrendamento'
    ? 'Arrendamento (Buy & Hold)'
    : 'Fix & Flip (Reabilitação + Venda)'
  b.simpleTable([
    { label: 'Tipo de Operação', value: tipoOperacaoLabel },
    { label: 'Prazo Estimado', value: `${a.meses || 0} meses` },
    { label: 'Exit Alternativo', value: exitLabel },
    { label: 'Prazo Máximo (antes de prejuízo)', value: prazoMaxLabel },
  ])
  b.space(3)

  b.newPage()
}

function renderAnaliseRentabilidade(b, im, a, opts = {}) {
  const compra = a.compra || im.valor_proposta || im.ask_price || 0
  const obra = a.obra_com_iva || a.obra || im.custo_estimado_obra || 0
  const vvr = a.vvr || im.valor_venda_remodelado || 0
  const m = calcMetricsExtra(a, im)

  // Skip Resumo Executivo quando chamado do Dossier — duplicaria com:
  //   - OPORTUNIDADE DE INVESTIMENTO (tese)
  //   - PONTOS FORTES/FRACOS/RISCOS (riscos/mitigantes auto-derivados)
  //   - J. EXIT ALTERNATIVO (estrategia saida)
  //   - RESUMO DO INVESTIMENTO logo a seguir (9 vs 7 KPIs sobrepostos)
  if (!opts.skipResumoExecutivo) {
    renderResumoExecutivo(b, im, a, m)
  }


  b.header('A. CUSTOS DE AQUISIÇÃO')
  b.simpleTable([
    { label: 'Valor de Compra', value: EUR(compra) },
    { label: 'VPT — Valor Patrimonial Tributário', value: EUR(a.vpt) },
    { label: 'Finalidade', value: (a.finalidade || '').replace(/_/g, ' ') },
    { label: 'IMT — Imp. Mun. sobre Transmissões', value: EUR(a.imt) },
    { label: 'Imposto de Selo', value: EUR(a.imposto_selo) },
    { label: 'Escritura', value: EUR(a.escritura) },
    { label: 'CPCV Compra', value: EUR(a.cpcv_compra) },
    { label: 'Due Diligence', value: EUR(a.due_diligence) },
    { label: 'Preço de Aquisição por m²', value: EUR_M2(m.aquisicao_m2) },
    { label: 'Custo Total por m²', value: EUR_M2(m.custo_total_m2) },
    { label: 'Total Aquisição', value: EUR(a.total_aquisicao), total: true },
  ])
  b.space(4)

  if (a.perc_financiamento > 0) {
    b.header('B. FINANCIAMENTO')
    b.simpleTable([
      { label: '% Financiamento', value: PCT(a.perc_financiamento) },
      { label: 'Valor Financiado', value: EUR(a.valor_financiado) },
      { label: 'Prazo', value: `${a.prazo_anos || 30} anos` },
      { label: 'TAN — Taxa Anual Nominal', value: PCT(a.tan) },
      { label: 'Tipo Taxa', value: a.tipo_taxa },
      { label: 'Prestação Mensal', value: EUR(a.prestacao_mensal) },
      { label: 'Comissões Bancárias', value: EUR(a.comissoes_banco) },
      { label: 'IS — Imposto de Selo do Financiamento', value: EUR(a.is_financiamento) },
    ])
    b.space(4)
  }

  b.header('C. CUSTOS DE OBRA')
  const obraRows = [
    { label: 'Obra', value: EUR(a.obra) },
    { label: 'PMO Total (Project Management & Overhead)', value: PCT(a.pmo_perc) },
  ]
  if (m.pmo_breakdown) {
    const p = m.pmo_breakdown
    if (p.arq.perc > 0) obraRows.push({ label: '   └ Projecto de Arquitectura', value: `${PCT(p.arq.perc)} · ${EUR(p.arq.eur)}` })
    if (p.fisc.perc > 0) obraRows.push({ label: '   └ Fiscalização / Gestão de Obra', value: `${PCT(p.fisc.perc)} · ${EUR(p.fisc.eur)}` })
    if (p.seg.perc > 0) obraRows.push({ label: '   └ Coordenação de Segurança', value: `${PCT(p.seg.perc)} · ${EUR(p.seg.eur)}` })
    if (p.outros.perc > 0) obraRows.push({ label: '   └ Outros Custos de Gestão', value: `${PCT(p.outros.perc)} · ${EUR(p.outros.eur)}` })
  }
  obraRows.push(
    { label: 'ARU', value: a.aru ? 'Sim' : 'Não' },
    { label: 'Ampliação', value: a.ampliacao ? 'Sim' : 'Não' },
    { label: 'IVA Obra', value: EUR(a.iva_obra) },
    { label: 'Obra com IVA', value: EUR(a.obra_com_iva) },
    { label: 'Licenciamento', value: EUR(a.licenciamento) },
  )
  b.simpleTable(obraRows)
  if (!m.pmo_breakdown && a.pmo_perc > 0) {
    b.note('PMO inclui projecto, fiscalização e coordenação de obra — desagregação disponível mediante pedido.')
  }
  b.space(4)

  b.header('D. CUSTOS DE DETENÇÃO')
  b.simpleTable([
    { label: 'Meses de Retenção', value: a.meses || '—' },
    { label: 'Seguro Mensal', value: EUR(a.seguro_mensal) },
    { label: 'Condomínio Mensal', value: EUR(a.condominio_mensal) },
    { label: 'Taxa IMI', value: PCT(a.taxa_imi) },
  ])
  b.space(4)

  b.header('E. VENDA')
  b.simpleTable([
    { label: 'VVR — Valor de Venda de Referência', value: EUR(vvr) },
    { label: 'Comissão %', value: PCT(a.comissao_perc) },
    { label: 'Comissão com IVA', value: EUR(a.comissao_com_iva) },
    { label: 'Valor de Venda por m²', value: EUR_M2(m.vvr_m2) },
    { label: 'Total Custos Venda', value: EUR(a.total_venda), total: true },
  ])
  b.space(4)

  b.header('F. FISCALIDADE')
  const regimeFiscalLabel = a.regime_fiscal === 'Sem'
    ? 'Sem regime fiscal (valor bruto)'
    : (a.regime_fiscal || '—')
  const fiscRows = [
    { label: 'Regime', value: regimeFiscalLabel },
  ]
  if (a.regime_fiscal === 'Empresa' && m.fiscal && m.fiscal.total_irc != null) {
    fiscRows.push({ label: 'IRC Base (15% até 50k + 19% acima)', value: EUR(m.fiscal.irc_base) })
    fiscRows.push({ label: `Derrama Municipal (${PCT(a.derrama_perc)})`, value: EUR(m.fiscal.derrama_eur) })
    fiscRows.push({ label: 'Total IRC', value: EUR(m.fiscal.total_irc) })
    fiscRows.push({ label: '% Distribuição Dividendos', value: PCT(a.perc_dividendos) })
    fiscRows.push({ label: 'Retenção Dividendos (28%)', value: EUR(m.fiscal.dividendos_eur) })
    fiscRows.push({ label: 'Carga Fiscal Total', value: EUR(a.impostos), total: true })
    fiscRows.push({ label: 'Taxa Efectiva sobre Lucro Bruto', value: PCT_DEC(m.fiscal.taxa_efectiva) })
  } else {
    fiscRows.push({ label: 'Impostos', value: EUR(a.impostos), total: true })
    if (m.fiscal && m.fiscal.taxa_efectiva != null) {
      fiscRows.push({ label: 'Taxa Efectiva sobre Lucro Bruto', value: PCT_DEC(m.fiscal.taxa_efectiva) })
    }
  }
  b.simpleTable(fiscRows)
  if (a.regime_fiscal === 'Sem') {
    b.note('Valor apresentado bruto de fiscalidade. O lucro líquido iguala o lucro bruto. A carga fiscal aplicável depende da estrutura jurídica adoptada pelo investidor para o negócio.')
  }
  b.space(4)

  b.header('G. RESULTADO')
  b.bigNumbers([
    { label: 'Lucro Bruto', value: EUR(a.lucro_bruto) },
    { label: 'Impostos', value: EUR(a.impostos) },
    { label: 'Lucro Líquido', value: EUR(a.lucro_liquido) },
  ])
  b.simpleTable([
    { label: 'Retorno Total', value: PCT(a.retorno_total) },
    { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
    { label: 'Cash-on-Cash', value: PCT(a.cash_on_cash) },
    { label: 'Break-Even', value: EUR(a.break_even) },
    { label: 'Lucro Líquido por Mês', value: m.lucro_mensal != null ? `${EUR_S(m.lucro_mensal)}/mês` : '—' },
    { label: 'Margem sobre Custo Total', value: PCT_DEC(m.margem_custo_total), color: colorMargem(m.margem_custo_total) },
    { label: 'Rácio Risco / Retorno (por 1€ arriscado)', value: RACIO(m.racio_risco_retorno) },
  ])
  b.space(4)

  if (m.has_financiamento) {
    b.header('G.1 ALAVANCAGEM')
    b.simpleTable([
      { label: 'LTV (Loan-to-Value)', value: PCT_DEC(m.ltv) },
      { label: 'LTC (Loan-to-Cost)', value: PCT_DEC(m.ltc) },
    ])
    b.space(4)
  }

  // ── H. ANÁLISE DE RISCO E SENSIBILIDADE ─────────────────────
  b.header('H. ANÁLISE DE RISCO E SENSIBILIDADE')

  const margemSegVVRStr = m.margem_seg_vvr != null ? PCT_DEC(m.margem_seg_vvr) : '—'
  const margemSegObraStr = m.margem_seg_obra != null ? PCT_DEC(m.margem_seg_obra) : '—'

  b.simpleTable([
    { label: 'Break-Even VVR (preço mínimo de venda)', value: EUR(m.break_even_vvr) },
    { label: '   Margem de Segurança VVR', value: margemSegVVRStr, color: colorPositivo(m.margem_seg_vvr) },
    { label: 'Break-Even Custo de Obra (custo máximo)', value: EUR(m.break_even_obra) },
    { label: '   Margem de Segurança Obra', value: margemSegObraStr, color: colorPositivo(m.margem_seg_obra) },
  ])
  b.space(4)

  renderStressTests(b, a, { title: 'I. TESTES DE STRESS', metrics: m })

  renderExitAlternativo(b, im, a, m)
}

function renderExitAlternativo(b, im, a, m) {
  b.space(4)
  b.header('J. EXIT ALTERNATIVO — ANÁLISE DE ARRENDAMENTO')

  if (!m.exit_arrendamento) {
    b.note('Introduza renda mensal estimada na ficha financeira (secção "Exit Alternativo") para activar esta análise.')
    return
  }

  const e = m.exit_arrendamento
  const regime = a.regime_fiscal || 'Empresa'

  // Caixa de contexto
  const ctxTexto = 'Caso o imóvel não seja vendido no prazo previsto, o arrendamento constitui uma estratégia de exit alternativa. A análise abaixo quantifica a viabilidade desta opção.'
  const ctxH = b.doc.heightOfString(ctxTexto, { width: CW - 24, lineGap: 3 })
  b.ensure(ctxH + 22)
  b.doc.rect(ML, b.y, CW, ctxH + 16).fill('#f5f3ee')
  b.doc.rect(ML, b.y, 3, ctxH + 16).fill(C.gold)
  b.doc.fontSize(8.5).fillColor(C.body).text(ctxTexto, ML + 12, b.y + 8, { width: CW - 24, lineGap: 3 })
  b.y += ctxH + 22

  b.subheader('Premissas de Arrendamento')
  b.simpleTable([
    { label: 'Renda Mensal Estimada', value: EUR(e.renda_mensal) },
    { label: 'Vacancy / Desocupação', value: PCT(e.vacancy_pct) },
    { label: 'Custos de Gestão', value: PCT(e.gestao_pct) },
    { label: 'Renda Mensal Líquida', value: EUR_S(e.renda_neta_mensal), total: true },
  ])
  b.space(4)

  b.subheader('Métricas de Yield')
  b.simpleTable([
    { label: 'Yield Bruto (sobre VVR)', value: PCT_DEC(e.yield_bruto) },
    { label: 'Yield Líquido (sobre VVR)', value: PCT_DEC(e.yield_liquido) },
    { label: 'Yield sobre Custo Total', value: PCT_DEC(e.yield_custo) },
  ])
  b.space(4)

  b.subheader('Fiscalidade do Arrendamento')
  b.simpleTable([
    { label: `Regime: ${regime} · Taxa autónoma`, value: PCT(e.taxa_tributacao * 100) },
    { label: 'Imposto Anual Estimado', value: EUR(e.imposto_anual) },
    { label: 'Renda Anual Pós-Imposto', value: EUR(e.renda_pos_imposto), total: true },
  ])
  b.space(4)

  b.subheader('Viabilidade como Exit Alternativo')
  const coberturaLabel = e.cobertura_ok
    ? `✓ Sim, com folga de ${EUR_S(e.folga)}/mês`
    : `✗ Não — défice de ${EUR_S(Math.abs(e.folga))}/mês`
  b.simpleTable([
    { label: 'Custo Mensal de Detenção', value: EUR_S(e.custo_mensal_det) + '/mês' },
    { label: 'Renda Cobre Custos de Detenção?', value: coberturaLabel, color: e.cobertura_ok ? '#1B5E20' : '#8B1A1A' },
    { label: 'Break-Even de Arrendamento', value: e.be_arrendamento != null ? `${e.be_arrendamento} meses` : '—' },
  ])
  b.note('Após o número de meses indicado, o retorno acumulado por arrendamento iguala o lucro perdido por adiar a venda.')
  b.space(4)

  b.subheader('Comparação de Estratégias')
  b.colTable(
    [['Critério', 200], ['Venda (base)', 175], ['Arrendamento', 175]],
    [
      { _values: ['Retorno anualizado', PCT(a.retorno_anualizado), PCT_DEC(e.yield_liquido)] },
      { _values: ['Liquidez', 'Imediata', 'Diferida'] },
      { _values: ['Capital recuperado', 'Imediato', 'Faseado'] },
      { _values: ['Risco de mercado', 'Alto', 'Médio'] },
    ]
  )
  b.note('A renda estimada deve ser validada com comparáveis de mercado locais. Tributação ao abrigo do Art.º 94.º CIRC (retenção 25% rendimentos prediais para empresas) ou Art.º 72.º CIRS (28% taxa autónoma para particulares).')
}

// Coeficiente de ajuste de area usado em Comparaveis.jsx (mantido em 0,25)
const AREA_FACTOR_PDF = '0,25'

function calcDesvioPadrao(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return 0
  const n = arr.length
  const media = arr.reduce((s, v) => s + v, 0) / n
  const variance = arr.reduce((s, v) => s + (v - media) ** 2, 0) / n
  return Math.sqrt(variance)
}

function gerarConclusaoAuto({ n, mediana, vvrAdoptado, delta, posTexto, minM2, maxM2, precoM2Vvr, descontoNeg, dataRecolha, fonteDados }) {
  const partes = []
  partes.push(`Com base em ${n} comparáveis recolhidos${dataRecolha ? ` em ${dataRecolha}` : ''}${fonteDados ? ` (fonte: ${fonteDados})` : ''}, o VVR adoptado de ${EUR(vvrAdoptado)} posiciona-se ${posTexto.toLowerCase()} face à mediana ajustada (${EUR(mediana)}).`)
  if (precoM2Vvr && minM2 && maxM2) {
    partes.push(`O preço de ${Math.round(precoM2Vvr).toLocaleString('pt-PT')} €/m² está contido no intervalo observado (${Math.round(minM2).toLocaleString('pt-PT')} €/m² a ${Math.round(maxM2).toLocaleString('pt-PT')} €/m²).`)
  }
  if (descontoNeg) {
    partes.push(`Preços são de oferta; aplicar desconto negocial estimado de ${descontoNeg}% para preço de transacção efectiva.`)
  }
  return partes.join(' ')
}

function drawPosVisualBar(b, { min, max, mediana, media, vvr, posCor }) {
  const trackY = b.y + 24
  const trackH = 14
  const trackW = CW
  const trackX = ML
  // Track
  b.doc.rect(trackX, trackY, trackW, trackH).fill('#EDEAE0')
  // Helper para mapear valor -> x
  const range = max - min
  const xFor = (v) => {
    if (range <= 0) return trackX + trackW / 2
    return trackX + ((v - min) / range) * trackW
  }
  // Linha tracejada cinza na media
  if (media > 0 && media >= min && media <= max) {
    const xMedia = xFor(media)
    b.doc.save()
    b.doc.lineWidth(0.7).strokeColor('#999999').dash(2, { space: 2 })
    b.doc.moveTo(xMedia, trackY - 4).lineTo(xMedia, trackY + trackH + 4).stroke()
    b.doc.undash()
    b.doc.fontSize(7).fillColor('#999999').text('Méd.', xMedia - 12, trackY + trackH + 6, { width: 24, align: 'center', lineBreak: false })
    b.doc.restore()
  }
  // Linha solida dourada na mediana
  if (mediana > 0 && mediana >= min && mediana <= max) {
    const xMed = xFor(mediana)
    b.doc.lineWidth(1.5).strokeColor(C.gold)
    b.doc.moveTo(xMed, trackY - 6).lineTo(xMed, trackY + trackH + 6).stroke()
    b.doc.fontSize(7).fillColor(C.gold).text('Med.', xMed - 12, trackY - 14, { width: 24, align: 'center', lineBreak: false })
  }
  // Diamante VVR
  if (vvr > 0) {
    let xVvr
    if (vvr < min) xVvr = trackX + 8
    else if (vvr > max) xVvr = trackX + trackW - 8
    else xVvr = xFor(vvr)
    const cy = trackY + trackH / 2
    const r = 8
    b.doc.save()
    b.doc.fillColor(posCor)
      .moveTo(xVvr, cy - r)
      .lineTo(xVvr + r, cy)
      .lineTo(xVvr, cy + r)
      .lineTo(xVvr - r, cy)
      .closePath().fill()
    b.doc.restore()
    // Label VVR acima
    b.doc.fontSize(7.5).fillColor(posCor).text(`VVR: ${EUR(vvr)}`, xVvr - 50, trackY - 22, { width: 100, align: 'center', lineBreak: false })
  }
  // Labels Min / Max nas extremidades
  b.doc.fontSize(7).fillColor(C.muted)
  b.doc.text(`Min: ${EUR(min)}`, trackX, trackY + trackH + 6, { width: 80, lineBreak: false })
  b.doc.text(`Max: ${EUR(max)}`, trackX + trackW - 80, trackY + trackH + 6, { width: 80, align: 'right', lineBreak: false })
  b.y = trackY + trackH + 28
}

// Calcula compsCalc + estatisticas + posicionamento do VVR para UMA tipologia.
// Funcao pura (sem render) — usada por renderEstudoComparaveis em loop por tipologia.
function computeTipologiaStats(tip, areaAlvo, descontoNeg, vvrAdoptado) {
  const compsCalc = []
  const items = (tip && tip.comparaveis) || []
  items.forEach((c, idx) => {
    if (!c || (!c.preco && !c.area)) return
    if (c.preco <= 0 || c.area <= 0) return
    const precoM2Bruto = c.preco / c.area
    // Ajustes desagregados (somar todos)
    let ajPiso = 0, ajElev = 0, ajGar = 0, ajArea = 0, ajConserv = 0, ajOutros = 0
    if (c.ajustes && typeof c.ajustes === 'object') {
      ajPiso = parseFloat(c.ajustes.piso_pct) || (parseFloat(c.ajustes.loc) || 0)
      ajElev = parseFloat(c.ajustes.elevador_pct) || 0
      ajGar = parseFloat(c.ajustes.garagem_pct) || 0
      ajArea = parseFloat(c.ajustes.area) || 0
      ajConserv = parseFloat(c.ajustes.conserv) || 0
      ajOutros = (parseFloat(c.ajustes.idade) || 0) + (parseFloat(c.ajustes.outros) || 0) + (parseFloat(c.ajustes.neg) || 0)
    }
    const ajTotal = ajPiso + ajElev + ajGar + ajArea + ajConserv + ajOutros
    const precoM2Aj = precoM2Bruto * (1 + ajTotal / 100)
    const vvrEst = areaAlvo > 0 ? precoM2Aj * areaAlvo : 0
    const precoTransac = c.preco * (1 - descontoNeg / 100)
    compsCalc.push({
      ...c,
      _idx: idx,
      _tipArea: tip.area,
      precoM2Bruto, precoM2Aj, vvrEst, precoTransac,
      ajPiso, ajElev, ajGar, ajArea, ajConserv, ajOutros, ajTotal,
    })
  })

  // Sumario estatistico
  const m2sAjust = compsCalc.map(c => c.precoM2Aj)
  const vvrs = compsCalc.map(c => c.vvrEst).filter(v => v > 0)
  const sortedM2 = [...m2sAjust].sort((x, y) => x - y)
  const sortedVvr = [...vvrs].sort((x, y) => x - y)
  const n = compsCalc.length
  const mediaM2 = n > 0 ? m2sAjust.reduce((s, v) => s + v, 0) / n : 0
  const medianaM2 = sortedM2.length > 0 ? (sortedM2.length % 2 === 0 ? (sortedM2[sortedM2.length / 2 - 1] + sortedM2[sortedM2.length / 2]) / 2 : sortedM2[Math.floor(sortedM2.length / 2)]) : 0
  const minM2 = sortedM2[0] || 0
  const maxM2 = sortedM2[sortedM2.length - 1] || 0
  const desvio = calcDesvioPadrao(m2sAjust)
  const mediaVvr = vvrs.length > 0 ? vvrs.reduce((s, v) => s + v, 0) / vvrs.length : 0
  const medianaVvr = sortedVvr.length > 0 ? (sortedVvr.length % 2 === 0 ? (sortedVvr[sortedVvr.length / 2 - 1] + sortedVvr[sortedVvr.length / 2]) / 2 : sortedVvr[Math.floor(sortedVvr.length / 2)]) : 0
  const minVvr = sortedVvr[0] || 0
  const maxVvr = sortedVvr[sortedVvr.length - 1] || 0

  const precoM2Vvr = areaAlvo > 0 && vvrAdoptado > 0 ? vvrAdoptado / areaAlvo : 0
  const deltaMediana = medianaVvr > 0 && vvrAdoptado > 0 ? ((vvrAdoptado / medianaVvr) - 1) * 100 : null
  const deltaMedia = mediaVvr > 0 && vvrAdoptado > 0 ? ((vvrAdoptado / mediaVvr) - 1) * 100 : null
  let posTexto = '—', posCor = C.body
  if (deltaMediana != null) {
    if (deltaMediana < -5) { posTexto = 'Conservador (abaixo da mediana)'; posCor = '#1B5E20' }
    else if (deltaMediana <= 5) { posTexto = 'Alinhado com a mediana'; posCor = C.gold }
    else if (deltaMediana <= 15) { posTexto = 'Moderadamente acima da mediana'; posCor = C.gold }
    else { posTexto = 'Acima do intervalo de mercado'; posCor = '#8B1A1A' }
  }

  return {
    compsCalc, n, m2sAjust,
    mediaM2, medianaM2, minM2, maxM2, desvio,
    mediaVvr, medianaVvr, minVvr, maxVvr,
    areaAlvo, vvrAdoptado, precoM2Vvr, deltaMediana, deltaMedia, posTexto, posCor,
  }
}

function renderEstudoComparaveis(b, im, a, opts = {}) {
  // Leitura tolerante: array legacy ou objecto novo {meta, tipologias}
  let comps = a.comparaveis || []
  if (typeof comps === 'string') try { comps = JSON.parse(comps) } catch { comps = [] }
  const meta = (!Array.isArray(comps) && comps && typeof comps === 'object' && comps.meta) ? comps.meta : {}
  const tipologias = Array.isArray(comps) ? comps : (comps?.tipologias || [])
  const m = calcMetricsExtra(a, im)
  const areaAlvoGlobal = parseFloat(im.area_bruta) || (tipologias[0]?.area) || 0
  const descontoNeg = meta.desconto_negocial_pct != null ? meta.desconto_negocial_pct : 5
  const alvoAtr = meta.alvo_atributos || {}

  // Cada tipologia tem a sua propria area-alvo, VVR adoptado e estatisticas isoladas.
  // Modo 1 tipologia mantem comportamento identico ao anterior (sem sufixo; areaAlvo/VVR globais).
  const groups = tipologias.map((tip, i) => {
    const isFirst = i === 0
    const areaTip = tipologias.length === 1
      ? areaAlvoGlobal
      : (parseFloat(tip?.area) || areaAlvoGlobal)
    const vvrTip = parseFloat(tip?.vvr) || (isFirst ? (parseFloat(a.vvr) || parseFloat(im.valor_venda_remodelado)) : 0) || 0
    return {
      tip,
      label: (tip && tip.tipologia) || `Tip. ${i + 1}`,
      ...computeTipologiaStats(tip, areaTip, descontoNeg, vvrTip),
    }
  })
  const totalN = groups.reduce((s, g) => s + g.n, 0)
  const multi = groups.length > 1
  const suffix = (g) => multi ? ` — ${g.label}` : ''

  // ─────────────────────────────────────────────────────────
  // MODO COMPACTO (Dossier) — resumo + imagem Alfredo, sem metodologia,
  // sem tabela de comparáveis ajustados, sem lista de URLs.
  // ─────────────────────────────────────────────────────────
  if (opts.compactMode) {
    b.header('ESTUDO DE COMPARÁVEIS')
    const comComps = groups.filter(g => g.n > 0)
    if (comComps.length > 0) {
      groups.forEach((g) => {
        if (g.n === 0) return
        if (multi) { b.subheader(g.label); b.space(1) }
        b.bigNumbers([
          { label: 'Mediana VVR Est.', value: EUR(g.medianaVvr), sub: `(${g.n} comparáveis analisados)` },
          { label: 'VVR Adoptado', value: EUR(g.vvrAdoptado), valueColor: g.posCor, sub: g.deltaMediana != null ? `${g.deltaMediana >= 0 ? '+' : ''}${g.deltaMediana.toFixed(1)}% vs. mediana` : '(escolha interna)' },
          { label: 'Preço/m² VVR', value: g.precoM2Vvr ? `${Math.round(g.precoM2Vvr).toLocaleString('pt-PT')} €/m²` : '—', sub: '(preço por m² implícito)' },
        ])
        b.space(3)
      })
    } else {
      b.note('Sem comparáveis registados nesta análise.')
    }

    // Imagem Alfredo (estudo de mercado externo) — validação independente
    if (a._alfredoImgData) {
      const buf = a._alfredoImgData
      const dims = pngDimensions(buf)
      const ratio = dims ? dims.h / dims.w : 0.7
      let drawW = CW
      let drawH = drawW * ratio
      const maxH = PH - 50 - 70
      if (drawH > maxH * 0.8) { b.newPage() } else { b.ensure(drawH + 60) }
      b.subheader('Estudo de Mercado de Referência (Alfredo AI)')
      const availH = PH - b.y - 70
      if (drawH > availH) { drawH = availH; drawW = drawH / ratio }
      const x = ML + (CW - drawW) / 2
      let drawn = false
      b.doc.save()
      try {
        b.doc.roundedRect(x, b.y, drawW, drawH, 4).clip()
        b.doc.image(buf, x, b.y, { width: drawW, height: drawH })
        drawn = true
      } catch { /* PDFKit recusou — omitir */ }
      b.doc.restore()
      if (drawn) {
        b.doc.roundedRect(x, b.y, drawW, drawH, 4).lineWidth(0.5).stroke(C.border)
        b.y += drawH + 8
        const dataRecolha = meta.data_recolha ? FDATE(meta.data_recolha) : null
        b.note(dataRecolha
          ? `Captura do estudo de mercado externo (Alfredo AI), recolhida em ${dataRecolha}.`
          : 'Captura do estudo de mercado externo (Alfredo AI).')
      }
    }
    b.space(3)
    return
  }

  // ─────────────────────────────────────────────────────────
  // Um "capitulo" completo por tipologia. Para 1 tipologia o resultado e
  // identico ao anterior. A METODOLOGIA (C/D) e a imagem Alfredo sao
  // partilhadas e renderizadas uma so vez (no 1.º grupo).
  // ─────────────────────────────────────────────────────────
  groups.forEach((g, gi) => {
    // Cada tipologia (excepto a 1.ª) comeca em pagina propria.
    if (gi > 0) b.newPage()

    // ── PAGINA 2 — SUMARIO EXECUTIVO ──
    // Skip quando chamado do Dossier — duplica RESUMO DO INVESTIMENTO da Analise de Rentabilidade.
    if (!opts.skipSumarioExecutivo) {
      b.header('SUMÁRIO EXECUTIVO' + suffix(g))

      // Caixa preta com Conclusao (texto manual so na 1.ª tipologia; restantes auto)
      let conclusao = ((!multi || gi === 0) ? (meta.conclusao_estudo || '') : '').trim()
      if (!conclusao && g.n > 0) {
        conclusao = gerarConclusaoAuto({
          n: g.n, mediana: g.medianaVvr, vvrAdoptado: g.vvrAdoptado, delta: g.deltaMediana, posTexto: g.posTexto,
          minM2: g.minM2, maxM2: g.maxM2, precoM2Vvr: g.precoM2Vvr, descontoNeg,
          dataRecolha: meta.data_recolha, fonteDados: meta.fonte_dados,
        })
      }
      if (conclusao) {
        const conclH = b.doc.heightOfString(conclusao, { width: CW - 28, lineGap: 3 })
        const boxH = conclH + 30
        b.ensure(boxH + 6)
        b.doc.rect(ML, b.y, CW, boxH).fill(C.black)
        b.doc.rect(ML, b.y, 4, boxH).fill(C.gold)
        b.doc.fontSize(7).fillColor(C.gold).text('CONCLUSÃO DO ESTUDO', ML + 14, b.y + 8, { width: CW - 28, characterSpacing: 1, lineBreak: false })
        b.doc.fontSize(9).fillColor('#f0efe9').text(conclusao, ML + 14, b.y + 22, { width: CW - 28, lineGap: 3 })
        b.y += boxH + 8
      }

      // Grid 4 KPIs hero
      if (g.n > 0) {
        b.bigNumbers([
          { label: 'Mediana VVR Est.', value: EUR(g.medianaVvr), sub: '(Mediana dos VVR estimados ajustados dos comparáveis)' },
          { label: 'Intervalo de Mercado', value: [`${Math.round(g.minM2).toLocaleString('pt-PT')} €/m²`, `a ${Math.round(g.maxM2).toLocaleString('pt-PT')} €/m²`], sub: '(Min. e máx. €/m² ajustado)' },
          { label: 'VVR Adoptado', value: EUR(g.vvrAdoptado), valueColor: g.posCor, sub: g.deltaMediana != null ? `${g.deltaMediana >= 0 ? '+' : ''}${g.deltaMediana.toFixed(1)}% vs. mediana` : '(Valor de Venda de Referência escolhido)' },
          { label: 'Preço/m² VVR', value: g.precoM2Vvr ? `${Math.round(g.precoM2Vvr).toLocaleString('pt-PT')} €/m²` : '—', sub: '(Preço por m² implícito no VVR adoptado)' },
        ])
        b.space(4)
      }
    }

    // A. Imovel em Analise — skip quando chamado do Dossier (duplica OPORTUNIDADE)
    if (!opts.skipImovelEmAnalise) {
      b.header('A. IMÓVEL EM ANÁLISE' + suffix(g))
      b.simpleTable([
        { label: 'Referência do Imóvel', value: im.nome || '—' },
        { label: 'Zona / Município', value: [im.zona, im.concelho].filter(Boolean).join(' · ') || '—' },
        { label: 'Tipologia', value: multi ? g.label : (im.tipologia || '—') },
        { label: 'Área Útil (m²)', value: g.areaAlvo ? `${g.areaAlvo} m²` : '—' },
        { label: 'Estado após Intervenção (Condição esperada na venda)', value: alvoAtr.estado || 'Reabilitado (após obra)' },
        { label: 'Piso', value: alvoAtr.piso || '—' },
        { label: 'Elevador', value: alvoAtr.elevador ? 'Sim' : 'Não' },
        { label: 'Garagem / Estacionamento', value: alvoAtr.garagem ? 'Sim' : 'Não' },
        { label: 'VVR Adoptado (Valor de Venda de Referência — preço alvo de saída)', value: EUR(g.vvrAdoptado), total: true },
        { label: 'Preço de Venda Alvo por m²', value: g.precoM2Vvr ? `${Math.round(g.precoM2Vvr).toLocaleString('pt-PT')} €/m²` : '—' },
      ])
      b.space(4)
    }

    // B. Analise de Rendimento — Exit Arrendamento — skip quando do Dossier
    // (J. EXIT ALTERNATIVO da Analise de Rentabilidade ja faz analise completa)
    if (!opts.skipExitArrendamento) {
      b.header('B. ANÁLISE DE RENDIMENTO — EXIT ARRENDAMENTO (Activar se exit alternativo à venda)' + suffix(g))
      const rendaMensal = parseFloat(g.tip?.renda) || 0
      const yieldBruta = parseFloat(g.tip?.yield) || 0
      const vvrPorRendimento = (rendaMensal > 0 && yieldBruta > 0) ? (rendaMensal * 12 / (yieldBruta / 100)) : 0
      b.simpleTable([
        { label: 'Renda Mensal Estimada (Valor de mercado de arrendamento na zona)', value: rendaMensal > 0 ? EUR(rendaMensal) : '—' },
        { label: 'Yield Bruta (Renda anual / VVR — rendimento bruto de arrendamento)', value: yieldBruta > 0 ? `${yieldBruta.toFixed(2)}%` : '—' },
        { label: 'VVR pelo Rendimento (VVR implícito pela yield de mercado na zona)', value: vvrPorRendimento > 0 ? EUR(vvrPorRendimento) : '—' },
      ])
      if (rendaMensal === 0) {
        b.note('Preencher esta secção quando o exit alternativo de arrendamento for analisado. Requer estudo de rendas comparáveis na zona.')
      }
      b.space(4)
    }

    // ── PAGINA 3 — METODOLOGIA E COMPARAVEIS (partilhada — so no 1.º grupo) ──
    if (gi === 0) {
      b.newPage()
      b.header('METODOLOGIA E COMPARÁVEIS')

      // C. Metodologia
      b.subheader('C. Metodologia de Avaliação')
      b.simpleTable([
        { label: 'Tipo de Preço (Oferta de venda vs. transacção efectiva escriturada)', value: meta.tipo_preco || '—' },
        { label: 'Desconto Negocial Estimado (Redução média entre oferta e transacção)', value: descontoNeg != null ? `${descontoNeg}%` : '—' },
        { label: 'Data de Recolha dos Dados', value: meta.data_recolha || '—' },
        { label: 'Raio de Pesquisa (Distância máxima ao imóvel alvo)', value: meta.raio_pesquisa_km != null ? `${meta.raio_pesquisa_km} km` : '—' },
        { label: 'Número de Comparáveis Válidos', value: String(totalN) },
        { label: 'Ajustes Aplicados', value: 'Área, estado, piso, elevador, garagem' },
      ])
      if (meta.metodologia) {
        b.space(2)
        b.note(meta.metodologia)
      }
      b.space(4)

      // D. Grelha de Ajustes Qualitativos
      b.subheader('D. Grelha de Ajustes Qualitativos (Lógica de ajuste aplicada a cada atributo)')
      b.colTable(
        [['Atributo', 90], ['Direcção do Ajuste', 200], ['Lógica', 175]],
        [
          { _values: ['Estado de Conservação', 'Comp. pior que alvo: +% | Comp. igual ou melhor: 0% ou -%', 'Alvo será reabilitado — comp. em pior estado subestima o VVR'] },
          { _values: ['Piso', 'Cave/RC: +% vs andar | Andar alto: -%', 'Cave penaliza preço; andares altos premiam'] },
          { _values: ['Elevador', 'Comp. com elevador e alvo sem: -%', 'Remover o atributo premium do comparável'] },
          { _values: ['Garagem', 'Comp. com garagem e alvo sem: -%', 'Remover valor de garagem do comparável'] },
          { _values: ['Área', `Calculado automaticamente (diferença % × coef. ${AREA_FACTOR_PDF})`, 'Fracções menores tendem a ter preço/m² mais alto'] },
        ]
      )
      b.space(4)

      // Estudo de Mercado de Referencia (Alfredo) — fonte externa
      if (a._alfredoImgData) {
        const buf = a._alfredoImgData
        const dims = pngDimensions(buf)
        const ratio = dims ? dims.h / dims.w : 0.7
        // Reservar espaco para subheader + imagem + nota; mudar de pagina se nao couber
        let drawW = CW
        let drawH = drawW * ratio
        const maxH = PH - 50 - 70 // altura util da pagina
        if (drawH > maxH * 0.8) {
          // Forcar pagina propria se imagem for muito alta
          b.newPage()
        } else {
          b.ensure(drawH + 60)
        }
        b.subheader('Estudo de Mercado de Referência (fonte externa — Alfredo)')
        const availH = PH - b.y - 70
        if (drawH > availH) { drawH = availH; drawW = drawH / ratio }
        const x = ML + (CW - drawW) / 2
        let drawn = false
        b.doc.save()
        try {
          b.doc.roundedRect(x, b.y, drawW, drawH, 4).clip()
          b.doc.image(buf, x, b.y, { width: drawW, height: drawH })
          drawn = true
        } catch { /* PDFKit recusou — omitir */ }
        b.doc.restore()
        if (drawn) {
          b.doc.roundedRect(x, b.y, drawW, drawH, 4).lineWidth(0.5).stroke(C.border)
          b.y += drawH + 8
          const dataRecolha = meta.data_recolha ? FDATE(meta.data_recolha) : null
          b.note(dataRecolha
            ? `Captura do estudo de mercado externo recolhido em ${dataRecolha}. Validação independente da metodologia interna apresentada acima.`
            : 'Captura do estudo de mercado externo. Validação independente da metodologia interna apresentada acima.')
          b.space(4)
        }
      }
    }

    // E. Tabela de Comparaveis Ajustados
    b.subheader('E. Tabela de Comparáveis Ajustados' + suffix(g))
    if (g.n > 0) {
      const rowsE = g.compsCalc.map((c, i) => {
        const id = `Comp. ${String.fromCharCode(65 + i)}${c.descricao ? ' ' + c.descricao : ''}`
        const link = c.link && /^https?:\/\//i.test(String(c.link).trim()) ? String(c.link).trim() : null
        const idCell = link ? { value: id, link, color: C.gold } : id
        return { _values: [
          idCell,
          `${c.area} m²`,
          EUR(c.preco),
          `${Math.round(c.precoM2Bruto).toLocaleString('pt-PT')} €/m²`,
          { value: `${c.ajTotal >= 0 ? '+' : ''}${c.ajTotal.toFixed(1)}%`, color: c.ajTotal >= 0 ? '#1B5E20' : '#8B1A1A' },
          `${Math.round(c.precoM2Aj).toLocaleString('pt-PT')} €/m²`,
          EUR(c.vvrEst),
          EUR(c.precoTransac),
        ] }
      })
      // Linha MEDIA
      rowsE.push({ _total: true, _values: ['MÉDIA', '—', '—', `${Math.round(g.n > 0 ? g.compsCalc.reduce((s,c)=>s+c.precoM2Bruto,0)/g.n : 0).toLocaleString('pt-PT')} €/m²`, '—', `${Math.round(g.mediaM2).toLocaleString('pt-PT')} €/m²`, EUR(g.mediaVvr), '—'] })
      rowsE.push({ _total: true, _values: ['MEDIANA', '—', '—', '—', '—', `${Math.round(g.medianaM2).toLocaleString('pt-PT')} €/m²`, EUR(g.medianaVvr), '—'] })
      if (g.vvrAdoptado > 0) {
        rowsE.push({ _total: true, _values: ['VVR ADOPTADO', '—', '—', '—', { value: g.deltaMediana != null ? `${g.deltaMediana >= 0 ? '+' : ''}${g.deltaMediana.toFixed(1)}% vs. med.` : '—', color: g.posCor }, g.precoM2Vvr ? `${Math.round(g.precoM2Vvr).toLocaleString('pt-PT')} €/m²` : '—', EUR(g.vvrAdoptado), '—'] })
      }
      b.colTable(
        [['Comparável', 110], ['Área', 38], ['Preço Oferta', 60], ['€/m² Bruto', 55], ['Aj. Total', 50], ['€/m² Aj.', 55], ['VVR Est.', 60], ['Transac. -' + descontoNeg + '%', 62]],
        rowsE
      )
      b.space(2)
      b.note(`Ajuste de área calculado automaticamente com coeficiente ${AREA_FACTOR_PDF}. Ajustes de estado, piso, elevador e garagem inseridos manualmente. Preço de transacção estimado com desconto negocial de ${descontoNeg}% sobre preço de oferta.`)
    } else {
      b.note('Sem comparáveis preenchidos nesta análise.')
    }
    b.space(4)

    // ─────────────────────────────────────────────────────────
    // LINKS DOS ANUNCIOS (modo urlsOnly: lista compacta sem fichas)
    // Layout 2-linhas por comparavel: linha 1 e identificador (Comp. A · €Y · Z m²),
    // linha 2 e o URL clicavel completo (com wrap se URL muito longo).
    // ─────────────────────────────────────────────────────────
    if (g.n > 0 && opts.urlsOnly) {
      const compsComLink = g.compsCalc.filter(c => c.link && /^https?:\/\//i.test(String(c.link).trim()))
      if (compsComLink.length > 0) {
        b.header('LINKS DOS ANÚNCIOS' + suffix(g))
        b.note('Carregue em cada link para abrir o anúncio original do comparável no portal de origem.')
        b.space(2)
        compsComLink.forEach((c) => {
          const idx = g.compsCalc.indexOf(c)
          const letra = String.fromCharCode(65 + idx)
          const url = String(c.link).trim()
          const resumo = `Comp. ${letra} · ${EUR(c.preco)} · ${c.area} m²`
          // Medir altura do URL para reservar espaco antes de desenhar
          b.doc.fontSize(7.5)
          const urlH = b.doc.heightOfString(url, { width: CW, lineGap: 1 })
          const totalH = 14 + urlH + 10
          b.ensure(totalH)
          // Linha 1: identificador
          b.doc.fontSize(8.5).fillColor(C.body)
            .text(resumo, ML, b.y, { width: CW, lineBreak: false })
          b.y += 12
          // Linha 2: URL clicavel (com wrap permitido para URLs longos)
          b.doc.fontSize(7.5).fillColor(C.gold)
            .text(url, ML, b.y, { width: CW, link: url, underline: true, lineGap: 1 })
          b.y += urlH + 8
        })
        b.space(2)
      }
    }

    // ─────────────────────────────────────────────────────────
    // PAGINA 5+ — FICHAS INDIVIDUAIS — skip quando do Dossier
    // ─────────────────────────────────────────────────────────
    if (g.n > 0 && !opts.skipFichasIndividuais) {
      b.newPage()
      b.header('FICHAS INDIVIDUAIS DOS COMPARÁVEIS' + suffix(g))
      b.note('Detalhe de cada comparável com atributos, ajustes aplicados e posicionamento face ao imóvel em análise.')
      b.space(4)

      const pctStr = (v) => `${v >= 0 ? '+' : ''}${(v || 0).toFixed(1)}%`
      const signColor = (v) => v === 0 ? C.body : (v > 0 ? '#1B5E20' : '#8B1A1A')

      g.compsCalc.forEach((c, i) => {
        const letra = String.fromCharCode(65 + i)
        const subtitulo = c.descricao || c.notas || ''
        const linkValido = c.link && /^https?:\/\//i.test(String(c.link).trim()) ? String(c.link).trim() : null
        // Header do card preto: titulo a esquerda + subtitulo a direita (sem overlap)
        b.ensure(28 + (linkValido ? 14 : 0))
        b.doc.rect(ML, b.y, CW, 24).fill(C.black)
        b.doc.fontSize(10).fillColor(C.white).text(`Comp. ${letra}`, ML + 12, b.y + 7, { width: 180, lineBreak: false })
        if (subtitulo) {
          const subX = ML + 200
          const subW = CW - 200 - 12
          b.doc.fontSize(8.5).fillColor('#9b8a4d').text(subtitulo, subX, b.y + 8, { width: subW, align: 'right', lineBreak: false })
        }
        b.y += 28
        if (linkValido) {
          b.doc.fontSize(8).fillColor(C.muted).text('Anúncio: ', ML + 12, b.y, { lineBreak: false, continued: true })
          b.doc.fillColor(C.gold).text(linkValido, { lineBreak: false, link: linkValido, underline: true })
          b.y += 12
        }

        // 2 colunas lado a lado: atributos esquerda / ajustes direita com totais destacados
        const leftRows = [
          { label: 'Área Útil', value: c.area ? `${c.area} m²` : '—' },
          { label: 'Preço de Oferta', value: EUR(c.preco) },
          { label: 'Preço/m² Bruto (Sem ajuste)', value: `${Math.round(c.precoM2Bruto).toLocaleString('pt-PT')} €/m²` },
          { label: 'Estado de Conservação', value: c.estado || '—' },
          { label: 'Piso', value: c.piso || '—' },
          { label: 'Elevador', value: c.elevador === true ? 'Sim' : (c.elevador === false ? 'Não' : '—') },
          { label: 'Garagem / Estacionamento', value: c.garagem === true ? 'Sim' : (c.garagem === false ? 'Não' : '—') },
          { label: 'Dias em Mercado', value: c.dias_mercado != null ? `${c.dias_mercado} dias` : '—' },
        ]
        const rightRows = [
          { label: 'Ajuste Conservação', value: pctStr(c.ajConserv), color: signColor(c.ajConserv) },
          { label: 'Ajuste Piso', value: pctStr(c.ajPiso), color: signColor(c.ajPiso) },
          { label: 'Ajuste Elevador', value: pctStr(c.ajElev), color: signColor(c.ajElev) },
          { label: 'Ajuste Garagem', value: pctStr(c.ajGar), color: signColor(c.ajGar) },
          { label: 'Ajuste Área (auto)', value: pctStr(c.ajArea), color: signColor(c.ajArea) },
          { label: 'AJUSTE TOTAL', value: pctStr(c.ajTotal), color: signColor(c.ajTotal), total: true },
          { label: 'Preço/m² Ajustado', value: `${Math.round(c.precoM2Aj).toLocaleString('pt-PT')} €/m²`, total: true },
          { label: `VVR Estimado (${g.areaAlvo} m²)`, value: EUR(c.vvrEst), total: true },
        ]
        b.twoColRows(leftRows, rightRows)

        if (c.notas && c.notas !== c.descricao) {
          b.space(1)
          b.note(`Notas: ${c.notas}`)
        }
        b.space(3)
      })
    }

    // ─────────────────────────────────────────────────────────
    // PAGINA FINAL — ANALISE ESTATISTICA
    // ─────────────────────────────────────────────────────────
    if (g.n >= 2) {
      b.newPage()
      b.header('ANÁLISE ESTATÍSTICA E POSICIONAMENTO DO VVR' + suffix(g))

      // G. Estatisticas
      b.subheader('G. Estatísticas dos Comparáveis Ajustados')
      b.simpleTable([
        { label: 'Número de Comparáveis Válidos', value: String(g.n) },
        { label: 'Média Preço/m² Ajustado (Média aritmética dos preços/m² ajustados)', value: `${Math.round(g.mediaM2).toLocaleString('pt-PT')} €/m²` },
        { label: 'Mediana Preço/m² Ajustado (Valor central — menos sensível a extremos)', value: `${Math.round(g.medianaM2).toLocaleString('pt-PT')} €/m²` },
        { label: 'Mínimo Preço/m² Ajustado', value: `${Math.round(g.minM2).toLocaleString('pt-PT')} €/m²` },
        { label: 'Máximo Preço/m² Ajustado', value: `${Math.round(g.maxM2).toLocaleString('pt-PT')} €/m²` },
        { label: 'Desvio Padrão Preço/m² (Dispersão dos comparáveis — menor = mais homogéneo)', value: `${Math.round(g.desvio).toLocaleString('pt-PT')} €/m²` },
        { label: `Média VVR Estimado (para ${g.areaAlvo} m²)`, value: EUR(g.mediaVvr) },
        { label: `Mediana VVR Estimado (para ${g.areaAlvo} m²)`, value: EUR(g.medianaVvr) },
        { label: `Intervalo VVR Estimado (para ${g.areaAlvo} m²)`, value: `${EUR(g.minVvr)} a ${EUR(g.maxVvr)}` },
      ])
      b.space(4)

      // H. Posicionamento do VVR Adoptado
      b.subheader('H. Posicionamento do VVR Adoptado')
      const margemSegPct = m.margem_seg_vvr != null ? `${(m.margem_seg_vvr * 100).toFixed(1)}% (ver relatório de rentabilidade)` : '— (analisar no relatório de rentabilidade)'
      const precoTransacEquiv = g.vvrAdoptado * (1 - descontoNeg / 100)
      b.simpleTable([
        { label: 'VVR Adoptado (Preço de saída definido para o negócio)', value: EUR(g.vvrAdoptado), color: C.gold, total: true },
        { label: 'Preço/m² Implícito no VVR', value: g.precoM2Vvr ? `${Math.round(g.precoM2Vvr).toLocaleString('pt-PT')} €/m²` : '—' },
        { label: 'Posicionamento (Face à distribuição dos comparáveis ajustados)', value: g.posTexto, color: g.posCor, total: true },
        { label: 'VVR vs. Média dos Comparáveis (Diferença percentual face à média)', value: g.deltaMedia != null ? `${g.deltaMedia >= 0 ? '+' : ''}${g.deltaMedia.toFixed(1)}%` : '—', color: g.deltaMedia != null && g.deltaMedia < 0 ? '#1B5E20' : '#8B1A1A' },
        { label: 'VVR vs. Mediana dos Comparáveis (indicador principal)', value: g.deltaMediana != null ? `${g.deltaMediana >= 0 ? '+' : ''}${g.deltaMediana.toFixed(1)}%` : '—', color: g.posCor, total: true },
        { label: 'Margem de Segurança VVR (% de desconto antes de prejuízo)', value: margemSegPct },
        { label: 'Desconto Negocial Estimado (% redução esperada entre oferta e transacção)', value: `${descontoNeg}%` },
        { label: `Preço de Transacção Equivalente (VVR ajustado com desconto de ${descontoNeg}%)`, value: EUR(precoTransacEquiv) },
      ])
      b.space(3)

      // I. Posicionamento Visual
      b.subheader('I. Posicionamento Visual — VVR no Intervalo de Mercado')
      if (g.minVvr > 0 && g.maxVvr > 0 && g.vvrAdoptado > 0) {
        drawPosVisualBar(b, { min: g.minVvr, max: g.maxVvr, mediana: g.medianaVvr, media: g.mediaVvr, vvr: g.vvrAdoptado, posCor: g.posCor })
        b.space(2)
        b.note('Diamante colorido = VVR adoptado. Linha sólida dourada = mediana. Linha tracejada cinzenta = média. Verde = posicionamento conservador. Dourado = alinhado com mediana. Vermelho = acima do intervalo.')
      } else {
        b.note('Posicionamento visual indisponível: dados insuficientes.')
      }
      b.space(4)
    }
  })

  // Footer
  if (tipologias.length === 0) {
    for (let i = 1; i <= 5; i++) {
      b.header(`COMPARÁVEL ${i}`)
      b.simpleTable([
        { label: 'Endereço / Zona', value: '________________' }, { label: 'Tipologia', value: '________________' },
        { label: 'Área (m²)', value: '________________' }, { label: 'Valor de Venda', value: '________________' },
        { label: 'Valor por m²', value: '________________' }, { label: 'Data de Venda', value: '________________' },
      ])
      b.space(4)
    }
  }

  b.space(4)
  b.text('Os valores apresentados são estimativas baseadas em comparáveis de mercado e podem não reflectir o valor exacto de transacção. A Somnium Properties recomenda validação com avaliação profissional certificada. Este documento é preparado para fins informativos e não constitui aconselhamento financeiro ou fiscal. Somnium Properties — Confidencial.', { size: 7, color: C.muted })
}

function renderPropostaFormal(b, im) {
  b.header('DADOS DO IMÓVEL')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
    { label: 'Consultor', value: im.nome_consultor }, { label: 'Ask Price', value: EUR(im.ask_price) },
  ])
  b.space(4)
  b.header('PROPOSTA')
  b.bigNumbers([{ label: 'Valor Proposto', value: EUR(im.valor_proposta) }])
  b.simpleTable([
    { label: 'Condições de Pagamento', value: '________________' },
    { label: 'Prazo para CPCV', value: '________________' },
    { label: 'Prazo para Escritura', value: '________________' },
    { label: 'Condições Especiais', value: '________________' },
  ])
  b.space(4)
  b.subheader('Justificação do Valor')
  b.metric('Fundamentos da proposta (comparáveis, estado, obra necessária)', '________________')
}

// Renderiza o detalhe do orçamento da aba "Obra" no dossier de
// investidor: secções com subtotal bruto (base + IVA liquidado),
// BDI, licenciamento e total geral. O bruto fiscal corresponde ao
// total que o investidor irá efectivamente desembolsar (incluindo
// IVA autoliquidado, que é IVA que entra na sua contabilidade).
function renderOrcamentoObraDetalhado(b, orc) {
  const calc = orc.calc
  const totais = calc.totais
  b.header('ORÇAMENTO DE OBRA — DETALHE POR SECÇÃO')

  const seccoesRows = []
  for (const key of SECCOES_ORDEM) {
    const s = calc.seccoes?.[key]
    if (!s || !s.subtotal_bruto) continue
    seccoesRows.push({ label: SECCOES_LABELS[key] || key, value: EUR(s.subtotal_bruto) })
  }

  if (seccoesRows.length > 0) {
    b.simpleTable(seccoesRows)
    b.space(4)
  } else {
    b.text('Orçamento de obra ainda sem linhas preenchidas na aba Obra.', { size: 9, color: C.muted })
    b.space(4)
  }

  // Subtotais e BDI
  const baseObraSemBdi = totais.base_obra ?? 0
  const baseObraComBdi = totais.base_obra_com_bdi ?? 0
  const ivaObra = totais.iva_obra ?? 0
  const baseLic = totais.base_licenciamento ?? 0
  const ivaLic = totais.iva_extra ?? 0
  const ivaAutoliq = totais.iva_autoliquidado ?? 0
  const retencoes = totais.retencoes_irs ?? 0
  const bdiImprev = calc.bdi?.imprevistos_base ?? 0
  const bdiMargem = calc.bdi?.margem_base ?? 0

  const resumoRows = [
    { label: 'Base de obra (sem BDI)', value: EUR(baseObraSemBdi) },
  ]
  if (bdiImprev > 0) resumoRows.push({ label: `Imprevistos (${calc.bdi.imprevistos_perc}%)`, value: EUR(bdiImprev) })
  if (bdiMargem > 0) resumoRows.push({ label: `Margem do empreiteiro (${calc.bdi.margem_perc}%)`, value: EUR(bdiMargem) })
  if (baseObraComBdi !== baseObraSemBdi) resumoRows.push({ label: 'Base de obra c/ BDI', value: EUR(baseObraComBdi), total: true })
  if (ivaObra > 0) resumoRows.push({ label: 'IVA da obra (liquidado)', value: EUR(ivaObra) })
  if (baseLic > 0) resumoRows.push({ label: 'Licenciamento, fiscalização e seguros', value: EUR(baseLic) })
  if (ivaLic > 0) resumoRows.push({ label: 'IVA do licenciamento', value: EUR(ivaLic) })
  resumoRows.push({ label: 'TOTAL ORÇAMENTO (bruto fiscal)', value: EUR(calc.total_geral), total: true })
  if (ivaAutoliq > 0) resumoRows.push({ label: '(-) IVA autoliquidado p/ adquirente', value: EUR(ivaAutoliq) })
  if (retencoes > 0) resumoRows.push({ label: '(-) Retenções IRS a entregar à AT', value: EUR(retencoes) })
  if (totais.a_pagar != null && (ivaAutoliq > 0 || retencoes > 0)) {
    resumoRows.push({ label: 'Total a pagar a prestadores', value: EUR(totais.a_pagar), total: true })
  }

  b.simpleTable(resumoRows)

  // Regime fiscal aplicado (zona ARU + tipo de obra)
  const regimeLabels = []
  if (calc.zona_aru) regimeLabels.push('Zona ARU (Verba 2.27 CIVA — material a 6%)')
  if (calc.tipo_obra === 'remodelacao') regimeLabels.push('Remodelação (mão-de-obra a 6%)')
  if (calc.tipo_obra === 'construcao_nova') regimeLabels.push('Construção nova (mão-de-obra a 23%)')
  if (regimeLabels.length > 0) {
    b.space(2)
    b.text(`Regime fiscal: ${regimeLabels.join(' · ')}`, { size: 8, color: C.muted })
  }
  if (orc.notas) {
    b.space(2)
    b.text(`Notas do orçamento: ${orc.notas}`, { size: 8, color: C.muted })
  }
  b.space(4)
}

function renderDossierInvestidor(b, im, a) {
  const fotos = parseFotos(im)
  const deal = resolveDealData(im, a)
  const m = calcMetricsExtra(a, im)
  const compra = deal.compra ?? 0
  const obra = deal.obra_com_iva ?? deal.obra ?? 0
  const vvr = deal.vvr ?? 0

  b.header('OPORTUNIDADE DE INVESTIMENTO')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona },
    { label: 'Tipologia', value: im.tipologia }, { label: 'Modelo', value: im.modelo_negocio || 'CAEP 50/50' },
    { label: 'Prazo Estimado', value: deal.meses ? `${deal.meses} meses` : '—' },
  ])
  b.space(3)

  // SUMÁRIO EXECUTIVO — KPIs de investimento em destaque, logo no inicio.
  // Substitui o "RESUMO DO INVESTIMENTO" que estava no meio do dossier.
  b.header('SUMÁRIO EXECUTIVO')
  b.bigNumbers([
    { label: 'Capital Necessário', value: EUR(deal.capital_necessario) },
    { label: 'Lucro Bruto', value: EUR(deal.lucro_bruto), sub: 'Antes de impostos' },
    { label: 'MOIC', value: formatMOIC(deal.moic), sub: 'Múltiplo do capital' },
  ])
  b.space(2)
  b.bigNumbers([
    { label: 'Retorno Anualizado', value: PCT(deal.retorno_anualizado), sub: 'Simples' },
    { label: 'Cash-on-Cash', value: PCT(deal.cash_on_cash) },
  ])
  b.space(2)
  b.bigNumbers([
    { label: 'Payback', value: formatPayback(deal.payback_meses), sub: 'Recuperacao integral no exit' },
  ])
  b.space(4)

  if (fotos.length > 0) { b.space(2); b.photos(fotos, 'O IMÓVEL') }
  b.space(2)
  // Localizacao: so renderiza se imagem preloaded com sucesso.
  // (Se URL existe mas preload SVG falhou, NAO criar pagina vazia.)
  if (im._localizacaoImgData) { b.newPage(); b.localizacao() }
  if (im.pontos_fortes || im.pontos_fracos || im.riscos) { b.pontosFortesFracosRiscos() }
  if (im.mitigacao_riscos) { b.space(2); b.riscosMitigacao() }

  // Estudo de Comparáveis — modo compacto no Dossier: resumo (3 KPIs) +
  // print do Alfredo AI. Metodologia, tabela ajustada e URLs ficam no PDF
  // "estudo_comparaveis" dedicado, para não inflar o Dossier.
  try {
    let __comps = a.comparaveis
    if (typeof __comps === 'string') { try { __comps = JSON.parse(__comps || 'null') } catch { __comps = null } }
    const __tipologias = Array.isArray(__comps) ? __comps : (__comps?.tipologias || [])
    const __hasValid = __tipologias.some(t => (t?.comparaveis || []).some(c => parseFloat(c?.preco) > 0 && parseFloat(c?.area) > 0))
    const __temAlfredo = !!a._alfredoImgData
    if (__hasValid || __temAlfredo) {
      renderEstudoComparaveis(b, im, a, { compactMode: true })
    }
  } catch (e) {
    console.error('[dossier] estudo de comparaveis falhou:', e.message, '\n', e.stack?.split('\n').slice(0,5).join('\n'))
  }

  // Análise de Rentabilidade integral — sem newPage explicito.
  try {
    renderAnaliseRentabilidade(b, im, a, {
      skipResumoExecutivo: true,
      skipResumoInvestimento: true,
    })
  } catch (e) {
    console.error('[dossier] analise de rentabilidade falhou:', e.message, '\n', e.stack?.split('\n').slice(0,5).join('\n'))
    b.note(`Detalhe da analise de rentabilidade indisponivel para este negocio. Erro tecnico registado nos logs do servidor.`)
  }

  // Pressupostos e glossario partilhados (mesma funcao chamada pela Anonima)
  // Renderizam numa pagina dedicada e isolada, no fim do dossier.
  try {
    renderAssumptionsAndGlossary(b, deal)
  } catch (e) {
    console.error('[dossier] glossario falhou:', e.message)
  }

  // Indice da documentacao anexa. As paginas fisicas dos PDFs sao acrescentadas
  // ao buffer final por appendDocumentacaoChecklist (pdf-lib) em documentLifecycle.
  try {
    renderDocumentacaoChecklist(b, im)
  } catch (e) {
    console.error('[dossier] checklist documentacao falhou:', e.message)
  }
}

/**
 * Anexa ao buffer do dossier (gerado pelo pdfkit) todas as páginas dos PDFs
 * importados na checklist de documentação. Imagens são ignoradas (já estão
 * listadas no índice). Devolve novo buffer; em caso de erro devolve o original.
 */
export async function appendDocumentacaoChecklist(buffer, imovel) {
  try {
    let fotos = []
    try { fotos = typeof imovel.fotos === 'string' ? JSON.parse(imovel.fotos || '[]') : (imovel.fotos || []) } catch { fotos = [] }
    const docs = fotos.filter(f => f?.slot && f?.path && (/\.pdf$/i.test(f.name || '') || f.type === 'application/pdf'))
    if (!docs.length) return buffer

    const { PDFDocument } = await import('pdf-lib')
    const merged = await PDFDocument.load(buffer)
    for (const f of docs) {
      try {
        const r = await fetch(f.path)
        if (!r.ok) { console.warn('[dossier-anexos] fetch falhou:', f.path, r.status); continue }
        const bytes = await r.arrayBuffer()
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const pages = await merged.copyPages(src, src.getPageIndices())
        for (const p of pages) merged.addPage(p)
      } catch (e) {
        console.warn('[dossier-anexos] anexo falhou:', f.name, e.message)
      }
    }
    const out = await merged.save()
    return Buffer.from(out)
  } catch (e) {
    console.error('[dossier-anexos] merge global falhou:', e.message)
    return buffer
  }
}

function renderResumoNegociacao(b, im) {
  b.header('DADOS')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome }, { label: 'Ask Price', value: EUR(im.ask_price) },
    { label: 'Valor Proposta', value: EUR(im.valor_proposta) }, { label: 'Consultor', value: im.nome_consultor },
  ])
  b.space(4)

  for (let i = 1; i <= 4; i++) {
    b.subheader(`Proposta ${i}`)
    b.simpleTable([
      { label: 'Data', value: '________________' }, { label: 'Valor', value: '________________' },
      { label: 'Resposta do Proprietário', value: '________________' },
      { label: 'Notas', value: '________________' },
    ])
    b.space(4)
  }
  b.header('ESTADO ACTUAL')
  b.metric('Ponto de situação da negociação', '________________')
}

function renderFichaFollowUp(b, im) {
  b.header('ESTADO ACTUAL')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome }, { label: 'Estado', value: (im.estado || '').replace(/^\d+-/, '') },
    { label: 'Consultor', value: im.nome_consultor }, { label: 'Data Follow Up', value: FDATE(im.data_follow_up) },
  ])
  b.space(4)
  b.header('PONTO DE SITUAÇÃO')
  b.metric('O que aconteceu desde o último contacto?', '________________')
  b.space(4)
  b.header('PRÓXIMAS AÇÕES')
  b.simpleTable([1, 2, 3, 4, 5].map(i => ({ label: `□  Ação ${i}`, value: '' })))
  b.inlineData([{ label: 'Data próximo contacto', value: '________________' }, { label: 'Data limite decisão', value: '________________' }])
  b.metric('Notas', '________________')
}

function renderRelatorioInvestimento(b, im, an) {
  if (!an || !Object.keys(an).length) { b.text('Sem análise financeira activa para este imóvel.'); return }

  const ra = an.retorno_anualizado || 0

  b.bigNumbers([
    { label: 'Lucro Líquido', value: EUR(an.lucro_liquido) },
    { label: 'Retorno Anualizado', value: `${ra}%` },
    { label: 'Capital Necessário', value: EUR(an.capital_necessario) },
  ])

  b.inlineData([
    { label: 'Zona', value: im.zona || '—' },
    { label: 'Tipologia', value: im.tipologia || '—' },
    { label: 'Prazo', value: `${an.meses || 6} meses` },
    { label: 'Regime', value: an.regime_fiscal || 'Empresa' },
  ])
  b.space(4)

  // Localização + pros/contras/riscos numa página dedicada antes da
  // análise financeira, depois da identificação do imóvel.
  if (im.localizacao_imagem || im._localizacaoImgData || im.pontos_fortes || im.pontos_fracos || im.riscos || im.mitigacao_riscos) {
    b.newPage()
    b.localizacao()
    b.pontosFortesFracosRiscos()
    if (im.mitigacao_riscos) { b.space(4); b.riscosMitigacao() }
    b.newPage()
  }

  b.header('CUSTOS DO INVESTIMENTO')
  {
    const valorFinanciado = an.valor_financiado || 0
    const comissaoVenda = an.comissao_com_iva || 0
    const custoTotalProjecto = (an.capital_necessario || 0) + valorFinanciado + comissaoVenda
    const rows = [
      { label: 'Preço de compra', value: EUR(an.compra) },
      { label: 'IMT', value: EUR(an.imt) },
      { label: 'Imposto de Selo', value: EUR(an.imposto_selo) },
      { label: 'Escritura + CPCV', value: EUR((an.escritura || 0) + (an.cpcv_compra || 0)) },
      { label: 'Total Aquisição', value: EUR(an.total_aquisicao), total: true },
      { label: 'Obra c/ IVA', value: EUR(an.obra_com_iva) },
      { label: 'Licenciamento', value: EUR(an.licenciamento) },
      { label: 'Total Obra', value: EUR(an.obra_com_iva), total: true },
      { label: `Detenção (${an.meses || 6} meses)`, value: EUR(an.total_detencao) },
      { label: `Comissão venda (${an.comissao_perc || 2.5}%)`, value: EUR(comissaoVenda) },
      { label: 'Custo Total do Projecto', value: EUR(custoTotalProjecto), total: true },
    ]
    if (valorFinanciado > 0) rows.push({ label: '(−) Valor Financiado (banco)', value: `−${EUR(valorFinanciado)}` })
    if (comissaoVenda > 0) rows.push({ label: '(−) Comissão paga pelo sinal do comprador', value: `−${EUR(comissaoVenda)}` })
    rows.push({ label: 'Capital Necessário (a adiantar)', value: EUR(an.capital_necessario), total: true })
    b.simpleTable(rows)
  }
  b.space(3)

  b.header('RESULTADO')
  {
    const valorFinanciado = an.valor_financiado || 0
    const comissaoVenda = an.comissao_com_iva || 0
    const custoTotalProjecto = (an.capital_necessario || 0) + valorFinanciado + comissaoVenda
    b.simpleTable([
      { label: 'Receita de venda (VVR)', value: EUR(an.vvr) },
      { label: 'Total de custos do projecto', value: EUR(custoTotalProjecto) },
      { label: 'Lucro Bruto', value: EUR(an.lucro_bruto), total: true },
      { label: 'Impostos (IRC + Derrama)', value: EUR(an.impostos) },
      { label: 'Retenção dividendos', value: EUR(an.retencao_dividendos) },
      { label: 'Lucro Líquido', value: EUR(an.lucro_liquido), total: true },
    ])
  }
  b.space(3)

  b.header('MÉTRICAS DE RETORNO')
  b.bigNumbers([
    { label: 'ROI Total', value: PCT(an.retorno_total) },
    { label: 'Retorno Anualizado', value: PCT(an.retorno_anualizado) },
    { label: 'Cash-on-Cash', value: PCT(an.cash_on_cash) },
    { label: 'Break-even', value: EUR(an.break_even) },
  ])
}

function renderRelatorioComparaveis(b, im, an) {
  const comps = an?.comparaveis
  const parsed = typeof comps === 'string' ? JSON.parse(comps || '[]') : (comps || [])
  if (!parsed.length) { b.text('Sem dados de comparáveis registados.'); return }

  b.inlineData([{ label: 'Imóvel', value: im.nome }, { label: 'Zona', value: im.zona }])
  b.space(3)

  for (const tip of parsed) {
    const items = tip.comparaveis || []
    const valid = items.filter(c => c.preco > 0 && c.area > 0)
    if (valid.length === 0) continue

    const precosM2 = valid.map(c => {
      const base = c.preco / c.area
      const ajTotal = Object.values(c.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
      return base * (1 + ajTotal / 100)
    })
    const media = Math.round(precosM2.reduce((a, b) => a + b, 0) / precosM2.length)
    const vvr = media * (tip.area || 0)

    b.header(`${tip.tipologia || 'Tipologia'} — ${tip.area || '?'} m²`)
    b.bigNumbers([
      { label: 'VVR Estimado', value: EUR(vvr) },
      { label: 'Média €/m²', value: `${media} €/m²` },
      { label: 'Amostra', value: `${valid.length} comparáveis` },
    ])

    b.colTable(
      [['#', 25], ['Preço', 70], ['Área', 45], ['€/m²', 50], ['Neg.', 45], ['Loc.', 45], ['Idade', 45], ['Cons.', 45], ['Total', 50]],
      valid.map((c, i) => {
        const aj = c.ajustes || {}
        const ajTotal = Object.values(aj).reduce((s, v) => s + (parseFloat(v) || 0), 0)
        return { _values: [`${i + 1}`, EUR(c.preco), `${c.area}m²`, `${Math.round(c.preco / c.area)}`, `${aj.neg || 0}%`, `${aj.loc || 0}%`, `${aj.idade || 0}%`, `${aj.conserv || 0}%`, `${ajTotal >= 0 ? '+' : ''}${ajTotal}%`] }
      })
    )
    b.space(10)
  }
}

function renderRelatorioCaep(b, im, an) {
  const caep = an?.caep
  const parsed = typeof caep === 'string' ? JSON.parse(caep || 'null') : caep
  if (!parsed || parsed.quota_somnium === undefined) { b.text('Sem dados CAEP configurados.'); return }

  const captado = parsed.capital_total || 0
  const necessario = an?.capital_necessario || captado
  const cobertura = necessario > 0 ? Math.round(captado / necessario * 100) : 100

  b.header('ENQUADRAMENTO DA PARCERIA')
  b.inlineData([
    { label: 'Estrutura', value: 'Associação em Participação' },
    { label: 'Base', value: parsed.base_distribuicao === 'liquido' ? 'Lucro Líquido (após IRC)' : 'Lucro Bruto' },
  ])
  b.space(3)

  b.header('CAPITAL DA OPERAÇÃO')
  b.bigNumbers([
    { label: 'Necessário', value: EUR(necessario) },
    { label: 'Captado', value: EUR(captado) },
    { label: 'Cobertura', value: `${cobertura}%` },
  ])

  if (parsed.investidores?.length) {
    b.colTable(
      [['#', 30], ['Investidor', 140], ['Tipo', 100], ['Capital', 100], ['% Capital', 80]],
      [
        ...parsed.investidores.map((inv, i) => ({
          _values: [`#${i + 1}`, inv.nome || `Investidor ${i + 1}`, inv.tipo === 'empresa' ? 'Empresa (IRC)' : 'Particular (IRS)', EUR(inv.capital), `${necessario > 0 ? ((inv.capital / necessario) * 100).toFixed(1) : 0}%`]
        })),
        { _values: ['', 'Total captado', '', EUR(captado), `${cobertura}%`], _total: true },
      ]
    )
    b.space(3)

    b.header('DISTRIBUIÇÃO DO LUCRO')
    b.colTable(
      [['#', 25], ['Parte', 95], ['Tipo', 70], ['%', 30], ['Lucro', 65], ['Imposto', 55], ['Líquido', 60], ['ROI', 50]],
      [
        { _values: ['S', 'Somnium Properties', 'Gestor', `${parsed.perc_somnium}%`, EUR(parsed.quota_somnium), '—', EUR(parsed.quota_somnium), '—'] },
        ...parsed.investidores.map((inv, i) => ({
          _values: [`#${i + 1}`, inv.nome || `Inv. ${i + 1}`, inv.tipo === 'empresa' ? 'Empresa' : 'Particular', `${inv.perc_lucro || 0}%`, EUR(inv.lucro_bruto), EUR(inv.impostos), EUR(inv.lucro_liquido), inv.roi ? `${inv.roi}%` : '—']
        })),
        { _values: ['', 'Total distribuído', '', '', '', '', EUR((parsed.investidores.reduce((s, inv) => s + (inv.lucro_liquido || 0), 0)) + parsed.quota_somnium), ''], _total: true },
      ]
    )
  }
}

function renderRelatorioStress(b, im, an) {
  const a = an || {}
  if (!a.stress_tests) { b.text('Sem stress tests calculados.'); return }
  renderStressTests(b, a, { title: 'ANÁLISE DE RISCO — STRESS TESTS' })
}

function renderPropostaInvestimentoAnonima(b, im, a) {
  const deal = resolveDealData(im, a)
  const compra = deal.compra ?? 0
  const obra = deal.obra_com_iva ?? deal.obra ?? 0
  const vvr = deal.vvr ?? 0
  const meses = deal.meses || 6
  const capitalNecessario = deal.capital_necessario ?? (compra + obra)

  b.header('SUMÁRIO EXECUTIVO')
  b.bigNumbers([
    { label: 'Valor de Aquisição', value: EUR(compra), sub: deal.perc_financiamento > 0 ? `${deal.perc_financiamento}% financiado` : '100% capitais próprios' },
    { label: 'Valor de Venda Alvo', value: EUR(vvr) },
    { label: 'Retorno Total', value: PCT(deal.retorno_total), sub: 'lucro bruto / capital necessário' },
    { label: 'Retorno Anualizado', value: PCT(deal.retorno_anualizado), sub: `base ${meses} meses` },
  ])
  b.space(2)
  b.bigNumbers([
    { label: 'Lucro Bruto Estimado', value: EUR(deal.lucro_bruto), sub: 'antes de impostos' },
    { label: 'Capital Necessário', value: EUR(capitalNecessario), sub: 'a adiantar, líquido de financiamento e sinal' },
    { label: 'Prazo de Retenção', value: `${meses} meses`, sub: 'da compra à escritura de venda' },
  ])
  b.space(2)
  b.bigNumbers([
    { label: 'MOIC (Equity Multiple)', value: formatMOIC(deal.moic), sub: '(Capital + Lucro) / Capital' },
    { label: 'Payback', value: formatPayback(deal.payback_meses), sub: 'Recuperacao integral no exit' },
  ])
  b.space(3)

  b.header('SOBRE O PROJECTO')
  const tipoDesc = im.tipologia ? `um ${im.tipologia}` : 'um imóvel'
  const areaDesc = im.area_bruta ? ` com uma área bruta de ${im.area_bruta} m²` : ''
  const zonaDesc = localizacaoTexto(im)
  b.textBlock(
    `O projecto consiste na aquisição, remodelação integral e revenda de ${tipoDesc}${areaDesc}, localizado${zonaDesc}. ` +
    `O imóvel encontra-se num estado de conservação que exige remodelação total, o que justifica o preço de aquisição abaixo do valor de mercado e cria a margem de valorização identificada.`
  )
  b.space(4)

  b.header('IDENTIFICAÇÃO DO IMÓVEL')
  b.simpleTable([
    { label: 'Localização', value: localizacaoTexto(im, { completo: true }) },
    { label: 'Tipologia', value: im.tipologia || '—' },
    { label: 'Área Bruta Privativa', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    { label: 'Modelo de Negócio', value: im.modelo_negocio || 'CAEP 50/50' },
    { label: 'Prazo Estimado', value: `${meses} meses` },
  ])
  b.space(3)

  let comps = a.comparaveis
  if (typeof comps === 'string') try { comps = JSON.parse(comps || '[]') } catch { comps = [] }
  if (comps && comps.length > 0) {
    b.newPage()
    b.header('ESTUDO DE MERCADO — VALORES DE VENDA COMPARÁVEIS')

    for (const tip of comps) {
      const items = tip.comparaveis || []
      const valid = items.filter(c => c.preco > 0 && c.area > 0)
      if (valid.length === 0) continue

      const precosM2 = valid.map(c => {
        const base = c.preco / c.area
        const ajTotal = Object.values(c.ajustes || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
        return base * (1 + ajTotal / 100)
      })
      const media = Math.round(precosM2.reduce((a, b) => a + b, 0) / precosM2.length)
      const vvrTip = media * (tip.area || 0)

      b.subheader(`${tip.tipologia || 'Tipologia'} — ${tip.area || '?'} m²`)
      b.bigNumbers([
        { label: 'VVR Estimado', value: EUR(vvrTip) },
        { label: 'Média €/m²', value: `${media} €/m²` },
        { label: 'Amostra', value: `${valid.length} comparáveis` },
      ])
      b.colTable(
        [['#', 25], ['Preço', 70], ['Área', 45], ['€/m²', 50], ['Neg.', 45], ['Loc.', 45], ['Idade', 45], ['Total', 50]],
        valid.map((c, i) => {
          const aj = c.ajustes || {}
          const ajTotal = Object.values(aj).reduce((s, v) => s + (parseFloat(v) || 0), 0)
          return { _values: [`${i + 1}`, EUR(c.preco), `${c.area}m²`, `${Math.round(c.preco / c.area)}`, `${aj.neg || 0}%`, `${aj.loc || 0}%`, `${aj.idade || 0}%`, `${ajTotal >= 0 ? '+' : ''}${ajTotal}%`] }
        })
      )
      b.space(4)
    }
  }

  b.newPage()
  b.header('ANÁLISE FINANCEIRA — CENÁRIO BASE')
  b.subheader('Estrutura de Custos')
  {
    const valorFinanciado = deal.valor_financiado || 0
    const comissaoVenda = deal.comissao_com_iva || 0
    const custoTotalProjecto = (capitalNecessario || 0) + valorFinanciado + comissaoVenda
    const rows = [
      { label: 'Valor de Compra', value: EUR(compra) },
      { label: 'IMT + Imposto de Selo', value: EUR((deal.imt || 0) + (deal.imposto_selo || 0)) },
      { label: 'Escritura + Registos + CPCV', value: EUR((deal.escritura || 0) + (parseFloat(a.cpcv_compra) || 0)) },
      { label: 'Total Custos de Aquisição', value: EUR(deal.total_aquisicao), total: true },
      { label: 'Obra + IVA', value: EUR(obra) },
      { label: `Manutenção (${meses} meses)`, value: EUR(deal.total_detencao) },
      { label: 'Comissão Imobiliária', value: EUR(comissaoVenda) },
      { label: 'Custo Total do Projecto', value: EUR(custoTotalProjecto), total: true },
    ]
    if (valorFinanciado > 0) rows.push({ label: '(−) Valor Financiado (banco)', value: `−${EUR(valorFinanciado)}` })
    if (comissaoVenda > 0) rows.push({ label: '(−) Comissão paga pelo sinal do comprador', value: `−${EUR(comissaoVenda)}` })
    rows.push({ label: 'Capital Necessário (a adiantar)', value: EUR(capitalNecessario), total: true })
    b.simpleTable(rows)
  }
  b.space(3)

  b.subheader('Retornos')
  b.simpleTable([
    { label: 'Valor de Venda Alvo', value: EUR(vvr) },
    { label: 'Lucro Estimado (Bruto)', value: EUR(deal.lucro_bruto), total: true },
    { label: `Impostos (${deal.regime_fiscal})`, value: EUR(deal.impostos) },
    { label: 'Lucro Estimado Líquido', value: EUR(deal.lucro_liquido), total: true },
  ])
  b.space(4)

  b.bigNumbers([
    { label: 'Retorno Total', value: PCT(deal.retorno_total) },
    { label: 'Cash-on-Cash', value: PCT(deal.cash_on_cash) },
    { label: 'Retorno Anualizado', value: PCT(deal.retorno_anualizado) },
  ])
  b.space(2)
  b.bigNumbers([
    { label: 'MOIC (Equity Multiple)', value: formatMOIC(deal.moic) },
    { label: 'Payback', value: formatPayback(deal.payback_meses) },
  ])
  b.space(4)

  b.note(`Pressupostos: ${deal.perc_financiamento > 0 ? `Financiamento ${deal.perc_financiamento}%` : '100% capitais próprios'} · Regime fiscal: ${deal.regime_fiscal} · Prazo: ${meses} meses`)

  renderStressTests(b, a, { newPage: true })

  b.newPage()
  b.header('CONCLUSÃO E RECOMENDAÇÃO')
  const raVal = a.retorno_anualizado || 0
  const rtVal = a.retorno_total || 0
  let stParsed = a.stress_tests
  if (typeof stParsed === 'string') try { stParsed = JSON.parse(stParsed) } catch { stParsed = null }
  let conclusao = `O projecto apresenta um perfil de risco-retorno atractivo: no cenário base conservador, o investimento gera um retorno total de ${rtVal}% e anualizado de ${raVal}% num prazo de ${meses} meses.`
  if (stParsed) {
    if (stParsed.pior?.lucro_liquido > 0) {
      conclusao += ` O investimento mantém lucro positivo mesmo no pior cenário (${EUR(stParsed.pior.lucro_liquido)}), o que valida a solidez estrutural do projecto.`
    } else if (stParsed.pior?.lucro_liquido != null) {
      conclusao += ` No pior cenário, o lucro estimado é de ${EUR(stParsed.pior.lucro_liquido)}, o que requer atenção ao risco.`
    }
  }
  if (im.zona) conclusao += ` A localização${localizacaoTexto(im)}, sustenta os valores de venda projectados.`
  b.textBlock(conclusao)

  b.space(4)
  b.header('MODELO DE PARCERIA')
  let caep = a.caep
  if (typeof caep === 'string') try { caep = JSON.parse(caep) } catch { caep = null }
  if (caep?.quota_somnium !== undefined) {
    b.simpleTable([
      { label: 'Investidor(es) passivo(s)', value: `${100 - (caep.perc_somnium || 40)}% do lucro` },
      { label: 'Somnium Properties', value: `${caep.perc_somnium || 40}% (gestão operacional + obra)` },
    ])
  } else {
    b.simpleTable([
      { label: 'Investidor(es) passivo(s)', value: '50% do lucro' },
      { label: 'Somnium Properties', value: '50% (gestão operacional + obra)' },
    ])
  }
  b.space(4)

  // Localização + pontos fortes/fracos/riscos antes do disclaimer
  if (im.localizacao_imagem || im.pontos_fortes || im.pontos_fracos || im.riscos || im.mitigacao_riscos) {
    b.newPage()
    b.localizacao()
    b.pontosFortesFracosRiscos()
    if (im.mitigacao_riscos) { b.space(4); b.riscosMitigacao() }
  }

  // Pressupostos e glossario partilhados (mesma funcao chamada pelo Dossier)
  renderAssumptionsAndGlossary(b, deal)

  b.space(3)
  b.note('Os valores apresentados são estimativas conservadoras baseadas em análise de mercado e podem variar. A Somnium Properties utiliza stress tests automáticos em todos os negócios para protecção do investidor. Investimento imobiliário envolve risco de capital.')
}

// ── Proposta de Cedência de Posição Contratual ─────────────────
// Apresenta o negócio a investidor para tomar a posição contratual
// já garantida pela Somnium. O preço de compra não é exposto: os custos
// de aquisição são bundlados num único valor de "Cedência da Posição".
// Somnium recebe comissão = 10% do lucro líquido expectável.
function renderPropostaCedenciaPosicao(b, im, a) {
  const fotos = parseFotos(im)
  const deal = resolveDealData(im, a)
  const meses = deal.meses || 6
  const obra = deal.obra_com_iva ?? deal.obra ?? 0
  const detencao = deal.total_detencao || 0
  const comissaoVenda = deal.comissao_com_iva || 0
  const vvr = deal.vvr || 0

  // Bundle dos custos de aquisicao - investidor nao ve preco de compra
  const totalAquisicao = deal.total_aquisicao || (
    (deal.compra || 0) + (deal.imt || 0) + (deal.imposto_selo || 0) +
    (deal.escritura || 0) + (parseFloat(a.cpcv_compra) || 0) + (deal.due_diligence || 0)
  )

  const lucroLiquidoOriginal = deal.lucro_liquido || 0
  const lucroBrutoOriginal = deal.lucro_bruto || 0
  const comissaoSomnium = Math.round(lucroLiquidoOriginal * 0.10)
  const lucroLiquidoInvestidor = lucroLiquidoOriginal - comissaoSomnium
  const investimentoTotal = totalAquisicao + obra + detencao + comissaoVenda + comissaoSomnium

  // Retorno ajustado: usa investimento total (sem financiamento) como base
  const retornoTotal = investimentoTotal > 0 ? Math.round((lucroLiquidoInvestidor / investimentoTotal) * 1000) / 10 : 0
  const retornoAnualizado = meses > 0 ? Math.round((retornoTotal * 12 / meses) * 10) / 10 : 0

  b.header('OPORTUNIDADE — CEDÊNCIA DE POSIÇÃO CONTRATUAL')
  b.simpleTable([
    { label: 'Imóvel', value: im.nome },
    { label: 'Localização', value: localizacaoTexto(im, { completo: true }) },
    { label: 'Tipologia', value: im.tipologia || '—' },
    { label: 'Área Bruta', value: im.area_bruta ? `${im.area_bruta} m²` : '—' },
    { label: 'Modelo', value: 'Cedência de Posição (Wholesaling)' },
    { label: 'Prazo Estimado', value: `${meses} meses` },
  ])
  b.space(3)

  b.header('SUMÁRIO EXECUTIVO')
  b.bigNumbers([
    { label: 'Investimento Total', value: EUR(investimentoTotal), sub: 'Tudo incluído' },
    { label: 'Lucro Líquido Estimado', value: EUR(lucroLiquidoInvestidor), sub: 'Após comissão Somnium' },
    { label: 'Retorno Anualizado', value: PCT(retornoAnualizado), sub: `base ${meses} meses` },
  ])
  b.space(2)
  b.bigNumbers([
    { label: 'VVR — Valor de Venda', value: EUR(vvr) },
    { label: 'Retorno Total', value: PCT(retornoTotal) },
    { label: 'Payback', value: meses ? `${meses} meses` : '—', sub: 'Recuperação no exit' },
  ])
  b.space(4)

  b.header('SOBRE A OPERAÇÃO')
  const tipoDesc = im.tipologia ? `um ${im.tipologia}` : 'um imóvel'
  const areaDesc = im.area_bruta ? ` com ${im.area_bruta} m² de área bruta` : ''
  b.textBlock(
    `A Somnium Properties detém uma posição contratual já garantida sobre ${tipoDesc}${areaDesc}, localizado${localizacaoTexto(im)}. ` +
    `Por via de cedência de posição contratual, o investidor passa a assumir integralmente o controlo e a responsabilidade pela operação, incluindo escritura, obra, detenção e venda. ` +
    `A intervenção da Somnium termina no momento da cedência. A nossa remuneração corresponde exclusivamente a 10% do lucro líquido expectável, liquidada nesse acto.`
  )
  b.space(4)

  if (fotos.length > 0) { b.photos(fotos, 'O IMÓVEL'); b.space(2) }
  if (im._localizacaoImgData) { b.newPage(); b.localizacao() }
  if (im.pontos_fortes || im.pontos_fracos || im.riscos) { b.pontosFortesFracosRiscos() }
  if (im.mitigacao_riscos) { b.space(2); b.riscosMitigacao() }

  // Estudo de comparaveis compacto (igual ao dossier_investidor)
  try {
    let __comps = a.comparaveis
    if (typeof __comps === 'string') { try { __comps = JSON.parse(__comps || 'null') } catch { __comps = null } }
    const __tipologias = Array.isArray(__comps) ? __comps : (__comps?.tipologias || [])
    const __hasValid = __tipologias.some(t => (t?.comparaveis || []).some(c => parseFloat(c?.preco) > 0 && parseFloat(c?.area) > 0))
    const __temAlfredo = !!a._alfredoImgData
    if (__hasValid || __temAlfredo) {
      renderEstudoComparaveis(b, im, a, { compactMode: true })
    }
  } catch (e) {
    console.error('[cedencia] estudo de comparaveis falhou:', e.message)
  }

  b.newPage()
  b.header('ESTRUTURA FINANCEIRA DA OPERAÇÃO')
  b.subheader('Custos para o Investidor')
  b.simpleTable([
    { label: 'Valor da Cedência da Posição (todo o custo de aquisição)', value: EUR(totalAquisicao) },
    { label: 'Obra com IVA', value: EUR(obra) },
    { label: `Detenção (${meses} meses)`, value: EUR(detencao) },
    { label: 'Comissão Imobiliária (venda)', value: EUR(comissaoVenda) },
    { label: 'Comissão Somnium (10% sobre Lucro Líquido)', value: EUR(comissaoSomnium) },
    { label: 'Investimento Total', value: EUR(investimentoTotal), total: true },
  ])
  b.space(3)

  b.subheader('Resultado para o Investidor')
  b.simpleTable([
    { label: 'Valor de Venda Alvo (VVR)', value: EUR(vvr) },
    { label: 'Lucro Bruto Estimado', value: EUR(lucroBrutoOriginal) },
    { label: `Impostos (${deal.regime_fiscal || 'Empresa'})`, value: EUR(deal.impostos) },
    { label: 'Lucro Líquido Estimado', value: EUR(lucroLiquidoOriginal) },
    { label: '(−) Comissão Somnium (10%)', value: `−${EUR(comissaoSomnium)}` },
    { label: 'Lucro Líquido para o Investidor', value: EUR(lucroLiquidoInvestidor), total: true },
  ])
  b.space(3)

  b.bigNumbers([
    { label: 'Retorno Total', value: PCT(retornoTotal) },
    { label: 'Retorno Anualizado', value: PCT(retornoAnualizado) },
    { label: 'Lucro por Mês', value: meses > 0 ? `${EUR_S(Math.round(lucroLiquidoInvestidor / meses))}/mês` : '—' },
  ])
  b.space(4)

  b.note(`Pressupostos: Cessão de posição contratual (artigo 424.º CC). Regime fiscal: ${deal.regime_fiscal || 'Empresa'}. Prazo: ${meses} meses. Comissão Somnium liquidada como parte do investimento total no momento da cedência.`)

  b.newPage()
  b.header('ENQUADRAMENTO LEGAL — CEDÊNCIA DE POSIÇÃO')
  b.textBlock(
    'A Cedência de Posição Contratual está prevista nos artigos 424.º a 427.º do Código Civil Português. ' +
    'A Somnium Properties, na qualidade de promitente-compradora, cede ao investidor a sua posição contratual no contrato-promessa de compra e venda, transferindo todos os direitos e obrigações dela emergentes. ' +
    'A partir da cedência, o investidor assume integralmente a operação, sem qualquer intervenção operacional, técnica ou comercial da Somnium. ' +
    'O trabalho prévio de identificação, negociação e estruturação do negócio já realizado pela Somnium constitui o objecto da remuneração de 10% do lucro líquido expectável.'
  )
  b.space(3)
  b.simpleTable([
    { label: 'Posição Cedida', value: 'Promitente-comprador no CPCV' },
    { label: 'Responsabilidade pela escritura', value: 'Investidor' },
    { label: 'Gestão de Obra', value: 'Investidor (sem envolvimento da Somnium)' },
    { label: 'Detenção, licenciamento e venda', value: 'Investidor' },
    { label: 'Intervenção da Somnium após a cedência', value: 'Nenhuma' },
    { label: 'Comissão Somnium', value: '10% sobre Lucro Líquido Expectável' },
    { label: 'Momento de liquidação da comissão', value: 'Na escritura de cedência' },
  ])
  b.space(4)

  // Pressupostos e glossario partilhados
  try {
    renderAssumptionsAndGlossary(b, deal)
  } catch (e) {
    console.error('[cedencia] glossario falhou:', e.message)
  }

  b.space(3)
  b.note('Os valores apresentados são estimativas conservadoras baseadas em análise de mercado e podem variar. A Somnium Properties utiliza stress tests automáticos para protecção do investidor. Investimento imobiliário envolve risco de capital.')
}

function renderFichaDescarte(b, im) {
  b.header('DADOS DO IMÓVEL')
  b.simpleTable([
    { label: 'Nome / Referência', value: im.nome },
    { label: 'Zona', value: im.zona },
    { label: 'Tipologia', value: im.tipologia },
    { label: 'Ask Price', value: EUR(im.ask_price) },
    { label: 'Valor Proposta', value: EUR(im.valor_proposta) },
    { label: 'Modelo de Negócio', value: im.modelo_negocio },
    { label: 'Origem', value: im.origem },
    { label: 'Consultor', value: im.nome_consultor },
  ])
  b.space(4)

  b.header('MOTIVO DO DESCARTE')
  b.bigNumbers([
    { label: 'Motivo', value: im.motivo_descarte || 'Não especificado' },
  ])
  b.space(4)

  b.header('TIMELINE')
  b.simpleTable([
    { label: 'Data Adicionado', value: FDATE(im.data_adicionado || im.created_at) },
    { label: 'Data da Chamada', value: FDATE(im.data_chamada) },
    { label: 'Data da Visita', value: FDATE(im.data_visita) },
    { label: 'Data de Descarte', value: NOW() },
  ])
  b.space(4)

  b.header('VALORES FINANCEIROS (NA DATA DE DESCARTE)')
  b.simpleTable([
    { label: 'Ask Price', value: EUR(im.ask_price) },
    { label: 'VVR Estimado', value: EUR(im.valor_venda_remodelado) },
    { label: 'Custo Estimado Obra', value: EUR(im.custo_estimado_obra) },
    { label: 'ROI Estimado', value: PCT(im.roi) },
  ])
  b.space(4)

  if (im.notas) {
    b.header('NOTAS')
    b.textBlock(im.notas)
    b.space(4)
  }
}

// ══════════════════════════════════════════════════════════════
// DOCUMENT GENERATORS — capa especifica + render + disclaimer
// ══════════════════════════════════════════════════════════════

// Checklist documental por tipo de imóvel (espelha documentacao.config.js no frontend).
// Chaves comparáveis entre documentos (espelha documentacao.config.js no frontend).
const DADOS_CHAVE_LABELS = {
  morada: 'Morada', freguesia: 'Freguesia', concelho: 'Concelho',
  artigo_matricial: 'Artigo matricial', fracao: 'Fracção', area: 'Área',
  vpt: 'VPT', titular: 'Titular', data_documento: 'Data do documento', validade: 'Validade',
}
const CHAVES_NUMERICAS_DOC = new Set(['area', 'vpt'])

function normTextoDoc(v) {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
function normNumeroDoc(v) {
  const s = String(v ?? '').replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

// Cruza os dados_chave de todas as análises e devolve as divergências.
function detectarInconsistenciasDoc(analises) {
  const lista = Array.isArray(analises) ? analises : []
  const out = []
  for (const chave of Object.keys(DADOS_CHAVE_LABELS)) {
    const numerica = CHAVES_NUMERICAS_DOC.has(chave)
    const ocorrencias = []
    for (const a of lista) {
      const bruto = a?.dados_chave?.[chave]
      if (bruto == null || String(bruto).trim() === '') continue
      const origem = a.tipo_documento || a.nome_ficheiro || 'Documento'
      if (numerica) {
        const n = normNumeroDoc(bruto)
        if (n == null) continue
        ocorrencias.push({ norm: n, valor: String(bruto), origem })
      } else {
        const norm = normTextoDoc(bruto)
        if (!norm) continue
        ocorrencias.push({ norm, valor: String(bruto), origem })
      }
    }
    if (ocorrencias.length < 2) continue
    let divergente = false
    if (numerica) {
      const nums = ocorrencias.map(o => o.norm)
      const min = Math.min(...nums), max = Math.max(...nums)
      const tol = Math.max(1, max * 0.01)
      divergente = (max - min) > tol
    } else {
      divergente = new Set(ocorrencias.map(o => o.norm)).size > 1
    }
    if (divergente) {
      const vistos = new Set(); const valores = []
      for (const o of ocorrencias) {
        const k = `${o.valor}|${o.origem}`
        if (vistos.has(k)) continue
        vistos.add(k); valores.push({ valor: o.valor, origem: o.origem })
      }
      out.push({ chave, label: DADOS_CHAVE_LABELS[chave], valores })
    }
  }
  return out
}

// Relatório consolidado da documentação importada e analisada por IA.
function renderRelatorioDocumental(b, im) {
  const COR = { validado: C.green, warning: '#b5651d', erro: C.red }
  let analises = im?.documentacao_analise
  if (typeof analises === 'string') { try { analises = JSON.parse(analises) } catch { analises = [] } }
  if (!Array.isArray(analises)) analises = []

  const estadoDoc = (a) => {
    if (a.valido === true) return { txt: 'Válido', cor: COR.validado }
    if (a.valido === 'warning') return { txt: 'Com alertas', cor: COR.warning }
    return { txt: 'Problema', cor: COR.erro }
  }

  // Todas as flags com o documento de origem, ordenadas por severidade.
  const rank = { critical: 0, warning: 1, info: 2 }
  const flags = []
  for (const a of analises) {
    for (const f of (a.flags || [])) flags.push({ ...f, origem: a.tipo_documento || a.nome_ficheiro || 'Documento' })
  }
  flags.sort((x, y) => (rank[x.severity] ?? 3) - (rank[y.severity] ?? 3))

  const inconsistencias = detectarInconsistenciasDoc(analises)
  const temCritica = flags.some(f => f.severity === 'critical')
  const problemas = analises.filter(a => a.valido !== true && a.valido !== 'warning').length
  const alertas = analises.filter(a => a.valido === 'warning').length
  const temAlerta = flags.some(f => f.severity === 'warning') || alertas > 0
  const temBloqueio = temCritica || problemas > 0 || inconsistencias.length > 0

  // ── Contagens ──
  b.bigNumbers([
    { label: 'Documentos analisados', value: String(analises.length), valueColor: C.gold },
    { label: 'Red Flags', value: String(flags.length), valueColor: temCritica ? C.red : (flags.length ? C.gold : C.green) },
    { label: 'Inconsistências', value: String(inconsistencias.length), valueColor: inconsistencias.length ? C.red : C.green },
  ])
  b.space(4)

  // ── Conclusão automática ──
  if (analises.length === 0) {
    b.verdict('CONCLUSÃO: Ainda não foi analisado nenhum documento para este imóvel.', false)
  } else if (temBloqueio) {
    b.verdict('CONCLUSÃO: Existem problemas a resolver — flags críticas, documentos inválidos ou inconsistências entre documentos.', false)
  } else if (temAlerta) {
    b.verdict('CONCLUSÃO: Há alertas a verificar na documentação antes de avançar.', false)
  } else {
    b.verdict('CONCLUSÃO: Documentação analisada sem problemas detectados.', true)
  }
  b.space(2)

  // ── Inconsistências entre documentos ──
  if (inconsistencias.length) {
    b.header('INCONSISTÊNCIAS ENTRE DOCUMENTOS')
    inconsistencias.forEach(inc => {
      b.ensure(40)
      b.text(`${inc.label} divergente entre documentos`, { size: 9, color: C.red })
      inc.valores.forEach(v => b.note(`${v.valor} · ${v.origem}`))
      b.space(2)
    })
    b.space(2)
  }

  // ── Tabela de estado por documento ──
  b.header('ESTADO DOS DOCUMENTOS')
  if (analises.length === 0) {
    b.note('Sem documentos analisados.')
  } else {
    b.colTable(
      [['DOCUMENTO', 200], ['ESTADO', 110], ['OBSERVAÇÕES', 175]],
      analises.map(a => {
        const est = estadoDoc(a)
        const nFlags = a?.flags?.length || 0
        const obs = nFlags
          ? `${nFlags} flag${nFlags > 1 ? 's' : ''}${a.flags.some(f => f.severity === 'critical') ? ' (crítica)' : ''}`
          : 'Sem flags'
        return { _values: [
          a.tipo_documento || a.nome_ficheiro || '—',
          { value: est.txt, color: est.cor },
          obs,
        ] }
      })
    )
  }

  // ── Red flags ──
  if (flags.length) {
    b.space(4)
    b.header('RED FLAGS')
    const sevLabel = { critical: 'CRÍTICO', warning: 'ALERTA', info: 'INFO' }
    const sevCor = { critical: C.red, warning: COR.warning, info: C.muted }
    flags.forEach(f => {
      b.ensure(40)
      const titulo = `[${sevLabel[f.severity] || 'INFO'}] ${f.titulo || ''} · ${f.origem}`
      b.text(titulo, { size: 9, color: sevCor[f.severity] || C.body })
      if (f.descricao) b.note(f.descricao)
      b.space(2)
    })
  }

  // ── Análise por documento (campos + resumo) ──
  b.space(4)
  b.header('ANÁLISE POR DOCUMENTO')
  if (analises.length === 0) {
    b.note('Ainda não foi analisado nenhum documento para este imóvel.')
  }
  analises.forEach(a => {
    b.subheader(a.tipo_documento || a.nome_ficheiro || 'Documento')
    if (Array.isArray(a.campos) && a.campos.length) {
      a.campos.slice(0, 6).forEach(c => b.row(c.label || '—', c.valor || '—'))
    }
    if (a.resumo) b.text(a.resumo, { size: 8.5 })
    if (Array.isArray(a.pontos_verificar) && a.pontos_verificar.length) {
      a.pontos_verificar.forEach(p => b.bullet(p))
    }
    b.space(4)
  })
}

const GENERATORS = {
  ficha_imovel: (im) => {
    const b = new DocBuilder('Ficha do Imóvel', im.zona || '', im)
    renderFichaImovel(b, im)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  ficha_visita: (im, analise) => {
    const b = new DocBuilder('Ficha de Visita', `${im.zona || ''} · ${im.tipologia || ''}`, im)
    renderFichaVisita(b, im, analise)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  analise_rentabilidade: (im, analise) => {
    const b = new DocBuilder('Análise de Rentabilidade', im.zona || '', im)
    renderAnaliseRentabilidade(b, im, analise || {})
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  estudo_comparaveis: (im, analise) => {
    const b = new DocBuilder('Estudo de Mercado — Comparáveis', im.zona || '', im)
    renderEstudoComparaveis(b, im, analise || {})
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  proposta_formal: (im) => {
    const b = new DocBuilder('Proposta ao Proprietário', im.zona || '', im)
    renderPropostaFormal(b, im)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  dossier_investidor: (im, analise) => {
    const a = analise || {}
    const b = new DocBuilder('Dossier de Investimento', `Oportunidade · ${im.zona || ''}`, im, {
      style: 'investor',
      withIndex: true,
      heroItems: [
        { label: 'Capital Necessário', value: EUR(a.capital_necessario), sub: a.meses ? `Hold ${a.meses} meses` : '' },
        { label: 'Lucro Líquido',      value: EUR(a.lucro_liquido) },
        { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
      ],
    })
    try {
      renderDossierInvestidor(b, im, a)
    } catch (e) {
      console.error('[GENERATORS.dossier_investidor] falhou:', e.message, '\n', e.stack)
      try {
        b.header('AVISO')
        b.note(`Nao foi possivel gerar todas as seccoes deste Dossier devido a um erro tecnico (${e.message}). Contacte a Somnium Properties para a versao completa.`)
      } catch {}
    }
    b.disclaimer()
    b.applyIndex()
    b.applyFooter()
    return b.end()
  },

  resumo_negociacao: (im) => {
    const b = new DocBuilder('Resumo de Negociação', im.zona || '', im)
    renderResumoNegociacao(b, im)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  ficha_follow_up: (im) => {
    const b = new DocBuilder('Ficha de Follow Up', im.zona || '', im)
    renderFichaFollowUp(b, im)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  // ══════════════════════════════════════════════════════════════
  // RELATÓRIOS PARA INVESTIDOR (estilo limpo, arejado)
  // ══════════════════════════════════════════════════════════════

  relatorio_investimento: (im, an) => {
    const a = an || {}
    const b = new DocBuilder('Análise de Investimento', im.zona || '', im, {
      style: 'investor',
      heroItems: [
        { label: 'Lucro Líquido',      value: EUR(a.lucro_liquido) },
        { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado) },
        { label: 'Capital Necessário', value: EUR(a.capital_necessario) },
      ],
    })
    renderRelatorioInvestimento(b, im, a)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  relatorio_comparaveis: (im, an) => {
    const b = new DocBuilder('Estudo de Mercado', im.zona || '', im)
    renderRelatorioComparaveis(b, im, an)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  relatorio_caep: (im, an) => {
    const b = new DocBuilder('Parceria CAEP — Distribuição de Lucro', im.zona || '', im)
    renderRelatorioCaep(b, im, an)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  relatorio_stress: (im, an) => {
    const b = new DocBuilder('Análise de Risco', im.zona || '', im)
    renderRelatorioStress(b, im, an)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  proposta_investimento_anonima: (im, analise) => {
    const a = analise || {}
    const meses = a.meses || 6
    const b = new DocBuilder('Proposta de Investimento', '', {
      ...im,
      nome: 'OPORTUNIDADE DE INVESTIMENTO',
      zona: im.zona ? `Zona de ${im.zona}` : distritoDoImovel(im),
    }, {
      style: 'investor',
      heroItems: [
        { label: 'Retorno Anualizado', value: PCT(a.retorno_anualizado), sub: `Base ${meses} meses` },
        { label: 'Lucro Líquido',      value: EUR(a.lucro_liquido) },
        { label: 'Capital Necessário', value: EUR(a.capital_necessario) },
      ],
    })
    renderPropostaInvestimentoAnonima(b, im, a)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  proposta_cedencia_posicao: (im, analise) => {
    const a = analise || {}
    const meses = a.meses || 6
    const lucroLiq = a.lucro_liquido || 0
    const comissaoSomnium = Math.round(lucroLiq * 0.10)
    const lucroInvestidor = lucroLiq - comissaoSomnium
    const b = new DocBuilder('Proposta de Cedência de Posição', `Oportunidade · ${im.zona || ''}`, im, {
      style: 'investor',
      withIndex: true,
      heroItems: [
        { label: 'Lucro Líquido (Investidor)', value: EUR(lucroInvestidor), sub: 'Após 10% Somnium' },
        { label: 'Prazo Estimado', value: `${meses} meses` },
        { label: 'Comissão Somnium', value: EUR(comissaoSomnium), sub: '10% do lucro líquido' },
      ],
    })
    try {
      renderPropostaCedenciaPosicao(b, im, a)
    } catch (e) {
      console.error('[GENERATORS.proposta_cedencia_posicao] falhou:', e.message, '\n', e.stack)
      try {
        b.header('AVISO')
        b.note(`Nao foi possivel gerar todas as seccoes desta Proposta de Cedencia devido a um erro tecnico (${e.message}). Contacte a Somnium Properties para a versao completa.`)
      } catch {}
    }
    b.disclaimer()
    b.applyIndex()
    b.applyFooter()
    return b.end()
  },

  ficha_descarte: (im) => {
    const b = new DocBuilder('Ficha de Descarte', im.zona || '', im)
    renderFichaDescarte(b, im)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },

  relatorio_documental: (im) => {
    const b = new DocBuilder('Relatório Documental', im.zona || '', im)
    renderRelatorioDocumental(b, im)
    b.disclaimer()
    b.applyFooter()
    return b.end()
  },
}

// ══════════════════════════════════════════════════════════════
// RENDERERS — mapa de seccao → render(b, im, a) usado pelo
// generateCompiledReport para combinar varias seccoes inline.
// ══════════════════════════════════════════════════════════════

const RENDERERS = {
  ficha_imovel: renderFichaImovel,
  ficha_visita: renderFichaVisita,
  analise_rentabilidade: renderAnaliseRentabilidade,
  estudo_comparaveis: renderEstudoComparaveis,
  proposta_formal: renderPropostaFormal,
  dossier_investidor: renderDossierInvestidor,
  proposta_investimento_anonima: renderPropostaInvestimentoAnonima,
  proposta_cedencia_posicao: renderPropostaCedenciaPosicao,
  resumo_negociacao: renderResumoNegociacao,
  ficha_follow_up: renderFichaFollowUp,
  ficha_descarte: renderFichaDescarte,
  // Aliases compativeis com o formato antigo
  investimento: renderRelatorioInvestimento,
  comparaveis: renderRelatorioComparaveis,
  caep: renderRelatorioCaep,
  stress_tests: renderRelatorioStress,
}

// Mapa de chave compilavel → nome do GENERATOR (usado para
// despachar 1-seccao para o gerador completo, com a sua capa).
const COMPILAVEL_TO_GENERATOR = {
  investimento: 'relatorio_investimento',
  comparaveis: 'relatorio_comparaveis',
  caep: 'relatorio_caep',
  stress_tests: 'relatorio_stress',
}

// Seccoes que mostram a imagem de localizacao (precisam preload async)
const SECCOES_COM_LOCALIZACAO = new Set([
  'dossier_investidor', 'proposta_investimento_anonima', 'proposta_cedencia_posicao', 'investimento',
])

// Seccoes que mostram o orçamento detalhado (precisam preload do
// orcamentos_obra, vide preloadOrcamentoObra).
const SECCOES_COM_ORCAMENTO_OBRA = new Set([
  'dossier_investidor', 'proposta_investimento_anonima', 'proposta_cedencia_posicao',
])

// Seccoes cujos renderers mostram a galeria de fotografias do imóvel
// (precisam preload das fotos como buffers, vide preloadFotosGaleria).
const SECCOES_COM_GALERIA = new Set([
  'dossier_investidor', 'proposta_cedencia_posicao',
])

// Gera um PDF compilado para investidor. Quando ha apenas uma
// seccao, devolve o gerador completo (com a sua capa especifica).
// Para multiplas, faz capa "Dossier" + render inline de cada
// seccao via RENDERERS, separadas por newPage.
export async function generateCompiledReport(imovel, analise, seccoes = []) {
  // 1-seccao: delega no generateDoc (async, ja faz preloadLocalizacao
  // para tipos investidor) — capa especifica + comportamento consistente.
  if (seccoes.length === 1) {
    const tipo = COMPILAVEL_TO_GENERATOR[seccoes[0]] || seccoes[0]
    if (GENERATORS[tipo]) return generateDoc(tipo, imovel, analise)
  }

  // Multi-seccao: pre-carrega localizacao se alguma seccao a usa, para
  // que o renderer sincrono ja receba o buffer de imagem em memoria.
  const precisaLocalizacao = seccoes.some(s => SECCOES_COM_LOCALIZACAO.has(s))
  const precisaOrcamento = seccoes.some(s => SECCOES_COM_ORCAMENTO_OBRA.has(s))
  const precisaGaleria = seccoes.some(s => SECCOES_COM_GALERIA.has(s))
  let im = precisaLocalizacao ? await preloadLocalizacao(imovel) : imovel
  if (precisaOrcamento) im = await preloadOrcamentoObra(im)
  if (precisaGaleria) im = await preloadFotosGaleria(im)

  const b = new DocBuilder('Dossier de Investimento', im.zona || '', im)
  const an = analise || {}
  let hasContent = false
  for (const seccao of seccoes) {
    const render = RENDERERS[seccao]
    if (!render) continue
    if (hasContent) b.newPage()
    hasContent = true
    render(b, im, an)
  }
  if (!hasContent) b.text('Nenhuma secção com dados disponíveis para compilar.')
  b.disclaimer()
  b.applyFooter()
  return b.end()
}

