const pptxgen = require("pptxgenjs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOGO_LIGHT = path.join(ROOT, "public", "logo-transparent.png");        // white logo on transparent — use on dark slides
const LOGO_DARK = path.join(ROOT, "public", "logo-dark-transparent.png");    // dark logo on transparent — use on light slides
const OUT = path.join(ROOT, "Apresentacao_Investidores_Marco_2026.pptx");

const C = {
  DARK: "0d0d0d",
  DARK_2: "1a1a1a",
  DARK_3: "262626",
  GOLD: "C9A84C",
  GOLD_LIGHT: "E8D08A",
  GOLD_DARK: "A88A3A",
  OFFWHITE: "FBFAF7",
  CREAM: "F2EDE0",
  BORDER: "E0DDD5",
  TEXT: "1F2937",
  TEXT_MUTED: "6B7280",
  WHITE: "FFFFFF",
  GREEN: "16A34A",
  YELLOW: "CA8A04",
  RED: "DC2626"
};

const FONT_HEAD = "Georgia";
const FONT_BODY = "Helvetica";

const W = 10;
const H = 5.625;

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Somnium Properties";
pres.company = "Somnium Properties";
pres.title = "Investimento e Gestao de Ativos - Investidores Marco 2026";

function addLogoCorner(slide, onDark = false) {
  const logoPath = onDark ? LOGO_LIGHT : LOGO_DARK;
  slide.addImage({ path: logoPath, x: 0.35, y: 0.25, w: 1.1, h: 0.45, sizing: { type: "contain", w: 1.1, h: 0.45 } });
}

function addLogoCenter(slide, y, w = 2.2, onDark = true) {
  const logoPath = onDark ? LOGO_LIGHT : LOGO_DARK;
  const x = (W - w) / 2;
  slide.addImage({ path: logoPath, x, y, w, h: w * 0.4, sizing: { type: "contain", w, h: w * 0.4 } });
}

function addCornerFrame(slide, color = C.GOLD) {
  const m = 0.25;
  const len = 0.5;
  const t = 0.015;
  // top-left
  slide.addShape(pres.shapes.RECTANGLE, { x: m, y: m, w: len, h: t, fill: { color }, line: { color, width: 0 } });
  slide.addShape(pres.shapes.RECTANGLE, { x: m, y: m, w: t, h: len, fill: { color }, line: { color, width: 0 } });
  // top-right
  slide.addShape(pres.shapes.RECTANGLE, { x: W - m - len, y: m, w: len, h: t, fill: { color }, line: { color, width: 0 } });
  slide.addShape(pres.shapes.RECTANGLE, { x: W - m - t, y: m, w: t, h: len, fill: { color }, line: { color, width: 0 } });
  // bottom-left
  slide.addShape(pres.shapes.RECTANGLE, { x: m, y: H - m - t, w: len, h: t, fill: { color }, line: { color, width: 0 } });
  slide.addShape(pres.shapes.RECTANGLE, { x: m, y: H - m - len, w: t, h: len, fill: { color }, line: { color, width: 0 } });
  // bottom-right
  slide.addShape(pres.shapes.RECTANGLE, { x: W - m - len, y: H - m - t, w: len, h: t, fill: { color }, line: { color, width: 0 } });
  slide.addShape(pres.shapes.RECTANGLE, { x: W - m - t, y: H - m - len, w: t, h: len, fill: { color }, line: { color, width: 0 } });
}

function addPilarTag(slide, text, color = C.GOLD) {
  slide.addText(text.toUpperCase(), {
    x: 0.5, y: 0.85, w: 9, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10, color, bold: true, charSpacing: 4,
    margin: 0
  });
}

function addSectionTitle(slide, text, opts = {}) {
  slide.addText(text, {
    x: 0.5, y: opts.y || 1.15, w: opts.w || 9, h: opts.h || 0.7,
    fontFace: FONT_HEAD, fontSize: opts.size || 28, color: opts.color || C.DARK, bold: true,
    margin: 0, valign: "top"
  });
}

// ==================== SLIDE 1 - CAPA ====================
{
  const s = pres.addSlide();
  s.background = { color: C.DARK };
  addCornerFrame(s, C.GOLD);

  addLogoCenter(s, 0.6, 2.0);

  s.addText("Investimento e Gestão de Ativos", {
    x: 0.5, y: 1.85, w: 9, h: 0.9,
    fontFace: FONT_HEAD, fontSize: 40, color: C.WHITE, bold: true, align: "center", margin: 0
  });

  s.addText("Rigor Clínico, Transparência Total e Rentabilidade.", {
    x: 0.5, y: 2.85, w: 9, h: 0.6,
    fontFace: FONT_HEAD, fontSize: 22, color: C.GOLD, italic: true, align: "center", margin: 0
  });

  // gold separator
  s.addShape(pres.shapes.RECTANGLE, {
    x: (W - 1.5) / 2, y: 3.65, w: 1.5, h: 0.02,
    fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 }
  });

  s.addText("Uma abordagem de 'Zero Improviso' ao investimento imobiliário.", {
    x: 0.5, y: 3.85, w: 9, h: 0.45,
    fontFace: FONT_BODY, fontSize: 14, color: "CCCCCC", align: "center", margin: 0
  });

  s.addText("Preparado para Investidores Privados  |  2026", {
    x: 0.5, y: 5.05, w: 9, h: 0.35,
    fontFace: FONT_BODY, fontSize: 10, color: "888888", align: "center", charSpacing: 2, margin: 0
  });
}

// ==================== SLIDE 2 - STATEMENT ====================
{
  const s = pres.addSlide();
  s.background = { color: C.DARK };
  addLogoCorner(s, true);

  // big quote mark
  s.addText("“", {
    x: 0.5, y: 1.2, w: 1.2, h: 1.2,
    fontFace: FONT_HEAD, fontSize: 120, color: C.GOLD, bold: true, margin: 0
  });

  s.addText("O valor não está apenas no ativo.", {
    x: 0.5, y: 2.0, w: 9, h: 0.7,
    fontFace: FONT_HEAD, fontSize: 34, color: C.GOLD, bold: true, margin: 0
  });

  s.addText("Está na execução.", {
    x: 0.5, y: 2.7, w: 9, h: 0.7,
    fontFace: FONT_HEAD, fontSize: 34, color: C.WHITE, bold: true, margin: 0
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 3.55, w: 0.6, h: 0.03,
    fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 }
  });

  s.addText(
    "O imobiliário continua a ser uma das formas mais consistentes de criação de património. " +
    "No entanto, o que separa um investimento excecional de um projeto medíocre não é apenas a compra do imóvel. " +
    "É a capacidade de identificar assimetrias de mercado e executar o processo sem falhas.",
    {
      x: 0.5, y: 3.75, w: 9, h: 1.4,
      fontFace: FONT_BODY, fontSize: 14, color: "DDDDDD", margin: 0, paraSpaceAfter: 4
    }
  );
}

// ==================== SLIDE 3 - ASSIMETRIA RISCO ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  addLogoCorner(s);
  addCornerFrame(s, C.GOLD);

  addSectionTitle(s, "A Assimetria do Risco", { y: 0.95, h: 0.55 });
  s.addText("Desafios do Investimento Individual", {
    x: 0.5, y: 1.55, w: 9, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 18, color: C.GOLD_DARK, italic: true, margin: 0
  });

  // Headers
  const colW = 4.2, gap = 0.2, startX = 0.7 + 0.7;
  const c1x = 1.0, c2x = 5.4;

  s.addShape(pres.shapes.RECTANGLE, { x: c1x, y: 2.1, w: colW, h: 0.5, fill: { color: C.DARK }, line: { color: C.DARK, width: 0 } });
  s.addText("O Investidor Solitário", {
    x: c1x, y: 2.1, w: colW, h: 0.5,
    fontFace: FONT_BODY, fontSize: 13, color: C.WHITE, bold: true, align: "center", valign: "middle", margin: 0
  });

  s.addShape(pres.shapes.RECTANGLE, { x: c2x, y: 2.1, w: colW, h: 0.5, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
  s.addText("Parceria Somnium Properties", {
    x: c2x, y: 2.1, w: colW, h: 0.5,
    fontFace: FONT_BODY, fontSize: 13, color: C.DARK, bold: true, align: "center", valign: "middle", margin: 0
  });

  // Rows
  const rows = [
    { label: "Fator Tempo", left: "Consumo extremo de tempo em prospeção, negociação e gestão de obras.", right: "Alocação de capital passiva. Esforço nulo ('Mãos-Livres')." },
    { label: "Fator Risco", left: "Decisões frequentemente emocionais e derrapagens financeiras não calculadas.", right: "Decisões blindadas por Matemática Pura (MAO) e matrizes de Stress Tests." },
    { label: "Rede & Execução", left: "Dependência de empreiteiros incertos e falta de poder negocial.", right: "Ecossistema integrado: equipa clínica, gestores de obra e rede de 72 parceiros." }
  ];

  let ry = 2.7;
  const rh = 0.85;
  rows.forEach((r) => {
    // Label on left
    s.addText(r.label, {
      x: 0.3, y: ry, w: 0.65, h: rh,
      fontFace: FONT_BODY, fontSize: 10, color: C.GOLD_DARK, bold: true, valign: "middle", align: "right", margin: 0
    });
    // Left card
    s.addShape(pres.shapes.RECTANGLE, { x: c1x, y: ry, w: colW, h: rh, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 0.75 } });
    s.addText(r.left, {
      x: c1x + 0.15, y: ry, w: colW - 0.3, h: rh,
      fontFace: FONT_BODY, fontSize: 11, color: C.TEXT, align: "center", valign: "middle", margin: 0
    });
    // Right card
    s.addShape(pres.shapes.RECTANGLE, { x: c2x, y: ry, w: colW, h: rh, fill: { color: C.CREAM }, line: { color: C.GOLD, width: 0.75 } });
    s.addText(r.right, {
      x: c2x + 0.15, y: ry, w: colW - 0.3, h: rh,
      fontFace: FONT_BODY, fontSize: 11, color: C.TEXT, align: "center", valign: "middle", margin: 0
    });
    ry += rh + 0.1;
  });
}

// ==================== SLIDE 4 - FILOSOFIA ZERO IMPROVISO ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  addLogoCorner(s);
  addCornerFrame(s, C.GOLD);

  addSectionTitle(s, "A Filosofia \"Zero Improviso\"", { y: 0.95 });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.7, w: 0.6, h: 0.03,
    fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 }
  });

  // Left: visual block (dark card with crest)
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 2.0, w: 4.2, h: 3.0,
    fill: { color: C.DARK }, line: { color: C.GOLD, width: 1 }
  });
  s.addText("Origem Clínica", {
    x: 0.5, y: 2.3, w: 4.2, h: 0.5,
    fontFace: FONT_HEAD, fontSize: 22, color: C.GOLD, bold: true, italic: true, align: "center", margin: 0
  });
  s.addText("· · ·", {
    x: 0.5, y: 2.85, w: 4.2, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 28, color: C.GOLD, align: "center", margin: 0
  });
  s.addText("Saúde", {
    x: 0.5, y: 3.3, w: 4.2, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 18, color: C.WHITE, italic: true, align: "center", margin: 0
  });
  s.addText("+", {
    x: 0.5, y: 3.7, w: 4.2, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 24, color: C.GOLD, align: "center", margin: 0
  });
  s.addText("Imobiliário", {
    x: 0.5, y: 4.1, w: 4.2, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 18, color: C.WHITE, italic: true, align: "center", margin: 0
  });
  s.addText("Rigor + Disciplina + Protocolo", {
    x: 0.5, y: 4.6, w: 4.2, h: 0.35,
    fontFace: FONT_BODY, fontSize: 11, color: C.GOLD_LIGHT, align: "center", charSpacing: 2, margin: 0
  });

  // Right: 3 points
  const pts = [
    { t: "A Origem Clínica", d: "Fundada por profissionais com background na área da Saúde." },
    { t: "O Paralelismo", d: "Transpomos a cultura vital de protocolos rigorosos, registo meticuloso e atenção ao detalhe da Saúde para a gestão de ativos." },
    { t: "O Resultado", d: "Cada passo do investimento é dado com uma metodologia padrão. Todas as decisões são baseadas em dados e simulações. Nada é deixado ao acaso." }
  ];
  let py = 2.0;
  pts.forEach((p) => {
    s.addShape(pres.shapes.OVAL, {
      x: 5.0, y: py + 0.05, w: 0.3, h: 0.3,
      fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 }
    });
    s.addText(p.t, {
      x: 5.45, y: py, w: 4.2, h: 0.4,
      fontFace: FONT_BODY, fontSize: 14, color: C.DARK, bold: true, margin: 0
    });
    s.addText(p.d, {
      x: 5.45, y: py + 0.4, w: 4.2, h: 0.65,
      fontFace: FONT_BODY, fontSize: 11, color: C.TEXT, margin: 0
    });
    py += 1.05;
  });
}

// ==================== SLIDE 5 - ADN ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  addLogoCorner(s);
  addCornerFrame(s, C.GOLD);

  addSectionTitle(s, "O Nosso ADN e Estrutura Institucional", { y: 0.95 });

  // Top row: 3 leadership cards
  const topY = 1.9;
  const topH = 1.2;
  const topCards = [
    { t: "Alexandre Mendes & João Abreu", r: "Fundadores", d: "Gestão clínica do investimento." },
    { t: "Luís", r: "Gestor de Obra", d: "\"Know how\" sobre construção civil, licenciamento urbanístico e projetos." },
    { t: "João", r: "Consultor Estratégico", d: "Portfólio internacional e visão macro de mercado." }
  ];
  const topW = 3.0, topGap = 0.15;
  const topStart = (W - (topW * 3 + topGap * 2)) / 2;
  topCards.forEach((c, i) => {
    const x = topStart + i * (topW + topGap);
    s.addShape(pres.shapes.RECTANGLE, { x, y: topY, w: topW, h: topH, fill: { color: C.DARK }, line: { color: C.GOLD, width: 1 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y: topY, w: topW, h: 0.04, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
    s.addText(c.t, {
      x: x + 0.15, y: topY + 0.15, w: topW - 0.3, h: 0.4,
      fontFace: FONT_BODY, fontSize: 12, color: C.WHITE, bold: true, align: "center", margin: 0
    });
    s.addText(c.r, {
      x: x + 0.15, y: topY + 0.5, w: topW - 0.3, h: 0.3,
      fontFace: FONT_BODY, fontSize: 10, color: C.GOLD, italic: true, align: "center", margin: 0
    });
    s.addText(c.d, {
      x: x + 0.15, y: topY + 0.8, w: topW - 0.3, h: 0.4,
      fontFace: FONT_BODY, fontSize: 10, color: "CCCCCC", align: "center", margin: 0
    });
  });

  // Connector vertical line
  s.addShape(pres.shapes.RECTANGLE, {
    x: W / 2 - 0.01, y: topY + topH, w: 0.02, h: 0.3,
    fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 }
  });

  // Bottom row: 4 dept cards
  const botY = topY + topH + 0.3;
  const botH = 1.5;
  const depts = [
    { t: "Administração & Financeiro", d: "Controlo de capital e faturas." },
    { t: "Departamento Comercial", d: "Gestão do pipeline e rede de 72 parceiros." },
    { t: "Departamento de Obra", d: "Liderança técnica e execução." },
    { t: "Formação", d: "Atualização de SOPs e análise de mercado." }
  ];
  const botW = 2.15, botGap = 0.12;
  const botStart = (W - (botW * 4 + botGap * 3)) / 2;
  depts.forEach((d, i) => {
    const x = botStart + i * (botW + botGap);
    s.addShape(pres.shapes.RECTANGLE, { x, y: botY, w: botW, h: botH, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
    // Top accent bar gold
    s.addShape(pres.shapes.RECTANGLE, { x, y: botY, w: botW, h: 0.06, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
    s.addText(d.t, {
      x: x + 0.15, y: botY + 0.25, w: botW - 0.3, h: 0.6,
      fontFace: FONT_BODY, fontSize: 12, color: C.DARK, bold: true, align: "center", margin: 0
    });
    s.addText(d.d, {
      x: x + 0.15, y: botY + 0.85, w: botW - 0.3, h: 0.6,
      fontFace: FONT_BODY, fontSize: 10, color: C.TEXT, align: "center", margin: 0
    });
  });
}

// ==================== SLIDE 6 - SOPs ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  addLogoCorner(s);
  addCornerFrame(s, C.GOLD);

  addPilarTag(s, "Pilar I: Segurança & Rigor");
  addSectionTitle(s, "O Motor da Segurança: Procedimentos Operacionais Padrão (SOPs)", { y: 1.2, size: 24 });

  // Left: SOP library card (dark)
  const lx = 0.5, ly = 2.3, lw = 4.6, lh = 2.6;
  s.addShape(pres.shapes.RECTANGLE, { x: lx, y: ly, w: lw, h: lh, fill: { color: C.DARK }, line: { color: C.GOLD, width: 1 } });
  s.addText("Biblioteca SOP", {
    x: lx + 0.2, y: ly + 0.15, w: lw - 0.4, h: 0.35,
    fontFace: FONT_BODY, fontSize: 11, color: C.GOLD, bold: true, charSpacing: 3, margin: 0
  });
  s.addShape(pres.shapes.RECTANGLE, { x: lx + 0.2, y: ly + 0.55, w: 0.5, h: 0.02, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
  const sops = [
    "SOP 1:  Pesquisa de Negócios",
    "SOP 2:  Onboarding Investidores",
    "SOP 3:  Prospeção de Projetos",
    "SOP 4:  Compra e Negociação"
  ];
  sops.forEach((sop, i) => {
    const yy = ly + 0.8 + i * 0.42;
    s.addShape(pres.shapes.RECTANGLE, { x: lx + 0.3, y: yy, w: lw - 0.6, h: 0.35, fill: { color: C.DARK_2 }, line: { color: C.GOLD_DARK, width: 0.5 } });
    s.addText(sop, {
      x: lx + 0.45, y: yy, w: lw - 0.9, h: 0.35,
      fontFace: FONT_BODY, fontSize: 11, color: C.WHITE, bold: true, valign: "middle", margin: 0
    });
  });

  // Right: 3 highlights
  const highlights = [
    { t: "Metodologia Aprovada", d: "Cada operação obedece a um SOP específico (da prospeção à venda)." },
    { t: "Auditoria Contínua", d: "Processos revistos e otimizados a cada projeto ou nova variável de mercado." },
    { t: "Rastreabilidade", d: "Garantia de qualidade e minimização absoluta do erro humano." }
  ];
  const rx = 5.4;
  let ry = 2.3;
  const rh = 0.85;
  highlights.forEach((h) => {
    s.addShape(pres.shapes.RECTANGLE, { x: rx, y: ry, w: 0.06, h: rh, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
    s.addText(h.t, {
      x: rx + 0.2, y: ry, w: 4.0, h: 0.35,
      fontFace: FONT_BODY, fontSize: 13, color: C.DARK, bold: true, margin: 0
    });
    s.addText(h.d, {
      x: rx + 0.2, y: ry + 0.35, w: 4.0, h: 0.55,
      fontFace: FONT_BODY, fontSize: 11, color: C.TEXT, margin: 0
    });
    ry += rh + 0.05;
  });
}

// ==================== SLIDE 7 - SOP 4 FUNIL ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  addLogoCorner(s);
  addCornerFrame(s, C.GOLD);

  addPilarTag(s, "Pilar I: Segurança & Rigor");
  addSectionTitle(s, "A Ciência da Compra (SOP 4)", { y: 1.2 });

  // Funnel: 3 trapezoid-like rectangles narrowing
  const cx = W / 2;
  const t1 = { y: 2.1, w: 6.5, h: 1.05, label: "Validação Cruzada Múltipla", desc: "Identificação de mínimo 5 comparáveis. Cruzamento de dados com ferramentas especializadas, parceiros locais e avaliadores." };
  const t2 = { y: 3.2, w: 5.2, h: 1.0, label: "Ajuste Matemático", desc: "Ajustes automáticos baseados em áreas, localização (±10%), idade e conservação." };
  const t3 = { y: 4.25, w: 4.0, h: 0.7, label: "MAO Validado", desc: "Maximum Allowable Offer aprovada para execução." };

  [t1, t2, t3].forEach((t, i) => {
    const x = cx - t.w / 2;
    const fillColor = i === 2 ? C.GOLD : C.WHITE;
    const lineColor = i === 2 ? C.GOLD_DARK : C.GOLD;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: t.y, w: t.w, h: t.h,
      fill: { color: fillColor }, line: { color: lineColor, width: 1.5 }
    });
    s.addText(t.label, {
      x, y: t.y + 0.1, w: t.w, h: 0.35,
      fontFace: FONT_HEAD, fontSize: i === 2 ? 16 : 16, color: i === 2 ? C.DARK : C.GOLD_DARK, bold: true, italic: i !== 2, align: "center", margin: 0
    });
    s.addText(t.desc, {
      x: x + 0.3, y: t.y + 0.45, w: t.w - 0.6, h: t.h - 0.5,
      fontFace: FONT_BODY, fontSize: 10, color: i === 2 ? C.DARK : C.TEXT, align: "center", valign: "middle", margin: 0
    });
  });
}

// ==================== SLIDE 8 - STRESS TESTS ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  addLogoCorner(s);
  addCornerFrame(s, C.GOLD);

  addPilarTag(s, "Pilar I: Segurança & Rigor");
  addSectionTitle(s, "A Nossa Obsessão com o Risco: Stress Tests", { y: 1.2 });

  const cards = [
    { t: "Cenário Base", d: "O plano ideal e conservador de rentabilidade.", c: C.GREEN, label: "0%" },
    { t: "Stress Test Moderado", d: "-10% VVR  |  +10% Custo Obra  |  +3 Meses Retenção", c: C.YELLOW, label: "-10%" },
    { t: "Stress Test Severo", d: "-20% VVR  |  +20% Custo Obra  |  +6 Meses Retenção", c: C.RED, label: "-20%" }
  ];
  const cy = 2.0;
  const ch = 2.0;
  const cw = 2.85;
  const cgap = 0.2;
  const cstart = (W - (cw * 3 + cgap * 2)) / 2;
  cards.forEach((c, i) => {
    const x = cstart + i * (cw + cgap);
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: ch, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
    // colored top bar
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: 0.15, fill: { color: c.c }, line: { color: c.c, width: 0 } });
    // big label
    s.addText(c.label, {
      x, y: cy + 0.3, w: cw, h: 0.7,
      fontFace: FONT_HEAD, fontSize: 38, color: c.c, bold: true, align: "center", margin: 0
    });
    s.addText(c.t, {
      x: x + 0.15, y: cy + 1.05, w: cw - 0.3, h: 0.35,
      fontFace: FONT_HEAD, fontSize: 14, color: C.DARK, bold: true, align: "center", margin: 0
    });
    s.addText(c.d, {
      x: x + 0.2, y: cy + 1.4, w: cw - 0.4, h: 0.6,
      fontFace: FONT_BODY, fontSize: 10, color: C.TEXT, align: "center", margin: 0
    });
  });

  // Rules box
  const ry = 4.25, rh = 1.0;
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: ry, w: 9, h: rh, fill: { color: C.DARK }, line: { color: C.GOLD, width: 1 } });
  s.addText("As Regras do Flipper Disciplinado", {
    x: 0.5, y: ry + 0.1, w: 9, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 14, color: C.GOLD, bold: true, italic: true, align: "center", margin: 0
  });
  s.addText(
    "1. Incorporar sempre 10 a 20% de contingência de obras no cálculo inicial.    " +
    "2. Nunca avançar para um negócio que só é rentável no Cenário Base.    " +
    "3. O projeto tem de poder ser convertido em arrendamento viável.",
    {
      x: 0.6, y: ry + 0.42, w: 8.8, h: 0.55,
      fontFace: FONT_BODY, fontSize: 10, color: C.WHITE, align: "center", margin: 0
    }
  );
}

// ==================== SLIDE 9 - VENDA CIRURGICA ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  addLogoCorner(s);
  addCornerFrame(s, C.GOLD);

  addPilarTag(s, "Pilar II: Rentabilidade");
  addSectionTitle(s, "Tática de Venda Cirúrgica: Plano Estratégico de Venda", { y: 1.2, size: 24 });

  const phases = [
    { n: "1", t: "Preparação Premium", d: "Home Staging, Sessões fotográficas profissionais, Tours 3D/360º e levantamento de plantas rigorosas." },
    { n: "2", t: "Exclusividade Pensada", d: "Atribuição do ativo ao consultor que trouxe o negócio em caso de referência durante fase de obra + 15 dias a 1 mês após conclusão." },
    { n: "3", t: "Acelerador de Venda", d: "Após 60 dias (limite do Stress Test retenção +6 meses): Ativação de Top Performer da zona para escoar imóvel do mercado." }
  ];
  const py = 2.1, ph = 3.0, pw = 2.85, pgap = 0.2;
  const pstart = (W - (pw * 3 + pgap * 2)) / 2;
  phases.forEach((p, i) => {
    const x = pstart + i * (pw + pgap);
    s.addShape(pres.shapes.RECTANGLE, { x, y: py, w: pw, h: ph, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y: py, w: pw, h: 0.06, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
    s.addText(p.n, {
      x, y: py + 0.25, w: pw, h: 1.0,
      fontFace: FONT_HEAD, fontSize: 80, color: C.GOLD, bold: true, align: "center", margin: 0
    });
    s.addText("Fase " + p.n, {
      x: x + 0.15, y: py + 1.3, w: pw - 0.3, h: 0.3,
      fontFace: FONT_BODY, fontSize: 10, color: C.GOLD_DARK, bold: true, charSpacing: 2, align: "center", margin: 0
    });
    s.addText(p.t, {
      x: x + 0.15, y: py + 1.6, w: pw - 0.3, h: 0.4,
      fontFace: FONT_HEAD, fontSize: 16, color: C.DARK, bold: true, align: "center", margin: 0
    });
    s.addText(p.d, {
      x: x + 0.2, y: py + 2.05, w: pw - 0.4, h: 0.85,
      fontFace: FONT_BODY, fontSize: 10, color: C.TEXT, align: "center", margin: 0
    });
    // arrow between
    if (i < 2) {
      const arrowX = x + pw + 0.02;
      s.addText("›", {
        x: arrowX, y: py + ph / 2 - 0.25, w: 0.16, h: 0.5,
        fontFace: FONT_HEAD, fontSize: 28, color: C.GOLD, bold: true, align: "center", valign: "middle", margin: 0
      });
    }
  });
}

// ==================== SLIDE 10 - PLANO B ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  addLogoCorner(s);
  addCornerFrame(s, C.GOLD);

  addPilarTag(s, "Pilar II: Rentabilidade");
  addSectionTitle(s, "O Plano B: A Rede de Segurança Absoluta", { y: 1.2 });

  // Left: chart visual
  const gx = 0.6, gy = 2.1, gw = 4.5, gh = 3.0;
  s.addShape(pres.shapes.RECTANGLE, { x: gx, y: gy, w: gw, h: gh, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });

  // Y axis label
  s.addText("ROI / Preço", {
    x: gx + 0.05, y: gy + 0.1, w: 1.0, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, color: C.TEXT_MUTED, italic: true, margin: 0
  });
  s.addText("Tempo →", {
    x: gx + gw - 1.1, y: gy + gh - 0.35, w: 1.0, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, color: C.TEXT_MUTED, italic: true, align: "right", margin: 0
  });

  // Axes
  s.addShape(pres.shapes.LINE, { x: gx + 0.5, y: gy + 0.4, w: 0, h: gh - 0.8, line: { color: C.TEXT_MUTED, width: 1 } });
  s.addShape(pres.shapes.LINE, { x: gx + 0.5, y: gy + gh - 0.4, w: gw - 0.7, h: 0, line: { color: C.TEXT_MUTED, width: 1 } });

  // Red dashed line (limit)
  const redY = gy + 1.85;
  s.addShape(pres.shapes.LINE, {
    x: gx + 0.5, y: redY, w: gw - 0.7, h: 0,
    line: { color: C.RED, width: 1.5, dashType: "dash" }
  });
  // Red label OUTSIDE the chart area, on the right of the dashed line
  s.addText("Limite de Corte", {
    x: gx + gw - 1.55, y: redY - 0.28, w: 1.5, h: 0.25,
    fontFace: FONT_BODY, fontSize: 9, color: C.RED, bold: true, italic: true, align: "right", margin: 0
  });
  s.addText("(Linha Vermelha)", {
    x: gx + gw - 1.55, y: redY - 0.06, w: 1.5, h: 0.25,
    fontFace: FONT_BODY, fontSize: 8, color: C.RED, italic: true, align: "right", margin: 0
  });

  // Diagonal trend line (sale zone) — bottom-left to top-right via flipV
  s.addShape(pres.shapes.LINE, {
    x: gx + 0.6, y: gy + 0.5, w: gw - 0.9, h: gh - 1.1,
    line: { color: C.DARK, width: 2.5 }, flipV: true
  });

  // Zone labels
  s.addText("Zona de Venda", {
    x: gx + 1.7, y: gy + 0.7, w: 2.5, h: 0.3,
    fontFace: FONT_BODY, fontSize: 11, color: C.DARK, bold: true, italic: true, margin: 0
  });
  s.addText("Pivot para Arrendamento (Plano B)", {
    x: gx + 0.7, y: redY + 0.55, w: 3.6, h: 0.3,
    fontFace: FONT_BODY, fontSize: 11, color: C.GOLD_DARK, bold: true, italic: true, margin: 0
  });

  // Right: 3 points
  const pts = [
    { t: "O Limite de Corte", d: "Registamos o VVR mínimo aceitável baseado no teste de stress severo (-20%)." },
    { t: "A Linha Vermelha Somnium", d: "Se para efetuar a venda for necessário furar o chão do nosso ROI mínimo exigido, o procedimento de venda é automaticamente suspenso." },
    { t: "A Conversão", d: "Executamos o pivot imediato do ativo para o mercado de Arrendamento (validado à priori)." }
  ];
  const px = 5.4;
  let py = 2.1;
  pts.forEach((p) => {
    s.addText("✓", {
      x: px, y: py, w: 0.3, h: 0.4,
      fontFace: FONT_BODY, fontSize: 18, color: C.GOLD, bold: true, margin: 0
    });
    s.addText(p.t, {
      x: px + 0.35, y: py, w: 4.0, h: 0.35,
      fontFace: FONT_BODY, fontSize: 13, color: C.DARK, bold: true, margin: 0
    });
    s.addText(p.d, {
      x: px + 0.35, y: py + 0.35, w: 4.0, h: 0.65,
      fontFace: FONT_BODY, fontSize: 10, color: C.TEXT, margin: 0
    });
    py += 1.05;
  });
}

// ==================== SLIDE 11 - MAOS LIVRES ====================
{
  const s = pres.addSlide();
  s.background = { color: C.OFFWHITE };
  addLogoCorner(s);
  addCornerFrame(s, C.GOLD);

  addPilarTag(s, "Pilar III: Transparência Total");
  addSectionTitle(s, "Ecossistema de Investimento \"Mãos-Livres\"", { y: 1.2 });

  const cards = [
    { n: "1", t: "Auditoria em Tempo Real", d: "Acesso vitalício a pasta cifrada. Visualização imediata de faturas, contabilidade e documentos legais." },
    { n: "2", t: "Comunicação Sem Ruído", d: "Canal dedicado em exclusivo ao seu negócio. Atualizações diárias diretas com a equipa de liderança. Sem e-mails perdidos." },
    { n: "3", t: "Relatórios Visuais de Obra", d: "Carregamento semanal de fotografias e vídeos em alta resolução. Acompanhe a evolução ao milímetro, sem visitar o estaleiro." }
  ];
  const cy = 2.1, ch = 3.1, cw = 2.85, cgap = 0.2;
  const cstart = (W - (cw * 3 + cgap * 2)) / 2;
  cards.forEach((c, i) => {
    const x = cstart + i * (cw + cgap);
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: ch, fill: { color: C.WHITE }, line: { color: C.BORDER, width: 1 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: 0.06, fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 } });
    s.addText(c.n, {
      x: x + 0.2, y: cy + 0.25, w: 1.0, h: 0.9,
      fontFace: FONT_HEAD, fontSize: 60, color: C.GOLD, bold: true, margin: 0
    });
    s.addText(c.t, {
      x: x + 0.2, y: cy + 1.35, w: cw - 0.4, h: 0.55,
      fontFace: FONT_HEAD, fontSize: 16, color: C.DARK, bold: true, margin: 0
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.2, y: cy + 1.95, w: 0.4, h: 0.025,
      fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 }
    });
    s.addText(c.d, {
      x: x + 0.2, y: cy + 2.05, w: cw - 0.4, h: 0.95,
      fontFace: FONT_BODY, fontSize: 11, color: C.TEXT, margin: 0
    });
  });
}

// ==================== SLIDE 12 - ALINHAMENTO 60/40 ====================
{
  const s = pres.addSlide();
  s.background = { color: C.DARK };
  addLogoCorner(s, true);
  addCornerFrame(s, C.GOLD);

  s.addText("Alinhamento Total de Interesses", {
    x: 0.5, y: 0.95, w: 9, h: 0.7,
    fontFace: FONT_HEAD, fontSize: 32, color: C.GOLD, bold: true, align: "center", margin: 0
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: (W - 1.2) / 2, y: 1.7, w: 1.2, h: 0.025,
    fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 }
  });

  // Two columns
  const colY = 2.1;
  const colH = 1.85;

  // 60% Investidor (left)
  const lcx = 0.8, lcw = 4.0;
  s.addShape(pres.shapes.RECTANGLE, { x: lcx, y: colY, w: lcw, h: colH, fill: { color: C.DARK_2 }, line: { color: C.GOLD, width: 1.5 } });
  s.addText("60%", {
    x: lcx, y: colY + 0.15, w: lcw, h: 0.9,
    fontFace: FONT_HEAD, fontSize: 64, color: C.GOLD, bold: true, align: "center", margin: 0
  });
  s.addText("Investidor", {
    x: lcx, y: colY + 1.05, w: lcw, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 18, color: C.WHITE, bold: true, align: "center", margin: 0
  });
  s.addText("(Alocação de Capital)", {
    x: lcx, y: colY + 1.42, w: lcw, h: 0.35,
    fontFace: FONT_BODY, fontSize: 12, color: C.GOLD_LIGHT, italic: true, align: "center", margin: 0
  });

  // 40% Somnium (right)
  const rcx = 5.2, rcw = 4.0;
  s.addShape(pres.shapes.RECTANGLE, { x: rcx, y: colY, w: rcw, h: colH, fill: { color: C.DARK_2 }, line: { color: C.GOLD, width: 1.5 } });
  s.addText("40%", {
    x: rcx, y: colY + 0.15, w: rcw, h: 0.9,
    fontFace: FONT_HEAD, fontSize: 64, color: C.GOLD, bold: true, align: "center", margin: 0
  });
  s.addText("Somnium Properties", {
    x: rcx, y: colY + 1.05, w: rcw, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 18, color: C.WHITE, bold: true, align: "center", margin: 0
  });
  s.addText("(Gestão Operacional, Execução, Risco Técnico)", {
    x: rcx, y: colY + 1.42, w: rcw, h: 0.35,
    fontFace: FONT_BODY, fontSize: 11, color: C.GOLD_LIGHT, italic: true, align: "center", margin: 0
  });

  // Co-investment box at bottom
  const by = 4.2, bh = 1.05;
  s.addShape(pres.shapes.RECTANGLE, { x: 0.6, y: by, w: 8.8, h: bh, fill: { color: C.DARK_3 }, line: { color: C.GOLD, width: 1 } });
  s.addText("O Sinal de Confiança Absoluta: Co-Investimento", {
    x: 0.6, y: by + 0.1, w: 8.8, h: 0.35,
    fontFace: FONT_HEAD, fontSize: 16, color: C.GOLD, bold: true, italic: true, align: "center", margin: 0
  });
  s.addText(
    "A Somnium Properties investe o seu próprio capital nos projetos que estrutura. Apenas abrimos espaço a parceiros após a nossa própria validação financeira.",
    {
      x: 0.8, y: by + 0.45, w: 8.4, h: 0.55,
      fontFace: FONT_BODY, fontSize: 12, color: C.WHITE, align: "center", margin: 0
    }
  );
}

// ==================== SLIDE 13 - RESUMO ====================
{
  const s = pres.addSlide();
  s.background = { color: C.DARK };
  addLogoCorner(s, true);
  addCornerFrame(s, C.GOLD);

  s.addText("A Oportunidade Somnium", {
    x: 0.5, y: 0.95, w: 9, h: 0.6,
    fontFace: FONT_HEAD, fontSize: 32, color: C.WHITE, bold: true, align: "center", margin: 0
  });
  s.addText("Resumo", {
    x: 0.5, y: 1.55, w: 9, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 16, color: C.GOLD, italic: true, align: "center", margin: 0
  });

  const cards = [
    { n: "1", t: "Segurança", st: "(Zero Improviso)", d: "Matemática pura na compra (MAO validado) e matrizes de Stress Test severo em todos os ativos." },
    { n: "2", t: "Rentabilidade", st: "Otimizada", d: "Proteção do ROI com estratégias de saída táticas pré-definidas (SOP 10)." },
    { n: "3", t: "Transparência", st: "Institucional", d: "Acesso total aos números e ao terreno de forma digital e assíncrona. Controle absoluto, esforço nulo." }
  ];
  const cy = 2.3, ch = 2.85, cw = 2.85, cgap = 0.2;
  const cstart = (W - (cw * 3 + cgap * 2)) / 2;
  cards.forEach((c, i) => {
    const x = cstart + i * (cw + cgap);
    s.addShape(pres.shapes.RECTANGLE, { x, y: cy, w: cw, h: ch, fill: { color: C.DARK_2 }, line: { color: C.GOLD, width: 1 } });
    s.addText(c.n, {
      x, y: cy + 0.2, w: cw, h: 1.1,
      fontFace: FONT_HEAD, fontSize: 72, color: C.GOLD, bold: true, align: "center", margin: 0
    });
    s.addText(c.t, {
      x: x + 0.15, y: cy + 1.3, w: cw - 0.3, h: 0.4,
      fontFace: FONT_HEAD, fontSize: 18, color: C.WHITE, bold: true, align: "center", margin: 0
    });
    s.addText(c.st, {
      x: x + 0.15, y: cy + 1.7, w: cw - 0.3, h: 0.3,
      fontFace: FONT_HEAD, fontSize: 13, color: C.GOLD_LIGHT, italic: true, align: "center", margin: 0
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + (cw - 0.4) / 2, y: cy + 2.05, w: 0.4, h: 0.02,
      fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 }
    });
    s.addText(c.d, {
      x: x + 0.2, y: cy + 2.15, w: cw - 0.4, h: 0.65,
      fontFace: FONT_BODY, fontSize: 10.5, color: "DDDDDD", align: "center", margin: 0
    });
  });
}

// ==================== SLIDE 14 - CTA ====================
{
  const s = pres.addSlide();
  s.background = { color: C.DARK };
  addCornerFrame(s, C.GOLD);

  addLogoCenter(s, 0.55, 1.6);

  s.addText("Construa um Portfólio", {
    x: 0.5, y: 1.85, w: 9, h: 0.7,
    fontFace: FONT_HEAD, fontSize: 40, color: C.WHITE, bold: true, align: "center", margin: 0
  });
  s.addText("Sem Dores de Cabeça.", {
    x: 0.5, y: 2.55, w: 9, h: 0.7,
    fontFace: FONT_HEAD, fontSize: 40, color: C.GOLD, bold: true, italic: true, align: "center", margin: 0
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: (W - 1.2) / 2, y: 3.4, w: 1.2, h: 0.025,
    fill: { color: C.GOLD }, line: { color: C.GOLD, width: 0 }
  });

  s.addText(
    "Junte-se ao nosso grupo restrito de investidores passivos\ne deixe o rigor clínico proteger o seu capital.",
    {
      x: 0.5, y: 3.55, w: 9, h: 0.8,
      fontFace: FONT_BODY, fontSize: 14, color: "DDDDDD", italic: true, align: "center", margin: 0
    }
  );

  // Footer separator
  s.addShape(pres.shapes.RECTANGLE, {
    x: 1.5, y: 4.85, w: 7, h: 0.015,
    fill: { color: C.GOLD_DARK }, line: { color: C.GOLD_DARK, width: 0 }
  });

  s.addText("Alexandre Mendes & João Abreu    •    geral@somniumproperties.pt    •    www.somniumproperties.pt", {
    x: 0.5, y: 5.0, w: 9, h: 0.4,
    fontFace: FONT_BODY, fontSize: 11, color: C.GOLD_LIGHT, align: "center", charSpacing: 1, margin: 0
  });
}

pres.writeFile({ fileName: OUT }).then((file) => {
  console.log("WROTE:", file);
});
