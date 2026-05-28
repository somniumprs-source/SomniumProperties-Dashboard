// Edge Function "sops" — port de src/db/sopRoutes.js (Express -> Hono).
// CRUD da biblioteca de SOPs. O endpoint POST /import-drive depende do modulo
// sopDriveImport (Google Drive) ainda nao portado -> 501.
import { createApp } from "../_shared/hono.ts";
import pool from "../_shared/pg.ts";

const app = createApp("/sops");

const DEPARTAMENTOS_VALIDOS = ["comercial", "financeiro", "administrativo", "geral"];

// Email do utilizador autenticado, via header Authorization (best-effort).
// O Express obtinha de req.user.email (middleware JWT global). Aqui guardamos
// o que vier do JWT pelo claim email; se nao houver, devolve null (como o original).
function userEmail(c: any): string | null {
  return (c as any).get("userEmail") || null;
}

// ── GET /sops?departamento=... (port sopRoutes.js 17-40) ──
app.get("/", async (c: any) => {
  try {
    const dep = c.req.query("departamento");
    const params: any[] = [];
    let where = "";
    if (dep && DEPARTAMENTOS_VALIDOS.includes(dep)) {
      params.push(dep);
      where = "WHERE departamento = $1";
    }
    const { rows } = await pool.query(
      `SELECT id, titulo, departamento, drive_url, drive_file_id,
              created_at, updated_at, updated_by
         FROM sops ${where}
         ORDER BY
           COALESCE((SUBSTRING(titulo FROM 'SOP[[:space:]]*([0-9]+)'))::int, 999999),
           titulo`,
      params,
    );
    return c.json({ sops: rows });
  } catch (e) {
    console.error("[sops] list erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── GET /sops/:id (port 43-52) ──
app.get("/:id", async (c: any) => {
  try {
    const { rows } = await pool.query("SELECT * FROM sops WHERE id = $1", [c.req.param("id")]);
    if (!rows.length) return c.json({ error: "SOP não encontrado" }, 404);
    return c.json({ sop: rows[0] });
  } catch (e) {
    console.error("[sops] get erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── PUT /sops/:id — reclassificar (titulo + departamento) (port 56-82) ──
app.put("/:id", async (c: any) => {
  try {
    const { titulo, departamento } = await c.req.json().catch(() => ({}));
    if (departamento && !DEPARTAMENTOS_VALIDOS.includes(departamento)) {
      return c.json({ error: `departamento inválido: ${departamento}` }, 400);
    }
    const user = userEmail(c);
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (titulo !== undefined) { fields.push(`titulo = $${i++}`); values.push(titulo); }
    if (departamento !== undefined) { fields.push(`departamento = $${i++}`); values.push(departamento); }
    if (!fields.length) return c.json({ error: "Nada para actualizar" }, 400);
    fields.push(`updated_at = NOW()`);
    fields.push(`updated_by = $${i++}`);
    values.push(user);
    values.push(c.req.param("id"));
    const { rows } = await pool.query(
      `UPDATE sops SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!rows.length) return c.json({ error: "SOP não encontrado" }, 404);
    return c.json({ sop: rows[0] });
  } catch (e) {
    console.error("[sops] update erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── DELETE /sops/:id (port 85-94) ──
app.delete("/:id", async (c: any) => {
  try {
    const r = await pool.query("DELETE FROM sops WHERE id = $1", [c.req.param("id")]);
    if (!r.rowCount) return c.json({ error: "SOP não encontrado" }, 404);
    return c.json({ ok: true });
  } catch (e) {
    console.error("[sops] delete erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── POST /sops/import-drive (sopDriveImport — Drive nao portado) -> 501 ──
app.post("/import-drive", (c: any) => c.json({ error: "Not implemented — porting em curso", todo: true }, 501));

app.get("/_health", (c) => c.json({ ok: true, fn: "sops" }));

Deno.serve(app.fetch);
