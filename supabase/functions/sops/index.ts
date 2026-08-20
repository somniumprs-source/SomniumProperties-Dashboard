// Edge Function "sops" — port de src/db/sopRoutes.js (Express -> Hono).
// CRUD da biblioteca de SOPs + sincronizacao com Google Drive (import-drive).
import { createApp } from "../_shared/hono.ts";
import { requireAuth } from "../_shared/auth.ts";
import pool from "../_shared/pg.ts";
import { importFolderToSops, syncSopsFromDrive, isConfigured as driveConfigured, parseFolderId } from "../_shared/sopDriveImport.ts";

const app = createApp("/sops");

// Auth em codigo: o gateway verify_jwt=true aceita a anon key (publica); requireAuth
// exige um utilizador REAL (rejeita anon), como o middleware global do Render. _health isento.
app.use("*", async (c: any, next: any) => {
  if (c.req.path.endsWith("/_health")) return await next();
  return await requireAuth(c, next);
});

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

// ── POST /sops/import-drive — sincroniza metadados de SOPs do Drive (port 96-119) ──
app.post("/import-drive", async (c: any) => {
  try {
    if (!driveConfigured()) {
      return c.json({ error: "Google Drive não configurado no servidor." }, 503);
    }
    const { folderId: rawFolder, departamento, overwrite } = await c.req.json().catch(() => ({}));
    const folderId = parseFolderId(rawFolder);
    if (!folderId) return c.json({ error: "folderId / URL Drive inválido" }, 400);
    if (!DEPARTAMENTOS_VALIDOS.includes(departamento)) {
      return c.json({ error: `departamento inválido: ${departamento}` }, 400);
    }
    const stats = await importFolderToSops({
      folderId,
      departamento,
      overwrite: !!overwrite,
      user: userEmail(c),
    });
    return c.json({ ok: true, ...stats });
  } catch (e) {
    console.error("[sops] import-drive erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── POST /sops/sync — sincroniza várias pastas do Drive numa operação
// atómica: casa por número de SOP (não por drive_file_id) e remove da BD
// as linhas dos departamentos sincronizados que já não existem no Drive.
app.post("/sync", async (c: any) => {
  try {
    if (!driveConfigured()) {
      return c.json({ error: "Google Drive não configurado no servidor." }, 503);
    }
    const { folders: rawFolders } = await c.req.json().catch(() => ({}));
    if (!Array.isArray(rawFolders) || !rawFolders.length) {
      return c.json({ error: "folders (array) é obrigatório" }, 400);
    }
    const folders = rawFolders.map(({ folderId: rawFolder, departamento }: any) => {
      const folderId = parseFolderId(rawFolder);
      if (!folderId) throw new Error("folderId / URL Drive inválido");
      if (!DEPARTAMENTOS_VALIDOS.includes(departamento)) {
        throw new Error(`departamento inválido: ${departamento}`);
      }
      return { folderId, departamento };
    });
    const stats = await syncSopsFromDrive({ folders, user: userEmail(c) });
    return c.json({ ok: true, ...stats });
  } catch (e) {
    console.error("[sops] sync erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.get("/_health", (c) => c.json({ ok: true, fn: "sops" }));

Deno.serve(app.fetch);
