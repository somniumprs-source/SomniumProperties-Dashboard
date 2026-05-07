// Apresentação Investidores — PDF (10 slides 16:9, fundo claro, +grafismo)
// Replica visual do gerador_30min_v2 mas com pdfkit nativo.
// CAEP 40% Somnium / 60% Investidor.
const PDFDocument = require("pdfkit");
const fs = require("fs");

const LOGO_DARK = "/home/user/SomniumProperties-Dashboard/public/logo-dark.png";
const LOGO_TRANSPARENT = "/home/user/SomniumProperties-Dashboard/public/logo-transparent.png";

const C = {
  gold: "#C9A84C",
  goldSoft: "#E8D08A",
  goldFaint: "#F2E8C4",
  black: "#0D0D0D",
  body: "#2A2A2A",
  muted: "#888888",
  bg: "#F7F6F2",
  bgWarm: "#FBF8EE",
  light: "#F0EFE9",
  totalBg: "#F5F3EE",
  border: "#E0DDD5",
  borderSoft: "#ECE7D6",
  green: "#2D6A2D",
  greenSoft: "#D6E5D0",
  red: "#8B2020",
  redSoft: "#F0D6D6",
  amberSoft: "#F5E6C4",
  white: "#FFFFFF",
};

// 16:9 page (960 x 540 pt)
const W = 960, H = 540;
const ML = 40, MR = 40;
const CW = W - ML - MR;
const BAR = 5; // gold bar height
const TOTAL = 10;

const FONT_R = "Helvetica";
const FONT_B = "Helvetica-Bold";
const FONT_I = "Helvetica-Oblique";

const out = "/tmp/recolor/Apresentacao_Investidores_30min_Somnium.pdf";
const doc = new PDFDocument({ size: [W, H], margin: 0, info: {
  Title: "Apresentação a Investidores — Somnium Properties",
  Author: "Somnium Properties",
  Subject: "Investimento Imobiliário",
}});
doc.pipe(fs.createWriteStream(out));

// ── helpers ─────────────────────────────────────────────────
const filledRect = (x, y, w, h, color) => doc.save().fillColor(color).rect(x, y, w, h).fill().restore();
const strokedRect = (x, y, w, h, color, lw = 0.75) => doc.save().lineWidth(lw).strokeColor(color).rect(x, y, w, h).stroke().restore();
const filledRoundRect = (x, y, w, h, r, color) => doc.save().fillColor(color).roundedRect(x, y, w, h, r).fill().restore();
const strokedRoundRect = (x, y, w, h, r, color, lw = 0.75) => doc.save().lineWidth(lw).strokeColor(color).roundedRect(x, y, w, h, r).stroke().restore();
const filledCircle = (cx, cy, r, color) => doc.save().fillColor(color).circle(cx, cy, r).fill().restore();
const strokedCircle = (cx, cy, r, color, lw = 1) => doc.save().lineWidth(lw).strokeColor(color).circle(cx, cy, r).stroke().restore();

function txt(text, x, y, w, opts = {}) {
  const {
    font = FONT_R, size = 10, color = C.body, align = "left",
    charSpacing = 0, lineGap = 0, height = null,
  } = opts;
  doc.save();
  doc.font(font).fontSize(size).fillColor(color);
  const o = { width: w, align, lineGap, characterSpacing: charSpacing };
  if (height != null) o.height = height;
  doc.text(text, x, y, o);
  doc.restore();
}

function topBars() {
  filledRect(0, 0, W, BAR, C.gold);
  filledRect(0, H - BAR, W, BAR, C.gold);
}

function cornerBrackets() {
  const t = 1.8, len = 32, m = 22;
  // top-left
  filledRect(m, m + 11, len, t, C.gold);
  filledRect(m, m + 11, t, len, C.gold);
  // top-right
  filledRect(W - m - len, m + 11, len, t, C.gold);
  filledRect(W - m - t, m + 11, t, len, C.gold);
  // bottom-left
  filledRect(m, H - m - t - 11, len, t, C.gold);
  filledRect(m, H - m - len - 11, t, len, C.gold);
  // bottom-right
  filledRect(W - m - len, H - m - t - 11, len, t, C.gold);
  filledRect(W - m - t, H - m - len - 11, t, len, C.gold);
}

function dotPattern(x, y, cols, rows, gap = 13, color = C.goldFaint, dotR = 1.4) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      filledCircle(x + c * gap, y + r * gap, dotR, color);
    }
  }
}

function lightChrome(eyebrow, title, pageNum) {
  filledRect(0, 0, W, H, C.bg);
  topBars();
  // Logo top-left (logo-dark.png is 1516x614)
  const logoH = 22;
  const logoW = logoH * (1516 / 614);
  doc.image(LOGO_DARK, ML, 20, { height: logoH });
  // Eyebrow
  if (eyebrow) {
    txt(eyebrow.toUpperCase(), ML + logoW + 14, 24, CW - logoW - 90, {
      font: FONT_R, size: 7, color: C.muted, charSpacing: 1.4,
    });
  }
  // Page number
  txt(`${String(pageNum).padStart(2, "0")} / ${TOTAL}`, W - MR - 80, 24, 80, {
    font: FONT_R, size: 7.5, color: C.muted, charSpacing: 0.8, align: "right",
  });
  // Gold rule under header
  filledRect(ML, 50, CW, 1.8, C.gold);
  // Gold rule above footer
  filledRect(ML, H - 40, CW, 0.6, C.gold);
  txt("Confidencial · Somnium Properties · Investimento Imobiliário",
    ML, H - 32, CW, { font: FONT_R, size: 6, color: C.muted, charSpacing: 1.1, align: "center" });
  // Title
  if (title) {
    txt(title, ML, 65, CW, { font: FONT_B, size: 21, color: C.body });
  }
}

// ─────────────────────────────────────────────────────────────
// SLIDE 1 — CAPA
// ─────────────────────────────────────────────────────────────
function slide1() {
  filledRect(0, 0, W, H, C.bg);
  topBars();
  cornerBrackets();
  dotPattern(W - 180, 70, 10, 6, 16);
  dotPattern(40, H - 150, 10, 6, 16);

  // Logo centrado (transparent — sem fundo branco)
  const logoW = 360;
  const logoH = logoW * (614 / 1516);
  const blockTop = (H - (logoH + 130)) / 2;
  doc.image(LOGO_TRANSPARENT, (W - logoW) / 2, blockTop, { width: logoW });

  // Accent rule longo
  const accent1Y = blockTop + logoH + 32;
  filledRect(ML + 140, accent1Y, CW - 280, 0.6, C.gold);
  // Diamond marker
  doc.save().fillColor(C.gold);
  doc.moveTo(W / 2, accent1Y - 4).lineTo(W / 2 + 4, accent1Y).lineTo(W / 2, accent1Y + 4).lineTo(W / 2 - 4, accent1Y).fill();
  doc.restore();

  txt("Investimento e Gestão de Ativos", ML, accent1Y + 18, CW, {
    font: FONT_B, size: 28, color: C.body, align: "center",
  });
  txt("RIGOR CLÍNICO  ·  TRANSPARÊNCIA TOTAL  ·  RENTABILIDADE", ML, accent1Y + 60, CW, {
    font: FONT_R, size: 9, color: C.gold, align: "center", charSpacing: 3,
  });
  txt("Uma abordagem de 'Zero Improviso' ao investimento imobiliário.", ML, accent1Y + 86, CW, {
    font: FONT_I, size: 10, color: C.muted, align: "center",
  });

  filledRect(ML, H - 50, CW, 0.6, C.gold);
  txt("Preparado para Investidores Privados  ·  Coimbra  ·  Portugal", ML, H - 40, CW, {
    font: FONT_R, size: 7, color: C.muted, charSpacing: 1.4, align: "center",
  });
  txt("Documento Confidencial", ML, H - 26, CW, {
    font: FONT_R, size: 6.5, color: C.muted, charSpacing: 1.4, align: "center",
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 2 — O DESAFIO
// ─────────────────────────────────────────────────────────────
function slide2() {
  lightChrome("Contexto", "O valor não está apenas no ativo. Está na execução.", 2);

  txt("Investir sozinho expõe a três assimetrias de mercado:", ML, 120, CW, {
    font: FONT_I, size: 10, color: C.muted, align: "center",
  });

  const cards = [
    { t: "Tempo", n: "01", d: "Prospeção, negociação e gestão de obras consomem semanas inteiras a cada negócio.", icon: "clock" },
    { t: "Risco", n: "02", d: "Decisões emocionais e derrapagens financeiras não calculadas geram perdas evitáveis.", icon: "warn" },
    { t: "Execução", n: "03", d: "Empreiteiros incertos, sem rede e sem poder negocial. Cada obra é um salto no escuro.", icon: "net" },
  ];
  const cy = 165, ch = 280, gap = 18;
  const cw = (CW - 2 * gap) / 3;

  cards.forEach((p, i) => {
    const x = ML + i * (cw + gap);
    filledRoundRect(x, cy, cw, ch, 7, C.bgWarm);
    strokedRoundRect(x, cy, cw, ch, 7, C.borderSoft, 0.75);

    // Numero gigante decorativo
    txt(p.n, x + cw - 75, cy + 8, 70, { font: FONT_B, size: 56, color: C.goldFaint });

    // Icon area
    const ix = x + cw / 2 - 38, iy = cy + 28, isz = 76;
    if (p.icon === "clock") {
      filledCircle(ix + isz / 2, iy + isz / 2, isz / 2, C.goldFaint);
      strokedCircle(ix + isz / 2, iy + isz / 2, isz / 2, C.gold, 1.5);
      filledCircle(ix + isz / 2, iy + 8, 2.5, C.gold);
      // hands
      doc.save().lineWidth(2).strokeColor(C.body)
        .moveTo(ix + isz / 2, iy + isz / 2).lineTo(ix + isz / 2, iy + isz / 2 - 22).stroke()
        .moveTo(ix + isz / 2, iy + isz / 2).lineTo(ix + isz / 2 + 18, iy + isz / 2).stroke()
        .restore();
    } else if (p.icon === "warn") {
      // Triangle
      doc.save().fillColor(C.goldFaint).strokeColor(C.gold).lineWidth(1.5)
        .moveTo(ix + isz / 2, iy)
        .lineTo(ix + isz, iy + isz)
        .lineTo(ix, iy + isz)
        .closePath().fillAndStroke().restore();
      txt("!", ix, iy + 18, isz, { font: FONT_B, size: 36, color: C.body, align: "center" });
    } else {
      // Network
      const cxI = ix + isz / 2, cyI = iy + isz / 2;
      const nodes = [
        { dx: 0, dy: -28 },
        { dx: 26, dy: 0 },
        { dx: -26, dy: 0 },
        { dx: 0, dy: 26 },
      ];
      // Lines
      doc.save().strokeColor(C.gold).lineWidth(1);
      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          doc.moveTo(cxI + nodes[a].dx, cyI + nodes[a].dy).lineTo(cxI + nodes[b].dx, cyI + nodes[b].dy).stroke();
        }
      }
      doc.restore();
      filledCircle(cxI, cyI, 7, C.gold);
      nodes.forEach(n => {
        filledCircle(cxI + n.dx, cyI + n.dy, 6, C.bgWarm);
        strokedCircle(cxI + n.dx, cyI + n.dy, 6, C.gold, 1.5);
      });
    }

    txt(p.t, x + 20, cy + 130, cw - 40, { font: FONT_B, size: 18, color: C.body, align: "center" });
    filledRect(x + cw / 2 - 16, cy + 168, 32, 1.8, C.gold);
    txt(p.d, x + 26, cy + 184, cw - 52, { font: FONT_R, size: 9, color: C.body, align: "center", lineGap: 2 });
  });

  txt("→  A Somnium Properties resolve esta assimetria com método.", ML, cy + ch + 14, CW, {
    font: FONT_I, size: 9, color: C.gold, align: "center",
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 3 — FILOSOFIA + EQUIPA
// ─────────────────────────────────────────────────────────────
function slide3() {
  lightChrome("Quem Somos", "Filosofia 'Zero Improviso'", 3);

  // Pulse line decorativa
  const pulseY = 122;
  doc.save().strokeColor(C.gold).lineWidth(1);
  doc.moveTo(ML + 110, pulseY).lineTo(ML + 110 + 220, pulseY);
  let px = ML + 110 + 220, py = pulseY;
  const pulses = [[6, -4], [6, 14], [6, -20], [6, 14], [6, -4], [8, 0]];
  pulses.forEach(([dx, dy]) => {
    doc.lineTo(px + dx, py + dy);
    px += dx; py += dy;
  });
  doc.lineTo(W - ML - 110, pulseY).stroke().restore();

  txt("Aplicamos ao imobiliário a disciplina, ética e rigor da área da Saúde — onde o erro não é uma opção.",
    ML + 70, 142, CW - 140, { font: FONT_I, size: 13, color: C.body, align: "center" });

  // 3 traços + card equipa
  const traits = [
    { t: "Origem Clínica", d: "Fundadores com background em Saúde aplicam protocolos rigorosos." },
    { t: "Dados sobre Instinto", d: "Cada decisão sustentada por análise quantitativa e simulação." },
    { t: "Rede Validada", d: "Equipa técnica + 72 parceiros operacionais já testados no terreno." },
  ];
  const ty = 215, tw = 440, gap = 12;
  const trH = 60;
  traits.forEach((tr, i) => {
    const y = ty + i * (trH + gap);
    filledRoundRect(ML, y, tw, trH, 4, C.bgWarm);
    strokedRoundRect(ML, y, tw, trH, 4, C.borderSoft, 0.75);
    // Numero badge gold
    filledCircle(ML + 26, y + trH / 2, 18, C.gold);
    txt(`0${i + 1}`, ML + 8, y + trH / 2 - 7, 36, { font: FONT_B, size: 12, color: C.black, align: "center" });
    txt(tr.t, ML + 56, y + 12, tw - 70, { font: FONT_B, size: 12, color: C.body });
    txt(tr.d, ML + 56, y + 30, tw - 70, { font: FONT_R, size: 9, color: C.body });
  });

  // Card direita: equipa
  const ex = ML + tw + 30;
  const ew = CW - tw - 30;
  const ey = ty;
  const eh = 3 * trH + 2 * gap;
  filledRoundRect(ex, ey, ew, eh, 6, C.totalBg);
  strokedRoundRect(ex, ey, ew, eh, 6, C.gold, 1);
  filledRect(ex, ey, ew, 3, C.gold);
  txt("EQUIPA", ex + 18, ey + 14, ew - 36, { font: FONT_B, size: 7, color: C.gold, charSpacing: 2 });
  const team = [
    { n: "Alexandre Mendes & João Abreu", r: "Fundadores  ·  Gestão clínica" },
    { n: "Luís", r: "Gestor de Obra  ·  Construção e licenciamento" },
    { n: "João", r: "Consultor Estratégico  ·  Visão macro" },
  ];
  team.forEach((m, i) => {
    const my = ey + 38 + i * 60;
    filledRect(ex + 18, my, 24, 1.8, C.gold);
    txt(m.n, ex + 18, my + 6, ew - 36, { font: FONT_B, size: 10, color: C.body });
    txt(m.r, ex + 18, my + 24, ew - 36, { font: FONT_I, size: 8.5, color: C.muted });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 4 — A CIÊNCIA DA COMPRA (gauge + fórmula)
// ─────────────────────────────────────────────────────────────
function slide4() {
  lightChrome("PILAR I  ·  Segurança & Rigor", "A Ciência da Compra", 4);

  // Esq: gauge card
  const gx = ML, gy = 138, gw = 360, gh = 188;
  filledRoundRect(gx, gy, gw, gh, 7, C.bgWarm);
  strokedRoundRect(gx, gy, gw, gh, 7, C.borderSoft, 0.75);
  txt("LINHA DE SEGURANÇA", gx + 22, gy + 18, gw - 44,
    { font: FONT_B, size: 7, color: C.gold, charSpacing: 2 });
  txt("MAO sobre o VVR", gx + 22, gy + 38, gw - 44,
    { font: FONT_B, size: 12, color: C.body });

  // Barra horizontal com zona segura 64-70%
  const barX = gx + 30, barY = gy + 102, barW = gw - 60, barH = 22;
  filledRect(barX, barY, barW, barH, C.light);
  strokedRect(barX, barY, barW, barH, C.border, 0.5);
  filledRect(barX + barW * 0.64, barY, barW * 0.06, barH, C.gold);
  // Marks
  ["0%", "50%", "100%"].forEach((t, i) => {
    const px = barX + barW * (i / 2);
    filledRect(px - 0.4, barY + barH, 0.8, 5, C.muted);
    txt(t, px - 14, barY + barH + 7, 28, { font: FONT_R, size: 6.5, color: C.muted, align: "center" });
  });
  // 64-70% label + arrow
  txt("64–70%", barX + barW * 0.55, barY - 18, barW * 0.2,
    { font: FONT_B, size: 9, color: C.gold, align: "center" });
  // small triangle pointing down at gold zone
  doc.save().fillColor(C.gold)
    .moveTo(barX + barW * 0.67, barY - 4)
    .lineTo(barX + barW * 0.67 + 4, barY - 9)
    .lineTo(barX + barW * 0.67 - 4, barY - 9)
    .fill().restore();
  txt("Margem clínica preservada antes de qualquer proposta.", gx + 22, gy + gh - 26, gw - 44,
    { font: FONT_I, size: 8, color: C.muted, align: "center" });

  // Dir: 3 mini-cards
  const ix0 = gx + gw + 22;
  const iw = CW - gw - 22;
  const items = [
    { t: "Validação Cruzada", d: "Mínimo 5 comparáveis cruzados com avaliadores e parceiros locais." },
    { t: "Ajuste Matemático", d: "Correções automáticas por área, localização, idade e conservação." },
    { t: "Linha de Segurança", d: "MAO calcula sempre a margem antes de avançar para proposta." },
  ];
  items.forEach((it, i) => {
    const y = gy + i * (gh / 3 + 4);
    filledRect(ix0, y, 3, gh / 3 - 6, C.gold);
    txt(it.t, ix0 + 12, y, iw - 12, { font: FONT_B, size: 11, color: C.body });
    txt(it.d, ix0 + 12, y + 18, iw - 12, { font: FONT_R, size: 9, color: C.body, lineGap: 1 });
  });

  // Formula box
  const fy = gy + gh + 22;
  filledRoundRect(ML, fy, CW, 96, 7, C.totalBg);
  strokedRoundRect(ML, fy, CW, 96, 7, C.gold, 1.5);
  filledRect(ML, fy + 96 - 3, CW, 3, C.gold);
  txt("MAO  =  ( VVR  ×  0,64  a  0,70 )  −  Custo de Obra", ML, fy + 22, CW,
    { font: FONT_B, size: 22, color: C.body, align: "center" });
  txt("Maximum Allowable Offer  ·  Nunca compramos acima da linha de segurança 64–70% do VVR.",
    ML, fy + 60, CW, { font: FONT_I, size: 9, color: C.gold, align: "center" });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 5 — STRESS TESTS
// ─────────────────────────────────────────────────────────────
function slide5() {
  lightChrome("PILAR I  ·  Segurança & Rigor", "Obsessão com o Risco: Stress Tests", 5);

  txt("Cada operação simulada em três cenários antes de avançar:", ML, 120, CW,
    { font: FONT_I, size: 10, color: C.muted, align: "center" });

  const cards = [
    { t: "Cenário Base", v: "0%", desc: "Plano ideal", cost: "Conservador", ret: "Sem buffer", color: C.green, soft: C.greenSoft },
    { t: "Stress Moderado", v: "-10%", desc: "VVR", cost: "+10% Custo Obra", ret: "+3 meses retenção", color: C.gold, soft: C.amberSoft },
    { t: "Stress Severo", v: "-20%", desc: "VVR", cost: "+20% Custo Obra", ret: "+6 meses retenção", color: C.red, soft: C.redSoft },
  ];
  const cy = 158, ch = 240, gap = 22;
  const cw = (CW - 2 * gap) / 3;

  cards.forEach((c, i) => {
    const x = ML + i * (cw + gap);
    filledRoundRect(x, cy, cw, ch, 7, C.bgWarm);
    strokedRoundRect(x, cy, cw, ch, 7, c.color, 1.5);
    // Header soft
    filledRoundRect(x, cy, cw, 38, 7, c.soft);
    filledRect(x, cy + 28, cw, 10, c.soft);
    txt(`0${i + 1}`, x + 16, cy + 12, 28, { font: FONT_B, size: 11, color: c.color });
    txt(c.t.toUpperCase(), x + 50, cy + 14, cw - 60, { font: FONT_B, size: 9, color: c.color, charSpacing: 2 });
    // Big number
    txt(c.v, x, cy + 60, cw, { font: FONT_B, size: 50, color: c.color, align: "center" });
    txt(c.desc, x, cy + 130, cw, { font: FONT_R, size: 9, color: C.muted, align: "center", charSpacing: 1.5 });
    filledRect(x + cw / 2 - 22, cy + 156, 44, 0.8, c.color);
    txt(c.cost, x + 16, cy + 168, cw - 32, { font: FONT_R, size: 9, color: C.body, align: "center" });
    txt(c.ret, x + 16, cy + 196, cw - 32, { font: FONT_R, size: 9, color: C.body, align: "center" });
  });

  // Regra de ouro callout
  const ry = cy + ch + 22;
  filledRoundRect(ML, ry, CW, 50, 7, C.totalBg);
  strokedRoundRect(ML, ry, CW, 50, 7, C.gold, 1);
  filledRect(ML, ry, 4, 50, C.gold);
  txt("REGRA DE OURO", ML + 18, ry + 8, 160, { font: FONT_B, size: 7, color: C.gold, charSpacing: 2 });
  txt("Nenhum negócio avança se só for rentável no Cenário Base.", ML + 18, ry + 22, CW - 36,
    { font: FONT_I, size: 12, color: C.body });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 6 — VENDA + PLANO B
// ─────────────────────────────────────────────────────────────
function slide6() {
  lightChrome("PILAR II  ·  Rentabilidade", "Tática de Venda Cirúrgica", 6);

  // Linha base do timeline
  const ty = 158;
  filledRect(ML + 70, ty + 32, CW - 140, 0.6, C.gold);

  const phases = [
    { n: "1", win: "0–30 DIAS", t: "Preparação Premium", d: "Home staging, fotografia profissional, tour 360°. Posicionamento 2–4% acima do VVR." },
    { n: "2", win: "31–60 DIAS", t: "Ajuste Tático", d: "Aproximação ao Stress Moderado com ajustes táticos conforme procura." },
    { n: "3", win: "61+ DIAS", t: "Acelerador", d: "Top performer da rede + cláusula de redução máxima sem comprometer ROI mínimo." },
  ];
  const px0 = ML + 36;
  const pw = (CW - 72) / 3;
  phases.forEach((p, i) => {
    const cx = px0 + i * pw + pw / 2;
    // Big circle
    filledCircle(cx, ty + 32, 32, C.gold);
    txt(p.n, cx - 16, ty + 8, 32, { font: FONT_B, size: 28, color: C.black, align: "center" });
    // Card abaixo
    const cy = ty + 76;
    const cardX = px0 + i * pw + 14;
    const cardW = pw - 28;
    filledRoundRect(cardX, cy, cardW, 168, 6, C.bgWarm);
    strokedRoundRect(cardX, cy, cardW, 168, 6, C.borderSoft, 0.75);
    txt(p.win, cardX + 14, cy + 16, cardW - 28, { font: FONT_B, size: 8, color: C.gold, align: "center", charSpacing: 2 });
    txt(p.t, cardX + 14, cy + 38, cardW - 28, { font: FONT_B, size: 13, color: C.body, align: "center" });
    filledRect(cx - 16, cy + 80, 32, 1.8, C.gold);
    txt(p.d, cardX + 18, cy + 96, cardW - 36, { font: FONT_R, size: 9, color: C.body, align: "center", lineGap: 1.5 });
  });

  // Plano B card
  const py = ty + 256;
  filledRoundRect(ML, py, CW, 92, 7, C.totalBg);
  strokedRoundRect(ML, py, CW, 92, 7, C.gold, 1.5);
  // Pentagon "shield" simples
  const sx = ML + 24, sy = py + 18, sz = 56;
  doc.save().fillColor(C.gold)
    .moveTo(sx + sz / 2, sy)
    .lineTo(sx + sz, sy + sz * 0.4)
    .lineTo(sx + sz * 0.85, sy + sz)
    .lineTo(sx + sz * 0.15, sy + sz)
    .lineTo(sx, sy + sz * 0.4)
    .closePath().fill().restore();
  txt("B", sx, sy + 14, sz, { font: FONT_B, size: 28, color: C.black, align: "center" });
  txt("PLANO B  ·  REDE DE SEGURANÇA ABSOLUTA", ML + 96, py + 16, CW - 110,
    { font: FONT_B, size: 8, color: C.gold, charSpacing: 2 });
  txt("Se o preço passar a Linha Vermelha (Stress Severo), a venda é suspensa e o ativo pivota automaticamente para arrendamento — modelo validado a priori. ROI mínimo sempre protegido.",
    ML + 96, py + 38, CW - 110, { font: FONT_R, size: 10, color: C.body, lineGap: 2 });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 7 — MÃOS-LIVRES
// ─────────────────────────────────────────────────────────────
function slide7() {
  lightChrome("PILAR III  ·  Transparência Total", "Ecossistema 'Mãos-Livres'", 7);
  txt("Acesso total. Esforço nulo.", ML, 122, CW,
    { font: FONT_I, size: 13, color: C.gold, align: "center" });

  const items = [
    { n: "01", t: "Auditoria em Tempo Real", d: "Pasta cifrada com faturas, contabilidade e documentos legais — acesso vitalício.", icon: "eye" },
    { n: "02", t: "Comunicação Sem Ruído", d: "Canal dedicado ao seu negócio. Atualizações diárias diretas com a liderança.", icon: "chat" },
    { n: "03", t: "Relatórios Visuais de Obra", d: "Fotografias e vídeos semanais em alta resolução. Acompanhe sem visitar o estaleiro.", icon: "cam" },
  ];

  const cy = 162, ch = 282, gap = 22;
  const cw = (CW - 2 * gap) / 3;
  items.forEach((it, i) => {
    const x = ML + i * (cw + gap);
    filledRoundRect(x, cy, cw, ch, 7, C.bgWarm);
    strokedRoundRect(x, cy, cw, ch, 7, C.borderSoft, 0.75);

    // Icon circle background
    const cxI = x + cw / 2, cyI = cy + 60, r = 38;
    filledCircle(cxI, cyI, r, C.goldFaint);
    strokedCircle(cxI, cyI, r, C.gold, 1.5);

    if (it.icon === "eye") {
      // Eye: ellipse outline + pupil
      doc.save().lineWidth(1.5).strokeColor(C.body).fillColor(C.bgWarm)
        .ellipse(cxI, cyI + 4, 28, 14).fillAndStroke().restore();
      filledCircle(cxI, cyI + 4, 7, C.body);
    } else if (it.icon === "chat") {
      // Chat bubble
      doc.save().lineWidth(1.5).strokeColor(C.body).fillColor(C.bgWarm);
      doc.roundedRect(cxI - 24, cyI - 12, 48, 22, 5).fillAndStroke();
      doc.restore();
      [-10, 0, 10].forEach(dx => filledCircle(cxI + dx, cyI - 1, 2.5, C.body));
      // tail
      doc.save().fillColor(C.bgWarm).strokeColor(C.body).lineWidth(1.5)
        .moveTo(cxI - 6, cyI + 10).lineTo(cxI + 4, cyI + 10).lineTo(cxI - 4, cyI + 18).closePath().fillAndStroke().restore();
    } else {
      // Camera: rect + lens
      doc.save().lineWidth(1.5).strokeColor(C.body).fillColor(C.bgWarm)
        .roundedRect(cxI - 26, cyI - 8, 52, 28, 3).fillAndStroke().restore();
      filledRect(cxI - 8, cyI - 14, 16, 6, C.body);
      doc.save().lineWidth(1.5).strokeColor(C.body).fillColor(C.bgWarm)
        .circle(cxI, cyI + 6, 9).fillAndStroke().restore();
      filledCircle(cxI, cyI + 6, 4, C.body);
    }

    txt(it.n, x + 18, cy + 130, cw - 36, { font: FONT_B, size: 9, color: C.gold, align: "center", charSpacing: 2 });
    txt(it.t, x + 18, cy + 154, cw - 36, { font: FONT_B, size: 14, color: C.body, align: "center" });
    filledRect(x + cw / 2 - 16, cy + 196, 32, 1.8, C.gold);
    txt(it.d, x + 22, cy + 210, cw - 44, { font: FONT_R, size: 10, color: C.body, align: "center", lineGap: 2 });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 8 — ALINHAMENTO 60/40 (CAEP)
// ─────────────────────────────────────────────────────────────
function slide8() {
  lightChrome("Alinhamento de Interesses (CAEP)", "60% Investidor  ·  40% Somnium Properties", 8);

  // Visualização: dois círculos lado a lado, sem sobreposição com texto
  const vCenterX = W / 2;
  const r1 = 78;          // raio investidor (60%)
  const r2 = 64;          // raio somnium (40%) - proporcional
  const cy = 220;
  const cx1 = vCenterX - 92; // centro circulo investidor
  const cx2 = vCenterX + 92; // centro circulo somnium

  // Investidor (cream com border gold)
  filledCircle(cx1, cy, r1, C.goldFaint);
  strokedCircle(cx1, cy, r1, C.gold, 1.5);
  // Numero centrado verticalmente — y baseline ajustado
  txt("60%", cx1 - r1, cy - 22, r1 * 2, { font: FONT_B, size: 44, color: C.body, align: "center" });

  // Somnium (gold solido)
  filledCircle(cx2, cy, r2, C.gold);
  txt("40%", cx2 - r2, cy - 18, r2 * 2, { font: FONT_B, size: 36, color: C.white, align: "center" });

  // Labels FORA dos circulos (abaixo)
  const labelY = cy + r1 + 20;
  // Investidor label
  filledRect(cx1 - 24, labelY, 48, 1.5, C.gold);
  txt("INVESTIDOR PASSIVO", cx1 - 100, labelY + 8, 200,
    { font: FONT_B, size: 11, color: C.body, align: "center", charSpacing: 2 });
  txt("Alocação de Capital", cx1 - 100, labelY + 26, 200,
    { font: FONT_I, size: 9, color: C.muted, align: "center" });

  // Somnium label
  filledRect(cx2 - 24, labelY, 48, 1.5, C.gold);
  txt("SOMNIUM PROPERTIES", cx2 - 100, labelY + 8, 200,
    { font: FONT_B, size: 11, color: C.body, align: "center", charSpacing: 2 });
  txt("Gestão  ·  Execução  ·  Risco Técnico", cx2 - 100, labelY + 26, 200,
    { font: FONT_I, size: 9, color: C.muted, align: "center" });

  // Bottom: Modelo CAEP card
  const by = labelY + 64;
  filledRoundRect(ML, by, CW, 110, 7, C.totalBg);
  strokedRoundRect(ML, by, CW, 110, 7, C.gold, 1.5);
  filledRect(ML, by, 4, 110, C.gold);
  // 5-point star
  const stx = ML + 28, sty = by + 32, ss = 36;
  doc.save().fillColor(C.gold);
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? ss / 2 : ss / 4.5;
    pts.push([stx + ss / 2 + rr * Math.cos(ang), sty + ss / 2 + rr * Math.sin(ang)]);
  }
  doc.moveTo(...pts[0]);
  pts.slice(1).forEach(p => doc.lineTo(...p));
  doc.closePath().fill().restore();

  txt("MODELO CAEP  ·  CO-INVESTIMENTO", ML + 76, by + 14, CW - 96,
    { font: FONT_B, size: 8, color: C.gold, charSpacing: 2 });
  txt("Distribuição contratualizada de resultados: 60% para o investidor passivo (capital) e 40% para a Somnium Properties (originação, gestão, execução, risco técnico). A Somnium investe sempre o seu próprio capital nos projetos antes de abrir espaço a parceiros.",
    ML + 76, by + 34, CW - 96, { font: FONT_R, size: 10, color: C.body, lineGap: 2 });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 9 — A OPORTUNIDADE
// ─────────────────────────────────────────────────────────────
function slide9() {
  lightChrome("Resumo Executivo", "A Oportunidade Somnium", 9);

  const items = [
    { n: "1", t: "Segurança", sub: "Zero Improviso", d: "MAO validado e Stress Tests severos antes de cada decisão." },
    { n: "2", t: "Rentabilidade", sub: "Otimizada", d: "Saída tática pré-definida (SOP 10) com Plano B de arrendamento." },
    { n: "3", t: "Transparência", sub: "Institucional", d: "Acesso digital total — controlo absoluto, esforço nulo." },
  ];
  const cy = 130, ch = 320, gap = 22;
  const cw = (CW - 2 * gap) / 3;
  items.forEach((it, i) => {
    const x = ML + i * (cw + gap);
    filledRoundRect(x, cy, cw, ch, 8, C.bgWarm);
    strokedRoundRect(x, cy, cw, ch, 8, C.gold, 1.5);
    filledRect(x, cy, cw, 5, C.gold);
    // Número gigante
    txt(it.n, x, cy + 30, cw, { font: FONT_B, size: 110, color: C.gold, align: "center" });
    txt(it.t, x, cy + 165, cw, { font: FONT_B, size: 20, color: C.body, align: "center" });
    txt(it.sub.toUpperCase(), x, cy + 200, cw, { font: FONT_B, size: 8, color: C.gold, align: "center", charSpacing: 3 });
    filledRect(x + cw / 2 - 16, cy + 222, 32, 1.8, C.gold);
    txt(it.d, x + 22, cy + 240, cw - 44, { font: FONT_R, size: 10, color: C.body, align: "center", lineGap: 2 });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 10 — CTA
// ─────────────────────────────────────────────────────────────
function slide10() {
  filledRect(0, 0, W, H, C.bg);
  topBars();
  cornerBrackets();
  dotPattern(40, 70, 8, 5, 16);
  dotPattern(W - 170, H - 150, 8, 5, 16);

  const logoW = 280;
  const logoH = logoW * (614 / 1516);
  const blockTop = 72;
  doc.image(LOGO_TRANSPARENT, (W - logoW) / 2, blockTop, { width: logoW });

  const accent1Y = blockTop + logoH + 30;
  filledRect(ML + 140, accent1Y, CW - 280, 0.6, C.gold);
  doc.save().fillColor(C.gold)
    .moveTo(W / 2, accent1Y - 4).lineTo(W / 2 + 4, accent1Y).lineTo(W / 2, accent1Y + 4).lineTo(W / 2 - 4, accent1Y).fill()
    .restore();

  txt("Construa um Portfólio\nSem Dores de Cabeça.", ML, accent1Y + 18, CW,
    { font: FONT_B, size: 32, color: C.body, align: "center", lineGap: 2 });
  txt("Junte-se ao grupo restrito de investidores passivos e deixe o rigor clínico proteger o seu capital.",
    ML + 110, accent1Y + 110, CW - 220, { font: FONT_I, size: 11, color: C.muted, align: "center" });

  // CTA button
  const btnW = 180, btnH = 42;
  const btnY = accent1Y + 158;
  filledRoundRect((W - btnW) / 2, btnY, btnW, btnH, 6, C.gold);
  txt("AGENDAR REUNIÃO", (W - btnW) / 2, btnY + 14, btnW,
    { font: FONT_B, size: 11, color: C.black, align: "center", charSpacing: 2 });

  txt("geral@somniumproperties.pt    ·    www.somniumproperties.pt", ML, btnY + btnH + 22, CW,
    { font: FONT_B, size: 10, color: C.body, align: "center" });
  txt("Alexandre Mendes  ·  João Abreu", ML, btnY + btnH + 42, CW,
    { font: FONT_R, size: 8.5, color: C.muted, align: "center", charSpacing: 1.5 });

  filledRect(ML, H - 40, CW, 0.6, C.gold);
  txt("Documento Confidencial · Somnium Properties · Investimento Imobiliário",
    ML, H - 32, CW, { font: FONT_R, size: 6.5, color: C.muted, charSpacing: 1.4, align: "center" });
}

// ─── Render ───────────────────────────────────────────────────
slide1();
doc.addPage(); slide2();
doc.addPage(); slide3();
doc.addPage(); slide4();
doc.addPage(); slide5();
doc.addPage(); slide6();
doc.addPage(); slide7();
doc.addPage(); slide8();
doc.addPage(); slide9();
doc.addPage(); slide10();
doc.end();
console.log("WROTE:", out);
