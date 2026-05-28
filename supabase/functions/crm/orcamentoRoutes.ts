/**
 * API routes para o orçamento de obra (1 por imóvel).
 *   GET  /imoveis/:imovelId/orcamento-obra
 *   PUT  /imoveis/:imovelId/orcamento-obra
 *   GET  /imoveis/:imovelId/orcamento-obra/pdf   → 501 (PDF + documentLifecycle não portados)
 *
 * O PUT recalcula totais com calcOrcamentoObra() e propaga
 * total_geral para imoveis.custo_estimado_obra.
 * Port de src/db/orcamentoObraRoutes.js (Express -> Hono). Registado sob basePath /crm.
 */
import pool from "../_shared/pg.ts";
import { calcOrcamentoObra } from "../_shared/orcamentoObraEngine.ts";

// Stub para endpoints cujos handlers dependem de modulos ainda nao portados.
const notImplemented = (c: any) => c.json({ error: "Not implemented — porting em curso", todo: true }, 501);

export function registerOrcamentoRoutes(app: any) {
  // ── GET ──────────────────────────────────────────────────────
  app.get("/imoveis/:imovelId/orcamento-obra", async (c: any) => {
    try {
      const { rows: [imovel] } = await pool.query(
        "SELECT id, nome FROM imoveis WHERE id = $1",
        [c.req.param("imovelId")],
      );
      if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);

      const { rows: [orcamento] } = await pool.query(
        "SELECT * FROM orcamentos_obra WHERE imovel_id = $1",
        [c.req.param("imovelId")],
      );

      if (!orcamento) {
        return c.json({
          imovel_id: c.req.param("imovelId"),
          pisos: [],
          seccoes: {},
          notas: "",
          iva_perc: 23,
          regime_fiscal: "normal",
          zona_aru: false,
          tipo_obra: "remodelacao",
          bdi: { imprevistos_perc: 0, margem_perc: 0 },
          total_obra: 0,
          total_licenciamento: 0,
          total_geral: 0,
          total_iva: 0,
          total_iva_autoliquidado: 0,
          total_retencoes_irs: 0,
          total_a_pagar: 0,
          existe: false,
        });
      }

      return c.json({ ...orcamento, existe: true });
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
  });

  // ── PUT (upsert + recalcula + propaga) ───────────────────────
  app.put("/imoveis/:imovelId/orcamento-obra", async (c: any) => {
    try {
      const imovelId = c.req.param("imovelId");
      const { rows: [imovel] } = await pool.query("SELECT id FROM imoveis WHERE id = $1", [imovelId]);
      if (!imovel) return c.json({ error: "Imóvel não encontrado" }, 404);

      const body = (await c.req.json().catch(() => ({}))) || {};
      const pisos = Array.isArray(body.pisos) ? body.pisos : [];
      const seccoes = body.seccoes && typeof body.seccoes === "object" ? body.seccoes : {};
      const ivaPerc = Number.isFinite(Number(body.iva_perc)) ? Number(body.iva_perc) : 23;
      // v4: zona_aru + tipo_obra são os flags principais. regime_fiscal mantido para retrocompat.
      const zonaAru = !!body.zona_aru;
      const tipoObra = ["remodelacao", "construcao_nova"].includes(body.tipo_obra) ? body.tipo_obra : "remodelacao";
      // Derivar regime_fiscal espelhando os flags (legacy mantém).
      const regimeFiscal = zonaAru ? "aru" : "normal";
      const bdi = body.bdi && typeof body.bdi === "object" ? body.bdi : {};
      const notas = body.notas ?? "";
      const criadoPor = body.criado_por ?? null;

      const calc = calcOrcamentoObra({
        pisos, seccoes, iva_perc: ivaPerc, zona_aru: zonaAru, tipo_obra: tipoObra, bdi,
      });
      const t = calc.totais;

      const now = new Date().toISOString();

      const { rows: [saved] } = await pool.query(
        `INSERT INTO orcamentos_obra
           (imovel_id, pisos, seccoes, notas, iva_perc, regime_fiscal, zona_aru, tipo_obra, bdi,
            total_obra, total_licenciamento, total_geral,
            total_iva, total_iva_autoliquidado, total_retencoes_irs, total_a_pagar,
            criado_por, created_at, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8, $9::jsonb,
                 $10, $11, $12,
                 $13, $14, $15, $16,
                 $17, $18, $18)
         ON CONFLICT (imovel_id) DO UPDATE SET
           pisos = EXCLUDED.pisos,
           seccoes = EXCLUDED.seccoes,
           notas = EXCLUDED.notas,
           iva_perc = EXCLUDED.iva_perc,
           regime_fiscal = EXCLUDED.regime_fiscal,
           zona_aru = EXCLUDED.zona_aru,
           tipo_obra = EXCLUDED.tipo_obra,
           bdi = EXCLUDED.bdi,
           total_obra = EXCLUDED.total_obra,
           total_licenciamento = EXCLUDED.total_licenciamento,
           total_geral = EXCLUDED.total_geral,
           total_iva = EXCLUDED.total_iva,
           total_iva_autoliquidado = EXCLUDED.total_iva_autoliquidado,
           total_retencoes_irs = EXCLUDED.total_retencoes_irs,
           total_a_pagar = EXCLUDED.total_a_pagar,
           criado_por = COALESCE(EXCLUDED.criado_por, orcamentos_obra.criado_por),
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [imovelId, JSON.stringify(pisos), JSON.stringify(seccoes), notas, ivaPerc, regimeFiscal, zonaAru, tipoObra, JSON.stringify(bdi),
          calc.total_obra, calc.total_licenciamento, calc.total_geral,
          t.iva_geral, t.iva_autoliquidado, t.retencoes_irs, t.a_pagar,
          criadoPor, now],
      );

      // Propagar total_geral (bruto fiscal) para o imóvel.
      await pool.query(
        "UPDATE imoveis SET custo_estimado_obra = $1, updated_at = $2 WHERE id = $3",
        [calc.total_geral, now, imovelId],
      );

      return c.json({ ...saved, calc, existe: true });
    } catch (e) {
      console.error("[orcamento-obra] PUT erro:", e);
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  // ── GET PDF (generateOrcamentoObraPDF + documentLifecycle não portados) → 501 ──
  app.get("/imoveis/:imovelId/orcamento-obra/pdf", notImplemented);
}
