// Edge Function "agenda" — port de src/db/agendaRoutes.js (Express -> Hono).
// Fase 1: disponibilidade manual semana-a-semana + catálogo de tarefas
// recorrentes. O motor de agendamento (gerar-semana/proposta/confirmar) é
// Fase 2, ainda não portado aqui.
import { createApp } from "../_shared/hono.ts";
import { requireAuth } from "../_shared/auth.ts";
import pool from "../_shared/pg.ts";

const app = createApp("/agenda");

app.use("*", async (c: any, next: any) => {
  if (c.req.path.endsWith("/_health")) return await next();
  return await requireAuth(c, next);
});

const FREQUENCIAS_VALIDAS = ["diaria", "semanal", "quinzenal", "mensal", "custom"];
const PRIORIDADES_VALIDAS = ["alta", "media", "baixa"];

function userEmail(c: any): string | null {
  return (c as any).get("userEmail") || null;
}

// ── Disponibilidade ──────────────────────────────────────────────

// GET /agenda/disponibilidade?user_id=&de=&ate= (port agendaRoutes.js 20-37)
app.get("/disponibilidade", async (c: any) => {
  try {
    const user_id = c.req.query("user_id");
    const de = c.req.query("de");
    const ate = c.req.query("ate");
    const where: string[] = [];
    const params: any[] = [];
    if (user_id) { params.push(user_id); where.push(`user_id = $${params.length}`); }
    if (de) { params.push(de); where.push(`data >= $${params.length}`); }
    if (ate) { params.push(ate); where.push(`data <= $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT * FROM disponibilidade_blocos
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY data, hora_inicio`,
      params,
    );
    return c.json({ blocos: rows });
  } catch (e) {
    console.error("[agenda] list disponibilidade erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// POST /agenda/disponibilidade (port 40-63)
app.post("/disponibilidade", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const items = Array.isArray(body) ? body : [body];
    if (!items.length) return c.json({ error: "Nada para criar" }, 400);
    const criados: any[] = [];
    for (const item of items) {
      const { user_id, data, hora_inicio, hora_fim } = item || {};
      if (!user_id || !data || !hora_inicio || !hora_fim) {
        return c.json({ error: "user_id, data, hora_inicio e hora_fim são obrigatórios" }, 400);
      }
      if (hora_fim <= hora_inicio) {
        return c.json({ error: `Bloco inválido em ${data}: hora_fim tem de ser depois de hora_inicio` }, 400);
      }
      const id = crypto.randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO disponibilidade_blocos (id, user_id, data, hora_inicio, hora_fim)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, user_id, data, hora_inicio, hora_fim],
      );
      criados.push(rows[0]);
    }
    return c.json({ blocos: criados }, 201);
  } catch (e) {
    console.error("[agenda] create disponibilidade erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// DELETE /agenda/disponibilidade/:id (port 66-74)
app.delete("/disponibilidade/:id", async (c: any) => {
  try {
    const r = await pool.query("DELETE FROM disponibilidade_blocos WHERE id = $1", [c.req.param("id")]);
    if (!r.rowCount) return c.json({ error: "Bloco não encontrado" }, 404);
    return c.json({ ok: true });
  } catch (e) {
    console.error("[agenda] delete disponibilidade erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// POST /agenda/disponibilidade/copiar-semana (port 79-112)
app.post("/disponibilidade/copiar-semana", async (c: any) => {
  try {
    const { user_id, semana_origem, semana_destino } = await c.req.json().catch(() => ({}));
    if (!user_id || !semana_origem || !semana_destino) {
      return c.json({ error: "user_id, semana_origem e semana_destino são obrigatórios" }, 400);
    }
    const origem = new Date(semana_origem + "T00:00:00Z");
    const destino = new Date(semana_destino + "T00:00:00Z");
    const offsetDias = Math.round((destino.getTime() - origem.getTime()) / 86400000);
    const fimOrigem = new Date(origem);
    fimOrigem.setUTCDate(fimOrigem.getUTCDate() + 6);
    const fimOrigemStr = fimOrigem.toISOString().slice(0, 10);

    const { rows: blocos } = await pool.query(
      `SELECT * FROM disponibilidade_blocos WHERE user_id = $1 AND data >= $2 AND data <= $3`,
      [user_id, semana_origem, fimOrigemStr],
    );
    const criados: any[] = [];
    for (const b of blocos) {
      const d = new Date(b.data + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + offsetDias);
      const novaData = d.toISOString().slice(0, 10);
      const id = crypto.randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO disponibilidade_blocos (id, user_id, data, hora_inicio, hora_fim)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, user_id, novaData, b.hora_inicio, b.hora_fim],
      );
      criados.push(rows[0]);
    }
    return c.json({ blocos: criados, copiados: criados.length }, 201);
  } catch (e) {
    console.error("[agenda] copiar-semana erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ── Catálogo de tarefas recorrentes ──────────────────────────────

// GET /agenda/templates?activo=true (port 117-131)
app.get("/templates", async (c: any) => {
  try {
    const activo = c.req.query("activo");
    const where: string[] = [];
    const params: any[] = [];
    if (activo !== undefined) { params.push(activo === "true"); where.push(`activo = $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT * FROM tarefas_templates
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, titulo`,
      params,
    );
    return c.json({ templates: rows });
  } catch (e) {
    console.error("[agenda] list templates erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// POST /agenda/templates (port 134-163)
app.post("/templates", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const {
      titulo, categoria, duracao_estimada_horas, frequencia,
      frequencia_intervalo_dias, dias_semana, prioridade, sop_ref,
      user_id_default, regiao, activo,
    } = body;
    if (!titulo) return c.json({ error: "titulo é obrigatório" }, 400);
    const freq = frequencia || "semanal";
    if (!FREQUENCIAS_VALIDAS.includes(freq)) {
      return c.json({ error: `frequencia inválida: ${freq}` }, 400);
    }
    const prio = prioridade || "media";
    if (!PRIORIDADES_VALIDAS.includes(prio)) {
      return c.json({ error: `prioridade inválida: ${prio}` }, 400);
    }
    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO tarefas_templates
         (id, titulo, categoria, duracao_estimada_horas, frequencia,
          frequencia_intervalo_dias, dias_semana, prioridade, sop_ref,
          user_id_default, regiao, activo, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [id, titulo, categoria || null, duracao_estimada_horas || 1, freq,
       frequencia_intervalo_dias || null, dias_semana || null, prio, sop_ref || null,
       user_id_default || null, regiao || null, activo !== false, userEmail(c)],
    );
    return c.json({ template: rows[0] }, 201);
  } catch (e) {
    console.error("[agenda] create template erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// PUT /agenda/templates/:id (port 166-188)
app.put("/templates/:id", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    if (body.frequencia && !FREQUENCIAS_VALIDAS.includes(body.frequencia)) {
      return c.json({ error: `frequencia inválida: ${body.frequencia}` }, 400);
    }
    if (body.prioridade && !PRIORIDADES_VALIDAS.includes(body.prioridade)) {
      return c.json({ error: `prioridade inválida: ${body.prioridade}` }, 400);
    }
    const campos = [
      "titulo", "categoria", "duracao_estimada_horas", "frequencia",
      "frequencia_intervalo_dias", "dias_semana", "prioridade", "sop_ref",
      "user_id_default", "regiao", "activo",
    ];
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const campo of campos) {
      if (body[campo] !== undefined) { fields.push(`${campo} = $${i++}`); values.push(body[campo]); }
    }
    if (!fields.length) return c.json({ error: "Nada para actualizar" }, 400);
    fields.push(`updated_at = NOW()`);
    fields.push(`updated_by = $${i++}`);
    values.push(userEmail(c));
    values.push(c.req.param("id"));
    const { rows } = await pool.query(
      `UPDATE tarefas_templates SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!rows.length) return c.json({ error: "Template não encontrado" }, 404);
    return c.json({ template: rows[0] });
  } catch (e) {
    console.error("[agenda] update template erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// DELETE /agenda/templates/:id (port 191-199)
app.delete("/templates/:id", async (c: any) => {
  try {
    const r = await pool.query("DELETE FROM tarefas_templates WHERE id = $1", [c.req.param("id")]);
    if (!r.rowCount) return c.json({ error: "Template não encontrado" }, 404);
    return c.json({ ok: true });
  } catch (e) {
    console.error("[agenda] delete template erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.get("/_health", (c: any) => c.json({ ok: true, fn: "agenda" }));

Deno.serve(app.fetch);
