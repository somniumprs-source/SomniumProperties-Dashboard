const pptxgen = require("pptxgenjs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOGO_LIGHT = path.join(ROOT, "public", "logo-transparent.png");
const LOGO_DARK = path.join(ROOT, "public", "logo-dark-transparent.png");
const OUT = path.join(ROOT, "Apresentacao_Investidores_Marco_2026.pptx");

const C = {
  DARK: "0d0d0d",
  DARK_2: "1a1a1a",
  GOLD: "C9A84C",
  GOLD_LIGHT: "E8D08A",
  GOLD_DARK: "A88A3A",
  OFFWHITE: "FBFAF7",
  CREAM: "F5EFE0",
  CREAM_2: "FAF5E8",
  BORDER: "E0DDD5",
  BORDER_2: "D4CFC0",
  TEXT: "1F2937",
  TEXT_MUTED: "6B7280",
  WHITE: "FFFFFF",
  GREEN: "16A34A",
  YELLOW: "CA8A04",
  RED: "DC2626"
};

const FONT_HEAD = "Georgia";
const FONT_BODY = "Helvetica";
const W = 10, H = 5.625;

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Somnium Properties";
pres.company = "Somnium Properties";
pres.title = "Investimento e Gestao de Ativos - Investidores Marco 2026";

function logoCorner(slide) {
  slide.addImage({ path: LOGO_DARK, x: 0.4, y: 0.3, w: 1.05, h: 0.42, sizing: { type: "contain", w: 1.05, h: 0.42 } });
}
function logoCenter(slide, y, w = 2.0) {
  const x = (W - w) / 2;
  slide.addImage({ path: LOGO_DARK, x, y, w, h: w * 0.4, sizing: { type: "contain", w, h: w * 0.4 } });
}
function cornerFrame(slide, color = C.GOLD) {
  const m = 0.25, len = 0.5, t = 0.015;
  const corners = [
    [m, m, len, t], [m, m, t, len],
    [W - m - len, m, len, t], [W - m - t, m, t, len],
    [m, H - m - t, len, t], [m, H - m - len, t, len],
    [W - m - len, H - m - t, len, t], [W - m - t, H - m - len, t, len]
  ];
  corners.forEach(([x, y, w, h]) => {
    slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color }, line: { color, width: 0 } });
  });
}
function pilarTag(slide, text) {
  slide.addText(text.toUpperCase(), {
    x: 0.5, y: 0.95, w: 9, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10, color: C.GOLD, bold: true, charSpacing: 5, margin: 0
  });
}
function sectionTitle(slide, text, opts = {}) {
  slide.addText(text, {
    x: 0.5, y: opts.y || 1.25, w: opts.w || 9, h: opts.h || 0.7,
    fontFace: FONT_HEAD, fontSize: opts.size || 28, color: C.DARK, bold: true, margin: 0, valign: "top"
  });
}
function subTitle(slide, text, y) {
  slide.addText(text, {
    x: 0.5, y, w: 9, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 16, color: C.GOLD_DARK, italic: true, margin: 0
  });
}
function goldBar(slide, x, y, w = 0.5, h = 0.025) {
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
}

// ==================== SLIDE 1 — CAPA ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  cornerFrame(s);
  logoCenter(s, 0.7, 2.0);

  s.addText("Investimento e Gestão de Ativos", {
    x: 0.5, y: 1.95, w: 9, h: 0.9,
    fontFace: FONT_HEAD, fontSize: 40, color: C.DARK, bold: true, align: "center", margin: 0
  });
  s.addText("Rigor Clínico, Transparência Total e Rentabilidade.", {
    x: 0.5, y: 2.95, w: 9, h: 0.5,
    fontFace: FONT_HEAD, fontSize: 22, color: C.GOLD_DARK, italic: true, align: "center", margin: 0
  });
  goldBar(s, (W - 1.5) / 2, 3.65, 1.5, 0.025);
  s.addText("Uma abordagem de 'Zero Improviso' ao investimento imobiliário.", {
    x: 0.5, y: 3.85, w: 9, h: 0.45,
    fontFace: FONT_BODY, fontSize: 14, color: C.TEXT, align: "center", margin: 0
  });
  s.addText("Preparado para Investidores Privados   |   2026", {
    x: 0.5, y: 5.05, w: 9, h: 0.35,
    fontFace: FONT_BODY, fontSize: 10, color: C.TEXT_MUTED, align: "center", charSpacing: 2, margin: 0
  });
}

// ==================== SLIDE 2 — O PROBLEMA ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  logoCorner(s);
  cornerFrame(s);

  pilarTag(s, "O Desafio");
  sectionTitle(s, "A Assimetria do Risco", { y: 1.25 });
  subTitle(s, "Investir sozinho versus investir com a Somnium.", 1.85);

  const c1x = 1.0, c2x = 5.4, colW = 4.0;
  s.addShape(pres.shapes.RECTANGLE, { x: c1x, y: 2.6, w: colW, h: 0.5, fill: { color: C.DARK }, line: { color: C.DARK, width: 0 } });
  s.addText("O Investidor Solitário", {
    x: c1x, y: 2.6, w: colW, h: 0.5,
    fontFace: FONT_BODY, fontSize: 13, color: C.WHITE, bold: true, align: "center", valign: "middle", margin: 0
  });
  s.addShape(pres.shapes.RECTANGLE, { x: c2x, y: 2.6, w: colW, h: 0.5, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
  s.addText("Parceria Somnium", {
    x: c2x, y: 2.6, w: colW, h: 0.5,
    fontFace: FONT_BODY, fontSize: 13, color: C.DARK, bold: true, align: "center", valign: "middle", margin: 0
  });

  const rows = [
    { label: "Tempo", left: "Prospeção, negociação e gestão de obras consomem o seu dia.", right: "Alocação passiva. Esforço nulo." },
    { label: "Risco", left: "Decisões emocionais. Derrapagens não calculadas.", right: "Decisões blindadas por matemática (MAO) e Stress Tests." },
    { label: "Rede", left: "Empreiteiros incertos. Pouco poder negocial.", right: "Equipa clínica + gestor de obra + 72 parceiros." }
  ];
  let ry = 3.15;
  const rh = 0.65;
  rows.forEach((r) => {
    s.addText(r.label, {
      x: 0.4, y: ry, w: 0.55, h: rh,
      fontFace: FONT_BODY, fontSize: 11, color: C.GOLD_DARK, bold: true, valign: "middle", align: "right", margin: 0
    });
    s.addShape(pres.shapes.RECTANGLE, { x: c1x, y: ry, w: colW, h: rh, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 0.75 } });
    s.addText(r.left, {
      x: c1x + 0.2, y: ry, w: colW - 0.4, h: rh,
      fontFace: FONT_BODY, fontSize: 11, color: C.TEXT, align: "center", valign: "middle", margin: 0
    });
    s.addShape(pres.shapes.RECTANGLE, { x: c2x, y: ry, w: colW, h: rh, fill: { color: C.CREAM }, line: { color: C.GOLD, width: 0.75 } });
    s.addText(r.right, {
      x: c2x + 0.2, y: ry, w: colW - 0.4, h: rh,
      fontFace: FONT_BODY, fontSize: 11, color: C.TEXT, align: "center", valign: "middle", margin: 0
    });
    ry += rh + 0.1;
  });
}

// ==================== SLIDE 3 — A NOSSA SOLUCAO ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  logoCorner(s);
  cornerFrame(s);

  pilarTag(s, "A Nossa Solução");
  sectionTitle(s, "A Filosofia \"Zero Improviso\"", { y: 1.25 });
  subTitle(s, "Disciplina clínica aplicada ao investimento imobiliário.", 1.85);

  const cards = [
    { t: "Origem Clínica", d: "Fundadores com background na área da Saúde. Transpomos a cultura de protocolos rigorosos para a gestão de ativos." },
    { t: "Estrutura Institucional", d: "Fundadores + Gestor de Obra + Consultor Estratégico, suportados por 4 departamentos e rede de 72 parceiros." },
    { t: "Metodologia Padrão", d: "Cada passo é executado com SOPs digitalizados. Decisões baseadas em dados e simulações. Nada ao acaso." }
  ];
  const cy = 2.55, ch = 2.15, cw = 2.95, cgap = 0.15;
  const cstart = (W - (cw * 3 + cgap * 2)) / 2;
  cards.forEach((c, i) => {
    const x = cstart + i * (cw + cgap);
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: ch, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: 0.06, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
    s.addText(c.t, {
      x: x + 0.2, y: cy + 0.3, w: cw - 0.4, h: 0.55,
      fontFace: FONT_HEAD, fontSize: 17, color: C.DARK, bold: true, align: "center", margin: 0
    });
    goldBar(s, x + (cw - 0.4) / 2, cy + 0.95, 0.4, 0.02);
    s.addText(c.d, {
      x: x + 0.25, y: cy + 1.1, w: cw - 0.5, h: 1.0,
      fontFace: FONT_BODY, fontSize: 11.5, color: C.TEXT, align: "center", margin: 0
    });
  });

  // Bottom stat strip
  const sy = 4.95, sh = 0.45;
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: sy, w: 9, h: sh, fill: { color: C.CREAM }, line: { color: C.GOLD, width: 0.75 } });
  s.addText("+72 parceiros activos     |     SOPs digitalizados     |     100% rastreabilidade     |     Co-investimento próprio", {
    x: 0.5, y: sy, w: 9, h: sh,
    fontFace: FONT_BODY, fontSize: 11, color: C.DARK, bold: true, align: "center", valign: "middle", charSpacing: 1, margin: 0
  });
}

// ==================== SLIDE 4 — PILAR I.A — SOPs + COMPRA ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  logoCorner(s);
  cornerFrame(s);

  pilarTag(s, "Pilar I — Segurança e Rigor");
  sectionTitle(s, "SOPs e a Ciência da Compra", { y: 1.25 });
  subTitle(s, "Procedimentos padrão e validação matemática antes de cada aquisição.", 1.85);

  // Left card: SOP library
  const lx = 0.5, ly = 2.55, lw = 4.4, lh = 2.5;
  s.addShape(pres.shapes.RECTANGLE, { x: lx, y: ly, w: lw, h: lh, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
  s.addShape(pres.shapes.RECTANGLE, { x: lx, y: ly, w: 0.06, h: lh, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
  s.addText("Biblioteca SOP", {
    x: lx + 0.25, y: ly + 0.2, w: lw - 0.4, h: 0.35,
    fontFace: FONT_BODY, fontSize: 11, color: C.GOLD_DARK, bold: true, charSpacing: 3, margin: 0
  });
  s.addText("Cada operação tem um procedimento padrão", {
    x: lx + 0.25, y: ly + 0.5, w: lw - 0.4, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 14, color: C.DARK, bold: true, italic: true, margin: 0
  });
  const sops = [
    "SOP 1 — Pesquisa de Negócios",
    "SOP 2 — Onboarding de Investidores",
    "SOP 3 — Prospeção de Projetos",
    "SOP 4 — Compra e Negociação"
  ];
  sops.forEach((sop, i) => {
    const yy = ly + 0.95 + i * 0.32;
    s.addShape(pres.shapes.OVAL, { x: lx + 0.3, y: yy + 0.08, w: 0.12, h: 0.12, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
    s.addText(sop, {
      x: lx + 0.5, y: yy, w: lw - 0.7, h: 0.3,
      fontFace: FONT_BODY, fontSize: 12, color: C.TEXT, valign: "middle", margin: 0
    });
  });

  // Right: Mini funnel - Ciencia da Compra
  const rx = 5.2, ry = 2.55, rw = 4.3, rh = 2.5;
  s.addShape(pres.shapes.RECTANGLE, { x: rx, y: ry, w: rw, h: rh, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
  s.addShape(pres.shapes.RECTANGLE, { x: rx, y: ry, w: 0.06, h: rh, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
  s.addText("SOP 4: Ciência da Compra", {
    x: rx + 0.25, y: ry + 0.2, w: rw - 0.4, h: 0.35,
    fontFace: FONT_BODY, fontSize: 11, color: C.GOLD_DARK, bold: true, charSpacing: 3, margin: 0
  });
  s.addText("Da identificação ao MAO validado", {
    x: rx + 0.25, y: ry + 0.5, w: rw - 0.4, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 14, color: C.DARK, bold: true, italic: true, margin: 0
  });
  const steps = [
    { t: "1. Validação Cruzada Múltipla", d: "Mínimo 5 comparáveis cruzados com ferramentas, parceiros e avaliadores." },
    { t: "2. Ajuste Matemático", d: "Áreas, localização (±10%), idade e conservação." },
    { t: "3. MAO Validado", d: "Maximum Allowable Offer aprovada para execução." }
  ];
  let sy2 = ry + 0.95;
  steps.forEach((st, i) => {
    s.addText(st.t, {
      x: rx + 0.3, y: sy2, w: rw - 0.5, h: 0.25,
      fontFace: FONT_BODY, fontSize: 11.5, color: C.DARK, bold: true, margin: 0
    });
    s.addText(st.d, {
      x: rx + 0.45, y: sy2 + 0.27, w: rw - 0.65, h: 0.25,
      fontFace: FONT_BODY, fontSize: 10, color: C.TEXT_MUTED, italic: true, margin: 0
    });
    sy2 += 0.55;
  });

  // Bottom note strip
  const ny = 5.15, nh = 0.32;
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: ny, w: 9, h: nh, fill: { color: C.CREAM }, line: { color: C.GOLD, width: 0.5 } });
  s.addText("Cada SOP está digitalizado e enforced pelo nosso CRM proprietário.", {
    x: 0.5, y: ny, w: 9, h: nh,
    fontFace: FONT_BODY, fontSize: 11, color: C.DARK, italic: true, align: "center", valign: "middle", margin: 0
  });
}

// ==================== SLIDE 5 — PILAR I.B — STRESS TESTS ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  logoCorner(s);
  cornerFrame(s);

  pilarTag(s, "Pilar I — Segurança e Rigor");
  sectionTitle(s, "A Nossa Obsessão com o Risco: Stress Tests", { y: 1.25, size: 26 });
  subTitle(s, "Cada projeto passa por três cenários antes de avançar.", 1.85);

  const cards = [
    { t: "Cenário Base", d: "O plano ideal e conservador.", c: C.GREEN, label: "0%" },
    { t: "Stress Moderado", d: "-10% VVR  /  +10% Custo Obra  /  +3 meses retenção", c: C.YELLOW, label: "-10%" },
    { t: "Stress Severo", d: "-20% VVR  /  +20% Custo Obra  /  +6 meses retenção", c: C.RED, label: "-20%" }
  ];
  const cy = 2.55, ch = 1.85, cw = 2.85, cgap = 0.2;
  const cstart = (W - (cw * 3 + cgap * 2)) / 2;
  cards.forEach((c, i) => {
    const x = cstart + i * (cw + cgap);
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: ch, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: 0.12, fill: { color: c.c }, line: { color: c.c, width: 0 } });
    s.addText(c.label, {
      x, y: cy + 0.25, w: cw, h: 0.7,
      fontFace: FONT_HEAD, fontSize: 38, color: c.c, bold: true, align: "center", margin: 0
    });
    s.addText(c.t, {
      x: x + 0.15, y: cy + 1.0, w: cw - 0.3, h: 0.3,
      fontFace: FONT_HEAD, fontSize: 14, color: C.DARK, bold: true, align: "center", margin: 0
    });
    s.addText(c.d, {
      x: x + 0.2, y: cy + 1.32, w: cw - 0.4, h: 0.5,
      fontFace: FONT_BODY, fontSize: 10, color: C.TEXT, align: "center", margin: 0
    });
  });

  // Rules box (light)
  const ry2 = 4.55, rh2 = 0.85;
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: ry2, w: 9, h: rh2, fill: { color: C.CREAM_2 }, line: { color: C.GOLD, width: 1 } });
  s.addText("As Regras do Flipper Disciplinado", {
    x: 0.5, y: ry2 + 0.08, w: 9, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 13, color: C.GOLD_DARK, bold: true, italic: true, align: "center", margin: 0
  });
  s.addText(
    "1. Sempre 10–20% de contingência de obras.    2. Nunca avançar se só rentável no Cenário Base.    3. Tem de poder converter em arrendamento.",
    {
      x: 0.7, y: ry2 + 0.4, w: 8.6, h: 0.45,
      fontFace: FONT_BODY, fontSize: 10.5, color: C.TEXT, align: "center", margin: 0
    }
  );
}

// ==================== SLIDE 6 — PILAR II — VENDA + PLANO B ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  logoCorner(s);
  cornerFrame(s);

  pilarTag(s, "Pilar II — Rentabilidade");
  sectionTitle(s, "Venda Cirúrgica e Plano B", { y: 1.25 });
  subTitle(s, "Como protegemos o ROI quando o mercado não coopera.", 1.85);

  // Left: 3 phases venda
  const lx = 0.5, ly = 2.55, lw = 4.6, lh = 2.7;
  s.addShape(pres.shapes.RECTANGLE, { x: lx, y: ly, w: lw, h: lh, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
  s.addShape(pres.shapes.RECTANGLE, { x: lx, y: ly, w: 0.06, h: lh, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
  s.addText("Tática de Venda Cirúrgica", {
    x: lx + 0.25, y: ly + 0.2, w: lw - 0.4, h: 0.35,
    fontFace: FONT_BODY, fontSize: 11, color: C.GOLD_DARK, bold: true, charSpacing: 3, margin: 0
  });
  s.addText("Plano estratégico em 3 fases", {
    x: lx + 0.25, y: ly + 0.5, w: lw - 0.4, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 14, color: C.DARK, bold: true, italic: true, margin: 0
  });
  const phases = [
    { n: "1", t: "Preparação Premium", d: "Home Staging, fotografia profissional, tour 3D/360º." },
    { n: "2", t: "Exclusividade Pensada", d: "Atribuição ao consultor de referência durante obra + pós-conclusão." },
    { n: "3", t: "Acelerador de Venda", d: "Após 60 dias, ativação de Top Performer da zona." }
  ];
  let py = ly + 0.95;
  phases.forEach((p) => {
    s.addShape(pres.shapes.OVAL, { x: lx + 0.3, y: py, w: 0.4, h: 0.4, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
    s.addText(p.n, {
      x: lx + 0.3, y: py, w: 0.4, h: 0.4,
      fontFace: FONT_HEAD, fontSize: 14, color: C.DARK, bold: true, align: "center", valign: "middle", margin: 0
    });
    s.addText(p.t, {
      x: lx + 0.85, y: py - 0.02, w: lw - 1.05, h: 0.3,
      fontFace: FONT_BODY, fontSize: 12, color: C.DARK, bold: true, margin: 0
    });
    s.addText(p.d, {
      x: lx + 0.85, y: py + 0.25, w: lw - 1.05, h: 0.3,
      fontFace: FONT_BODY, fontSize: 10, color: C.TEXT, margin: 0
    });
    py += 0.55;
  });

  // Right: Plano B
  const rx = 5.4, ry3 = 2.55, rw = 4.1, rh3 = 2.7;
  s.addShape(pres.shapes.RECTANGLE, { x: rx, y: ry3, w: rw, h: rh3, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
  s.addShape(pres.shapes.RECTANGLE, { x: rx, y: ry3, w: 0.06, h: rh3, fill: { color: C.RED }, line: { color: C.RED, width: 0 } });
  s.addText("Plano B: Rede de Segurança", {
    x: rx + 0.25, y: ry3 + 0.2, w: rw - 0.4, h: 0.35,
    fontFace: FONT_BODY, fontSize: 11, color: C.RED, bold: true, charSpacing: 3, margin: 0
  });
  s.addText("A Linha Vermelha Somnium", {
    x: rx + 0.25, y: ry3 + 0.5, w: rw - 0.4, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 14, color: C.DARK, bold: true, italic: true, margin: 0
  });
  const pts = [
    { t: "Limite de Corte", d: "VVR mínimo aceitável baseado no Stress Severo (-20%)." },
    { t: "Suspensão Automática", d: "Se a venda fura o ROI mínimo, paramos a venda." },
    { t: "Pivot para Arrendamento", d: "Conversão imediata para arrendamento (validado à priori)." }
  ];
  let py2 = ry3 + 0.95;
  pts.forEach((p) => {
    s.addText("✓", {
      x: rx + 0.3, y: py2, w: 0.3, h: 0.3,
      fontFace: FONT_BODY, fontSize: 14, color: C.GOLD, bold: true, margin: 0
    });
    s.addText(p.t, {
      x: rx + 0.65, y: py2 - 0.02, w: rw - 0.85, h: 0.3,
      fontFace: FONT_BODY, fontSize: 12, color: C.DARK, bold: true, margin: 0
    });
    s.addText(p.d, {
      x: rx + 0.65, y: py2 + 0.25, w: rw - 0.85, h: 0.3,
      fontFace: FONT_BODY, fontSize: 10, color: C.TEXT, margin: 0
    });
    py2 += 0.55;
  });

  // Bottom strip
  const ny = 5.32, nh = 0.18;
  s.addText("Nunca aceitamos um ROI abaixo do nosso mínimo. Se o mercado fechar a porta da venda, abrimos a do arrendamento.", {
    x: 0.5, y: ny, w: 9, h: nh,
    fontFace: FONT_BODY, fontSize: 10, color: C.TEXT_MUTED, italic: true, align: "center", margin: 0
  });
}

// ==================== SLIDE 7 — INFRAESTRUTURA / DASHBOARD CRM ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  logoCorner(s);
  cornerFrame(s);

  pilarTag(s, "A Nossa Infraestrutura");
  sectionTitle(s, "Tecnologia Proprietária ao Serviço do Rigor", { y: 1.25, size: 26 });
  subTitle(s, "Onde o rigor clínico encontra a segurança digital.", 1.85);

  const cards = [
    {
      tag: "Sistema",
      t: "CRM Proprietário",
      bullets: [
        "Imóveis, investidores, consultores, negócios e despesas num só sistema.",
        "Sem Excel partilhado. Sem ficheiros dispersos.",
        "Cada decisão registada, atribuída e datada."
      ]
    },
    {
      tag: "Operação",
      t: "Dashboard Operacional",
      bullets: [
        "OKRs, tarefas, alertas e KPIs em tempo real.",
        "Relatórios e PDFs gerados automaticamente.",
        "Integração com Drive, Notion e contabilidade."
      ]
    },
    {
      tag: "O que ganha",
      t: "Para Si, o Investidor",
      bullets: [
        "Zero erro humano na gestão administrativa.",
        "Acesso ao seu projeto sem depender de pessoas.",
        "Rastreabilidade total: do contacto à venda final."
      ]
    }
  ];
  const cy = 2.55, ch = 2.4, cw = 2.95, cgap = 0.15;
  const cstart = (W - (cw * 3 + cgap * 2)) / 2;
  cards.forEach((c, i) => {
    const x = cstart + i * (cw + cgap);
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: ch, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
    // colored top bar — last card uses gold to highlight
    const topColor = i === 2 ? C.GOLD : C.DARK;
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: 0.06, fill: { color: topColor }, line: { color: topColor, width: 0 } });
    s.addText(c.tag.toUpperCase(), {
      x: x + 0.2, y: cy + 0.18, w: cw - 0.4, h: 0.3,
      fontFace: FONT_BODY, fontSize: 9, color: C.GOLD_DARK, bold: true, charSpacing: 4, margin: 0
    });
    s.addText(c.t, {
      x: x + 0.2, y: cy + 0.45, w: cw - 0.4, h: 0.45,
      fontFace: FONT_HEAD, fontSize: 17, color: C.DARK, bold: true, margin: 0
    });
    goldBar(s, x + 0.2, cy + 0.95, 0.35, 0.02);
    let by = cy + 1.1;
    c.bullets.forEach((b) => {
      s.addShape(pres.shapes.OVAL, { x: x + 0.22, y: by + 0.07, w: 0.07, h: 0.07, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
      s.addText(b, {
        x: x + 0.36, y: by, w: cw - 0.55, h: 0.4,
        fontFace: FONT_BODY, fontSize: 10.5, color: C.TEXT, margin: 0
      });
      by += 0.42;
    });
  });

  // Bottom strap
  const ny = 5.15, nh = 0.32;
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: ny, w: 9, h: nh, fill: { color: C.DARK }, line: { color: C.DARK, width: 0 } });
  s.addText("Zero ficheiros perdidos. Zero esquecimentos. Zero improviso.", {
    x: 0.5, y: ny, w: 9, h: nh,
    fontFace: FONT_HEAD, fontSize: 12, color: C.GOLD, bold: true, italic: true, align: "center", valign: "middle", charSpacing: 1, margin: 0
  });
}

// ==================== SLIDE 8 — MAOS LIVRES (PILAR III) ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  logoCorner(s);
  cornerFrame(s);

  pilarTag(s, "Pilar III — Transparência Total");
  sectionTitle(s, "Mãos-Livres: O Que Vê e Recebe", { y: 1.25 });
  subTitle(s, "A sua janela em tempo real para o projeto, sem dependência de pessoas.", 1.85);

  const cards = [
    { n: "1", t: "Auditoria em Tempo Real", d: "Acesso vitalício a pasta cifrada. Faturas, contabilidade e documentos legais visíveis 24/7." },
    { n: "2", t: "Comunicação Sem Ruído", d: "Canal dedicado em exclusivo ao seu negócio. Atualizações diárias da equipa de liderança. Sem e-mails perdidos." },
    { n: "3", t: "Relatórios Visuais de Obra", d: "Carregamento semanal de fotografias e vídeos em alta resolução. Acompanhe ao milímetro, sem visitar o estaleiro." }
  ];
  const cy = 2.55, ch = 2.45, cw = 2.95, cgap = 0.15;
  const cstart = (W - (cw * 3 + cgap * 2)) / 2;
  cards.forEach((c, i) => {
    const x = cstart + i * (cw + cgap);
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: ch, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: 0.06, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
    s.addText(c.n, {
      x: x + 0.2, y: cy + 0.2, w: 1.0, h: 0.85,
      fontFace: FONT_HEAD, fontSize: 56, color: C.GOLD, bold: true, margin: 0
    });
    s.addText(c.t, {
      x: x + 0.2, y: cy + 1.1, w: cw - 0.4, h: 0.5,
      fontFace: FONT_HEAD, fontSize: 16, color: C.DARK, bold: true, margin: 0
    });
    goldBar(s, x + 0.2, cy + 1.65, 0.35, 0.02);
    s.addText(c.d, {
      x: x + 0.2, y: cy + 1.78, w: cw - 0.4, h: 0.65,
      fontFace: FONT_BODY, fontSize: 11, color: C.TEXT, margin: 0
    });
  });

  const ny = 5.15, nh = 0.32;
  s.addText("Tudo isto corre sobre o nosso CRM proprietário — não é promessa, é tecnologia.", {
    x: 0.5, y: ny, w: 9, h: nh,
    fontFace: FONT_BODY, fontSize: 11, color: C.GOLD_DARK, italic: true, align: "center", valign: "middle", margin: 0
  });
}

// ==================== SLIDE 9 — ALINHAMENTO 60/40 ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  logoCorner(s);
  cornerFrame(s);

  pilarTag(s, "Alinhamento de Interesses");
  sectionTitle(s, "Co-Investimento: 60% / 40%", { y: 1.25 });
  subTitle(s, "Investimos sempre o nosso próprio capital antes de o convidar a entrar.", 1.85);

  // Two columns
  const colY = 2.55;
  const colH = 2.0;

  // 60% Investidor
  const lcx = 0.8, lcw = 4.0;
  s.addShape(pres.shapes.RECTANGLE, { x: lcx, y: colY, w: lcw, h: colH, fill: { color: C.WHITE }, line: { color: C.GOLD, width: 2 } });
  s.addShape(pres.shapes.RECTANGLE, { x: lcx, y: colY, w: lcw, h: 0.08, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
  s.addText("60%", {
    x: lcx, y: colY + 0.2, w: lcw, h: 0.95,
    fontFace: FONT_HEAD, fontSize: 72, color: C.GOLD, bold: true, align: "center", margin: 0
  });
  s.addText("Investidor", {
    x: lcx, y: colY + 1.2, w: lcw, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 18, color: C.DARK, bold: true, align: "center", margin: 0
  });
  s.addText("Alocação de Capital", {
    x: lcx, y: colY + 1.58, w: lcw, h: 0.35,
    fontFace: FONT_BODY, fontSize: 12, color: C.GOLD_DARK, italic: true, align: "center", margin: 0
  });

  // 40% Somnium
  const rcx = 5.2, rcw = 4.0;
  s.addShape(pres.shapes.RECTANGLE, { x: rcx, y: colY, w: rcw, h: colH, fill: { color: C.WHITE }, line: { color: C.GOLD, width: 2 } });
  s.addShape(pres.shapes.RECTANGLE, { x: rcx, y: colY, w: rcw, h: 0.08, fill: { color: C.DARK }, line: { color: C.DARK, width: 0 } });
  s.addText("40%", {
    x: rcx, y: colY + 0.2, w: rcw, h: 0.95,
    fontFace: FONT_HEAD, fontSize: 72, color: C.DARK, bold: true, align: "center", margin: 0
  });
  s.addText("Somnium Properties", {
    x: rcx, y: colY + 1.2, w: rcw, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 18, color: C.DARK, bold: true, align: "center", margin: 0
  });
  s.addText("Gestão Operacional, Execução, Risco Técnico", {
    x: rcx, y: colY + 1.58, w: rcw, h: 0.35,
    fontFace: FONT_BODY, fontSize: 11, color: C.GOLD_DARK, italic: true, align: "center", margin: 0
  });

  // Bottom message
  const by = 4.85, bh = 0.65;
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: by, w: 9, h: bh, fill: { color: C.CREAM }, line: { color: C.GOLD, width: 1 } });
  s.addText("O Sinal de Confiança Absoluta: Co-Investimento", {
    x: 0.5, y: by + 0.05, w: 9, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 13, color: C.GOLD_DARK, bold: true, italic: true, align: "center", margin: 0
  });
  s.addText("A Somnium investe o seu próprio capital nos projetos que estrutura. Apenas abrimos espaço a parceiros após a nossa própria validação financeira.", {
    x: 0.7, y: by + 0.32, w: 8.6, h: 0.3,
    fontFace: FONT_BODY, fontSize: 11, color: C.TEXT, align: "center", margin: 0
  });
}

// ==================== SLIDE 10 — CTA ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  cornerFrame(s);

  logoCenter(s, 0.7, 1.7);

  s.addText("Construa um Portfólio", {
    x: 0.5, y: 2.0, w: 9, h: 0.7,
    fontFace: FONT_HEAD, fontSize: 38, color: C.DARK, bold: true, align: "center", margin: 0
  });
  s.addText("Sem Dores de Cabeça.", {
    x: 0.5, y: 2.7, w: 9, h: 0.7,
    fontFace: FONT_HEAD, fontSize: 38, color: C.GOLD_DARK, bold: true, italic: true, align: "center", margin: 0
  });

  goldBar(s, (W - 1.2) / 2, 3.55, 1.2, 0.025);

  s.addText("Junte-se ao nosso grupo restrito de investidores passivos\ne deixe o rigor clínico proteger o seu capital.", {
    x: 0.5, y: 3.7, w: 9, h: 0.7,
    fontFace: FONT_BODY, fontSize: 14, color: C.TEXT, italic: true, align: "center", margin: 0
  });

  // Mini stat strip
  const sy3 = 4.55, sh3 = 0.45;
  s.addShape(pres.shapes.RECTANGLE, { x: 1.5, y: sy3, w: 7, h: sh3, fill: { color: C.CREAM }, line: { color: C.GOLD, width: 0.75 } });
  s.addText("72 parceiros activos     ·     Co-investimento próprio     ·     Zero improviso", {
    x: 1.5, y: sy3, w: 7, h: sh3,
    fontFace: FONT_BODY, fontSize: 10.5, color: C.DARK, bold: true, align: "center", valign: "middle", charSpacing: 1, margin: 0
  });

  // Footer
  s.addShape(pres.shapes.RECTANGLE, {
    x: 1.5, y: 5.2, w: 7, h: 0.015,
    fill: { color: C.GOLD_DARK }, line: { color: C.GOLD_DARK, width: 0 }
  });
  s.addText("Alexandre Mendes & João Abreu    ·    geral@somniumproperties.pt    ·    www.somniumproperties.pt", {
    x: 0.5, y: 5.27, w: 9, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10.5, color: C.GOLD_DARK, align: "center", charSpacing: 1, margin: 0
  });
}

pres.writeFile({ fileName: OUT }).then((file) => {
  console.log("WROTE:", file);
});
