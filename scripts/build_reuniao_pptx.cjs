// Apresentacao "Reuniao Semanal 07/06 22h" - Somnium Properties (Semana W23)
// Identidade preto/ouro, premium. Gerada com PptxGenJS a partir do relatorio.
const path = require("path");
const PptxGenJS = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..");
const LOGO = path.join(ROOT, "public", "logo-transparent.png");
const OUT = path.join(ROOT, "Relatorios", "2026-W23", "Reuniao Semanal 07-06 22h.pptx");

const C = {
  bg: "0D0D0D", card: "18181A", card2: "201E1A", cardGold: "241F12",
  gold: "C9A84C", goldDim: "7E6B34",
  light: "F4F2EC", white: "FFFFFF", body: "CBC5B7", muted: "A39E90", line: "302D27",
  green: "57B368", red: "E06A5E", amber: "D9A441",
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
  slide.addShape("line", { x: M, y: 7.02, w: W - 2 * M, h: 0, line: { color: C.line, width: 1 } });
  slide.addText("SOMNIUM PROPERTIES · CONFIDENCIAL", {
    x: M, y: 7.08, w: 6, h: 0.3, fontFace: FB, fontSize: 8, color: C.muted, charSpacing: 1,
  });
  slide.addText("Reunião Semanal · 07/06 22h · W23", {
    x: W - M - 4.5, y: 7.08, w: 4.0, h: 0.3, fontFace: FB, fontSize: 8, color: C.muted, align: "right",
  });
  if (num)
    slide.addText(String(num).padStart(2, "0"), {
      x: W - M - 0.45, y: 7.08, w: 0.45, h: 0.3, fontFace: FB, fontSize: 8, bold: true,
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
function bullets(arr) {
  return arr.map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 14 } } }));
}

// ============================ SLIDE 1 - CAPA ===============================
(() => {
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.16, fill: { color: C.gold } });
  s.addShape("rect", { x: 0, y: H - 0.16, w: W, h: 0.16, fill: { color: C.gold } });
  s.addImage({ path: LOGO, x: (W - 3.4) / 2, y: 1.55, w: 3.4, h: 3.4 * 614 / 1516 });
  s.addText("RELATÓRIO PARA REUNIÃO", {
    x: 0, y: 3.6, w: W, h: 0.35, align: "center", fontFace: FB, fontSize: 13, bold: true, color: C.gold, charSpacing: 4 });
  s.addText("Reunião Semanal", {
    x: 0, y: 4.0, w: W, h: 1.0, align: "center", fontFace: FH, fontSize: 46, bold: true, color: C.white });
  s.addText("07/06/2026  ·  22h00", {
    x: 0, y: 5.1, w: W, h: 0.45, align: "center", fontFace: FH, fontSize: 20, color: C.gold });
  s.addText("Semana W23  ·  1 a 7 de Junho  ·  CEO, Investidores, Imóveis e Claude Code", {
    x: 0, y: 5.6, w: W, h: 0.35, align: "center", fontFace: FB, fontSize: 12, color: C.body });
})();

// ====================== SLIDE 2 - A SEMANA EM NUMEROS ======================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Panorama", title: "A semana em números", num: 2 });
  const stats = [["4", "Conversas"], ["575", "Mensagens"], ["140", "Áudios"], ["16", "Imagens"]];
  const gap = 0.3, n = stats.length, cw = (W - 2 * M - (n - 1) * gap) / n;
  stats.forEach(([v, l], i) => {
    const x = M + i * (cw + gap), y = 1.85;
    card(s, x, y, cw, 1.55); goldTab(s, x, y, cw);
    s.addText(v, { x, y: y + 0.2, w: cw, h: 0.85, align: "center", fontFace: FH, fontSize: 46, bold: true, color: C.gold });
    s.addText(l.toUpperCase(), { x, y: y + 1.05, w: cw, h: 0.35, align: "center", fontFace: FB, fontSize: 12, color: C.body, charSpacing: 2 });
  });
  const cy = 3.85, ch = 2.35, half = (W - 2 * M - gap) / 2;
  card(s, M, cy, half, ch);
  s.addText("FATURAÇÃO REAL (ATÉ À DATA)", { x: M + 0.35, y: cy + 0.3, w: half - 0.7, h: 0.3, fontFace: FB, fontSize: 12, bold: true, color: C.muted, charSpacing: 1 });
  s.addText("1.500 €", { x: M + 0.35, y: cy + 0.7, w: half - 0.7, h: 0.9, fontFace: FH, fontSize: 50, bold: true, color: C.red });
  s.addText("Tesouraria fina. Cuidado com custos fixos antes da receita.", { x: M + 0.35, y: cy + 1.68, w: half - 0.7, h: 0.5, fontFace: FB, fontSize: 12.5, color: C.body });
  card(s, M + half + gap, cy, half, ch, C.cardGold);
  s.addText("META ATÉ AO FIM DO ANO", { x: M + half + gap + 0.35, y: cy + 0.3, w: half - 0.7, h: 0.3, fontFace: FB, fontSize: 12, bold: true, color: C.gold, charSpacing: 1 });
  s.addText("100 – 200 mil €", { x: M + half + gap + 0.35, y: cy + 0.7, w: half - 0.7, h: 0.9, fontFace: FH, fontSize: 44, bold: true, color: C.gold });
  s.addText("2 empresas · ~10 cedências · 4 CAEP. Pipeline e estrutura suportam.", { x: M + half + gap + 0.35, y: cy + 1.68, w: half - 0.7, h: 0.5, fontFace: FB, fontSize: 12.5, color: C.light });
})();

// ====================== SLIDE 3 - OS TRES DESTAQUES =======================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Síntese", title: "Os três destaques da semana", num: 3 });
  const items = [
    ["01", "Estrutura desenhada", "Duas empresas-mãe + conjunta (66/33). Avanço travado só pela solicitadora. Falta fechar a dúvida 1 vs 3 empresas."],
    ["02", "Negócios a fechar", "Lajes 315k ao Sr. Alfredo. Cedência de Braga rumo a CPCV em numerário. NOZ e Santo Varão em andamento."],
    ["03", "Pivot Porto/Gaia", "Coimbra sem volume. Sourcing ativo na Foz (T1, PH para 2 T1) e T4 nas Carvalhosas. Capitalizar e expandir."],
  ];
  const gap = 0.35, cw = (W - 2 * M - 2 * gap) / 3, y = 2.0, ch = 4.4;
  items.forEach(([n, t, d], i) => {
    const x = M + i * (cw + gap);
    card(s, x, y, cw, ch); goldTab(s, x, y, cw);
    s.addText(n, { x: x + 0.35, y: y + 0.3, w: cw - 0.7, h: 0.9, fontFace: FH, fontSize: 38, bold: true, color: C.gold });
    s.addText(t, { x: x + 0.35, y: y + 1.25, w: cw - 0.7, h: 0.7, fontFace: FH, fontSize: 19, bold: true, color: C.light });
    s.addText(d, { x: x + 0.35, y: y + 2.0, w: cw - 0.7, h: 2.1, fontFace: FB, fontSize: 14, color: C.body, lineSpacing: 20 });
  });
})();

// ====================== SLIDE 4 - ESTRUTURA SOCIETARIA ====================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Decisão chave", title: "Estrutura societária: a decisão a fechar", num: 4 });
  const colW = (W - 2 * M - 0.4) / 2;
  card(s, M, 1.85, colW, 4.45);
  s.addText("ESTRUTURA DESENHADA", { x: M + 0.35, y: 2.08, w: colW - 0.7, h: 0.35, fontFace: FB, fontSize: 12, bold: true, color: C.gold, charSpacing: 1 });
  const blocks = [["Empresa A", "Alexandre + João · 50 / 50"], ["Empresa B", "Luís Pedro · 100%"], ["Empresa conjunta", "66% Empresa A · 33% Empresa B"]];
  blocks.forEach(([t, d], i) => {
    const y = 2.55 + i * 1.18;
    s.addShape("roundRect", { x: M + 0.35, y, w: colW - 0.7, h: 0.98, rectRadius: 0.05, fill: { color: C.card2 }, line: { color: C.line, width: 1 } });
    s.addShape("rect", { x: M + 0.35, y, w: 0.06, h: 0.98, fill: { color: C.gold } });
    s.addText(t, { x: M + 0.6, y: y + 0.15, w: colW - 1.0, h: 0.4, fontFace: FH, fontSize: 17, bold: true, color: C.light });
    s.addText(d, { x: M + 0.6, y: y + 0.54, w: colW - 1.0, h: 0.35, fontFace: FB, fontSize: 13, color: C.body });
  });
  const rx = M + colW + 0.4;
  card(s, rx, 1.85, colW, 4.45, C.cardGold);
  s.addText("A FECHAR HOJE", { x: rx + 0.35, y: 2.08, w: colW - 0.7, h: 0.35, fontFace: FB, fontSize: 12, bold: true, color: C.gold, charSpacing: 1 });
  s.addText("1 empresa (com acordo parassocial) ou 3 entidades?", { x: rx + 0.35, y: 2.45, w: colW - 0.7, h: 0.8, fontFace: FH, fontSize: 20, bold: true, color: C.light, lineSpacing: 24 });
  s.addText(bullets([
    "A própria contabilista levantou a dúvida e ficou por resolver.",
    "Três entidades = ~620 €/mês de contabilidade + IRC fragmentado.",
    "Taxa reduzida de IRC (PME) só nos primeiros 50 mil de lucro.",
    "Decidir antes de assumir o custo recorrente e abrir.",
  ]), { x: rx + 0.35, y: 3.4, w: colW - 0.7, h: 2.7, fontFace: FB, fontSize: 14, color: C.light, lineSpacing: 22, paraSpaceAfter: 10 });
})();

// ====================== SLIDE 5 - NEGOCIOS EM CURSO =======================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Pipeline", title: "Negócios em curso", num: 5 });
  const items = [
    ["Lajes", "315.000 €", "3 frações (T2 Sub-Cave, Cave e RC) + interesse na 4.ª após reabilitação. Proposta enviada ao Sr. Alfredo."],
    ["Cedência de Braga (Daniel)", "CPCV em numerário", "Visita quarta 10h com investidor e empreiteiro. Margem ao intermediário travada."],
    ["NOZ Investimentos", "Compra em numerário", "Certidão permanente e procuração recebidas. CPCV quando a imobiliária tiver a documentação."],
    ["Santo Varão", "Cedência ~40 mil", "Em estudo. A aguardar feedback da Daniela Gaspar; Rafael Simões como possível alvo."],
  ];
  const gap = 0.35, cw = (W - 2 * M - gap) / 2, ch = 2.1;
  items.forEach(([t, v, d], i) => {
    const x = M + (i % 2) * (cw + gap), y = 1.85 + Math.floor(i / 2) * (ch + 0.3);
    card(s, x, y, cw, ch); goldTab(s, x, y, cw);
    s.addText(t, { x: x + 0.35, y: y + 0.25, w: cw - 0.7, h: 0.4, fontFace: FH, fontSize: 17, bold: true, color: C.light });
    s.addText(v, { x: x + 0.35, y: y + 0.66, w: cw - 0.7, h: 0.45, fontFace: FH, fontSize: 20, bold: true, color: C.gold });
    s.addText(d, { x: x + 0.35, y: y + 1.2, w: cw - 0.7, h: 0.8, fontFace: FB, fontSize: 12.5, color: C.body, lineSpacing: 17 });
  });
})();

// ====================== SLIDE 6 - CEDENCIA DE BRAGA =======================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Negociação", title: "Cedência de Braga: a linha vermelha", num: 6 });
  const colW = (W - 2 * M - 0.4) / 2;
  card(s, M, 1.85, colW, 2.55);
  s.addText("O QUE O INTERMEDIÁRIO QUERIA", { x: M + 0.35, y: 2.08, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  s.addText("Ganhar ~10 mil € (o mesmo que cada sócio) com risco zero.", { x: M + 0.35, y: 2.42, w: colW - 0.7, h: 0.85, fontFace: FB, fontSize: 15.5, color: C.light, lineSpacing: 21 });
  s.addText("Os sócios suportam: sinal de 10% (~10k), custos de CPCV e ~2.500 € cada a fundo perdido.", { x: M + 0.35, y: 3.32, w: colW - 0.7, h: 0.95, fontFace: FB, fontSize: 13, color: C.body, lineSpacing: 18 });
  card(s, M, 4.6, colW, 1.7);
  s.addText("PLANO", { x: M + 0.35, y: 4.8, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  s.addText("Apresentar a 2-3 investidores reais já prontos. Controlamos a quem cedemos; com 20k faturados não há pressa.", { x: M + 0.35, y: 5.14, w: colW - 0.7, h: 1.05, fontFace: FB, fontSize: 13, color: C.light, lineSpacing: 18 });
  const rx = M + colW + 0.4;
  card(s, rx, 1.85, colW, 4.45, C.cardGold);
  s.addText("“Ou leva 5 de 30,\nou 0 de 0.”", { x: rx + 0.4, y: 2.85, w: colW - 0.8, h: 1.8, fontFace: FH, fontSize: 34, bold: true, italic: true, color: C.gold, align: "center", lineSpacing: 42 });
  s.addText("Posição firme: o intermediário nunca pode ganhar mais do que cada sócio.", { x: rx + 0.4, y: 4.75, w: colW - 0.8, h: 1.2, fontFace: FB, fontSize: 14, color: C.light, align: "center", lineSpacing: 20 });
})();

// ====================== SLIDE 7 - PIVOT PORTO/GAIA ========================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Estratégia", title: "Pivot: Coimbra para Porto / Gaia", num: 7 });
  const colW = (W - 2 * M - 0.4) / 2;
  card(s, M, 1.85, colW, 4.45);
  s.addText("PORQUÊ", { x: M + 0.35, y: 2.08, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  s.addText(bullets([
    "Coimbra não tem volume; é off-market e fechado.",
    "Porto/Gaia: mercado grande, 2-3 cedências por mês viáveis.",
    "Manter CAEP e obra em Coimbra (dá portefólio e aprendizagem).",
    "Capitalizar com cedências e fazer negócios com capital da empresa.",
  ]), { x: M + 0.35, y: 2.5, w: colW - 0.7, h: 3.6, fontFace: FB, fontSize: 14.5, color: C.light, lineSpacing: 22, paraSpaceAfter: 14 });
  const rx = M + colW + 0.4;
  card(s, rx, 1.85, colW, 4.45);
  s.addText("IMÓVEIS IDENTIFICADOS", { x: rx + 0.35, y: 2.08, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  const props = [
    ["T1 na Foz (Arrábida)", "200k daria margem, mas rua e prédio fracos."],
    ["Imóvel com PH (68 m²)", "Daria 2 T1; validar áreas e registo."],
    ["T4 nas Carvalhosas", "~250k, sem licença de habitabilidade; capitais próprios."],
    ["Moradia do João", "Posta de lado: renda vitalícia + penhora."],
  ];
  props.forEach(([t, d], i) => {
    const y = 2.55 + i * 0.9;
    s.addText(t, { x: rx + 0.35, y, w: colW - 0.7, h: 0.35, fontFace: FH, fontSize: 14.5, bold: true, color: C.light });
    s.addText(d, { x: rx + 0.35, y: y + 0.36, w: colW - 0.7, h: 0.45, fontFace: FB, fontSize: 12.5, color: C.body, lineSpacing: 16 });
  });
})();

// ====================== SLIDE 8 - PIPELINE INVESTIDORES ===================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Comercial", title: "Pipeline de investidores · meta: 10 classe A", num: 8 });
  const rows = [
    ["Elcio Mota", "Capital e equipa OK. ROI 40-50%; 60% anualizado fora do Porto."],
    ["Sintia", "~130k disponíveis, dois negócios quase fechados. Follow-up a 1 Jul."],
    ["Daniel Nogueira", "Parece grande investidor. Classificar presencialmente na quarta."],
    ["FlipWise (4)", "Responderam; ticket médio 300k. Enviar landing e classificar."],
    ["Rafael Simões", "Skool, ~5M feitos. Possível interesse no de Santo Varão."],
  ];
  let y = 1.78;
  const rh = 0.78, gap = 0.12;
  rows.forEach(([t, d], i) => {
    card(s, M, y, W - 2 * M, rh, i % 2 ? C.card2 : C.card);
    s.addShape("rect", { x: M, y, w: 0.06, h: rh, fill: { color: C.gold } });
    s.addText(t, { x: M + 0.3, y, w: 3.0, h: rh, fontFace: FH, fontSize: 16, bold: true, color: C.gold, valign: "middle" });
    s.addText(d, { x: M + 3.4, y, w: W - 2 * M - 3.7, h: rh, fontFace: FB, fontSize: 13.5, color: C.light, valign: "middle" });
    y += rh + gap;
  });
  s.addText("Sempre 2-3 investidores prontos por critério. A landing de investir serve de funil de classificação.", {
    x: M, y: y + 0.04, w: W - 2 * M, h: 0.35, fontFace: FB, fontSize: 12.5, italic: true, color: C.muted });
})();

// ====================== SLIDE 9 - PLATAFORMA / SAAS =======================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Nova linha de negócio", title: "A plataforma como produto", num: 9 });
  const colW = (W - 2 * M - 0.4) / 2;
  card(s, M, 1.85, colW, 4.45);
  s.addText("A IDEIA", { x: M + 0.35, y: 2.08, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  s.addText(bullets([
    "Comercializar o CRM/dashboard (único: imóveis, investidores, consultores, construtores).",
    "Modelo: ~49-99 € inicial + mensalidade. Alvo: nicho comum a preço baixo.",
    "Diogo (desenvolvimento) e Ruben (gestão) com 30-50%.",
    "Projeção: pode somar ~125k de faturação à empresa.",
  ]), { x: M + 0.35, y: 2.5, w: colW - 0.7, h: 3.6, fontFace: FB, fontSize: 14, color: C.light, lineSpacing: 21, paraSpaceAfter: 13 });
  const rx = M + colW + 0.4;
  card(s, rx, 1.85, colW, 4.45, C.cardGold);
  s.addText("DISCIPLINA", { x: rx + 0.35, y: 2.08, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  s.addText(bullets([
    "Validar procura antes de construir (lista de espera com a audiência do Veda/Diogo).",
    "Subscrição pura gera receita recorrente (evitar modelo confuso).",
    "Proteger o IP: plataforma fica da Somnium; parceiro com rev-share.",
    "Especificar numa página agora e reabrir no Q4. Não tirar foco do core.",
  ]), { x: rx + 0.35, y: 2.5, w: colW - 0.7, h: 3.6, fontFace: FB, fontSize: 14, color: C.light, lineSpacing: 21, paraSpaceAfter: 13 });
})();

// ====================== SLIDE 10 - APLICACAO ==============================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Produto interno", title: "Aplicação: o que muda", num: 10 });
  const items = [
    ["Cedência / wholesaling", "Valor de compra = valor com cedência. Faturação = cedência menos proposta. Fee isolado."],
    ["ROI médio", "Expectável, anualizado e real, por modelo e sobre todos os negócios (não só 3)."],
    ["Correção Candal", "Moradia estava analisada como 2 apartamentos; reanalisar e corrigir valores."],
    ["Imóveis por fração", "Solução para um projeto com várias frações, sem forçar em duas fichas."],
  ];
  const gap = 0.3, cw = (W - 2 * M - gap) / 2;
  items.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * (cw + gap), y = 1.85 + row * 1.55;
    card(s, x, y, cw, 1.38);
    s.addText(t, { x: x + 0.32, y: y + 0.2, w: cw - 0.64, h: 0.4, fontFace: FH, fontSize: 16, bold: true, color: C.gold });
    s.addText(d, { x: x + 0.32, y: y + 0.62, w: cw - 0.64, h: 0.65, fontFace: FB, fontSize: 12.5, color: C.body, lineSpacing: 17 });
  });
  const yb = 1.85 + 2 * 1.55;
  card(s, M, yb, W - 2 * M, 1.28);
  s.addText("Purga automática", { x: M + 0.32, y: yb + 0.2, w: W - 2 * M - 0.64, h: 0.4, fontFace: FH, fontSize: 16, bold: true, color: C.gold });
  s.addText("Reposta após a migração para o Marcelo (passava no backend, não no frontend). Auto-save e auto-purga repostos.", { x: M + 0.32, y: yb + 0.62, w: W - 2 * M - 0.64, h: 0.5, fontFace: FB, fontSize: 13, color: C.body });
})();

// ====================== SLIDE 11 - METODO & CONTEUDO ======================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Método", title: "Claude Code e conteúdo externo", num: 11 });
  const colW = (W - 2 * M - 0.4) / 2;
  card(s, M, 1.85, colW, 4.45);
  s.addText("A TENSÃO E A REGRA", { x: M + 0.35, y: 2.08, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  s.addText("Gerar documentos à pressa, sem ler nem validar, já se nota à distância e tira credibilidade.", { x: M + 0.35, y: 2.45, w: colW - 0.7, h: 1.1, fontFace: FB, fontSize: 14.5, color: C.light, lineSpacing: 20 });
  s.addShape("roundRect", { x: M + 0.35, y: 3.95, w: colW - 0.7, h: 2.0, rectRadius: 0.05, fill: { color: C.card2 }, line: { color: C.gold, width: 1 } });
  s.addText("REGRA", { x: M + 0.6, y: 4.18, w: colW - 1.0, h: 0.3, fontFace: FB, fontSize: 11, bold: true, color: C.gold, charSpacing: 1 });
  s.addText("Só partilhar versões finais: lidas, corrigidas e validadas. Nada de versões intermédias.", { x: M + 0.6, y: 4.5, w: colW - 1.0, h: 1.3, fontFace: FH, fontSize: 17, bold: true, color: C.light, lineSpacing: 23 });
  const rx = M + colW + 0.4;
  card(s, rx, 1.85, colW, 4.45);
  s.addText("LANDING DE INVESTIR", { x: rx + 0.35, y: 2.08, w: colW - 0.7, h: 0.3, fontFace: FB, fontSize: 11.5, bold: true, color: C.gold, charSpacing: 1 });
  s.addText(bullets([
    "Conteúdo atual fraco (“parece scam”).",
    "Tirar ROI e certificados fictícios.",
    "Reescrever com números reais e voz própria.",
    "Posicionar bem o investidor passivo da diáspora.",
  ]), { x: rx + 0.35, y: 2.5, w: colW - 0.7, h: 3.4, fontFace: FB, fontSize: 14.5, color: C.light, lineSpacing: 22, paraSpaceAfter: 14 });
})();

// ====================== SLIDE 12 - VISAO DE MELHORIA ======================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Análise", title: "Visão de melhoria", num: 12 });
  const items = [
    ["Estrutura", "Decidir 1 empresa + parassocial vs 3 entidades antes de gastar."],
    ["Cedência", "Política de fee fixa por escrito + checklist de risco por negócio."],
    ["Expansão", "Playbook de zona Porto/Gaia (bairros, preços, empreiteiros)."],
    ["Plataforma", "Validar procura antes de construir; subscrição; proteger IP."],
    ["Tesouraria", "Medir cash entrado semanal; não sobre-construir estrutura."],
  ];
  let y = 1.8;
  const rh = 0.86, d = 0.5;
  items.forEach(([t, dsc], i) => {
    card(s, M, y, W - 2 * M, rh);
    const cyc = y + (rh - d) / 2;
    s.addShape("ellipse", { x: M + 0.3, y: cyc, w: d, h: d, fill: { color: C.gold } });
    s.addText(String(i + 1), { x: M + 0.3, y: cyc, w: d, h: d, align: "center", valign: "middle", fontFace: FH, fontSize: 18, bold: true, color: C.bg });
    s.addText(t, { x: M + 1.05, y, w: 2.6, h: rh, fontFace: FH, fontSize: 16, bold: true, color: C.gold, valign: "middle" });
    s.addText(dsc, { x: M + 3.65, y, w: W - 2 * M - 3.95, h: rh, fontFace: FB, fontSize: 13.5, color: C.light, valign: "middle" });
    y += rh + 0.13;
  });
})();

// ====================== SLIDE 13 - PLANEAMENTO ============================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Roadmap", title: "Planeamento por prioridades", num: 13 });
  const items = [
    ["P1", "Destravar a estrutura", "Decidir 1 vs 3 empresas, solicitadora + prazo, abrir 1.ª empresa."],
    ["P2", "Fechar o pipeline", "Lajes, Braga (quarta), NOZ, Santo Varão."],
    ["P3", "Investidores", "Reescrever landing, classificar, follow-ups calendarizados."],
    ["P4", "Expansão Porto/Gaia", "Resumo de zona, validar imóveis, alocação 90/10."],
    ["P5", "Aplicação", "Cedência/wholesaling, ROI médio, Candal, frações."],
    ["P6", "Plataforma (Q4)", "Especificar, validar procura, reforçar métricas."],
  ];
  const gap = 0.3, cw = (W - 2 * M - 2 * gap) / 3, ch = 2.05;
  items.forEach(([p, t, d], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = M + col * (cw + gap), y = 1.95 + row * (ch + 0.35);
    card(s, x, y, cw, ch); goldTab(s, x, y, cw);
    s.addText(p, { x: x + 0.3, y: y + 0.22, w: 1.2, h: 0.5, fontFace: FH, fontSize: 24, bold: true, color: C.gold });
    s.addText(t, { x: x + 0.3, y: y + 0.8, w: cw - 0.6, h: 0.5, fontFace: FH, fontSize: 15.5, bold: true, color: C.light });
    s.addText(d, { x: x + 0.3, y: y + 1.24, w: cw - 0.6, h: 0.72, fontFace: FB, fontSize: 12, color: C.body, lineSpacing: 16 });
  });
})();

// ====================== SLIDE 14 - PARA DECIDIR HOJE ======================
(() => {
  const s = pptx.addSlide();
  base(s, { eyebrow: "Pontos em aberto", title: "Para decidir hoje", num: 14 });
  const items = [
    "Estrutura: 1 empresa com parassocial ou 3 entidades?",
    "Solicitadora: qual, com prazo por escrito, e alternativa.",
    "Braga: limite final da margem ao intermediário e plano B.",
    "Landing page: quem reescreve e até quando.",
    "Plataforma: especificar (modelo, preço, divisão) e agendar Q4.",
    "Pipeline: fechar a rúbrica de classificação e shortlist pronta.",
  ];
  let y = 1.85;
  const rh = 0.72, bx = 0.34;
  items.forEach((t, i) => {
    card(s, M, y, W - 2 * M, rh, i % 2 ? C.card2 : C.card);
    s.addShape("rect", { x: M + 0.32, y: y + (rh - bx) / 2, w: bx, h: bx, fill: { color: C.bg }, line: { color: C.gold, width: 1.5 } });
    s.addText(t, { x: M + 0.95, y, w: W - 2 * M - 1.2, h: rh, fontFace: FB, fontSize: 15, color: C.light, valign: "middle" });
    y += rh + 0.14;
  });
})();

// ============================ SLIDE 15 - FECHO ============================
(() => {
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.16, fill: { color: C.gold } });
  s.addShape("rect", { x: 0, y: H - 0.16, w: W, h: 0.16, fill: { color: C.gold } });
  s.addImage({ path: LOGO, x: (W - 2.6) / 2, y: 1.35, w: 2.6, h: 2.6 * 614 / 1516 });
  s.addText("Foco da semana", { x: 0, y: 2.75, w: W, h: 0.5, align: "center", fontFace: FB, fontSize: 13, bold: true, color: C.gold, charSpacing: 4 });
  s.addText("Abrir a empresa. Fechar Braga e Lajes.\nRodar o Porto.", { x: 0, y: 3.25, w: W, h: 1.7, align: "center", fontFace: FH, fontSize: 34, bold: true, color: C.white, lineSpacing: 44 });
  s.addText("Reunião de sócios · domingo 07/06 · 22h00", { x: 0, y: 5.35, w: W, h: 0.4, align: "center", fontFace: FB, fontSize: 14, color: C.body });
  s.addText("SOMNIUM PROPERTIES · CONFIDENCIAL", { x: 0, y: 6.75, w: W, h: 0.3, align: "center", fontFace: FB, fontSize: 9, color: C.muted, charSpacing: 2 });
})();

pptx.writeFile({ fileName: OUT }).then((f) => console.log("OK · PPTX gerado:", f));
