/**
 * Excel Export — gera ficheiros Excel por departamento e faz upload para Google Drive.
 */
import ExcelJS from 'exceljs'
import pool from './pg.js'
import { google } from 'googleapis'
import { Readable } from 'stream'
import { getGoogleAuth } from './googleAuth.js'

const BRAND = { gold: 'C9A84C', dark: '0D0D0D', white: 'FFFFFF', light: 'F5F5F0', muted: '888888' }

function getDrive() {
  const auth = getGoogleAuth()
  if (!auth) return null
  return google.drive({ version: 'v3', auth })
}

function styleHeader(row) {
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.dark } }
    cell.font = { color: { argb: BRAND.white }, bold: true, size: 11 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: BRAND.gold } } }
  })
  row.height = 28
}

function styleRows(sheet) {
  sheet.eachRow((row, idx) => {
    if (idx === 1) return
    row.eachCell(cell => {
      cell.font = { size: 10 }
      cell.alignment = { vertical: 'middle', wrapText: true }
      if (idx % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.light.replace('#', '') } }
      }
    })
  })
}

function fmt(v) { return v == null ? '' : v }
function fmtEur(v) { return v == null ? '' : Number(v) }
function fmtDate(v) { return v ? new Date(v).toLocaleDateString('pt-PT') : '' }

// ── Comercial ──────────────────────────────────────────────
async function exportComercial() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Somnium Properties CRM'

  // Imoveis
  const { rows: imoveis } = await pool.query('SELECT * FROM imoveis ORDER BY created_at DESC')
  const si = wb.addWorksheet('Imóveis')
  si.columns = [
    { header: 'Nome', key: 'nome', width: 30 },
    { header: 'Estado', key: 'estado', width: 22 },
    { header: 'Zona', key: 'zona', width: 20 },
    { header: 'Tipologia', key: 'tipologia', width: 12 },
    { header: 'Ask Price', key: 'ask_price', width: 15 },
    { header: 'VVR', key: 'vvr', width: 15 },
    { header: 'ROI', key: 'roi', width: 10 },
    { header: 'Modelo', key: 'modelo_negocio', width: 18 },
    { header: 'Consultor', key: 'nome_consultor', width: 20 },
    { header: 'Origem', key: 'origem', width: 15 },
    { header: 'Adicionado', key: 'data_adicionado', width: 14 },
  ]
  styleHeader(si.getRow(1))
  for (const r of imoveis) {
    si.addRow({
      nome: fmt(r.nome), estado: fmt(r.estado), zona: fmt(r.zona),
      tipologia: fmt(r.tipologia), ask_price: fmtEur(r.ask_price),
      vvr: fmtEur(r.vvr), roi: r.roi ? Number(r.roi) : '',
      modelo_negocio: fmt(r.modelo_negocio), nome_consultor: fmt(r.nome_consultor),
      origem: fmt(r.origem), data_adicionado: fmtDate(r.data_adicionado),
    })
  }
  si.getColumn('ask_price').numFmt = '#,##0 €'
  si.getColumn('vvr').numFmt = '#,##0 €'
  si.getColumn('roi').numFmt = '0.0%'
  styleRows(si)

  // Investidores
  const { rows: investidores } = await pool.query('SELECT * FROM investidores ORDER BY created_at DESC')
  const sinv = wb.addWorksheet('Investidores')
  sinv.columns = [
    { header: 'Nome', key: 'nome', width: 25 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Classificação', key: 'classificacao', width: 15 },
    { header: 'Capital Máx', key: 'capital_max', width: 15 },
    { header: 'Estratégia', key: 'estrategia', width: 18 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Telemóvel', key: 'telemovel', width: 15 },
    { header: 'Origem', key: 'origem', width: 15 },
    { header: '1º Contacto', key: 'data_primeiro_contacto', width: 14 },
    { header: 'Último Contacto', key: 'data_ultimo_contacto', width: 14 },
  ]
  styleHeader(sinv.getRow(1))
  for (const r of investidores) {
    sinv.addRow({
      nome: fmt(r.nome), status: fmt(r.status), classificacao: fmt(r.classificacao),
      capital_max: fmtEur(r.capital_max), estrategia: fmt(r.estrategia),
      email: fmt(r.email), telemovel: fmt(r.telemovel), origem: fmt(r.origem),
      data_primeiro_contacto: fmtDate(r.data_primeiro_contacto),
      data_ultimo_contacto: fmtDate(r.data_ultimo_contacto),
    })
  }
  sinv.getColumn('capital_max').numFmt = '#,##0 €'
  styleRows(sinv)

  // Consultores
  const { rows: consultores } = await pool.query('SELECT * FROM consultores ORDER BY created_at DESC')
  const sc = wb.addWorksheet('Consultores')
  sc.columns = [
    { header: 'Nome', key: 'nome', width: 25 },
    { header: 'Estatuto', key: 'estatuto', width: 18 },
    { header: 'Zona', key: 'zona_actuacao', width: 20 },
    { header: 'Contacto', key: 'contacto', width: 18 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Pontuação', key: 'pontuacao', width: 12 },
    { header: 'Follow-up', key: 'data_follow_up', width: 14 },
  ]
  styleHeader(sc.getRow(1))
  for (const r of consultores) {
    sc.addRow({
      nome: fmt(r.nome), estatuto: fmt(r.estatuto), zona_actuacao: fmt(r.zona_actuacao),
      contacto: fmt(r.contacto), email: fmt(r.email),
      pontuacao: r.pontuacao ? Number(r.pontuacao) : '',
      data_follow_up: fmtDate(r.data_follow_up),
    })
  }
  styleRows(sc)

  return wb
}

// ── Financeiro ─────────────────────────────────────────────
async function exportFinanceiro() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Somnium Properties CRM'

  // Despesas
  const { rows: despesas } = await pool.query('SELECT * FROM despesas ORDER BY created_at DESC')
  const sd = wb.addWorksheet('Despesas')
  sd.columns = [
    { header: 'Movimento', key: 'movimento', width: 30 },
    { header: 'Categoria', key: 'categoria', width: 18 },
    { header: 'Timing', key: 'timing', width: 15 },
    { header: 'Custo Mensal', key: 'custo_mensal', width: 15 },
    { header: 'Custo Anual', key: 'custo_anual', width: 15 },
    { header: 'Notas', key: 'notas', width: 30 },
  ]
  styleHeader(sd.getRow(1))
  for (const r of despesas) {
    sd.addRow({
      movimento: fmt(r.movimento), categoria: fmt(r.categoria), timing: fmt(r.timing),
      custo_mensal: fmtEur(r.custo_mensal), custo_anual: fmtEur(r.custo_anual),
      notas: fmt(r.notas),
    })
  }
  sd.getColumn('custo_mensal').numFmt = '#,##0.00 €'
  sd.getColumn('custo_anual').numFmt = '#,##0.00 €'
  styleRows(sd)

  // Negocios
  const { rows: negocios } = await pool.query('SELECT * FROM negocios ORDER BY created_at DESC')
  const sn = wb.addWorksheet('Negócios')
  sn.columns = [
    { header: 'Movimento', key: 'movimento', width: 30 },
    { header: 'Categoria', key: 'categoria', width: 18 },
    { header: 'Fase', key: 'fase', width: 18 },
    { header: 'Lucro Estimado', key: 'lucro_estimado', width: 15 },
    { header: 'Lucro Real', key: 'lucro_real', width: 15 },
    { header: 'Custo Obra', key: 'custo_real_obra', width: 15 },
    { header: 'Data Venda', key: 'data_venda', width: 14 },
  ]
  styleHeader(sn.getRow(1))
  for (const r of negocios) {
    sn.addRow({
      movimento: fmt(r.movimento), categoria: fmt(r.categoria), fase: fmt(r.fase),
      lucro_estimado: fmtEur(r.lucro_estimado), lucro_real: fmtEur(r.lucro_real),
      custo_real_obra: fmtEur(r.custo_real_obra), data_venda: fmtDate(r.data_venda),
    })
  }
  sn.getColumn('lucro_estimado').numFmt = '#,##0.00 €'
  sn.getColumn('lucro_real').numFmt = '#,##0.00 €'
  sn.getColumn('custo_real_obra').numFmt = '#,##0.00 €'
  styleRows(sn)

  return wb
}

// ── Administrativo ─────────────────────────────────────────
async function exportAdministrativo() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Somnium Properties CRM'

  // Tarefas
  const { rows: tarefas } = await pool.query('SELECT * FROM tarefas ORDER BY created_at DESC')
  const st = wb.addWorksheet('Tarefas')
  st.columns = [
    { header: 'Título', key: 'titulo', width: 35 },
    { header: 'Estado', key: 'estado', width: 15 },
    { header: 'Prioridade', key: 'prioridade', width: 12 },
    { header: 'Responsável', key: 'responsavel', width: 18 },
    { header: 'Data Limite', key: 'data_limite', width: 14 },
    { header: 'Categoria', key: 'categoria', width: 15 },
  ]
  styleHeader(st.getRow(1))
  for (const r of tarefas) {
    st.addRow({
      titulo: fmt(r.titulo), estado: fmt(r.estado), prioridade: fmt(r.prioridade),
      responsavel: fmt(r.responsavel), data_limite: fmtDate(r.data_limite),
      categoria: fmt(r.categoria),
    })
  }
  styleRows(st)

  return wb
}

// ── Upload para Drive ──────────────────────────────────────
async function uploadToDrive(wb, fileName, folderId) {
  const drive = getDrive()
  if (!drive) return null

  const buffer = await wb.xlsx.writeBuffer()
  const stream = new Readable()
  stream.push(buffer)
  stream.push(null)

  const { data } = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      parents: folderId ? [folderId] : [],
    },
    media: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: stream },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  })

  return data
}

// ── Exportar departamento ──────────────────────────────────
export async function exportDepartment(dept, driveFolderId) {
  const date = new Date().toISOString().slice(0, 10)
  let wb, fileName

  switch (dept) {
    case 'comercial':
      wb = await exportComercial()
      fileName = `Somnium_Comercial_${date}.xlsx`
      break
    case 'financeiro':
      wb = await exportFinanceiro()
      fileName = `Somnium_Financeiro_${date}.xlsx`
      break
    case 'administrativo':
      wb = await exportAdministrativo()
      fileName = `Somnium_Administrativo_${date}.xlsx`
      break
    default:
      throw new Error(`Departamento desconhecido: ${dept}`)
  }

  // Gerar buffer para download
  const buffer = await wb.xlsx.writeBuffer()

  // Upload para Drive se folderId fornecido
  let driveFile = null
  if (driveFolderId) {
    driveFile = await uploadToDrive(wb, fileName, driveFolderId)
  }

  return { buffer, fileName, driveFile }
}

// ── Exportar todos ─────────────────────────────────────────
export async function exportAll(driveFolderIds) {
  const results = {}
  for (const dept of ['comercial', 'financeiro', 'administrativo']) {
    const folderId = driveFolderIds?.[dept] || null
    results[dept] = await exportDepartment(dept, folderId)
  }
  return results
}
