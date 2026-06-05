/**
 * API routes para análises de rentabilidade (calculadora integrada).
 * Cada imóvel pode ter N análises, 1 activa (alimenta KPIs).
 * Port de src/db/analiseRoutes.js (Express -> Hono). Registado sob basePath /crm.
 *
 * Endpoints de upload (stress-screenshot, alfredo-imagem) usam Supabase Storage
 * (multipart via c.req.formData(); disco substituído por buckets públicos).
 */
import pool from "../_shared/pg.ts";
import { calcAnalise, calcStressTests, calcCAEP, quickCheck } from "../_shared/calcEngine.ts";
import { uploadPublic, removeFromStorage } from "../_shared/storage.ts";

// Campos de input (enviados pelo frontend)
const INPUT_FIELDS = new Set([
  "nome", "compra", "vpt", "finalidade", "escritura", "cpcv_compra", "due_diligence",
  "perc_financiamento", "prazo_anos", "tan", "tipo_taxa", "comissoes_banco", "hipoteca",
  "modo_obra", "obra", "pmo_perc", "aru", "ampliacao", "licenciamento",
  "pmo_arq_perc", "pmo_fisc_perc", "pmo_seg_obra_perc", "pmo_outros_perc",
  "meses", "seguro_mensal", "condominio_mensal", "utilidades_mensal",
  "n_tranches", "custo_tranche", "taxa_imi", "ligacao_servicos", "excedente_capital",
  "vvr", "comissao_perc", "cpcv_venda", "cert_energetico", "home_staging", "outros_venda",
  "regime_fiscal", "categoria_irs", "derrama_perc", "perc_dividendos", "ano_aquisicao", "englobamento", "taxa_irs_marginal",
  "renda_mensal", "vacancy_pct", "gestao_arr_pct",
  "comparaveis", "caep", "criado_por",
]);

// Campos calculados pelo motor
const CALC_FIELDS = new Set([
  "imt", "imposto_selo", "total_aquisicao",
  "valor_financiado", "prestacao_mensal", "is_financiamento", "penalizacao_amort",
  "iva_obra", "obra_com_iva",
  "imi_proporcional", "total_detencao",
  "comissao_com_iva", "total_venda",
  "impostos", "retencao_dividendos",
  "capital_necessario", "lucro_bruto", "lucro_liquido",
  "retorno_total", "retorno_anualizado", "cash_on_cash", "break_even",
  "stress_tests",
]);

// ── Propagação: análise activa → imóvel + negócio ────────────
async function propagarParaImovel(imovelId: string, calculados: any, inputs: any) {
  try {
    const vvr = parseFloat(inputs.vvr) || 0;
    const obraComIva = calculados.obra_com_iva || 0;
    const roi = calculados.retorno_total || 0;
    const roiAnualizado = calculados.retorno_anualizado || 0;

    await pool.query(
      `UPDATE imoveis SET
        valor_venda_remodelado = $1,
        custo_estimado_obra = $2,
        roi = $3,
        roi_anualizado = $4,
        updated_at = $5
      WHERE id = $6`,
      [vvr, obraComIva, roi, roiAnualizado, new Date().toISOString(), imovelId],
    );

    // Actualizar negócios associados (respeitando modelo de negócio)
    const { rows: negocios } = await pool.query("SELECT id, categoria, comissao_pct FROM negocios WHERE imovel_id = $1", [imovelId]);
    const lucroBruto = calculados.lucro_bruto || 0;
    const now = new Date().toISOString();

    for (const neg of negocios) {
      let lucroEstimado = 0;

      if (neg.categoria === "Wholesalling") {
        // Wholesaling: fee = % do lucro bruto F&F (default 10%)
        const pct = neg.comissao_pct || 10;
        lucroEstimado = Math.round(lucroBruto * (pct / 100) * 100) / 100;
      } else if (neg.categoria === "Mediação Imobiliária") {
        // Mediação: comissão % sobre valor de venda
        const pct = neg.comissao_pct || 2.5;
        lucroEstimado = Math.round(vvr * (pct / 100) * 100) / 100;
      } else if (neg.categoria === "CAEP") {
        // CAEP: 2/3 da quota activa.
        // Prioridade: perc_somnium definido na ficha CAEP da análise (fonte da verdade)
        //          > comissao_pct já guardado no negocio
        //          > default 40
        const caepData = typeof inputs?.caep === "string" ? JSON.parse(inputs.caep || "null") : inputs?.caep;
        const split = Number(caepData?.perc_somnium) || parseFloat(neg.comissao_pct) || 40;
        const quotaActiva = lucroBruto * (split / 100);
        lucroEstimado = Math.round(quotaActiva * (2 / 3) * 100) / 100;
        // Sincroniza comissao_pct no negocio quando vem do perc_somnium da análise
        if (Number(caepData?.perc_somnium) && parseFloat(neg.comissao_pct) !== split) {
          await pool.query("UPDATE negocios SET comissao_pct = $1 WHERE id = $2", [split, neg.id]);
        }
      } else {
        lucroEstimado = calculados.lucro_liquido || 0;
      }

      await pool.query(
        `UPDATE negocios SET lucro_estimado = $1, capital_total = 0, updated_at = $2 WHERE id = $3`,
        [lucroEstimado, now, neg.id],
      );
    }
  } catch (e) {
    console.error("[analise] Erro ao propagar para imóvel:", (e as Error).message);
  }
}

// O preco de aquisicao da analise e SUGERIDO pela ficha do imovel (editavel):
//   - Wholesaling: valor pago pela cedencia de posicao (valor_com_cedencia)
//   - Outros modelos: valor da proposta (valor_proposta)
// Usa-se apenas como valor por defeito quando a analise ainda nao tem compra propria;
// se o utilizador definir um valor, esse e respeitado.
function applyCompraOverride(inputs: any, imovel: any) {
  if (!imovel) return inputs;
  const atual = Number(inputs.compra);
  if (Number.isFinite(atual) && atual > 0) return inputs;
  const fonte = imovel.modelo_negocio === "Wholesaling"
    ? Number(imovel.valor_com_cedencia)
    : Number(imovel.valor_proposta);
  if (!Number.isFinite(fonte) || fonte <= 0) return inputs;
  return { ...inputs, compra: fonte };
}

export function registerAnaliseRoutes(app: any) {
  // ── Listar análises de um imóvel ─────────────────────────────
  app.get("/imoveis/:imovelId/analises", async (c: any) => {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM analises WHERE imovel_id = $1 ORDER BY activa DESC, updated_at DESC",
        [c.req.param("imovelId")],
      );
      return c.json(rows);
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });

  // ── Criar nova análise para um imóvel ────────────────────────
  app.post("/imoveis/:imovelId/analises", async (c: any) => {
    try {
      const imovelId = c.req.param("imovelId");
      // Verificar que o imóvel existe
      const { rows: [imovel] } = await pool.query("SELECT * FROM imoveis WHERE id = $1", [imovelId]);
      if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const body = (await c.req.json().catch(() => ({}))) || {};

      // Se é a primeira análise, fica activa
      const { rows: existentes } = await pool.query("SELECT id FROM analises WHERE imovel_id = $1", [imovelId]);
      const activa = existentes.length === 0;

      // Pré-preencher com dados do imóvel se não vier input
      let inputs: any = {
        compra: body.compra ?? imovel.ask_price ?? 0,
        obra: body.obra ?? imovel.custo_estimado_obra ?? 0,
        vvr: body.vvr ?? imovel.valor_venda_remodelado ?? 0,
        meses: body.meses ?? 6,
        ...body,
      };
      inputs = applyCompraOverride(inputs, imovel);

      // Calcular
      const calculados = calcAnalise(inputs);
      const stress = calcStressTests(inputs);
      const caepResult = inputs.caep ? calcCAEP(inputs, typeof inputs.caep === "string" ? JSON.parse(inputs.caep) : inputs.caep) : null;

      // Montar dados para insert
      const data: any = {
        ...inputs,
        ...calculados,
        stress_tests: JSON.stringify(stress),
      };
      if (caepResult) data.caep = JSON.stringify(caepResult);

      // Filtrar apenas colunas válidas
      const SYSTEM = new Set(["id", "imovel_id", "activa", "versao", "created_at", "updated_at"]);
      const ALL_FIELDS = new Set([...INPUT_FIELDS, ...CALC_FIELDS, "stress_tests"]);
      const entries = Object.entries(data).filter(([k]) => ALL_FIELDS.has(k) && !SYSTEM.has(k));

      const cols = ["id", "imovel_id", "activa", "versao", ...entries.map(([k]) => k), "created_at", "updated_at"];
      const vals = cols.map((_, i) => `$${i + 1}`);
      const params = [id, imovelId, activa, 1, ...entries.map(([, v]) => typeof v === "object" ? JSON.stringify(v) : v), now, now];

      await pool.query(`INSERT INTO analises (${cols.join(", ")}) VALUES (${vals.join(", ")})`, params);

      // Se activa, propagar para imóvel
      if (activa) await propagarParaImovel(imovelId, calculados, inputs);

      // Audit log
      await pool.query(
        "INSERT INTO audit_log (tabela, registo_id, acao, dados_novos) VALUES ($1, $2, $3, $4)",
        ["analises", id, "INSERT", JSON.stringify({ id, imovel_id: imovelId, nome: inputs.nome || "Cenário Base" })],
      );

      const { rows: [created] } = await pool.query("SELECT * FROM analises WHERE id = $1", [id]);
      return c.json(created, 201);
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });

  // ── Quick Check ──────────────────────────────────────────────
  // Registado ANTES de /analises/:id para Hono não apanhar "quick-check" como :id.
  app.post("/analises/quick-check", async (c: any) => {
    try {
      const result = quickCheck(await c.req.json().catch(() => ({})));
      if (!result) return c.json({ error: "Compra e VVR são obrigatórios" }, 400);
      return c.json(result);
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });

  // ── KPIs agregados de análises activas ───────────────────────
  app.get("/analises-kpis", async (c: any) => {
    try {
      const { rows } = await pool.query(`
        SELECT a.*, i.nome as imovel_nome, i.estado as imovel_estado
        FROM analises a
        JOIN imoveis i ON i.id = a.imovel_id
        WHERE a.activa = true
      `);

      const total = rows.length;
      if (total === 0) return c.json({ total: 0 });

      const somaLucro = rows.reduce((s: number, r: any) => s + (r.lucro_liquido || 0), 0);
      const somaCapital = rows.reduce((s: number, r: any) => s + (r.capital_necessario || 0), 0);
      const mediaRA = rows.reduce((s: number, r: any) => s + (r.retorno_anualizado || 0), 0) / total;
      const mediaRT = rows.reduce((s: number, r: any) => s + (r.retorno_total || 0), 0) / total;
      const comRisco = rows.filter((r: any) => {
        const st = typeof r.stress_tests === "string" ? JSON.parse(r.stress_tests) : r.stress_tests;
        return st?.pior?.lucro_liquido < 0;
      }).length;

      return c.json({
        total,
        pipeline_lucro_liquido: Math.round(somaLucro * 100) / 100,
        pipeline_capital: Math.round(somaCapital * 100) / 100,
        media_retorno_anualizado: Math.round(mediaRA * 100) / 100,
        media_retorno_total: Math.round(mediaRT * 100) / 100,
        imoveis_com_risco: comRisco,
        analises: rows.map((r: any) => ({
          id: r.id,
          imovel_id: r.imovel_id,
          imovel_nome: r.imovel_nome,
          imovel_estado: r.imovel_estado,
          lucro_liquido: r.lucro_liquido,
          retorno_anualizado: r.retorno_anualizado,
          capital_necessario: r.capital_necessario,
          vvr: r.vvr,
          compra: r.compra,
        })),
      });
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });

  // ── Obter análise por ID ─────────────────────────────────────
  app.get("/analises/:id", async (c: any) => {
    try {
      const { rows: [analise] } = await pool.query("SELECT * FROM analises WHERE id = $1", [c.req.param("id")]);
      if (!analise) return c.json({ error: "Análise não encontrada" }, 404);
      return c.json(analise);
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });

  // ── Actualizar análise (recalcula server-side) ───────────────
  app.put("/analises/:id", async (c: any) => {
    try {
      const { rows: [existing] } = await pool.query("SELECT * FROM analises WHERE id = $1", [c.req.param("id")]);
      if (!existing) return c.json({ error: "Análise não encontrada" }, 404);

      const now = new Date().toISOString();
      const body = (await c.req.json().catch(() => ({}))) || {};

      // Merge inputs existentes com novos
      let merged: any = {};
      for (const f of INPUT_FIELDS) {
        if (f === "comparaveis" || f === "caep") {
          merged[f] = body[f] !== undefined ? body[f] : existing[f];
        } else {
          merged[f] = body[f] !== undefined ? body[f] : existing[f];
        }
      }

      // Wholesaling: forcar compra = valor_com_cedencia do imovel
      const { rows: [imovel] } = await pool.query(
        "SELECT modelo_negocio, valor_com_cedencia FROM imoveis WHERE id = $1",
        [existing.imovel_id],
      );
      merged = applyCompraOverride(merged, imovel);

      // Recalcular
      const calculados = calcAnalise(merged);
      const stress = calcStressTests(merged);
      const caepConfig = merged.caep ? (typeof merged.caep === "string" ? JSON.parse(merged.caep) : merged.caep) : null;
      const caepResult = caepConfig ? calcCAEP(merged, caepConfig) : null;

      // Montar SET
      const updates: any = { ...merged, ...calculados, stress_tests: stress, versao: (existing.versao || 1) + 1, updated_at: now };
      if (caepResult) updates.caep = caepResult;

      const SKIP = new Set(["id", "imovel_id", "activa", "created_at"]);
      const entries = Object.entries(updates).filter(([k]) => !SKIP.has(k));
      const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
      const params = entries.map(([, v]) => typeof v === "object" && v !== null ? JSON.stringify(v) : v);
      params.push(c.req.param("id"));

      await pool.query(`UPDATE analises SET ${sets.join(", ")} WHERE id = $${params.length}`, params);

      // Se activa, propagar
      if (existing.activa) await propagarParaImovel(existing.imovel_id, calculados, merged);

      // Audit
      await pool.query(
        "INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores, dados_novos) VALUES ($1, $2, $3, $4, $5)",
        ["analises", c.req.param("id"), "UPDATE",
          JSON.stringify({ lucro_liquido: existing.lucro_liquido, retorno_anualizado: existing.retorno_anualizado }),
          JSON.stringify({ lucro_liquido: calculados.lucro_liquido, retorno_anualizado: calculados.retorno_anualizado })],
      );

      const { rows: [updated] } = await pool.query("SELECT * FROM analises WHERE id = $1", [c.req.param("id")]);
      return c.json(updated);
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });

  // ── Apagar análise ───────────────────────────────────────────
  app.delete("/analises/:id", async (c: any) => {
    try {
      const { rows: [existing] } = await pool.query("SELECT * FROM analises WHERE id = $1", [c.req.param("id")]);
      if (!existing) return c.json({ error: "Análise não encontrada" }, 404);

      await pool.query("DELETE FROM analises WHERE id = $1", [c.req.param("id")]);

      await pool.query(
        "INSERT INTO audit_log (tabela, registo_id, acao, dados_anteriores) VALUES ($1, $2, $3, $4)",
        ["analises", c.req.param("id"), "DELETE", JSON.stringify({ nome: existing.nome, imovel_id: existing.imovel_id })],
      );

      return c.json({ ok: true });
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });

  // ── Activar análise (desactiva as outras) ────────────────────
  app.post("/analises/:id/activar", async (c: any) => {
    try {
      const { rows: [analise] } = await pool.query("SELECT * FROM analises WHERE id = $1", [c.req.param("id")]);
      if (!analise) return c.json({ error: "Análise não encontrada" }, 404);

      // Desactivar todas do mesmo imóvel
      await pool.query("UPDATE analises SET activa = false WHERE imovel_id = $1", [analise.imovel_id]);
      // Activar esta
      await pool.query("UPDATE analises SET activa = true, updated_at = $1 WHERE id = $2", [new Date().toISOString(), c.req.param("id")]);

      // Propagar para imóvel
      await propagarParaImovel(analise.imovel_id, analise, analise);

      return c.json({ ok: true, analise_id: c.req.param("id") });
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });

  // ── Duplicar análise ─────────────────────────────────────────
  app.post("/analises/:id/duplicar", async (c: any) => {
    try {
      const { rows: [original] } = await pool.query("SELECT * FROM analises WHERE id = $1", [c.req.param("id")]);
      if (!original) return c.json({ error: "Análise não encontrada" }, 404);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const body = (await c.req.json().catch(() => ({}))) || {};
      const nome = body.nome || `${original.nome} (cópia)`;

      // Copiar todas as colunas excepto sistema
      const SKIP = new Set(["id", "activa", "versao", "created_at", "updated_at"]);
      const entries = Object.entries(original).filter(([k, v]) => !SKIP.has(k) && v !== null && v !== undefined);

      // Override nome
      const nomeIdx = entries.findIndex(([k]) => k === "nome");
      if (nomeIdx >= 0) entries[nomeIdx][1] = nome;

      const cols = ["id", "activa", "versao", ...entries.map(([k]) => k), "created_at", "updated_at"];
      const vals = cols.map((_, i) => `$${i + 1}`);
      const params = [id, false, 1, ...entries.map(([, v]) => typeof v === "object" && v !== null ? JSON.stringify(v) : v), now, now];

      await pool.query(`INSERT INTO analises (${cols.join(", ")}) VALUES (${vals.join(", ")})`, params);

      const { rows: [created] } = await pool.query("SELECT * FROM analises WHERE id = $1", [id]);
      return c.json(created, 201);
    } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  });

  // ── Stress Tests on-demand ───────────────────────────────────
  app.get("/analises/:id/stress", async (c: any) => {
    try {
      const { rows: [analise] } = await pool.query("SELECT * FROM analises WHERE id = $1", [c.req.param("id")]);
      if (!analise) return c.json({ error: "Análise não encontrada" }, 404);
      return c.json(calcStressTests(analise));
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });

  // ── Upload screenshot dos stress tests (Storage) ────────────
  app.post("/analises/:id/stress-screenshot", async (c: any) => {
    try {
      const id = c.req.param("id");
      const form = await c.req.formData();
      const file = form.get("screenshot");
      if (!file || typeof file === "string") return c.json({ error: "Ficheiro não recebido" }, 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const url = await uploadPublic("stress-tests", `${id}.png`, bytes, (file as any).type || "image/png");
      return c.json({ ok: true, path: url });
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });

  // ── Upload imagem do estudo de mercado externo (Alfredo) ────
  // Guardada em meta.alfredo_imagem dentro do JSONB analises.comparaveis
  app.post("/analises/:id/alfredo-imagem", async (c: any) => {
    try {
      const id = c.req.param("id");
      const form = await c.req.formData();
      const file = form.get("imagem");
      if (!file || typeof file === "string") {
        return c.json({ error: "Nenhum ficheiro válido (JPG, PNG, WEBP até 15MB)" }, 400);
      }
      const { rows: [analise] } = await pool.query("SELECT * FROM analises WHERE id = $1", [id]);
      if (!analise) return c.json({ error: "Análise não encontrada" }, 404);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const storagePath = `analises/${id}/alfredo_${Date.now()}.png`;
      const filePath = await uploadPublic("Imoveis", storagePath, bytes, (file as any).type || "image/png");

      // Mergir filePath em meta.alfredo_imagem (preservar tipologias e restantes meta)
      const raw = analise.comparaveis;
      let parsed: any;
      try { parsed = typeof raw === "string" ? JSON.parse(raw || "null") : raw; } catch { parsed = null; }
      let next: any;
      if (Array.isArray(parsed)) {
        next = { _version: 2, meta: { alfredo_imagem: filePath }, tipologias: parsed };
      } else if (parsed && typeof parsed === "object") {
        next = { ...parsed, _version: 2, meta: { ...(parsed.meta || {}), alfredo_imagem: filePath }, tipologias: parsed.tipologias || [] };
      } else {
        next = { _version: 2, meta: { alfredo_imagem: filePath }, tipologias: [] };
      }
      await pool.query(
        "UPDATE analises SET comparaveis = $1, updated_at = $2 WHERE id = $3",
        [JSON.stringify(next), new Date().toISOString(), id],
      );
      return c.json({ ok: true, alfredo_imagem: filePath });
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });

  app.delete("/analises/:id/alfredo-imagem", async (c: any) => {
    try {
      const id = c.req.param("id");
      const { rows: [analise] } = await pool.query("SELECT * FROM analises WHERE id = $1", [id]);
      if (!analise) return c.json({ error: "Análise não encontrada" }, 404);

      const raw = analise.comparaveis;
      let parsed: any;
      try { parsed = typeof raw === "string" ? JSON.parse(raw || "null") : raw; } catch { parsed = null; }
      const url = (parsed && !Array.isArray(parsed) && parsed.meta) ? parsed.meta.alfredo_imagem : null;

      // Best-effort: remover do Storage (path sob bucket "Imoveis").
      if (url && typeof url === "string" && url.includes("supabase.co/storage/")) {
        const match = url.match(/\/storage\/v1\/object\/public\/Imoveis\/(.+)$/);
        if (match) await removeFromStorage("Imoveis", match[1]);
      }

      let next: any;
      if (Array.isArray(parsed)) {
        next = { _version: 2, meta: {}, tipologias: parsed };
      } else if (parsed && typeof parsed === "object") {
        const { alfredo_imagem: _drop, ...metaRest } = parsed.meta || {};
        next = { ...parsed, _version: 2, meta: metaRest, tipologias: parsed.tipologias || [] };
      } else {
        next = { _version: 2, meta: {}, tipologias: [] };
      }
      await pool.query(
        "UPDATE analises SET comparaveis = $1, updated_at = $2 WHERE id = $3",
        [JSON.stringify(next), new Date().toISOString(), id],
      );
      return c.json({ ok: true });
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });
}
