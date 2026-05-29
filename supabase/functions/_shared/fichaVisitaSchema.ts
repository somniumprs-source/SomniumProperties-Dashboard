// Schema da Ficha de Visita — mirror de src/constants/fichaVisitaSchema.js.
// Fonte unica de verdade partilhada pelo renderer do PDF (renderFichaVisita em
// pdfImovelDocs.ts). Manter em sync com a versao JS do frontend.

export const CHECKLIST_SECTIONS = [
  {
    key: "estrutura_exterior", pdfHeader: "1. ESTRUTURA E EXTERIOR", label: "Estrutura e exterior",
    items: [
      "Fachada (reboco, pintura, fissuras)",
      "Telhado / cobertura (telhas, isolamento)",
      "Chaminés e saídas de ventilação",
      "Terraço / varanda (impermeabilização)",
      "Garagem / estacionamento coberto",
      "Muros / vedação / portões",
      "Logradouro / jardim / quintal",
      "Fundações (assentamentos visíveis)",
      "Caixas de estore exteriores",
    ],
  },
  {
    key: "interior", pdfHeader: "2. INTERIOR — COMPARTIMENTOS", label: "Interior — compartimentos",
    items: [
      "Hall de entrada", "Sala de estar", "Sala de jantar", "Cozinha",
      "Quarto 1 (suite)", "Quarto 2", "Quarto 3", "WC 1", "WC 2",
      "Despensa / arrecadação", "Corredor / circulação",
    ],
  },
  {
    key: "paredes_tectos", pdfHeader: "3. PAREDES, TECTOS E PAVIMENTOS", label: "Paredes, tectos e pavimentos",
    items: [
      "Paredes interiores (fissuras, humidade, bolor)",
      "Tectos (manchas, infiltrações, deformações)",
      "Pavimento sala / quartos (tipo e estado)",
      "Pavimento cozinha (tipo e estado)",
      "Pavimento WC (tipo e estado)",
      "Rodapés e molduras",
      "Portas interiores (funcionamento, estado)",
    ],
  },
  {
    key: "instalacoes", pdfHeader: "4. INSTALAÇÕES TÉCNICAS", label: "Instalações técnicas",
    items: [
      "Quadro eléctrico (disjuntores, diferencial, terra)",
      "Tomadas e interruptores (quantidade, estado)",
      "Iluminação (pontos de luz, funcionamento)",
      "Canalização de água fria (pressão, material)",
      "Canalização de água quente (pressão, material)",
      "Esgotos (cheiros, escoamento, caixas de visita)",
      "Esquentador / caldeira / bomba de calor",
      "Aquecimento central (radiadores, piso radiante)",
      "Ar condicionado (unidades, estado)",
      "Instalação de gás (tipo, certificação)",
      "Telecomunicações (fibra, TV cabo, tomadas)",
    ],
  },
  {
    key: "caixilharia", pdfHeader: "5. CAIXILHARIA E ISOLAMENTO", label: "Caixilharia e isolamento",
    items: [
      "Janelas (material, vidro simples/duplo)",
      "Estores / portadas (funcionamento)",
      "Porta de entrada (segurança, estado)",
      "Isolamento térmico (pontes térmicas visíveis)",
      "Isolamento acústico (ruído exterior)",
      "Humidade por condensação (paredes frias)",
    ],
  },
  {
    key: "cozinha", pdfHeader: "6. COZINHA — DETALHE", label: "Cozinha — detalhe",
    items: [
      "Bancada (material, estado)",
      "Armários superiores e inferiores",
      "Equipamentos (forno, placa, exaustor)",
      "Ponto de água (torneira, lava-louça)",
      "Revestimento de parede (azulejo, estado)",
      "Ventilação / exaustão",
    ],
  },
  {
    key: "wc", pdfHeader: "7. CASAS DE BANHO — DETALHE", label: "Casas de banho — detalhe",
    items: [
      "Louças sanitárias (sanita, bidé, lavatório)",
      "Base de duche / banheira (impermeabilização)",
      "Torneiras e misturadoras",
      "Azulejos (estado, fissuras, juntas)",
      "Ventilação (natural ou mecânica)",
      "Espelho e acessórios",
    ],
  },
  {
    key: "envolvente", pdfHeader: "8. ENVOLVENTE E LOCALIZAÇÃO", label: "Envolvente e localização",
    items: [
      "Vizinhança (tipo de zona, comércio, serviços)",
      "Segurança da zona",
      "Ruído (tráfego, vizinhos, indústria)",
      "Transportes públicos (proximidade)",
      "Estacionamento na envolvente",
      "Orientação solar (nascente, poente)",
      "Luminosidade natural dos compartimentos",
      "Estado do prédio / condomínio (se aplicável)",
      "Elevador (se aplicável)",
      "Zonas comuns (se aplicável)",
    ],
  },
];

export const RATINGS = [
  { key: "B", label: "Bom" },
  { key: "R", label: "Razoável" },
  { key: "M", label: "Mau" },
  { key: "NA", label: "N/A" },
];

export const MEDICAO_COMPARTIMENTOS = [
  "Sala", "Cozinha", "Quarto 1", "Quarto 2", "Quarto 3",
  "WC 1", "WC 2", "Corredor", "Varanda / Terraço", "Garagem",
];

export const OBRA_TRABALHOS = [
  "Demolições e remoção de entulho",
  "Estrutura / alvenaria / paredes",
  "Cobertura / telhado",
  "Canalização (água e esgotos)",
  "Electricidade (quadro e instalação)",
  "Revestimentos (pavimentos e paredes)",
  "Cozinha completa",
  "Casa(s) de banho completa(s)",
  "Caixilharia (janelas e portas)",
  "Pintura interior e exterior",
  "Isolamento térmico / acústico",
  "Ar condicionado / aquecimento",
  "Arranjos exteriores / jardim",
  "Outros",
];

export const GRAUS_OBRA = [
  { key: "L", label: "Ligeira" },
  { key: "P", label: "Profunda" },
];

export const RELATORIO_OBRAS = [
  "Demolições e remoção",
  "Estrutura / alvenaria",
  "Canalização",
  "Electricidade",
  "Revestimentos / acabamentos",
  "Cozinha e WC",
  "Caixilharia",
  "Pintura",
  "Outros",
];

export const DECISOES = [
  { key: "GO", label: "GO — Avançar para estudo de mercado e análise de rentabilidade" },
  { key: "SEGUNDA_VISITA", label: "SEGUNDA VISITA — Necessita validação adicional (especificar)" },
  { key: "PERITO", label: "PERITO — Necessita avaliação por engenheiro / arquitecto" },
  { key: "STAND_BY", label: "STAND-BY — Aguardar documentação ou informação adicional" },
  { key: "NO_GO", label: "NO GO — Descartar (especificar motivo)" },
];

export function emptyFicha(): any {
  const checklists: any = {};
  for (const sec of CHECKLIST_SECTIONS) {
    checklists[sec.key] = sec.items.map(() => ({ rating: "", obs: "" }));
  }
  return {
    preVisita: { notasCampo: { impressaoContacto: "", pontosCriticos: "", estrategia: "" } },
    checklists,
    medicoes: MEDICAO_COMPARTIMENTOS.map(() => ({ m2: "", obs: "" })),
    areaMedida: "",
    discrepancia: false,
    estimativaObra: OBRA_TRABALHOS.map(() => ({ necessario: false, grau: "", custo: "" })),
    totalObra: "",
    relatorio: {
      estadoReal: "",
      obras: RELATORIO_OBRAS.map(() => ({ custo: "" })),
      pontosFortes: "",
      pontosFracos: "",
      potencial: "",
      decisao: "",
      justificacao: "",
      proximosPassos: "",
    },
  };
}

export function normalizeFicha(saved: any): any {
  const base = emptyFicha();
  if (!saved || typeof saved !== "object") return base;
  if (saved.preVisita?.notasCampo) {
    base.preVisita.notasCampo = { ...base.preVisita.notasCampo, ...saved.preVisita.notasCampo };
  }
  for (const sec of CHECKLIST_SECTIONS) {
    const arr = saved.checklists?.[sec.key];
    if (Array.isArray(arr)) {
      base.checklists[sec.key] = sec.items.map((_: any, i: number) => ({
        rating: arr[i]?.rating || "",
        obs: arr[i]?.obs || "",
      }));
    }
  }
  if (Array.isArray(saved.medicoes)) {
    base.medicoes = MEDICAO_COMPARTIMENTOS.map((_: any, i: number) => ({
      m2: saved.medicoes[i]?.m2 ?? "",
      obs: saved.medicoes[i]?.obs ?? "",
    }));
  }
  base.areaMedida = saved.areaMedida ?? "";
  base.discrepancia = !!saved.discrepancia;
  if (Array.isArray(saved.estimativaObra)) {
    base.estimativaObra = OBRA_TRABALHOS.map((_: any, i: number) => ({
      necessario: !!saved.estimativaObra[i]?.necessario,
      grau: saved.estimativaObra[i]?.grau || "",
      custo: saved.estimativaObra[i]?.custo ?? "",
    }));
  }
  base.totalObra = saved.totalObra ?? "";
  if (saved.relatorio) {
    base.relatorio = { ...base.relatorio, ...saved.relatorio };
    base.relatorio.obras = RELATORIO_OBRAS.map((_: any, i: number) => ({
      custo: saved.relatorio.obras?.[i]?.custo ?? "",
    }));
  }
  return base;
}
