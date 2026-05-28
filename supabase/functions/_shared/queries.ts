// Queries PostgreSQL de leitura (mappers DB row -> formato API do frontend).
// Port verbatim de src/db/queries.js (logica identica; so muda o import do pool).
import pool from "./pg.ts";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Mappers ──────────────────────────────────────────────────────
function mapNegocio(r: any) {
  return {
    id: r.id,
    movimento: r.movimento,
    categoria: r.categoria,
    fase: r.fase,
    lucroEstimado: r.lucro_estimado || 0,
    lucroReal: r.lucro_real || 0,
    custoRealObra: r.custo_real_obra || 0,
    dataVenda: r.data_venda,
    dataEstimada: r.data_estimada_venda,
    dataCompra: r.data_compra,
    data: r.data,
    pagamentoEmFalta: !!r.pagamento_em_falta,
    investidor: r.investidor_ids ? JSON.parse(r.investidor_ids) : [],
    imovel: r.imovel_id ? [r.imovel_id] : [],
    consultorIds: r.consultor_ids ? JSON.parse(r.consultor_ids) : [],
    notas: r.notas,
    quotaSomnium: r.quota_somnium || 0,
    capitalTotal: r.capital_total || 0,
    nInvestidores: r.n_investidores || 0,
    pagamentosFaseados: (() => {
      try {
        const v = typeof r.pagamentos_faseados === "string" ? JSON.parse(r.pagamentos_faseados) : r.pagamentos_faseados;
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    })(),
  };
}

function parseRateio(raw: any) {
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return null;
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = parseFloat(v as string);
      if (Number.isFinite(n) && n > 0) clean[k] = n;
    }
    return Object.keys(clean).length >= 2 ? clean : null;
  } catch {
    return null;
  }
}

function mapDespesa(r: any) {
  return {
    id: r.id,
    movimento: r.movimento,
    categoria: r.categoria,
    data: r.data,
    custoMensal: r.custo_mensal || 0,
    custoAnual: r.custo_anual || 0,
    timing: r.timing,
    notas: r.notas,
    regiao: r.regiao || null,
    rateio: parseRateio(r.rateio),
  };
}

function aplicarRateioRegiao(despesas: any[], regiao: string) {
  if (!regiao) return despesas;
  const out: any[] = [];
  for (const d of despesas) {
    if (d.rateio && d.rateio[regiao] != null) {
      const frac = d.rateio[regiao];
      out.push({
        ...d,
        custoMensal: round2((d.custoMensal || 0) * frac),
        custoAnual: round2((d.custoAnual || 0) * frac),
        rateioFraccao: frac,
        partilhada: true,
      });
    } else if (!d.rateio && d.regiao === regiao) {
      out.push(d);
    }
  }
  return out;
}

function mapImovel(r: any) {
  const zonas = r.zonas ? JSON.parse(r.zonas) : [];
  return {
    id: r.id,
    nome: r.nome,
    estado: (r.estado || "").replace(/^\d+-\s*/, "").replace("Nao interessa", "Não interessa"),
    tipologia: r.tipologia,
    askPrice: r.ask_price || 0,
    valorProposta: r.valor_proposta || 0,
    custoObra: r.custo_estimado_obra || 0,
    areaBruta: r.area_bruta,
    area: r.area_bruta || 0,
    roi: r.roi || 0,
    roiAnualizado: r.roi_anualizado || 0,
    origem: r.origem,
    zona: r.zona,
    zonas,
    nomeConsultor: r.nome_consultor,
    modeloNegocio: r.modelo_negocio,
    motivoDescarte: r.motivo_descarte,
    valorVendaRemodelado: r.valor_venda_remodelado || 0,
    dataFollowUp: r.data_follow_up,
    dataAdicionado: r.data_adicionado,
    dataChamada: r.data_chamada,
    dataVisita: r.data_visita,
    dataProposta: r.data_proposta,
    dataPropostaAceite: r.data_proposta_aceite,
    dataEstudoMercado: r.data_estudo_mercado,
    dataAceiteInvestidor: r.data_aceite_investidor,
    link: r.link,
    notas: r.notas,
  };
}

function mapInvestidor(r: any) {
  return {
    id: r.id,
    nome: r.nome,
    status: r.status,
    classificacao: r.classificacao ? [r.classificacao] : [],
    pontuacao: r.pontuacao || 0,
    capitalMin: r.capital_min || 0,
    capitalMax: r.capital_max || 0,
    montanteInvestido: r.montante_investido || 0,
    numeroNegocios: r.numero_negocios || 0,
    estrategia: r.estrategia ? JSON.parse(r.estrategia) : [],
    origem: r.origem,
    ndaAssinado: !!r.nda_assinado,
    tipoInvestidor: r.tipo_investidor ? JSON.parse(r.tipo_investidor) : [],
    perfilRisco: r.perfil_risco,
    telemovel: r.telemovel,
    email: r.email,
    proximaAcao: r.proxima_acao,
    roiInvestidor: r.roi_investidor || 0,
    roiAnualizadoInvestidor: r.roi_anualizado_investidor || 0,
    motivoNaoAprovacao: r.motivo_nao_aprovacao,
    motivoInatividade: r.motivo_inatividade,
    dataReuniao: r.data_reuniao,
    dataPrimeiroContacto: r.data_primeiro_contacto,
    dataUltimoContacto: r.data_ultimo_contacto,
    dataCapitalTransferido: r.data_capital_transferido,
    dataProximaAcao: r.data_proxima_acao,
    dataApresentacaoNegocio: r.data_apresentacao_negocio,
    dataAprovacaoNegocio: r.data_aprovacao_negocio,
    diasSemContacto: (() => {
      const u = r.data_ultimo_contacto ?? r.data_reuniao ?? r.data_primeiro_contacto;
      if (!u) return null;
      return Math.floor((Date.now() - new Date(u).getTime()) / 86400000);
    })(),
    notas: r.notas,
  };
}

function mapConsultor(r: any) {
  return {
    id: r.id,
    nome: r.nome,
    estatuto: r.estatuto,
    tipo: r.tipo,
    classificacao: r.classificacao,
    imobiliaria: r.imobiliaria ? JSON.parse(r.imobiliaria) : [],
    zonas: r.zonas ? JSON.parse(r.zonas) : [],
    contacto: r.contacto,
    email: r.email,
    equipaRemax: r.equipa_remax,
    dataInicio: r.data_inicio,
    dataFollowUp: r.data_follow_up,
    dataProximoFollowUp: r.data_proximo_follow_up,
    motivoFollowUp: r.motivo_follow_up,
    imoveisEnviados: r.imoveis_enviados || 0,
    imoveisOffMarket: r.imoveis_off_market || 0,
    metaMensalLeads: r.meta_mensal_leads || 0,
    comissao: r.comissao || 0,
    dataPrimeiraCall: r.data_primeira_call,
    lucroGerado: r.lucro_gerado || 0,
    motivoDescontinuacao: r.motivo_descontinuacao,
    notas: r.notas,
    scorePrioridade: r.score_prioridade || 0,
    taxaQualidade: r.taxa_qualidade || 0,
    tempoMedioResposta: r.tempo_medio_resposta,
    estadoAvaliacao: r.estado_avaliacao || "Em avaliação",
    createdAt: r.created_at,
  };
}

// ── Query functions ──────────────────────────────────────────────
function regiaoWhere(regiao?: string | null) {
  return regiao ? { clause: " WHERE regiao = $1", params: [regiao] } : { clause: "", params: [] as any[] };
}

export async function getNegócios({ regiao }: { regiao?: string | null } = {}) {
  const w = regiaoWhere(regiao);
  const { rows } = await pool.query(`SELECT * FROM negocios${w.clause}`, w.params);
  return rows.map(mapNegocio);
}

export async function getDespesas({ regiao }: { regiao?: string | null } = {}) {
  if (regiao) {
    const { rows } = await pool.query(`SELECT * FROM despesas WHERE regiao = $1 OR rateio IS NOT NULL`, [regiao]);
    return aplicarRateioRegiao(rows.map(mapDespesa), regiao);
  }
  const { rows } = await pool.query(`SELECT * FROM despesas`);
  return rows.map(mapDespesa);
}

const IMOVEIS_COLS = `id, nome, estado, tipologia, ask_price, valor_proposta,
  custo_estimado_obra, area_bruta, roi, roi_anualizado, origem, zona, zonas,
  nome_consultor, modelo_negocio, motivo_descarte, valor_venda_remodelado,
  data_follow_up, data_adicionado, data_chamada, data_visita, data_proposta,
  data_proposta_aceite, data_estudo_mercado, data_aceite_investidor, link, notas,
  regiao, concelho, freguesia`;

export async function getImóveis({ regiao }: { regiao?: string | null } = {}) {
  const w = regiaoWhere(regiao);
  const { rows } = await pool.query(`SELECT ${IMOVEIS_COLS} FROM imoveis${w.clause}`, w.params);
  return rows.map(mapImovel);
}

export async function getInvestidores({ regiao }: { regiao?: string | null } = {}) {
  if (regiao) {
    const { rows } = await pool.query(`SELECT * FROM investidores WHERE regioes_preferidas LIKE $1`, [`%"${regiao}"%`]);
    return rows.map(mapInvestidor);
  }
  const { rows } = await pool.query("SELECT * FROM investidores");
  return rows.map(mapInvestidor);
}

export async function getConsultores({ regiao }: { regiao?: string | null } = {}) {
  const w = regiaoWhere(regiao);
  const { rows } = await pool.query(`SELECT * FROM consultores${w.clause}`, w.params);
  return rows.map(mapConsultor);
}

export async function getTarefas({ regiao }: { regiao?: string | null } = {}) {
  const w = regiaoWhere(regiao);
  const { rows } = await pool.query(`SELECT * FROM tarefas${w.clause} ORDER BY inicio DESC`, w.params);
  return rows.map((r: any) => ({
    id: r.id,
    tarefa: r.tarefa,
    status: r.status,
    categoria: r.categoria,
    inicio: r.inicio,
    fim: r.fim,
    funcionario: r.funcionario,
    tempoHoras: r.tempo_horas || 0,
    grupoId: r.grupo_id,
  }));
}

function mapVisita(r: any) {
  return {
    id: r.id,
    imovelId: r.imovel_id,
    dataHora: r.data_hora instanceof Date ? r.data_hora.toISOString() : r.data_hora,
    estado: r.estado,
    investidorId: r.investidor_id,
    consultorId: r.consultor_id,
    resultado: r.resultado,
    notas: r.notas,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

export async function getVisitas({ imovelId, regiao }: { imovelId?: string; regiao?: string | null } = {}) {
  const conds: string[] = [];
  const params: any[] = [];
  if (imovelId) {
    params.push(imovelId);
    conds.push(`imovel_id = $${params.length}`);
  }
  if (regiao) {
    params.push(regiao);
    conds.push(`regiao = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query(`SELECT * FROM visitas ${where} ORDER BY data_hora DESC`, params);
  return rows.map(mapVisita);
}

export async function getVisitasEnriquecidas({ imovelId }: { imovelId?: string } = {}) {
  const params: any[] = [];
  let where = "";
  if (imovelId) {
    params.push(imovelId);
    where = `WHERE v.imovel_id = $1`;
  }
  const { rows } = await pool.query(
    `
    SELECT v.*,
           inv.nome AS investidor_nome,
           con.nome AS consultor_nome,
           im.nome AS imovel_nome
      FROM visitas v
      LEFT JOIN investidores inv ON inv.id = v.investidor_id
      LEFT JOIN consultores con  ON con.id = v.consultor_id
      LEFT JOIN imoveis im       ON im.id  = v.imovel_id
      ${where}
      ORDER BY v.data_hora DESC
  `,
    params,
  );
  return rows.map((r: any) => ({
    ...mapVisita(r),
    investidorNome: r.investidor_nome,
    consultorNome: r.consultor_nome,
    imovelNome: r.imovel_nome,
  }));
}

export async function syncDataVisitaDerivada(imovelId: string) {
  if (!imovelId) return;
  const { rows } = await pool.query(
    `SELECT MAX(data_hora) AS d FROM visitas
       WHERE imovel_id = $1 AND estado = 'realizada' AND data_hora <= NOW()`,
    [imovelId],
  );
  const ultima = rows[0]?.d;
  await pool.query(
    `UPDATE imoveis SET data_visita = $1, updated_at = NOW()::TEXT WHERE id = $2`,
    [ultima ? new Date(ultima).toISOString().slice(0, 10) : null, imovelId],
  );
}

export { round2 };
