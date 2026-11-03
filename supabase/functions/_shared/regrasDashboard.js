// Regras de medição do Dashboard — fonte única para o Express (server.js) e a
// Edge Function dashboard. Só funções puras, sem BD nem dependências, para
// serem testadas com `npm run test:dashboard` e nunca divergirem entre backends.
// As explicações de cada indicador vivem em src/lib/catalogoMetricas.js.

const ESTADOS_PARCERIA = new Set(["Em Parceria", "Investidor em parceria"]);
const ESTADOS_CAPACIDADE = new Set(["Investidor em parceria", "Investidor Qualificado em Carteira"]);
const ESTADOS_IMOVEL_FORA = new Set(["Descartado", "Nao interessa", "Não interessa", "Cancelado"]);
const DIA_MS = 86400000;

// Parceria por estado ou por capital efetivo: os dois contam, mas são mostrados à parte.
export function ehParceria(i) {
  return ESTADOS_PARCERIA.has(i.status) || i.montanteInvestido > 0 || i.numeroNegocios > 0;
}

export function contagemParceria(investidores) {
  return {
    porEstado: investidores.filter((i) => ESTADOS_PARCERIA.has(i.status)).length,
    comAporte: investidores.filter((i) => i.montanteInvestido > 0).length,
  };
}

// Proposta de 25/10: "Aberto Parcerias" ainda não é parceiro.
export function ehConsultorParceiro(c) {
  return c.estatuto === "Consultores em Parceria";
}

// Capacidade declarada, ainda por investir. Nunca é capital confirmado.
export function capacidadeDeclarada(investidores) {
  return investidores
    .filter((i) => ESTADOS_CAPACIDADE.has(i.status) && !i.naoReinveste)
    .reduce((s, i) => s + Math.max(0, (i.capitalMax || 0) - (i.montanteInvestido || 0)), 0);
}

export function ehChamada(canal) {
  return /chamada|telefone|call/i.test(canal || "");
}

// "Por contactar" é o estado Adicionado sem chamada; saltar fases é normal e
// um imóvel em fase avançada ou fora do funil nunca conta aqui.
export function imoveisPorContactar(imoveis) {
  return imoveis.filter((i) => i.estado === "Adicionado" && !i.dataChamada);
}

// Decisão do CEO (03/11/2026): negócio fechado só com escritura de venda.
// A data de venda não serve: o T2 Condeixa tem data sem ter havido escritura.
export function negocioFechado(n) {
  return !!n.dataEscrituraVenda;
}

// A escritura só se mede quando a coluna existe (migração 0092): antes disso
// "0 negócios fechados" seria falso, por isso fica sem leitura.
export function escrituraRegistada(negocios) {
  return negocios.length > 0 && negocios.every((n) => n.dataEscrituraVenda !== undefined);
}

export function resumoFases(fases, hoje = new Date()) {
  const diasAtraso = (f) => {
    if (!f.data_fim_prevista || f.data_fim_real) return 0;
    return Math.max(0, Math.floor((hoje.getTime() - new Date(f.data_fim_prevista).getTime()) / DIA_MS));
  };
  const atrasos = fases.map(diasAtraso).filter((d) => d > 0);
  return {
    total: fases.length,
    comPrevisao: fases.filter((f) => f.data_fim_prevista).length,
    atrasadas: atrasos.length,
    maiorAtrasoDias: atrasos.length ? Math.max(...atrasos) : 0,
  };
}

export function custoRealObra(despesas, negocioIds) {
  return despesas
    .filter((d) => d.negocioId && negocioIds.has(d.negocioId))
    .reduce((s, d) => s + (d.custoMensal || d.custoAnual || 0), 0);
}

export function mediana(valores) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

// Dias na fase atual: última alteração real do campo `estado` no histórico.
// Imóveis fora do funil ficam de fora; sem histórico não se estima nada.
export function diasNaFase(imoveis, historico, hoje = new Date()) {
  const ultimaMudanca = new Map();
  for (const h of historico) {
    const alteracoes = typeof h.alteracoes === "string" ? JSON.parse(h.alteracoes) : h.alteracoes;
    const mudou = (alteracoes || []).some((a) => a.campo === "estado" && a.antes !== a.depois);
    if (!mudou) continue;
    const t = new Date(h.created_at).getTime();
    if (t > (ultimaMudanca.get(h.entidade_id) || 0)) ultimaMudanca.set(h.entidade_id, t);
  }
  const dias = imoveis
    .filter((i) => !ESTADOS_IMOVEL_FORA.has(i.estado) && ultimaMudanca.has(i.id))
    .map((i) => Math.max(0, Math.floor((hoje.getTime() - ultimaMudanca.get(i.id)) / DIA_MS)));
  return { mediana: mediana(dias), amostra: dias.length };
}

// As análises também cobrem imóveis só estudados; somá-las daria um "lucro"
// sem significado. Só contam as de imóveis que são negócios reais, com retorno
// ponderado pelo capital.
const ESTADOS_NEGOCIO = new Set(["CAEP", "Wholesaling", "Fix and Flip"]);

export function resumoAnalisesNegocios(analises) {
  const lista = (analises || []).filter((a) => ESTADOS_NEGOCIO.has(a.imovel_estado));
  const lucro = lista.reduce((s, a) => s + (a.lucro_liquido || 0), 0);
  const capital = lista.reduce((s, a) => s + (a.capital_necessario || 0), 0);
  const anualizado = lista.reduce((s, a) => s + (a.retorno_anualizado || 0) * (a.capital_necessario || 0), 0);
  return {
    total: lista.length,
    lucro,
    capital,
    retornoTotal: capital > 0 ? Math.round(lucro / capital * 10000) / 100 : null,
    retornoAnualizado: capital > 0 ? Math.round(anualizado / capital * 100) / 100 : null,
  };
}

// Fases a que um imóvel só chega depois de alguém ter atendido a chamada.
// Ficam de fora as de antes do contacto, as de espera sem contacto garantido
// (Pendentes) e as de saída, onde não se sabe se houve conversa.
const FASES_SEM_CONTACTO = new Set([
  "Pré-aprovação", "Adicionado", "Chamada Não Atendida", "Pendentes", ...ESTADOS_IMOVEL_FORA,
]);
const limpaEstado = (e) => String(e || "").replace(/^\d+-\s*/, "").trim();
const comContacto = (e) => !!limpaEstado(e) && !FASES_SEM_CONTACTO.has(limpaEstado(e));

// Contacto efetivo (C01): o imóvel está ou já esteve numa fase pós-contacto.
export function imoveisContactados(imoveis, historico) {
  const ids = new Set(imoveis.filter((i) => comContacto(i.estado)).map((i) => i.id));
  for (const h of historico) {
    const alteracoes = typeof h.alteracoes === "string" ? JSON.parse(h.alteracoes) : h.alteracoes;
    if ((alteracoes || []).some((a) => a.campo === "estado" && comContacto(a.depois))) ids.add(h.entidade_id);
  }
  return ids;
}

// Motivos de perda (C15): um imóvel pode ter vários motivos, separados por ";".
export function motivosPerda(imoveis) {
  const perdidos = imoveis.filter((i) => ESTADOS_IMOVEL_FORA.has(limpaEstado(i.estado)));
  const contagem = {};
  let comMotivo = 0;
  for (const i of perdidos) {
    const motivos = String(i.motivoNaoInteressa || i.motivoDescarte || "")
      .split(";").map((m) => m.trim()).filter(Boolean);
    if (motivos.length) comMotivo++;
    for (const m of motivos) contagem[m] = (contagem[m] || 0) + 1;
  }
  return {
    perdas: perdidos.length,
    comMotivo,
    motivos: Object.entries(contagem).map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total),
  };
}

// Mesmo critério de prazo da Agenda: data só com o dia vale até ao fim desse dia.
function dataPrazo(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59` : s);
  return isNaN(d.getTime()) ? null : d;
}

// Cumprimento de prazos (C12): tarefas cujo prazo original venceu no período.
// Conta o prazo original, por isso adiar não melhora o resultado.
export function cumprimentoTarefas(tarefas, inicio, fim, agora = new Date()) {
  const limite = Math.min(fim.getTime(), agora.getTime());
  const vencidas = tarefas.filter((t) => {
    if (t.arquivada || t.por_aprovar) return false;
    const p = dataPrazo(t.prazo_original);
    return !!p && p.getTime() >= inicio.getTime() && p.getTime() <= limite;
  });
  const noPrazo = vencidas.filter((t) =>
    t.concluida_em && new Date(t.concluida_em).getTime() <= dataPrazo(t.prazo_original).getTime()
  ).length;
  return {
    vencidas: vencidas.length,
    noPrazo,
    pct: vencidas.length ? Math.round(noPrazo / vencidas.length * 10000) / 100 : null,
  };
}

// Contribuição da Somnium (P05): quota do negócio (CAEP) ou fee (restantes)
// vezes a parte da Somnium; a fee real só substitui a estimada com escritura.
// Sem parte registada, não se calcula.
export function contribuicaoSomnium(n) {
  if (n.parteSomniumPct == null) return null;
  const fee = negocioFechado(n) ? n.lucroReal : n.lucroEstimado;
  const base = n.categoria === "CAEP" ? n.quotaSomnium : fee;
  return Math.round((base || 0) * n.parteSomniumPct) / 100;
}

// Um negócio só sai da lista de projetos com escritura de venda.
export function resumoProjetos(negocios, fases, despesas, hoje = new Date()) {
  return negocios.filter((n) => !negocioFechado(n)).map((n) => {
    const doProjeto = fases.filter((f) => f.negocio_id === n.id);
    return {
      id: n.id,
      nome: n.movimento,
      modelo: n.categoria,
      fasesEmCurso: doProjeto.filter((f) => f.estado === "em_curso").map((f) => f.nome),
      prazos: resumoFases(doProjeto, hoje),
      custoReal: custoRealObra(despesas, new Set([n.id])),
      vendaPrevista: n.dataEstimada || null,
      contribuicaoSomnium: contribuicaoSomnium(n),
      parteSomniumPct: n.parteSomniumPct,
    };
  });
}
