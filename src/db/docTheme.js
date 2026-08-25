// Fonte unica de verdade para cores e fontes de TODOS os geradores de
// documentos do CRM (PDF/DOCX/Excel). Verificado a partir das SOPs .docx
// reais (styles.xml/document.xml).
//
// IMPORTANTE: gemeo em supabase/functions/_shared/docTheme.ts.
// Portar manualmente qualquer alteracao (ver CLAUDE.md, so o gemeo Deno
// chega a producao).

export const DOC_COLORS = {
  gold: '#C9A84C', // acento primario (masthead, destaques, linhas douradas)
  goldDark: '#6B5A1E', // bronze/dourado escuro — SOP Heading3 / enfase secundaria
  black: '#0D0D0D', // quase-preto — SOP Heading1/2, headers/footers de capa
  body: '#2A2A2A', // corpo de texto
  muted: '#777777', // cinza medio (labels, legendas)
  mutedDark: '#555555', // cinza escuro (texto secundario forte)
  mutedLight: '#999999', // cinza claro (texto terciario/legendas)
  border: '#E0DDD5', // linhas e separadores
  bg: '#FBFAF7', // fundo de pagina/quadro claro
  light: '#F0EFE9', // fundo neutro para caixas/cartoes decorativos (NAO tabelas)
  white: '#FFFFFF',

  // Shading de tabelas (valores exatos das SOPs — usar SO em cabecalhos/
  // linhas de tabelas de dados, nao em caixas decorativas genericas)
  tableHeaderBg: '#EFE6C8',
  tableRowAlt1: '#F5F1E6',
  tableRowAlt2: '#FBF8EF',

  // Semantica de estado
  green: '#2D6A2D', // positivo / validado
  red: '#8B2020', // negativo / erro
  amber: '#B07A1D', // aviso
}

export const DOC_FONT = {
  pdf: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique' },
  docx: 'Arial',
}

export function hexToRgbArr(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function toArgb(hex) {
  return 'FF' + hex.replace('#', '').toUpperCase() // exceljs
}

export function toDocxColor(hex) {
  return hex.replace('#', '').toUpperCase() // docx lib
}
