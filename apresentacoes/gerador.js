// Apresentação Somnium Properties — Investidor CAEP
// Layout: cream/gold/dark, 17 slides, LAYOUT_WIDE (13.3" x 7.5")
const pptxgen = require("pptxgenjs");
const path = require("path");

const LOGO_TRANSPARENT = "/home/user/SomniumProperties-Dashboard/public/logo-transparent.png"; // light bg
const LOGO_DARK = "/home/user/SomniumProperties-Dashboard/public/logo-dark.png"; // dark logo for cream bg

// Palette
const C = {
  dark: "0D0D0D",
  darkLight: "1A1A1A",
  gold: "C9A84C",
  goldLight: "E8D08A",
  cream: "F8F3E6",
  creamSoft: "FBF8EE",
  ink: "1F1B12",
  inkSoft: "4A4538",
  muted: "8C8470",
  white: "FFFFFF",
  rule: "DCD2B6",
};

const FONT_H = "Georgia";
const FONT_B = "Calibri";

const W = 13.333;
const H = 7.5;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Somnium Properties";
pres.title = "Apresentação a Investidor — Somnium Properties";
pres.company = "Somnium Properties";

// --- Helpers --------------------------------------------------------------

function addCreamBackground(slide) {
  slide.background = { color: C.cream };
}

function addDarkBackground(slide) {
  slide.background = { color: C.dark };
}

function addGoldRule(slide, opts = {}) {
  const { x = 0.6, y = 1.35, w = 1.0, h = 0.06 } = opts;
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h, fill: { color: C.gold }, line: { color: C.gold, width: 0 },
  });
}

function addContentHeader(slide, eyebrow, title) {
  // Eyebrow (small uppercase)
  slide.addText(eyebrow, {
    x: 0.6, y: 0.5, w: 12.0, h: 0.4,
    fontSize: 11, fontFace: FONT_B, color: C.gold, bold: true,
    charSpacing: 8, margin: 0,
  });
  // Title
  slide.addText(title, {
    x: 0.6, y: 0.85, w: 12.0, h: 0.85,
    fontSize: 32, fontFace: FONT_H, color: C.ink, bold: false, margin: 0,
  });
  // Gold rule under title
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 1.78, w: 0.9, h: 0.05,
    fill: { color: C.gold }, line: { color: C.gold, width: 0 },
  });
}

function addFooter(slide, pageNum, totalPages = 17, dark = false) {
  const color = dark ? C.goldLight : C.muted;
  const ruleColor = dark ? "2A2A2A" : C.rule;
  // Top rule (subtle)
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 7.05, w: 12.13, h: 0.012,
    fill: { color: ruleColor }, line: { color: ruleColor, width: 0 },
  });
  slide.addText("SOMNIUM PROPERTIES  ·  Apresentação a Investidor  ·  Maio 2026", {
    x: 0.6, y: 7.12, w: 9.5, h: 0.3,
    fontSize: 9, fontFace: FONT_B, color, charSpacing: 4, margin: 0,
  });
  slide.addText(`${pageNum} / ${totalPages}`, {
    x: 11.5, y: 7.12, w: 1.23, h: 0.3,
    fontSize: 9, fontFace: FONT_B, color, align: "right", margin: 0,
  });
}

function addCard(slide, { x, y, w, h, fill = C.creamSoft, ruleColor = C.gold }) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h, fill: { color: fill }, line: { color: C.rule, width: 0.5 },
  });
  // Left gold rule
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w: 0.06, h, fill: { color: ruleColor }, line: { color: ruleColor, width: 0 },
  });
}

function bullets(items) {
  return items.map((t, i) => ({
    text: t,
    options: { bullet: { code: "25CF" }, breakLine: i < items.length - 1, paraSpaceAfter: 6 },
  }));
}

// --- Slide 1: Capa --------------------------------------------------------
{
  const s = pres.addSlide();
  addDarkBackground(s);

  // Decorative gold band on left
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.35, h: H, fill: { color: C.gold }, line: { color: C.gold, width: 0 },
  });

  // Logo (transparent works on dark)
  s.addImage({ path: LOGO_TRANSPARENT, x: 1.0, y: 1.0, w: 3.6, h: 1.46 });

  // Eyebrow
  s.addText("APRESENTAÇÃO A INVESTIDOR", {
    x: 1.0, y: 3.2, w: 11.0, h: 0.4,
    fontSize: 13, fontFace: FONT_B, color: C.goldLight, bold: true,
    charSpacing: 10, margin: 0,
  });

  // Title
  s.addText("Disciplina clínica.\nRigor de operação.\nCapital com retorno.", {
    x: 1.0, y: 3.7, w: 11.5, h: 2.4,
    fontSize: 44, fontFace: FONT_H, color: C.white, bold: false, margin: 0,
    paraSpaceAfter: 4,
  });

  // Bottom info
  s.addShape(pres.shapes.RECTANGLE, {
    x: 1.0, y: 6.5, w: 0.6, h: 0.04,
    fill: { color: C.gold }, line: { color: C.gold, width: 0 },
  });
  s.addText("Somnium Properties  ·  Porto  ·  Maio 2026", {
    x: 1.0, y: 6.65, w: 11.0, h: 0.4,
    fontSize: 12, fontFace: FONT_B, color: C.goldLight, charSpacing: 4, margin: 0,
  });
}

// --- Slide 2: Ordem de Trabalhos -----------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "ORDEM DE TRABALHOS", "Como vamos estruturar esta conversa");

  const items = [
    ["01", "Apresentação da nossa equipa"],
    ["02", "Apresentação do investidor"],
    ["03", "Estrutura da empresa"],
    ["04", "Dinâmica e modelo operacional"],
    ["05", "App Somnium e tecnologia interna"],
    ["06", "Caso prático em curso — T2 Condeixa"],
    ["07", "Próximos passos e fecho"],
  ];

  const startY = 2.2;
  const rowH = 0.55;
  items.forEach(([num, label], i) => {
    const y = startY + i * rowH;
    s.addText(num, {
      x: 0.6, y, w: 0.9, h: rowH,
      fontSize: 22, fontFace: FONT_H, color: C.gold, bold: false, margin: 0,
      valign: "middle",
    });
    s.addText(label, {
      x: 1.6, y, w: 10.0, h: rowH,
      fontSize: 18, fontFace: FONT_B, color: C.ink, margin: 0,
      valign: "middle",
    });
    // hairline divider
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y: y + rowH - 0.01, w: 11.5, h: 0.01,
      fill: { color: C.rule }, line: { color: C.rule, width: 0 },
    });
  });

  addFooter(s, 2);
}

// --- Slide 3: A Nossa Equipa ---------------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "A NOSSA EQUIPA", "Três disciplinas, um único standard de execução");

  const cards = [
    {
      name: "Alexandre Mendes",
      role: "Sócio-gerente",
      bg: "Enfermeiro a tempo inteiro",
      bullets: [
        "Originação e qualificação",
        "Gestão de relação com investidores",
        "Análise financeira e CAEP",
      ],
    },
    {
      name: "João Abreu",
      role: "Sócio-gerente",
      bg: "Enfermeiro a tempo inteiro",
      bullets: [
        "Pipeline e rede de consultores",
        "Documentação e SOPs",
        "Reporting e compliance",
      ],
    },
    {
      name: "Luís Pedro",
      role: "Parceiro estratégico",
      bg: "Gestão de Obras",
      bullets: [
        "Acesso direto a materiais (preço de origem)",
        "Supervisão técnica de obra",
        "Rede validada de empreiteiros",
      ],
    },
  ];

  const x0 = 0.6;
  const cardW = 4.04;
  const gap = 0.21;
  const cardY = 2.1;
  const cardH = 4.5;

  cards.forEach((c, i) => {
    const x = x0 + i * (cardW + gap);
    addCard(s, { x, y: cardY, w: cardW, h: cardH });

    s.addText(c.name, {
      x: x + 0.3, y: cardY + 0.25, w: cardW - 0.5, h: 0.45,
      fontSize: 20, fontFace: FONT_H, color: C.ink, margin: 0,
    });
    s.addText(c.role, {
      x: x + 0.3, y: cardY + 0.7, w: cardW - 0.5, h: 0.3,
      fontSize: 11, fontFace: FONT_B, color: C.gold, bold: true,
      charSpacing: 6, margin: 0,
    });
    s.addText(c.bg, {
      x: x + 0.3, y: cardY + 1.05, w: cardW - 0.5, h: 0.35,
      fontSize: 12, fontFace: FONT_B, italic: true, color: C.inkSoft, margin: 0,
    });
    // separator
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.3, y: cardY + 1.55, w: 0.6, h: 0.03,
      fill: { color: C.gold }, line: { color: C.gold, width: 0 },
    });
    s.addText(bullets(c.bullets), {
      x: x + 0.3, y: cardY + 1.75, w: cardW - 0.55, h: cardH - 1.9,
      fontSize: 12, fontFace: FONT_B, color: C.ink, margin: 0,
      paraSpaceAfter: 6,
    });
  });

  // Tagline
  s.addText("\"Aplicamos ao imobiliário a mesma disciplina, ética e rigor que aplicamos diariamente em ambiente clínico.\"", {
    x: 0.6, y: 6.75, w: 12.13, h: 0.3,
    fontSize: 11, fontFace: FONT_H, italic: true, color: C.inkSoft, align: "center", margin: 0,
  });

  addFooter(s, 3);
}

// --- Slide 4: Apresentação do Investidor ---------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "APRESENTAÇÃO DO INVESTIDOR", "Antes de avançarmos, gostaríamos de conhecê-lo melhor");

  const questions = [
    "Background profissional e percurso",
    "Experiência prévia em investimento (imobiliário e outros)",
    "Objetivos para esta alocação de capital",
    "Horizonte temporal e perfil de liquidez",
    "Apetite e tolerância ao risco",
    "Expectativas de envolvimento e reporting",
  ];

  // Two columns of question cards
  const x0 = 0.6;
  const colW = 6.06;
  const gap = 0.21;
  const rowH = 0.7;
  const startY = 2.15;

  questions.forEach((q, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = x0 + col * (colW + gap);
    const y = startY + row * (rowH + 0.15);

    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: colW, h: rowH,
      fill: { color: C.creamSoft }, line: { color: C.rule, width: 0.5 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.06, h: rowH, fill: { color: C.gold }, line: { color: C.gold, width: 0 },
    });
    s.addText(`0${i + 1}`, {
      x: x + 0.25, y, w: 0.5, h: rowH,
      fontSize: 14, fontFace: FONT_H, color: C.gold, valign: "middle", margin: 0,
    });
    s.addText(q, {
      x: x + 0.85, y, w: colW - 1.0, h: rowH,
      fontSize: 14, fontFace: FONT_B, color: C.ink, valign: "middle", margin: 0,
    });
  });

  s.addText("Espaço dedicado ao diálogo — sem agenda fechada.", {
    x: 0.6, y: 6.7, w: 12.13, h: 0.3,
    fontSize: 11, fontFace: FONT_H, italic: true, color: C.inkSoft, align: "center", margin: 0,
  });

  addFooter(s, 4);
}

// --- Slide 5: Quem é a Somnium -------------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "QUEM SOMOS", "Somnium Properties — identidade e perímetro de atuação");

  // Left: text block
  s.addText("Sociedade portuguesa dedicada a investimento imobiliário nos modelos buy-renovate-sell e buy-renovate-rent, com sede operacional no Porto e atuação centrada em Coimbra.", {
    x: 0.6, y: 2.2, w: 6.5, h: 1.5,
    fontSize: 14, fontFace: FONT_B, color: C.ink, margin: 0, paraSpaceAfter: 8,
  });

  s.addText("Operação iniciada em wholesalling para validar rede e SOPs. Hoje, escalamos para CAEP — operações maiores, com investidores passivos e retornos partilhados.", {
    x: 0.6, y: 3.7, w: 6.5, h: 1.6,
    fontSize: 14, fontFace: FONT_B, color: C.inkSoft, margin: 0,
  });

  // Right: stat cards
  const stats = [
    { label: "Sede operacional", value: "Porto" },
    { label: "Mercado-alvo", value: "Coimbra" },
    { label: "Limite por imóvel", value: "250 000€" },
    { label: "Modelo atual", value: "CAEP" },
  ];
  const x0 = 7.5;
  const w = 2.5, h = 1.8, gap = 0.2;
  stats.forEach((st, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = x0 + col * (w + gap);
    const y = 2.2 + row * (h + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h, fill: { color: C.dark }, line: { color: C.dark, width: 0 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h: 0.06, fill: { color: C.gold }, line: { color: C.gold, width: 0 },
    });
    s.addText(st.value, {
      x: x + 0.2, y: y + 0.35, w: w - 0.4, h: 0.8,
      fontSize: 26, fontFace: FONT_H, color: C.white, margin: 0,
    });
    s.addText(st.label, {
      x: x + 0.2, y: y + 1.15, w: w - 0.4, h: 0.4,
      fontSize: 10, fontFace: FONT_B, color: C.goldLight, charSpacing: 4, margin: 0,
    });
  });

  // Footer band (geographies)
  s.addText("Geografias-alvo: Concelho de Coimbra  ·  Condeixa-a-Nova  ·  Ventosa do Bairro (Mealhada)", {
    x: 0.6, y: 6.55, w: 12.13, h: 0.4,
    fontSize: 12, fontFace: FONT_H, italic: true, color: C.inkSoft, align: "center", margin: 0,
  });

  addFooter(s, 5);
}

// --- Slide 6: Tese de Investimento ---------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "TESE DE INVESTIMENTO", "Porquê Coimbra");

  const pillars = [
    { t: "Procura constante", d: "Mercado universitário com fluxo permanente de arrendamento (Universidade de Coimbra)." },
    { t: "Imóveis sub-valorizados", d: "Stock com potencial de valorização via renovação em zonas-alvo conhecidas." },
    { t: "Incentivos fiscais", d: "IMT jovens, Imposto de Selo e regime de mais-valias favoráveis." },
    { t: "Liquidez de saída", d: "Tipologias e tickets bem absorvidos pelo mercado local." },
    { t: "Conhecimento das zonas", d: "Santa Clara, Condeixa, Cernache e Mealhada — análise micro-mercado dedicada." },
    { t: "Risco controlado", d: "Limite máximo de 250.000€ por aquisição protege o portefólio." },
  ];

  const x0 = 0.6, y0 = 2.15;
  const cardW = 4.04, cardH = 2.2, gap = 0.21;

  pillars.forEach((p, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = x0 + col * (cardW + gap);
    const y = y0 + row * (cardH + 0.2);
    addCard(s, { x, y, w: cardW, h: cardH });
    s.addText(`0${i + 1}`, {
      x: x + 0.3, y: y + 0.2, w: 1.0, h: 0.4,
      fontSize: 12, fontFace: FONT_B, color: C.gold, bold: true, charSpacing: 4, margin: 0,
    });
    s.addText(p.t, {
      x: x + 0.3, y: y + 0.55, w: cardW - 0.5, h: 0.5,
      fontSize: 16, fontFace: FONT_H, color: C.ink, margin: 0,
    });
    s.addText(p.d, {
      x: x + 0.3, y: y + 1.1, w: cardW - 0.5, h: 1.0,
      fontSize: 11, fontFace: FONT_B, color: C.inkSoft, margin: 0,
    });
  });

  addFooter(s, 6);
}

// --- Slide 7: Estrutura da Empresa ---------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "ESTRUTURA DA EMPRESA", "Sociedade enxuta com departamentos dedicados");

  // Top: founders / partner row
  const top = [
    { n: "Alexandre Mendes", r: "Sócio-gerente" },
    { n: "João Abreu", r: "Sócio-gerente" },
    { n: "Luís Pedro", r: "Parceiro · Gestão de Obras" },
  ];
  const tx0 = 0.6, tw = 4.04, th = 1.0;
  top.forEach((p, i) => {
    const x = tx0 + i * (tw + 0.21);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 2.1, w: tw, h: th, fill: { color: C.dark }, line: { color: C.dark, width: 0 },
    });
    s.addText(p.n, {
      x: x + 0.3, y: 2.2, w: tw - 0.5, h: 0.45,
      fontSize: 16, fontFace: FONT_H, color: C.white, margin: 0,
    });
    s.addText(p.r, {
      x: x + 0.3, y: 2.6, w: tw - 0.5, h: 0.35,
      fontSize: 10, fontFace: FONT_B, color: C.goldLight, charSpacing: 4, margin: 0,
    });
  });

  // Departments grid
  const depts = [
    { t: "Administração", d: "Governance, contratos, fiscal" },
    { t: "Comercial", d: "Investidores · Consultores · Pipeline · Projetos" },
    { t: "Financeiro", d: "Análise, tesouraria, reporting" },
    { t: "Formação interna", d: "SOPs, onboarding, atualização contínua" },
  ];

  const dx0 = 0.6, dy = 3.5, dw = 3.0, dh = 1.55, dgap = 0.18;
  depts.forEach((d, i) => {
    const x = dx0 + i * (dw + dgap);
    addCard(s, { x, y: dy, w: dw, h: dh, fill: C.creamSoft });
    s.addText(d.t, {
      x: x + 0.25, y: dy + 0.2, w: dw - 0.4, h: 0.45,
      fontSize: 15, fontFace: FONT_H, color: C.ink, margin: 0,
    });
    s.addText(d.d, {
      x: x + 0.25, y: dy + 0.7, w: dw - 0.4, h: 0.85,
      fontSize: 11, fontFace: FONT_B, color: C.inkSoft, margin: 0,
    });
  });

  // CAEP cap line
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 5.5, w: 12.13, h: 1.1,
    fill: { color: C.creamSoft }, line: { color: C.gold, width: 0.75 },
  });
  s.addText("Modelo CAEP — até 5 investidores passivos por operação", {
    x: 0.85, y: 5.65, w: 11.6, h: 0.45,
    fontSize: 16, fontFace: FONT_H, color: C.ink, margin: 0,
  });
  s.addText("Operações fracionáveis ou completas, com termos definidos individualmente em contrato.", {
    x: 0.85, y: 6.05, w: 11.6, h: 0.45,
    fontSize: 12, fontFace: FONT_B, color: C.inkSoft, margin: 0,
  });

  addFooter(s, 7);
}

// --- Slide 8: Modelo CAEP — Como Funciona --------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "MODELO CAEP", "Contrato de Associação em Participação — como funciona");

  // Big stats row
  const stats = [
    { v: "100%", l: "Capital pelo investidor" },
    { v: "40 / 60", l: "Distribuição Somnium / Investidor" },
    { v: "6–12", l: "Meses por operação" },
    { v: "25–50k€", l: "Ticket mínimo" },
  ];
  const x0 = 0.6, w = 3.0, h = 1.5, gap = 0.18, y = 2.15;
  stats.forEach((st, i) => {
    const x = x0 + i * (w + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h, fill: { color: C.dark }, line: { color: C.dark, width: 0 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.06, h, fill: { color: C.gold }, line: { color: C.gold, width: 0 },
    });
    s.addText(st.v, {
      x: x + 0.25, y: y + 0.2, w: w - 0.4, h: 0.7,
      fontSize: 28, fontFace: FONT_H, color: C.white, margin: 0,
    });
    s.addText(st.l, {
      x: x + 0.25, y: y + 0.95, w: w - 0.4, h: 0.45,
      fontSize: 11, fontFace: FONT_B, color: C.goldLight, charSpacing: 3, margin: 0,
    });
  });

  // Two-column body
  s.addText("Enquadramento legal", {
    x: 0.6, y: 3.95, w: 6.0, h: 0.4,
    fontSize: 14, fontFace: FONT_H, color: C.gold, margin: 0,
  });
  s.addText(bullets([
    "Associação em Participação (Código Comercial)",
    "Lei 56/2023 (alojamento e arrendamento)",
    "Orçamento do Estado 2024",
  ]), {
    x: 0.6, y: 4.4, w: 6.0, h: 1.6,
    fontSize: 13, fontFace: FONT_B, color: C.ink, margin: 0, paraSpaceAfter: 6,
  });

  s.addText("Papéis e responsabilidades", {
    x: 6.9, y: 3.95, w: 6.0, h: 0.4,
    fontSize: 14, fontFace: FONT_H, color: C.gold, margin: 0,
  });
  s.addText(bullets([
    "Investidor: 100% do capital (compra + obra + custos)",
    "Somnium: originação, qualificação, compra, obra, saída",
    "Saída: retorno do capital + parte do lucro contratualizada",
  ]), {
    x: 6.9, y: 4.4, w: 6.0, h: 1.8,
    fontSize: 13, fontFace: FONT_B, color: C.ink, margin: 0, paraSpaceAfter: 6,
  });

  // Note
  s.addText("Os retornos efetivos são calculados operação a operação na App Somnium. Não apresentamos números fictícios.", {
    x: 0.6, y: 6.4, w: 12.13, h: 0.4,
    fontSize: 10, fontFace: FONT_H, italic: true, color: C.inkSoft, align: "center", margin: 0,
  });

  addFooter(s, 8);
}

// --- Slide 9: Dinâmica Operacional ---------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "DINÂMICA OPERACIONAL", "SOPs, classes de consultores e automação inteligente");

  // Left: SOPs
  s.addText("SOPs documentados em uso", {
    x: 0.6, y: 2.15, w: 6.0, h: 0.4,
    fontSize: 14, fontFace: FONT_H, color: C.gold, margin: 0,
  });
  s.addText(bullets([
    "SOP 1 — Pesquisa de Negócios",
    "SOP 4 — Análise Financeira e Estudo de Mercado",
    "SOP 5 — Visita de Qualificação",
    "SOP 6 — Documentação Mínima",
    "SOP 7 — Orçamentação (≥3 empreiteiros)",
    "SOP 10 — Apresentação a Investidor",
    "SOP 11 — Onboarding de Investidor",
  ]), {
    x: 0.6, y: 2.6, w: 6.0, h: 3.6,
    fontSize: 12, fontFace: FONT_B, color: C.ink, margin: 0, paraSpaceAfter: 4,
  });

  // Right: Classes & WhatsApp
  s.addText("Classes de consultores", {
    x: 6.9, y: 2.15, w: 6.0, h: 0.4,
    fontSize: 14, fontFace: FONT_H, color: C.gold, margin: 0,
  });
  // Class chips A B C D
  const chips = [
    { l: "A", d: "Top — contacto humano direto" },
    { l: "B", d: "Ativos — contacto humano regular" },
    { l: "C", d: "Médios — automação WhatsApp" },
    { l: "D", d: "Baixa atividade — automação WhatsApp" },
  ];
  chips.forEach((c, i) => {
    const y = 2.6 + i * 0.55;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 6.9, y, w: 0.5, h: 0.45,
      fill: { color: C.dark }, line: { color: C.dark, width: 0 },
    });
    s.addText(c.l, {
      x: 6.9, y, w: 0.5, h: 0.45,
      fontSize: 16, fontFace: FONT_H, color: C.gold, align: "center", valign: "middle", margin: 0,
    });
    s.addText(c.d, {
      x: 7.5, y, w: 5.3, h: 0.45,
      fontSize: 12, fontFace: FONT_B, color: C.ink, valign: "middle", margin: 0,
    });
  });

  // WhatsApp callout box
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 6.05, w: 12.13, h: 0.95,
    fill: { color: C.dark }, line: { color: C.dark, width: 0 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 6.05, w: 0.06, h: 0.95,
    fill: { color: C.gold }, line: { color: C.gold, width: 0 },
  });
  s.addText("Agente WhatsApp · Follow-up automatizado de consultores C/D", {
    x: 0.85, y: 6.13, w: 11.8, h: 0.4,
    fontSize: 14, fontFace: FONT_H, color: C.white, margin: 0,
  });
  s.addText("Cadência consistente sem consumir tempo dos sócios — captura oportunidades que de outra forma se perderiam.", {
    x: 0.85, y: 6.55, w: 11.8, h: 0.4,
    fontSize: 11, fontFace: FONT_B, color: C.goldLight, margin: 0,
  });

  addFooter(s, 9);
}

// --- Slide 10: App Somnium -----------------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "APP SOMNIUM", "Ferramenta proprietária — análise quantitativa antes de cada decisão");

  const modules = [
    { t: "Calculadora de Investimento", d: "Compra, IMT, IS, obra, venda, lucro bruto e líquido, ROI, ROI anualizado." },
    { t: "Stress Tests", d: "Cenários moderado e severo aplicados automaticamente antes da decisão." },
    { t: "Comparáveis", d: "VVR validado por método comparativo cruzado com método de rendimento." },
    { t: "Tabelas Fiscais", d: "IMT, IS, mais-valias, regime jovens, OE 2024, Lei 56/2023 atualizadas." },
    { t: "Simulador CAEP", d: "Distribuição de resultados Somnium / Investidor para cada operação concreta." },
  ];

  const x0 = 0.6, w = 4.04, h = 1.85, gap = 0.21;
  modules.forEach((m, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = x0 + col * (w + gap);
    const y = 2.15 + row * (h + 0.22);
    addCard(s, { x, y, w, h, fill: C.creamSoft });
    s.addText(`0${i + 1}`, {
      x: x + 0.25, y: y + 0.2, w: 0.8, h: 0.35,
      fontSize: 11, fontFace: FONT_B, color: C.gold, bold: true, charSpacing: 4, margin: 0,
    });
    s.addText(m.t, {
      x: x + 0.25, y: y + 0.5, w: w - 0.4, h: 0.45,
      fontSize: 15, fontFace: FONT_H, color: C.ink, margin: 0,
    });
    s.addText(m.d, {
      x: x + 0.25, y: y + 1.0, w: w - 0.4, h: 0.85,
      fontSize: 11, fontFace: FONT_B, color: C.inkSoft, margin: 0,
    });
  });

  s.addText("O investidor passivo tem acesso direto às simulações da sua operação na app.", {
    x: 0.6, y: 6.45, w: 12.13, h: 0.4,
    fontSize: 12, fontFace: FONT_H, italic: true, color: C.inkSoft, align: "center", margin: 0,
  });

  addFooter(s, 10);
}

// --- Slide 11: Processo de Aquisição -------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "PROCESSO DE AQUISIÇÃO", "Do funil ao fecho — funcionamento real do SOP 1 ao SOP 11");

  const steps = [
    { n: "01", t: "Pesquisa", d: "Originação por consultores e rede própria (SOP 1)." },
    { n: "02", t: "Qualificação", d: "Mín. 2 de 3 critérios: equity, obra, pressão de venda." },
    { n: "03", t: "Análise", d: "≥5 comparáveis, VVR, MAO 64% / 70% (SOP 4)." },
    { n: "04", t: "Stress Tests", d: "Moderado obrigatório; severo simulado." },
    { n: "05", t: "Capital Commitment", d: "70% comprometido por escrito antes do CPCV." },
    { n: "06", t: "Compra & Obra", d: "Visita técnica, orçamentação ≥3 (SOP 5, 7)." },
    { n: "07", t: "Saída", d: "Venda ou arrendamento conforme tese da operação." },
  ];

  const x0 = 0.6, y0 = 2.2, w = 1.69, h = 4.4, gap = 0.05;
  steps.forEach((st, i) => {
    const x = x0 + i * (w + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: y0, w, h,
      fill: { color: C.creamSoft }, line: { color: C.rule, width: 0.5 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: y0, w, h: 0.06, fill: { color: C.gold }, line: { color: C.gold, width: 0 },
    });
    s.addText(st.n, {
      x: x + 0.15, y: y0 + 0.2, w: w - 0.3, h: 0.35,
      fontSize: 11, fontFace: FONT_B, color: C.gold, bold: true, charSpacing: 3, margin: 0,
    });
    s.addText(st.t, {
      x: x + 0.15, y: y0 + 0.55, w: w - 0.3, h: 0.6,
      fontSize: 13, fontFace: FONT_H, color: C.ink, margin: 0,
    });
    s.addText(st.d, {
      x: x + 0.15, y: y0 + 1.25, w: w - 0.3, h: 3.0,
      fontSize: 10, fontFace: FONT_B, color: C.inkSoft, margin: 0,
    });
  });

  s.addText("Negócio só avança se sobreviver ao stress test moderado.", {
    x: 0.6, y: 6.75, w: 12.13, h: 0.3,
    fontSize: 11, fontFace: FONT_H, italic: true, color: C.gold, align: "center", margin: 0,
  });

  addFooter(s, 11);
}

// --- Slide 12: Caso Prático — T2 Condeixa --------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "CASO PRÁTICO EM CURSO", "T2 Condeixa — wholesalling em fase de obras");

  // Left: details list
  const rows = [
    ["Localização", "Cernache · Concelho de Coimbra"],
    ["Tipologia", "T2  ·  ABP 70 m²"],
    ["Ask Price", "130.000 €"],
    ["Origem", "Referência por consultores parceiros"],
    ["Modelo", "Wholesalling — cedência de posição contratual"],
    ["Margem prevista", "2.800 – 3.000 €"],
    ["Estado atual", "Em fase de obras"],
  ];

  const tableY = 2.2, rowH = 0.45;
  rows.forEach(([k, v], i) => {
    const y = tableY + i * rowH;
    s.addText(k, {
      x: 0.6, y, w: 2.4, h: rowH,
      fontSize: 11, fontFace: FONT_B, color: C.gold, bold: true, charSpacing: 3, valign: "middle", margin: 0,
    });
    s.addText(v, {
      x: 3.0, y, w: 4.5, h: rowH,
      fontSize: 14, fontFace: FONT_H, color: C.ink, valign: "middle", margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y: y + rowH - 0.01, w: 6.9, h: 0.01,
      fill: { color: C.rule }, line: { color: C.rule, width: 0 },
    });
  });

  // Right: narrative card
  s.addShape(pres.shapes.RECTANGLE, {
    x: 8.0, y: 2.2, w: 4.73, h: 4.4,
    fill: { color: C.dark }, line: { color: C.dark, width: 0 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 8.0, y: 2.2, w: 4.73, h: 0.06,
    fill: { color: C.gold }, line: { color: C.gold, width: 0 },
  });
  s.addText("O que este caso demonstra", {
    x: 8.25, y: 2.4, w: 4.3, h: 0.45,
    fontSize: 16, fontFace: FONT_H, color: C.white, margin: 0,
  });
  s.addText(bullets([
    "Capacidade de originação e qualificação real",
    "SOPs em uso da pesquisa ao fecho",
    "Investidor ativo aceitou a operação em janeiro de 2025",
    "Operação ainda não concluída — transparência total",
    "Base validada que justifica a transição para CAEP",
  ]), {
    x: 8.25, y: 2.95, w: 4.3, h: 3.5,
    fontSize: 12, fontFace: FONT_B, color: C.goldLight, margin: 0, paraSpaceAfter: 6,
  });

  addFooter(s, 12);
}

// --- Slide 13: Evolução do Modelo ----------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "EVOLUÇÃO DO MODELO", "De Wholesalling para CAEP — porque agora");

  // Two-column comparison
  const cols = [
    {
      title: "Wholesalling",
      sub: "Fase 1 — validação",
      points: [
        "Cedência de posição contratual a investidores ativos",
        "Validação da rede de originação sem expor capital alheio",
        "Refinamento de SOPs em operações reais",
        "Construção de relação com consultores e proprietários",
      ],
      bg: C.creamSoft,
      acc: C.muted,
      txt: C.ink,
      sub2: C.inkSoft,
    },
    {
      title: "CAEP",
      sub: "Fase 2 — escala",
      points: [
        "Operações maiores com capital de investidores passivos",
        "Retornos partilhados via Associação em Participação",
        "Pipeline e SOPs já validados em campo",
        "Rede de consultores e empreiteiros estabelecida",
      ],
      bg: C.dark,
      acc: C.gold,
      txt: C.white,
      sub2: C.goldLight,
    },
  ];

  const x0 = 0.6, w = 6.06, h = 4.5, gap = 0.21, y = 2.15;
  cols.forEach((c, i) => {
    const x = x0 + i * (w + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h, fill: { color: c.bg }, line: { color: c.bg, width: 0 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h: 0.06, fill: { color: c.acc }, line: { color: c.acc, width: 0 },
    });
    s.addText(c.sub, {
      x: x + 0.35, y: y + 0.25, w: w - 0.6, h: 0.35,
      fontSize: 11, fontFace: FONT_B, color: c.acc, bold: true, charSpacing: 4, margin: 0,
    });
    s.addText(c.title, {
      x: x + 0.35, y: y + 0.6, w: w - 0.6, h: 0.6,
      fontSize: 26, fontFace: FONT_H, color: c.txt, margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.35, y: y + 1.25, w: 0.6, h: 0.03,
      fill: { color: c.acc }, line: { color: c.acc, width: 0 },
    });
    s.addText(bullets(c.points), {
      x: x + 0.35, y: y + 1.45, w: w - 0.6, h: h - 1.6,
      fontSize: 12, fontFace: FONT_B, color: c.txt, margin: 0, paraSpaceAfter: 6,
    });
  });

  s.addText("A escala faz-se sobre uma base provada — não sobre uma promessa.", {
    x: 0.6, y: 6.85, w: 12.13, h: 0.3,
    fontSize: 11, fontFace: FONT_H, italic: true, color: C.inkSoft, align: "center", margin: 0,
  });

  addFooter(s, 13);
}

// --- Slide 14: Gestão de Risco -------------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "GESTÃO DE RISCO", "Limites, stress tests e Capital Commitment Policy");

  const items = [
    { t: "Diversificação geográfica controlada", d: "3 micro-mercados conhecidos a fundo." },
    { t: "Limite máximo por aquisição", d: "250.000€ por imóvel — controla o risco de cada operação." },
    { t: "Stress tests obrigatórios", d: "Moderado (VVR −10%, obra +10%, +3 meses) e Severo (VVR −20%, obra +20%, +6 meses)." },
    { t: "Due diligence por SOP", d: "Jurídica e técnica documentada antes de cada decisão." },
    { t: "Reservas operacionais", d: "Plano de contingência por operação." },
    { t: "Capital Commitment Policy 70%", d: "70% do capital comprometido por escrito antes de assinar CPCV." },
  ];

  const x0 = 0.6, y0 = 2.15, w = 6.06, h = 1.4, gap = 0.21;
  items.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = x0 + col * (w + gap);
    const y = y0 + row * (h + 0.18);
    addCard(s, { x, y, w, h, fill: C.creamSoft });
    s.addText(it.t, {
      x: x + 0.3, y: y + 0.2, w: w - 0.5, h: 0.5,
      fontSize: 14, fontFace: FONT_H, color: C.ink, margin: 0,
    });
    s.addText(it.d, {
      x: x + 0.3, y: y + 0.7, w: w - 0.5, h: 0.65,
      fontSize: 11, fontFace: FONT_B, color: C.inkSoft, margin: 0,
    });
  });

  addFooter(s, 14);
}

// --- Slide 15: Reporting -------------------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "REPORTING AO INVESTIDOR", "Cadência estruturada e canais definidos");

  const cadence = [
    { t: "Relatório mensal", d: "Estruturado, com KPIs operacionais e financeiros." },
    { t: "Drive partilhada", d: "Pasta dedicada ao investidor com toda a documentação." },
    { t: "Updates de obra", d: "Fotografias antes / durante / depois em cada milestone." },
    { t: "Reuniões de seguimento", d: "Agendadas em calendário com pauta definida." },
    { t: "Comunicação proativa", d: "Proposta aceite, escritura, milestones de obra, venda." },
    { t: "App Somnium — acesso direto", d: "Simulações da operação disponíveis em qualquer momento." },
  ];

  const x0 = 0.6, y0 = 2.15, w = 4.04, h = 2.2, gap = 0.21;
  cadence.forEach((c, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = x0 + col * (w + gap);
    const y = y0 + row * (h + 0.2);
    addCard(s, { x, y, w, h, fill: C.creamSoft });
    s.addText(`0${i + 1}`, {
      x: x + 0.3, y: y + 0.2, w: 0.8, h: 0.4,
      fontSize: 11, fontFace: FONT_B, color: C.gold, bold: true, charSpacing: 4, margin: 0,
    });
    s.addText(c.t, {
      x: x + 0.3, y: y + 0.55, w: w - 0.5, h: 0.5,
      fontSize: 15, fontFace: FONT_H, color: C.ink, margin: 0,
    });
    s.addText(c.d, {
      x: x + 0.3, y: y + 1.1, w: w - 0.5, h: 1.0,
      fontSize: 11, fontFace: FONT_B, color: C.inkSoft, margin: 0,
    });
  });

  addFooter(s, 15);
}

// --- Slide 16: Próximos Passos -------------------------------------------
{
  const s = pres.addSlide();
  addCreamBackground(s);
  addContentHeader(s, "PRÓXIMOS PASSOS", "Como avançamos a partir desta conversa");

  const steps = [
    { n: "01", t: "Definição de termos", d: "Alinhamento do ticket, horizonte temporal e expectativas de envolvimento." },
    { n: "02", t: "Análise de operação concreta", d: "Apresentação de oportunidade qualificada com simulação CAEP completa na App." },
    { n: "03", t: "Contrato CAEP", d: "Formalização jurídica da operação e Capital Commitment de 70%." },
    { n: "04", t: "Execução e reporting", d: "Operação em curso com cadência de reporting acordada." },
  ];

  const y0 = 2.15;
  steps.forEach((st, i) => {
    const y = y0 + i * 1.05;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y, w: 12.13, h: 0.95,
      fill: { color: C.creamSoft }, line: { color: C.rule, width: 0.5 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y, w: 0.06, h: 0.95,
      fill: { color: C.gold }, line: { color: C.gold, width: 0 },
    });
    s.addText(st.n, {
      x: 0.85, y, w: 1.0, h: 0.95,
      fontSize: 26, fontFace: FONT_H, color: C.gold, valign: "middle", margin: 0,
    });
    s.addText(st.t, {
      x: 1.95, y: y + 0.13, w: 4.5, h: 0.4,
      fontSize: 17, fontFace: FONT_H, color: C.ink, margin: 0,
    });
    s.addText(st.d, {
      x: 1.95, y: y + 0.5, w: 10.5, h: 0.4,
      fontSize: 12, fontFace: FONT_B, color: C.inkSoft, margin: 0,
    });
  });

  addFooter(s, 16);
}

// --- Slide 17: Obrigado / Contactos --------------------------------------
{
  const s = pres.addSlide();
  addDarkBackground(s);

  // Decorative gold band on left
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.35, h: H, fill: { color: C.gold }, line: { color: C.gold, width: 0 },
  });

  // Logo
  s.addImage({ path: LOGO_TRANSPARENT, x: 1.0, y: 0.8, w: 3.0, h: 1.21 });

  // Title
  s.addText("Obrigado.", {
    x: 1.0, y: 2.4, w: 11.5, h: 1.0,
    fontSize: 60, fontFace: FONT_H, color: C.white, margin: 0,
  });

  // Subtitle
  s.addText("Disponíveis para responder a qualquer questão.", {
    x: 1.0, y: 3.45, w: 11.5, h: 0.5,
    fontSize: 16, fontFace: FONT_H, italic: true, color: C.goldLight, margin: 0,
  });

  // Contacts row
  const contacts = [
    { n: "Alexandre Mendes", r: "Sócio-gerente", e: "geral@somniumproperties.pt" },
    { n: "João Abreu", r: "Sócio-gerente", e: "geral@somniumproperties.pt" },
    { n: "Luís Pedro", r: "Parceiro · Gestão de Obras", e: "geral@somniumproperties.pt" },
  ];
  const cx0 = 1.0, cw = 3.7, ch = 1.7, cgap = 0.25, cy = 4.5;
  contacts.forEach((c, i) => {
    const x = cx0 + i * (cw + cgap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: ch,
      fill: { color: C.darkLight }, line: { color: C.darkLight, width: 0 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: 0.05,
      fill: { color: C.gold }, line: { color: C.gold, width: 0 },
    });
    s.addText(c.n, {
      x: x + 0.3, y: cy + 0.2, w: cw - 0.5, h: 0.45,
      fontSize: 16, fontFace: FONT_H, color: C.white, margin: 0,
    });
    s.addText(c.r, {
      x: x + 0.3, y: cy + 0.65, w: cw - 0.5, h: 0.35,
      fontSize: 10, fontFace: FONT_B, color: C.gold, charSpacing: 4, bold: true, margin: 0,
    });
    s.addText(c.e, {
      x: x + 0.3, y: cy + 1.05, w: cw - 0.5, h: 0.4,
      fontSize: 12, fontFace: FONT_B, color: C.goldLight, margin: 0,
    });
  });

  // Footer
  s.addText("Somnium Properties  ·  Porto, Portugal", {
    x: 1.0, y: 6.7, w: 11.5, h: 0.4,
    fontSize: 11, fontFace: FONT_B, color: C.muted, charSpacing: 4, margin: 0,
  });
}

// --- Save -----------------------------------------------------------------
const outPath = path.resolve("/tmp/Somnium_Apresentacao_Investidor.pptx");
pres.writeFile({ fileName: outPath }).then((p) => {
  console.log("WROTE:", p);
});
