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

export function haEscrituras(negocios) {
  return negocios.some(negocioFechado);
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
    };
  });
}
