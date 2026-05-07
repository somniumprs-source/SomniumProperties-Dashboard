// Apresentação Investidores Marco 2026 — recriado com layout dos
// PDFs da dashboard (ver src/db/pdfImovelDocs.js _drawCover/newPage).
const pptxgen = require("pptxgenjs");

const LOGO_DARK = "/home/user/SomniumProperties-Dashboard/public/logo-dark.png";

// Paleta da dashboard (igual ao C em pdfImovelDocs.js)
const C = {
  gold: "C9A84C",
  black: "0D0D0D",
  white: "FFFFFF",
  bg: "F7F6F2",
  body: "2A2A2A",
  muted: "888888",
  border: "E0DDD5",
  light: "F0EFE9",
  totalBg: "F5F3EE",
  green: "2D6A2D",
  red: "8B2020",
};

const FONT_H = "Helvetica";
const FONT_B = "Helvetica";

const W = 13.333;
const H = 7.5;
const ML = 0.55;
const MR = 0.55;
const CW = W - ML - MR;

// 6pt em PDF a 595pt = 1% da pagina A4. Em widescreen 7.5" usamos 0.075"
const BAR = 0.075;
// 1.5pt rule = 0.02"; 0.5pt rule = 0.007"
const RULE_THICK = 0.02;
const RULE_THIN = 0.007;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Somnium Properties";
pres.title = "Apresentação a Investidores — Marco 2026";
pres.company = "Somnium Properties";

// ── helpers ───────────────────────────────────────────────────
function bg(s, color = C.bg) { s.background = { color }; }

function topBars(s) {
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: BAR, fill: { color: C.gold }, line: { type: "none" } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: H - BAR, w: W, h: BAR, fill: { color: C.gold }, line: { type: "none" } });
}

function contentChrome(s, eyebrow, title) {
  // Logo top-left (igual ao newPage style 'investor': height 16pt no original = 0.22" approx)
  s.addImage({ path: LOGO_DARK, x: ML, y: 0.3, h: 0.32, w: 0.85 });
  // Eyebrow (titulo do documento) ao lado direito do logo
  if (eyebrow) {
    s.addText(eyebrow.toUpperCase(), {
      x: ML + 1.0, y: 0.36, w: CW - 1.0, h: 0.22,
      fontSize: 8, fontFace: FONT_B, color: C.muted,
      charSpacing: 4, align: "right", margin: 0,
    });
  }
  // Regua gold 1.5pt logo abaixo do header (y=45 em A4 → y=0.62)
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: 0.7, w: CW, h: RULE_THICK,
    fill: { color: C.gold }, line: { type: "none" },
  });
  // Regua gold 0.5pt acima do footer (y=PH-45 em A4 → y=H-0.62)
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: H - 0.55, w: CW, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });
  // Footer
  s.addText(`Confidencial · Somnium Properties · Marco 2026`, {
    x: ML, y: H - 0.43, w: CW, h: 0.2,
    fontSize: 7, fontFace: FONT_B, color: C.muted,
    align: "center", margin: 0, charSpacing: 1.5,
  });
  // Titulo da slide
  if (title) {
    s.addText(title, {
      x: ML, y: 0.95, w: CW, h: 0.65,
      fontSize: 24, fontFace: FONT_H, color: C.body, bold: true, margin: 0,
    });
  }
}

function bullets(items, color) {
  return items.map((t, i) => ({
    text: t,
    options: {
      bullet: { code: "25B8" },
      color: color || C.body,
      breakLine: i < items.length - 1,
      paraSpaceAfter: 4,
    },
  }));
}

// Cartao com header colorido + corpo cream (estilo dos blocos
// "PONTOS FORTES/FRACOS/RISCOS" do PDF)
function cardWithHeader(s, { x, y, w, h, label, labelColor, items, num }) {
  // Corpo cream com border
  s.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h, fill: { color: C.light },
    line: { color: C.border, width: 0.5 },
  });
  // Header colorido
  const headerH = 0.32;
  s.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h: headerH, fill: { color: labelColor || C.black }, line: { type: "none" },
  });
  if (num) {
    s.addText(num, {
      x: x + 0.15, y, w: 0.4, h: headerH,
      fontSize: 12, fontFace: FONT_H, bold: true, color: C.gold,
      valign: "middle", margin: 0,
    });
  }
  s.addText(label, {
    x: x + (num ? 0.45 : 0.2), y, w: w - (num ? 0.55 : 0.3), h: headerH,
    fontSize: 9, fontFace: FONT_B, bold: true, color: C.white,
    charSpacing: 2, valign: "middle", margin: 0,
  });
  if (items && items.length) {
    s.addText(bullets(items, C.body), {
      x: x + 0.2, y: y + headerH + 0.15, w: w - 0.4, h: h - headerH - 0.3,
      fontSize: 10, fontFace: FONT_B, color: C.body, margin: 0, paraSpaceAfter: 4,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// SLIDE 1 — CAPA (igual ao _drawCover do pdfImovelDocs.js)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);

  // Logo centrado horizontalmente — bloco vertical centrado
  const LW = 5.0;
  const LH = LW / (1516 / 614);
  const blockTop = (H - (LH + 0.4 + 0.04 + 0.35 + 1.0 + 0.2 + 0.3 + 0.25 + 0.15 + 0.05 + 0.2 + 0.18)) / 2;
  s.addImage({ path: LOGO_DARK, x: (W - LW) / 2, y: blockTop, w: LW, h: LH });

  // Accent rule (60x1.5pt → 0.83" x 0.02")
  const accent1Y = blockTop + LH + 0.4;
  s.addShape(pres.shapes.RECTANGLE, {
    x: W / 2 - 0.42, y: accent1Y, w: 0.84, h: RULE_THICK,
    fill: { color: C.gold }, line: { type: "none" },
  });

  // Titulo
  const titleY = accent1Y + 0.04 + 0.35;
  s.addText("Investimento e Gestão de Ativos", {
    x: ML, y: titleY, w: CW, h: 0.6,
    fontSize: 28, fontFace: FONT_H, bold: true, color: C.body,
    align: "center", margin: 0,
  });

  // Subtitulo gold uppercase com character spacing
  const subY = titleY + 0.6 + 0.15;
  s.addText("RIGOR CLÍNICO  ·  TRANSPARÊNCIA TOTAL  ·  RENTABILIDADE", {
    x: ML, y: subY, w: CW, h: 0.3,
    fontSize: 11, fontFace: FONT_B, color: C.gold,
    align: "center", charSpacing: 4, margin: 0,
  });

  // Tagline muted
  const tagY = subY + 0.3 + 0.1;
  s.addText("Uma abordagem de 'Zero Improviso' ao investimento imobiliário · Coimbra · Portugal", {
    x: ML, y: tagY, w: CW, h: 0.25,
    fontSize: 11, fontFace: FONT_B, italic: true, color: C.muted,
    align: "center", margin: 0,
  });

  // Long thin gold rule (CW-160 = CW-2.22")
  const accent2Y = tagY + 0.25 + 0.25;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML + 1.5, y: accent2Y, w: CW - 3.0, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });

  // Data
  s.addText("Preparado para Investidores Privados  ·  Marco 2026", {
    x: ML, y: accent2Y + 0.15, w: CW, h: 0.25,
    fontSize: 10, fontFace: FONT_B, color: C.muted,
    align: "center", margin: 0,
  });

  // Footer da capa
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: H - 0.55, w: CW, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("Somnium Properties · Investimento Imobiliário", {
    x: ML, y: H - 0.45, w: CW, h: 0.2,
    fontSize: 8, fontFace: FONT_B, color: C.muted, align: "center", margin: 0,
  });
  s.addText("Documento Confidencial · Marco 2026", {
    x: ML, y: H - 0.27, w: CW, h: 0.2,
    fontSize: 8, fontFace: FONT_B, color: C.muted, align: "center", margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 2 — O VALOR ESTÁ NA EXECUÇÃO
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "Apresentação a Investidores", "O valor não está apenas no ativo. Está na execução.");

  // Bloco grande de narrativa central (cream com border + accent gold à esquerda)
  const bx = ML, by = 1.9, bw = CW, bh = 4.6;
  s.addShape(pres.shapes.RECTANGLE, {
    x: bx, y: by, w: bw, h: bh, fill: { color: C.light },
    line: { color: C.border, width: 0.5 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: bx, y: by, w: 0.06, h: bh,
    fill: { color: C.gold }, line: { type: "none" },
  });

  s.addText("A nossa tese", {
    x: bx + 0.4, y: by + 0.35, w: bw - 0.8, h: 0.3,
    fontSize: 9, fontFace: FONT_B, bold: true, color: C.gold, charSpacing: 3, margin: 0,
  });

  s.addText([
    { text: "O imobiliário continua a ser uma das formas mais consistentes de criação de património.", options: { fontSize: 18, fontFace: FONT_H, bold: true, color: C.body, breakLine: true, paraSpaceAfter: 12 } },
    { text: "No entanto, o que separa um investimento excepcional de um projeto medíocre não é apenas a compra do imóvel. ", options: { fontSize: 13, fontFace: FONT_B, color: C.body } },
    { text: "É a capacidade de identificar assimetrias de mercado e executar o processo sem falhas.", options: { fontSize: 13, fontFace: FONT_B, bold: true, color: C.body, breakLine: true, paraSpaceAfter: 14 } },
    { text: "Este documento apresenta o nosso modelo: uma abordagem industrial, auditável e replicável que transforma a aleatoriedade do mercado num processo controlado.", options: { fontSize: 12, fontFace: FONT_B, italic: true, color: C.muted } },
  ], {
    x: bx + 0.4, y: by + 0.75, w: bw - 0.8, h: bh - 1.0,
    margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 3 — A ASSIMETRIA DO RISCO (tabela 2 colunas x 3 linhas)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "Apresentação a Investidores", "A Assimetria do Risco: Desafios do Investimento Individual");

  const tx = ML, ty = 2.05, tw = CW, rowH = 1.18;
  const labelW = 1.7;
  const colW = (tw - labelW) / 2;

  // Headers das duas colunas
  s.addShape(pres.shapes.RECTANGLE, {
    x: tx + labelW, y: ty, w: colW, h: 0.42,
    fill: { color: C.red }, line: { type: "none" },
  });
  s.addText("O Investidor Solitário", {
    x: tx + labelW, y: ty, w: colW, h: 0.42,
    fontSize: 11, fontFace: FONT_H, bold: true, color: C.white,
    align: "center", valign: "middle", charSpacing: 2, margin: 0,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: tx + labelW + colW, y: ty, w: colW, h: 0.42,
    fill: { color: C.green }, line: { type: "none" },
  });
  s.addText("Parceria Somnium Properties", {
    x: tx + labelW + colW, y: ty, w: colW, h: 0.42,
    fontSize: 11, fontFace: FONT_H, bold: true, color: C.white,
    align: "center", valign: "middle", charSpacing: 2, margin: 0,
  });

  const rows = [
    {
      label: "Fator Tempo",
      a: "Consumo extremo de tempo em prospeção, negociação e gestão de obras.",
      b: "Alocação de capital passiva. Esforço nulo ('Mãos-Livres').",
    },
    {
      label: "Fator Risco",
      a: "Decisões frequentemente emocionais e derrapagens financeiras não calculadas.",
      b: "Decisões blindadas por Matemática Pura (MAO) e matrizes de Stress Tests.",
    },
    {
      label: "Rede & Execução",
      a: "Dependência de empreiteiros incertos e falta de poder negocial.",
      b: "Ecossistema integrado: equipa clínica, gestores de obra e rede de 72 parceiros.",
    },
  ];

  rows.forEach((r, i) => {
    const ry = ty + 0.42 + i * rowH;
    // Label cell
    s.addShape(pres.shapes.RECTANGLE, {
      x: tx, y: ry, w: labelW, h: rowH,
      fill: { color: C.black }, line: { type: "none" },
    });
    s.addText(r.label, {
      x: tx + 0.15, y: ry, w: labelW - 0.3, h: rowH,
      fontSize: 11, fontFace: FONT_H, bold: true, color: C.gold,
      valign: "middle", margin: 0,
    });
    // Cell A
    s.addShape(pres.shapes.RECTANGLE, {
      x: tx + labelW, y: ry, w: colW, h: rowH,
      fill: { color: i % 2 ? C.bg : C.light }, line: { color: C.border, width: 0.5 },
    });
    s.addText(r.a, {
      x: tx + labelW + 0.15, y: ry + 0.1, w: colW - 0.3, h: rowH - 0.2,
      fontSize: 11, fontFace: FONT_B, color: C.body, valign: "middle", margin: 0,
    });
    // Cell B
    s.addShape(pres.shapes.RECTANGLE, {
      x: tx + labelW + colW, y: ry, w: colW, h: rowH,
      fill: { color: i % 2 ? C.bg : C.light }, line: { color: C.border, width: 0.5 },
    });
    s.addText(r.b, {
      x: tx + labelW + colW + 0.15, y: ry + 0.1, w: colW - 0.3, h: rowH - 0.2,
      fontSize: 11, fontFace: FONT_B, color: C.body, valign: "middle", margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 4 — A FILOSOFIA "ZERO IMPROVISO"
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "Apresentação a Investidores", "A Filosofia 'Zero Improviso'");

  const items = [
    { n: "01", t: "A Origem Clínica", d: "Fundada por profissionais com background na área da Saúde — onde o erro não é uma opção." },
    { n: "02", t: "O Paralelismo", d: "Transpomos a cultura vital de protocolos rigorosos, registo meticuloso e atenção ao detalhe da área da Saúde para a gestão de ativos." },
    { n: "03", t: "O Resultado", d: "Cada passo do investimento é dado com uma metodologia padrão. Todas as decisões são baseadas em dados e simulações. Nada é deixado ao acaso." },
  ];

  const sx = ML, sy = 2.05, sw = CW, gap = 0.18;
  const cardW = (sw - 2 * gap) / 3;
  const cardH = 4.5;

  items.forEach((it, i) => {
    const x = sx + i * (cardW + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: sy, w: cardW, h: cardH,
      fill: { color: C.light }, line: { color: C.border, width: 0.5 },
    });
    // accent rule top
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: sy, w: cardW, h: 0.05,
      fill: { color: C.gold }, line: { type: "none" },
    });
    // Numero grande
    s.addText(it.n, {
      x: x + 0.3, y: sy + 0.3, w: cardW - 0.6, h: 0.6,
      fontSize: 36, fontFace: FONT_H, bold: true, color: C.gold, margin: 0,
    });
    // Linha gold curta
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.3, y: sy + 1.0, w: 0.5, h: 0.025,
      fill: { color: C.gold }, line: { type: "none" },
    });
    // Titulo
    s.addText(it.t, {
      x: x + 0.3, y: sy + 1.15, w: cardW - 0.6, h: 0.5,
      fontSize: 16, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    // Descrição
    s.addText(it.d, {
      x: x + 0.3, y: sy + 1.7, w: cardW - 0.6, h: cardH - 1.85,
      fontSize: 12, fontFace: FONT_B, color: C.body, margin: 0, paraSpaceAfter: 6,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 5 — O NOSSO ADN E ESTRUTURA INSTITUCIONAL
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "Apresentação a Investidores", "O Nosso ADN e Estrutura Institucional");

  // Top: 3 figuras-chave
  const top = [
    { t: "Alexandre Mendes & João Abreu", r: "Fundadores", d: "Gestão clínica do investimento." },
    { t: "Luís", r: "Gestor de Obra", d: "Know-how sobre construção civil, licenciamento urbanístico e projetos." },
    { t: "João", r: "Consultor Estratégico", d: "Portfólio internacional e visão macro de mercado." },
  ];
  const sx = ML, ty = 2.05, gap = 0.18;
  const tw = (CW - 2 * gap) / 3;
  const th = 1.8;
  top.forEach((p, i) => {
    const x = sx + i * (tw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: ty, w: tw, h: th,
      fill: { color: C.black }, line: { type: "none" },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: ty, w: tw, h: 0.04,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(p.t, {
      x: x + 0.25, y: ty + 0.2, w: tw - 0.4, h: 0.5,
      fontSize: 14, fontFace: FONT_H, bold: true, color: C.white, margin: 0,
    });
    s.addText(p.r, {
      x: x + 0.25, y: ty + 0.7, w: tw - 0.4, h: 0.3,
      fontSize: 9, fontFace: FONT_B, bold: true, color: C.gold,
      charSpacing: 3, margin: 0,
    });
    s.addText(p.d, {
      x: x + 0.25, y: ty + 1.05, w: tw - 0.4, h: 0.65,
      fontSize: 11, fontFace: FONT_B, color: "DDD3B5", margin: 0,
    });
  });

  // Bottom: 4 departamentos
  const dept = [
    { t: "Administração & Financeiro", d: "Controlo de capital e faturas." },
    { t: "Departamento Comercial", d: "Gestão do pipeline e rede de 72 parceiros." },
    { t: "Departamento de Obra", d: "Liderança técnica e execução." },
    { t: "Formação", d: "Atualização de SOPs e análise de mercado." },
  ];
  const dy = ty + th + 0.3, dh = 1.85;
  const dw = (CW - 3 * gap) / 4;
  dept.forEach((d, i) => {
    const x = sx + i * (dw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: dy, w: dw, h: dh,
      fill: { color: C.light }, line: { color: C.border, width: 0.5 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: dy, w: 0.05, h: dh,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(d.t, {
      x: x + 0.25, y: dy + 0.25, w: dw - 0.4, h: 0.7,
      fontSize: 12, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    s.addText(d.d, {
      x: x + 0.25, y: dy + 1.0, w: dw - 0.4, h: 0.75,
      fontSize: 10, fontFace: FONT_B, color: C.body, margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 6 — PILAR I: SOPs
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "PILAR I  ·  Segurança & Rigor", "O Motor da Segurança: Procedimentos Operacionais Padrão (SOPs)");

  // Esq: lista de SOPs
  const lx = ML, ly = 2.05, lw = 5.6, lh = 4.3;
  s.addShape(pres.shapes.RECTANGLE, {
    x: lx, y: ly, w: lw, h: lh, fill: { color: C.black }, line: { type: "none" },
  });
  s.addText("Biblioteca de Procedimentos", {
    x: lx + 0.3, y: ly + 0.25, w: lw - 0.6, h: 0.35,
    fontSize: 9, fontFace: FONT_B, bold: true, color: C.gold,
    charSpacing: 3, margin: 0,
  });
  s.addText("A nossa operação assenta numa biblioteca viva de procedimentos.", {
    x: lx + 0.3, y: ly + 0.6, w: lw - 0.6, h: 0.5,
    fontSize: 14, fontFace: FONT_H, italic: true, color: C.white, margin: 0,
  });
  const sops = [
    "SOP 1 — Pesquisa de Negócios",
    "SOP 4 — Aquisição de Investidores",
    "SOP 5 — Visita de Qualificação",
    "SOP 6 — Garantia de Qualidade de Projetos",
    "SOP 7 — Compra & Investimento",
  ];
  s.addText(bullets(sops, C.gold), {
    x: lx + 0.3, y: ly + 1.5, w: lw - 0.6, h: lh - 1.7,
    fontSize: 12, fontFace: FONT_B, color: "DDD3B5",
    margin: 0, paraSpaceAfter: 8,
  });

  // Dir: 3 cards
  const cx = lx + lw + 0.25, cw = CW - lw - 0.25, ch = (lh - 0.3) / 3;
  const cards = [
    { t: "Metodologia Aprovada", d: "Cada operação obedece a um SOP específico (da prospeção à venda)." },
    { t: "Auditoria Contínua", d: "Processos revistos e otimizados a cada projeto na nova variável de mercado." },
    { t: "Rastreabilidade", d: "Garantia de qualidade e minimização do erro humano." },
  ];
  cards.forEach((c, i) => {
    const y = ly + i * (ch + 0.15);
    s.addShape(pres.shapes.RECTANGLE, {
      x: cx, y, w: cw, h: ch,
      fill: { color: C.light }, line: { color: C.border, width: 0.5 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: cx, y, w: 0.05, h: ch,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(c.t, {
      x: cx + 0.25, y: y + 0.2, w: cw - 0.4, h: 0.4,
      fontSize: 13, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    s.addText(c.d, {
      x: cx + 0.25, y: y + 0.65, w: cw - 0.4, h: ch - 0.8,
      fontSize: 11, fontFace: FONT_B, color: C.body, margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 7 — PILAR I: A CIÊNCIA DA COMPRA (SOP 4)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "PILAR I  ·  Segurança & Rigor", "A Ciência da Compra (SOP 4)");

  const cards = [
    {
      t: "Validação Cruzada Múltipla",
      d: "Identificação de mínimo 5 comparáveis. Cruzamento de dados com ferramentas especializadas, parceiros locais e avaliadores.",
    },
    {
      t: "Ajuste Matemático",
      d: "Ajustes automáticos baseados em áreas, localização (10%), idade e conservação.",
    },
  ];
  const cy = 2.05, ch = 2.0;
  cards.forEach((c, i) => {
    const x = ML + i * (CW / 2 + 0.1);
    const w = CW / 2 - 0.1;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w, h: ch,
      fill: { color: C.light }, line: { color: C.border, width: 0.5 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w, h: 0.05,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(c.t, {
      x: x + 0.3, y: cy + 0.3, w: w - 0.6, h: 0.5,
      fontSize: 16, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    s.addText(c.d, {
      x: x + 0.3, y: cy + 0.85, w: w - 0.6, h: ch - 1.0,
      fontSize: 12, fontFace: FONT_B, color: C.body, margin: 0,
    });
  });

  // Formula box destaque (estilo "totalBg")
  const fy = cy + ch + 0.3;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: fy, w: CW, h: 1.0,
    fill: { color: C.black }, line: { type: "none" },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: fy, w: CW, h: 0.04,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("MAO  =  (VVR  ×  0,64  a  0,70)  −  Custo de Obra", {
    x: ML, y: fy + 0.18, w: CW, h: 0.5,
    fontSize: 26, fontFace: FONT_H, bold: true, color: C.gold,
    align: "center", margin: 0,
  });
  s.addText("MAO (Maximum Allowable Offer). Nunca compramos acima da linha de segurança dos 64–70% do Valor de Venda Real (VVR).", {
    x: ML, y: fy + 0.7, w: CW, h: 0.3,
    fontSize: 10, fontFace: FONT_B, italic: true, color: "DDD3B5",
    align: "center", margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 8 — PILAR I: STRESS TESTS
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "PILAR I  ·  Segurança & Rigor", "A Nossa Obsessão com o Risco: Stress Tests");

  const cards = [
    { t: "Cenário Base", d: "O plano ideal e conservador de rentabilidade.", color: C.green, num: "01" },
    { t: "Stress Test Moderado", d: "−10% VVR  ·  +10% Custo Obra  ·  +3 Meses Retenção", color: C.gold, num: "02" },
    { t: "Stress Test Severo", d: "−20% VVR  ·  +20% Custo Obra  ·  +6 Meses Retenção", color: C.red, num: "03" },
  ];
  const cy = 2.05, ch = 2.3, gap = 0.2;
  const cw = (CW - 2 * gap) / 3;
  cards.forEach((c, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: ch,
      fill: { color: C.light }, line: { color: C.border, width: 0.5 },
    });
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
    s.addText(c.d, {
      x: x + 0.3, y: cy + 0.6, w: cw - 0.6, h: ch - 0.8,
      fontSize: 12, fontFace: FONT_B, color: C.body,
      valign: "top", margin: 0,
    });
  });

  // Regras do Flipper Disciplinado
  const ry = cy + ch + 0.3;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: ry, w: CW, h: 1.7,
    fill: { color: C.black }, line: { type: "none" },
  });
  s.addText("AS REGRAS DO FLIPPER DISCIPLINADO", {
    x: ML + 0.4, y: ry + 0.2, w: CW - 0.8, h: 0.3,
    fontSize: 10, fontFace: FONT_B, bold: true, color: C.gold,
    charSpacing: 3, margin: 0,
  });
  s.addText([
    { text: "1.  ", options: { color: C.gold, bold: true } },
    { text: "Incorporar sempre 10% a 20% de contingência de obra no cálculo inicial.", options: { color: C.white, breakLine: true } },
    { text: "2.  ", options: { color: C.gold, bold: true } },
    { text: "Nunca avançar para um negócio que só é rentável no Cenário Base.", options: { color: C.white, breakLine: true } },
    { text: "3.  ", options: { color: C.gold, bold: true } },
    { text: "O projeto tem de poder ser convertido em arrendamento viável.", options: { color: C.white } },
  ], {
    x: ML + 0.4, y: ry + 0.55, w: CW - 0.8, h: 1.0,
    fontSize: 12, fontFace: FONT_B, paraSpaceAfter: 4, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 9 — PILAR II: TÁTICA DE VENDA CIRÚRGICA
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "PILAR II  ·  Rentabilidade", "Tática de Venda Cirúrgica: Plano Estratégico de Venda");

  const phases = [
    { n: "1", t: "Preparação Premium", d: "Home Staging, Sessões fotográficas profissionais, Tours 3D/360° e levantamento de plantas rigorosas.", win: "Janela 0–30 dias: Cenário Base posicionando com preço 2–4% acima do VVR." },
    { n: "2", t: "Exclusividade Pensada", d: "Atribuição de dica ao consultor que truve o negócio em casa de obra +/−15 dias após o ajuste de mais conclusão.", win: "Janela 31–60 dias: Aproximação ao Stress Test +3 meses com ajustes táticos conforme procura." },
    { n: "3", t: "Acelerador de Venda", d: "Em caso de resistência (limite do Stress Test retenção +6 meses): Top Performer da rede acima já tem.", win: "Cláusula de redução máxima sem comprometer ROI mínimo." },
  ];

  const cy = 2.05, ch = 4.5, gap = 0.18;
  const cw = (CW - 2 * gap) / 3;
  phases.forEach((p, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: ch,
      fill: { color: C.light }, line: { color: C.border, width: 0.5 },
    });
    // Numero gigante a fundo
    s.addText(p.n, {
      x: x + 0.3, y: cy + 0.2, w: 1.2, h: 1.0,
      fontSize: 56, fontFace: FONT_H, bold: true, color: C.gold, margin: 0,
    });
    s.addText("Fase " + p.n, {
      x: x + 0.3, y: cy + 1.15, w: cw - 0.6, h: 0.3,
      fontSize: 9, fontFace: FONT_B, bold: true, color: C.muted,
      charSpacing: 3, margin: 0,
    });
    s.addText(p.t, {
      x: x + 0.3, y: cy + 1.4, w: cw - 0.6, h: 0.7,
      fontSize: 16, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.3, y: cy + 2.05, w: 0.4, h: 0.025,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(p.d, {
      x: x + 0.3, y: cy + 2.15, w: cw - 0.6, h: 1.5,
      fontSize: 11, fontFace: FONT_B, color: C.body, margin: 0,
    });
    // Janela
    s.addText(p.win, {
      x: x + 0.3, y: cy + ch - 1.2, w: cw - 0.6, h: 1.0,
      fontSize: 10, fontFace: FONT_B, italic: true, color: C.muted, margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 10 — PILAR II: PLANO B
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "PILAR II  ·  Rentabilidade", "O Plano B: A Rede de Segurança Absoluta");

  // Esq: zona de gráfico ilustrativa
  const gx = ML, gy = 2.05, gw = 6.5, gh = 4.2;
  s.addShape(pres.shapes.RECTANGLE, {
    x: gx, y: gy, w: gw, h: gh,
    fill: { color: C.light }, line: { color: C.border, width: 0.5 },
  });
  // Eixos
  s.addShape(pres.shapes.RECTANGLE, {
    x: gx + 0.6, y: gy + 0.4, w: 0.015, h: gh - 0.9,
    fill: { color: C.body }, line: { type: "none" },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: gx + 0.6, y: gy + gh - 0.5, w: gw - 1.0, h: 0.015,
    fill: { color: C.body }, line: { type: "none" },
  });
  s.addText("ROI/Preço", {
    x: gx + 0.1, y: gy + 0.2, w: 0.5, h: 0.2,
    fontSize: 9, fontFace: FONT_B, italic: true, color: C.muted, margin: 0,
  });
  s.addText("Tempo", {
    x: gx + gw - 0.8, y: gy + gh - 0.35, w: 0.7, h: 0.2,
    fontSize: 9, fontFace: FONT_B, italic: true, color: C.muted, margin: 0,
  });
  // Curva descendente (linha verde inicial → ponto vermelho → linha laranja)
  s.addShape(pres.shapes.LINE, {
    x: gx + 0.7, y: gy + 0.7, w: 2.0, h: 0.7,
    line: { color: C.green, width: 2 },
  });
  s.addShape(pres.shapes.LINE, {
    x: gx + 2.7, y: gy + 1.4, w: 1.5, h: 1.0,
    line: { color: C.gold, width: 2 },
  });
  s.addShape(pres.shapes.LINE, {
    x: gx + 4.2, y: gy + 2.4, w: 1.5, h: 1.0, // pivot down
    line: { color: C.red, width: 2 },
  });
  // Linha horizontal Vermelha
  s.addShape(pres.shapes.LINE, {
    x: gx + 0.6, y: gy + 2.4, w: gw - 1.0, h: 0,
    line: { color: C.red, width: 1, dashType: "dash" },
  });
  s.addText("Zona de Venda", {
    x: gx + 1.0, y: gy + 0.5, w: 1.5, h: 0.3,
    fontSize: 10, fontFace: FONT_B, bold: true, color: C.green, margin: 0,
  });
  s.addText("Linha de Corte", {
    x: gx + gw - 1.7, y: gy + 2.15, w: 1.5, h: 0.25,
    fontSize: 9, fontFace: FONT_B, bold: true, color: C.red,
    align: "right", margin: 0,
  });
  s.addText("(Linha Vermelha)", {
    x: gx + gw - 1.7, y: gy + 2.4, w: 1.5, h: 0.25,
    fontSize: 8, fontFace: FONT_B, italic: true, color: C.muted,
    align: "right", margin: 0,
  });
  s.addText("Pivot para Arrendamento (Plano B)", {
    x: gx + 4.0, y: gy + gh - 1.0, w: 2.3, h: 0.3,
    fontSize: 9, fontFace: FONT_B, bold: true, color: C.gold,
    align: "center", margin: 0,
  });

  // Dir: 3 bullets explicativos
  const bx = gx + gw + 0.25, bw = CW - gw - 0.25;
  const bullets3 = [
    { t: "O Limite de Corte", d: "Registamos o VVR mínimo aceitável baseado no teste de stress severo (−20%)." },
    { t: "A Linha Vermelha Somnium", d: "Se for preciso furar o chão do nosso ROI mínimo exigido, o procedimento de venda é automaticamente suspenso." },
    { t: "A Conversão", d: "Executamos o pivot imediato do ativo para o mercado de Arrendamento (validado a priori)." },
  ];
  bullets3.forEach((b, i) => {
    const y = gy + i * 1.4 + 0.05;
    s.addText("○ " + b.t, {
      x: bx, y, w: bw, h: 0.4,
      fontSize: 13, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    s.addText(b.d, {
      x: bx + 0.3, y: y + 0.4, w: bw - 0.3, h: 0.9,
      fontSize: 11, fontFace: FONT_B, color: C.body, margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 11 — PILAR III: ECOSSISTEMA "MÃOS-LIVRES"
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "PILAR III  ·  Transparência Total", "Ecossistema de Investimento 'Mãos-Livres'");

  const items = [
    { n: "01", t: "Auditoria em Tempo Real", d: "Acesso vitalício a uma pasta cifrada. Visualização ilimitada de faturas, contabilidade e documentos legais." },
    { n: "02", t: "Comunicação Sem Ruído", d: "Canal dedicado com exclusivo ao seu negócio. Atualizações diárias diretas com a equipa de liderança. Sem e-mails perdidos." },
    { n: "03", t: "Relatórios Visuais de Obra", d: "Carregamento semanal de fotografias e vídeos em alta resolução. Acompanhe a evolução ao milímetro, sem visitar o estaleiro." },
  ];
  const cy = 2.05, ch = 4.3, gap = 0.18;
  const cw = (CW - 2 * gap) / 3;
  items.forEach((it, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: ch,
      fill: { color: C.light }, line: { color: C.border, width: 0.5 },
    });
    s.addText(it.n, {
      x: x + 0.3, y: cy + 0.3, w: cw - 0.6, h: 0.6,
      fontSize: 36, fontFace: FONT_H, bold: true, color: C.gold, margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.3, y: cy + 1.0, w: 0.5, h: 0.025,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(it.t, {
      x: x + 0.3, y: cy + 1.15, w: cw - 0.6, h: 0.6,
      fontSize: 16, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    s.addText(it.d, {
      x: x + 0.3, y: cy + 1.85, w: cw - 0.6, h: ch - 2.0,
      fontSize: 11, fontFace: FONT_B, color: C.body, margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 12 — ALINHAMENTO DE INTERESSES
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "Alinhamento de Interesses", "Alinhamento Total de Interesses");

  // Top: dois 50%
  const splits = [
    { p: "50%", t: "Investidor", d: "(Alocação de Capital)" },
    { p: "50%", t: "Somnium Properties", d: "(Gestão Operacional, Execução, Risco Técnico)" },
  ];
  const ty = 2.05, th = 2.0;
  splits.forEach((sp, i) => {
    const x = ML + i * (CW / 2 + 0.1);
    const w = CW / 2 - 0.1;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: ty, w, h: th,
      fill: { color: i ? C.black : C.light }, line: { color: C.border, width: 0.5 },
    });
    s.addText(sp.p, {
      x: x + 0.3, y: ty + 0.25, w: w - 0.6, h: 0.9,
      fontSize: 60, fontFace: FONT_H, bold: true,
      color: i ? C.gold : C.gold, align: "center", margin: 0,
    });
    s.addText(sp.t, {
      x: x + 0.3, y: ty + 1.15, w: w - 0.6, h: 0.45,
      fontSize: 18, fontFace: FONT_H, bold: true,
      color: i ? C.white : C.body, align: "center", margin: 0,
    });
    s.addText(sp.d, {
      x: x + 0.3, y: ty + 1.6, w: w - 0.6, h: 0.35,
      fontSize: 11, fontFace: FONT_B, italic: true,
      color: i ? "DDD3B5" : C.muted, align: "center", margin: 0,
    });
  });

  // Bottom: bloco de confiança
  const by = ty + th + 0.4, bh = 2.0;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: by, w: CW, h: bh,
    fill: { color: C.black }, line: { type: "none" },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: by, w: CW, h: 0.04,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("O Sinal de Confiança Absoluta:  Co-Investimento", {
    x: ML, y: by + 0.4, w: CW, h: 0.55,
    fontSize: 24, fontFace: FONT_H, bold: true, color: C.gold,
    align: "center", margin: 0,
  });
  s.addText("A Somnium Properties investe o seu próprio capital nos projetos que estrutura. Apenas abrimos espaço a parceiros após a nossa própria validação financeira.", {
    x: ML + 0.6, y: by + 1.05, w: CW - 1.2, h: 0.85,
    fontSize: 13, fontFace: FONT_B, color: C.white,
    align: "center", margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 13 — A OPORTUNIDADE SOMNIUM (RESUMO)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);
  contentChrome(s, "Resumo Executivo", "A Oportunidade Somnium");

  const items = [
    { n: "1", t: "Segurança", sub: "(Zero Improviso)", d: "Matemática pura na compra (MAO validado) e matrizes de Stress Tests severos com testes nos ativos." },
    { n: "2", t: "Rentabilidade Otimizada", sub: "", d: "Proteção do ROI com estratégias de saída táticas pré-definidas (SOP 10)." },
    { n: "3", t: "Transparência Institucional", sub: "", d: "Acesso total aos números e ao terreno de forma digital e assíncrona. Controlo absoluto, esforço nulo." },
  ];
  const cy = 2.05, ch = 4.5, gap = 0.18;
  const cw = (CW - 2 * gap) / 3;
  items.forEach((it, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: ch,
      fill: { color: C.black }, line: { type: "none" },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: 0.04,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(it.n, {
      x: x + 0.3, y: cy + 0.3, w: cw - 0.6, h: 1.2,
      fontSize: 80, fontFace: FONT_H, bold: true, color: C.gold, margin: 0,
    });
    s.addText(it.t, {
      x: x + 0.3, y: cy + 1.7, w: cw - 0.6, h: 0.5,
      fontSize: 18, fontFace: FONT_H, bold: true, color: C.white, margin: 0,
    });
    if (it.sub) s.addText(it.sub, {
      x: x + 0.3, y: cy + 2.2, w: cw - 0.6, h: 0.3,
      fontSize: 11, fontFace: FONT_B, italic: true, color: C.gold, margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.3, y: cy + 2.55, w: 0.5, h: 0.025,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(it.d, {
      x: x + 0.3, y: cy + 2.7, w: cw - 0.6, h: ch - 2.85,
      fontSize: 11, fontFace: FONT_B, color: "DDD3B5", margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 14 — CTA / OBRIGADO
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  bg(s, C.bg);
  topBars(s);

  // Logo centrado pequeno
  const LW = 3.5, LH = LW / (1516 / 614);
  const blockTop = 1.0;
  s.addImage({ path: LOGO_DARK, x: (W - LW) / 2, y: blockTop, w: LW, h: LH });

  // Accent rule
  const accent1Y = blockTop + LH + 0.4;
  s.addShape(pres.shapes.RECTANGLE, {
    x: W / 2 - 0.42, y: accent1Y, w: 0.84, h: RULE_THICK,
    fill: { color: C.gold }, line: { type: "none" },
  });

  // CTA title
  s.addText("Construa um Portfólio\nSem Dores de Cabeça.", {
    x: ML, y: accent1Y + 0.25, w: CW, h: 1.4,
    fontSize: 36, fontFace: FONT_H, bold: true, color: C.body,
    align: "center", margin: 0, paraSpaceAfter: 4,
  });

  // Tagline
  s.addText("Junte-se ao nosso grupo restrito de investidores passivos e deixe o rigor clínico proteger o seu capital.", {
    x: ML + 1.5, y: accent1Y + 1.85, w: CW - 3.0, h: 0.6,
    fontSize: 13, fontFace: FONT_B, italic: true, color: C.muted,
    align: "center", margin: 0,
  });

  // Botão "Quero" estilo gold
  const btnW = 2.0, btnH = 0.55;
  const btnY = accent1Y + 2.55;
  s.addShape(pres.shapes.RECTANGLE, {
    x: (W - btnW) / 2, y: btnY, w: btnW, h: btnH,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("Quero", {
    x: (W - btnW) / 2, y: btnY, w: btnW, h: btnH,
    fontSize: 16, fontFace: FONT_H, bold: true, color: C.black,
    align: "center", valign: "middle", charSpacing: 3, margin: 0,
  });

  // Long thin gold rule
  const accent2Y = btnY + btnH + 0.4;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML + 1.5, y: accent2Y, w: CW - 3.0, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });

  // Contactos
  s.addText("Alexandre Mendes & João Abreu  ·  geral@somniumproperties.pt  ·  www.somniumproperties.pt", {
    x: ML, y: accent2Y + 0.15, w: CW, h: 0.3,
    fontSize: 11, fontFace: FONT_B, color: C.muted,
    align: "center", margin: 0,
  });

  // Footer da capa
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: H - 0.55, w: CW, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("Somnium Properties · Investimento Imobiliário", {
    x: ML, y: H - 0.45, w: CW, h: 0.2,
    fontSize: 8, fontFace: FONT_B, color: C.muted, align: "center", margin: 0,
  });
  s.addText("Documento Confidencial · Marco 2026", {
    x: ML, y: H - 0.27, w: CW, h: 0.2,
    fontSize: 8, fontFace: FONT_B, color: C.muted, align: "center", margin: 0,
  });
}

// ── Save ────────────────────────────────────────────────────
const path = require("path");
const out = path.resolve("/tmp/recolor/Apresentacao_Investidores_Marco_2026_Somnium.pptx");
pres.writeFile({ fileName: out }).then(p => console.log("WROTE:", p));
