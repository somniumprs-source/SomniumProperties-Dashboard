// Modelo de negócio num só sítio (auditoria D6): o «Modelo de Negócio» do
// imóvel (imoveis.modelo_negocio). A categoria do projeto é cópia dele.
// Espelho: supabase/functions/_shared/modeloNegocio.ts (manter em sync).
//
// • Entrar numa coluna de modelo (Wholesaling, CAEP, Fix and Flip) fixa o
//   modelo do imóvel nesse valor, no mesmo pedido.
// • Com projeto ativo, o modelo do imóvel não muda para outro (as fases do
//   projeto são as do modelo); a categoria do projeto não se edita à parte.
// `query(sql, params)` devolve { rows }.

export const ESTADO_MODELO = { Wholesaling: 'Wholesaling', CAEP: 'CAEP', 'Fix and Flip': 'Fix and Flip' }

const igual = (a, b) => String(a || '') === String(b || '')

// beforeUpdate do imóvel: acerta o body e devolve { error } ou null.
export async function validarModeloImovel(query, id, body) {
  if (body.estado && ESTADO_MODELO[body.estado]) body.modelo_negocio = ESTADO_MODELO[body.estado]
  if (body.modelo_negocio === undefined) return null
  const { rows: [im] } = await query('SELECT modelo_negocio FROM imoveis WHERE id = $1', [id])
  if (!im || igual(im.modelo_negocio, body.modelo_negocio)) return null
  const { rows } = await query('SELECT movimento, categoria FROM negocios WHERE imovel_id = $1 AND deleted_at IS NULL', [id])
  const outro = rows.find(n => n.categoria && !igual(n.categoria, body.modelo_negocio))
  if (outro) return { error: `O imóvel tem o projeto «${outro.movimento}» em ${outro.categoria}: o modelo de negócio não muda depois de o projeto existir.` }
  return null
}

// beforeUpdate do projeto: a categoria vem do imóvel ligado; a fase antiga
// (Fase de obras/venda/Vendido) é calculada das fases do projeto (0084) e
// não se grava à mão quando o projeto tem fases.
export async function validarCategoriaNegocio(query, id, body) {
  if (body.fase !== undefined) {
    const { rows } = await query('SELECT 1 FROM projeto_fases WHERE negocio_id = $1 LIMIT 1', [id])
    if (rows.length) delete body.fase
  }
  if (body.categoria === undefined) return null
  const { rows: [n] } = await query(
    'SELECT n.categoria, n.imovel_id, i.modelo_negocio FROM negocios n LEFT JOIN imoveis i ON i.id = n.imovel_id WHERE n.id = $1', [id])
  if (!n?.imovel_id || igual(n.categoria, body.categoria)) return null
  return { error: 'O modelo do projeto vem do imóvel («Modelo de Negócio» na ficha) e não se muda aqui.' }
}
