// Apresentacao "Reuniao Semanal 07/06 22h" — Somnium Properties (Semana W23)
// Identidade preto/ouro, premium. Gerada com PptxGenJS a partir do relatorio.
const path = require("path");
const PptxGenJS = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");
const LOGO = path.join(ROOT, "public", "logo-transparent.png");
const OUT = path.join(ROOT, "Relatorios", "2026-W23", "Reuniao Semanal 07-06 22h.pptx");

const C = {
  bg: "0D0D0D", card: "18181A", card2: "201E1A", cardGold: "241F12",
  gold: "C9A84C", goldDim: "7E6B34",
  light: "F4F2EC", white: "FFFFFF", muted: "9C988C", line: "302D27",
  green: "57B368", red: "D9534B", amber: "D9A441",
};
const FH = "Georgia";       // headers
const FB = "Calibri";       // body
const W = 13.333, H = 7.5, M = 0.6;

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: W, height: H });
pptx.layout = "WIDE";

// ---- helpers ---------------------------------------------------------------
function base(slide, { eyebrow, title, num }) {
  slide.background = { color: C.bg };
  slide.addShape("rect", { x: 0, y: 0, w: 0.12, h: H, fill: { color: C.gold } });
  if (eyebrow)
    slide.addText(eyebrow.toUpperCase(), {
      x: M, y: 0.42, w: W - 2 * M, h: 0.3, fontFace: FB, fontSize: 11, bold: true,
      color: C.gold, charSpacing: 3,
    });
  if (title)
    slide.addText(title, {
      x: M, y: 0.7, w: W - 2 * M, h: 0.85, fontFace: FH, fontSize: 30, bold: true,
      color: C.light, lineSpacing: 32,
    });
  // footer
  slide.addShape("line", { x: M, y: 7.02, w: W - 2 * M, h: 0, line: { color: C.line, width: 1 } });
  slide.addText("SOMNIUM PROPERTIES · CONFIDENCIAL", {
    x: M, y: 7.07, w: 6, h: 0.3, fontFace: FB, fontSize: 8, color: C.muted, charSpacing: 1,
  });
  slide.addText("Reuniao Semanal · 07/06 22h · W23", {
    x: W - M - 4.5, y: 7.07, w: 4.0, h: 0.3, fontFace: FB, fontSize: 8, color: C.muted,
    align: "right",
  });
  if (num)
    slide.addText(String(num).padStart(2, "0"), {
      x: W - M - 0.45, y: 7.07, w: 0.45, h: 0.3, fontFace: FB, fontSize: 8, bold: true,
      color: C.gold, align: "right",
    });
}

function card(slide, x, y, w, h, fill = C.card) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.06, fill: { color: fill },
    line: { color: C.line, width: 1 } });
}
function goldTab(slide, x, y, w) {
  slide.addShape("rect", { x, y, w, h: 0.05, fill: { color: C.gold } });
}

// ===========================================================================
// SLIDE 1 — CAPA
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.16, fill: { color: C.gold } });
  s.addShape("rect", { x: 0, y: H - 0.16, w: W, h: 0.16, fill: { color: C.gold } });
  s.addImage({ path: LOGO, x: (W - 3.4) / 2, y: 1.25, w: 3.4, h: 3.4 * 614 / 1516 });
  s.addText("RELATORIO PARA REUNIAO", {
    x: 0, y: 3.35, w: W, h: 0.35, align: "center", fontFace: FB, fontSize: 13, bold: true,
    color: C.gold, charSpacing: 4,
  });
  s.addText("Reuniao Semanal", {
    x: 0, y: 3.75, w: W, h: 1.0, align: "center", fontFace: FH, fontSize: 46, bold: true,
    color: C.white,
  });
  s.addText("07/06/2026  ·  22h00", {
    x: 0, y: 4.85, w: W, h: 0.45, align: "center", fontFace: FH, fontSize: 20, color: C.gold,
  });
  s.addText("Semana W23  ·  1 a 7 de Junho  ·  CEO, Investidores, Imoveis e Claude Code", {
    x: 0, y: 5.35, w: W, h: 0.35, align: "center", fontFace: FB, fontSize: 12, color: C.muted,
  });
})();

// ===========================================================================
// SLIDE 2 — A SEMANA EM NUMEROS
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Panorama", title: "A semana em numeros", num: 2 });
  const stats = [
    ["4", "Conversas"], ["575", "Mensagens"], ["140", "Audios"], ["16", "Imagens"],
  ];
  const gap = 0.3, n = stats.length;
  const cw = (W - 2 * M - (n - 1) * gap) / n;
  stats.forEach(([v, l], i) => {
    const x = M + i * (cw + gap), y = 1.85;
    card(s, x, y, cw, 1.55, C.card);
    goldTab(s, x, y, cw);
    s.addText(v, { x, y: y + 0.2, w: cw, h: 0.85, align: "center", fontFace: FH, fontSize: 46, bold: true, color: C.gold });
    s.addText(l.toUpperCase(), { x, y: y + 1.05, w: cw, h: 0.35, align: "center", fontFace: FB, fontSize: 12, color: C.muted, charSpacing: 2 });
  });
  // comparacao faturacao
  const cy = 3.85, ch = 2.35, half = (W - 2 * M - gap) / 2;
  card(s, M, cy, half, ch, C.card);
  s.addText("FATURACAO REAL (ATE A DATA)", { x: M + 0.35, y: cy + 0.3, w: half - 0.7, h: 0.3, fontFace: FB, fontSize: 12, bold: true, color: C.muted, charSpacing: 1 });
  s.addText("1.500 €", { x: M + 0.35, y: cy + 0.7, w: half - 0.7, h: 0.9, fontFace: FH, fontSize: 50, bold: true, color: C.red });
  s.addText("Tesouraria fina. Cuidado com custos fixos antes da receita.", { x: M + 0.35, y: cy + 1.65, w: half - 0.7, h: 0.5, fontFace: FB, fontSize: 12, color: C.light });
  card(s, M + half + gap, cy, half, ch, C.cardGold);
  s.addText("META ATE AO FIM DO ANO", { x: M + half + gap + 0.35, y: cy + 0.3, w: half - 0.7, h: 0.3, fontFace: FB, fontSize: 12, bold: true, color: C.gold, charSpacing: 1 });
  s.addText("100 – 200 mil €", { x: M + half + gap + 0.35, y: cy + 0.7, w: half - 0.7, h: 0.9, fontFace: FH, fontSize: 44, bold: true, color: C.gold });
  s.addText("2 empresas · ~10 cedencias · 4 CAEP. Pipeline e estrutura suportam.", { x: M + half + gap + 0.35, y: cy + 1.65, w: half - 0.7, h: 0.5, fontFace: FB, fontSize: 12, color: C.light });
})();

// ===========================================================================
// SLIDE 3 — OS TRES DESTAQUES
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Sintese", title: "Os tres destaques da semana", num: 3 });
  const items = [
    ["01", "Estrutura desenhada", "Duas empresas-mae + conjunta (66/33). Avanco travado so pela solicitadora. Falta fechar a duvida 1 vs 3 empresas."],
    ["02", "Negocios a fechar", "Lajes 315k ao Sr. Alfredo. Cedencia de Braga rumo a CPCV em numerario. NOZ e Santo Varao em andamento."],
    ["03", "Pivot Porto/Gaia", "Coimbra sem volume. Sourcing ativo na Foz (T1, PH para 2 T1) e T4 nas Carvalhosas. Capitalizar e expandir."],
  ];
  const gap = 0.35, cw = (W - 2 * M - 2 * gap) / 3, y = 2.0, ch = 4.4;
  items.forEach(([n, t, d], i) => {
    const x = M + i * (cw + gap);
    card(s, x, y, cw, ch, C.card);
    goldTab(s, x, y, cw);
    s.addText(n, { x: x + 0.35, y: y + 0.35, w: cw - 0.7, h: 0.9, fontFace: FH, fontSize: 40, bold: true, color: C.gold });
    s.addText(t, { x: x + 0.35, y: y + 1.4, w: cw - 0.7, h: 0.7, fontFace: FH, fontSize: 19, bold: true, color: C.light });
    s.addText(d, { x: x + 0.35, y: y + 2.15, w: cw - 0.7, h: 2.0, fontFace: FB, fontSize: 13.5, color: C.muted, lineSpacing: 19 });
  });
})();

// ===========================================================================
// SLIDE 4 — ESTRUTURA SOCIETARIA
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Decisao chave", title: "Estrutura societaria: a decisao a fechar", num: 4 });
  const colW = (W - 2 * M - 0.4) / 2;
  // esquerda: estrutura desenhada
  card(s, M, 1.85, colW, 4.45, C.card);
  s.addText("ESTRUTURA DESENHADA", { x: M + 0.35, y: 2.1, w: colW - 0.7, h: 0.35, fontFace: FB, fontSize: 12, bold: true, color: C.gold, charSpacing: 1 });
  const blocks = [
    ["Empresa A", "Alexandre + Joao · 50 / 50"],
    ["Empresa B", "Luis Pedro · 100%"],
    ["Empresa conjunta", "66% Empresa A · 33% Empresa B"],
  ];
  blocks.forEach(([t, d], i) => {
    const y = 2.6 + i * 1.15;
    s.addShape("roundRect", { x: M + 0.35, y, w: colW - 0.7, h: 0.95, rectRadius: 0.05, fill: { color: C.card2 }, line: { color: C.line, width: 1 } });
    s.addShape("rect", { x: M + 0.35, y, w: 0.06, h: 0.95, fill: { color: C.gold } });
    s.addText(t, { x: M + 0.6, y: y + 0.13, w: colW - 1.0, h: 0.4, fontFace: FH, fontSize: 17, bold: true, color: C.light });
    s.addText(d, { x: M + 0.6, y: y + 0.52, w: colW - 1.0, h: 0.35, fontFace: FB, fontSize: 13, color: C.muted });
  });
  // direita: questao em aberto
  const rx = M + colW + 0.4;
  card(s, rx, 1.85, colW, 4.45, C.cardGold);
  s.addText("A FECHAR HOJE", { x: rx + 0.35, y: 2.1, w: colW - 0.7, h: 0.35, fontFace: FB, fontSize: 12, bold: true, color: C.gold, charSpacing: 1 });
  s.addText("1 empresa (com acordo parassocial) ou 3 entidades?", { x: rx + 0.35, y: 2.5, w: colW - 0.7, h: 0.8, fontFace: FH, fontSize: 20, bold: true, color: C.light, lineSpacing: 24 });
  const pts = [
    "A propria contabilista levantou a duvida e ficou por resolver.",
    "Tres entidades = ~620 €/mes de contabilidade + IRC fragmentado.",
    "Taxa reduzida de IRC (PME) so nos primeiros 50 mil de lucro.",
    "Decidir antes de assumir o custo recorrente e abrir.",
  ];
  s.addText(pts.map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 14 }, color: C.light } })), {
    x: rx + 0.35, y: 3.45, w: colW - 0.7, h: 2.6, fontFace: FB, fontSize: 14, color: C.light,
    lineSpacing: 22, paraSpaceAfter: 10,
  });
})();

// ===========================================================================
// SLIDE 5 — NEGOCIOS EM CURSO
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Pipeline", title: "Negocios em curso", num: 5 });
  const items = [
    ["Lajes", "315.000 €", "3 fraccoes (T2 Sub-Cave, Cave e RC) + interesse na 4.a apos reabilitacao. Proposta enviada ao Sr. Alfredo."],
    ["Cedencia de Braga (Daniel)", "CPCV em numerario", "Visita quarta 10h com investidor e empreiteiro. Margem ao intermediario travada."],
    ["NOZ Investimentos", "Compra em numerario", "Certidao permanente e procuracao recebidas. CPCV quando a imobiliaria tiver a documentacao."],
    ["Santo Varao", "Cedencia ~40 mil", "Em estudo. A aguardar feedback da Daniela Gaspar; Rafael Simoes como possivel alvo."],
  ];
  const gap = 0.35, cw = (W - 2 * M - gap) / 2, ch = 2.1;
  items.forEach(([t, v, d], i) => {
    const x = M + (i % 2) * (cw + gap), y = 1.85 + Math.floor(i / 2) * (ch + 0.3);
    card(s, x, y, cw, ch, C.card);
    goldTab(s, x, y, cw);
    s.addText(t, { x: x + 0.35, y: y + 0.25, w: cw - 0.7, h: 0.4, fontFace: FH, fontSize: 17, bold: true, color: C.light });
    s.addText(v, { x: x + 0.35, y: y + 0.65, w: cw - 0.7, h: 0.45, fontFace: FH, fontSize: 20, bold: true, color: C.gold });
    s.addText(d, { x: x + 0.35, y: y + 1.18, w: cw - 0.7, h: 0.8, fontFace: FB, fontSize: 12.5, color: C.muted, lineSpacing: 17 });
  });
})();

// ===========================================================================
// SLIDE 6 — CEDENCIA DE BRAGA
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Negociacao", title: "Cedencia de Braga: a linha vermelha", num: 6 });
  const colW = (W - 2 * M - 0.4) / 2;
  // esquerda: o desequilibrio
  card(s, M, 1.85, colW, 2.55, C.card);
  s.addText("O QUE O INTERMEDIARIO QUERIA", { x: M + 0.35, y: 2.1, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.muted, charSpacing: 1 });
  s.addText("Ganhar ~10 mil € (o mesmo que cada socio) com risco zero.", { x: M + 0.35, y: 2.45, w: colW - 0.7, h: 1.0, fontFace: FB, fontSize: 15, color: C.light, lineSpacing: 21 });
  s.addText("Os socios suportam: sinal de 10% (~10k), custos de CPCV e ~2.500 € cada a fundo perdido.", { x: M + 0.35, y: 3.45, w: colW - 0.7, h: 0.85, fontFace: FB, fontSize: 13, color: C.muted, lineSpacing: 18 });
  // esquerda baixo: plano
  card(s, M, 4.6, colW, 1.7, C.card);
  s.addText("PLANO", { x: M + 0.35, y: 4.8, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  s.addText("Apresentar a 2-3 investidores reais ja prontos. Controlamos a quem cedemos; com 20k faturados nao ha pressa.", { x: M + 0.35, y: 5.12, w: colW - 0.7, h: 1.05, fontFace: FB, fontSize: 13, color: C.light, lineSpacing: 18 });
  // direita: a frase
  const rx = M + colW + 0.4;
  card(s, rx, 1.85, colW, 4.45, C.cardGold);
  s.addText("“Ou leva 5 de 30,\nou 0 de 0.”", { x: rx + 0.4, y: 2.7, w: colW - 0.8, h: 1.8, fontFace: FH, fontSize: 34, bold: true, italic: true, color: C.gold, lineSpacing: 40 });
  s.addText("Posicao firme: o intermediario nunca pode ganhar mais do que cada socio.", { x: rx + 0.4, y: 4.7, w: colW - 0.8, h: 1.2, fontFace: FB, fontSize: 14, color: C.light, lineSpacing: 20 });
})();

// ===========================================================================
// SLIDE 7 — PIVOT PORTO/GAIA
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Estrategia", title: "Pivot: Coimbra para Porto / Gaia", num: 7 });
  const colW = (W - 2 * M - 0.4) / 2;
  card(s, M, 1.85, colW, 4.45, C.card);
  s.addText("PORQUE", { x: M + 0.35, y: 2.1, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  const why = [
    "Coimbra nao tem volume; e off-market e fechado.",
    "Porto/Gaia: mercado grande, 2-3 cedencias por mes viaveis.",
    "Manter CAEP e obra em Coimbra (da portefolio e aprendizagem).",
    "Capitalizar com cedencias e fazer negocios com capital da empresa.",
  ];
  s.addText(why.map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 14 } } })), {
    x: M + 0.35, y: 2.45, w: colW - 0.7, h: 3.6, fontFace: FB, fontSize: 14, color: C.light, lineSpacing: 21, paraSpaceAfter: 12,
  });
  const rx = M + colW + 0.4;
  card(s, rx, 1.85, colW, 4.45, C.card);
  s.addText("IMOVEIS IDENTIFICADOS", { x: rx + 0.35, y: 2.1, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  const props = [
    ["T1 na Foz (Arrabida)", "200k daria margem, mas rua e predio fracos."],
    ["Imovel com PH (68 m2)", "Daria 2 T1; validar areas e registo."],
    ["T4 nas Carvalhosas", "~250k, sem licenca de habitabilidade; capitais proprios."],
    ["Moradia do Joao", "Posta de lado: renda vitalicia + penhora."],
  ];
  props.forEach(([t, d], i) => {
    const y = 2.5 + i * 0.92;
    s.addText(t, { x: rx + 0.35, y, w: colW - 0.7, h: 0.35, fontFace: FH, fontSize: 14.5, bold: true, color: C.light });
    s.addText(d, { x: rx + 0.35, y: y + 0.36, w: colW - 0.7, h: 0.45, fontFace: FB, fontSize: 12, color: C.muted, lineSpacing: 16 });
  });
})();

// ===========================================================================
// SLIDE 8 — PIPELINE DE INVESTIDORES
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Comercial", title: "Pipeline de investidores · meta: 10 classe A", num: 8 });
  const rows = [
    ["Elcio Mota", "Capital e equipa OK. ROI 40-50%; 60% anualizado fora do Porto."],
    ["Sintia", "~130k disponiveis, dois negocios quase fechados. Follow-up a 1 Jul."],
    ["Daniel Nogueira", "Parece grande investidor. Classificar presencialmente na quarta."],
    ["FlipWise (4)", "Responderam; ticket medio 300k. Enviar landing e classificar."],
    ["Rafael Simoes", "Skool, ~5M feitos. Possivel interesse no de Santo Varao."],
  ];
  let y = 1.8;
  const rh = 0.84;
  rows.forEach(([t, d], i) => {
    card(s, M, y, W - 2 * M, rh, i % 2 ? C.card2 : C.card);
    s.addShape("rect", { x: M, y, w: 0.06, h: rh, fill: { color: C.gold } });
    s.addText(t, { x: M + 0.3, y: y + 0.18, w: 3.0, h: 0.5, fontFace: FH, fontSize: 16, bold: true, color: C.gold, valign: "middle" });
    s.addText(d, { x: M + 3.4, y: y + 0.0, w: W - 2 * M - 3.7, h: rh, fontFace: FB, fontSize: 13.5, color: C.light, valign: "middle" });
    y += rh + 0.16;
  });
  s.addText("Sempre 2-3 investidores prontos por criterio. A landing de investir serve de funil de classificacao.", {
    x: M, y: y + 0.05, w: W - 2 * M, h: 0.4, fontFace: FB, fontSize: 12.5, italic: true, color: C.muted,
  });
})();

// ===========================================================================
// SLIDE 9 — PLATAFORMA / SaaS
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Nova linha de negocio", title: "A plataforma como produto", num: 9 });
  const colW = (W - 2 * M - 0.4) / 2;
  card(s, M, 1.85, colW, 4.45, C.card);
  s.addText("A IDEIA", { x: M + 0.35, y: 2.1, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  const idea = [
    "Comercializar o CRM/dashboard (unico: imoveis, investidores, consultores, construtores).",
    "Modelo: ~49-99 € inicial + mensalidade. Alvo: nicho comum a preco baixo.",
    "Diogo (desenvolvimento) e Ruben (gestao) com 30-50%.",
    "Projecao: pode somar ~125k de faturacao a empresa.",
  ];
  s.addText(idea.map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 14 } } })), {
    x: M + 0.35, y: 2.45, w: colW - 0.7, h: 3.6, fontFace: FB, fontSize: 14, color: C.light, lineSpacing: 20, paraSpaceAfter: 12,
  });
  const rx = M + colW + 0.4;
  card(s, rx, 1.85, colW, 4.45, C.cardGold);
  s.addText("DISCIPLINA", { x: rx + 0.35, y: 2.1, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  const disc = [
    "Validar procura antes de construir (lista de espera com a audiencia do Veda/Diogo).",
    "Subscricao pura gera receita recorrente (evitar modelo confuso).",
    "Proteger o IP: plataforma fica da Somnium; parceiro com rev-share.",
    "Especificar numa pagina agora e reabrir no Q4. Nao tirar foco do core.",
  ];
  s.addText(disc.map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 14 } } })), {
    x: rx + 0.35, y: 2.45, w: colW - 0.7, h: 3.6, fontFace: FB, fontSize: 14, color: C.light, lineSpacing: 20, paraSpaceAfter: 12,
  });
})();

// ===========================================================================
// SLIDE 10 — APLICACAO
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Produto interno", title: "Aplicacao: o que muda", num: 10 });
  const items = [
    ["Cedencia / wholesaling", "Valor de compra = valor com cedencia. Faturacao = cedencia menos proposta. Fee isolado."],
    ["ROI medio", "Expectavel, anualizado e real, por modelo e sobre todos os negocios (nao so 3)."],
    ["Correcao Candal", "Moradia estava analisada como 2 apartamentos; reanalisar e corrigir valores."],
    ["Imoveis por fraccao", "Solucao para um projeto com varias fraccoes, sem forcar em duas fichas."],
    ["Purga automatica", "Reposta apos a migracao para o Marcelo (passava no backend, nao no frontend)."],
  ];
  const gap = 0.3, cw = (W - 2 * M - gap) / 2;
  items.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (cw + gap), y = 1.8 + row * 1.5;
    if (i === items.length - 1) {
      // ultimo item ocupa largura inteira na base
      card(s, M, 1.8 + 2 * 1.5, W - 2 * M, 1.25, C.card);
      s.addText(t, { x: M + 0.35, y: 1.8 + 2 * 1.5 + 0.2, w: W - 2 * M - 0.7, h: 0.4, fontFace: FH, fontSize: 16, bold: true, color: C.gold });
      s.addText(d, { x: M + 0.35, y: 1.8 + 2 * 1.5 + 0.62, w: W - 2 * M - 0.7, h: 0.5, fontFace: FB, fontSize: 13, color: C.light });
      return;
    }
    card(s, x, y, cw, 1.32, C.card);
    s.addText(t, { x: x + 0.3, y: y + 0.18, w: cw - 0.6, h: 0.4, fontFace: FH, fontSize: 16, bold: true, color: C.gold });
    s.addText(d, { x: x + 0.3, y: y + 0.58, w: cw - 0.6, h: 0.65, fontFace: FB, fontSize: 12.5, color: C.light, lineSpacing: 17 });
  });
})();

// ===========================================================================
// SLIDE 11 — METODO & CONTEUDO
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Metodo", title: "Claude Code e conteudo externo", num: 11 });
  const colW = (W - 2 * M - 0.4) / 2;
  card(s, M, 1.85, colW, 4.45, C.card);
  s.addText("A TENSAO E A REGRA", { x: M + 0.35, y: 2.1, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  s.addText("Gerar documentos a pressao, sem ler nem validar, ja se nota a distancia e tira credibilidade.", { x: M + 0.35, y: 2.5, w: colW - 0.7, h: 1.2, fontFace: FB, fontSize: 14, color: C.light, lineSpacing: 20 });
  s.addShape("roundRect", { x: M + 0.35, y: 3.85, w: colW - 0.7, h: 2.1, rectRadius: 0.05, fill: { color: C.card2 }, line: { color: C.gold, width: 1 } });
  s.addText("REGRA", { x: M + 0.6, y: 4.1, w: colW - 1.0, h: 0.3, fontFace: FB, fontSize: 11, bold: true, color: C.gold, charSpacing: 1 });
  s.addText("So partilhar versoes finais: lidas, corrigidas e validadas. Nada de versoes intermedias.", { x: M + 0.6, y: 4.45, w: colW - 1.0, h: 1.4, fontFace: FH, fontSize: 17, bold: true, color: C.light, lineSpacing: 23 });
  const rx = M + colW + 0.4;
  card(s, rx, 1.85, colW, 4.45, C.card);
  s.addText("LANDING DE INVESTIR", { x: rx + 0.35, y: 2.1, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  const land = [
    "Conteudo atual fraco (“parece scam”).",
    "Tirar ROI e certificados ficticios.",
    "Reescrever com numeros reais e voz propria.",
    "Posicionar bem o investidor passivo da diaspora.",
  ];
  s.addText(land.map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 14 } } })), {
    x: rx + 0.35, y: 2.5, w: colW - 0.7, h: 3.4, fontFace: FB, fontSize: 14.5, color: C.light, lineSpacing: 22, paraSpaceAfter: 14,
  });
})();

// ===========================================================================
// SLIDE 12 — VISAO DE MELHORIA
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Analise", title: "Visao de melhoria", num: 12 });
  const items = [
    ["Estrutura", "Decidir 1 empresa + parassocial vs 3 entidades antes de gastar."],
    ["Cedencia", "Politica de fee fixa por escrito + checklist de risco por negocio."],
    ["Expansao", "Playbook de zona Porto/Gaia (bairros, precos, empreiteiros)."],
    ["Plataforma", "Validar procura antes de construir; subscricao; proteger IP."],
    ["Tesouraria", "Medir cash entrado semanal; nao sobre-construir estrutura."],
  ];
  let y = 1.8;
  const rh = 0.86;
  items.forEach(([t, d], i) => {
    card(s, M, y, W - 2 * M, rh, C.card);
    // numero em circulo gold
    s.addShape("oval", { x: M + 0.25, y: y + (rh - 0.5) / 2, w: 0.5, h: 0.5, fill: { color: C.gold } });
    s.addText(String(i + 1), { x: M + 0.25, y: y + (rh - 0.5) / 2, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: FH, fontSize: 18, bold: true, color: C.bg });
    s.addText(t, { x: M + 1.0, y, w: 2.6, h: rh, fontFace: FH, fontSize: 16, bold: true, color: C.gold, valign: "middle" });
    s.addText(d, { x: M + 3.7, y, w: W - 2 * M - 4.0, h: rh, fontFace: FB, fontSize: 13.5, color: C.light, valign: "middle" });
    y += rh + 0.13;
  });
})();

// ===========================================================================
// SLIDE 13 — PLANEAMENTO
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Roadmap", title: "Planeamento por prioridades", num: 13 });
  const items = [
    ["P1", "Destravar a estrutura", "Decidir 1 vs 3 empresas, solicitadora + prazo, abrir 1.a empresa."],
    ["P2", "Fechar o pipeline", "Lajes, Braga (quarta), NOZ, Santo Varao."],
    ["P3", "Investidores", "Reescrever landing, classificar, follow-ups calendarizados."],
    ["P4", "Expansao Porto/Gaia", "Resumo de zona, validar imoveis, alocacao 90/10."],
    ["P5", "Aplicacao", "Cedencia/wholesaling, ROI medio, Candal, fraccoes."],
    ["P6", "Plataforma (Q4)", "Especificar, validar procura, reforcar metricas."],
  ];
  const gap = 0.3, cw = (W - 2 * M - 2 * gap) / 3, ch = 2.05;
  items.forEach(([p, t, d], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = M + col * (cw + gap), y = 1.85 + row * (ch + 0.3);
    card(s, x, y, cw, ch, C.card);
    goldTab(s, x, y, cw);
    s.addText(p, { x: x + 0.3, y: y + 0.22, w: 1.2, h: 0.5, fontFace: FH, fontSize: 24, bold: true, color: C.gold });
    s.addText(t, { x: x + 0.3, y: y + 0.78, w: cw - 0.6, h: 0.5, fontFace: FH, fontSize: 15.5, bold: true, color: C.light });
    s.addText(d, { x: x + 0.3, y: y + 1.22, w: cw - 0.6, h: 0.75, fontFace: FB, fontSize: 12, color: C.muted, lineSpacing: 16 });
  });
})();

// ===========================================================================
// SLIDE 14 — PARA DECIDIR HOJE
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Pontos em aberto", title: "Para decidir hoje", num: 14 });
  const items = [
    "Estrutura: 1 empresa com parassocial ou 3 entidades?",
    "Solicitadora: qual, com prazo por escrito, e alternativa.",
    "Braga: limite final da margem ao intermediario e plano B.",
    "Landing page: quem reescreve e ate quando.",
    "Plataforma: especificar (modelo, preco, divisao) e agendar Q4.",
    "Pipeline: fechar a rubrica de classificacao e shortlist pronta.",
  ];
  let y = 1.85;
  const rh = 0.72;
  items.forEach((t, i) => {
    card(s, M, y, W - 2 * M, rh, i % 2 ? C.card2 : C.card);
    s.addShape("rect", { x: M + 0.3, y: y + (rh - 0.32) / 2, w: 0.32, h: 0.32, fill: { color: C.bg }, line: { color: C.gold, width: 1.5 } });
    s.addText(t, { x: M + 0.95, y, w: W - 2 * M - 1.2, h: rh, fontFace: FB, fontSize: 15, color: C.light, valign: "middle" });
    y += rh + 0.14;
  });
})();

// ===========================================================================
// SLIDE 15 — FECHO
// ===========================================================================
(() => {
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.16, fill: { color: C.gold } });
  s.addShape("rect", { x: 0, y: H - 0.16, w: W, h: 0.16, fill: { color: C.gold } });
  s.addImage({ path: LOGO, x: (W - 2.6) / 2, y: 0.95, w: 2.6, h: 2.6 * 614 / 1516 });
  s.addText("Foco da semana", { x: 0, y: 2.35, w: W, h: 0.5, align: "center", fontFace: FB, fontSize: 13, bold: true, color: C.gold, charSpacing: 4 });
  s.addText("Abrir a empresa. Fechar Braga e Lajes.\nRodar o Porto.", {
    x: 0, y: 2.85, w: W, h: 1.7, align: "center", fontFace: FH, fontSize: 34, bold: true, color: C.white, lineSpacing: 44,
  });
  s.addText("Reuniao de socios · domingo 07/06 · 22h00", { x: 0, y: 5.0, w: W, h: 0.4, align: "center", fontFace: FB, fontSize: 14, color: C.muted });
  s.addText("SOMNIUM PROPERTIES · CONFIDENCIAL", { x: 0, y: 6.7, w: W, h: 0.3, align: "center", fontFace: FB, fontSize: 9, color: C.muted, charSpacing: 2 });
})();

pptx.writeFile({ fileName: OUT }).then((f) => console.log("OK · PPTX gerado:", f));
