/**
 * Auto-registo mensal de despesas recorrentes (subscrições).
 * Port de registarDespesasMensais() de server.js (~5870).
 */
import pool from "../_shared/pg.ts";

export async function registarDespesasMensais(): Promise<void> {
  try {
    const { rows: subs } = await pool.query(
      "SELECT * FROM despesas WHERE timing IN ('Mensalmente', 'Anual')",
    );
    const hoje = new Date();
    const mesActual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

    // Recolher elegíveis em memória; deduplicação garantida por ON CONFLICT (id)
    const rows: Array<{
      id: string;
      movimento: string;
      categoria: string;
      data: string;
      valor: number;
      notas: string;
    }> = [];
    for (const sub of subs) {
      const dataSub = sub.data ? new Date(sub.data) : null;
      const diaPagamento = dataSub ? dataSub.getDate() : 1;
      if (sub.timing === "Anual") {
        const mesPagamento = dataSub ? dataSub.getMonth() + 1 : 1;
        if (hoje.getMonth() + 1 !== mesPagamento) continue;
        if (hoje.getDate() < diaPagamento) continue;
        const valor = sub.custo_anual || 0;
        if (valor <= 0) continue;
        rows.push({
          id: `auto-${sub.id}-${mesActual}`,
          movimento: sub.movimento,
          categoria: sub.categoria,
          data: `${mesActual}-${String(diaPagamento).padStart(2, "0")}`,
          valor,
          notas: "Subscrição anual",
        });
      } else {
        if (hoje.getDate() < diaPagamento) continue;
        const valor = sub.custo_mensal || 0;
        if (valor <= 0) continue;
        rows.push({
          id: `auto-${sub.id}-${mesActual}`,
          movimento: sub.movimento,
          categoria: sub.categoria,
          data: `${mesActual}-${String(diaPagamento).padStart(2, "0")}`,
          valor,
          notas: "Subscrição mensal",
        });
      }
    }
    if (rows.length === 0) return;

    // Bulk INSERT numa única query; RETURNING id devolve apenas os realmente criados
    const cols = 6;
    const placeholders = rows.map((_, i) => {
      const o = i * cols;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, 0, 'Registado', $${o + 6}, NOW(), NOW())`;
    }).join(", ");
    const params = rows.flatMap((r) => [r.id, r.movimento, r.categoria, r.data, r.valor, r.notas]);
    const { rowCount: criados } = await pool.query(
      `INSERT INTO despesas (id, movimento, categoria, data, custo_mensal, custo_anual, timing, notas, created_at, updated_at)
           VALUES ${placeholders}
           ON CONFLICT (id) DO NOTHING`,
      params,
    );
    if ((criados ?? 0) > 0) console.log(`[despesas] ${criados} registo(s) mensal(is) criado(s) automaticamente`);
  } catch (e) {
    console.error("[despesas] Erro auto-registo:", (e as Error).message);
  }
}
