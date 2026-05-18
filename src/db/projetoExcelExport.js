/**
 * Export Excel completo de um projecto Fix and Flip.
 * Dossier numa folha: Resumo, Fases, Tarefas, Despesas, Investidores, Frações.
 */
import ExcelJS from 'exceljs'
import pool from './pg.js'

const GOLD = 'FFC9A84C'
const BLACK = 'FF0D0D0D'
const LIGHT = 'FFF9FAFB'

const EUR = v => Number(v) || 0

function headerStyle(ws, range) {
  ws.getCell(range).font = { bold: true, color: { argb: GOLD }, size: 11 }
  ws.getCell(range).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } }
  ws.getCell(range).alignment = { vertical: 'middle', horizontal: 'left' }
}

function tabelaHeader(ws, row, labels) {
  labels.forEach((label, i) => {
    const cell = ws.getCell(row, i + 1)
    cell.value = label
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = { bottom: { style: 'thin', color: { argb: GOLD } } }
  })
}

export async function exportProjetoExcel(negocioId) {
  const { rows: negs } = await pool.query('SELECT * FROM negocios WHERE id = $1', [negocioId])
  if (!negs.length) return null
  const negocio = negs[0]

  let imovel = null
  if (negocio.imovel_id) {
    const { rows } = await pool.query('SELECT * FROM imoveis WHERE id = $1', [negocio.imovel_id])
    imovel = rows[0] || null
  }

  const { rows: fases } = await pool.query('SELECT * FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem', [negocioId])
  const faseIds = fases.map(f => f.id)
  const tarefas = faseIds.length > 0
    ? (await pool.query('SELECT * FROM projeto_tarefas WHERE fase_id = ANY($1) ORDER BY fase_id, ordem', [faseIds])).rows
    : []
  const despesas = (await pool.query('SELECT * FROM despesas WHERE negocio_id = $1 ORDER BY data DESC NULLS LAST', [negocioId])).rows
  const { rows: invs } = await pool.query(
    `SELECT pi.capital, pi.percentagem, i.nome, i.email FROM projeto_investidores pi
     JOIN investidores i ON pi.investidor_id = i.id WHERE pi.negocio_id = $1`,
    [negocioId]
  )
  const { rows: fracoes } = await pool.query('SELECT * FROM projeto_fracoes WHERE negocio_id = $1 ORDER BY ordem', [negocioId])

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Somnium Properties'
  wb.created = new Date()

  // ── Sheet 1: Resumo ──
  const wsResumo = wb.addWorksheet('Resumo', { properties: { tabColor: { argb: GOLD } } })
  wsResumo.columns = [{ width: 30 }, { width: 60 }]
  wsResumo.mergeCells('A1:B1')
  wsResumo.getCell('A1').value = `SOMNIUM PROPERTIES — ${negocio.movimento}`
  headerStyle(wsResumo, 'A1')
  wsResumo.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
  wsResumo.getRow(1).height = 28

  const linhas = [
    ['Projecto', negocio.movimento],
    ['Categoria', negocio.categoria || '—'],
    ['Tipo de projecto', negocio.tipo_projeto === 'predio' ? 'Prédio com várias frações' : 'Fração única'],
    ['Fase legacy', negocio.fase || '—'],
    ['Imóvel', imovel?.nome || '—'],
    ['Zona', imovel?.zona || '—'],
    ['Tipologia', imovel?.tipologia || '—'],
    ['Data compra', negocio.data_compra || '—'],
    ['Venda estimada', negocio.data_estimada_venda || '—'],
    ['Data venda', negocio.data_venda || '—'],
    ['Faturação esperada', EUR(negocio.lucro_estimado)],
    ['Faturação real', EUR(negocio.lucro_real)],
    ['Capital total', EUR(negocio.capital_total)],
    ['Custo real obra', EUR(negocio.custo_real_obra)],
    ['Nº investidores', negocio.n_investidores || invs.length],
    ['Quota Somnium', `${negocio.quota_somnium || 0}%`],
    ['Notas', negocio.notas || '—'],
    ['', ''],
    ['Exportado em', new Date().toLocaleString('pt-PT')],
  ]
  let r = 3
  for (const [k, v] of linhas) {
    wsResumo.getCell(`A${r}`).value = k
    wsResumo.getCell(`A${r}`).font = { bold: true, color: { argb: BLACK } }
    wsResumo.getCell(`B${r}`).value = v
    if (typeof v === 'number') wsResumo.getCell(`B${r}`).numFmt = '#,##0 "€"'
    r++
  }

  // ── Sheet 2: Fases ──
  const wsFases = wb.addWorksheet('Fases')
  wsFases.columns = [
    { width: 6 }, { width: 30 }, { width: 14 }, { width: 12 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 50 },
  ]
  tabelaHeader(wsFases, 1, ['#', 'Nome', 'Estado', '% Execução', 'Início Prev.', 'Fim Prev.', 'Início Real', 'Fim Real', 'Orçamento (€)', 'Custo Real (€)', 'Notas'])
  fases.forEach((f, i) => {
    wsFases.addRow([
      f.ordem + 1, f.nome, f.estado, f.perc_execucao || 0,
      f.data_inicio_prevista || '', f.data_fim_prevista || '',
      f.data_inicio_real || '', f.data_fim_real || '',
      EUR(f.orcamento_alocado), EUR(f.custo_real),
      f.notas || ''
    ])
  })
  wsFases.getColumn(9).numFmt = '#,##0 "€"'
  wsFases.getColumn(10).numFmt = '#,##0 "€"'

  // ── Sheet 3: Tarefas ──
  const wsTarefas = wb.addWorksheet('Tarefas')
  wsTarefas.columns = [
    { width: 30 }, { width: 60 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 20 },
  ]
  tabelaHeader(wsTarefas, 1, ['Fase', 'Descrição', 'Concluída', 'Deadline', 'Concluída em', 'Responsável'])
  for (const t of tarefas) {
    const fase = fases.find(f => f.id === t.fase_id)
    wsTarefas.addRow([
      fase?.nome || '—',
      t.descricao,
      t.concluida ? 'Sim' : 'Não',
      t.deadline || '',
      t.concluida_em ? new Date(t.concluida_em).toLocaleDateString('pt-PT') : '',
      t.responsavel || '',
    ])
  }

  // ── Sheet 4: Despesas ──
  const wsDesp = wb.addWorksheet('Despesas')
  wsDesp.columns = [
    { width: 14 }, { width: 30 }, { width: 14 }, { width: 14 }, { width: 25 }, { width: 30 }, { width: 30 },
  ]
  tabelaHeader(wsDesp, 1, ['Data', 'Descrição', 'Valor (€)', 'Categoria', 'Fornecedor', 'Fase', 'Comprovativo'])
  let totalDesp = 0
  for (const d of despesas) {
    const fase = fases.find(f => f.id === d.fase_id)
    const valor = EUR(d.custo_mensal)
    totalDesp += valor
    wsDesp.addRow([
      d.data || '', d.movimento, valor,
      d.categoria || '', d.fornecedor || '',
      fase?.nome || (d.fase_id ? '—' : 'Geral'),
      d.comprovativo_nome || (d.comprovativo_url ? 'Anexado' : ''),
    ])
  }
  wsDesp.getColumn(3).numFmt = '#,##0.00 "€"'
  const linhaTotal = wsDesp.addRow(['', 'TOTAL', totalDesp])
  linhaTotal.font = { bold: true }
  linhaTotal.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
  linhaTotal.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }

  // ── Sheet 5: Investidores ──
  const wsInv = wb.addWorksheet('Investidores')
  wsInv.columns = [
    { width: 25 }, { width: 30 }, { width: 16 }, { width: 12 }, { width: 18 },
  ]
  tabelaHeader(wsInv, 1, ['Nome', 'Email', 'Capital (€)', '%', 'Distribuição estim. (€)'])
  const capitalTotal = invs.reduce((s, i) => s + (Number(i.capital) || 0), 0)
  const lucroEsperado = Number(negocio.lucro_estimado) || 0
  for (const inv of invs) {
    const pctCapital = capitalTotal > 0 ? (Number(inv.capital) || 0) / capitalTotal : 0
    const distribuicao = (Number(inv.capital) || 0) + (lucroEsperado * pctCapital)
    wsInv.addRow([inv.nome, inv.email || '', EUR(inv.capital), Number(inv.percentagem) || 0, distribuicao])
  }
  wsInv.getColumn(3).numFmt = '#,##0 "€"'
  wsInv.getColumn(4).numFmt = '0.0"%"'
  wsInv.getColumn(5).numFmt = '#,##0 "€"'

  // ── Sheet 6: Frações (se houver) ──
  if (fracoes.length > 0) {
    const wsFr = wb.addWorksheet('Frações e Áreas')
    wsFr.columns = [
      { width: 18 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 12 },
      { width: 14 }, { width: 14 }, { width: 20 }, { width: 14 },
    ]
    tabelaHeader(wsFr, 1, ['Nome', 'Tipo', 'Categoria', 'Tipologia', 'Andar', 'Área (m²)', 'Estado', 'Venda Esp. (€)', 'Venda Real (€)', 'Comprador'])
    for (const fr of fracoes) {
      wsFr.addRow([
        fr.nome,
        fr.tipo === 'area_comum' ? 'Área comum' : 'Fração',
        fr.categoria_comum || '',
        fr.tipologia || '',
        fr.andar || '',
        fr.area_m2 || '',
        fr.estado,
        EUR(fr.valor_venda_estimado),
        EUR(fr.valor_venda_real),
        fr.comprador || '',
      ])
    }
    wsFr.getColumn(8).numFmt = '#,##0 "€"'
    wsFr.getColumn(9).numFmt = '#,##0 "€"'
  }

  return { workbook: wb, filename: `${negocio.movimento.replace(/[^\w]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx` }
}
