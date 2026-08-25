// @ts-nocheck
// Fonte unica de verdade para cores e fontes de TODOS os geradores de
// documentos do CRM (PDF/DOCX/Excel). Gemeo Deno de src/db/docTheme.js —
// portar manualmente qualquer alteracao (so este ficheiro chega a producao).

export const DOC_COLORS = {
  gold: '#C9A84C',
  goldDark: '#6B5A1E',
  black: '#0D0D0D',
  body: '#2A2A2A',
  muted: '#777777',
  mutedDark: '#555555',
  mutedLight: '#999999',
  border: '#E0DDD5',
  bg: '#FBFAF7',
  light: '#F0EFE9',
  white: '#FFFFFF',

  tableHeaderBg: '#EFE6C8',
  tableRowAlt1: '#F5F1E6',
  tableRowAlt2: '#FBF8EF',

  green: '#2D6A2D',
  red: '#8B2020',
  amber: '#B07A1D',
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
  return 'FF' + hex.replace('#', '').toUpperCase()
}

export function toDocxColor(hex) {
  return hex.replace('#', '').toUpperCase()
}
