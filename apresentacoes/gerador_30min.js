// Apresentação Investidores — versão 30min (10 slides)
// Layout dos PDFs da dashboard (src/db/pdfImovelDocs.js) com ritmo
// dinamico: alternancia dark/light, numeros grandes, menos texto.
const pptxgen = require("pptxgenjs");

const LOGO_DARK = "/home/user/SomniumProperties-Dashboard/public/logo-dark.png";
const LOGO_TRANSPARENT = "/home/user/SomniumProperties-Dashboard/public/logo-transparent.png";

const C = {
  gold: "C9A84C",
  goldSoft: "E8D08A",
  black: "0D0D0D",
  blackSoft: "1A1A1A",
  white: "FFFFFF",
  bg: "F7F6F2",
  body: "2A2A2A",
  muted: "888888",
  mutedDark: "9A8F70",
  border: "E0DDD5",
  light: "F0EFE9",
  totalBg: "F5F3EE",
  green: "2D6A2D",
  red: "8B2020",
};

const FONT_H = "Helvetica";
const FONT_B = "Helvetica";

const W = 13.333, H = 7.5;
const ML = 0.55, MR = 0.55;
const CW = W - ML - MR;
const BAR = 0.075;
const RULE_THICK = 0.025;
const RULE_THIN = 0.008;

const TOTAL_SLIDES = 10;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Somnium Properties";
pres.title = "Apresentação a Investidores — 2026";
pres.company = "Somnium Properties";

// ── Chrome ────────────────────────────────────────────────────
function topBars(s, color = C.gold) {
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: BAR, fill: { color }, line: { type: "none" } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: H - BAR, w: W, h: BAR, fill: { color }, line: { type: "none" } });
}

function lightChrome(s, eyebrow, title, pageNum) {
  s.background = { color: C.bg };
  topBars(s);
  // Logo top-left
  s.addImage({ path: LOGO_DARK, x: ML, y: 0.28, h: 0.32, w: 0.85 });
  // Eyebrow
  if (eyebrow) {
    s.addText(eyebrow.toUpperCase(), {
      x: ML + 1.1, y: 0.34, w: CW - 2.0, h: 0.22,
      fontSize: 8.5, fontFace: FONT_B, color: C.muted,
      charSpacing: 4, align: "left", margin: 0,
    });
  }
  // Page n / TOTAL right side
  s.addText(`${pageNum} / ${TOTAL_SLIDES}`, {
    x: W - MR - 1.0, y: 0.34, w: 1.0, h: 0.22,
    fontSize: 8.5, fontFace: FONT_B, color: C.muted,
    charSpacing: 2, align: "right", margin: 0,
  });
  // Gold rule below header
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: 0.7, w: CW, h: RULE_THICK,
    fill: { color: C.gold }, line: { type: "none" },
  });
  // Gold rule above footer
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: H - 0.55, w: CW, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("Confidencial · Somnium Properties · Investimento Imobiliário", {
    x: ML, y: H - 0.43, w: CW, h: 0.2,
    fontSize: 7.5, fontFace: FONT_B, color: C.muted,
    align: "center", charSpacing: 1.5, margin: 0,
  });
  // Title
  if (title) {
    s.addText(title, {
      x: ML, y: 0.95, w: CW, h: 0.65,
      fontSize: 26, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
  }
}

function darkChrome(s, eyebrow, title, pageNum) {
  s.background = { color: C.black };
  topBars(s);
  // Logo top-left transparente
  s.addImage({ path: LOGO_TRANSPARENT, x: ML, y: 0.28, h: 0.32, w: 0.85 });
  if (eyebrow) {
    s.addText(eyebrow.toUpperCase(), {
      x: ML + 1.1, y: 0.34, w: CW - 2.0, h: 0.22,
      fontSize: 8.5, fontFace: FONT_B, color: C.goldSoft,
      charSpacing: 4, align: "left", margin: 0,
    });
  }
  s.addText(`${pageNum} / ${TOTAL_SLIDES}`, {
    x: W - MR - 1.0, y: 0.34, w: 1.0, h: 0.22,
    fontSize: 8.5, fontFace: FONT_B, color: C.goldSoft,
    charSpacing: 2, align: "right", margin: 0,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: 0.7, w: CW, h: RULE_THICK,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: H - 0.55, w: CW, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("Confidencial · Somnium Properties · Investimento Imobiliário", {
    x: ML, y: H - 0.43, w: CW, h: 0.2,
    fontSize: 7.5, fontFace: FONT_B, color: C.mutedDark,
    align: "center", charSpacing: 1.5, margin: 0,
  });
  if (title) {
    s.addText(title, {
      x: ML, y: 0.95, w: CW, h: 0.65,
      fontSize: 26, fontFace: FONT_H, bold: true, color: C.white, margin: 0,
    });
  }
}

function bigStat(s, { x, y, w, h, value, label, dark = false, color }) {
  s.addText(value, {
    x, y, w, h: h * 0.65,
    fontSize: 64, fontFace: FONT_H, bold: true,
    color: color || C.gold, align: "center", margin: 0,
  });
  s.addText(label.toUpperCase(), {
    x, y: y + h * 0.65, w, h: h * 0.35,
    fontSize: 10, fontFace: FONT_B, bold: true,
    color: dark ? C.goldSoft : C.muted,
    align: "center", charSpacing: 3, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 1 — CAPA (dark)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.black };
  topBars(s);

  const LW = 5.0, LH = LW / (1516 / 614);
  const blockTop = (H - (LH + 2.6)) / 2;
  s.addImage({ path: LOGO_TRANSPARENT, x: (W - LW) / 2, y: blockTop, w: LW, h: LH });

  const accent1Y = blockTop + LH + 0.45;
  s.addShape(pres.shapes.RECTANGLE, {
    x: W / 2 - 0.5, y: accent1Y, w: 1.0, h: RULE_THICK,
    fill: { color: C.gold }, line: { type: "none" },
  });

  s.addText("Investimento e Gestão de Ativos", {
    x: ML, y: accent1Y + 0.25, w: CW, h: 0.7,
    fontSize: 36, fontFace: FONT_H, bold: true, color: C.white,
    align: "center", margin: 0,
  });

  s.addText("RIGOR CLÍNICO  ·  TRANSPARÊNCIA TOTAL  ·  RENTABILIDADE", {
    x: ML, y: accent1Y + 1.05, w: CW, h: 0.3,
    fontSize: 12, fontFace: FONT_B, color: C.gold,
    align: "center", charSpacing: 5, margin: 0,
  });

  s.addText("Uma abordagem de 'Zero Improviso' ao investimento imobiliário.", {
    x: ML, y: accent1Y + 1.5, w: CW, h: 0.3,
    fontSize: 13, fontFace: FONT_B, italic: true, color: C.goldSoft,
    align: "center", margin: 0,
  });

  // Footer
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: H - 0.7, w: CW, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("Preparado para Investidores Privados  ·  Coimbra  ·  Portugal", {
    x: ML, y: H - 0.55, w: CW, h: 0.2,
    fontSize: 9, fontFace: FONT_B, color: C.mutedDark,
    align: "center", charSpacing: 2, margin: 0,
  });
  s.addText("Documento Confidencial", {
    x: ML, y: H - 0.35, w: CW, h: 0.2,
    fontSize: 8, fontFace: FONT_B, color: C.mutedDark,
    align: "center", charSpacing: 2, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 2 — O DESAFIO (light)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "Contexto", "O valor não está apenas no ativo. Está na execução.", 2);

  // Tagline
  s.addText("Investir sozinho expõe a três assimetrias de mercado:", {
    x: ML, y: 1.75, w: CW, h: 0.35,
    fontSize: 13, fontFace: FONT_B, italic: true, color: C.muted, margin: 0,
  });

  const probs = [
    { icon: "T", t: "Tempo", d: "Prospeção, negociação e gestão de obras consomem semanas inteiras." },
    { icon: "R", t: "Risco", d: "Decisões emocionais e derrapagens financeiras não calculadas." },
    { icon: "E", t: "Execução", d: "Empreiteiros incertos, sem rede e sem poder negocial." },
  ];

  const cy = 2.4, ch = 3.7, gap = 0.25;
  const cw = (CW - 2 * gap) / 3;
  probs.forEach((p, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: ch,
      fill: { color: C.light }, line: { color: C.border, width: 0.5 },
    });
    // Circulo gold com letra
    s.addShape(pres.shapes.OVAL, {
      x: x + cw / 2 - 0.45, y: cy + 0.5, w: 0.9, h: 0.9,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(p.icon, {
      x: x + cw / 2 - 0.45, y: cy + 0.5, w: 0.9, h: 0.9,
      fontSize: 36, fontFace: FONT_H, bold: true, color: C.black,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(p.t, {
      x: x + 0.3, y: cy + 1.7, w: cw - 0.6, h: 0.5,
      fontSize: 22, fontFace: FONT_H, bold: true, color: C.body,
      align: "center", margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + cw / 2 - 0.25, y: cy + 2.2, w: 0.5, h: RULE_THICK,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(p.d, {
      x: x + 0.4, y: cy + 2.4, w: cw - 0.8, h: ch - 2.55,
      fontSize: 12, fontFace: FONT_B, color: C.body,
      align: "center", margin: 0,
    });
  });

  // Frase de transição
  s.addText("→ A Somnium Properties resolve esta assimetria com método.", {
    x: ML, y: cy + ch + 0.2, w: CW, h: 0.3,
    fontSize: 12, fontFace: FONT_B, italic: true, color: C.gold,
    align: "center", margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 3 — A RESPOSTA / FILOSOFIA + EQUIPA (dark)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  darkChrome(s, "Quem Somos", "Filosofia Zero Improviso", 3);

  // Frase forte
  s.addText("Aplicamos ao imobiliário a disciplina, ética e rigor da área da Saúde — onde o erro não é uma opção.", {
    x: ML, y: 1.8, w: CW, h: 0.7,
    fontSize: 16, fontFace: FONT_H, italic: true, color: C.goldSoft,
    align: "center", margin: 0,
  });

  // 3 traços a esquerda
  const traits = [
    { t: "Origem Clínica", d: "Fundadores com background em Saúde aplicam protocolos rigorosos a cada operação." },
    { t: "Dados sobre Instinto", d: "Cada decisão sustentada por análise quantitativa, simulação e testes de stress." },
    { t: "Rede Validada", d: "Equipa técnica + 72 parceiros operacionais já testados em projetos reais." },
  ];
  const tx = ML, ty = 2.85, tw = 6.0, gap = 0.25;
  const trH = (4.0 - 2 * gap) / 3;
  traits.forEach((tr, i) => {
    const y = ty + i * (trH + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x: tx, y, w: 0.05, h: trH,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(tr.t, {
      x: tx + 0.2, y, w: tw - 0.3, h: 0.4,
      fontSize: 16, fontFace: FONT_H, bold: true, color: C.gold, margin: 0,
    });
    s.addText(tr.d, {
      x: tx + 0.2, y: y + 0.45, w: tw - 0.3, h: trH - 0.5,
      fontSize: 12, fontFace: FONT_B, color: C.white, margin: 0,
    });
  });

  // Card direita: equipa
  const ex = tx + tw + 0.5, ew = CW - tw - 0.5, ey = ty, eh = 4.0;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ex, y: ey, w: ew, h: eh,
    fill: { color: C.blackSoft }, line: { color: C.gold, width: 0.5 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: ex, y: ey, w: ew, h: 0.04,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("EQUIPA", {
    x: ex + 0.3, y: ey + 0.25, w: ew - 0.6, h: 0.3,
    fontSize: 9, fontFace: FONT_B, bold: true, color: C.gold,
    charSpacing: 4, margin: 0,
  });
  const team = [
    { n: "Alexandre Mendes & João Abreu", r: "Fundadores  ·  Gestão clínica do investimento" },
    { n: "Luís", r: "Gestor de Obra  ·  Construção, licenciamento, projeto" },
    { n: "João", r: "Consultor Estratégico  ·  Visão macro de mercado" },
  ];
  team.forEach((m, i) => {
    const my = ey + 0.7 + i * 0.95;
    s.addShape(pres.shapes.RECTANGLE, {
      x: ex + 0.3, y: my, w: 0.4, h: RULE_THICK,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(m.n, {
      x: ex + 0.3, y: my + 0.1, w: ew - 0.6, h: 0.35,
      fontSize: 13, fontFace: FONT_H, bold: true, color: C.white, margin: 0,
    });
    s.addText(m.r, {
      x: ex + 0.3, y: my + 0.45, w: ew - 0.6, h: 0.3,
      fontSize: 10, fontFace: FONT_B, italic: true, color: C.goldSoft, margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 4 — PILAR I: A CIÊNCIA DA COMPRA (light)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "PILAR I  ·  Segurança & Rigor", "A Ciência da Compra", 4);

  // Top: 2 stats grandes
  const sy = 1.85;
  bigStat(s, { x: ML, y: sy, w: CW / 2 - 0.15, h: 1.8, value: "5", label: "SOPs Documentados em Uso" });
  bigStat(s, { x: ML + CW / 2 + 0.15, y: sy, w: CW / 2 - 0.15, h: 1.8, value: "5+", label: "Comparáveis Mínimos por Análise" });

  // Formula box destaque
  const fy = sy + 2.05;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: fy, w: CW, h: 1.4,
    fill: { color: C.black }, line: { type: "none" },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: fy, w: CW, h: 0.04,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("MAO  =  (VVR  ×  0,64  a  0,70)  −  Custo de Obra", {
    x: ML, y: fy + 0.25, w: CW, h: 0.6,
    fontSize: 32, fontFace: FONT_H, bold: true, color: C.gold,
    align: "center", margin: 0,
  });
  s.addText("Maximum Allowable Offer  ·  Nunca compramos acima da linha de segurança 64–70% do VVR.", {
    x: ML, y: fy + 0.92, w: CW, h: 0.35,
    fontSize: 12, fontFace: FONT_B, italic: true, color: C.goldSoft,
    align: "center", margin: 0,
  });

  // 3 mini-cards explicativos
  const my = fy + 1.65;
  const items = [
    { t: "Validação Cruzada", d: "Mínimo 5 comparáveis cruzados com avaliadores e parceiros locais." },
    { t: "Ajuste Matemático", d: "Correções automáticas por área, localização, idade e conservação." },
    { t: "Linha de Segurança", d: "Margem clínica preservada antes de qualquer proposta." },
  ];
  const mw = (CW - 0.4) / 3;
  items.forEach((it, i) => {
    const x = ML + i * (mw + 0.2);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: my, w: 0.05, h: 1.3,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(it.t, {
      x: x + 0.18, y: my, w: mw - 0.2, h: 0.35,
      fontSize: 13, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    s.addText(it.d, {
      x: x + 0.18, y: my + 0.4, w: mw - 0.2, h: 0.9,
      fontSize: 11, fontFace: FONT_B, color: C.body, margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 5 — STRESS TESTS (dark)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  darkChrome(s, "PILAR I  ·  Segurança & Rigor", "A Nossa Obsessão com o Risco", 5);

  s.addText("Cada operação é simulada em três cenários antes de avançar:", {
    x: ML, y: 1.75, w: CW, h: 0.3,
    fontSize: 13, fontFace: FONT_B, italic: true, color: C.goldSoft,
    align: "center", margin: 0,
  });

  const cards = [
    { t: "Cenário Base", v: "0", subVVR: "Plano ideal", subObra: "Conservador", subRet: "Sem buffer", color: C.green, num: "01" },
    { t: "Stress Moderado", v: "−10%", subVVR: "VVR", subObra: "+10% Custo Obra", subRet: "+3 meses retenção", color: C.gold, num: "02" },
    { t: "Stress Severo", v: "−20%", subVVR: "VVR", subObra: "+20% Custo Obra", subRet: "+6 meses retenção", color: C.red, num: "03" },
  ];
  const cy = 2.25, ch = 3.0, gap = 0.22;
  const cw = (CW - 2 * gap) / 3;
  cards.forEach((c, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: ch,
      fill: { color: C.blackSoft }, line: { color: c.color, width: 1.2 },
    });
    // Faixa colorida no topo
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: 0.4,
      fill: { color: c.color }, line: { type: "none" },
    });
    s.addText(c.num, {
      x: x + 0.2, y: cy, w: 0.5, h: 0.4,
      fontSize: 11, fontFace: FONT_H, bold: true, color: C.white,
      valign: "middle", margin: 0,
    });
    s.addText(c.t.toUpperCase(), {
      x: x + 0.6, y: cy, w: cw - 0.7, h: 0.4,
      fontSize: 10, fontFace: FONT_B, bold: true, color: C.white,
      valign: "middle", charSpacing: 2, margin: 0,
    });
    // Big number
    s.addText(c.v, {
      x, y: cy + 0.6, w: cw, h: 0.85,
      fontSize: 56, fontFace: FONT_H, bold: true, color: c.color,
      align: "center", margin: 0,
    });
    s.addText(c.subVVR, {
      x, y: cy + 1.5, w: cw, h: 0.3,
      fontSize: 11, fontFace: FONT_B, color: C.goldSoft,
      align: "center", charSpacing: 2, margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + cw / 2 - 0.3, y: cy + 1.85, w: 0.6, h: RULE_THIN,
      fill: { color: c.color }, line: { type: "none" },
    });
    s.addText(c.subObra, {
      x: x + 0.2, y: cy + 2.0, w: cw - 0.4, h: 0.3,
      fontSize: 11, fontFace: FONT_B, color: C.white,
      align: "center", margin: 0,
    });
    s.addText(c.subRet, {
      x: x + 0.2, y: cy + 2.4, w: cw - 0.4, h: 0.3,
      fontSize: 11, fontFace: FONT_B, color: C.white,
      align: "center", margin: 0,
    });
  });

  // Regra de ouro
  const ry = cy + ch + 0.35;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: ry, w: 0.05, h: 0.7,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("Regra de ouro  ·  Nenhum negócio avança se só for rentável no Cenário Base.", {
    x: ML + 0.2, y: ry, w: CW - 0.2, h: 0.7,
    fontSize: 14, fontFace: FONT_H, italic: true, color: C.gold,
    valign: "middle", margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 6 — PILAR II: VENDA + PLANO B (light)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "PILAR II  ·  Rentabilidade", "Tática de Venda Cirúrgica", 6);

  // 3 fases lado a lado (compactas)
  const phases = [
    { n: "1", win: "0–30 DIAS", t: "Preparação Premium", d: "Home staging, fotografia profissional, tour 360°. Posicionamento 2–4% acima do VVR." },
    { n: "2", win: "31–60 DIAS", t: "Ajuste Tático", d: "Aproximação ao Stress Moderado com ajustes táticos conforme procura." },
    { n: "3", win: "61+ DIAS", t: "Acelerador", d: "Top performer da rede + cláusula de redução máxima sem comprometer ROI mínimo." },
  ];

  const cy = 1.85, ch = 2.7, gap = 0.22;
  const cw = (CW - 2 * gap) / 3;
  phases.forEach((p, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: ch,
      fill: { color: C.light }, line: { color: C.border, width: 0.5 },
    });
    s.addText(p.n, {
      x: x + 0.25, y: cy + 0.15, w: 0.9, h: 0.9,
      fontSize: 56, fontFace: FONT_H, bold: true, color: C.gold, margin: 0,
    });
    s.addText(p.win, {
      x: x + 1.25, y: cy + 0.4, w: cw - 1.4, h: 0.3,
      fontSize: 9, fontFace: FONT_B, bold: true, color: C.muted,
      charSpacing: 3, margin: 0,
    });
    s.addText(p.t, {
      x: x + 1.25, y: cy + 0.65, w: cw - 1.4, h: 0.5,
      fontSize: 16, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.25, y: cy + 1.3, w: 0.5, h: RULE_THICK,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(p.d, {
      x: x + 0.25, y: cy + 1.5, w: cw - 0.5, h: ch - 1.65,
      fontSize: 11, fontFace: FONT_B, color: C.body, margin: 0,
    });
  });

  // Plano B box destaque (preto)
  const py = cy + ch + 0.35;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: py, w: CW, h: 1.85,
    fill: { color: C.black }, line: { type: "none" },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: py, w: CW, h: 0.04,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("PLANO B  ·  A REDE DE SEGURANÇA ABSOLUTA", {
    x: ML + 0.4, y: py + 0.25, w: CW - 0.8, h: 0.32,
    fontSize: 11, fontFace: FONT_B, bold: true, color: C.gold,
    charSpacing: 4, margin: 0,
  });
  s.addText("Se o preço passar a Linha Vermelha (Stress Severo), a venda é automaticamente suspensa e o ativo pivota para arrendamento — modelo validado a priori. O ROI mínimo é sempre protegido.", {
    x: ML + 0.4, y: py + 0.65, w: CW - 0.8, h: 1.1,
    fontSize: 13, fontFace: FONT_B, color: C.white, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 7 — PILAR III: MÃOS-LIVRES (dark)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  darkChrome(s, "PILAR III  ·  Transparência Total", "Ecossistema 'Mãos-Livres'", 7);

  s.addText("Acesso total. Esforço nulo.", {
    x: ML, y: 1.8, w: CW, h: 0.4,
    fontSize: 16, fontFace: FONT_H, italic: true, color: C.gold,
    align: "center", margin: 0,
  });

  const items = [
    { n: "01", t: "Auditoria em Tempo Real", d: "Pasta cifrada com faturas, contabilidade e documentos legais — acesso vitalício." },
    { n: "02", t: "Comunicação Sem Ruído", d: "Canal dedicado ao seu negócio. Atualizações diárias diretas com a liderança." },
    { n: "03", t: "Relatórios Visuais de Obra", d: "Fotografias e vídeos semanais em alta resolução. Acompanhe sem visitar o estaleiro." },
  ];

  const cy = 2.4, ch = 3.7, gap = 0.25;
  const cw = (CW - 2 * gap) / 3;
  items.forEach((it, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: ch,
      fill: { color: C.blackSoft }, line: { color: C.gold, width: 0.5 },
    });
    s.addText(it.n, {
      x: x + 0.3, y: cy + 0.3, w: cw - 0.6, h: 0.7,
      fontSize: 44, fontFace: FONT_H, bold: true, color: C.gold, margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.3, y: cy + 1.05, w: 0.5, h: RULE_THICK,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(it.t, {
      x: x + 0.3, y: cy + 1.25, w: cw - 0.6, h: 0.7,
      fontSize: 17, fontFace: FONT_H, bold: true, color: C.white, margin: 0,
    });
    s.addText(it.d, {
      x: x + 0.3, y: cy + 2.1, w: cw - 0.6, h: ch - 2.3,
      fontSize: 12, fontFace: FONT_B, color: C.goldSoft, margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 8 — ALINHAMENTO 50/50 + CO-INVESTIMENTO (light)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "Alinhamento de Interesses", "50% Investidor  ·  50% Somnium", 8);

  // Top: dois 50%
  const splits = [
    { p: "50%", t: "Investidor", d: "Alocação de Capital", dark: false },
    { p: "50%", t: "Somnium Properties", d: "Gestão Operacional, Execução, Risco Técnico", dark: true },
  ];
  const ty = 1.85, th = 2.6;
  splits.forEach((sp, i) => {
    const x = ML + i * (CW / 2 + 0.15);
    const w = CW / 2 - 0.15;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: ty, w, h: th,
      fill: { color: sp.dark ? C.black : C.light },
      line: { color: sp.dark ? C.black : C.border, width: 0.5 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: ty, w, h: 0.05,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(sp.p, {
      x, y: ty + 0.4, w, h: 1.2,
      fontSize: 88, fontFace: FONT_H, bold: true, color: C.gold,
      align: "center", margin: 0,
    });
    s.addText(sp.t, {
      x: x + 0.3, y: ty + 1.65, w: w - 0.6, h: 0.5,
      fontSize: 20, fontFace: FONT_H, bold: true,
      color: sp.dark ? C.white : C.body, align: "center", margin: 0,
    });
    s.addText(sp.d, {
      x: x + 0.3, y: ty + 2.1, w: w - 0.6, h: 0.4,
      fontSize: 11, fontFace: FONT_B, italic: true,
      color: sp.dark ? C.goldSoft : C.muted, align: "center", margin: 0,
    });
  });

  // Bottom: co-investimento callout
  const by = ty + th + 0.45, bh = 1.7;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: by, w: CW, h: bh,
    fill: { color: C.totalBg }, line: { color: C.gold, width: 1 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: by, w: 0.06, h: bh,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("Co-investimento", {
    x: ML + 0.45, y: by + 0.25, w: CW - 0.9, h: 0.4,
    fontSize: 9, fontFace: FONT_B, bold: true, color: C.gold,
    charSpacing: 4, margin: 0,
  });
  s.addText("A Somnium investe sempre o seu próprio capital nos projetos que estrutura. Só abrimos espaço a parceiros depois da nossa própria validação financeira.", {
    x: ML + 0.45, y: by + 0.6, w: CW - 0.9, h: 1.0,
    fontSize: 16, fontFace: FONT_H, italic: true, color: C.body,
    margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 9 — A OPORTUNIDADE / RESUMO (light)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "Resumo Executivo", "A Oportunidade Somnium", 9);

  const items = [
    { n: "1", t: "Segurança", sub: "Zero Improviso", d: "MAO validado e Stress Tests severos antes de cada decisão." },
    { n: "2", t: "Rentabilidade", sub: "Otimizada", d: "Saída tática pré-definida (SOP 10) com Plano B de arrendamento." },
    { n: "3", t: "Transparência", sub: "Institucional", d: "Acesso digital total — controlo absoluto, esforço nulo." },
  ];
  const cy = 1.9, ch = 4.6, gap = 0.25;
  const cw = (CW - 2 * gap) / 3;
  items.forEach((it, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: ch,
      fill: { color: C.black }, line: { type: "none" },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: 0.05,
      fill: { color: C.gold }, line: { type: "none" },
    });
    // Numero gigante
    s.addText(it.n, {
      x, y: cy + 0.5, w: cw, h: 1.5,
      fontSize: 110, fontFace: FONT_H, bold: true, color: C.gold,
      align: "center", margin: 0,
    });
    s.addText(it.t, {
      x, y: cy + 2.3, w: cw, h: 0.55,
      fontSize: 22, fontFace: FONT_H, bold: true, color: C.white,
      align: "center", margin: 0,
    });
    s.addText(it.sub.toUpperCase(), {
      x, y: cy + 2.85, w: cw, h: 0.3,
      fontSize: 10, fontFace: FONT_B, bold: true, color: C.gold,
      align: "center", charSpacing: 4, margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + cw / 2 - 0.25, y: cy + 3.2, w: 0.5, h: RULE_THICK,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(it.d, {
      x: x + 0.4, y: cy + 3.4, w: cw - 0.8, h: ch - 3.55,
      fontSize: 12, fontFace: FONT_B, color: C.goldSoft,
      align: "center", margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 10 — CTA / OBRIGADO (dark)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.black };
  topBars(s);

  const LW = 3.5, LH = LW / (1516 / 614);
  const blockTop = 1.0;
  s.addImage({ path: LOGO_TRANSPARENT, x: (W - LW) / 2, y: blockTop, w: LW, h: LH });

  const accent1Y = blockTop + LH + 0.45;
  s.addShape(pres.shapes.RECTANGLE, {
    x: W / 2 - 0.5, y: accent1Y, w: 1.0, h: RULE_THICK,
    fill: { color: C.gold }, line: { type: "none" },
  });

  s.addText("Construa um Portfólio\nSem Dores de Cabeça.", {
    x: ML, y: accent1Y + 0.3, w: CW, h: 1.6,
    fontSize: 44, fontFace: FONT_H, bold: true, color: C.white,
    align: "center", margin: 0,
  });

  s.addText("Junte-se ao grupo restrito de investidores passivos e deixe o rigor clínico proteger o seu capital.", {
    x: ML + 1.5, y: accent1Y + 2.05, w: CW - 3.0, h: 0.6,
    fontSize: 14, fontFace: FONT_B, italic: true, color: C.goldSoft,
    align: "center", margin: 0,
  });

  // Long thin gold rule
  const accent2Y = accent1Y + 2.95;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML + 2.5, y: accent2Y, w: CW - 5.0, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });

  // Contactos em linha
  s.addText([
    { text: "geral@somniumproperties.pt", options: { color: C.gold, bold: true } },
    { text: "       ·       ", options: { color: C.mutedDark } },
    { text: "www.somniumproperties.pt", options: { color: C.gold, bold: true } },
  ], {
    x: ML, y: accent2Y + 0.2, w: CW, h: 0.35,
    fontSize: 13, fontFace: FONT_B, align: "center", margin: 0,
  });

  s.addText("Alexandre Mendes  ·  João Abreu", {
    x: ML, y: accent2Y + 0.6, w: CW, h: 0.3,
    fontSize: 11, fontFace: FONT_B, color: C.mutedDark,
    align: "center", charSpacing: 2, margin: 0,
  });

  // Footer
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: H - 0.55, w: CW, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("Documento Confidencial · Somnium Properties", {
    x: ML, y: H - 0.43, w: CW, h: 0.2,
    fontSize: 8, fontFace: FONT_B, color: C.mutedDark,
    align: "center", charSpacing: 2, margin: 0,
  });
}

// ── Save ────────────────────────────────────────────────────
const path = require("path");
const out = path.resolve("/tmp/recolor/Apresentacao_Investidores_30min_Somnium.pptx");
pres.writeFile({ fileName: out }).then(p => console.log("WROTE:", p));
