// Edge Function "agenda" — port de src/db/agendaRoutes.js (Express -> Hono).
// Fase 1: disponibilidade manual semana-a-semana + catálogo de tarefas
// recorrentes. O motor de agendamento (gerar-semana/proposta/confirmar) é
// Fase 2, ainda não portado aqui.
import { createApp } from "../_shared/hono.ts";
import { requireAuth } from "../_shared/auth.ts";
import pool from "../_shared/pg.ts";
import {
  gerarCadeiasAngariacao, gerarEstudoDeMercado, gerarAnaliseDeNegocio, gerarElaboracaoProposta,
  gerarTarefasSinteticas, instanciarTemplatesDevidos, gerarProposta, gerarFila, atribuirTarefa, desfazerAtribuicao,
} from "../_shared/agendaEngine.ts";

const app = createApp("/agenda");

function addDias(dataISO: string, n: number): string {
  const d = new Date(dataISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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
      user_id_default, regiao, activo, simultaneo,
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
          user_id_default, regiao, activo, updated_by, simultaneo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [id, titulo, categoria || null, duracao_estimada_horas || 1, freq,
       frequencia_intervalo_dias || null, dias_semana || null, prio, sop_ref || null,
       user_id_default || null, regiao || null, activo !== false, userEmail(c), !!simultaneo],
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
      "user_id_default", "regiao", "activo", "simultaneo",
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

// ── Fila priorizada + atribuição manual (Fase 2, revisão 21/08/2026) ─

// POST /agenda/actualizar-fila { semana_inicio }
app.post("/actualizar-fila", async (c: any) => {
  try {
    const { semana_inicio } = await c.req.json().catch(() => ({}));
    if (!semana_inicio) return c.json({ error: "semana_inicio é obrigatório" }, 400);
    const cadeias = await gerarCadeiasAngariacao();
    const estudosMercado = await gerarEstudoDeMercado();
    const analises = await gerarAnaliseDeNegocio();
    const propostas = await gerarElaboracaoProposta();
    const sinteticas = await gerarTarefasSinteticas();
    const instanciadas = await instanciarTemplatesDevidos(semana_inicio);
    const { users, filaCatalogo, filaAutomatica } = await gerarFila();
    return c.json({
      ok: true,
      cadeias_angariacao: cadeias,
      estudos_mercado: estudosMercado,
      analises_negocio: analises,
      elaboracoes_proposta: propostas,
      tarefas_sinteticas: sinteticas,
      templates_instanciados: instanciadas,
      users,
      filaCatalogo,
      filaAutomatica,
    });
  } catch (e) {
    console.error("[agenda] actualizar-fila erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// GET /agenda/fila
app.get("/fila", async (c: any) => {
  try {
    const { users, filaCatalogo, filaAutomatica } = await gerarFila();
    return c.json({ users, filaCatalogo, filaAutomatica });
  } catch (e) {
    console.error("[agenda] fila erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// POST /agenda/atribuir { blocoId, userId, item }
app.post("/atribuir", async (c: any) => {
  try {
    const { blocoId, userId, item } = await c.req.json().catch(() => ({}));
    if (!blocoId || !userId || !item) return c.json({ error: "blocoId, userId e item são obrigatórios" }, 400);
    const resultado = await atribuirTarefa({ blocoId, userId, item });
    return c.json(resultado);
  } catch (e) {
    console.error("[agenda] atribuir erro:", e);
    return c.json({ error: (e as Error).message }, 400);
  }
});

// POST /agenda/desfazer { tarefaId }
app.post("/desfazer", async (c: any) => {
  try {
    const { tarefaId } = await c.req.json().catch(() => ({}));
    if (!tarefaId) return c.json({ error: "tarefaId é obrigatório" }, 400);
    const resultado = await desfazerAtribuicao(tarefaId);
    return c.json(resultado);
  } catch (e) {
    console.error("[agenda] desfazer erro:", e);
    return c.json({ error: (e as Error).message }, 400);
  }
});

// GET /agenda/proposta?semana_inicio=&user_id=
app.get("/proposta", async (c: any) => {
  try {
    const semana_inicio = c.req.query("semana_inicio");
    const user_id = c.req.query("user_id");
    if (!semana_inicio) return c.json({ error: "semana_inicio é obrigatório" }, 400);
    const semanaFim = addDias(semana_inicio, 6);
    const params: any[] = [semana_inicio, semanaFim];
    let where = "a.data >= $1 AND a.data <= $2";
    if (user_id) { params.push(user_id); where += ` AND a.user_id = $${params.length}`; }
    const { rows: agendamentos } = await pool.query(
      `SELECT a.*, t.tarefa, t.categoria, t.prioridade, t.origem_tipo, t.tempo_horas
       FROM agendamentos a JOIN tarefas t ON t.id = a.tarefa_id
       WHERE ${where} ORDER BY a.data, a.hora_inicio`,
      params,
    );
    const paramsNao: any[] = [semana_inicio, semanaFim];
    let whereNao = "t.inicio IS NULL AND t.status != 'Concluída' AND NOT EXISTS (SELECT 1 FROM agendamentos a2 WHERE a2.tarefa_id = t.id AND a2.estado IN ('proposto','confirmado') AND a2.data >= $1 AND a2.data <= $2)";
    if (user_id) { paramsNao.push(user_id); whereNao += ` AND (t.user_id = $${paramsNao.length} OR t.user_id IS NULL)`; }
    const { rows: naoAgendadas } = await pool.query(
      `SELECT t.* FROM tarefas t WHERE ${whereNao}
       ORDER BY CASE t.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, t.data_limite NULLS LAST, t.created_at`,
      paramsNao,
    );
    return c.json({ agendamentos, nao_agendadas: naoAgendadas });
  } catch (e) {
    console.error("[agenda] proposta erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// POST /agenda/agendamentos/:id/confirmar
app.post("/agendamentos/:id/confirmar", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `UPDATE agendamentos SET estado = 'confirmado', confirmado_em = NOW(), confirmado_por = $1, updated_at = NOW()
       WHERE id = $2 AND estado = 'proposto' RETURNING *`,
      [userEmail(c), c.req.param("id")],
    );
    if (!rows.length) return c.json({ error: "Agendamento não encontrado ou já processado" }, 404);
    const ag = rows[0];
    const { rows: tarefaRows } = await pool.query(
      `UPDATE tarefas SET inicio = $1, fim = $2, updated_at = NOW() WHERE id = $3 RETURNING origem_tipo, origem_campo, origem_id`,
      [`${ag.data}T${ag.hora_inicio}:00`, `${ag.data}T${ag.hora_fim}:00`, ag.tarefa_id],
    );
    const tarefa = tarefaRows[0];
    if (tarefa?.origem_tipo === "imovel" && tarefa?.origem_campo === "cadeia_cold_call") {
      await pool.query(`UPDATE imoveis SET data_chamada = $1 WHERE id = $2`, [ag.data, tarefa.origem_id]);
    }
    return c.json({ agendamento: ag });
  } catch (e) {
    console.error("[agenda] confirmar erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// POST /agenda/agendamentos/:id/recusar
app.post("/agendamentos/:id/recusar", async (c: any) => {
  try {
    const { rows } = await pool.query(
      `UPDATE agendamentos SET estado = 'recusado', updated_at = NOW() WHERE id = $1 AND estado = 'proposto' RETURNING *`,
      [c.req.param("id")],
    );
    if (!rows.length) return c.json({ error: "Agendamento não encontrado ou já processado" }, 404);
    return c.json({ agendamento: rows[0] });
  } catch (e) {
    console.error("[agenda] recusar erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// PUT /agenda/agendamentos/:id — reagendar antes de confirmar
app.put("/agendamentos/:id", async (c: any) => {
  try {
    const { data, hora_inicio, hora_fim } = await c.req.json().catch(() => ({}));
    if (!data || !hora_inicio || !hora_fim) {
      return c.json({ error: "data, hora_inicio e hora_fim são obrigatórios" }, 400);
    }
    if (hora_fim <= hora_inicio) return c.json({ error: "hora_fim tem de ser depois de hora_inicio" }, 400);
    const { rows } = await pool.query(
      `UPDATE agendamentos SET data = $1, hora_inicio = $2, hora_fim = $3, updated_at = NOW()
       WHERE id = $4 AND estado = 'proposto' RETURNING *`,
      [data, hora_inicio, hora_fim, c.req.param("id")],
    );
    if (!rows.length) return c.json({ error: "Agendamento não encontrado ou já confirmado" }, 404);
    return c.json({ agendamento: rows[0] });
  } catch (e) {
    console.error("[agenda] reagendar erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

// POST /agenda/semana/:semanaInicio/confirmar-tudo
app.post("/semana/:semanaInicio/confirmar-tudo", async (c: any) => {
  try {
    const semanaInicio = c.req.param("semanaInicio");
    const semanaFim = addDias(semanaInicio, 6);
    const { rows: propostos } = await pool.query(
      `SELECT * FROM agendamentos WHERE data >= $1 AND data <= $2 AND estado = 'proposto'`,
      [semanaInicio, semanaFim],
    );
    const email = userEmail(c);
    let confirmados = 0;
    for (const ag of propostos) {
      await pool.query(
        `UPDATE agendamentos SET estado = 'confirmado', confirmado_em = NOW(), confirmado_por = $1, updated_at = NOW() WHERE id = $2`,
        [email, ag.id],
      );
      const { rows: tarefaRows } = await pool.query(
        `UPDATE tarefas SET inicio = $1, fim = $2, updated_at = NOW() WHERE id = $3 RETURNING origem_tipo, origem_campo, origem_id`,
        [`${ag.data}T${ag.hora_inicio}:00`, `${ag.data}T${ag.hora_fim}:00`, ag.tarefa_id],
      );
      const tarefa = tarefaRows[0];
      if (tarefa?.origem_tipo === "imovel" && tarefa?.origem_campo === "cadeia_cold_call") {
        await pool.query(`UPDATE imoveis SET data_chamada = $1 WHERE id = $2`, [ag.data, tarefa.origem_id]);
      }
      confirmados++;
    }
    return c.json({ ok: true, confirmados });
  } catch (e) {
    console.error("[agenda] confirmar-tudo erro:", e);
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.get("/_health", (c: any) => c.json({ ok: true, fn: "agenda" }));

Deno.serve(app.fetch);
