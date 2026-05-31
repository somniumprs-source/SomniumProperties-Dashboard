// Edge Function "dashboard" — port READ-ONLY (GET) dos handlers do dashboard do server.js Express.
// Traducao mecanica: logica de negocio identica; so muda a camada wrapper (Express req/res -> Hono).
import { createApp } from "../_shared/hono.ts";
import { requireAuth } from "../_shared/auth.ts";
import pool from "../_shared/pg.ts";
import {
  getNegócios as _getNegócios,
  getDespesas as _getDespesas,
  getImóveis as _getImóveis,
  getInvestidores as _getInvestidores,
  getConsultores as _getConsultores,
  getVisitas as _getVisitas,
  getTarefas as _getTarefas,
  round2,
} from "../_shared/queries.ts";

// pool.query e os mappers das queries resolvem para `any` (pg sem tipos), pelo que
// as funcoes importadas chegam como Promise<any>. Reanotamos aqui para Promise<any[]>
// para que os callbacks (reduce/filter/map) tenham parametros tipados sob strict.
type RegiaoArg = { regiao?: string | null } | { imovelId?: string; regiao?: string | null } | undefined;
const getNegócios = _getNegócios as (a?: RegiaoArg) => Promise<any[]>;
const getDespesas = _getDespesas as (a?: RegiaoArg) => Promise<any[]>;
const getImóveis = _getImóveis as (a?: RegiaoArg) => Promise<any[]>;
const getInvestidores = _getInvestidores as (a?: RegiaoArg) => Promise<any[]>;
const getConsultores = _getConsultores as (a?: RegiaoArg) => Promise<any[]>;
const getVisitas = _getVisitas as (a?: RegiaoArg) => Promise<any[]>;
const getTarefas = _getTarefas as (a?: RegiaoArg) => Promise<any[]>;

const app = createApp("/dashboard");

// Auth em codigo: o gateway verify_jwt=true aceita a anon key (publica); requireAuth
// exige um utilizador REAL (rejeita anon), como o middleware global do Render. _health isento.
app.use("*", async (c: any, next: any) => {
  if (c.req.path.endsWith("/_health")) return await next();
  return await requireAuth(c, next);
});

// ── Helper de regiao (semantica do middleware global do server.js) ──
// ?mercado= tem precedencia sobre header X-Regiao; conjunto valido { Coimbra, AMP }.
function regiaoFrom(c: any): string | null {
  const q = c.req.query("mercado") || c.req.query("regiao");
  const h = c.req.header("x-regiao");
  const v = (q && ["Coimbra", "AMP"].includes(q))
    ? q
    : (h && ["Coimbra", "AMP"].includes(h))
    ? h
    : null;
  return v;
}

// ── Constantes e helpers globais (port verbatim do server.js) ──
const MES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function getMesAtual() {
  const now = new Date();
  return { mesAbrev: MES_ABREV[now.getMonth()], ano: now.getFullYear(), month: now.getMonth() + 1 };
}

function isMonth(dateStr: any, year: number, month: number) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

function isYear(dateStr: any, year: number) {
  if (!dateStr) return false;
  return new Date(dateStr).getFullYear() === year;
}

function daysBetween(d1: any, d2: any) {
  if (!d1 || !d2) return null;
  const ms = (new Date(d2) as any) - (new Date(d1) as any);
  return ms > 0 ? round2(ms / 86400000) : null;
}

function avg(arr: any[]) {
  const valid = arr.filter((v) => v != null && !isNaN(v));
  return valid.length > 0 ? round2(valid.reduce((s, v) => s + v, 0) / valid.length) : null;
}

// Legacy getters (retornam vazio — DBs inacessiveis no Express tambem)
const getEmpreiteiros = async (): Promise<any[]> => [];
const getProjetos = async (): Promise<any[]> => [];
const getCampanhas = async (): Promise<any[]> => [];
const getObras = async (): Promise<any[]> => [];

// ════════════════════════════════════════════════════════════════
// FINANCEIRO
// ════════════════════════════════════════════════════════════════

async function kpisFinanceiro(regiao: string | null) {
  const [negócios, despesas] = await Promise.all([getNegócios({ regiao }), getDespesas({ regiao })]);

  const lucroEstimadoTotal = round2(negócios.reduce((s, n) => s + n.lucroEstimado, 0));
  const lucroRealTotal = round2(negócios.reduce((s, n) => s + n.lucroReal, 0));
  const lucroPendente = round2(lucroEstimadoTotal - lucroRealTotal);
  const pendentes = negócios.filter((n) => n.pagamentoEmFalta);
  const negóciosAtivos = negócios.filter((n) => n.fase !== "Vendido");

  // Burn rate — mensais + anuais ÷ 12
  const burnRate = round2(
    despesas.filter((d) => d.timing === "Mensalmente").reduce((s, d) => s + d.custoMensal, 0) +
      despesas.filter((d) => d.timing === "Anual").reduce((s, d) => s + (d.custoAnual || 0) / 12, 0) +
      despesas.filter((d) => d.timing === "Anual").reduce((s, d) => s + (d.custoAnual || 0) / 12, 0),
  );
  const despesasAnuaisTotal = round2(despesas.reduce((s, d) => s + d.custoAnual, 0));
  const runway = burnRate > 0 && lucroPendente > 0 ? round2(lucroPendente / burnRate) : null;

  // Por categoria
  const porCategoria: Record<string, any> = {};
  for (const n of negócios) {
    const k = n.categoria ?? "Outro";
    if (!porCategoria[k]) porCategoria[k] = { count: 0, lucroEst: 0, lucroReal: 0 };
    porCategoria[k].count++;
    porCategoria[k].lucroEst += n.lucroEstimado;
    porCategoria[k].lucroReal += n.lucroReal;
  }
  const categorias = Object.entries(porCategoria).map(([cat, v]: [string, any]) => ({
    categoria: cat,
    count: v.count,
    lucroEst: round2(v.lucroEst),
    lucroReal: round2(v.lucroReal),
  }));

  // Por fase
  const FASES = ["Fase de obras", "Fase de venda", "Vendido"];
  const porFase = FASES.map((f) => ({
    fase: f,
    count: negócios.filter((n) => n.fase === f).length,
    lucroEst: round2(negócios.filter((n) => n.fase === f).reduce((s, n) => s + n.lucroEstimado, 0)),
  }));

  // Alertas
  const hoje = new Date();
  const alertas: any[] = [];

  // Runway alert
  if (runway !== null && runway < 3) {
    alertas.push({ tipo: "critico", msg: `Runway crítico: ${runway.toFixed(1)} meses`, icon: "🔴" });
  } else if (runway !== null && runway < 6) {
    alertas.push({ tipo: "aviso", msg: `Runway baixo: ${runway.toFixed(1)} meses`, icon: "🟡" });
  }

  // Tranches atrasadas
  const tranchesAtrasadas: any[] = [];
  for (const n of negócios) {
    for (const p of (n.pagamentosFaseados || [])) {
      if (!p.recebido && p.data && new Date(p.data) < hoje) {
        tranchesAtrasadas.push({
          negocio: n.movimento,
          descricao: p.descricao,
          valor: parseFloat(p.valor) || 0,
          data: p.data,
          dias: Math.floor(((hoje as any) - (new Date(p.data) as any)) / 86400000),
        });
      }
    }
  }
  if (tranchesAtrasadas.length > 0) {
    const totalAtrasado = round2(tranchesAtrasadas.reduce((s, t) => s + t.valor, 0));
    alertas.push({
      tipo: "aviso",
      msg: `${tranchesAtrasadas.length} tranche(s) atrasada(s): ${totalAtrasado.toLocaleString("pt-PT")} €`,
      icon: "⏰",
    });
  }

  // Concentração de risco
  const topDeal = negócios.reduce(
    (max, n) => (n.lucroEstimado > max.lucroEstimado ? n : max),
    { lucroEstimado: 0 } as any,
  );
  const concentracao = lucroEstimadoTotal > 0 ? round2(topDeal.lucroEstimado / lucroEstimadoTotal * 100) : 0;
  if (concentracao > 60) {
    alertas.push({
      tipo: "aviso",
      msg: `${concentracao}% do pipeline concentrado em "${topDeal.movimento}"`,
      icon: "⚠️",
    });
  }

  // YTD
  const ytdReal = lucroRealTotal;
  const ytdDespesas = round2(burnRate * (hoje.getMonth() + 1));
  const ytdResultado = round2(ytdReal - ytdDespesas);

  // Enrich negociosLista with relation names (defensive)
  let negociosEnriquecidos = negócios;
  try {
    const [imoveis, consultores, investidores] = await Promise.all([
      getImóveis(),
      getConsultores(),
      getInvestidores(),
    ]);
    const imovelMap = Object.fromEntries(imoveis.map((i) => [i.id, i.nome]));
    const consultorMap = Object.fromEntries(consultores.map((c) => [c.id, c.nome]));
    const investidorMap = Object.fromEntries(investidores.map((i) => [i.id, i.nome]));
    negociosEnriquecidos = negócios.map((n) => ({
      ...n,
      imovelNome: n.imovel?.[0] ? (imovelMap[n.imovel[0]] || null) : null,
      consultorNome: n.consultorIds?.[0] ? (consultorMap[n.consultorIds[0]] || null) : null,
      investidorNome: n.investidor?.[0] ? (investidorMap[n.investidor[0]] || null) : null,
    }));
  } catch (e: any) {
    console.error("[financeiro] Enrich error:", e.message);
  }

  return {
    lucroEstimadoTotal,
    lucroRealTotal,
    lucroPendente,
    burnRate,
    despesasAnuaisTotal,
    runway,
    negóciosAtivos: negóciosAtivos.length,
    negociosPendentes: pendentes.length,
    totalNegócios: negócios.length,
    categorias,
    porFase,
    negociosLista: negociosEnriquecidos,
    alertas,
    tranchesAtrasadas,
    concentracao,
    ytd: { real: ytdReal, despesas: ytdDespesas, resultado: ytdResultado },
  };
}

app.get("/kpis/financeiro", async (c: any) => {
  try {
    const regiao = regiaoFrom(c);
    return c.json(await kpisFinanceiro(regiao));
  } catch (err: any) {
    console.error("[financeiro]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ── Despesas operacionais ────────────────────────────────────────
app.get("/financeiro/despesas", async (c: any) => {
  try {
    const despesas = await getDespesas({ regiao: regiaoFrom(c) });

    const recorrentes = despesas.filter((d) => d.timing === "Mensalmente");
    const anuais = despesas.filter((d) => d.timing === "Anual");
    const unicaVez = despesas.filter((d) => d.timing === "Único");
    // Burn rate = mensais + anuais ÷ 12
    const burnRate = round2(
      recorrentes.reduce((s, d) => s + d.custoMensal, 0) +
        anuais.reduce((s, d) => s + (d.custoAnual || 0) / 12, 0),
    );

    const porCategoria: Record<string, any> = {};
    for (const d of despesas) {
      const k = d.categoria ?? "Outros";
      if (!porCategoria[k]) porCategoria[k] = { custoMensal: 0, custoAnual: 0, count: 0 };
      porCategoria[k].custoMensal += d.custoMensal;
      porCategoria[k].custoAnual += d.custoAnual;
      porCategoria[k].count++;
    }
    const categorias = Object.entries(porCategoria)
      .map(([cat, v]: [string, any]) => ({
        categoria: cat,
        custoMensal: round2(v.custoMensal),
        custoAnual: round2(v.custoAnual),
        count: v.count,
      }))
      .sort((a, b) => b.custoAnual - a.custoAnual);

    // Total anual = subscrições projectadas + únicos/registados do ano corrente
    const anoActual = new Date().getFullYear();
    const totalAnual = round2(
      recorrentes.reduce((s, d) => s + (d.custoMensal || 0) * 12, 0) +
        anuais.reduce((s, d) => s + (d.custoAnual || 0), 0) +
        [...unicaVez, ...despesas.filter((d) => d.timing === "Registado")]
          .filter((d) => d.data && new Date(d.data).getFullYear() === anoActual)
          .reduce((s, d) => s + (d.custoMensal || d.custoAnual || 0), 0),
    );

    return c.json({
      burnRate,
      burnRateAnual: round2(burnRate * 12),
      totalAnual,
      recorrentes,
      anuais,
      unicaVez,
      todas: despesas,
      categorias,
    });
  } catch (err: any) {
    console.error("[financeiro/despesas]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ── Cash Flow & Runway ───────────────────────────────────────────
async function financeiroCashflow(regiao: string | null) {
  const [negócios, despesas] = await Promise.all([getNegócios({ regiao }), getDespesas({ regiao })]);

  const pendentes = negócios.filter((n) => n.pagamentoEmFalta);
  const recebidos = negócios.filter((n) => !n.pagamentoEmFalta && n.lucroReal > 0);
  const burnRate = round2(
    despesas.filter((d) => d.timing === "Mensalmente").reduce((s, d) => s + d.custoMensal, 0) +
      despesas.filter((d) => d.timing === "Anual").reduce((s, d) => s + (d.custoAnual || 0) / 12, 0),
  );

  const fatExpectavel = round2(negócios.reduce((s, n) => s + n.lucroEstimado, 0));
  const fatReal = round2(negócios.reduce((s, n) => s + n.lucroReal, 0));
  const lucroPendente = round2(fatExpectavel - fatReal);
  const lucroRecebido = fatReal;
  const runway = burnRate > 0 && lucroPendente > 0 ? round2(lucroPendente / burnRate) : null;

  const pendentesOrdenados = [...pendentes].sort((a, b) => {
    const da = a.dataEstimada ?? a.dataVenda ?? "9999";
    const db = b.dataEstimada ?? b.dataVenda ?? "9999";
    return da.localeCompare(db);
  });

  return { lucroPendente, lucroRecebido, burnRate, runway, pendentes: pendentesOrdenados, recebidos };
}

app.get("/financeiro/cashflow", async (c: any) => {
  try {
    const regiao = regiaoFrom(c);
    return c.json(await financeiroCashflow(regiao));
  } catch (err: any) {
    console.error("[financeiro/cashflow]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ── dummy endpoints kept for /api/kpis aggregate compat ─────────
app.get("/financeiro/pl", (c: any) => c.json({}));
app.get("/financeiro/budget", (c: any) => c.json({ linhas: [] }));

// ── Conta Corrente (extrato cronológico) ─────────────────────────
app.get("/financeiro/conta-corrente", async (c: any) => {
  try {
    const regiao = regiaoFrom(c);
    const [negócios, despesasAll] = await Promise.all([getNegócios({ regiao }), getDespesas({ regiao })]);
    const movimentos: any[] = [];

    // Entradas: tranches recebidas de projectos
    for (const n of negócios) {
      const pags = n.pagamentosFaseados || [];
      for (const p of pags) {
        if (p.recebido && parseFloat(p.valor) > 0) {
          movimentos.push({
            tipo: "entrada",
            descricao: `${n.movimento} — ${p.descricao || "Pagamento"}`,
            categoria: n.categoria,
            valor: parseFloat(p.valor),
            data: p.data || n.data || "2026-01-01",
          });
        }
      }
      // Negócios sem tranches mas com lucroReal
      if (pags.length === 0 && n.lucroReal > 0) {
        movimentos.push({
          tipo: "entrada",
          descricao: n.movimento,
          categoria: n.categoria,
          valor: n.lucroReal,
          data: n.dataVenda || n.data || "2026-01-01",
        });
      }
    }

    // Saídas: despesas Único + Registado (pagamentos efectivos já registados)
    for (const d of despesasAll) {
      if (["Único", "Registado"].includes(d.timing) && d.data) {
        const valor = d.custoMensal || d.custoAnual || 0;
        if (valor > 0) {
          movimentos.push({
            tipo: "saida",
            descricao: d.movimento,
            categoria: d.categoria,
            valor,
            data: d.data,
          });
        }
      }
    }

    // Saídas projectadas: subscrições Mensalmente/Anual debitadas automaticamente
    const hoje = new Date();
    const hojeStr = hoje.toISOString().slice(0, 10);

    // Dedupe: se já existe Registado para (movimento, ano-mes) salta a projecção
    const registadasJaContadas = new Set<string>();
    for (const d of despesasAll) {
      if (d.timing === "Registado" && d.data) {
        registadasJaContadas.add(`${d.movimento}|${d.data.slice(0, 7)}`);
      }
    }

    for (const d of despesasAll) {
      if (!d.data) continue;
      const baseDt = new Date(d.data);
      if (isNaN(baseDt as any)) continue;
      const diaPagamento = baseDt.getDate();

      if (d.timing === "Mensalmente") {
        const valor = d.custoMensal || 0;
        if (valor <= 0) continue;
        const cursor = new Date(baseDt.getFullYear(), baseDt.getMonth(), 1);
        const fimIter = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        while (cursor <= fimIter) {
          const ano = cursor.getFullYear();
          const mes = cursor.getMonth() + 1;
          const ultimoDiaMes = new Date(ano, mes, 0).getDate();
          const dia = Math.min(diaPagamento, ultimoDiaMes);
          const dataMov = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
          if (dataMov >= d.data && dataMov <= hojeStr) {
            const key = `${d.movimento}|${dataMov.slice(0, 7)}`;
            if (!registadasJaContadas.has(key)) {
              movimentos.push({
                tipo: "saida",
                descricao: d.movimento,
                categoria: d.categoria,
                valor,
                data: dataMov,
                projetado: true,
              });
            }
          }
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else if (d.timing === "Anual") {
        const valor = d.custoAnual || d.custoMensal || 0;
        if (valor <= 0) continue;
        const cursor = new Date(baseDt);
        while (cursor <= hoje) {
          const dataMov = cursor.toISOString().slice(0, 10);
          if (dataMov >= d.data && dataMov <= hojeStr) {
            const key = `${d.movimento}|${dataMov.slice(0, 7)}`;
            if (!registadasJaContadas.has(key)) {
              movimentos.push({
                tipo: "saida",
                descricao: d.movimento,
                categoria: d.categoria,
                valor,
                data: dataMov,
                projetado: true,
              });
            }
          }
          cursor.setFullYear(cursor.getFullYear() + 1);
        }
      }
    }

    // Filtrar a partir de 16/04/2026 (data de início da conta corrente)
    const DATA_INICIO = "2026-04-16";
    const movimentosFiltrados = movimentos.filter((m) => m.data >= DATA_INICIO);

    // Ordenar cronologicamente
    movimentosFiltrados.sort((a, b) => a.data.localeCompare(b.data));

    // Calcular saldo corrente
    let saldo = 0;
    for (const m of movimentosFiltrados) {
      saldo += m.tipo === "entrada" ? m.valor : -m.valor;
      m.saldo = round2(saldo);
    }

    return c.json({ movimentos: movimentosFiltrados, saldo: round2(saldo), dataInicio: DATA_INICIO });
  } catch (err: any) {
    console.error("[conta-corrente]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ── Aging de pagamentos faseados ─────────────────────────────────
app.get("/financeiro/aging", async (c: any) => {
  try {
    const negocios = await getNegócios();
    const hoje = new Date();
    const buckets: any = { overdue: [], b30: [], b60: [], b90: [], b90plus: [] };
    for (const n of negocios) {
      for (const p of (n.pagamentosFaseados || [])) {
        if (p.recebido || !p.data) continue;
        const dt = new Date(p.data);
        const dias = Math.floor(((dt as any) - (hoje as any)) / 86400000);
        const item = {
          negocio: n.movimento,
          categoria: n.categoria,
          descricao: p.descricao,
          valor: parseFloat(p.valor) || 0,
          data: p.data,
          dias,
        };
        if (dias < 0) buckets.overdue.push(item);
        else if (dias <= 30) buckets.b30.push(item);
        else if (dias <= 60) buckets.b60.push(item);
        else if (dias <= 90) buckets.b90.push(item);
        else buckets.b90plus.push(item);
      }
    }
    const summary = [
      { label: "Atrasado", count: buckets.overdue.length, total: round2(buckets.overdue.reduce((s: number, p: any) => s + p.valor, 0)), color: "red" },
      { label: "< 30 dias", count: buckets.b30.length, total: round2(buckets.b30.reduce((s: number, p: any) => s + p.valor, 0)), color: "yellow" },
      { label: "30-60 dias", count: buckets.b60.length, total: round2(buckets.b60.reduce((s: number, p: any) => s + p.valor, 0)), color: "blue" },
      { label: "60-90 dias", count: buckets.b90.length, total: round2(buckets.b90.reduce((s: number, p: any) => s + p.valor, 0)), color: "indigo" },
      { label: "> 90 dias", count: buckets.b90plus.length, total: round2(buckets.b90plus.reduce((s: number, p: any) => s + p.valor, 0)), color: "gray" },
    ];
    return c.json({ summary, buckets });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ── Rentabilidade ────────────────────────────────────────────────
app.get("/financeiro/rentabilidade", async (c: any) => {
  try {
    const [negocios, imoveis, consultores, investidores] = await Promise.all([
      getNegócios(),
      getImóveis(),
      getConsultores(),
      getInvestidores(),
    ]);

    // Margem por modelo de negócio
    const porModelo: Record<string, any> = {};
    for (const n of negocios) {
      const k = n.categoria || "Outro";
      if (!porModelo[k]) porModelo[k] = { count: 0, lucroEst: 0, lucroReal: 0 };
      porModelo[k].count++;
      porModelo[k].lucroEst += n.lucroEstimado;
      porModelo[k].lucroReal += n.lucroReal;
    }
    const modelos = Object.entries(porModelo).map(([modelo, v]: [string, any]) => ({
      modelo,
      count: v.count,
      lucroEst: round2(v.lucroEst),
      lucroReal: round2(v.lucroReal),
      mediaEst: v.count > 0 ? round2(v.lucroEst / v.count) : 0,
    })).sort((a, b) => b.lucroEst - a.lucroEst);

    // Rentabilidade por consultor
    const consultorMap: Record<string, any> = {};
    for (const c2 of consultores) consultorMap[c2.id] = c2.nome;
    const porConsultor: Record<string, any> = {};
    for (const n of negocios) {
      for (const cid of (n.consultorIds || [])) {
        const nome = consultorMap[cid] || "Desconhecido";
        if (!porConsultor[nome]) porConsultor[nome] = { count: 0, lucroEst: 0, lucroReal: 0 };
        porConsultor[nome].count++;
        porConsultor[nome].lucroEst += n.lucroEstimado;
        porConsultor[nome].lucroReal += n.lucroReal;
      }
    }
    const consultoresRent = Object.entries(porConsultor).map(([nome, v]: [string, any]) => ({
      nome,
      count: v.count,
      lucroEst: round2(v.lucroEst),
      lucroReal: round2(v.lucroReal),
      mediaEst: v.count > 0 ? round2(v.lucroEst / v.count) : 0,
    })).sort((a, b) => b.lucroEst - a.lucroEst);

    // ROI por investidor
    const investidorMap: Record<string, any> = {};
    for (const i of investidores) investidorMap[i.id] = i;
    const porInvestidor: Record<string, any> = {};
    for (const n of negocios) {
      for (const iid of (n.investidor || [])) {
        const inv = investidorMap[iid];
        const nome = inv?.nome || "Desconhecido";
        if (!porInvestidor[nome]) {
          porInvestidor[nome] = { count: 0, lucroEst: 0, lucroReal: 0, capitalInvestido: inv?.montanteInvestido || 0 };
        }
        porInvestidor[nome].count++;
        porInvestidor[nome].lucroEst += n.lucroEstimado;
        porInvestidor[nome].lucroReal += n.lucroReal;
      }
    }
    const investidoresRent = Object.entries(porInvestidor).map(([nome, v]: [string, any]) => ({
      nome,
      count: v.count,
      lucroEst: round2(v.lucroEst),
      lucroReal: round2(v.lucroReal),
      capitalInvestido: round2(v.capitalInvestido),
    })).sort((a, b) => b.lucroEst - a.lucroEst);

    // Ciclo médio (dias de data_adicionado → data_proposta_aceite)
    const ciclos = imoveis
      .filter((i) => i.dataAdicionado && i.dataPropostaAceite)
      .map((i) => Math.floor(((new Date(i.dataPropostaAceite) as any) - (new Date(i.dataAdicionado) as any)) / 86400000))
      .filter((d) => d >= 0 && d < 365);
    const cicloMedio = ciclos.length > 0 ? round2(ciclos.reduce((s, d) => s + d, 0) / ciclos.length) : null;

    // Concentração de risco
    const totalPipeline = negocios.reduce((s, n) => s + n.lucroEstimado, 0);
    const topDeal = negocios.reduce(
      (max, n) => (n.lucroEstimado > max.lucroEstimado ? n : max),
      { lucroEstimado: 0 } as any,
    );
    const concentracao = totalPipeline > 0 ? round2(topDeal.lucroEstimado / totalPipeline * 100) : 0;

    return c.json({
      modelos,
      consultores: consultoresRent,
      investidores: investidoresRent,
      cicloMedio,
      cicloCount: ciclos.length,
      concentracao,
      topDeal: topDeal.movimento || null,
      totalPipeline: round2(totalPipeline),
    });
  } catch (err: any) {
    console.error("[financeiro/rentabilidade]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

app.get("/financeiro/historico", async (c: any) => {
  try {
    const negócios = await getNegócios();
    // Agrupamos por mês de dataVenda ou data
    const porMes: Record<string, any> = {};
    for (const n of negócios) {
      const d = n.dataVenda ?? n.data;
      if (!d) continue;
      const dt2 = new Date(d);
      const key = `${dt2.getFullYear()}-${String(dt2.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MES_ABREV[dt2.getMonth()]} ${String(dt2.getFullYear()).slice(2)}`;
      if (!porMes[key]) porMes[key] = { label, lucroEst: 0, lucroReal: 0, count: 0 };
      porMes[key].lucroEst += n.lucroEstimado;
      porMes[key].lucroReal += n.lucroReal;
      porMes[key].count++;
    }
    const meses = Object.entries(porMes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]: [string, any]) => ({ ...v, lucroEst: round2(v.lucroEst), lucroReal: round2(v.lucroReal) }));
    return c.json({ meses });
  } catch (err: any) {
    console.error("[financeiro/historico]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// COMERCIAL
// ════════════════════════════════════════════════════════════════
const ESTADOS_NEGATIVOS = ["Descartado", "Nao interessa", "Não interessa", "Cancelado"];

const FUNIL_IMOVEIS = [
  "Em Análise",
  "Visita Marcada",
  "Follow UP",
  "Estudo de VVR",
  "Enviar proposta ao investidor",
  "Wholesaling",
  "Negócio em Curso",
];

const FUNIL_INVESTIDORES = [
  "Pendente de Aprovação",
  "Potencial Investidor",
  "Potencial",
  "Marcar call",
  "Marcar Call",
  "Call marcada",
  "Call Marcada",
  "Follow Up",
  "Investidor Qualificado em Carteira",
  "Investidor em espera",
  "Classificado",
  "Negociação de Deal",
  "Investidor em parceria",
  "Em Parceria",
  "Investidor Ativo",
];
const FUNIL_INV_LABEL: Record<string, string> = {
  "Potencial Investidor": "Potencial",
  "Marcar call": "Marcar Call",
  "Call marcada": "Call Marcada",
  "Investidor Qualificado em Carteira": "Em Carteira",
  "Investidor em espera": "Em Carteira",
  "Investidor em parceria": "Em Parceria",
  "Negociação de Deal": "Em Deal",
  "Investidor Ativo": "Ativo",
};

async function kpisComercial(regiao: string | null) {
  const [imoveisResult, investidores] = await Promise.all([
    getImóveis({ regiao }).catch(() => [] as any[]),
    getInvestidores({ regiao }),
  ]);
  const imoveis = imoveisResult;

  const ativos = imoveis.filter((i) => !ESTADOS_NEGATIVOS.some((e) => i.estado?.toLowerCase().includes(e.toLowerCase())));
  const negativos = imoveis.filter((i) => ESTADOS_NEGATIVOS.some((e) => i.estado?.toLowerCase().includes(e.toLowerCase())));

  const valorPotencial = round2(ativos.reduce((s, i) => s + i.askPrice, 0));
  const roiMedio = ativos.filter((i) => i.roi > 0).length > 0
    ? round2(ativos.filter((i) => i.roi > 0).reduce((s, i) => s + i.roi, 0) / ativos.filter((i) => i.roi > 0).length)
    : 0;

  // Investidores classificados A ou B
  const investClassificados = investidores.filter((i) => i.classificacao.some((c2: string) => ["A", "B"].includes(c2)));
  const investParceria = investidores.filter((i) => i.status === "Investidor em parceria");
  const capitalDisponivel = round2(investClassificados.reduce((s, i) => s + i.capitalMax, 0));

  // Funil imóveis
  const funilImoveis = FUNIL_IMOVEIS.map((estado) => ({
    estado,
    count: imoveis.filter((i) => i.estado === estado).length,
    valorTotal: round2(imoveis.filter((i) => i.estado === estado).reduce((s, i) => s + i.askPrice, 0)),
  })).filter((f) => f.count > 0);

  // Funil investidores — colapsa nomes antigos em labels normalizados
  const funilInvestidoresRaw: Record<string, number> = {};
  for (const status of FUNIL_INVESTIDORES) {
    const label = FUNIL_INV_LABEL[status] ?? status;
    const count = investidores.filter((i) => i.status === status).length;
    if (count > 0) funilInvestidoresRaw[label] = (funilInvestidoresRaw[label] ?? 0) + count;
  }
  const funilInvestidores = Object.entries(funilInvestidoresRaw).map(([status, count]) => ({ status, count }));

  // Por origem
  const porOrigem: Record<string, number> = {};
  for (const i of imoveis) {
    const k = i.origem ?? "Outro";
    porOrigem[k] = (porOrigem[k] ?? 0) + 1;
  }
  const origens = Object.entries(porOrigem).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  return {
    imóveisAtivos: ativos.length,
    imóveisDescartados: negativos.length,
    imóveisTotal: imoveis.length,
    valorPotencial,
    roiMedio,
    investidoresTotal: investidores.length,
    investClassificados: investClassificados.length,
    investParceria: investParceria.length,
    capitalDisponivel,
    funilImoveis,
    funilInvestidores,
    origens,
    imoveisAtivosLista: ativos.slice(0, 15),
  };
}

app.get("/kpis/comercial", async (c: any) => {
  try {
    const regiao = regiaoFrom(c);
    return c.json(await kpisComercial(regiao));
  } catch (err: any) {
    console.error("[comercial]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

app.get("/comercial/imoveis", async (c: any) => {
  try {
    const imoveis = await getImóveis().catch(() => [] as any[]);
    return c.json({ imoveis });
  } catch (err: any) {
    console.error("[comercial/imoveis]", err.message);
    return c.json({ imoveis: [] });
  }
});

app.get("/comercial/investidores", async (c: any) => {
  try {
    const investidores = await getInvestidores();

    // Grouped by classification
    const porClass: any = { A: [], B: [], C: [], D: [], "Sem class.": [] };
    for (const inv of investidores) {
      const classes = inv.classificacao;
      if (classes.includes("A")) porClass.A.push(inv);
      else if (classes.includes("B")) porClass.B.push(inv);
      else if (classes.includes("C")) porClass.C.push(inv);
      else if (classes.includes("D")) porClass.D.push(inv);
      else porClass["Sem class."].push(inv);
    }

    return c.json({ investidores, porClass });
  } catch (err: any) {
    console.error("[comercial/investidores]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

app.get("/comercial/empreiteiros", async (c: any) => {
  try {
    const empreiteiros = await getEmpreiteiros();
    return c.json({ empreiteiros });
  } catch (err: any) {
    console.error("[comercial/empreiteiros]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

app.get("/comercial/consultores", async (c: any) => {
  try {
    const [imoveis, consultoresNotion, negocios] = await Promise.all([
      getImóveis(),
      getConsultores(),
      getNegócios(),
    ]);
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth() + 1;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    const ESTADOS_NEG = new Set(["Descartado", "Nao interessa", "Não interessa", "Cancelado"]);
    const ESTADOS_AV = new Set([
      "Visita Marcada",
      "Follow UP",
      "Estudo de VVR",
      "Enviar proposta ao investidor",
      "Wholesaling",
      "Negócio em Curso",
      "CAEP",
      "Fix and Flip",
      "Em negociação",
      "Contrato fechado",
    ]);

    // Pipeline metrics grouped by consultant name
    const byNome: Record<string, any[]> = {};
    for (const im of imoveis) {
      const nome = im.nomeConsultor?.trim() || null;
      if (!nome) continue;
      if (!byNome[nome]) byNome[nome] = [];
      byNome[nome].push(im);
    }

    function calcMetrics(nome: string, leads: any[]) {
      const total = leads.length;
      const descartados = leads.filter((i) => ESTADOS_NEG.has(i.estado)).length;
      const ativos = total - descartados;
      const avancados = leads.filter((i) => ESTADOS_AV.has(i.estado)).length;
      const taxaDescarte = total > 0 ? round2(descartados / total * 100) : 0;
      const taxaConversao = total > 0 ? round2(avancados / total * 100) : 0;

      const valorPipeline = leads
        .filter((i) => !ESTADOS_NEG.has(i.estado))
        .reduce((s, i) => s + (i.valorProposta || i.askPrice || 0), 0);

      const rois = leads.filter((i) => i.roi > 0).map((i) => i.roi);
      const roiMedio = rois.length ? round2(rois.reduce((a, b) => a + b, 0) / rois.length) : null;

      const temposResposta = leads.map((i) => daysBetween(i.dataAdicionado, i.dataChamada)).filter((v) => v != null && v >= 0 && v < 365) as number[];
      const tempoRespostaMedio = temposResposta.length ? round2(temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length) : null;

      const temposNeg = leads.map((i) => daysBetween(i.dataChamada, i.dataProposta)).filter((v) => v != null && v >= 0 && v < 365) as number[];
      const tempoNegociacaoMedio = temposNeg.length ? round2(temposNeg.reduce((a, b) => a + b, 0) / temposNeg.length) : null;

      const leadsEsteMes = leads.filter((i) => isMonth(i.dataAdicionado, year, month)).length;
      const leadsMesAnterior = leads.filter((i) => isMonth(i.dataAdicionado, prevYear, prevMonth)).length;

      const datas = leads.map((i) => i.dataAdicionado).filter(Boolean).sort().reverse();
      const ultimoLead = datas[0] ?? null;
      const diasSemLead = ultimoLead ? Math.floor(((now as any) - (new Date(ultimoLead) as any)) / 86400000) : null;

      const funil = [
        { fase: "Lead adicionado", count: total },
        { fase: "1ª Chamada", count: leads.filter((i) => i.dataChamada).length },
        { fase: "Visita", count: leads.filter((i) => i.dataVisita).length },
        { fase: "Proposta enviada", count: leads.filter((i) => i.dataProposta).length },
        { fase: "Proposta aceite", count: leads.filter((i) => i.dataPropostaAceite).length },
      ];

      return {
        nome,
        total,
        ativos,
        descartados,
        avancados,
        taxaDescarte,
        taxaConversao,
        valorPipeline: round2(valorPipeline),
        roiMedio,
        tempoRespostaMedio,
        tempoNegociacaoMedio,
        leadsEsteMes,
        leadsMesAnterior,
        ultimoLead,
        diasSemLead,
        funil,
      };
    }

    // KPIs de faturação por consultor — indexado por page ID (relação directa)
    const fatById: Record<string, any[]> = {};
    for (const neg of negocios) {
      for (const cid of neg.consultorIds) {
        if (!fatById[cid]) fatById[cid] = [];
        fatById[cid].push(neg);
      }
    }

    function calcFatMetrics(consultorId: string) {
      const negs = fatById[consultorId] ?? [];
      const vendidos = negs.filter((n) => n.fase === "Vendido" || n.dataVenda);
      const emCurso = negs.filter((n) => n.fase !== "Vendido" && !n.dataVenda);
      const lucroRealizado = round2(vendidos.reduce((s, n) => s + (n.lucroReal || 0), 0));
      const lucroPotencial = round2(emCurso.reduce((s, n) => s + (n.lucroEstimado || 0), 0));
      const lucroTotal = round2(negs.reduce((s, n) => s + (n.lucroReal || n.lucroEstimado || 0), 0));
      const dealsEsteMes = negs.filter((n) => isMonth(n.dataVenda ?? n.data, year, month)).length;
      const taxaConversaoFat = negs.length > 0 ? round2(vendidos.length / negs.length * 100) : null;
      return {
        dealsTotal: negs.length,
        dealsVendidos: vendidos.length,
        dealsEmCurso: emCurso.length,
        dealsEsteMes,
        lucroRealizado,
        lucroPotencial,
        lucroTotal,
        taxaConversaoFat,
      };
    }

    // Merge: Notion consultores + pipeline metrics + faturação KPIs (por ID)
    const consultores: any[] = consultoresNotion.map((c2) => {
      const leads = byNome[c2.nome] ?? [];
      const metrics = calcMetrics(c2.nome, leads);
      const fat = calcFatMetrics(c2.id);
      const cumpreMeta = c2.metaMensalLeads > 0 ? round2(metrics.leadsEsteMes / c2.metaMensalLeads * 100) : null;
      return { ...c2, ...metrics, ...fat, cumpreMeta };
    });

    // Consultores no pipeline que não estão na lista Notion
    for (const [nome, leads] of Object.entries(byNome)) {
      if (!consultoresNotion.find((c2) => c2.nome === nome)) {
        consultores.push({
          ...calcMetrics(nome, leads),
          dealsTotal: 0,
          dealsVendidos: 0,
          dealsEsteMes: 0,
          lucroTotal: 0,
          taxaConversaoFat: null,
          status: null,
          tipo: null,
          classificacao: null,
          zonas: [],
          metaMensalLeads: 0,
          comissao: 0,
          cumpreMeta: null,
        });
      }
    }

    consultores.sort((a, b) => b.total - a.total);
    return c.json({ consultores, total: consultores.length });
  } catch (err: any) {
    console.error("[comercial/consultores]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

app.get("/comercial/projetos", async (c: any) => {
  try {
    const projetos = await getProjetos().catch(() => [] as any[]);
    return c.json({ projetos });
  } catch (err: any) {
    console.error("[comercial/projetos]", err.message);
    return c.json({ projetos: [] });
  }
});

app.get("/comercial/historico", async (c: any) => {
  try {
    const imoveis = await getImóveis().catch(() => [] as any[]);
    const now = new Date();

    // Imóveis adicionados por mês (últimos 12)
    const meses: any[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ano = d.getFullYear();
      const month = d.getMonth() + 1;
      const label = `${MES_ABREV[d.getMonth()]} ${String(ano).slice(2)}`;
      const adicionados = imoveis.filter((im) => isMonth(im.dataAdicionado, ano, month));
      const descartados = adicionados.filter((im) => ESTADOS_NEGATIVOS.some((e) => im.estado?.toLowerCase().includes(e.toLowerCase())));
      meses.push({
        label,
        adicionados: adicionados.length,
        descartados: descartados.length,
        ativos: adicionados.length - descartados.length,
      });
    }

    // Por tipologia
    const porTipologia: Record<string, any> = {};
    for (const im of imoveis) {
      const k = im.tipologia ?? "Outro";
      if (!porTipologia[k]) porTipologia[k] = { count: 0, valor: 0 };
      porTipologia[k].count++;
      porTipologia[k].valor += im.askPrice;
    }
    const tipologias = Object.entries(porTipologia)
      .map(([name, v]: [string, any]) => ({ name, count: v.count, valor: round2(v.valor) }))
      .sort((a, b) => b.count - a.count);

    return c.json({ meses, tipologias });
  } catch (err: any) {
    console.error("[comercial/historico]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// COMERCIAL — Métricas Temporais
// ════════════════════════════════════════════════════════════════
app.get("/comercial/metricas-temporais", async (c: any) => {
  try {
    const [imoveis, investidores, consultoresRaw, negocios] = await Promise.all([
      getImóveis().catch(() => [] as any[]),
      getInvestidores(),
      getConsultores().catch(() => [] as any[]),
      getNegócios(),
    ]);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // ── Períodos ─────────────────────────────────────────────
    const wDay = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (wDay === 0 ? 6 : wDay - 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const q = Math.ceil(month / 3);
    const quarterStart = new Date(year, (q - 1) * 3, 1);
    const quarterEnd = new Date(year, q * 3, 0, 23, 59, 59, 999);

    const semStart = month <= 6 ? new Date(year, 0, 1) : new Date(year, 6, 1);
    const semEnd = month <= 6 ? new Date(year, 5, 30, 23, 59, 59, 999) : new Date(year, 11, 31, 23, 59, 59, 999);

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    function inP(dateStr: any, start: Date, end: Date) {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= start && d <= end;
    }

    function avgDays(arr: any[]) {
      const valid = arr.filter((v) => v != null && v >= 0 && v < 365);
      return valid.length ? round2(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
    }

    // ── Volume de atividades por período ─────────────────────
    function volImoveis(s: Date, e: Date) {
      return {
        adicionados: imoveis.filter((i) => inP(i.dataAdicionado, s, e)).length,
        chamadas: imoveis.filter((i) => inP(i.dataChamada, s, e)).length,
        visitas: imoveis.filter((i) => inP(i.dataVisita, s, e)).length,
        estudos: imoveis.filter((i) => inP(i.dataEstudoMercado, s, e)).length,
        propostas: imoveis.filter((i) => inP(i.dataProposta, s, e)).length,
        propostasAceites: imoveis.filter((i) => inP(i.dataPropostaAceite, s, e)).length,
        negocios: negocios.filter((n) => inP(n.dataVenda, s, e) || inP(n.dataCompra, s, e)).length,
      };
    }
    const emFollowUp = imoveis.filter((i) => i.estado === "Follow UP").length;

    // ── Funil de conversão por coorte (data adicionado) ──────
    function funilCoorte(s: Date, e: Date) {
      const coorte = imoveis.filter((i) => inP(i.dataAdicionado, s, e));
      const n = coorte.length;
      return {
        adicionados: n,
        comChamada: coorte.filter((i) => i.dataChamada).length,
        comVisita: coorte.filter((i) => i.dataVisita).length,
        comEstudo: coorte.filter((i) => i.dataEstudoMercado).length,
        comProposta: coorte.filter((i) => i.dataProposta).length,
        comPropostaAceite: coorte.filter((i) => i.dataPropostaAceite).length,
        taxaChamada: n > 0 ? round2(coorte.filter((i) => i.dataChamada).length / n * 100) : null,
        taxaVisita: n > 0 ? round2(coorte.filter((i) => i.dataVisita).length / n * 100) : null,
        taxaProposta: n > 0 ? round2(coorte.filter((i) => i.dataProposta).length / n * 100) : null,
      };
    }

    // ── Ciclos médios Imóveis (todos os históricos) ───────────
    const ESTADOS_NEG_SET = new Set(["Descartado", "Nao interessa", "Não interessa", "Cancelado"]);
    const cicloImoveis = {
      leadAChamada: avgDays(imoveis.map((i) => daysBetween(i.dataAdicionado, i.dataChamada))),
      chamadaAVisita: avgDays(imoveis.map((i) => daysBetween(i.dataChamada, i.dataVisita))),
      visitaAEstudo: avgDays(imoveis.map((i) => daysBetween(i.dataVisita, i.dataEstudoMercado))),
      estudoAProposta: avgDays(imoveis.map((i) => daysBetween(i.dataEstudoMercado, i.dataProposta))),
      propostaAFecho: avgDays(imoveis.map((i) => daysBetween(i.dataProposta, i.dataPropostaAceite))),
    };

    // ── Motivos de descarte ────────────────────────────────────
    const motivosDescarte: Record<string, number> = {};
    const descartados = imoveis.filter((i) => ESTADOS_NEG_SET.has(i.estado));
    for (const i of descartados) {
      const m = i.motivoDescarte ?? "Não registado";
      motivosDescarte[m] = (motivosDescarte[m] ?? 0) + 1;
    }
    const motivosDescarteList = Object.entries(motivosDescarte)
      .map(([motivo, count]) => ({ motivo, count }))
      .sort((a, b) => b.count - a.count);

    // Descarte por origem
    const descarteOrigem: Record<string, any> = {};
    for (const i of imoveis) {
      const o = i.origem ?? "Outro";
      if (!descarteOrigem[o]) descarteOrigem[o] = { total: 0, descartados: 0 };
      descarteOrigem[o].total++;
      if (ESTADOS_NEG_SET.has(i.estado)) descarteOrigem[o].descartados++;
    }
    const descarteOrigemList = Object.entries(descarteOrigem)
      .map(([origem, v]: [string, any]) => ({ origem, total: v.total, descartados: v.descartados, taxaDescarte: round2(v.descartados / v.total * 100) }))
      .sort((a, b) => b.total - a.total);

    // ── Investidores ──────────────────────────────────────────
    const INV_PARCERIA = new Set(["Investidor em parceria", "Em Parceria", "Investidor Ativo"]);
    const emParceria = investidores.filter((i) => INV_PARCERIA.has(i.status));

    const invSemContacto60 = investidores
      .filter((i) => i.diasSemContacto != null && i.diasSemContacto > 60)
      .map((i) => ({ nome: i.nome, dias: i.diasSemContacto, status: i.status }));

    // LTV por investidor
    const ltvInvestidores = investidores.map((i) => {
      const negsInv = negocios.filter((n) => n.investidor.includes(i.id));
      const lucroRealizado = round2(negsInv.filter((n) => n.fase === "Vendido").reduce((s, n) => s + n.lucroReal, 0));
      const quotaSomnium = round2(negsInv.filter((n) => n.fase === "Vendido").reduce((s, n) => s + (n.quotaSomnium || n.lucroReal * 0.267), 0));
      return { nome: i.nome, status: i.status, montante: i.montanteInvestido, lucroRealizado, quotaSomnium, numeroNegocios: i.numeroNegocios };
    }).filter((i) => i.montante > 0 || i.lucroRealizado > 0).sort((a, b) => b.lucroRealizado - a.lucroRealizado || b.montante - a.montante);

    const capitalMobilizado = round2(investidores.reduce((s, i) => s + i.montanteInvestido, 0));
    const reinvestiram = emParceria.filter((i) => i.numeroNegocios > 1).length;

    const cicloInvestidor = {
      contactoAReuniao: avgDays(investidores.map((i) => daysBetween(i.dataPrimeiroContacto, i.dataReuniao))),
      reuniaoACapital: avgDays(investidores.map((i) => daysBetween(i.dataReuniao, i.dataCapitalTransferido))),
      totalContactoACapital: avgDays(investidores.map((i) => daysBetween(i.dataPrimeiroContacto, i.dataCapitalTransferido))),
    };

    // ── Consultores ────────────────────────────────────────────
    const CONS_ATIVOS_STATUS = new Set(["Aberto Parcerias", "Em Parceria", "Follow up", "Follow Up"]);
    const consAtivos = consultoresRaw.filter((c2) => CONS_ATIVOS_STATUS.has(c2.estatuto));
    const consInativos = consultoresRaw.filter((c2) => c2.estatuto === "Inativo").length;
    const consFollowUpAtrasado = consultoresRaw.filter((c2) =>
      c2.dataProximoFollowUp && new Date(c2.dataProximoFollowUp) < now && CONS_ATIVOS_STATUS.has(c2.estatuto)
    ).length;
    const consSemContacto30 = consultoresRaw.filter((c2) => {
      if (!CONS_ATIVOS_STATUS.has(c2.estatuto)) return false;
      if (!c2.dataFollowUp && !c2.dataProximoFollowUp) return true;
      const ultima = c2.dataProximoFollowUp ?? c2.dataFollowUp;
      const dias = ((now as any) - (new Date(ultima) as any)) / 86400000;
      return dias > 30;
    }).length;

    const ltvConsultores = consultoresRaw
      .filter((c2) => c2.lucroTotal > 0)
      .map((c2) => ({ nome: c2.nome, ltv: c2.lucroTotal, negocios: c2.dealsTotal, lucroRealizado: c2.lucroRealizado }))
      .sort((a, b) => b.ltv - a.ltv)
      .slice(0, 10);

    const cicloConsultor = {
      inicioA1Call: avgDays(consultoresRaw.filter((c2) => c2.dataInicio && c2.dataPrimeiraCall).map((c2) => daysBetween(c2.dataInicio, c2.dataPrimeiraCall))),
      call1ANegocio: avgDays(consultoresRaw.filter((c2) => c2.dataPrimeiraCall).map((c2) => {
        const primeiroLead = imoveis.filter((i) => i.nomeConsultor?.trim() === c2.nome && i.dataAdicionado).map((i) => i.dataAdicionado).sort()[0];
        return daysBetween(c2.dataPrimeiraCall, primeiroLead);
      })),
    };

    // ── Receita por modelo ─────────────────────────────────────
    function receitaModelo(s: Date, e: Date) {
      const neg = negocios.filter((n) => inP(n.dataVenda, s, e) && n.fase === "Vendido");
      const wh = neg.filter((n) => n.categoria === "Wholesalling");
      const caep = neg.filter((n) => n.categoria === "CAEP");
      return {
        totalNeg: neg.length,
        lucroWhTotal: round2(wh.reduce((s2, n) => s2 + n.lucroReal, 0)),
        lucroWhMedio: wh.length > 0 ? round2(wh.reduce((s2, n) => s2 + n.lucroReal, 0) / wh.length) : null,
        lucroCAEPTotal: round2(caep.reduce((s2, n) => s2 + n.lucroReal, 0)),
        quotaSomniumCAEP: round2(caep.reduce((s2, n) => s2 + (n.quotaSomnium || n.lucroReal * 0.267), 0)),
        negWH: wh.length,
        negCAEP: caep.length,
      };
    }

    return c.json({
      updatedAt: new Date().toISOString(),
      periodos: {
        semana: { de: weekStart.toISOString().slice(0, 10), ate: weekEnd.toISOString().slice(0, 10) },
        mes: { de: monthStart.toISOString().slice(0, 10), ate: monthEnd.toISOString().slice(0, 10) },
        trimestre: `Q${q} ${year}`,
        semestre: month <= 6 ? `S1 ${year}` : `S2 ${year}`,
        ano: year,
      },
      imoveis: {
        volume: {
          semanal: { ...volImoveis(weekStart, weekEnd), emFollowUp },
          mensal: { ...volImoveis(monthStart, monthEnd), emFollowUp },
          trimestral: { ...volImoveis(quarterStart, quarterEnd), emFollowUp },
          semestral: { ...volImoveis(semStart, semEnd), emFollowUp },
          anual: { ...volImoveis(yearStart, yearEnd), emFollowUp },
        },
        funil: {
          mensal: funilCoorte(monthStart, monthEnd),
          trimestral: funilCoorte(quarterStart, quarterEnd),
          semestral: funilCoorte(semStart, semEnd),
          anual: funilCoorte(yearStart, yearEnd),
          total: funilCoorte(new Date("2020-01-01"), yearEnd),
        },
        ciclo: cicloImoveis,
        motivosDescarte: motivosDescarteList,
        descarteOrigem: descarteOrigemList,
      },
      investidores: {
        alertas: { semContacto60d: invSemContacto60 },
        ltv: ltvInvestidores,
        capitalMobilizado,
        emParceria: emParceria.length,
        reinvestiram,
        ciclo: cicloInvestidor,
      },
      consultores: {
        alertas: { followUpAtrasado: consFollowUpAtrasado, inativos: consInativos, semContacto30d: consSemContacto30 },
        ltv: ltvConsultores,
        ciclo: cicloConsultor,
        totalAtivos: consAtivos.length,
      },
      receita: {
        mensal: receitaModelo(monthStart, monthEnd),
        trimestral: receitaModelo(quarterStart, quarterEnd),
        semestral: receitaModelo(semStart, semEnd),
        anual: receitaModelo(yearStart, yearEnd),
      },
    });
  } catch (err: any) {
    console.error("[metricas-temporais]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// MARKETING
// ════════════════════════════════════════════════════════════════
async function kpisMarketing() {
  const { ano, month } = getMesAtual();
  const campanhas = await getCampanhas();

  const doMes = campanhas.filter((c2) => isMonth(c2.dataInicio, ano, month));
  const ativas = campanhas.filter((c2) => c2.status === "Ativa");

  const investimentoTotal = doMes.reduce((s, c2) => s + c2.investimento, 0);
  const leadsGerados = doMes.reduce((s, c2) => s + c2.leadsGerados, 0);
  const sql = doMes.reduce((s, c2) => s + c2.leadsQualificados, 0);
  const receitaAtribuida = doMes.reduce((s, c2) => s + c2.receitaAtribuida, 0);
  const cpl = leadsGerados > 0 ? round2(investimentoTotal / leadsGerados) : 0;
  const taxaQualificacao = leadsGerados > 0 ? round2(sql / leadsGerados * 100) : 0;
  const roi = investimentoTotal > 0 ? round2((receitaAtribuida - investimentoTotal) / investimentoTotal * 100) : 0;

  return { leadsGerados, cpl, sql, taxaQualificacao, receitaAtribuida: round2(receitaAtribuida), roi, campanhasAtivas: ativas.slice(0, 10) };
}

app.get("/kpis/marketing", async (c: any) => {
  try {
    return c.json(await kpisMarketing());
  } catch (err: any) {
    console.error("[marketing]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

app.get("/marketing/historico", async (c: any) => {
  try {
    const campanhas = await getCampanhas();
    const now = new Date();

    // Leads por mês (últimos 12)
    const meses: any[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ano = d.getFullYear();
      const month = d.getMonth() + 1;
      const label = `${MES_ABREV[d.getMonth()]} ${String(ano).slice(2)}`;
      const camp = campanhas.filter((c2) => isMonth(c2.dataInicio, ano, month));
      const invest = camp.reduce((s, c2) => s + c2.investimento, 0);
      const leads = camp.reduce((s, c2) => s + c2.leadsGerados, 0);
      meses.push({
        label,
        leads,
        sql: camp.reduce((s, c2) => s + c2.leadsQualificados, 0),
        investimento: round2(invest),
        receita: round2(camp.reduce((s, c2) => s + c2.receitaAtribuida, 0)),
        cpl: leads > 0 ? round2(invest / leads) : 0,
      });
    }

    // Performance por canal
    const porCanal: Record<string, any> = {};
    for (const c2 of campanhas) {
      const k = c2.canal ?? "Outro";
      if (!porCanal[k]) porCanal[k] = { investimento: 0, leads: 0, sql: 0, receita: 0 };
      porCanal[k].investimento += c2.investimento;
      porCanal[k].leads += c2.leadsGerados;
      porCanal[k].sql += c2.leadsQualificados;
      porCanal[k].receita += c2.receitaAtribuida;
    }
    const canais = Object.entries(porCanal).map(([canal, v]: [string, any]) => ({
      canal,
      investimento: round2(v.investimento),
      leads: v.leads,
      sql: v.sql,
      receita: round2(v.receita),
      roi: v.investimento > 0 ? round2((v.receita - v.investimento) / v.investimento * 100) : 0,
      cpl: v.leads > 0 ? round2(v.investimento / v.leads) : 0,
    })).sort((a, b) => b.leads - a.leads);

    return c.json({ meses, canais });
  } catch (err: any) {
    console.error("[marketing/historico]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// OPERAÇÕES
// ════════════════════════════════════════════════════════════════
async function kpisOperacoes() {
  const { ano, month } = getMesAtual();
  const obras = await getObras();

  const obrasAtivas = obras.filter((o) => o.status === "Em curso");
  const obrasConcluidas = obras.filter((o) => o.status === "Concluída" && isMonth(o.dataFimReal, ano, month));
  const noPrazo = obrasConcluidas.filter((o) => o.dataFimReal && o.dataFimPrevista && o.dataFimReal <= o.dataFimPrevista).length;
  const percentNoPrazo = obrasConcluidas.length > 0 ? round2(noPrazo / obrasConcluidas.length * 100) : 0;
  const desvioVals = obras.filter((o) => o.status === "Concluída" && o.desvioPct !== 0).map((o) => o.desvioPct);
  const desvioMedio = desvioVals.length > 0 ? round2(desvioVals.reduce((s, v) => s + v, 0) / desvioVals.length) : 0;

  // Valor total em carteira
  const valorCarteira = obrasAtivas.reduce((s, o) => s + o.orcamentoAprovado, 0);
  // Nº não conformidades abertas
  const naoConformidades = obrasAtivas.reduce((s, o) => s + o.naoConformidades, 0);
  // Taxa de faturação de obras (valor faturado / orçamento)
  const totalOrcado = obrasAtivas.reduce((s, o) => s + o.orcamentoAprovado, 0);
  const totalFaturado = obrasAtivas.reduce((s, o) => s + o.valorFaturado, 0);
  const taxaFaturacao = totalOrcado > 0 ? round2(totalFaturado / totalOrcado * 100) : 0;

  return {
    obrasAtivas: obrasAtivas.length,
    obrasConcluidas: obrasConcluidas.length,
    percentNoPrazo,
    desvioMedio,
    valorCarteira: round2(valorCarteira),
    naoConformidades,
    taxaFaturacao,
    obrasAtivasLista: obrasAtivas.slice(0, 10),
  };
}

app.get("/kpis/operacoes", async (c: any) => {
  try {
    return c.json(await kpisOperacoes());
  } catch (err: any) {
    console.error("[operacoes]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

app.get("/operacoes/historico", async (c: any) => {
  try {
    const obras = await getObras();
    const now = new Date();

    // Obras concluídas por mês (últimos 12)
    const meses: any[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ano = d.getFullYear();
      const month = d.getMonth() + 1;
      const label = `${MES_ABREV[d.getMonth()]} ${String(ano).slice(2)}`;
      const conc = obras.filter((o) => o.status === "Concluída" && isMonth(o.dataFimReal, ano, month));
      const inic = obras.filter((o) => isMonth(o.dataInicioPrevista, ano, month));
      meses.push({
        label,
        concluidas: conc.length,
        iniciadas: inic.length,
        valorConcluido: round2(conc.reduce((s, o) => s + o.orcamentoAprovado, 0)),
        desvioMedio: conc.length > 0 ? round2(conc.reduce((s, o) => s + o.desvioPct, 0) / conc.length) : 0,
      });
    }

    // Por tipo de obra
    const porTipo: Record<string, any> = {};
    for (const o of obras) {
      const k = o.tipoObra ?? "Outro";
      if (!porTipo[k]) porTipo[k] = { count: 0, valor: 0 };
      porTipo[k].count++;
      porTipo[k].valor += o.orcamentoAprovado;
    }
    const tipos = Object.entries(porTipo).map(([name, v]: [string, any]) => ({ name, count: v.count, valor: round2(v.valor) })).sort((a, b) => b.count - a.count);

    // Status actual
    const STATUS_LIST = ["Planeada", "Em curso", "Pausada", "Concluída", "Cancelada"];
    const porStatus = STATUS_LIST.map((s) => ({ status: s, count: obras.filter((o) => o.status === s).length })).filter((s) => s.count > 0);

    return c.json({ meses, tipos, porStatus });
  } catch (err: any) {
    console.error("[operacoes/historico]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// DASHBOARD CENTRAL — fan-out (composicao directa, sem HTTP loopback)
// ════════════════════════════════════════════════════════════════
app.get("/kpis", async (c: any) => {
  try {
    const regiao = regiaoFrom(c);
    // NOTA: o Express compunha tambem analises via internalGet('/api/crm/analises-kpis'),
    // que pertence ao router CRM (fora do ambito desta funcao). O internalGet original
    // devolve {} em caso de erro; replicamos esse fallback.
    const [financeiro, comercial, marketing, operacoes, cashflow] = await Promise.all([
      kpisFinanceiro(regiao),
      kpisComercial(regiao),
      kpisMarketing(),
      kpisOperacoes(),
      financeiroCashflow(regiao),
    ]);
    const analises = {};
    const payload = {
      financeiro: { ...financeiro, cashflow, analises },
      comercial,
      marketing,
      operacoes,
      updatedAt: new Date().toISOString(),
    };
    return c.json(payload);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// CASH FLOW PROJETADO — Projeção mensal
// ════════════════════════════════════════════════════════════════
app.get("/financeiro/projecao", async (c: any) => {
  try {
    const [negocios, despesas] = await Promise.all([getNegócios(), getDespesas()]);
    const now = new Date();

    const burnRate = round2(
      despesas.filter((d) => d.timing === "Mensalmente").reduce((s, d) => s + d.custoMensal, 0) +
        despesas.filter((d) => d.timing === "Anual").reduce((s, d) => s + (d.custoAnual || 0) / 12, 0),
    );
    const despesasAnuais = despesas.filter((d) => d.timing === "Anual");

    // Projeção: próximos 12 meses
    const meses: any[] = [];
    let saldoAcumulado = 0;

    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const ano = d.getFullYear();
      const month = d.getMonth() + 1;
      const label = `${MES_ABREV[d.getMonth()]} ${String(ano).slice(2)}`;

      // Entradas previstas
      let totalEntradas = 0;
      let dealCount = 0;
      const negociosContados = new Set();

      for (const n of negocios) {
        if (!n.pagamentoEmFalta) continue;
        const pags = n.pagamentosFaseados || [];
        const pagsMes = pags.filter((p: any) => {
          if (p.recebido || !p.data) return false;
          const dt = new Date(p.data);
          return dt.getFullYear() === ano && dt.getMonth() + 1 === month;
        });
        if (pagsMes.length > 0) {
          totalEntradas += pagsMes.reduce((s: number, p: any) => s + (parseFloat(p.valor) || 0), 0);
          if (!negociosContados.has(n.id)) {
            dealCount++;
            negociosContados.add(n.id);
          }
        } else if (pags.length === 0) {
          // Sem faseados — usar data estimada como antes
          const data = n.dataEstimada ?? n.dataVenda;
          if (!data) continue;
          const dt = new Date(data);
          if (dt.getFullYear() === ano && dt.getMonth() + 1 === month) {
            totalEntradas += n.lucroEstimado;
            dealCount++;
          }
        }
      }
      totalEntradas = round2(totalEntradas);

      // Saídas: burn rate + despesas anuais que caem neste mês
      let totalSaidas = burnRate;
      for (const da of despesasAnuais) {
        if (da.data) {
          const dda = new Date(da.data);
          if (dda.getMonth() + 1 === month) totalSaidas += da.custoAnual || da.custoMensal || 0;
        }
      }
      totalSaidas = round2(totalSaidas);

      const liquido = round2(totalEntradas - totalSaidas);
      saldoAcumulado = round2(saldoAcumulado + liquido);

      meses.push({ label, entradas: totalEntradas, saidas: totalSaidas, liquido, saldoAcumulado, deals: dealCount });
    }

    // Break-even
    const despesasAnuaisTotal = round2(burnRate * 12 + despesasAnuais.reduce((s, d) => s + (d.custoAnual || 0), 0));
    const lucroMedioDeal = negocios.length > 0 ? round2(negocios.reduce((s, n) => s + n.lucroEstimado, 0) / negocios.length) : 0;
    const dealsParaBreakEven = lucroMedioDeal > 0 ? Math.ceil(despesasAnuaisTotal / lucroMedioDeal) : null;

    // P&L simplificado
    const receitaTotal = round2(negocios.reduce((s, n) => s + n.lucroReal, 0));
    const receitaEstimada = round2(negocios.reduce((s, n) => s + n.lucroEstimado, 0));
    const despesasTotalAno = despesasAnuaisTotal;
    const resultadoLiquido = round2(receitaTotal - (burnRate * (now.getMonth() + 1)));
    const resultadoEstimado = round2(receitaEstimada - despesasTotalAno);

    return c.json({
      projecao: meses,
      burnRate,
      breakEven: { despesasAnuais: despesasAnuaisTotal, lucroMedioDeal, dealsNecessarios: dealsParaBreakEven },
      pl: {
        receitaReal: receitaTotal,
        receitaEstimada,
        despesasAteAgora: round2(burnRate * (now.getMonth() + 1)),
        despesasAnuaisTotal,
        resultadoLiquido,
        resultadoEstimado,
        mesesDecorridos: now.getMonth() + 1,
      },
    });
  } catch (err: any) {
    console.error("[financeiro/projecao]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// MÉTRICAS — Framework completo Wholesaling / Fix & Flip
// ════════════════════════════════════════════════════════════════
app.get("/metricas", async (c: any) => {
  try {
    const regiao = regiaoFrom(c);
    const [imoveis, negocios, investidores, consultoresRaw, despesas, visitas] = await Promise.all([
      getImóveis({ regiao }).catch(() => [] as any[]),
      getNegócios({ regiao }),
      getInvestidores({ regiao }),
      getConsultores({ regiao }).catch(() => [] as any[]),
      getDespesas({ regiao }).catch(() => [] as any[]),
      getVisitas({ regiao }).catch(() => [] as any[]),
    ]);

    const { ano, month } = getMesAtual();
    const now = new Date();

    // Normalização: suporta nomes antigos e novos do Notion em simultâneo
    const ESTADOS_NEGATIVOS_SET = new Set([
      "Descartado", "Nao interessa", "Não interessa", "Cancelado",
    ]);
    const ESTADOS_AVANCADOS_SET = new Set([
      "Visita Marcada", "Necessidade de Visita",
      "Follow UP", "Follow Up após proposta",
      "Estudo de VVR",
      "Enviar proposta ao investidor",
      "Criar Proposta ao Proprietário", "Enviar proposta ao Proprietário",
      "Em negociação", "Proposta aceite",
      "Wholesaling", "Negócio em Curso", "CAEP", "Fix and Flip",
    ]);
    const ESTADOS_PARCERIA = new Set([
      "Investidor em parceria", "Em Parceria", "Investidor Ativo",
    ]);
    const ESTADOS_PROPOSTA_INV = new Set([
      "Investidor Qualificado em Carteira", "Investidor em espera", "Classificado", "Qualificado",
      "Em Qualificacao", "Em Qualificação",
      "Proposta Enviada", "Em Negociacao", "Em Negociação", "Negociação de Deal",
      "Investidor em parceria", "Em Parceria", "Investidor Ativo",
    ]);
    const ESTADOS_PIPELINE_INV = new Set([
      "Pendente de Aprovação",
      "Potencial", "Potencial Investidor",
      "Marcar Call", "Marcar call",
      "Call Marcada", "Call marcada",
      "Follow Up", "Classificado", "Investidor em espera", "Investidor Qualificado em Carteira",
    ]);

    const imoveisAtivos = imoveis.filter((i) => !ESTADOS_NEGATIVOS_SET.has(i.estado));
    const imoveisDescartados = imoveis.filter((i) => ESTADOS_NEGATIVOS_SET.has(i.estado));
    const imoveisDoMes = imoveis.filter((i) => isMonth(i.dataAdicionado, ano, month));

    // ── PIPELINE 1 — Imóveis ────────────────────────────────────
    const leadsGerados = imoveis.length;
    const analisados = imoveis.filter((i) => ESTADOS_AVANCADOS_SET.has(i.estado) || !!i.dataEstudoMercado).length;
    const propostasEnviadas = imoveis.filter((i) => !!i.dataProposta).length;
    const contratosAssinados = negocios.length;
    const escriturasConcluidas = negocios.filter((n) => n.fase === "Vendido").length;

    const taxaConversaoP1 = leadsGerados > 0 ? round2(contratosAssinados / leadsGerados * 100) : 0;

    const spreads = imoveis
      .filter((i) => i.askPrice > 0 && i.valorProposta > 0)
      .map((i) => (i.askPrice - i.valorProposta) / i.askPrice * 100);
    const spreadMedio = avg(spreads);

    const descontosCAEP = imoveis
      .filter((i) => i.valorVendaRemodelado > 0 && i.valorProposta > 0)
      .map((i) => (i.valorVendaRemodelado - i.valorProposta) / i.valorVendaRemodelado * 100);
    const descontoMercado = avg(descontosCAEP);

    const imoveisFF = imoveis.filter((i) => i.roi > 0);
    const abaixoLimiar = imoveisFF.length > 0 ? round2(imoveisFF.filter((i) => i.roi < 15).length / imoveisFF.length * 100) : null;

    const nDueDiligence = imoveis.filter((i) => i.estado === "Estudo de VVR").length;

    const temposNegociacao = imoveis
      .map((i) => daysBetween(i.dataChamada, i.dataPropostaAceite))
      .filter((v) => v != null && v < 365);
    const tempoMedioNegociacao = avg(temposNegociacao);

    const motivosDescarte: Record<string, number> = {};
    for (const i of imoveisDescartados) {
      const m = i.motivoDescarte ?? "Não registado";
      motivosDescarte[m] = (motivosDescarte[m] ?? 0) + 1;
    }

    const descarteOrigem: Record<string, any> = {};
    for (const i of imoveis) {
      const o = i.origem ?? "Outro";
      if (!descarteOrigem[o]) descarteOrigem[o] = { total: 0, descartados: 0 };
      descarteOrigem[o].total++;
      if (ESTADOS_NEGATIVOS_SET.has(i.estado)) descarteOrigem[o].descartados++;
    }
    const descarteOrigemList = Object.entries(descarteOrigem).map(([origem, v]: [string, any]) => ({
      origem, total: v.total, descartados: v.descartados,
      taxaDescarte: round2(v.descartados / v.total * 100),
    })).sort((a, b) => b.taxaDescarte - a.taxaDescarte);

    const modeloCount: Record<string, number> = { "Wholesaling": 0, "Fix & Flip": 0, "Mediação": 0, "Não definido": 0 };
    for (const i of imoveisAtivos) {
      const m = i.modeloNegocio ?? "Não definido";
      modeloCount[m] = (modeloCount[m] ?? 0) + 1;
    }

    // ── PIPELINE 2 — Consultores (derivado de Faturação) ────────
    const porCategoria: Record<string, any> = {};
    for (const n of negocios) {
      const k = n.categoria ?? "Outro";
      if (!porCategoria[k]) porCategoria[k] = { count: 0, lucroEst: 0, lucroReal: 0, fechados: 0 };
      porCategoria[k].count++;
      porCategoria[k].lucroEst += n.lucroEstimado;
      porCategoria[k].lucroReal += n.lucroReal;
      if (n.fase === "Vendido") porCategoria[k].fechados++;
    }
    const dealsPorCategoria = Object.entries(porCategoria).map(([cat, v]: [string, any]) => ({
      categoria: cat, count: v.count, fechados: v.fechados,
      lucroEst: round2(v.lucroEst), lucroReal: round2(v.lucroReal),
      lucroMedio: v.fechados > 0 ? round2(v.lucroReal / v.fechados) : null,
    }));

    const dealsComInvestidor = negocios.filter((n) => n.investidor.length > 0);
    const pctDealsCapitalPassivo = negocios.length > 0 ? round2(dealsComInvestidor.length / negocios.length * 100) : 0;

    const holdingPeriods = negocios
      .map((n) => daysBetween(n.dataCompra, n.dataVenda))
      .filter((v) => v != null && v > 0 && v < 730);
    const holdingMedio = avg(holdingPeriods);

    const negWholesaling = negocios.filter((n) => n.categoria === "Wholesalling");
    const negFF = negocios.filter((n) => ["Fix and Flip", "CAEP"].includes(n.categoria));
    const margemWholesaling = avg(negWholesaling.filter((n) => n.lucroReal > 0).map((n) => n.lucroReal));
    const margemFF = avg(negFF.filter((n) => n.lucroReal > 0).map((n) => n.lucroReal));

    const dealsMes = negocios.filter((n) => isMonth(n.dataVenda, ano, month) && n.fase === "Vendido");
    const receitaMes = round2(dealsMes.reduce((s, n) => s + n.lucroEstimado, 0));

    // ── PIPELINE 3 — Investidores ───────────────────────────────
    const total = investidores.length;
    const comReuniao = investidores.filter((i) => !!i.dataReuniao).length;
    const comNDA = investidores.filter((i) => i.ndaAssinado).length;
    const comCapital = investidores.filter((i) => i.montanteInvestido > 0).length;
    const emParceria = investidores.filter((i) => ESTADOS_PARCERIA.has(i.status));
    const comProposta = investidores.filter((i) => ESTADOS_PROPOSTA_INV.has(i.status)).length;

    const capitalCaptado = round2(investidores.reduce((s, i) => s + i.montanteInvestido, 0));
    const investClassif = investidores.filter((i) => i.classificacao.some((c2: string) => ["A", "B"].includes(c2)));
    const capitalDisponivel = investClassif.length > 0
      ? round2(investClassif.reduce((s, i) => s + i.capitalMax, 0))
      : round2(emParceria.reduce((s, i) => s + i.capitalMax, 0));
    const ticketMedio = comCapital > 0
      ? round2(investidores.filter((i) => i.montanteInvestido > 0).reduce((s, i) => s + i.montanteInvestido, 0) / comCapital)
      : null;

    const taxaConversaoInv = total > 0 ? round2(emParceria.length / total * 100) : 0;

    const taxaRetencao = emParceria.length > 0
      ? round2(emParceria.filter((i) => i.numeroNegocios > 1).length / emParceria.length * 100)
      : null;

    const temposCaptacao = investidores
      .map((i) => daysBetween(i.dataPrimeiroContacto, i.dataCapitalTransferido))
      .filter((v) => v != null && v < 730);
    const tempoMedioCaptacao = avg(temposCaptacao);

    const lucroEntregue = negocios
      .filter((n) => n.investidor.length > 0 && n.fase === "Vendido")
      .reduce((s, n) => s + n.lucroReal, 0);
    const roiEntregue = capitalCaptado > 0 ? round2(lucroEntregue / capitalCaptado * 100) : null;

    const ltvPorInvestidor = investidores
      .filter((i) => i.montanteInvestido > 0)
      .map((i) => ({ nome: i.nome, ltv: i.montanteInvestido, negocios: i.numeroNegocios, status: i.status }))
      .sort((a, b) => b.ltv - a.ltv);

    const capitalAlocado = round2(
      imoveisAtivos
        .filter((i) => ["Wholesaling", "Negócio em Curso"].includes(i.estado))
        .reduce((s, i) => s + i.askPrice, 0),
    );

    const investEmPipeline = investidores.filter((i) => ESTADOS_PIPELINE_INV.has(i.status)).length;

    // ── TRANSVERSAIS ────────────────────────────────────────────
    const pipelineValue = round2(imoveisAtivos.reduce((s, i) => s + i.askPrice, 0));
    const ratioDealFlowCapital = capitalDisponivel > 0 ? round2(pipelineValue / capitalDisponivel) : null;

    const dealsFechados = negocios.filter((n) => n.fase === "Vendido" && n.lucroEstimado > 0);
    const cumpreProjeccao = dealsFechados.length > 0
      ? round2(dealsFechados.filter((n) => n.lucroReal >= n.lucroEstimado * 0.8).length / dealsFechados.length * 100)
      : null;

    const ciclosCompletos: any[] = [];
    for (const n of negocios.filter((n) => n.fase === "Vendido" && n.dataVenda)) {
      const imovelRel = imoveis.find((i) => n.imovel.includes(i.id));
      if (imovelRel?.dataAdicionado) {
        const dias = daysBetween(imovelRel.dataAdicionado, n.dataVenda);
        if (dias && dias > 0 && dias < 730) ciclosCompletos.push(dias);
      }
    }
    const velocidadeCicloCompleto = avg(ciclosCompletos);

    const roe = capitalCaptado > 0 ? round2(lucroEntregue / capitalCaptado * 100) : null;

    const dealsSilmultaneos = negocios.filter((n) => n.fase !== "Vendido").length;

    // ════════════════════════════════════════════════════════════
    // TRACKER KPIs
    // ════════════════════════════════════════════════════════════
    const isQuarter = (dateStr: any, y: number, qq: number) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d.getFullYear() === y && Math.ceil((d.getMonth() + 1) / 3) === qq;
    };
    const isSemester = (dateStr: any, y: number, s: number) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d.getFullYear() === y && (s === 1 ? d.getMonth() < 6 : d.getMonth() >= 6);
    };
    const currentQuarter = Math.ceil(month / 3);
    const currentSemester = month <= 6 ? 1 : 2;
    const isThisWeek = (dateStr: any) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      const diffDays = Math.floor(((now as any) - (d as any)) / 86400000);
      return diffDays >= 0 && diffDays < 7;
    };

    // ── 1.1 RECEITA / FATURAÇÃO ─────────────────────────────────
    const negWH = negocios.filter((n) => n.categoria === "Wholesalling");
    const negWHFechados = negWH.filter((n) => n.fase === "Vendido");
    const negWHFechadosAno = negWHFechados.filter((n) => isYear(n.dataVenda, ano));
    const whReceitaAnual = round2(negWHFechadosAno.reduce((s, n) => s + (n.lucroReal || n.lucroEstimado), 0));
    const whReceitaTrimestral = round2(negWHFechados
      .filter((n) => isQuarter(n.dataVenda, ano, currentQuarter))
      .reduce((s, n) => s + (n.lucroReal || n.lucroEstimado), 0));
    const whReceitaSemestral = round2(negWHFechados
      .filter((n) => isSemester(n.dataVenda, ano, currentSemester))
      .reduce((s, n) => s + (n.lucroReal || n.lucroEstimado), 0));
    const whLucros = negWHFechados.filter((n) => n.lucroReal > 0 || n.lucroEstimado > 0).map((n) => n.lucroReal || n.lucroEstimado);
    const whFaturacaoMedia = avg(whLucros);
    const whFaturacaoMinima = whLucros.length > 0 ? Math.min(...whLucros) : null;
    const whPctAcimaMedia = whLucros.length > 0 && whFaturacaoMedia
      ? round2(whLucros.filter((v) => v >= whFaturacaoMedia).length / whLucros.length * 100)
      : null;

    const negCAEP = negocios.filter((n) => n.categoria === "CAEP");
    const negCAEPFechados = negCAEP.filter((n) => n.fase === "Vendido");
    const negCAEPAno = negCAEPFechados.filter((n) => isYear(n.dataVenda, ano));
    const caepQuotaSomnium = negCAEP.map((n) => n.quotaSomnium || round2((n.lucroReal || n.lucroEstimado) * 0.267));
    const caepQuotaTotal = round2(caepQuotaSomnium.reduce((s, v) => s + v, 0));
    const caepQuotaMedia = avg(caepQuotaSomnium.filter((v) => v > 0));
    const caepFaturacaoAnual = round2(negCAEPAno.reduce((s, n) => s + (n.quotaSomnium || (n.lucroReal || n.lucroEstimado) * 0.267), 0));
    const caepFaturacaoMedia = avg(negCAEPFechados.map((n) => n.quotaSomnium || (n.lucroReal || n.lucroEstimado) * 0.267).filter((v) => v > 0));
    const caepDesviosPrazo = negCAEP
      .filter((n) => n.dataVenda && n.dataEstimada)
      .map((n) => ({ movimento: n.movimento, desvio: daysBetween(n.dataEstimada, n.dataVenda) }));
    const caepEstVsReal = negCAEPFechados
      .filter((n) => n.lucroEstimado > 0)
      .map((n) => ({ movimento: n.movimento, estimado: n.lucroEstimado, real: n.lucroReal, desvio: n.lucroReal > 0 ? round2((n.lucroReal - n.lucroEstimado) / n.lucroEstimado * 100) : null }));

    const trackerReceita = {
      wholesaling: {
        receitaAnual: whReceitaAnual, receitaTrimestral: whReceitaTrimestral,
        receitaSemestral: whReceitaSemestral,
        faturacaoMedia: whFaturacaoMedia, faturacaoMinima: whFaturacaoMinima,
        pctAcimaMedia: whPctAcimaMedia,
        acumuladoVsMeta: round2(whReceitaAnual / 50000 * 100),
        metaAnual: 50000, metaTrimestral: 12500, metaSemestral: 25000,
        nDeals: negWH.length, nFechados: negWHFechados.length,
      },
      caep: {
        quotaSomniumTotal: caepQuotaTotal, quotaMediaPorNegocio: caepQuotaMedia,
        faturacaoAnual: caepFaturacaoAnual, faturacaoMedia: caepFaturacaoMedia,
        acumuladoVsMeta: round2(caepFaturacaoAnual / 50000 * 100),
        metaAnual: 50000,
        desviosPrazo: caepDesviosPrazo, lucroEstVsReal: caepEstVsReal,
        nDeals: negCAEP.length, nFechados: negCAEPFechados.length,
      },
    };

    // ── 1.2 TAXA DE CONVERSÃO ───────────────────────────────────
    const imComChamada = imoveis.filter((i) => !!i.dataChamada).length;
    const imComVisita = imoveis.filter((i) => !!i.dataVisita).length;
    const imComProposta = imoveis.filter((i) => !!i.dataProposta).length;
    const imComFecho = contratosAssinados;
    const convImAddToChamada = leadsGerados > 0 ? round2(imComChamada / leadsGerados * 100) : null;
    const convImChamadaToVisita = imComChamada > 0 ? round2(imComVisita / imComChamada * 100) : null;
    const convImVisitaToProposta = imComVisita > 0 ? round2(imComProposta / imComVisita * 100) : null;
    const convImPropostaToFecho = imComProposta > 0 ? round2(imComFecho / imComProposta * 100) : null;
    const convImGlobal = leadsGerados > 0 ? round2(imComFecho / leadsGerados * 100) : null;
    const mixWH = negocios.length > 0 ? round2(negWH.length / negocios.length * 100) : null;
    const mixCAEP = negocios.length > 0 ? round2(negCAEP.length / negocios.length * 100) : null;

    const invComReuniao = investidores.filter((i) => !!i.dataReuniao).length;
    const invClassificados = investidores.filter((i) => i.classificacao.length > 0).length;
    const invComInvestimento = investidores.filter((i) => i.montanteInvestido > 0).length;
    const convInvContactToReuniao = total > 0 ? round2(invComReuniao / total * 100) : null;
    const convInvReuniaoToClassif = invComReuniao > 0 ? round2(invClassificados / invComReuniao * 100) : null;
    const convInvClassifTo1st = invClassificados > 0 ? round2(invComInvestimento / invClassificados * 100) : null;
    const convInvGlobal = total > 0 ? round2(emParceria.length / total * 100) : null;

    const CONS_EM_PARCERIA = new Set(["Consultores em Parceria", "Acesso imoveis Off market"]);
    const CONS_ATIVOS_SET = new Set(["Aberto Parcerias", "Follow up", "Follow Up", "Acesso imoveis Off market", "Consultores em Parceria"]);
    const consComCall = consultoresRaw.filter((c2) => !!c2.dataPrimeiraCall).length;
    const consAtivos = consultoresRaw.filter((c2) => CONS_ATIVOS_SET.has(c2.estatuto)).length;
    const consEmParceria = consultoresRaw.filter((c2) => CONS_EM_PARCERIA.has(c2.estatuto)).length;
    const consComNegocio = consultoresRaw.filter((c2) => c2.lucroGerado > 0 || c2.imoveisEnviados > 0).length;
    const consComNegocioFechado = consultoresRaw.filter((c2) => c2.lucroGerado > 0).length;
    const convConsContactToCall = consultoresRaw.length > 0 ? round2(consComCall / consultoresRaw.length * 100) : null;
    const convConsCallToAtivo = consComCall > 0 ? round2(consAtivos / consComCall * 100) : null;
    const convConsAtivoToNegocio = consAtivos > 0 ? round2(consComNegocio / consAtivos * 100) : null;
    const convConsGlobal = consultoresRaw.length > 0 ? round2(consComNegocioFechado / consultoresRaw.length * 100) : null;

    const trackerConversao = {
      imoveis: {
        addToChamada: convImAddToChamada, metaAddToChamada: 80,
        chamadaToVisita: convImChamadaToVisita, metaChamadaToVisita: 35,
        visitaToProposta: convImVisitaToProposta, metaVisitaToProposta: 50,
        propostaToFecho: convImPropostaToFecho, metaPropostaToFecho: 35,
        global: convImGlobal, metaGlobal: 6,
        mixWH, mixCAEP,
        totais: { leads: leadsGerados, chamadas: imComChamada, visitas: imComVisita, propostas: imComProposta, fechos: imComFecho },
      },
      investidores: {
        contactToReuniao: convInvContactToReuniao, metaContactToReuniao: 40,
        reuniaoToClassificado: convInvReuniaoToClassif, metaReuniaoToClassificado: 50,
        classificadoTo1st: convInvClassifTo1st, metaClassificadoTo1st: 30,
        global: convInvGlobal, metaGlobal: 15,
        totais: { contactos: total, reunioes: invComReuniao, classificados: invClassificados, investidores: invComInvestimento, emParceria: emParceria.length },
      },
      consultores: {
        contactToCall: convConsContactToCall, metaContactToCall: 70,
        callToAtivo: convConsCallToAtivo, metaCallToAtivo: 30,
        ativoToNegocio: convConsAtivoToNegocio, metaAtivoToNegocio: 50,
        global: convConsGlobal, metaGlobal: 5,
        totais: { contactos: consultoresRaw.length, calls: consComCall, ativos: consAtivos, comNegocio: consComNegocio, comFecho: consComNegocioFechado },
      },
    };

    // ── 1.3 TICKET MÉDIO ────────────────────────────────────────
    const whLucroMedio = avg(negWHFechados.filter((n) => n.lucroReal > 0).map((n) => n.lucroReal)) || whFaturacaoMedia;
    const whLucroMinimo = negWHFechados.filter((n) => n.lucroReal > 0).length > 0
      ? Math.min(...negWHFechados.filter((n) => n.lucroReal > 0).map((n) => n.lucroReal))
      : whFaturacaoMinima;

    const caepCapitalMedioPorNegocio = avg(negCAEP.filter((n) => n.capitalTotal > 0).map((n) => n.capitalTotal));
    const caepCapitalMedioPorInvestidor = (() => {
      const caps = negCAEP.filter((n) => n.capitalTotal > 0 && n.nInvestidores > 0);
      return avg(caps.map((n) => n.capitalTotal / n.nInvestidores));
    })();
    const caepNMedioInvestidores = avg(negCAEP.filter((n) => n.nInvestidores > 0).map((n) => n.nInvestidores));
    const caepLucroSobreCapital = (() => {
      const caps = negCAEP.filter((n) => n.capitalTotal > 0);
      const lucro = caps.reduce((s, n) => s + (n.quotaSomnium || (n.lucroReal || n.lucroEstimado) * 0.267), 0);
      const capital = caps.reduce((s, n) => s + n.capitalTotal, 0);
      return capital > 0 ? round2(lucro / capital * 100) : null;
    })();
    const caepLucroPorMes = (() => {
      const deals = negCAEP.filter((n) => n.dataCompra && n.dataVenda);
      return avg(deals.map((n) => {
        const meses = (daysBetween(n.dataCompra, n.dataVenda) as number) / 30;
        const quota = n.quotaSomnium || (n.lucroReal || n.lucroEstimado) * 0.267;
        return meses > 0 ? round2(quota / meses) : null;
      }).filter((v) => v != null));
    })();
    const caepRoiInvestidor = avg(investidores.filter((i) => i.roiInvestidor > 0).map((i) => i.roiInvestidor));

    const consAskPriceMedio = avg(imoveis.filter((i) => i.nomeConsultor && i.askPrice > 0).map((i) => i.askPrice));
    const consLucroMedioGerado = avg(consultoresRaw.filter((c2) => c2.lucroGerado > 0).map((c2) => c2.lucroGerado));
    const pctNegociosViaConsultor = negocios.length > 0
      ? round2(negocios.filter((n) => n.consultorIds.length > 0).length / negocios.length * 100)
      : null;
    const rankingConsultores = consultoresRaw
      .filter((c2) => c2.lucroGerado > 0)
      .map((c2) => ({ nome: c2.nome, lucroGerado: c2.lucroGerado, classificacao: c2.classificacao }))
      .sort((a, b) => b.lucroGerado - a.lucroGerado);

    const trackerTicketMedio = {
      wholesaling: {
        lucroMedio: whLucroMedio, metaLucroMedio: 8333,
        lucroMinimo: whLucroMinimo, metaLucroMinimo: 5000, metaAlvo: 10000,
        pctAcimaMedia: whPctAcimaMedia,
      },
      caep: {
        capitalMedioPorNegocio: caepCapitalMedioPorNegocio,
        capitalMedioPorInvestidor: caepCapitalMedioPorInvestidor,
        nMedioInvestidores: caepNMedioInvestidores,
        lucroSomniumSobreCapital: caepLucroSobreCapital, metaLucroSobreCapital: 8,
        lucroSomniumPorMes: caepLucroPorMes, metaLucroPorMes: 2500,
        roiInvestidor: caepRoiInvestidor, metaRoiInvestidor: 20,
      },
      consultores: {
        askPriceMedio: consAskPriceMedio,
        lucroMedioGerado: consLucroMedioGerado, metaLucroMedio: 8000,
        pctNegociosViaConsultor, metaPctViaConsultor: 40,
        rankingValor: rankingConsultores.slice(0, 10),
      },
    };

    // ── 1.4 MARGEM DE LUCRO ────────────────────────────────────
    const margensPorNegocio = negocios.map((n) => {
      const imovelRel = imoveis.find((i) => n.imovel.includes(i.id));
      const askPrice = imovelRel?.askPrice || 0;
      const margemBruta = askPrice > 0 ? round2((n.lucroEstimado || 0) / askPrice * 100) : null;
      const margemLiquida = margemBruta != null ? round2(margemBruta * 0.79) : null;
      const desvioObra = n.custoRealObra > 0 && imovelRel?.custoObra > 0
        ? round2((n.custoRealObra - imovelRel.custoObra) / imovelRel.custoObra * 100)
        : null;
      return { movimento: n.movimento, categoria: n.categoria, margemBruta, margemLiquida, desvioObra };
    });

    const trackerMargem = {
      wholesaling: {
        margemBrutaMedia: avg(margensPorNegocio.filter((m) => m.categoria === "Wholesalling" && m.margemBruta != null).map((m) => m.margemBruta)),
        margemLiquidaMedia: avg(margensPorNegocio.filter((m) => m.categoria === "Wholesalling" && m.margemLiquida != null).map((m) => m.margemLiquida)),
        desvioObraMedia: avg(margensPorNegocio.filter((m) => m.categoria === "Wholesalling" && m.desvioObra != null).map((m) => m.desvioObra)),
      },
      caep: {
        roiMedio: avg(negCAEP.filter((n) => n.capitalTotal > 0).map((n) => {
          const lucro = n.lucroReal || n.lucroEstimado;
          return lucro > 0 ? round2(lucro / n.capitalTotal * 100) : null;
        }).filter((v) => v != null)),
        margemSomniumPct: 26.7,
        desvioObraMedia: avg(margensPorNegocio.filter((m) => m.categoria === "CAEP" && m.desvioObra != null).map((m) => m.desvioObra)),
      },
      porNegocio: margensPorNegocio.filter((m) => m.margemBruta != null),
    };

    // ── 2.1 CAC ─────────────────────────────────────────────────
    const CUSTO_HORA = 15;
    const CUSTOS_FIXOS_MENSAIS = 360.40;
    const burnRateMensal = round2(
      despesas.filter((d) => d.timing === "Mensalmente").reduce((s, d) => s + d.custoMensal, 0) +
        despesas.filter((d) => d.timing === "Anual").reduce((s, d) => s + (d.custoAnual || 0) / 12, 0),
    ) || CUSTOS_FIXOS_MENSAIS;
    const datasIniciais = [
      ...imoveis.map((i) => i.dataAdicionado).filter(Boolean),
      ...investidores.map((i) => i.dataPrimeiroContacto).filter(Boolean),
      ...consultoresRaw.map((c2) => c2.dataInicio || c2.dataPrimeiraCall).filter(Boolean),
    ].map((d) => new Date(d)).sort((a, b) => (a as any) - (b as any));
    const dataInicio = datasIniciais.length > 0 ? datasIniciais[0] : new Date(ano, 0, 1);
    const mesesOperacao = Math.max(1, Math.ceil(((now as any) - (dataInicio as any)) / (30.44 * 86400000)));
    const custoTotalOperacao = round2(burnRateMensal * mesesOperacao);

    const cacPorNegocioFechado = imComFecho > 0 ? round2(custoTotalOperacao / imComFecho) : null;
    const custoPorImovelAdd = leadsGerados > 0 ? round2(custoTotalOperacao / leadsGerados) : null;
    const custoPorVisita = imComVisita > 0 ? round2(custoTotalOperacao / imComVisita) : null;
    const custoPorEstudo = imoveis.filter((i) => !!i.dataEstudoMercado).length > 0
      ? round2(custoTotalOperacao / imoveis.filter((i) => !!i.dataEstudoMercado).length)
      : null;
    const chamadasPorVisita = imComVisita > 0 ? round2(imComChamada / imComVisita) : null;
    const visitasPorProposta = imComProposta > 0 ? round2(imComVisita / imComProposta) : null;
    const propostasPorNegocio = imComFecho > 0 ? round2(imComProposta / imComFecho) : null;

    const custoPorInvestidorAtivo = emParceria.length > 0 ? round2(custoTotalOperacao * 0.3 / emParceria.length) : null;
    const tempoAte1stInvest = avg(investidores
      .filter((i) => i.dataPrimeiroContacto && i.dataCapitalTransferido)
      .map((i) => daysBetween(i.dataPrimeiroContacto, i.dataCapitalTransferido))
      .filter((v) => v != null && v > 0 && v < 730));

    const custoPorConsultorAtivo = consAtivos > 0 ? round2(custoTotalOperacao * 0.2 / consAtivos) : null;
    const consDescontinuados = consultoresRaw.filter((c2) => c2.estatuto === "Cold Call" || !CONS_ATIVOS_SET.has(c2.estatuto)).length;
    const descontinuadosVsAtivos = consAtivos > 0 ? round2(consDescontinuados / consAtivos) : null;

    const receitaTotal = round2(negocios.reduce((s, n) => s + (n.lucroReal || n.lucroEstimado), 0));
    const ferramentasSobreReceita = receitaTotal > 0
      ? round2(burnRateMensal * mesesOperacao / receitaTotal * 100)
      : null;

    const trackerCAC = {
      constantes: { custoHora: CUSTO_HORA, custosFixosMensais: CUSTOS_FIXOS_MENSAIS, burnRateMensal, mesesOperacao, custoTotalOperacao },
      imoveis: {
        cacPorNegocio: cacPorNegocioFechado, metaCACNegocio: 600,
        custoPorImovel: custoPorImovelAdd, metaCustoPorImovel: 45,
        custoPorVisita, metaCustoPorVisita: 30,
        custoPorEstudo, metaCustoPorEstudo: 100,
        chamadasPorVisita, metaChamadasPorVisita: 3,
        visitasPorProposta, metaVisitasPorProposta: 2,
        propostasPorNegocio, metaPropostasPorNegocio: 3,
      },
      investidores: {
        custoPorInvestidorAtivo, metaCusto: 150,
        tempoAte1stInvest, metaTempo: 90,
      },
      consultores: {
        custoPorConsultorAtivo, metaCusto: 50,
        descontinuadosVsAtivos, metaRatio: 5,
      },
      ferramentas: {
        ferramentasSobreReceita, metaPct: 5,
      },
    };

    // ── 2.2 CICLO DE VENDAS ─────────────────────────────────────
    const cicloImLeadToChamada = avg(imoveis.map((i) => daysBetween(i.dataAdicionado, i.dataChamada)).filter((v) => v != null && v >= 0 && v < 365));
    const cicloImChamadaToVisita = avg(imoveis.map((i) => daysBetween(i.dataChamada, i.dataVisita)).filter((v) => v != null && v >= 0 && v < 365));
    const cicloImVisitaToEstudo = avg(imoveis.map((i) => daysBetween(i.dataVisita, i.dataEstudoMercado)).filter((v) => v != null && v >= 0 && v < 365));
    const cicloImEstudoToProposta = avg(imoveis.map((i) => daysBetween(i.dataEstudoMercado, i.dataProposta)).filter((v) => v != null && v >= 0 && v < 365));
    const cicloImPropostaToFecho = avg(imoveis.map((i) => daysBetween(i.dataProposta, i.dataPropostaAceite)).filter((v) => v != null && v >= 0 && v < 365));
    const cicloImLeadToFecho = avg(imoveis
      .filter((i) => i.dataAdicionado && i.dataPropostaAceite)
      .map((i) => daysBetween(i.dataAdicionado, i.dataPropostaAceite))
      .filter((v) => v != null && v >= 0 && v < 730));

    const fasesIm = [
      { fase: "Lead → Chamada", dias: cicloImLeadToChamada },
      { fase: "Chamada → Visita", dias: cicloImChamadaToVisita },
      { fase: "Visita → Estudo", dias: cicloImVisitaToEstudo },
      { fase: "Estudo → Proposta", dias: cicloImEstudoToProposta },
      { fase: "Proposta → Fecho", dias: cicloImPropostaToFecho },
    ].filter((f) => f.dias != null).sort((a, b) => (b.dias as number) - (a.dias as number));
    const faseMaiorDemora = fasesIm.length > 0 ? fasesIm[0] : null;

    const cicloInvContactoToReuniao = avg(investidores
      .map((i) => daysBetween(i.dataPrimeiroContacto, i.dataReuniao))
      .filter((v) => v != null && v >= 0 && v < 365));
    const cicloInvNegocioToAprovacao = avg(investidores
      .filter((i) => i.dataApresentacaoNegocio && i.dataAprovacaoNegocio)
      .map((i) => daysBetween(i.dataApresentacaoNegocio, i.dataAprovacaoNegocio))
      .filter((v) => v != null && v >= 0 && v < 365));
    const cicloInvContactoToCapital = tempoMedioCaptacao;

    const cicloConsCallToNegocio = avg(consultoresRaw
      .filter((c2) => c2.dataPrimeiraCall && c2.lucroGerado > 0)
      .map((c2) => {
        const dataRef = c2.dataFollowUp || c2.dataProximoFollowUp;
        return daysBetween(c2.dataPrimeiraCall, dataRef);
      })
      .filter((v) => v != null && v >= 0 && v < 365));
    const cicloConsFollowUpMedio = avg(consultoresRaw
      .filter((c2) => c2.dataFollowUp && c2.dataProximoFollowUp)
      .map((c2) => daysBetween(c2.dataFollowUp, c2.dataProximoFollowUp))
      .filter((v) => v != null && v > 0 && v < 180));

    const trackerCiclo = {
      imoveis: {
        leadToChamada: cicloImLeadToChamada, metaLeadToChamada: 1,
        chamadaToVisita: cicloImChamadaToVisita, metaChamadaToVisita: 7,
        visitaToEstudo: cicloImVisitaToEstudo, metaVisitaToEstudo: 14,
        estudoToProposta: cicloImEstudoToProposta, metaEstudoToProposta: 7,
        propostaToFecho: cicloImPropostaToFecho, metaPropostaToFecho: 30,
        leadToFechoTotal: cicloImLeadToFecho, metaLeadToFecho: 60,
        faseMaiorDemora,
        fases: fasesIm,
      },
      investidores: {
        contactoToReuniao: cicloInvContactoToReuniao, metaContactoToReuniao: 14,
        negocioToAprovacao: cicloInvNegocioToAprovacao, metaNegocioToAprovacao: 14,
        contactoToCapitalTotal: cicloInvContactoToCapital, metaContactoToCapital: 90,
      },
      consultores: {
        callTo1stNegocio: cicloConsCallToNegocio, metaCallToNegocio: 30,
        followUpMedio: cicloConsFollowUpMedio, metaFollowUp: 15,
      },
    };

    // ── 2.3 MOTIVO DE PERDA ─────────────────────────────────────
    const motivosPorPct = Object.entries(motivosDescarte).map(([motivo, count]) => ({
      motivo, count, pct: imoveisDescartados.length > 0 ? round2(count / imoveisDescartados.length * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    const faseDescarte: Record<string, number> = {};
    for (const i of imoveisDescartados) {
      let ultimaFase = "Adicionado";
      if (i.dataChamada) ultimaFase = "Chamada";
      if (i.dataVisita) ultimaFase = "Visita";
      if (i.dataEstudoMercado) ultimaFase = "Estudo";
      if (i.dataProposta) ultimaFase = "Proposta";
      faseDescarte[ultimaFase] = (faseDescarte[ultimaFase] ?? 0) + 1;
    }

    const motivosNaoAprovacao: Record<string, number> = {};
    const motivosInatividade: Record<string, number> = {};
    for (const inv of investidores) {
      if (inv.motivoNaoAprovacao) {
        motivosNaoAprovacao[inv.motivoNaoAprovacao] = (motivosNaoAprovacao[inv.motivoNaoAprovacao] ?? 0) + 1;
      }
      if (inv.motivoInatividade) {
        motivosInatividade[inv.motivoInatividade] = (motivosInatividade[inv.motivoInatividade] ?? 0) + 1;
      }
    }

    const motivosDescontinuacao: Record<string, number> = {};
    const consDescontinuadosList = consultoresRaw.filter((c2) => c2.motivoDescontinuacao);
    for (const c2 of consDescontinuadosList) {
      motivosDescontinuacao[c2.motivoDescontinuacao] = (motivosDescontinuacao[c2.motivoDescontinuacao] ?? 0) + 1;
    }
    const tempoMedioAteDescontinuacao = avg(consultoresRaw
      .filter((c2) => !CONS_ATIVOS_SET.has(c2.estatuto) && c2.dataPrimeiraCall)
      .map((c2) => {
        const dataFim = c2.dataFollowUp || c2.dataProximoFollowUp;
        return daysBetween(c2.dataPrimeiraCall, dataFim);
      })
      .filter((v) => v != null && v > 0 && v < 365));

    const trackerMotivosPerda = {
      imoveis: {
        top3: motivosPorPct.slice(0, 3),
        todosPorPct: motivosPorPct,
        faseMediaDescarte: Object.entries(faseDescarte).map(([fase, count]) => ({ fase, count })).sort((a, b) => b.count - a.count),
        taxaDescarte: leadsGerados > 0 ? round2(imoveisDescartados.length / leadsGerados * 100) : 0,
      },
      investidores: {
        motivosNaoAprovacao: Object.entries(motivosNaoAprovacao).map(([motivo, count]) => ({ motivo, count })).sort((a, b) => b.count - a.count),
        motivosInatividade: Object.entries(motivosInatividade).map(([motivo, count]) => ({ motivo, count })).sort((a, b) => b.count - a.count),
      },
      consultores: {
        motivosDescontinuacao: Object.entries(motivosDescontinuacao).map(([motivo, count]) => ({ motivo, count })).sort((a, b) => b.count - a.count),
        descontinuadosVsAtivos: descontinuadosVsAtivos,
        tempoMedioAteDescontinuacao, metaTempo: 30,
      },
    };

    // ── 2.4 VOLUME DE ATIVIDADES ─────────────────────────────────
    const imAddSemana = imoveis.filter((i) => isThisWeek(i.dataAdicionado)).length;
    const imAddMes = imoveisDoMes.length;
    const imChamadasSemana = imoveis.filter((i) => isThisWeek(i.dataChamada)).length;
    const imChamadasMes = imoveis.filter((i) => isMonth(i.dataChamada, ano, month)).length;
    const visitasRealizadas = visitas.filter((v) => v.estado === "realizada" && new Date(v.dataHora) <= now);
    const imVisitasSemana = visitasRealizadas.filter((v) => isThisWeek(v.dataHora)).length;
    const imVisitasMes = visitasRealizadas.filter((v) => isMonth(v.dataHora, ano, month)).length;
    const imEstudosMes = imoveis.filter((i) => isMonth(i.dataEstudoMercado, ano, month)).length;
    const imPropostasMes = imoveis.filter((i) => isMonth(i.dataProposta, ano, month)).length;
    const imFollowUpAtivos = imoveis.filter((i) => i.estado === "Follow UP").length;

    const invNovosContactadosSemana = investidores.filter((i) => isThisWeek(i.dataPrimeiroContacto)).length;
    const invReunioesSemana = investidores.filter((i) => isThisWeek(i.dataReuniao)).length;
    const invSemContacto30d = investidores.filter((i) => {
      const ult = i.dataUltimoContacto || i.dataReuniao || i.dataPrimeiroContacto;
      if (!ult) return true;
      return Math.floor(((now as any) - (new Date(ult) as any)) / 86400000) > 30;
    }).length;

    const consFollowUpsSemana = consultoresRaw.filter((c2) => isThisWeek(c2.dataFollowUp)).length;
    const consSemContacto15d = consultoresRaw.filter((c2) => {
      if (!CONS_ATIVOS_SET.has(c2.estatuto)) return false;
      const ult = c2.dataProximoFollowUp || c2.dataFollowUp;
      if (!ult) return true;
      return Math.floor(((now as any) - (new Date(ult) as any)) / 86400000) > 15;
    }).length;
    const consAtivosFollowUpEmDia = consultoresRaw.filter((c2) => {
      if (!CONS_ATIVOS_SET.has(c2.estatuto)) return false;
      if (!c2.dataProximoFollowUp) return false;
      return new Date(c2.dataProximoFollowUp) >= now;
    }).length;

    const trackerVolume = {
      imoveis: {
        addSemana: imAddSemana, metaAddSemana: 10,
        addMes: imAddMes,
        chamadasSemana: imChamadasSemana, metaChamadasSemana: 8,
        chamadasMes: imChamadasMes,
        visitasSemana: imVisitasSemana, metaVisitasSemana: 2,
        visitasMes: imVisitasMes,
        estudosMes: imEstudosMes, metaEstudosMes: 1,
        propostasMes: imPropostasMes, metaPropostasMes: 1,
        followUpAtivos: imFollowUpAtivos, metaFollowUpAtivos: 5,
      },
      investidores: {
        novosContactadosSemana: invNovosContactadosSemana, metaNovos: 3,
        reunioesSemana: invReunioesSemana, metaReunioes: 2,
        semContacto30d: invSemContacto30d, metaSemContacto: 0,
      },
      consultores: {
        followUpsSemana: consFollowUpsSemana, metaFollowUps: 10,
        semContacto15d: consSemContacto15d, metaSemContacto: 0,
        ativosFollowUpEmDia: consAtivosFollowUpEmDia, metaAtivosEmDia: 5,
      },
    };

    // ── 3.1 LTV ─────────────────────────────────────────────────
    const ltvInvestidores = investidores
      .filter((i) => i.montanteInvestido > 0)
      .map((i) => ({
        nome: i.nome, ltv: i.montanteInvestido, negocios: i.numeroNegocios,
        status: i.status, classificacao: i.classificacao,
        roiInvestidor: i.roiInvestidor, roiAnualizado: i.roiAnualizadoInvestidor,
      }))
      .sort((a, b) => b.ltv - a.ltv);
    const ltvAcumulado = round2(investidores.reduce((s, i) => s + i.montanteInvestido, 0));
    const capitalMobilizado = ltvAcumulado;

    const ltvConsultores = consultoresRaw
      .filter((c2) => c2.lucroGerado > 0)
      .map((c2) => ({ nome: c2.nome, ltv: c2.lucroGerado, estatuto: c2.estatuto, classificacao: c2.classificacao }))
      .sort((a, b) => b.ltv - a.ltv);

    const trackerLTV = {
      investidores: {
        porInvestidor: ltvInvestidores, metaLTV: 25000,
        ltvAcumulado, capitalMobilizado,
      },
      consultores: {
        porConsultor: ltvConsultores, metaLTV: 8000,
        top5: ltvConsultores.slice(0, 5),
      },
    };

    // ── 3.2 TAXA DE RECOMPRA ─────────────────────────────────────
    const invQueReinvestiram = investidores.filter((i) => i.numeroNegocios > 1);
    const nReinvestiram2026 = invQueReinvestiram.filter((i) =>
      isYear(i.dataCapitalTransferido, 2026) || isYear(i.dataAprovacaoNegocio, 2026)
    ).length;
    const consCom2Negocios = consultoresRaw.filter((c2) => c2.lucroGerado > 0 && c2.imoveisEnviados >= 2);

    const trackerRecompra = {
      investidores: {
        nReinvestiram: invQueReinvestiram.length,
        nReinvestiram2026, metaReinvestiram: 1,
      },
      consultores: {
        pctCom2Negocios: consultoresRaw.length > 0 ? round2(consCom2Negocios.length / consultoresRaw.length * 100) : null,
        nCom2Negocios: consCom2Negocios.length, metaN: 2,
      },
    };

    // ── 3.3 CHURN RATE ───────────────────────────────────────────
    const invInativosSem60d = investidores.filter((i) => {
      if (ESTADOS_PARCERIA.has(i.status)) return false;
      const ult = i.dataUltimoContacto || i.dataReuniao || i.dataPrimeiroContacto;
      if (!ult) return false;
      return Math.floor(((now as any) - (new Date(ult) as any)) / 86400000) > 60;
    }).length;

    const invPerdidos = investidores.filter((i) => i.motivoInatividade || i.motivoNaoAprovacao).length;

    const consPctDescontinuados = consultoresRaw.length > 0 ? round2(consDescontinuados / consultoresRaw.length * 100) : null;
    const consInativosMais30d = consultoresRaw.filter((c2) => {
      if (!CONS_ATIVOS_SET.has(c2.estatuto)) return false;
      const ult = c2.dataProximoFollowUp || c2.dataFollowUp;
      if (!ult) return true;
      return Math.floor(((now as any) - (new Date(ult) as any)) / 86400000) > 30;
    }).length;

    const trackerChurn = {
      investidores: {
        inativosSem60d: invInativosSem60d, metaInativos: 0,
        perdidosPeriodo: invPerdidos,
        motivoMaisFrequente: Object.entries(motivosInatividade).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      },
      consultores: {
        pctDescontinuados: consPctDescontinuados, metaPct: 60,
        inativosMais30d: consInativosMais30d, metaInativos: 0,
        tempoMedioAteDescontinuacao, metaTempo: 30,
        motivoMaisFrequente: Object.entries(motivosDescontinuacao).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      },
    };

    // ════════════════════════════════════════════════════════════
    // KPIs AVANÇADOS
    // ════════════════════════════════════════════════════════════
    const ticketMedioGlobal = negocios.length > 0
      ? round2(negocios.reduce((s, n) => s + (n.lucroEstimado || 0), 0) / negocios.length)
      : 0;
    const winRate = negocios.length > 0
      ? round2(negocios.filter((n) => n.fase === "Vendido").length / negocios.length * 100)
      : 0;
    const cicloMedioDias = velocidadeCicloCompleto || cicloImLeadToFecho || 60;
    const pipelineVelocity = cicloMedioDias > 0 && negocios.length > 0
      ? round2((negocios.length * ticketMedioGlobal * (winRate / 100)) / cicloMedioDias)
      : null;

    const leadResponseTimes = imoveis.map((i) => {
      if (!i.dataAdicionado) return null;
      const primeiraAccao = [i.dataChamada, i.dataVisita, i.dataEstudoMercado].filter(Boolean).sort()[0];
      if (!primeiraAccao) return null;
      return daysBetween(i.dataAdicionado, primeiraAccao);
    }).filter((v) => v != null && v >= 0 && v < 365);
    const leadResponseTimeMedio = avg(leadResponseTimes);
    const leadResponseTimeSemana = avg(imoveis
      .filter((i) => isThisWeek(i.dataAdicionado))
      .map((i) => {
        const primeiraAccao = [i.dataChamada, i.dataVisita].filter(Boolean).sort()[0];
        return primeiraAccao ? daysBetween(i.dataAdicionado, primeiraAccao) : null;
      }).filter((v) => v != null && v >= 0));
    const leadsNaoContactados = imoveis.filter((i) =>
      i.dataAdicionado && !i.dataChamada && !i.dataVisita && !ESTADOS_NEGATIVOS_SET.has(i.estado)
    ).length;

    const dealScores = imoveisAtivos.map((i) => {
      let score = 0;
      if (i.roi > 20) score += 30;
      else if (i.roi > 10) score += 20;
      else if (i.roi > 0) score += 10;
      if (i.askPrice > 0 && i.valorProposta > 0) {
        const spread = (i.askPrice - i.valorProposta) / i.askPrice * 100;
        if (spread > 15) score += 20;
        else if (spread > 5) score += 10;
      }
      if (i.origem) score += 5;
      if (i.zonas?.length > 0) score += 5;
      if (i.modeloNegocio) score += 5;
      if (i.custoObra > 0) score += 5;
      if (i.valorVendaRemodelado > 0) score += 10;
      if (ESTADOS_AVANCADOS_SET.has(i.estado)) score += 10;
      return { nome: i.nome, estado: i.estado, score, roi: i.roi, modeloNegocio: i.modeloNegocio };
    }).sort((a, b) => b.score - a.score);

    const winLossPorFonte: Record<string, any> = {};
    for (const i of imoveis) {
      const origem = i.origem ?? "Outro";
      if (!winLossPorFonte[origem]) winLossPorFonte[origem] = { total: 0, wins: 0, losses: 0, ativos: 0 };
      winLossPorFonte[origem].total++;
      if (ESTADOS_NEGATIVOS_SET.has(i.estado)) winLossPorFonte[origem].losses++;
      else winLossPorFonte[origem].ativos++;
    }
    for (const n of negocios) {
      const imovelRel = imoveis.find((i) => n.imovel.includes(i.id));
      if (imovelRel) {
        const origem = imovelRel.origem ?? "Outro";
        if (winLossPorFonte[origem]) winLossPorFonte[origem].wins++;
      }
    }
    const winLossBySource = Object.entries(winLossPorFonte).map(([fonte, v]: [string, any]) => ({
      fonte, total: v.total, wins: v.wins, losses: v.losses, ativos: v.ativos,
      winRate: v.total > 0 ? round2(v.wins / v.total * 100) : 0,
      lossRate: v.total > 0 ? round2(v.losses / v.total * 100) : 0,
    })).sort((a, b) => b.winRate - a.winRate);

    const consEnviaramUltimos30d = consultoresRaw.filter((c2) => {
      const datas = [c2.dataFollowUp, c2.dataProximoFollowUp, c2.dataPrimeiraCall].filter(Boolean);
      return datas.some((d) =>
        daysBetween(d, now.toISOString().slice(0, 10)) != null &&
        Math.abs(daysBetween(d, now.toISOString().slice(0, 10)) as number) <= 30
      );
    }).length;
    const consultantActivationRate = consultoresRaw.length > 0
      ? round2(consEnviaramUltimos30d / consultoresRaw.length * 100)
      : null;

    const invComFollowUp = investidores.filter((i) => i.dataUltimoContacto).length;
    const invQueAvancaram = investidores.filter((i) => i.dataUltimoContacto && ESTADOS_PROPOSTA_INV.has(i.status)).length;
    const followUpEffectivenessInv = invComFollowUp > 0 ? round2(invQueAvancaram / invComFollowUp * 100) : null;

    const consComFollowUp = consultoresRaw.filter((c2) => c2.dataFollowUp).length;
    const consQueAvancaram = consultoresRaw.filter((c2) => c2.dataFollowUp && CONS_EM_PARCERIA.has(c2.estatuto)).length;
    const followUpEffectivenessCons = consComFollowUp > 0 ? round2(consQueAvancaram / consComFollowUp * 100) : null;

    const zonaPerformance: Record<string, any> = {};
    for (const i of imoveis) {
      const z = i.zonas?.[0] || i.zona || "Sem zona";
      if (!zonaPerformance[z]) {
        zonaPerformance[z] = {
          total: 0, ativos: 0, descartados: 0, comDeal: 0,
          roiTotal: 0, roiCount: 0, askTotal: 0, cicloTotal: 0, cicloCount: 0,
        };
      }
      zonaPerformance[z].total++;
      if (ESTADOS_NEGATIVOS_SET.has(i.estado)) zonaPerformance[z].descartados++;
      else zonaPerformance[z].ativos++;
      if (i.roi > 0) {
        zonaPerformance[z].roiTotal += i.roi;
        zonaPerformance[z].roiCount++;
      }
      if (i.askPrice > 0) zonaPerformance[z].askTotal += i.askPrice;
      const ciclo = daysBetween(i.dataAdicionado, i.dataPropostaAceite || i.dataProposta);
      if (ciclo && ciclo > 0 && ciclo < 365) {
        zonaPerformance[z].cicloTotal += ciclo;
        zonaPerformance[z].cicloCount++;
      }
    }
    for (const n of negocios) {
      const imovelRel = imoveis.find((i) => n.imovel.includes(i.id));
      if (imovelRel) {
        const z = imovelRel.zonas?.[0] || imovelRel.zona || "Sem zona";
        if (zonaPerformance[z]) zonaPerformance[z].comDeal++;
      }
    }
    const zonaStats = Object.entries(zonaPerformance).map(([zona, v]: [string, any]) => ({
      zona, total: v.total, ativos: v.ativos, descartados: v.descartados, comDeal: v.comDeal,
      roiMedio: v.roiCount > 0 ? round2(v.roiTotal / v.roiCount) : null,
      askMedio: v.total > 0 ? round2(v.askTotal / v.total) : null,
      cicloMedio: v.cicloCount > 0 ? round2(v.cicloTotal / v.cicloCount) : null,
      winRate: v.total > 0 ? round2(v.comDeal / v.total * 100) : 0,
      taxaDescarte: v.total > 0 ? round2(v.descartados / v.total * 100) : 0,
    })).filter((z) => z.total > 0).sort((a, b) => b.total - a.total);

    const cacCohort: Record<string, any> = {};
    for (const i of imoveis) {
      if (!i.dataAdicionado) continue;
      const m = i.dataAdicionado.substring(0, 7);
      if (!cacCohort[m]) cacCohort[m] = { leads: 0, chamadas: 0, visitas: 0, propostas: 0, fechos: 0 };
      cacCohort[m].leads++;
      if (i.dataChamada) cacCohort[m].chamadas++;
      if (i.dataVisita) cacCohort[m].visitas++;
      if (i.dataProposta) cacCohort[m].propostas++;
    }
    for (const n of negocios) {
      const imovelRel = imoveis.find((i) => n.imovel.includes(i.id));
      if (imovelRel?.dataAdicionado) {
        const m = imovelRel.dataAdicionado.substring(0, 7);
        if (cacCohort[m]) cacCohort[m].fechos++;
      }
    }
    const cacPorCohort = Object.entries(cacCohort).map(([mes, v]: [string, any]) => ({
      mes, ...v,
      custoMes: burnRateMensal,
      cacPorLead: v.leads > 0 ? round2(burnRateMensal / v.leads) : null,
      cacPorDeal: v.fechos > 0 ? round2(burnRateMensal / v.fechos) : null,
      taxaConversao: v.leads > 0 ? round2(v.fechos / v.leads * 100) : 0,
    })).sort((a, b) => a.mes.localeCompare(b.mes));

    const reFinancials = negocios.map((n) => {
      const imovelRel = imoveis.find((i) => n.imovel.includes(i.id));
      const capitalProprio = (imovelRel?.askPrice || 0) + (n.custoRealObra || imovelRel?.custoObra || 0) - (n.capitalTotal || 0);
      const lucro = n.lucroReal || n.lucroEstimado || 0;
      const cashOnCash = capitalProprio > 0 ? round2(lucro / capitalProprio * 100) : null;
      const holdingDays = daysBetween(n.dataCompra || n.data, n.dataVenda || now.toISOString().slice(0, 10));
      const holdingMonths = holdingDays ? round2(holdingDays / 30.44) : null;
      const irr = cashOnCash != null && holdingMonths && holdingMonths > 0
        ? round2(Math.pow(1 + cashOnCash / 100, 12 / holdingMonths) * 100 - 100)
        : null;
      const equityMultiple = capitalProprio > 0 ? round2((capitalProprio + lucro) / capitalProprio) : null;
      const dpi = n.capitalTotal > 0 && n.lucroReal > 0 ? round2(n.lucroReal / n.capitalTotal) : null;
      return {
        movimento: n.movimento, categoria: n.categoria, fase: n.fase,
        capitalProprio: round2(capitalProprio), capitalPassivo: n.capitalTotal,
        lucro, cashOnCash, holdingMonths, irr, equityMultiple, dpi,
      };
    });

    const weeklyActivity: any = {
      imoveisAdicionados: { valor: imAddSemana, meta: 10 },
      chamadasFeitas: { valor: imChamadasSemana, meta: 8 },
      visitasRealizadas: { valor: imVisitasSemana, meta: 2 },
      followUpsInvestidores: { valor: investidores.filter((i) => isThisWeek(i.dataUltimoContacto)).length, meta: 5 },
      followUpsConsultores: { valor: consFollowUpsSemana, meta: 10 },
      reunioesInvestidores: { valor: invReunioesSemana, meta: 2 },
    };
    const weeklyScore = (() => {
      const items: any[] = Object.values(weeklyActivity);
      const totalPct = items.reduce((s, i) => s + Math.min(100, Math.round(i.valor / i.meta * 100)), 0);
      return round2(totalPct / items.length);
    })();

    const okrs: any[] = [
      {
        objectivo: "Fechar o primeiro deal WH",
        krs: [
          { kr: "10 imóveis adicionados/semana × 4 semanas", valor: imAddSemana, meta: 10, unidade: "/sem", tipo: "semanal" },
          { kr: "4 visitas realizadas", valor: imComVisita, meta: 4, unidade: "", tipo: "acumulado" },
          { kr: "2 propostas enviadas", valor: imComProposta, meta: 2, unidade: "", tipo: "acumulado" },
          { kr: "1 contrato assinado", valor: contratosAssinados, meta: 1, unidade: "", tipo: "acumulado" },
        ],
      },
      {
        objectivo: "Captar primeiro capital passivo",
        krs: [
          { kr: "Contactar 20 investidores sem contacto >30d", valor: Math.max(0, 20 - invSemContacto30d), meta: 20, unidade: "", tipo: "acumulado" },
          { kr: "3 reuniões com investidores A/B", valor: investidores.filter((i) => i.classificacao.some((c2: string) => ["A", "B"].includes(c2)) && i.dataReuniao).length, meta: 3, unidade: "", tipo: "acumulado" },
          { kr: "1 NDA assinado", valor: investidores.filter((i) => i.ndaAssinado).length, meta: 1, unidade: "", tipo: "acumulado" },
          { kr: "1 transferência de capital", valor: comCapital, meta: 1, unidade: "", tipo: "acumulado" },
        ],
      },
      {
        objectivo: "Activar rede de consultores",
        krs: [
          { kr: "10 follow-ups/semana × 4 semanas", valor: consFollowUpsSemana, meta: 10, unidade: "/sem", tipo: "semanal" },
          { kr: "5 consultores com follow-up em dia", valor: consAtivosFollowUpEmDia, meta: 5, unidade: "", tipo: "acumulado" },
          { kr: "2 imóveis via consultores/mês", valor: imoveis.filter((i) => i.nomeConsultor && isMonth(i.dataAdicionado, ano, month)).length, meta: 2, unidade: "/mês", tipo: "mensal" },
          { kr: "Data Primeira Call em consultores ativos", valor: consultoresRaw.filter((c2) => CONS_ATIVOS_SET.has(c2.estatuto) && c2.dataPrimeiraCall).length, meta: consAtivos, unidade: "", tipo: "acumulado" },
        ],
      },
      {
        objectivo: "Disciplina de dados ≥ 80%",
        krs: [
          { kr: '0 motivos descarte "Não registado"', valor: Math.max(0, (motivosDescarte["Não registado"] ?? 0)), meta: 0, unidade: "", tipo: "zero", invertido: true },
          { kr: "100% imóveis ativos com Modelo Negócio", valor: imoveisAtivos.filter((i) => i.modeloNegocio).length, meta: imoveisAtivos.length, unidade: "", tipo: "acumulado" },
          { kr: "100% investidores A/B com Data Último Contacto", valor: investClassif.filter((i) => i.dataUltimoContacto).length, meta: investClassif.length, unidade: "", tipo: "acumulado" },
        ],
      },
    ];
    for (const okr of okrs) {
      let totalPct = 0;
      for (const kr of okr.krs) {
        if (kr.invertido) {
          kr.progresso = kr.valor === 0 ? 100 : 0;
        } else {
          kr.progresso = kr.meta > 0 ? Math.min(100, round2(kr.valor / kr.meta * 100)) : 0;
        }
        totalPct += kr.progresso;
      }
      okr.progresso = round2(totalPct / okr.krs.length);
    }

    const trackerAvancado = {
      pipelineVelocity: { valor: pipelineVelocity, ticketMedio: ticketMedioGlobal, winRate, cicloMedioDias },
      leadResponseTime: { medio: leadResponseTimeMedio, semana: leadResponseTimeSemana, naoContactados: leadsNaoContactados, metaDias: 1 },
      dealQualification: dealScores,
      winLossBySource: winLossBySource,
      consultantActivation: { taxa: consultantActivationRate, activosReais: consEnviaramUltimos30d, totalConsultores: consultoresRaw.length },
      followUpEffectiveness: { investidores: followUpEffectivenessInv, consultores: followUpEffectivenessCons },
      zonaPerformance: zonaStats,
      cacCohort: cacPorCohort,
      reFinancials,
      weeklyActivity: { ...weeklyActivity, score: weeklyScore },
      okrs,
    };

    const metricasPayload = {
      updatedAt: new Date().toISOString(),
      top: {
        receitaPrevistaMes: receitaMes,
        dealsFechadosMes: dealsMes.length,
        capitalPassivoCaptado: capitalCaptado,
        velocidadeMediaCiclo: tempoMedioNegociacao,
        weeklyScore,
      },
      pipeline1: {
        funil: [
          { label: "Leads gerados", value: leadsGerados },
          { label: "Analisados (VVR/CAEP)", value: analisados },
          { label: "Propostas enviadas", value: propostasEnviadas },
          { label: "Contratos assinados", value: contratosAssinados },
          { label: "Escrituras concluídas", value: escriturasConcluidas },
        ],
        taxaConversao: taxaConversaoP1,
        spreadMedio: spreadMedio,
        descontoMercado: descontoMercado,
        abaixoLimiarFF: abaixoLimiar,
        nDueDiligence,
        tempoMedioNegociacao,
        motivosDescarte: Object.entries(motivosDescarte)
          .map(([motivo, count]) => ({ motivo, count }))
          .sort((a, b) => b.count - a.count),
        descarteOrigem: descarteOrigemList,
        modeloNegocio: Object.entries(modeloCount)
          .filter(([, v]) => v > 0)
          .map(([modelo, count]) => ({ modelo, count })),
        imoveisDoMes: imoveisDoMes.length,
        taxaDescarte: leadsGerados > 0 ? round2(imoveisDescartados.length / leadsGerados * 100) : 0,
      },
      pipeline2: {
        dealsPorCategoria,
        dealsFechadosMes: dealsMes.length,
        receitaMes,
        margemWholesaling,
        margemFF,
        holdingMedio,
        pctDealsCapitalPassivo,
        totalDeals: negocios.length,
        dealsFechados: negocios.filter((n) => n.fase === "Vendido").length,
        taxaRealizacao: negocios.length > 0 ? round2(negocios.filter((n) => n.fase === "Vendido").length / negocios.length * 100) : 0,
      },
      pipeline3: {
        funil: [
          { label: "Contactos prospetados", value: total },
          { label: "Reunião realizada", value: comReuniao },
          { label: "Proposta enviada", value: comProposta },
          { label: "Contrato / NDA", value: comNDA },
          { label: "Capital transferido", value: comCapital },
        ],
        capitalCaptado,
        investidoresAtivos: emParceria.length,
        ticketMedio,
        taxaConversao: taxaConversaoInv,
        taxaRetencao,
        roiEntregue,
        tempoMedioCaptacao,
        capitalDisponivel,
        capitalAlocado,
        ratioCaptacaoAlocacao: capitalDisponivel > 0 ? round2(capitalAlocado / capitalDisponivel * 100) : null,
        investEmPipeline,
        ltvTop5: ltvPorInvestidor.slice(0, 5),
      },
      transversal: {
        ratioDealFlowCapital,
        pctDealsCapitalPassivo,
        velocidadeCicloCompleto,
        roe,
        dealsSilmultaneos,
        cumpreProjeccao,
        margemWholesaling,
        margemFF,
        pipelineValue,
        capitalDisponivel,
      },
      tracker: {
        receita: trackerReceita,
        conversao: trackerConversao,
        ticketMedio: trackerTicketMedio,
        margem: trackerMargem,
        cac: trackerCAC,
        ciclo: trackerCiclo,
        motivosPerda: trackerMotivosPerda,
        volume: trackerVolume,
        ltv: trackerLTV,
        recompra: trackerRecompra,
        churn: trackerChurn,
      },
      avancado: trackerAvancado,
    };
    return c.json(metricasPayload);
  } catch (err: any) {
    console.error("[metricas]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// TAREFAS — CRUD (port de server.js:4216-4341)
// Sync com Google Calendar e feito pela cron-sync-calendar (proximo tick).
// ════════════════════════════════════════════════════════════════
app.get("/tarefas", async (c: any) => {
  try {
    const limit = c.req.query("limit") ?? 100;
    const offset = c.req.query("offset") ?? 0;
    const status = c.req.query("status");
    const funcionario = c.req.query("funcionario");
    const since = c.req.query("since");
    const until = c.req.query("until");
    const incluir_arquivadas = c.req.query("incluir_arquivadas");
    const regiao = c.req.query("regiao");
    const cappedLimit = Math.min(Math.max(+limit || 100, 1), 2000);
    const cappedOffset = Math.max(+offset || 0, 0);
    const incluirArquivadas = incluir_arquivadas === "true" || incluir_arquivadas === "1";
    let q = "SELECT * FROM tarefas";
    const params: any[] = [];
    const conds: string[] = [];
    if (!incluirArquivadas) conds.push("arquivada = FALSE");
    if (status) {
      conds.push(`status = $${params.length + 1}`);
      params.push(status);
    }
    if (funcionario) {
      conds.push(`funcionario ILIKE $${params.length + 1}`);
      params.push(`%${funcionario}%`);
    }
    if (since) {
      conds.push(`inicio >= $${params.length + 1}`);
      params.push(since);
    }
    if (until) {
      conds.push(`inicio <= $${params.length + 1}`);
      params.push(until);
    }
    // Filtro por região opcional. Tarefas sem categoria geográfica ficam com
    // regiao=NULL e não aparecem aqui — só com o filtro 'todas' no frontend.
    if (regiao) {
      conds.push(`regiao = $${params.length + 1}`);
      params.push(regiao);
    }
    if (conds.length) q += " WHERE " + conds.join(" AND ");
    q += ` ORDER BY inicio DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(cappedLimit, cappedOffset);
    const { rows } = await pool.query(q, params);
    return c.json({ data: rows, total: rows.length, limit: cappedLimit, offset: cappedOffset });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/tarefas", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { tarefa, status, categoria, inicio, fim, funcionario, tempo_horas, regiao } = body;
    if (!tarefa) return c.json({ error: "tarefa é obrigatória" }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const horas = tempo_horas != null && tempo_horas !== ""
      ? Number(tempo_horas)
      : (inicio && fim ? round2((new Date(fim).getTime() - new Date(inicio).getTime()) / 3600000) : 0);
    // Região vem explícita do form (só preenchida quando a categoria é
    // geograficamente situada). Categorias sem dimensão geográfica enviam ''
    // e ficam NULL — não há fallback para 'Coimbra' nem para o X-Regiao header.
    const regiaoFinal = regiao || null;
    await pool.query(
      `INSERT INTO tarefas (id, tarefa, status, categoria, inicio, fim, funcionario, tempo_horas, regiao, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, tarefa, status || "A fazer", categoria || null, inicio || null, fim || null, funcionario || null, horas, regiaoFinal, now, now],
    );
    return c.json({ id, tarefa, status: status || "A fazer", inicio, fim, funcionario, tempo_horas: horas, regiao: regiaoFinal }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.put("/tarefas/:id", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { tarefa, status, categoria, inicio, fim, funcionario, tempo_horas, regiao } = body;
    const now = new Date().toISOString();
    const horas = tempo_horas != null && tempo_horas !== ""
      ? Number(tempo_horas)
      : (inicio && fim ? round2((new Date(fim).getTime() - new Date(inicio).getTime()) / 3600000) : undefined);
    const sets: string[] = [];
    const params: any[] = [];
    if (tarefa !== undefined) { sets.push(`tarefa = $${params.length + 1}`); params.push(tarefa); }
    if (status !== undefined) { sets.push(`status = $${params.length + 1}`); params.push(status); }
    if (categoria !== undefined) { sets.push(`categoria = $${params.length + 1}`); params.push(categoria); }
    if (inicio !== undefined) { sets.push(`inicio = $${params.length + 1}`); params.push(inicio); }
    if (fim !== undefined) { sets.push(`fim = $${params.length + 1}`); params.push(fim); }
    if (funcionario !== undefined) { sets.push(`funcionario = $${params.length + 1}`); params.push(funcionario); }
    if (horas !== undefined) { sets.push(`tempo_horas = $${params.length + 1}`); params.push(horas); }
    if (regiao !== undefined) { sets.push(`regiao = $${params.length + 1}`); params.push(regiao || null); }
    if (sets.length === 0) return c.json({ error: "nada para actualizar" }, 400);
    sets.push(`updated_at = $${params.length + 1}`); params.push(now);
    params.push(c.req.param("id"));
    const { rowCount } = await pool.query(
      `UPDATE tarefas SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params,
    );
    if (!rowCount) return c.json({ error: "Não encontrada" }, 404);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/tarefas/:id", async (c: any) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM tarefas WHERE id = $1", [c.req.param("id")]);
    if (!rowCount) return c.json({ error: "Não encontrada" }, 404);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/tarefas/arquivar-antigas", async (c: any) => {
  try {
    const { arquivarTarefasAntigas } = await import("../_shared/tarefasArquivo.ts");
    const dias = Math.max(parseInt(c.req.query("dias") || "90") || 90, 30);
    const arquivadas = await arquivarTarefasAntigas(dias);
    return c.json({ ok: true, arquivadas, dias_limite: dias });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/tarefas/desarquivar/:id", async (c: any) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE tarefas SET arquivada = FALSE, arquivada_em = NULL WHERE id = $1",
      [c.req.param("id")],
    );
    if (!rowCount) return c.json({ error: "Tarefa não encontrada" }, 404);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// OKRs (apenas GET)
// ════════════════════════════════════════════════════════════════
// Mapa fonte → query SQL
const KR_FONTE_QUERIES: Record<string, string> = {
  imoveis_semana: "SELECT COUNT(*) as c FROM imoveis WHERE data_adicionado >= NOW() - INTERVAL '7 days'",
  imoveis_com_visita: "SELECT COUNT(*) as c FROM imoveis WHERE data_visita IS NOT NULL",
  imoveis_com_proposta: "SELECT COUNT(*) as c FROM imoveis WHERE data_proposta IS NOT NULL",
  negocios_total: "SELECT COUNT(*) as c FROM negocios",
  negocios_vendidos: "SELECT COUNT(*) as c FROM negocios WHERE fase = 'Vendido'",
  investidores_sem_contacto_30d: "SELECT COUNT(*) as c FROM investidores WHERE data_ultimo_contacto IS NULL OR data_ultimo_contacto < NOW() - INTERVAL '30 days'",
  investidores_ab_reuniao: "SELECT COUNT(*) as c FROM investidores WHERE classificacao IN ('A','B') AND data_reuniao IS NOT NULL",
  investidores_nda: "SELECT COUNT(*) as c FROM investidores WHERE nda_assinado = 1",
  investidores_capital: "SELECT COUNT(*) as c FROM investidores WHERE montante_investido > 0",
  consultores_followup_semana: "SELECT COUNT(*) as c FROM consultores WHERE data_follow_up >= NOW() - INTERVAL '7 days'",
  consultores_followup_em_dia: "SELECT COUNT(*) as c FROM consultores WHERE data_proximo_follow_up >= NOW() AND estatuto IN ('Aberto Parcerias','Follow up','Acesso imoveis Off market','Consultores em Parceria')",
  consultores_com_call: "SELECT COUNT(*) as c FROM consultores WHERE data_primeira_call IS NOT NULL AND estatuto IN ('Aberto Parcerias','Follow up','Acesso imoveis Off market','Consultores em Parceria')",
  consultores_ativos: "SELECT COUNT(*) as c FROM consultores WHERE estatuto IN ('Aberto Parcerias','Follow up','Acesso imoveis Off market','Consultores em Parceria')",
  imoveis_sem_modelo: "SELECT COUNT(*) as c FROM imoveis WHERE (modelo_negocio IS NULL OR modelo_negocio = '') AND estado NOT IN ('Descartado','Nao interessa','Não interessa')",
  imoveis_com_modelo: "SELECT COUNT(*) as c FROM imoveis WHERE modelo_negocio IS NOT NULL AND modelo_negocio != '' AND estado NOT IN ('Descartado','Nao interessa','Não interessa')",
  imoveis_ativos: "SELECT COUNT(*) as c FROM imoveis WHERE estado NOT IN ('Descartado','Nao interessa','Não interessa')",
  investidores_ab_contacto: "SELECT COUNT(*) as c FROM investidores WHERE classificacao IN ('A','B') AND data_ultimo_contacto IS NOT NULL",
  investidores_ab_total: "SELECT COUNT(*) as c FROM investidores WHERE classificacao IN ('A','B')",
};

const REGIAO_FILTER_BY_TABLE: Record<string, (r: string) => { clause: string; param: any }> = {
  imoveis: (r) => ({ clause: "regiao = ?", param: r }),
  consultores: (r) => ({ clause: "regiao = ?", param: r }),
  negocios: (r) => ({ clause: "regiao = ?", param: r }),
  despesas: (r) => ({ clause: "regiao = ?", param: r }),
  tarefas: (r) => ({ clause: "regiao = ?", param: r }),
  empreiteiros: (r) => ({ clause: "regiao = ?", param: r }),
  visitas: (r) => ({ clause: "regiao = ?", param: r }),
  investidores: (r) => ({ clause: "regioes_preferidas LIKE ?", param: `%"${r}"%` }),
};

function applyRegiaoToSql(sql: string, regiao: string | null) {
  if (!regiao) return { sql, params: [] as any[] };
  const m = sql.match(/FROM\s+(\w+)/i);
  if (!m) return { sql, params: [] as any[] };
  const fn = REGIAO_FILTER_BY_TABLE[m[1]];
  if (!fn) return { sql, params: [] as any[] };
  const { clause, param } = fn(regiao);
  const placeholder = clause.replace("?", "$1");
  if (/\bWHERE\b/i.test(sql)) {
    return { sql: sql.replace(/\bWHERE\b/i, `WHERE ${placeholder} AND`), params: [param] };
  }
  return { sql: `${sql} WHERE ${placeholder}`, params: [param] };
}

// Calcular TODOS os valores de KR em batch (uma query por fonte única)
async function calcAllKRValues(fontes: string[], pgPool: any, regiao: string | null = null) {
  const results: Record<string, number> = {};
  await Promise.all(fontes.map(async (fonte) => {
    const rawSql = KR_FONTE_QUERIES[fonte];
    if (!rawSql) {
      results[fonte] = 0;
      return;
    }
    const { sql, params } = applyRegiaoToSql(rawSql, regiao);
    try {
      const { rows } = await pgPool.query(sql, params);
      results[fonte] = parseInt(rows[0].c);
    } catch {
      results[fonte] = 0;
    }
  }));
  return results;
}

// Legacy single KR calc (kept for backward compat)
async function calcKRValue(kr: any, pgPool: any, regiao: string | null = null) {
  if (!kr.fonte) return 0;
  const values = await calcAllKRValues([kr.fonte], pgPool, regiao);
  return values[kr.fonte] ?? 0;
}

app.get("/okrs", async (c: any) => {
  try {
    const trimestre = c.req.query("trimestre");
    const regiao = regiaoFrom(c);
    const where: string[] = [];
    const params: any[] = [];
    if (trimestre) {
      params.push(trimestre);
      where.push(`trimestre = $${params.length}`);
    }
    if (regiao) {
      params.push(regiao);
      where.push(`(regiao IS NULL OR regiao = $${params.length})`);
    }
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const q = `SELECT * FROM okrs${whereSql} ORDER BY ordem, created_at`;
    const { rows: okrs } = await pool.query(q, params);

    if (okrs.length === 0) return c.json([]);

    const okrIds = okrs.map((o: any) => o.id);
    const { rows: allKrs } = await pool.query(
      "SELECT * FROM okr_krs WHERE okr_id = ANY($1) ORDER BY ordem, created_at",
      [okrIds],
    );

    const fontes = [...new Set(allKrs.map((kr: any) => kr.fonte).filter(Boolean))] as string[];
    const fonteValues = await calcAllKRValues(fontes, pool, regiao);

    const krsByOkr: Record<string, any[]> = {};
    for (const kr of allKrs) {
      kr.valor = fonteValues[kr.fonte] ?? 0;
      if (kr.invertido) {
        kr.progresso = kr.valor === 0 ? 100 : Math.max(0, Math.round((1 - kr.valor / kr.meta) * 100));
      } else {
        kr.progresso = kr.meta > 0 ? Math.min(100, Math.round(kr.valor / kr.meta * 100)) : 0;
      }
      if (!krsByOkr[kr.okr_id]) krsByOkr[kr.okr_id] = [];
      krsByOkr[kr.okr_id].push(kr);
    }

    for (const okr of okrs) {
      okr.krs = krsByOkr[okr.id] || [];
      okr.progresso = okr.krs.length > 0 ? Math.round(okr.krs.reduce((s: number, kr: any) => s + kr.progresso, 0) / okr.krs.length) : 0;
    }
    return c.json(okrs);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Fontes disponíveis para auto-cálculo de KRs
app.get("/okrs/fontes", (c: any) => {
  return c.json([
    { id: "imoveis_semana", label: "Imóveis adicionados esta semana" },
    { id: "imoveis_com_visita", label: "Imóveis com visita realizada" },
    { id: "imoveis_com_proposta", label: "Imóveis com proposta enviada" },
    { id: "imoveis_ativos", label: "Total imóveis ativos" },
    { id: "imoveis_com_modelo", label: "Imóveis com Modelo de Negócio preenchido" },
    { id: "imoveis_sem_modelo", label: "Imóveis SEM Modelo de Negócio (invertido)" },
    { id: "negocios_total", label: "Total negócios" },
    { id: "negocios_vendidos", label: "Negócios vendidos" },
    { id: "investidores_sem_contacto_30d", label: "Investidores sem contacto >30d (invertido)" },
    { id: "investidores_ab_reuniao", label: "Investidores A/B com reunião" },
    { id: "investidores_nda", label: "Investidores com NDA assinado" },
    { id: "investidores_capital", label: "Investidores com capital transferido" },
    { id: "investidores_ab_contacto", label: "Investidores A/B com contacto recente" },
    { id: "investidores_ab_total", label: "Total investidores A/B" },
    { id: "consultores_followup_semana", label: "Follow-ups consultores esta semana" },
    { id: "consultores_followup_em_dia", label: "Consultores ativos com follow-up em dia" },
    { id: "consultores_com_call", label: "Consultores ativos com Data Primeira Call" },
    { id: "consultores_ativos", label: "Total consultores ativos" },
    { id: null, label: "(Manual — introduzir valor à mão)" },
  ]);
});

// ════════════════════════════════════════════════════════════════
// ALERTAS
// ════════════════════════════════════════════════════════════════
app.get("/alertas", async (c: any) => {
  try {
    const regiao = regiaoFrom(c);
    const [imoveis, investidores, consultoresRaw, negocios] = await Promise.all([
      getImóveis({ regiao }).catch(() => [] as any[]),
      getInvestidores({ regiao }),
      getConsultores({ regiao }).catch(() => [] as any[]),
      getNegócios({ regiao }),
    ]);
    const now = new Date();
    const alerts: any[] = [];

    // ── Investidores Pendentes de Aprovação ──
    for (const inv of investidores) {
      if (inv.status !== "Pendente de Aprovação") continue;
      const created = inv.created_at ? new Date(inv.created_at) : null;
      const horas = created ? Math.floor(((now as any) - (created as any)) / 3600000) : null;
      const tempoLabel = horas == null ? "" : horas < 1 ? "agora" : horas < 24 ? `há ${horas}h` : `há ${Math.floor(horas / 24)}d`;
      alerts.push({
        tipo: "pendente_aprovacao",
        severidade: horas == null ? "aviso" : horas > 48 ? "critico" : "aviso",
        entidade: inv.nome,
        mensagem: `Investidor pendente de aprovação${tempoLabel ? " · entrou " + tempoLabel : ""}`,
        status: inv.status,
        id: inv.id,
      });
    }

    // ── Investidores sem contacto >7 dias ──
    const ESTADOS_TERMINAIS = new Set(["Inactivo", "Não qualificado"]);
    const ESTADOS_PARCERIA = new Set(["Investidor em parceria", "Em Parceria", "Investidor Ativo"]);
    for (const inv of investidores) {
      if (inv.status === "Pendente de Aprovação") continue;
      if (ESTADOS_TERMINAIS.has(inv.status)) continue;
      const diasSem = inv.diasSemContacto ?? (() => {
        const ultima = inv.dataUltimoContacto ?? inv.dataReuniao ?? inv.dataPrimeiroContacto;
        if (!ultima) return null;
        return Math.floor(((now as any) - (new Date(ultima) as any)) / 86400000);
      })();
      if (diasSem != null && diasSem > 7 && !ESTADOS_PARCERIA.has(inv.status)) {
        alerts.push({
          tipo: "inatividade_investidor",
          severidade: diasSem > 30 ? "critico" : diasSem > 14 ? "aviso" : "info",
          entidade: inv.nome,
          mensagem: `${diasSem} dias sem contacto`,
          status: inv.status,
          id: inv.id,
        });
      }
    }

    // ── Investidores marcados Inactivos recentemente ──
    for (const inv of investidores) {
      if (inv.status !== "Inactivo") continue;
      const upd = inv.updatedAt || inv.updated_at;
      const diasDesdeMudanca = upd ? Math.floor(((now as any) - (new Date(upd) as any)) / 86400000) : null;
      if (diasDesdeMudanca != null && diasDesdeMudanca <= 7) {
        alerts.push({
          tipo: "investidor_inactivo_recente",
          severidade: "aviso",
          entidade: inv.nome,
          mensagem: `Marcado Inactivo${diasDesdeMudanca === 0 ? " hoje" : ` há ${diasDesdeMudanca}d`} · ${inv.motivoInatividade || inv.motivo_inatividade || "sem motivo"}`,
          status: inv.status,
          id: inv.id,
        });
      }
    }

    // ── Consultores com follow-up atrasado ──
    const CONS_ATIVOS = new Set(["Aberto Parcerias", "Em Parceria", "Follow up", "Follow Up", "Acesso imoveis Off market"]);
    for (const c2 of consultoresRaw) {
      if (!CONS_ATIVOS.has(c2.estatuto)) continue;
      if (c2.dataProximoFollowUp && new Date(c2.dataProximoFollowUp) < now) {
        const diasAtraso = Math.floor(((now as any) - (new Date(c2.dataProximoFollowUp) as any)) / 86400000);
        alerts.push({
          tipo: "followup_consultor",
          severidade: diasAtraso > 14 ? "critico" : diasAtraso > 7 ? "aviso" : "info",
          entidade: c2.nome,
          mensagem: `Follow-up atrasado ${diasAtraso} dias`,
          status: c2.estatuto,
          id: c2.id,
        });
      }
    }

    // ── Consultores: sem primeiro contacto >48h / inativo >15d ──
    try {
      const { rows: pgConsultores } = await pool.query("SELECT id, nome, estatuto, created_at FROM consultores");
      const { rows: todasInteracoes } = await pool.query("SELECT consultor_id, data_hora FROM consultor_interacoes");
      const interacoesPorConsultor: Record<string, any[]> = {};
      for (const i of todasInteracoes) {
        if (!interacoesPorConsultor[i.consultor_id]) interacoesPorConsultor[i.consultor_id] = [];
        interacoesPorConsultor[i.consultor_id].push(i);
      }

      const ESTATUTOS_ATIVOS = ["Follow up", "Aberto Parcerias", "Acesso imoveis Off market", "Consultores em Parceria"];
      for (const c2 of pgConsultores) {
        const horasCriado = ((now as any) - (new Date(c2.created_at) as any)) / 3600000;
        const interacoesCons = interacoesPorConsultor[c2.id] || [];

        if (horasCriado > 48 && interacoesCons.length === 0 && ESTATUTOS_ATIVOS.includes(c2.estatuto)) {
          alerts.push({
            tipo: "consultor_sem_contacto_48h",
            severidade: "critico",
            entidade: c2.nome,
            mensagem: `Criado há ${Math.floor(horasCriado)}h sem contacto registado`,
            status: c2.estatuto,
            id: c2.id,
          });
        }

        if (interacoesCons.length > 0) {
          const ultimaData = interacoesCons.reduce((max, i) => {
            const d = new Date(i.data_hora);
            return d > max ? d : max;
          }, new Date(0));
          const diasSemContacto = Math.floor(((now as any) - (ultimaData as any)) / 86400000);
          if (diasSemContacto > 15) {
            const imoveisConsultor = imoveis.filter((im) => im.nomeConsultor?.trim().toLowerCase() === c2.nome?.trim().toLowerCase());
            const imovelRecente = imoveisConsultor.some((im) =>
              im.dataAdicionado && new Date(im.dataAdicionado) > ultimaData
            );
            if (!imovelRecente) {
              alerts.push({
                tipo: "consultor_inativo_15d",
                severidade: "aviso",
                entidade: c2.nome,
                mensagem: `${diasSemContacto} dias sem contacto`,
                status: c2.estatuto,
                id: c2.id,
              });
            }
          }
        }
      }
    } catch (e: any) {
      console.warn("[alertas] Erro ao verificar interacções consultores:", e.message);
    }

    // ── Imóveis parados na mesma fase >5 dias ──
    const ESTADOS_NEG = new Set(["Descartado", "Nao interessa", "Não interessa", "Cancelado"]);
    const ESTADOS_FINAIS = new Set([...ESTADOS_NEG, "Vendido", "Wholesaling", "Negócio em Curso"]);
    for (const im of imoveis) {
      if (ESTADOS_FINAIS.has(im.estado)) continue;
      const ultimaData = im.dataPropostaAceite ?? im.dataProposta ?? im.dataEstudoMercado ?? im.dataVisita ?? im.dataChamada ?? im.dataAdicionado;
      if (!ultimaData) continue;
      const diasParado = Math.floor(((now as any) - (new Date(ultimaData) as any)) / 86400000);
      if (diasParado > 5) {
        alerts.push({
          tipo: "imovel_parado",
          severidade: diasParado > 15 ? "critico" : diasParado > 7 ? "aviso" : "info",
          entidade: im.nome,
          mensagem: `${diasParado} dias na fase "${im.estado}"`,
          estado: im.estado,
          id: im.id,
        });
      }
    }

    // ── Campos obrigatórios em falta ──
    const camposEmFalta: any[] = [];

    for (const im of imoveis) {
      const missing: string[] = [];
      if (!im.dataAdicionado) missing.push("Data Adicionado");
      if (!im.origem) missing.push("Origem");
      if (!im.zona && im.zonas?.length === 0) missing.push("Zona");
      if (!im.tipologia) missing.push("Tipologia");
      if (ESTADOS_NEG.has(im.estado) && !im.motivoDescarte) missing.push("Motivo Descarte");
      if (["Wholesaling", "Negócio em Curso"].includes(im.estado) && !im.modeloNegocio) missing.push("Modelo de Negócio");
      if (missing.length > 0) camposEmFalta.push({ db: "Imóveis", nome: im.nome, campos: missing, id: im.id });
    }

    for (const inv of investidores) {
      const missing: string[] = [];
      if (!inv.dataPrimeiroContacto) missing.push("Data Primeiro Contacto");
      if (!inv.origem) missing.push("Origem");
      const QUALIFICADOS = ["Investidor Qualificado em Carteira", "Investidor em espera", "Investidor em parceria", "Em Parceria", "Negociação de Deal", "Investidor Ativo"];
      const PARCERIA = ["Investidor em parceria", "Em Parceria", "Investidor Ativo"];
      if (inv.classificacao.length === 0 && QUALIFICADOS.includes(inv.status)) missing.push("Classificação");
      if (PARCERIA.includes(inv.status) && inv.montanteInvestido === 0) missing.push("Montante Investido");
      if (missing.length > 0) camposEmFalta.push({ db: "Investidores", nome: inv.nome, campos: missing, id: inv.id });
    }

    for (const c2 of consultoresRaw) {
      const missing: string[] = [];
      if (!c2.contacto) missing.push("Contacto");
      if (c2.imobiliaria.length === 0) missing.push("Imobiliária");
      if (CONS_ATIVOS.has(c2.estatuto) && !c2.dataFollowUp && !c2.dataProximoFollowUp) missing.push("Data Follow Up");
      if (missing.length > 0) camposEmFalta.push({ db: "Consultores", nome: c2.nome, campos: missing, id: c2.id });
    }

    for (const neg of negocios) {
      const missing: string[] = [];
      if (!neg.categoria) missing.push("Categoria");
      if (!neg.fase) missing.push("Fase");
      if (neg.lucroEstimado === 0) missing.push("Lucro Estimado");
      if (neg.fase === "Vendido" && neg.lucroReal === 0) missing.push("Lucro Real");
      if (neg.fase === "Vendido" && !neg.dataVenda) missing.push("Data de Venda");
      if (missing.length > 0) camposEmFalta.push({ db: "Faturação", nome: neg.movimento, campos: missing, id: neg.id });
    }

    // ── Reuniões com relatório comercial novo (não vistas) ──
    try {
      const { rows: novasReunioes } = await pool.query(`
        SELECT r.id, r.titulo, r.data, r.entidade_tipo, r.entidade_id,
          COALESCE(i.nome, c.nome) AS entidade_nome
        FROM reunioes r
        LEFT JOIN investidores i ON r.entidade_tipo = 'investidores' AND i.id = r.entidade_id
        LEFT JOIN consultores  c ON r.entidade_tipo = 'consultores'  AND c.id = r.entidade_id
        WHERE r.analise_completa IS NOT NULL
          AND r.analise_vista = false
          AND r.entidade_id IS NOT NULL
        ORDER BY r.data DESC
        LIMIT 50
      `);
      for (const r of novasReunioes) {
        const dataStr = r.data ? new Date(r.data).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }) : "";
        alerts.push({
          tipo: "relatorio_reuniao_disponivel",
          severidade: "info",
          entidade: r.entidade_nome || r.titulo,
          mensagem: `Relatório da reunião disponível${dataStr ? ` (${dataStr})` : ""}`,
          reuniao_id: r.id,
          entidade_tipo: r.entidade_tipo,
          id: r.entidade_id,
        });
      }
    } catch (e: any) {
      console.warn("[alertas] Erro ao verificar relatórios de reuniões:", e.message);
    }

    // ── Alertas de análises de rentabilidade ──
    try {
      const { rows: analisesActivas } = await pool.query(`
        SELECT a.*, i.nome as imovel_nome FROM analises a
        JOIN imoveis i ON i.id = a.imovel_id
        WHERE a.activa = true
      `);
      for (const an of analisesActivas) {
        const st = typeof an.stress_tests === "string" ? JSON.parse(an.stress_tests || "null") : an.stress_tests;
        if (st?.pior?.lucro_liquido < 0) {
          alerts.push({
            tipo: "stress_prejuizo",
            severidade: an.lucro_liquido < 0 ? "critico" : "aviso",
            entidade: an.imovel_nome,
            mensagem: `Pior cenário: ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(st.pior.lucro_liquido)} de prejuízo`,
            id: an.imovel_id,
          });
        }
        if (an.retorno_anualizado > 0 && an.retorno_anualizado < 8) {
          alerts.push({
            tipo: "ra_baixo",
            severidade: "aviso",
            entidade: an.imovel_nome,
            mensagem: `Retorno anualizado de apenas ${an.retorno_anualizado}%`,
            id: an.imovel_id,
          });
        }
        if (an.vpt > an.compra && an.compra > 0) {
          alerts.push({
            tipo: "vpt_superior",
            severidade: "info",
            entidade: an.imovel_nome,
            mensagem: "VPT superior ao preço de compra — IMT calculado sobre VPT",
            id: an.imovel_id,
          });
        }
        if (an.finalidade === "Empresa_isencao" && an.meses > 10) {
          alerts.push({
            tipo: "imt_caducidade",
            severidade: an.meses > 12 ? "critico" : "aviso",
            entidade: an.imovel_nome,
            mensagem: `Isenção IMT caduca aos 12 meses — prazo estimado: ${an.meses}m`,
            id: an.imovel_id,
          });
        }
      }
    } catch (e: any) {
      console.warn("[alertas] Erro ao verificar análises:", e.message);
    }

    // Sort by severity
    const SEV_ORDER: Record<string, number> = { critico: 0, aviso: 1, info: 2 };
    alerts.sort((a, b) => (SEV_ORDER[a.severidade] ?? 3) - (SEV_ORDER[b.severidade] ?? 3));

    return c.json({
      updatedAt: new Date().toISOString(),
      alertas: alerts,
      camposEmFalta,
      resumo: {
        total: alerts.length,
        criticos: alerts.filter((a) => a.severidade === "critico").length,
        avisos: alerts.filter((a) => a.severidade === "aviso").length,
        info: alerts.filter((a) => a.severidade === "info").length,
        camposIncompletos: camposEmFalta.length,
      },
    });
  } catch (err: any) {
    console.error("[alertas]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// WEEKLY PULSE
// ════════════════════════════════════════════════════════════════
app.get("/weekly-pulse", async (c: any) => {
  try {
    const regiao = regiaoFrom(c);
    const [imoveis, investidores, consultoresRaw, negocios, despesas, visitas] = await Promise.all([
      getImóveis({ regiao }).catch(() => [] as any[]),
      getInvestidores({ regiao }),
      getConsultores({ regiao }).catch(() => [] as any[]),
      getNegócios({ regiao }),
      getDespesas({ regiao }),
      getVisitas({ regiao }).catch(() => [] as any[]),
    ]);
    const now = new Date();
    const wDay = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (wDay === 0 ? 6 : wDay - 1));
    weekStart.setHours(0, 0, 0, 0);

    function inWeek(dateStr: any) {
      if (!dateStr) return false;
      return new Date(dateStr) >= weekStart && new Date(dateStr) <= now;
    }

    // Atividades da semana
    const imoveisAdicionados = imoveis.filter((i) => inWeek(i.dataAdicionado)).length;
    const chamadasFeitas = imoveis.filter((i) => inWeek(i.dataChamada)).length;
    // Visitas: contar da tabela 'visitas' (multiplas por imovel, com estado).
    // So conta as marcadas como 'realizada' que ja aconteceram.
    const visitasFeitas = visitas.filter((v) => v.estado === "realizada" && inWeek(v.dataHora)).length;
    const propostasEnviadas = imoveis.filter((i) => inWeek(i.dataProposta)).length;
    const dealsFechados = negocios.filter((n) => inWeek(n.dataVenda) || inWeek(n.dataCompra)).length;

    // Alertas críticos
    const ESTADOS_NEG = new Set(["Descartado", "Nao interessa", "Não interessa", "Cancelado"]);
    const imoveisParados = imoveis.filter((i) => {
      if (ESTADOS_NEG.has(i.estado) || ["Vendido", "Wholesaling", "Negócio em Curso"].includes(i.estado)) return false;
      const ultima = i.dataPropostaAceite ?? i.dataProposta ?? i.dataEstudoMercado ?? i.dataVisita ?? i.dataChamada ?? i.dataAdicionado;
      if (!ultima) return false;
      return ((now as any) - (new Date(ultima) as any)) / 86400000 > 7;
    }).length;

    const investSemContacto = investidores.filter((i) => {
      const dias = i.diasSemContacto ?? (() => {
        const u = i.dataUltimoContacto ?? i.dataReuniao ?? i.dataPrimeiroContacto;
        return u ? Math.floor(((now as any) - (new Date(u) as any)) / 86400000) : null;
      })();
      return dias != null && dias > 14;
    }).length;

    const CONS_ATIVOS = new Set(["Aberto Parcerias", "Em Parceria", "Follow up", "Follow Up", "Acesso imoveis Off market"]);
    const consFollowUpAtrasado = consultoresRaw.filter((c2) =>
      CONS_ATIVOS.has(c2.estatuto) && c2.dataProximoFollowUp && new Date(c2.dataProximoFollowUp) < now
    ).length;

    // Cash
    const burnRate = round2(
      despesas.filter((d) => d.timing === "Mensalmente").reduce((s, d) => s + d.custoMensal, 0) +
        despesas.filter((d) => d.timing === "Anual").reduce((s, d) => s + (d.custoAnual || 0) / 12, 0),
    );
    const lucroPendente = round2(negocios.filter((n) => n.pagamentoEmFalta).reduce((s, n) => s + n.lucroEstimado, 0));
    const runway = burnRate > 0 ? round2(lucroPendente / burnRate) : null;

    // Pulse score (0-100)
    let score = 50; // base
    score += Math.min(imoveisAdicionados * 5, 15); // até +15 por imóveis novos
    score += Math.min(chamadasFeitas * 3, 10); // até +10 por chamadas
    score += Math.min(visitasFeitas * 5, 10); // até +10 por visitas
    score += dealsFechados * 15; // +15 por deal
    score -= Math.min(imoveisParados * 2, 15); // até -15 por parados
    score -= Math.min(investSemContacto * 1, 10); // até -10 por inativos
    score -= Math.min(consFollowUpAtrasado * 1, 10); // até -10 por follow-ups
    score = Math.max(0, Math.min(100, score));

    const status = score >= 75 ? "excelente" : score >= 50 ? "bom" : score >= 30 ? "atenção" : "crítico";

    const payload = {
      semana: { de: weekStart.toISOString().slice(0, 10), ate: now.toISOString().slice(0, 10) },
      score,
      status,
      atividades: { imoveisAdicionados, chamadasFeitas, visitasFeitas, propostasEnviadas, dealsFechados },
      alertas: { imoveisParados, investSemContacto, consFollowUpAtrasado },
      financeiro: { burnRate, lucroPendente, runway },
    };
    return c.json(payload);
  } catch (err: any) {
    console.error("[weekly-pulse]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// OPS SCORECARD
// ════════════════════════════════════════════════════════════════
app.get("/ops-scorecard", async (c: any) => {
  try {
    const [imoveis, consultoresRaw, negocios, investidores] = await Promise.all([
      getImóveis().catch(() => [] as any[]),
      getConsultores().catch(() => [] as any[]),
      getNegócios(),
      getInvestidores(),
    ]);
    const now = new Date();
    const CONS_ATIVOS = new Set(["Aberto Parcerias", "Em Parceria", "Follow up", "Follow Up", "Acesso imoveis Off market", "Consultores em Parceria"]);
    const ESTADOS_NEG = new Set(["Descartado", "Nao interessa", "Não interessa", "Cancelado"]);

    // Consultores ativos
    const consAtivos = consultoresRaw.filter((c2) => CONS_ATIVOS.has(c2.estatuto));
    const consParceria = consultoresRaw.filter((c2) => c2.estatuto === "Consultores em Parceria" || c2.estatuto === "Em Parceria");
    const taxaAtivacao = consultoresRaw.length > 0 ? round2(consAtivos.length / consultoresRaw.length * 100) : 0;

    // Pipeline velocity
    const imoveisAtivos = imoveis.filter((i) => !ESTADOS_NEG.has(i.estado));
    const tempoMedioFase = (() => {
      const tempos = imoveisAtivos.map((i) => {
        const ultima = i.dataPropostaAceite ?? i.dataProposta ?? i.dataEstudoMercado ?? i.dataVisita ?? i.dataChamada ?? i.dataAdicionado;
        if (!ultima) return null;
        return Math.floor(((now as any) - (new Date(ultima) as any)) / 86400000);
      }).filter((v) => v != null) as number[];
      return tempos.length > 0 ? round2(tempos.reduce((s, v) => s + v, 0) / tempos.length) : null;
    })();

    // Ranking consultores (top 10 por leads)
    const byNome: Record<string, any> = {};
    for (const im of imoveis) {
      const nome = im.nomeConsultor?.trim();
      if (!nome) continue;
      if (!byNome[nome]) byNome[nome] = { total: 0, ativos: 0, descartados: 0, avancados: 0, visitas: 0 };
      byNome[nome].total++;
      if (ESTADOS_NEG.has(im.estado)) byNome[nome].descartados++;
      else byNome[nome].ativos++;
      if (im.dataVisita) byNome[nome].visitas++;
      if (["Wholesaling", "Negócio em Curso", "Estudo de VVR", "Enviar proposta ao investidor"].includes(im.estado)) byNome[nome].avancados++;
    }

    const rankingConsultores = Object.entries(byNome)
      .map(([nome, v]: [string, any]) => ({
        nome,
        ...v,
        taxaConversao: v.total > 0 ? round2(v.avancados / v.total * 100) : 0,
        consultor: consultoresRaw.find((c2) => c2.nome === nome),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // Pipeline por zona
    const porZona: Record<string, any> = {};
    for (const im of imoveis) {
      const zona = im.zonas?.[0] ?? im.zona ?? "Sem zona";
      if (!porZona[zona]) porZona[zona] = { total: 0, ativos: 0, valor: 0 };
      porZona[zona].total++;
      if (!ESTADOS_NEG.has(im.estado)) {
        porZona[zona].ativos++;
        porZona[zona].valor += im.askPrice || 0;
      }
    }
    const zonas = Object.entries(porZona)
      .map(([zona, v]: [string, any]) => ({ zona, ...v, valor: round2(v.valor) }))
      .sort((a, b) => b.ativos - a.ativos);

    // Tempo médio por fase do pipeline
    const faseTimings: Record<string, any> = {};
    const FUNIL = ["dataChamada", "dataVisita", "dataEstudoMercado", "dataProposta", "dataPropostaAceite"];
    const FUNIL_LABELS = ["Lead → Chamada", "Chamada → Visita", "Visita → Estudo", "Estudo → Proposta", "Proposta → Aceite"];
    const FUNIL_FROM = ["dataAdicionado", "dataChamada", "dataVisita", "dataEstudoMercado", "dataProposta"];
    for (let idx = 0; idx < FUNIL.length; idx++) {
      const dias = imoveis.map((i) => {
        const from = i[FUNIL_FROM[idx]];
        const to = i[FUNIL[idx]];
        if (!from || !to) return null;
        const d = ((new Date(to) as any) - (new Date(from) as any)) / 86400000;
        return d >= 0 && d < 365 ? d : null;
      }).filter((v) => v != null) as number[];
      faseTimings[FUNIL_LABELS[idx]] = dias.length > 0 ? round2(dias.reduce((s, v) => s + v, 0) / dias.length) : null;
    }

    // Investidores: funil de conversão
    const invTotal = investidores.length;
    const invReuniao = investidores.filter((i) => i.dataReuniao).length;
    const invClassificado = investidores.filter((i) => i.classificacao?.length > 0).length;
    const invParceria = investidores.filter((i) => ["Investidor em parceria", "Em Parceria"].includes(i.status)).length;
    const invTaxaConversao = invTotal > 0 ? round2(invParceria / invTotal * 100) : 0;

    return c.json({
      updatedAt: new Date().toISOString(),
      consultores: {
        total: consultoresRaw.length,
        ativos: consAtivos.length,
        emParceria: consParceria.length,
        taxaAtivacao,
      },
      pipeline: {
        imoveisAtivos: imoveisAtivos.length,
        imoveisTotal: imoveis.length,
        tempoMedioFase,
        faseTimings,
      },
      investidores: {
        total: invTotal,
        comReuniao: invReuniao,
        classificados: invClassificado,
        emParceria: invParceria,
        taxaConversao: invTaxaConversao,
      },
      negocios: { total: negocios.length, fechados: negocios.filter((n) => n.fase === "Vendido").length },
      rankingConsultores,
      zonas,
    });
  } catch (err: any) {
    console.error("[ops-scorecard]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// TIME TRACKING
// ════════════════════════════════════════════════════════════════
app.get("/time-tracking", async (c: any) => {
  try {
    const [tarefas, negocios, despesas] = await Promise.all([
      getTarefas(),
      getNegócios(),
      getDespesas().catch(() => [] as any[]),
    ]);

    const now = new Date();
    const { ano, month } = getMesAtual();
    const CUSTO_HORA = 15;

    // Filtrar outliers (>24h numa tarefa = erro de dados)
    const tarefasValidas = tarefas.filter((t) => t.tempoHoras > 0 && t.tempoHoras <= 24);
    const totalHoras = round2(tarefasValidas.reduce((s, t) => s + t.tempoHoras, 0));
    const totalTarefas = tarefasValidas.length;

    // ── Por funcionário (split: tarefas comuns contam para ambos) ──
    const NOMES_EQUIPA = ["João Abreu", "Alexandre Mendes"];
    const porFuncionario: Record<string, any> = {};
    for (const nome of NOMES_EQUIPA) porFuncionario[nome] = { horas: 0, tarefas: 0, concluidas: 0 };
    for (const t of tarefasValidas) {
      const f = t.funcionario || "";
      // Se contém ambos nomes (separados por vírgula), atribuir a cada um
      const pessoas = NOMES_EQUIPA.filter((n) => f.includes(n));
      if (pessoas.length === 0) pessoas.push("Não atribuído");
      for (const p of pessoas) {
        if (!porFuncionario[p]) porFuncionario[p] = { horas: 0, tarefas: 0, concluidas: 0 };
        porFuncionario[p].horas += t.tempoHoras; // horas completas para cada pessoa
        porFuncionario[p].tarefas++;
        if (t.status === "Concluída") porFuncionario[p].concluidas++;
      }
    }
    const funcionarios = Object.entries(porFuncionario)
      .filter(([, v]: [string, any]) => v.tarefas > 0)
      .map(([nome, v]: [string, any]) => ({
        nome,
        horas: round2(v.horas),
        tarefas: v.tarefas,
        concluidas: v.concluidas,
        custoTotal: round2(v.horas * CUSTO_HORA),
        taxaConclusao: v.tarefas > 0 ? round2(v.concluidas / v.tarefas * 100) : 0,
      })).sort((a, b) => b.horas - a.horas);

    // ── Por mês ──
    const porMes: Record<string, any> = {};
    for (const t of tarefasValidas) {
      if (!t.inicio) continue;
      const m = t.inicio.substring(0, 7);
      if (!porMes[m]) porMes[m] = { horas: 0, tarefas: 0, custoHoras: 0 };
      porMes[m].horas += t.tempoHoras;
      porMes[m].tarefas++;
      porMes[m].custoHoras += t.tempoHoras * CUSTO_HORA;
    }
    const meses = Object.entries(porMes)
      .map(([mes, v]: [string, any]) => ({ mes, horas: round2(v.horas), tarefas: v.tarefas, custoHoras: round2(v.custoHoras) }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    // ── Por mês + funcionário (split tarefas comuns) ──
    const porMesFunc: Record<string, any> = {};
    for (const t of tarefasValidas) {
      if (!t.inicio) continue;
      const m = t.inicio.substring(0, 7);
      const f = t.funcionario || "";
      const pessoas = NOMES_EQUIPA.filter((n) => f.includes(n));
      if (pessoas.length === 0) pessoas.push("Não atribuído");
      for (const p of pessoas) {
        const key = `${m}|${p}`;
        if (!porMesFunc[key]) porMesFunc[key] = { mes: m, funcionario: p, horas: 0, tarefas: 0 };
        porMesFunc[key].horas += t.tempoHoras;
        porMesFunc[key].tarefas++;
      }
    }
    const mesesFuncionario = Object.values(porMesFunc)
      .filter((v: any) => v.tarefas > 0)
      .map((v: any) => ({ ...v, horas: round2(v.horas) }))
      .sort((a: any, b: any) => a.mes.localeCompare(b.mes) || a.funcionario.localeCompare(b.funcionario));

    // ── Por tipo de actividade (normalizado) ──
    const CATEGORIAS: Record<string, RegExp> = {
      "Cold Call": /cold call/i,
      "Pesquisa de Imóveis": /pesquisa.*im[oó]ve/i,
      "Estudo de Mercado": /estudo.*mercado/i,
      "Follow Up Consultores": /follow.*up.*consult/i,
      "Follow Up Investidores": /follow.*up.*invest|contacto.*invest/i,
      "Reunião Investidores": /reuni[ãa]o.*invest|call.*invest/i,
      "Reunião de Equipa Somnium": /reuni[ãa]o.*(semanal|lu[ií]s|parceria|equipa)/i,
      "Visita": /visita/i,
      "Proposta": /proposta/i,
      "Apresentação de Negócios": /apresenta[çc][ãa]o|revis[ãa]o.*apresenta/i,
      "SOP / Formação": /sop|forma[çc][ãa]o/i,
      "Planeamento": /planeamento|an[aá]lise.*semanal|defini[çc][ãa]o|contabiliza/i,
      "Implementação com IA": /dashboard|claude.*code|notion|crm|tech|otimiza[çc][ãa]o.*notion|implementa[çc][ãa]o.*claude/i,
      "Análise de Negócio": /an[aá]lise.*neg[oó]cio|analise.*potencial/i,
      "Contacto Consultores": /contacto.*consult|cold.*call.*consult/i,
    };
    const porCategoria: Record<string, any> = {};
    for (const t of tarefasValidas) {
      // Usar categoria guardada na DB; fallback para regex se vazia
      let cat = t.categoria || null;
      if (!cat) {
        cat = "Outros";
        for (const [nome, regex] of Object.entries(CATEGORIAS)) {
          if (regex.test(t.tarefa)) {
            cat = nome;
            break;
          }
        }
      }
      if (!porCategoria[cat]) porCategoria[cat] = { horas: 0, tarefas: 0 };
      porCategoria[cat].horas += t.tempoHoras;
      porCategoria[cat].tarefas++;
    }
    const categorias = Object.entries(porCategoria)
      .map(([categoria, v]: [string, any]) => ({
        categoria,
        horas: round2(v.horas),
        tarefas: v.tarefas,
        pctHoras: totalHoras > 0 ? round2(v.horas / totalHoras * 100) : 0,
        custoTotal: round2(v.horas * CUSTO_HORA),
      }))
      .sort((a, b) => b.horas - a.horas);

    // ── Mês actual ──
    const horasMesActual = round2(tarefasValidas
      .filter((t) => t.inicio && isMonth(t.inicio, ano, month))
      .reduce((s, t) => s + t.tempoHoras, 0));
    const tarefasMesActual = tarefasValidas.filter((t) => t.inicio && isMonth(t.inicio, ano, month)).length;

    // ── Semana actual ──
    const horasSemana = round2(tarefasValidas
      .filter((t) => {
        if (!t.inicio) return false;
        const d = new Date(t.inicio);
        return ((now as any) - (d as any)) / 86400000 < 7;
      })
      .reduce((s, t) => s + t.tempoHoras, 0));

    // ── KPIs derivados ──
    // Revenue per hour
    const receitaTotal = round2(negocios.reduce((s, n) => s + (n.lucroReal || n.lucroEstimado), 0));
    const receitaRealizada = round2(negocios.filter((n) => n.fase === "Vendido").reduce((s, n) => s + n.lucroReal, 0));
    const rph = totalHoras > 0 ? round2(receitaTotal / totalHoras) : null;
    const rphRealizado = totalHoras > 0 && receitaRealizada > 0 ? round2(receitaRealizada / totalHoras) : null;

    // Custo por hora (horas × 15€ + custos fixos rateados)
    const burnRateMensal = round2(
      despesas.filter((d) => d.timing === "Mensalmente").reduce((s, d) => s + d.custoMensal, 0) +
        despesas.filter((d) => d.timing === "Anual").reduce((s, d) => s + (d.custoAnual || 0) / 12, 0),
    ) || 360.40;
    const custoHorasTotal = round2(totalHoras * CUSTO_HORA);
    const mesesOp = meses.length || 1;
    const custoFixoTotal = round2(burnRateMensal * mesesOp);
    const custoOperacaoTotal = round2(custoHorasTotal + custoFixoTotal);

    // Horas por deal
    const horasPorDeal = negocios.length > 0 ? round2(totalHoras / negocios.length) : null;
    const custoPorDeal = negocios.length > 0 ? round2(custoOperacaoTotal / negocios.length) : null;

    // Produtividade (horas concluídas / horas totais)
    const horasConcluidas = round2(tarefasValidas.filter((t) => t.status === "Concluída").reduce((s, t) => s + t.tempoHoras, 0));
    const taxaProdutividade = totalHoras > 0 ? round2(horasConcluidas / totalHoras * 100) : null;

    // Horas por tipo de actividade comercial (para CAC refinado)
    const horasProspeccao = round2((porCategoria["Cold Call"]?.horas ?? 0) + (porCategoria["Pesquisa de Imóveis"]?.horas ?? 0) + (porCategoria["Contacto Consultores"]?.horas ?? 0));
    const horasAnalise = round2((porCategoria["Estudo de Mercado"]?.horas ?? 0) + (porCategoria["Análise de Negócio"]?.horas ?? 0));
    const horasRelacional = round2((porCategoria["Follow Up Consultores"]?.horas ?? 0) + (porCategoria["Follow Up Investidores"]?.horas ?? 0) +
      (porCategoria["Reunião Investidores"]?.horas ?? 0));
    const horasGestao = round2((porCategoria["Planeamento"]?.horas ?? 0) + (porCategoria["SOP / Formação"]?.horas ?? 0) +
      (porCategoria["Implementação com IA"]?.horas ?? 0) + (porCategoria["Reunião de Equipa Somnium"]?.horas ?? 0));

    // Status das tarefas
    const statusTarefas = { aFazer: 0, emAndamento: 0, concluida: 0, atrasada: 0 };
    for (const t of tarefas) {
      if (t.status === "Concluída") statusTarefas.concluida++;
      else if (t.status === "Em andamento") statusTarefas.emAndamento++;
      else if (t.status === "Atrasada") statusTarefas.atrasada++;
      else statusTarefas.aFazer++;
    }

    return c.json({
      updatedAt: new Date().toISOString(),
      resumo: {
        totalHoras,
        totalTarefas,
        horasMesActual,
        tarefasMesActual,
        horasSemana,
        custoHora: CUSTO_HORA,
        custoHorasTotal,
        custoFixoTotal,
        custoOperacaoTotal,
        horasConcluidas,
        taxaProdutividade,
        statusTarefas,
      },
      kpis: {
        rph,
        rphRealizado,
        receitaTotal,
        receitaRealizada,
        horasPorDeal,
        custoPorDeal,
        horasProspeccao,
        horasAnalise,
        horasRelacional,
        horasGestao,
        pctProspeccao: totalHoras > 0 ? round2(horasProspeccao / totalHoras * 100) : null,
        pctAnalise: totalHoras > 0 ? round2(horasAnalise / totalHoras * 100) : null,
        pctRelacional: totalHoras > 0 ? round2(horasRelacional / totalHoras * 100) : null,
        pctGestao: totalHoras > 0 ? round2(horasGestao / totalHoras * 100) : null,
      },
      funcionarios,
      meses,
      mesesFuncionario,
      categorias,
    });
  } catch (err: any) {
    console.error("[time-tracking]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ════════════════════════════════════════════════════════════════
// DATA HEALTH
// ════════════════════════════════════════════════════════════════
app.get("/data-health", async (c: any) => {
  try {
    const [imoveis, investidores, consultoresRaw, negocios, despesas] = await Promise.all([
      getImóveis().catch(() => [] as any[]),
      getInvestidores(),
      getConsultores().catch(() => [] as any[]),
      getNegócios(),
      getDespesas(),
    ]);

    function pctFilled(arr: any[], accessor: (item: any) => any) {
      if (arr.length === 0) return 0;
      const filled = arr.filter((item) => {
        const v = accessor(item);
        return v !== null && v !== undefined && v !== "" && v !== 0 && !(Array.isArray(v) && v.length === 0);
      }).length;
      return round2(filled / arr.length * 100);
    }

    const health: Record<string, any> = {
      imoveis: {
        total: imoveis.length,
        campos: {
          "Nome": pctFilled(imoveis, (i) => i.nome),
          "Ask Price": pctFilled(imoveis, (i) => i.askPrice),
          "Estado": pctFilled(imoveis, (i) => i.estado),
          "Data Adicionado": pctFilled(imoveis, (i) => i.dataAdicionado),
          "Origem": pctFilled(imoveis, (i) => i.origem),
          "Zona": pctFilled(imoveis, (i) => i.zonas?.length > 0 ? i.zonas : null),
          "Tipologia": pctFilled(imoveis, (i) => i.tipologia),
          "Data Chamada": pctFilled(imoveis, (i) => i.dataChamada),
          "Data Visita": pctFilled(imoveis, (i) => i.dataVisita),
          "Data Estudo": pctFilled(imoveis, (i) => i.dataEstudoMercado),
          "Data Proposta": pctFilled(imoveis, (i) => i.dataProposta),
          "Modelo Negócio": pctFilled(imoveis, (i) => i.modeloNegocio),
          "ROI": pctFilled(imoveis, (i) => i.roi),
          "Motivo Descarte": pctFilled(imoveis.filter((i) => new Set(["Descartado", "Nao interessa", "Não interessa"]).has(i.estado)), (i) => i.motivoDescarte),
        },
      },
      investidores: {
        total: investidores.length,
        campos: {
          "Nome": pctFilled(investidores, (i) => i.nome),
          "Status": pctFilled(investidores, (i) => i.status),
          "Origem": pctFilled(investidores, (i) => i.origem),
          "Data 1º Contacto": pctFilled(investidores, (i) => i.dataPrimeiroContacto),
          "Data Reunião": pctFilled(investidores, (i) => i.dataReuniao),
          "Data Último Contacto": pctFilled(investidores, (i) => i.dataUltimoContacto),
          "Classificação": pctFilled(investidores, (i) => i.classificacao?.length > 0 ? i.classificacao : null),
          "Capital Mínimo": pctFilled(investidores, (i) => i.capitalMin),
          "Capital Máximo": pctFilled(investidores, (i) => i.capitalMax),
          "Montante Investido": pctFilled(investidores, (i) => i.montanteInvestido),
          "NDA Assinado": pctFilled(investidores, (i) => i.ndaAssinado ? "sim" : null),
          "Estratégia": pctFilled(investidores, (i) => i.estrategia?.length > 0 ? i.estrategia : null),
          "Tipo Investidor": pctFilled(investidores, (i) => i.tipoInvestidor?.length > 0 ? i.tipoInvestidor : null),
          "ROI Investidor %": pctFilled(investidores, (i) => i.roiInvestidor),
        },
      },
      consultores: {
        total: consultoresRaw.length,
        campos: {
          "Nome": pctFilled(consultoresRaw, (c2) => c2.nome),
          "Estatuto": pctFilled(consultoresRaw, (c2) => c2.estatuto),
          "Contacto": pctFilled(consultoresRaw, (c2) => c2.contacto),
          "Imobiliária": pctFilled(consultoresRaw, (c2) => c2.imobiliaria?.length > 0 ? c2.imobiliaria : null),
          "Email": pctFilled(consultoresRaw, (c2) => c2.email),
          "Zona Atuação": pctFilled(consultoresRaw, (c2) => c2.zonas?.length > 0 ? c2.zonas : null),
          "Data Follow Up": pctFilled(consultoresRaw, (c2) => c2.dataFollowUp),
          "Imóveis Enviados": pctFilled(consultoresRaw, (c2) => c2.imoveisEnviados),
          "Imóveis Off/Market": pctFilled(consultoresRaw, (c2) => c2.imoveisOffMarket),
          "Data 1ª Call": pctFilled(consultoresRaw, (c2) => c2.dataPrimeiraCall),
          "Classificação": pctFilled(consultoresRaw, (c2) => c2.classificacao),
        },
      },
      faturacao: {
        total: negocios.length,
        campos: {
          "Movimento": pctFilled(negocios, (n) => n.movimento),
          "Categoria": pctFilled(negocios, (n) => n.categoria),
          "Fase": pctFilled(negocios, (n) => n.fase),
          "Lucro Estimado": pctFilled(negocios, (n) => n.lucroEstimado),
          "Lucro Real": pctFilled(negocios, (n) => n.lucroReal),
          "Data": pctFilled(negocios, (n) => n.data),
          "Data Compra": pctFilled(negocios, (n) => n.dataCompra),
          "Data Venda": pctFilled(negocios, (n) => n.dataVenda),
          "Capital Total": pctFilled(negocios, (n) => n.capitalTotal),
          "Nº Investidores": pctFilled(negocios, (n) => n.nInvestidores),
        },
      },
      despesas: {
        total: despesas.length,
        campos: {
          "Movimento": pctFilled(despesas, (d) => d.movimento),
          "Categoria": pctFilled(despesas, (d) => d.categoria),
          "Timing": pctFilled(despesas, (d) => d.timing),
          "Custo Mensal": pctFilled(despesas, (d) => d.custoMensal),
          "Data": pctFilled(despesas, (d) => d.data),
        },
      },
    };

    // Score global: média das médias de cada DB
    for (const db of Object.values(health)) {
      const vals = Object.values(db.campos) as number[];
      db.scoreMedio = vals.length > 0 ? round2(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
    }

    const scoreGlobal = round2(Object.values(health).reduce((s, db: any) => s + db.scoreMedio, 0) / Object.keys(health).length);

    return c.json({ updatedAt: new Date().toISOString(), scoreGlobal, databases: health });
  } catch (err: any) {
    console.error("[data-health]", err.message);
    return c.json({ error: err.message }, 500);
  }
});

app.get("/_health", (c: any) => c.json({ ok: true, fn: "dashboard" }));

Deno.serve(app.fetch);
