// Pool Postgres para Edge Functions (Deno), drop-in de src/db/pg.js.
// Usa o proprio 'pg' (node-postgres) via node-compat do Deno: mesma lib da app,
// mesma semantica de Pool e concorrencia correcta (postgres.js pendurava queries
// `unsafe` concorrentes acima do max). pool.query(text, params) -> { rows, rowCount }.
import pg from "pg";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) {
  console.error("[pg] ERRO: DATABASE_URL nao esta definido nos secrets da funcao.");
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Isolates efemeros: poucas conexoes por instancia (o pooler Supavisor agrega).
  // O antigo pg.js usava max:30 por ser 1 processo persistente; aqui seria nefasto.
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

pool.on("error", (err: any) => console.error("[pg] Pool error:", err?.message));

// Equivalente exacto a `export const query` do pg.js original.
export const query = (text: string, params?: any[]) => pool.query(text, params);

// Transacoes: substitui o uso de pool.connect()/client.query()/client.release().
export async function withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

export default pool;
