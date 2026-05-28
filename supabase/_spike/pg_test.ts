// Spike 3: postgres.js contra o pooler Supabase (6543, transaction mode).
// Prova: liga com prepare:false, corre queries e suporta concorrencia.
// Tambem testa um shim query(text, params) que imita pool.query do pg.
import postgres from "npm:postgres@3.4.5";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) { console.error("[pg] DATABASE_URL em falta"); Deno.exit(1); }

const sql = postgres(DATABASE_URL, {
  ssl: { rejectUnauthorized: false },
  max: 3,
  prepare: false, // obrigatorio no pooler transaction mode (6543)
  idle_timeout: 20,
  connect_timeout: 8,
});

// Shim compativel com o uso actual: pool.query(text, params) -> { rows, rowCount }
async function query(text: string, params: any[] = []) {
  const rows = await sql.unsafe(text, params);
  return { rows, rowCount: rows.length };
}

async function main() {
  console.log("[pg] a ligar ao pooler 6543...");
  const t0 = performance.now();
  const r1 = await query("SELECT 1 AS um, now() AS agora");
  console.log(`[pg] SELECT 1 -> ${JSON.stringify(r1.rows[0])} (${Math.round(performance.now() - t0)}ms)`);

  // Query parametrizada ($1) como no codigo actual
  const r2 = await query("SELECT $1::int AS n, $2::text AS t", [42, "ola"]);
  console.log(`[pg] params -> ${JSON.stringify(r2.rows[0])}`);

  // Contagem de uma tabela real (se existir)
  try {
    const r3 = await query("SELECT count(*)::int AS n FROM imoveis");
    console.log(`[pg] count(imoveis) -> ${r3.rows[0].n}`);
  } catch (e) {
    console.log(`[pg] count(imoveis) indisponivel: ${(e as Error).message}`);
  }

  // Concorrencia: 20 queries em paralelo (simula o fan-out do dashboard)
  const tC = performance.now();
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => query("SELECT $1::int AS i, pg_sleep(0.05)", [i]))
  );
  console.log(`[pg] 20 queries concorrentes OK em ${Math.round(performance.now() - tC)}ms`);

  const pass = r1.rows[0].um === 1 && r2.rows[0].n === 42 && results.length === 20;
  console.log(`[pg] RESULTADO: ${pass ? "PASS (pooler + concorrencia + shim OK)" : "FAIL"}`);

  await sql.end();
}

main().catch((e) => { console.error("[pg] FAIL:", e); Deno.exit(1); });
