// @ts-nocheck
/**
 * Contabilidade — agrega todas as faturas anexadas no CRM num único sítio
 * (aba Financeiro › Contabilidade) e exporta um ZIP para entregar à contabilidade.
 *
 * Fontes:
 *  - despesas.documentos (JSON)  → Financeiro › Despesas e Projecto › Faturas
 *  - projeto_documentos tipo 'fatura' → Projecto › Documentos
 *
 * Período filtrado pela data da despesa (projeto_documentos não tem data de
 * despesa: usa a data de carregamento).
 *
 * Port de src/db/contabilidade.js (manter em paralelo). Em produção só há
 * ficheiros no Supabase Storage (sem /uploads local).
 */
import { zipSync } from 'fflate'
import ExcelJS from 'exceljs'
import pool from './pg.ts'

let colunasOk = false
async function ensureColunas() {
  if (colunasOk) return
  await pool.query(`
    ALTER TABLE despesas ADD COLUMN IF NOT EXISTS enviada_contabilidade_em TIMESTAMPTZ;
    ALTER TABLE projeto_documentos ADD COLUMN IF NOT EXISTS enviada_contabilidade_em TIMESTAMPTZ;
  `)
  colunasOk = true
}

function valorDespesa(d) {
  const mensal = Number(d.custo_mensal) || 0
  const anual = Number(d.custo_anual) || 0
  if (d.timing === 'Anual') return anual || mensal
  return mensal || anual
}

function parseDocs(raw) {
  if (!raw) return []
  try { const v = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(v) ? v : [] } catch { return [] }
}

/**
 * @param {{de: string, ate: string, pendentes?: boolean}} opts  datas YYYY-MM-DD
 * @returns {{faturas: object[], semFatura: object[]}}
 */
export async function listarFaturas({ de, ate, pendentes = false }) {
  await ensureColunas()
  const faturas = []
  const semFatura = []

  const { rows: despesas } = await pool.query(
    `SELECT d.id, d.movimento, d.categoria, d.data, d.custo_mensal, d.custo_anual, d.timing,
            d.fornecedor, d.pago, d.documentos, d.negocio_id, d.enviada_contabilidade_em,
            n.movimento AS negocio_nome, i.nome AS imovel_nome
       FROM despesas d
       LEFT JOIN negocios n ON d.negocio_id = n.id
       LEFT JOIN imoveis i ON n.imovel_id = i.id
      WHERE LEFT(d.data::text, 10) BETWEEN $1 AND $2
        AND ($3::boolean = false OR d.enviada_contabilidade_em IS NULL)
      ORDER BY d.data, d.movimento`,
    [de, ate, pendentes],
  )
  for (const d of despesas) {
    const base = {
      fonte: 'despesa',
      registo_id: d.id,
      origem: d.negocio_id ? 'Projecto' : 'Despesas',
      data: String(d.data).slice(0, 10),
      descricao: d.movimento,
      fornecedor: d.fornecedor || null,
      categoria: d.categoria || null,
      projeto: d.imovel_nome || d.negocio_nome || null,
      valor: valorDespesa(d),
      pago: !!d.pago,
      enviada_em: d.enviada_contabilidade_em || null,
    }
    const docs = parseDocs(d.documentos)
    if (!docs.length) { semFatura.push(base); continue }
    for (const doc of docs) {
      faturas.push({ ...base, id: `d:${d.id}:${doc.id}`, ficheiro: doc.name, url: doc.path, mime: doc.type || null })
    }
  }

  const { rows: docsProjeto } = await pool.query(
    `SELECT pd.id, pd.nome, pd.url, pd.mime, pd.notas, pd.created_at, pd.negocio_id, pd.enviada_contabilidade_em,
            n.movimento AS negocio_nome, i.nome AS imovel_nome
       FROM projeto_documentos pd
       LEFT JOIN negocios n ON pd.negocio_id = n.id
       LEFT JOIN imoveis i ON n.imovel_id = i.id
      WHERE pd.tipo = 'fatura'
        AND (pd.created_at AT TIME ZONE 'Europe/Lisbon')::date BETWEEN $1::date AND $2::date
        AND ($3::boolean = false OR pd.enviada_contabilidade_em IS NULL)
      ORDER BY pd.created_at`,
    [de, ate, pendentes],
  )
  for (const p of docsProjeto) {
    faturas.push({
      fonte: 'projeto_documento',
      registo_id: p.id,
      id: `p:${p.id}`,
      origem: 'Projecto · Documentos',
      data: new Date(p.created_at).toISOString().slice(0, 10),
      descricao: p.notas || String(p.nome).replace(/\.[a-zA-Z0-9]{2,5}$/, ''),
      fornecedor: null,
      categoria: null,
      projeto: p.imovel_nome || p.negocio_nome || null,
      valor: null,
      pago: null,
      enviada_em: p.enviada_contabilidade_em || null,
      ficheiro: p.nome,
      url: p.url,
      mime: p.mime || null,
    })
  }

  faturas.sort((a, b) => a.data.localeCompare(b.data) || String(a.descricao).localeCompare(String(b.descricao)))
  return { faturas, semFatura }
}

/**
 * Marca registos como entregues à contabilidade.
 * @param {{despesaIds?: string[], documentoIds?: string[]}} ids
 */
export async function marcarEnviadas(ids) {
  const despesaIds = ids.despesaIds || []
  const documentoIds = ids.documentoIds || []
  await ensureColunas()
  if (despesaIds.length) {
    await pool.query(`UPDATE despesas SET enviada_contabilidade_em = NOW() WHERE id = ANY($1::text[])`, [despesaIds])
  }
  if (documentoIds.length) {
    await pool.query(`UPDATE projeto_documentos SET enviada_contabilidade_em = NOW() WHERE id = ANY($1::text[])`, [documentoIds])
  }
  return { despesas: despesaIds.length, documentos: documentoIds.length }
}

// Só ficheiros guardados pelo próprio CRM no Supabase Storage.
async function lerFicheiro(url) {
  if (!url) throw new Error('sem caminho')
  if (url.startsWith('/uploads/')) throw new Error('ficheiro local antigo (dev)')
  const u = new URL(url)
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.supabase.co')) throw new Error('origem não permitida')
  const res = await fetch(u)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

function limparNome(s, max = 60) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max) || 'Fatura'
}

function extensao(f) {
  const m = String(f.ficheiro || f.url || '').match(/\.([a-zA-Z0-9]{2,5})(?:\?.*)?$/)
  return m ? m[1].toLowerCase() : 'pdf'
}

function valorNome(v) {
  return v == null ? '' : `_${Number(v).toFixed(2).replace('.', ',')}EUR`
}

/**
 * Gera o ZIP: <AAAA-MM>/<data>_<descricao>_<valor>.ext + Resumo.xlsx.
 * @returns {{buffer: Uint8Array, fileName: string, total: number, emFalta: number}}
 */
export async function exportarZip({ de, ate, pendentes = false }) {
  const { faturas, semFatura } = await listarFaturas({ de, ate, pendentes })
  const entradas = {}
  const usados = new Set()
  const porHash = new Map() // mesmo ficheiro anexado em dois sítios → entra uma vez
  const linhas = []

  // Despesas primeiro: em duplicados fica o nome com valor.
  const ordem = [...faturas].sort((a, b) => (a.fonte === 'despesa' ? 0 : 1) - (b.fonte === 'despesa' ? 0 : 1))
  for (const f of ordem) {
    const base = `${f.data.slice(0, 7)}/${f.data}_${limparNome(f.descricao)}${valorNome(f.valor)}`
    let nome = `${base}.${extensao(f)}`
    for (let n = 2; usados.has(nome); n++) nome = `${base}_${n}.${extensao(f)}`
    let erro = null
    let duplicado = null
    try {
      const bytes = await lerFicheiro(f.url)
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', bytes)))
        .map(b => b.toString(16).padStart(2, '0')).join('')
      duplicado = porHash.get(hash) || null
      if (!duplicado) {
        entradas[nome] = [bytes, { level: 0 }]
        usados.add(nome)
        porHash.set(hash, nome)
      }
    } catch (e) {
      erro = e.message
    }
    linhas.push({ ...f, ficheiro_zip: erro ? '' : (duplicado || nome), erro, duplicado: !!duplicado })
  }

  linhas.sort((a, b) => a.data.localeCompare(b.data) || String(a.descricao).localeCompare(String(b.descricao)))
  entradas['Resumo.xlsx'] = new Uint8Array(await gerarResumo({ de, ate, linhas, semFatura }))
  const buffer = zipSync(entradas)
  return {
    buffer,
    fileName: `Faturas_Somnium_${de}_a_${ate}.zip`,
    total: linhas.filter(l => !l.erro && !l.duplicado).length,
    emFalta: linhas.filter(l => l.erro).length,
  }
}

async function gerarResumo({ de, ate, linhas, semFatura }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Somnium Properties CRM'

  const ws = wb.addWorksheet('Faturas')
  ws.columns = [
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Descrição', key: 'descricao', width: 40 },
    { header: 'Fornecedor', key: 'fornecedor', width: 24 },
    { header: 'Categoria', key: 'categoria', width: 16 },
    { header: 'Projecto / Imóvel', key: 'projeto', width: 28 },
    { header: 'Origem', key: 'origem', width: 20 },
    { header: 'Valor (€)', key: 'valor', width: 12 },
    { header: 'Pago', key: 'pago', width: 8 },
    { header: 'Ficheiro no ZIP', key: 'ficheiro_zip', width: 50 },
    { header: 'Observações', key: 'erro', width: 30 },
  ]
  for (const l of linhas) {
    ws.addRow({
      ...l,
      pago: l.pago == null ? '' : (l.pago ? 'Sim' : 'Não'),
      erro: l.erro ? `Ficheiro não incluído (${l.erro})` : (l.duplicado ? 'Mesmo ficheiro anexado noutro registo' : ''),
    })
  }
  ws.getColumn('valor').numFmt = '#,##0.00'
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  const total = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0)
  const rTotal = ws.addRow({ descricao: `Total (${de} a ${ate})`, valor: total })
  rTotal.font = { bold: true }

  if (semFatura.length) {
    const ws2 = wb.addWorksheet('Despesas sem fatura')
    ws2.columns = [
      { header: 'Data', key: 'data', width: 12 },
      { header: 'Descrição', key: 'descricao', width: 40 },
      { header: 'Fornecedor', key: 'fornecedor', width: 24 },
      { header: 'Projecto / Imóvel', key: 'projeto', width: 28 },
      { header: 'Valor (€)', key: 'valor', width: 12 },
    ]
    for (const s of semFatura) ws2.addRow(s)
    ws2.getColumn('valor').numFmt = '#,##0.00'
    ws2.getRow(1).font = { bold: true }
  }

  return wb.xlsx.writeBuffer()
}
