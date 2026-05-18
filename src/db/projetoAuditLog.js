/**
 * Helper para registar mudanças no projecto em projeto_audit.
 * Best-effort — falhas não bloqueiam a operação principal.
 */
import pool from './pg.js'
import { randomUUID } from 'crypto'

export async function audit({ negocioId, entidade, entidadeId, acao, campo, valorAntes, valorDepois, descricao, user }) {
  try {
    await pool.query(
      `INSERT INTO projeto_audit (id, negocio_id, entidade, entidade_id, acao, campo, valor_antes, valor_depois, descricao, user_id, user_nome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [randomUUID(), negocioId, entidade, entidadeId || null, acao,
       campo || null,
       valorAntes != null ? String(valorAntes).slice(0, 500) : null,
       valorDepois != null ? String(valorDepois).slice(0, 500) : null,
       descricao || null,
       user?.id || null, user?.nome || user?.email || null]
    )
  } catch (e) { console.error('[audit]', e.message) }
}

// Constrói uma descrição human-readable para a mudança
export function descreverMudanca(entidade, campo, antes, depois) {
  const formatar = v => v == null ? '—' : String(v).slice(0, 80)
  return `${campo}: ${formatar(antes)} → ${formatar(depois)}`
}
