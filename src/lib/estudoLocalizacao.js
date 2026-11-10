/**
 * Rasterização SVG → PNG no Node (Resvg + fontes Inter), usada pelos PDFs
 * (pdfImovelDocs.js). A imagem do Estudo de Localização é composta em
 * supabase/functions/_shared/estudoSvg.js e gerada no browser (estudoMapaOSM.js).
 */

import { Resvg } from '@resvg/resvg-js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Largura alvo do PNG: ~4x oversample face ao espaco util da pagina A4
// (CW≈495pt @ 72dpi). Importante para a pagina LOCALIZACAO do dossier,
// onde a imagem ocupa toda a content width — texto da tabela de POIs e
// cards de highlights tem que ficar legivel sem zoom.
// 1100px e suficiente para PDF impresso a A4 (~600x842pt). 2000px era
// overkill — gerava PNG ~5MB que tornava o PDF total ~6MB e o request
// timeout em Render. 1100px da PNG ~1.3MB com qualidade visual mantida.
const PNG_TARGET_WIDTH = 1100

// Fontes Inter empacotadas no repo (public/fonts/*.ttf). Garantem render
// consistente em qualquer plataforma — em particular no Render (Linux,
// sem fontes sans-serif por defeito) onde de outra forma o Resvg cai
// num monospace courier-like que destoa do tema do dossier.
const FONTS_DIR = path.resolve(__dirname, '../../public/fonts')
const INTER_FILES = [
  path.join(FONTS_DIR, 'Inter-Regular.ttf'),
  path.join(FONTS_DIR, 'Inter-SemiBold.ttf'),
  path.join(FONTS_DIR, 'Inter-Bold.ttf'),
]

export function rasterizarSvgParaPng(svg, { largura = PNG_TARGET_WIDTH } = {}) {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: largura },
    font: {
      fontFiles: INTER_FILES,
      loadSystemFonts: false,
      defaultFontFamily: 'Inter',
    },
  }).render().asPng()
}
