// Apresentação Investidores — versão 30min v2 (10 slides, fundo claro, +grafismo)
const pptxgen = require("pptxgenjs");

const LOGO_DARK = "/home/user/SomniumProperties-Dashboard/public/logo-dark.png";

const C = {
  gold: "C9A84C",
  goldSoft: "E8D08A",
  goldFaint: "F2E8C4",
  black: "0D0D0D",
  body: "2A2A2A",
  muted: "888888",
  mutedSoft: "B0A88E",
  bg: "F7F6F2",
  bgWarm: "FBF8EE",
  light: "F0EFE9",
  totalBg: "F5F3EE",
  border: "E0DDD5",
  borderSoft: "ECE7D6",
  green: "2D6A2D",
  greenSoft: "D6E5D0",
  red: "8B2020",
  redSoft: "F0D6D6",
  amberSoft: "F5E6C4",
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

// ── Helpers ──────────────────────────────────────────────────
function topBars(s) {
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: BAR, fill: { color: C.gold }, line: { type: "none" } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: H - BAR, w: W, h: BAR, fill: { color: C.gold }, line: { type: "none" } });
}

// Decorative corner brackets (L-shapes) gold
function cornerBrackets(s) {
  const t = 0.025, len = 0.45, m = 0.3;
  // top-left
  s.addShape(pres.shapes.RECTANGLE, { x: m, y: m + 0.15, w: len, h: t, fill: { color: C.gold }, line: { type: "none" } });
  s.addShape(pres.shapes.RECTANGLE, { x: m, y: m + 0.15, w: t, h: len, fill: { color: C.gold }, line: { type: "none" } });
  // top-right
  s.addShape(pres.shapes.RECTANGLE, { x: W - m - len, y: m + 0.15, w: len, h: t, fill: { color: C.gold }, line: { type: "none" } });
  s.addShape(pres.shapes.RECTANGLE, { x: W - m - t, y: m + 0.15, w: t, h: len, fill: { color: C.gold }, line: { type: "none" } });
  // bottom-left
  s.addShape(pres.shapes.RECTANGLE, { x: m, y: H - m - t - 0.15, w: len, h: t, fill: { color: C.gold }, line: { type: "none" } });
  s.addShape(pres.shapes.RECTANGLE, { x: m, y: H - m - len - 0.15, w: t, h: len, fill: { color: C.gold }, line: { type: "none" } });
  // bottom-right
  s.addShape(pres.shapes.RECTANGLE, { x: W - m - len, y: H - m - t - 0.15, w: len, h: t, fill: { color: C.gold }, line: { type: "none" } });
  s.addShape(pres.shapes.RECTANGLE, { x: W - m - t, y: H - m - len - 0.15, w: t, h: len, fill: { color: C.gold }, line: { type: "none" } });
}

// Decorative dot pattern in a region (subtle)
function dotPattern(s, { x, y, cols, rows, gap = 0.18, color = C.goldFaint, dotSize = 0.04 }) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      s.addShape(pres.shapes.OVAL, {
        x: x + c * gap, y: y + r * gap, w: dotSize, h: dotSize,
        fill: { color }, line: { type: "none" },
      });
    }
  }
}

function lightChrome(s, eyebrow, title, pageNum) {
  s.background = { color: C.bg };
  topBars(s);
  s.addImage({ path: LOGO_DARK, x: ML, y: 0.28, h: 0.32, w: 0.85 });
  if (eyebrow) {
    s.addText(eyebrow.toUpperCase(), {
      x: ML + 1.1, y: 0.34, w: CW - 2.5, h: 0.22,
      fontSize: 8.5, fontFace: FONT_B, color: C.muted,
      charSpacing: 4, align: "left", margin: 0,
    });
  }
  s.addText(`${String(pageNum).padStart(2, "0")} / ${TOTAL_SLIDES}`, {
    x: W - MR - 1.3, y: 0.34, w: 1.3, h: 0.22,
    fontSize: 8.5, fontFace: FONT_B, color: C.muted,
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
    fontSize: 7.5, fontFace: FONT_B, color: C.muted,
    align: "center", charSpacing: 1.5, margin: 0,
  });
  if (title) {
    s.addText(title, {
      x: ML, y: 0.95, w: CW, h: 0.65,
      fontSize: 26, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// SLIDE 1 — CAPA (light com grafismo)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBars(s);
  cornerBrackets(s);

  // Padrão de pontos decorativo no canto superior direito e inferior esquerdo
  dotPattern(s, { x: W - 2.5, y: 1.0, cols: 10, rows: 6, gap: 0.22 });
  dotPattern(s, { x: 0.5, y: H - 2.0, cols: 10, rows: 6, gap: 0.22 });

  // Logo centrado
  const LW = 5.5, LH = LW / (1516 / 614);
  const blockTop = (H - (LH + 2.6)) / 2;
  s.addImage({ path: LOGO_DARK, x: (W - LW) / 2, y: blockTop, w: LW, h: LH });

  // Accent rule longo e fino
  const accent1Y = blockTop + LH + 0.5;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML + 2.0, y: accent1Y, w: CW - 4.0, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });
  // Diamond marker no centro
  s.addShape(pres.shapes.DIAMOND, {
    x: W / 2 - 0.07, y: accent1Y - 0.035, w: 0.14, h: 0.14,
    fill: { color: C.gold }, line: { type: "none" },
  });

  s.addText("Investimento e Gestão de Ativos", {
    x: ML, y: accent1Y + 0.25, w: CW, h: 0.7,
    fontSize: 38, fontFace: FONT_H, bold: true, color: C.body,
    align: "center", margin: 0,
  });

  s.addText("RIGOR CLÍNICO  ·  TRANSPARÊNCIA TOTAL  ·  RENTABILIDADE", {
    x: ML, y: accent1Y + 1.05, w: CW, h: 0.3,
    fontSize: 12, fontFace: FONT_B, color: C.gold,
    align: "center", charSpacing: 5, margin: 0,
  });

  s.addText("Uma abordagem de 'Zero Improviso' ao investimento imobiliário.", {
    x: ML, y: accent1Y + 1.5, w: CW, h: 0.3,
    fontSize: 13, fontFace: FONT_B, italic: true, color: C.muted,
    align: "center", margin: 0,
  });

  // Footer
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: H - 0.7, w: CW, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("Preparado para Investidores Privados  ·  Coimbra  ·  Portugal", {
    x: ML, y: H - 0.55, w: CW, h: 0.2,
    fontSize: 9, fontFace: FONT_B, color: C.muted,
    align: "center", charSpacing: 2, margin: 0,
  });
  s.addText("Documento Confidencial", {
    x: ML, y: H - 0.35, w: CW, h: 0.2,
    fontSize: 8, fontFace: FONT_B, color: C.muted,
    align: "center", charSpacing: 2, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 2 — O DESAFIO (light com ícones desenhados)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "Contexto", "O valor não está apenas no ativo. Está na execução.", 2);

  s.addText("Investir sozinho expõe a três assimetrias de mercado:", {
    x: ML, y: 1.75, w: CW, h: 0.35,
    fontSize: 13, fontFace: FONT_B, italic: true, color: C.muted,
    align: "center", margin: 0,
  });

  // 3 cards com ícones desenhados (clock, warning, network)
  const cy = 2.4, ch = 4.0, gap = 0.3;
  const cw = (CW - 2 * gap) / 3;

  const cards = [
    { t: "Tempo", n: "01", d: "Prospeção, negociação e gestão de obras consomem semanas inteiras a cada negócio." },
    { t: "Risco", n: "02", d: "Decisões emocionais e derrapagens financeiras não calculadas geram perdas evitáveis." },
    { t: "Execução", n: "03", d: "Empreiteiros incertos, sem rede e sem poder negocial. Cada obra é um salto no escuro." },
  ];

  cards.forEach((p, i) => {
    const x = ML + i * (cw + gap);
    // Card cream com border gold-faint
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: cy, w: cw, h: ch, rectRadius: 0.1,
      fill: { color: C.bgWarm }, line: { color: C.borderSoft, width: 0.75 },
    });
    // Numero gigante a fundo (decorativo)
    s.addText(p.n, {
      x: x + cw - 1.2, y: cy + 0.1, w: 1.1, h: 0.8,
      fontSize: 80, fontFace: FONT_H, bold: true, color: C.goldFaint, margin: 0,
    });

    // Icon area no topo — desenhar ícone simples por slide
    const ix = x + cw / 2 - 0.6, iy = cy + 0.45, isz = 1.2;
    if (i === 0) {
      // Clock: oval + 2 lines
      s.addShape(pres.shapes.OVAL, {
        x: ix, y: iy, w: isz, h: isz,
        fill: { color: C.goldFaint }, line: { color: C.gold, width: 1.5 },
      });
      // 12 o'clock dot
      s.addShape(pres.shapes.OVAL, {
        x: ix + isz / 2 - 0.04, y: iy + 0.1, w: 0.08, h: 0.08,
        fill: { color: C.gold }, line: { type: "none" },
      });
      // hands
      s.addShape(pres.shapes.LINE, {
        x: ix + isz / 2, y: iy + isz / 2, w: 0, h: -0.35,
        line: { color: C.body, width: 2 },
      });
      s.addShape(pres.shapes.LINE, {
        x: ix + isz / 2, y: iy + isz / 2, w: 0.3, h: 0.0,
        line: { color: C.body, width: 2 },
      });
    } else if (i === 1) {
      // Warning triangle
      s.addShape(pres.shapes.ISOSCELES_TRIANGLE, {
        x: ix, y: iy, w: isz, h: isz,
        fill: { color: C.goldFaint }, line: { color: C.gold, width: 1.5 },
      });
      // Exclamation
      s.addText("!", {
        x: ix, y: iy + 0.25, w: isz, h: isz - 0.25,
        fontSize: 40, fontFace: FONT_H, bold: true, color: C.body,
        align: "center", margin: 0,
      });
    } else {
      // Network: 4 circles with lines
      const ringR = 0.1;
      const cxIcon = ix + isz / 2, cyIcon = iy + isz / 2;
      const nodes = [
        { dx: 0, dy: -0.5 },
        { dx: 0.45, dy: 0.0 },
        { dx: -0.45, dy: 0.0 },
        { dx: 0.0, dy: 0.45 },
      ];
      // lines first (so circles are on top)
      nodes.forEach(n1 => {
        nodes.forEach(n2 => {
          if (n1 === n2) return;
          s.addShape(pres.shapes.LINE, {
            x: cxIcon + n1.dx, y: cyIcon + n1.dy,
            w: n2.dx - n1.dx, h: n2.dy - n1.dy,
            line: { color: C.gold, width: 1 },
          });
        });
      });
      // Center filled
      s.addShape(pres.shapes.OVAL, {
        x: cxIcon - 0.13, y: cyIcon - 0.13, w: 0.26, h: 0.26,
        fill: { color: C.gold }, line: { type: "none" },
      });
      nodes.forEach(n => {
        s.addShape(pres.shapes.OVAL, {
          x: cxIcon + n.dx - ringR, y: cyIcon + n.dy - ringR,
          w: ringR * 2, h: ringR * 2,
          fill: { color: C.bgWarm }, line: { color: C.gold, width: 1.5 },
        });
      });
    }

    // Title
    s.addText(p.t, {
      x: x + 0.3, y: cy + 1.85, w: cw - 0.6, h: 0.5,
      fontSize: 22, fontFace: FONT_H, bold: true, color: C.body,
      align: "center", margin: 0,
    });
    // Mini gold rule
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + cw / 2 - 0.25, y: cy + 2.4, w: 0.5, h: RULE_THICK,
      fill: { color: C.gold }, line: { type: "none" },
    });
    // Description
    s.addText(p.d, {
      x: x + 0.4, y: cy + 2.6, w: cw - 0.8, h: ch - 2.75,
      fontSize: 12, fontFace: FONT_B, color: C.body,
      align: "center", margin: 0,
    });
  });

  // Frase de transição
  s.addText("→  A Somnium Properties resolve esta assimetria com método.", {
    x: ML, y: cy + ch + 0.18, w: CW, h: 0.3,
    fontSize: 12, fontFace: FONT_B, italic: true, color: C.gold,
    align: "center", margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 3 — FILOSOFIA + EQUIPA (light com pulse line)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "Quem Somos", "Filosofia 'Zero Improviso'", 3);

  // Pulse line (heartbeat) decorativa por baixo do título — referência clínica
  const pulseY = 1.78;
  const pulseX0 = ML + 1.5, pulseW = CW - 3.0;
  // Linha base
  s.addShape(pres.shapes.LINE, {
    x: pulseX0, y: pulseY, w: pulseW * 0.35, h: 0,
    line: { color: C.gold, width: 1.2 },
  });
  // Pulse spikes
  let px = pulseX0 + pulseW * 0.35;
  const pulses = [
    { dx: 0.05, dy: -0.05 }, { dx: 0.05, dy: 0.18 }, { dx: 0.05, dy: -0.25 },
    { dx: 0.05, dy: 0.18 }, { dx: 0.05, dy: -0.06 }, { dx: 0.05, dy: 0.0 },
  ];
  let py = pulseY;
  pulses.forEach(p => {
    s.addShape(pres.shapes.LINE, {
      x: px, y: py, w: p.dx, h: p.dy,
      line: { color: C.gold, width: 1.5 },
    });
    px += p.dx; py += p.dy;
  });
  s.addShape(pres.shapes.LINE, {
    x: px, y: py, w: pulseX0 + pulseW - px, h: 0,
    line: { color: C.gold, width: 1.2 },
  });

  // Quote forte
  s.addText("Aplicamos ao imobiliário a disciplina, ética e rigor da área da Saúde — onde o erro não é uma opção.", {
    x: ML + 1.0, y: 2.0, w: CW - 2.0, h: 0.85,
    fontSize: 17, fontFace: FONT_H, italic: true, color: C.body,
    align: "center", margin: 0,
  });

  // 3 traços horizontais (cards finos)
  const traits = [
    { t: "Origem Clínica", d: "Fundadores com background em Saúde aplicam protocolos rigorosos." },
    { t: "Dados sobre Instinto", d: "Cada decisão sustentada por análise quantitativa e simulação." },
    { t: "Rede Validada", d: "Equipa técnica + 72 parceiros operacionais já testados no terreno." },
  ];
  const ty = 3.05, tw = 6.2, gap = 0.18;
  const trH = 0.85;
  traits.forEach((tr, i) => {
    const y = ty + i * (trH + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: ML, y, w: tw, h: trH, rectRadius: 0.06,
      fill: { color: C.bgWarm }, line: { color: C.borderSoft, width: 0.75 },
    });
    // Numero badge gold à esquerda
    s.addShape(pres.shapes.OVAL, {
      x: ML + 0.2, y: y + trH / 2 - 0.27, w: 0.55, h: 0.55,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(`0${i + 1}`, {
      x: ML + 0.2, y: y + trH / 2 - 0.27, w: 0.55, h: 0.55,
      fontSize: 14, fontFace: FONT_H, bold: true, color: C.black,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(tr.t, {
      x: ML + 0.95, y: y + 0.12, w: tw - 1.1, h: 0.32,
      fontSize: 14, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    s.addText(tr.d, {
      x: ML + 0.95, y: y + 0.42, w: tw - 1.1, h: 0.4,
      fontSize: 11, fontFace: FONT_B, color: C.body, margin: 0,
    });
  });

  // Card direita: equipa
  const ex = ML + tw + 0.5, ew = CW - tw - 0.5, ey = ty, eh = 3 * trH + 2 * gap;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: ex, y: ey, w: ew, h: eh, rectRadius: 0.1,
    fill: { color: C.totalBg }, line: { color: C.gold, width: 1 },
  });
  // Top accent
  s.addShape(pres.shapes.RECTANGLE, {
    x: ex, y: ey, w: ew, h: 0.05,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("EQUIPA", {
    x: ex + 0.3, y: ey + 0.18, w: ew - 0.6, h: 0.3,
    fontSize: 9, fontFace: FONT_B, bold: true, color: C.gold,
    charSpacing: 4, margin: 0,
  });
  const team = [
    { n: "Alexandre Mendes & João Abreu", r: "Fundadores  ·  Gestão clínica" },
    { n: "Luís", r: "Gestor de Obra  ·  Construção e licenciamento" },
    { n: "João", r: "Consultor Estratégico  ·  Visão macro" },
  ];
  team.forEach((m, i) => {
    const my = ey + 0.55 + i * 0.85;
    s.addShape(pres.shapes.RECTANGLE, {
      x: ex + 0.3, y: my, w: 0.4, h: RULE_THICK,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(m.n, {
      x: ex + 0.3, y: my + 0.08, w: ew - 0.6, h: 0.3,
      fontSize: 12, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    s.addText(m.r, {
      x: ex + 0.3, y: my + 0.4, w: ew - 0.6, h: 0.3,
      fontSize: 9.5, fontFace: FONT_B, italic: true, color: C.muted, margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 4 — A CIÊNCIA DA COMPRA (light com gauge)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "PILAR I  ·  Segurança & Rigor", "A Ciência da Compra", 4);

  // Esq: Gauge ilustrativo (range 64–70% do VVR)
  const gx = ML, gy = 1.95, gw = 5.0, gh = 2.6;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: gx, y: gy, w: gw, h: gh, rectRadius: 0.1,
    fill: { color: C.bgWarm }, line: { color: C.borderSoft, width: 0.75 },
  });
  s.addText("LINHA DE SEGURANÇA", {
    x: gx + 0.3, y: gy + 0.25, w: gw - 0.6, h: 0.25,
    fontSize: 9, fontFace: FONT_B, bold: true, color: C.gold,
    charSpacing: 4, margin: 0,
  });
  s.addText("MAO sobre o VVR", {
    x: gx + 0.3, y: gy + 0.55, w: gw - 0.6, h: 0.35,
    fontSize: 14, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
  });

  // Barra horizontal 0..100% com zona segura 64-70% destacada
  const barX = gx + 0.4, barY = gy + 1.4, barW = gw - 0.8, barH = 0.35;
  // Background bar
  s.addShape(pres.shapes.RECTANGLE, {
    x: barX, y: barY, w: barW, h: barH,
    fill: { color: C.light }, line: { color: C.border, width: 0.5 },
  });
  // Zona segura (64-70%)
  s.addShape(pres.shapes.RECTANGLE, {
    x: barX + barW * 0.64, y: barY, w: barW * 0.06, h: barH,
    fill: { color: C.gold }, line: { type: "none" },
  });
  // Marcadores 0%, 50%, 100%
  ["0%", "50%", "100%"].forEach((t, i) => {
    const px = barX + barW * (i / 2);
    s.addShape(pres.shapes.RECTANGLE, {
      x: px - 0.005, y: barY + barH, w: 0.01, h: 0.08,
      fill: { color: C.muted }, line: { type: "none" },
    });
    s.addText(t, {
      x: px - 0.25, y: barY + barH + 0.1, w: 0.5, h: 0.2,
      fontSize: 8, fontFace: FONT_B, color: C.muted,
      align: "center", margin: 0,
    });
  });
  // Label "64–70%" sobre a zona gold
  s.addText("64–70%", {
    x: barX + barW * 0.55, y: barY - 0.3, w: barW * 0.2, h: 0.25,
    fontSize: 11, fontFace: FONT_H, bold: true, color: C.gold,
    align: "center", margin: 0,
  });
  // Tick triangle pointing down to zone
  s.addShape(pres.shapes.DOWN_ARROW_CALLOUT, {
    x: barX + barW * 0.62, y: barY - 0.05, w: 0.1, h: 0.1,
    fill: { color: C.gold }, line: { type: "none" },
  });

  s.addText("Margem clínica preservada antes de qualquer proposta.", {
    x: gx + 0.3, y: gy + gh - 0.45, w: gw - 0.6, h: 0.3,
    fontSize: 10, fontFace: FONT_B, italic: true, color: C.muted,
    align: "center", margin: 0,
  });

  // Dir: 3 mini-cards explicativos
  const items = [
    { t: "Validação Cruzada", d: "Mínimo 5 comparáveis cruzados com avaliadores e parceiros locais." },
    { t: "Ajuste Matemático", d: "Correções automáticas por área, localização, idade e conservação." },
    { t: "Linha de Segurança", d: "MAO calcula sempre a margem antes de avançar para proposta." },
  ];
  const ix0 = gx + gw + 0.3;
  const iw = CW - gw - 0.3;
  items.forEach((it, i) => {
    const y = gy + i * (gh / 3 + 0.05);
    s.addShape(pres.shapes.RECTANGLE, {
      x: ix0, y, w: 0.05, h: gh / 3 - 0.05,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(it.t, {
      x: ix0 + 0.2, y, w: iw - 0.2, h: 0.3,
      fontSize: 13, fontFace: FONT_H, bold: true, color: C.body, margin: 0,
    });
    s.addText(it.d, {
      x: ix0 + 0.2, y: y + 0.32, w: iw - 0.2, h: 0.55,
      fontSize: 11, fontFace: FONT_B, color: C.body, margin: 0,
    });
  });

  // Formula box destaque (gold sobre cream)
  const fy = gy + gh + 0.3;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: ML, y: fy, w: CW, h: 1.4, rectRadius: 0.1,
    fill: { color: C.totalBg }, line: { color: C.gold, width: 1.5 },
  });
  // Inner accent rule
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: fy + 1.4 - 0.04, w: CW, h: 0.04,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("MAO  =  ( VVR  ×  0,64  a  0,70 )  −  Custo de Obra", {
    x: ML, y: fy + 0.25, w: CW, h: 0.55,
    fontSize: 30, fontFace: FONT_H, bold: true, color: C.body,
    align: "center", margin: 0,
  });
  s.addText("Maximum Allowable Offer  ·  Nunca compramos acima da linha de segurança 64–70% do VVR.", {
    x: ML, y: fy + 0.85, w: CW, h: 0.35,
    fontSize: 11, fontFace: FONT_B, italic: true, color: C.gold,
    align: "center", margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 5 — STRESS TESTS (light com chart e cards)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "PILAR I  ·  Segurança & Rigor", "Obsessão com o Risco: Stress Tests", 5);

  s.addText("Cada operação simulada em três cenários antes de avançar:", {
    x: ML, y: 1.75, w: CW, h: 0.3,
    fontSize: 13, fontFace: FONT_B, italic: true, color: C.muted,
    align: "center", margin: 0,
  });

  const cards = [
    { t: "Cenário Base", v: "0%", desc: "Plano ideal", cost: "Conservador", ret: "Sem buffer", color: C.green, soft: C.greenSoft },
    { t: "Stress Moderado", v: "−10%", desc: "VVR", cost: "+10% Custo Obra", ret: "+3 meses retenção", color: C.gold, soft: C.amberSoft },
    { t: "Stress Severo", v: "−20%", desc: "VVR", cost: "+20% Custo Obra", ret: "+6 meses retenção", color: C.red, soft: C.redSoft },
  ];
  const cy = 2.25, ch = 3.4, gap = 0.3;
  const cw = (CW - 2 * gap) / 3;
  cards.forEach((c, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: cy, w: cw, h: ch, rectRadius: 0.1,
      fill: { color: C.bgWarm }, line: { color: c.color, width: 1.5 },
    });
    // Header colorido (suave)
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: cy, w: cw, h: 0.55, rectRadius: 0.1,
      fill: { color: c.soft }, line: { type: "none" },
    });
    // bottom of header straight (overlay rectangle)
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy + 0.4, w: cw, h: 0.15,
      fill: { color: c.soft }, line: { type: "none" },
    });
    // Header text
    s.addText(`0${i + 1}`, {
      x: x + 0.25, y: cy, w: 0.6, h: 0.55,
      fontSize: 14, fontFace: FONT_H, bold: true, color: c.color,
      valign: "middle", margin: 0,
    });
    s.addText(c.t.toUpperCase(), {
      x: x + 0.85, y: cy, w: cw - 1.0, h: 0.55,
      fontSize: 11, fontFace: FONT_B, bold: true, color: c.color,
      valign: "middle", charSpacing: 3, margin: 0,
    });
    // Big number
    s.addText(c.v, {
      x, y: cy + 0.85, w: cw, h: 1.05,
      fontSize: 64, fontFace: FONT_H, bold: true, color: c.color,
      align: "center", margin: 0,
    });
    s.addText(c.desc, {
      x, y: cy + 1.95, w: cw, h: 0.3,
      fontSize: 11, fontFace: FONT_B, color: C.muted,
      align: "center", charSpacing: 2, margin: 0,
    });
    // Divider
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + cw / 2 - 0.3, y: cy + 2.32, w: 0.6, h: RULE_THIN,
      fill: { color: c.color }, line: { type: "none" },
    });
    // Cost & retention
    s.addText(c.cost, {
      x: x + 0.2, y: cy + 2.45, w: cw - 0.4, h: 0.3,
      fontSize: 11, fontFace: FONT_B, color: C.body,
      align: "center", margin: 0,
    });
    s.addText(c.ret, {
      x: x + 0.2, y: cy + 2.85, w: cw - 0.4, h: 0.3,
      fontSize: 11, fontFace: FONT_B, color: C.body,
      align: "center", margin: 0,
    });
  });

  // Regra de ouro como callout horizontal
  const ry = cy + ch + 0.35;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: ML, y: ry, w: CW, h: 0.8, rectRadius: 0.1,
    fill: { color: C.totalBg }, line: { color: C.gold, width: 1 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: ry, w: 0.06, h: 0.8,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("REGRA DE OURO", {
    x: ML + 0.3, y: ry + 0.13, w: 2.2, h: 0.25,
    fontSize: 9, fontFace: FONT_B, bold: true, color: C.gold,
    charSpacing: 3, margin: 0,
  });
  s.addText("Nenhum negócio avança se só for rentável no Cenário Base.", {
    x: ML + 0.3, y: ry + 0.4, w: CW - 0.6, h: 0.4,
    fontSize: 14, fontFace: FONT_H, italic: true, color: C.body, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 6 — VENDA + PLANO B (light com timeline)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "PILAR II  ·  Rentabilidade", "Tática de Venda Cirúrgica", 6);

  // Timeline horizontal: 3 fases conectadas por linha
  const ty = 2.25;
  // Linha base
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML + 1.0, y: ty + 0.45, w: CW - 2.0, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });

  const phases = [
    { n: "1", win: "0–30 DIAS", t: "Preparação Premium", d: "Home staging, fotografia profissional, tour 360°. Posicionamento 2–4% acima do VVR." },
    { n: "2", win: "31–60 DIAS", t: "Ajuste Tático", d: "Aproximação ao Stress Moderado com ajustes táticos conforme procura." },
    { n: "3", win: "61+ DIAS", t: "Acelerador", d: "Top performer da rede + cláusula de redução máxima sem comprometer ROI mínimo." },
  ];
  const px0 = ML + 0.5;
  const pw = (CW - 1.0) / 3;
  phases.forEach((p, i) => {
    const cx = px0 + i * pw + pw / 2;
    // Big circle gold
    s.addShape(pres.shapes.OVAL, {
      x: cx - 0.45, y: ty, w: 0.9, h: 0.9,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(p.n, {
      x: cx - 0.45, y: ty, w: 0.9, h: 0.9,
      fontSize: 38, fontFace: FONT_H, bold: true, color: C.black,
      align: "center", valign: "middle", margin: 0,
    });

    // Card abaixo do círculo
    const cy = ty + 1.05;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: px0 + i * pw + 0.2, y: cy, w: pw - 0.4, h: 2.4, rectRadius: 0.08,
      fill: { color: C.bgWarm }, line: { color: C.borderSoft, width: 0.75 },
    });
    s.addText(p.win, {
      x: px0 + i * pw + 0.4, y: cy + 0.25, w: pw - 0.8, h: 0.3,
      fontSize: 10, fontFace: FONT_B, bold: true, color: C.gold,
      align: "center", charSpacing: 3, margin: 0,
    });
    s.addText(p.t, {
      x: px0 + i * pw + 0.4, y: cy + 0.6, w: pw - 0.8, h: 0.5,
      fontSize: 16, fontFace: FONT_H, bold: true, color: C.body,
      align: "center", margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: cx - 0.25, y: cy + 1.2, w: 0.5, h: RULE_THICK,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(p.d, {
      x: px0 + i * pw + 0.4, y: cy + 1.4, w: pw - 0.8, h: 0.95,
      fontSize: 11, fontFace: FONT_B, color: C.body,
      align: "center", margin: 0,
    });
  });

  // Plano B card (cream com gold accent strong)
  const py = ty + 3.55;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: ML, y: py, w: CW, h: 1.5, rectRadius: 0.1,
    fill: { color: C.totalBg }, line: { color: C.gold, width: 1.5 },
  });
  // Shield-like icon esquerda (escudo simples)
  const six = ML + 0.4, siy = py + 0.3, ssz = 0.85;
  s.addShape(pres.shapes.PENTAGON, {
    x: six, y: siy, w: ssz, h: ssz,
    fill: { color: C.gold }, line: { type: "none" },
    rotate: 180,
  });
  s.addText("B", {
    x: six, y: siy + 0.12, w: ssz, h: ssz - 0.2,
    fontSize: 32, fontFace: FONT_H, bold: true, color: C.black,
    align: "center", margin: 0,
  });

  s.addText("PLANO B  ·  REDE DE SEGURANÇA ABSOLUTA", {
    x: ML + 1.4, y: py + 0.2, w: CW - 1.6, h: 0.3,
    fontSize: 10, fontFace: FONT_B, bold: true, color: C.gold,
    charSpacing: 4, margin: 0,
  });
  s.addText("Se o preço passar a Linha Vermelha (Stress Severo), a venda é suspensa e o ativo pivota automaticamente para arrendamento — modelo validado a priori. ROI mínimo sempre protegido.", {
    x: ML + 1.4, y: py + 0.55, w: CW - 1.6, h: 0.85,
    fontSize: 12, fontFace: FONT_B, color: C.body, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 7 — MÃOS-LIVRES (light com ícones)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "PILAR III  ·  Transparência Total", "Ecossistema 'Mãos-Livres'", 7);

  s.addText("Acesso total. Esforço nulo.", {
    x: ML, y: 1.75, w: CW, h: 0.4,
    fontSize: 18, fontFace: FONT_H, italic: true, color: C.gold,
    align: "center", margin: 0,
  });

  const items = [
    { n: "01", t: "Auditoria em Tempo Real", d: "Pasta cifrada com faturas, contabilidade e documentos legais — acesso vitalício.", icon: "eye" },
    { n: "02", t: "Comunicação Sem Ruído", d: "Canal dedicado ao seu negócio. Atualizações diárias diretas com a liderança.", icon: "chat" },
    { n: "03", t: "Relatórios Visuais de Obra", d: "Fotografias e vídeos semanais em alta resolução. Acompanhe sem visitar o estaleiro.", icon: "camera" },
  ];

  const cy = 2.4, ch = 4.0, gap = 0.3;
  const cw = (CW - 2 * gap) / 3;
  items.forEach((it, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: cy, w: cw, h: ch, rectRadius: 0.1,
      fill: { color: C.bgWarm }, line: { color: C.borderSoft, width: 0.75 },
    });

    // Icon area
    const ix = x + cw / 2 - 0.55, iy = cy + 0.4, isz = 1.1;
    // Circulo de fundo gold-faint
    s.addShape(pres.shapes.OVAL, {
      x: ix, y: iy, w: isz, h: isz,
      fill: { color: C.goldFaint }, line: { color: C.gold, width: 1.25 },
    });
    if (it.icon === "eye") {
      // Eye: oval + circle pupil
      s.addShape(pres.shapes.OVAL, {
        x: ix + 0.18, y: iy + 0.38, w: 0.74, h: 0.36,
        fill: { color: C.bgWarm }, line: { color: C.body, width: 1.5 },
      });
      s.addShape(pres.shapes.OVAL, {
        x: ix + 0.46, y: iy + 0.46, w: 0.18, h: 0.18,
        fill: { color: C.body }, line: { type: "none" },
      });
    } else if (it.icon === "chat") {
      // Chat bubble: rounded rect + small triangle
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: ix + 0.2, y: iy + 0.25, w: 0.7, h: 0.45, rectRadius: 0.08,
        fill: { color: C.bgWarm }, line: { color: C.body, width: 1.5 },
      });
      // 3 dots
      [0, 1, 2].forEach(k => {
        s.addShape(pres.shapes.OVAL, {
          x: ix + 0.32 + k * 0.16, y: iy + 0.43, w: 0.08, h: 0.08,
          fill: { color: C.body }, line: { type: "none" },
        });
      });
      // Tail
      s.addShape(pres.shapes.RIGHT_TRIANGLE, {
        x: ix + 0.32, y: iy + 0.7, w: 0.16, h: 0.14,
        fill: { color: C.bgWarm }, line: { color: C.body, width: 1.5 },
      });
    } else {
      // Camera: rect + lens circle
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: ix + 0.18, y: iy + 0.32, w: 0.74, h: 0.5, rectRadius: 0.05,
        fill: { color: C.bgWarm }, line: { color: C.body, width: 1.5 },
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x: ix + 0.42, y: iy + 0.24, w: 0.26, h: 0.12,
        fill: { color: C.body }, line: { type: "none" },
      });
      s.addShape(pres.shapes.OVAL, {
        x: ix + 0.42, y: iy + 0.42, w: 0.26, h: 0.26,
        fill: { color: C.bgWarm }, line: { color: C.body, width: 1.5 },
      });
      s.addShape(pres.shapes.OVAL, {
        x: ix + 0.49, y: iy + 0.48, w: 0.12, h: 0.12,
        fill: { color: C.body }, line: { type: "none" },
      });
    }

    // Number small
    s.addText(it.n, {
      x: x + 0.3, y: cy + 1.7, w: cw - 0.6, h: 0.3,
      fontSize: 10, fontFace: FONT_B, bold: true, color: C.gold,
      align: "center", charSpacing: 4, margin: 0,
    });
    s.addText(it.t, {
      x: x + 0.3, y: cy + 2.05, w: cw - 0.6, h: 0.6,
      fontSize: 16, fontFace: FONT_H, bold: true, color: C.body,
      align: "center", margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + cw / 2 - 0.25, y: cy + 2.7, w: 0.5, h: RULE_THICK,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(it.d, {
      x: x + 0.4, y: cy + 2.9, w: cw - 0.8, h: ch - 3.05,
      fontSize: 11.5, fontFace: FONT_B, color: C.body,
      align: "center", margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 8 — ALINHAMENTO 50/50 (light com balança visual)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "Alinhamento de Interesses", "50% Investidor  ·  50% Somnium", 8);

  // Visualização: dois círculos sobrepostos no centro (Venn-like)
  const vy = 2.0, vh = 2.7;
  const vCenterX = W / 2;
  const circR = 1.3;
  // Esquerdo (Investidor) — gold faint
  s.addShape(pres.shapes.OVAL, {
    x: vCenterX - circR - 0.3, y: vy + 0.05, w: circR * 2, h: circR * 2,
    fill: { color: C.goldFaint }, line: { color: C.gold, width: 1.5 },
  });
  // Direito (Somnium) — gold strong
  s.addShape(pres.shapes.OVAL, {
    x: vCenterX - circR + 0.3, y: vy + 0.05, w: circR * 2, h: circR * 2,
    fill: { color: C.gold }, line: { color: C.gold, width: 1.5 },
  });
  // 50% labels grandes (texto sobre os círculos)
  s.addText("50%", {
    x: vCenterX - circR * 2 + 0.0, y: vy + 0.4, w: circR * 1.4, h: 1.3,
    fontSize: 72, fontFace: FONT_H, bold: true, color: C.body,
    align: "center", margin: 0,
  });
  s.addText("50%", {
    x: vCenterX + 0.4, y: vy + 0.4, w: circR * 1.4, h: 1.3,
    fontSize: 72, fontFace: FONT_H, bold: true, color: C.white,
    align: "center", margin: 0,
  });
  // Sub-labels
  s.addText("Investidor", {
    x: vCenterX - circR * 2 + 0.0, y: vy + 1.65, w: circR * 1.4, h: 0.35,
    fontSize: 14, fontFace: FONT_H, bold: true, color: C.body,
    align: "center", margin: 0,
  });
  s.addText("Somnium Properties", {
    x: vCenterX + 0.4, y: vy + 1.65, w: circR * 1.4, h: 0.35,
    fontSize: 14, fontFace: FONT_H, bold: true, color: C.white,
    align: "center", margin: 0,
  });
  s.addText("Alocação de Capital", {
    x: vCenterX - circR * 2 + 0.0, y: vy + 2.05, w: circR * 1.4, h: 0.3,
    fontSize: 10, fontFace: FONT_B, italic: true, color: C.muted,
    align: "center", margin: 0,
  });
  s.addText("Gestão · Execução · Risco", {
    x: vCenterX + 0.4, y: vy + 2.05, w: circR * 1.4, h: 0.3,
    fontSize: 10, fontFace: FONT_B, italic: true, color: C.bgWarm,
    align: "center", margin: 0,
  });

  // Co-investimento callout em baixo
  const by = vy + vh + 0.55, bh = 1.5;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: ML, y: by, w: CW, h: bh, rectRadius: 0.1,
    fill: { color: C.totalBg }, line: { color: C.gold, width: 1.5 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: by, w: 0.06, h: bh,
    fill: { color: C.gold }, line: { type: "none" },
  });
  // Star icon
  s.addShape(pres.shapes.STAR_5_POINT, {
    x: ML + 0.45, y: by + 0.4, w: 0.7, h: 0.7,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("CO-INVESTIMENTO", {
    x: ML + 1.4, y: by + 0.2, w: CW - 1.6, h: 0.3,
    fontSize: 10, fontFace: FONT_B, bold: true, color: C.gold,
    charSpacing: 4, margin: 0,
  });
  s.addText("A Somnium investe sempre o seu próprio capital nos projetos. Só abrimos espaço a parceiros depois da nossa própria validação financeira.", {
    x: ML + 1.4, y: by + 0.55, w: CW - 1.6, h: 0.85,
    fontSize: 14, fontFace: FONT_H, italic: true, color: C.body,
    margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 9 — A OPORTUNIDADE (light, números grandes em cards cream)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  lightChrome(s, "Resumo Executivo", "A Oportunidade Somnium", 9);

  const items = [
    { n: "1", t: "Segurança", sub: "Zero Improviso", d: "MAO validado e Stress Tests severos antes de cada decisão." },
    { n: "2", t: "Rentabilidade", sub: "Otimizada", d: "Saída tática pré-definida (SOP 10) com Plano B de arrendamento." },
    { n: "3", t: "Transparência", sub: "Institucional", d: "Acesso digital total — controlo absoluto, esforço nulo." },
  ];
  const cy = 1.9, ch = 4.7, gap = 0.3;
  const cw = (CW - 2 * gap) / 3;
  items.forEach((it, i) => {
    const x = ML + i * (cw + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: cy, w: cw, h: ch, rectRadius: 0.12,
      fill: { color: C.bgWarm }, line: { color: C.gold, width: 1.5 },
    });
    // Top accent
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: cy, w: cw, h: 0.08,
      fill: { color: C.gold }, line: { type: "none" },
    });
    // Numero gigante (gold)
    s.addText(it.n, {
      x, y: cy + 0.4, w: cw, h: 1.8,
      fontSize: 130, fontFace: FONT_H, bold: true, color: C.gold,
      align: "center", margin: 0,
    });
    s.addText(it.t, {
      x, y: cy + 2.4, w: cw, h: 0.55,
      fontSize: 24, fontFace: FONT_H, bold: true, color: C.body,
      align: "center", margin: 0,
    });
    s.addText(it.sub.toUpperCase(), {
      x, y: cy + 2.95, w: cw, h: 0.3,
      fontSize: 10, fontFace: FONT_B, bold: true, color: C.gold,
      align: "center", charSpacing: 4, margin: 0,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + cw / 2 - 0.25, y: cy + 3.35, w: 0.5, h: RULE_THICK,
      fill: { color: C.gold }, line: { type: "none" },
    });
    s.addText(it.d, {
      x: x + 0.4, y: cy + 3.55, w: cw - 0.8, h: ch - 3.7,
      fontSize: 12, fontFace: FONT_B, color: C.body,
      align: "center", margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SLIDE 10 — CTA / OBRIGADO (light)
// ─────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBars(s);
  cornerBrackets(s);

  // Padrão de pontos suaves
  dotPattern(s, { x: 0.5, y: 1.0, cols: 8, rows: 5, gap: 0.22 });
  dotPattern(s, { x: W - 2.3, y: H - 2.0, cols: 8, rows: 5, gap: 0.22 });

  const LW = 4.0, LH = LW / (1516 / 614);
  const blockTop = 1.05;
  s.addImage({ path: LOGO_DARK, x: (W - LW) / 2, y: blockTop, w: LW, h: LH });

  const accent1Y = blockTop + LH + 0.45;
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML + 2.0, y: accent1Y, w: CW - 4.0, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addShape(pres.shapes.DIAMOND, {
    x: W / 2 - 0.07, y: accent1Y - 0.035, w: 0.14, h: 0.14,
    fill: { color: C.gold }, line: { type: "none" },
  });

  s.addText("Construa um Portfólio\nSem Dores de Cabeça.", {
    x: ML, y: accent1Y + 0.25, w: CW, h: 1.6,
    fontSize: 44, fontFace: FONT_H, bold: true, color: C.body,
    align: "center", margin: 0,
  });

  s.addText("Junte-se ao grupo restrito de investidores passivos e deixe o rigor clínico proteger o seu capital.", {
    x: ML + 1.5, y: accent1Y + 1.95, w: CW - 3.0, h: 0.6,
    fontSize: 13, fontFace: FONT_B, italic: true, color: C.muted,
    align: "center", margin: 0,
  });

  // Botão gold
  const btnW = 2.4, btnH = 0.65;
  const btnY = accent1Y + 2.75;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: (W - btnW) / 2, y: btnY, w: btnW, h: btnH, rectRadius: 0.1,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("AGENDAR REUNIÃO", {
    x: (W - btnW) / 2, y: btnY, w: btnW, h: btnH,
    fontSize: 13, fontFace: FONT_H, bold: true, color: C.black,
    align: "center", valign: "middle", charSpacing: 3, margin: 0,
  });

  // Contactos
  s.addText("geral@somniumproperties.pt    ·    www.somniumproperties.pt", {
    x: ML, y: btnY + btnH + 0.45, w: CW, h: 0.3,
    fontSize: 12, fontFace: FONT_B, bold: true, color: C.body,
    align: "center", margin: 0,
  });
  s.addText("Alexandre Mendes  ·  João Abreu", {
    x: ML, y: btnY + btnH + 0.8, w: CW, h: 0.3,
    fontSize: 10, fontFace: FONT_B, color: C.muted,
    align: "center", charSpacing: 2, margin: 0,
  });

  // Footer
  s.addShape(pres.shapes.RECTANGLE, {
    x: ML, y: H - 0.55, w: CW, h: RULE_THIN,
    fill: { color: C.gold }, line: { type: "none" },
  });
  s.addText("Documento Confidencial · Somnium Properties · Investimento Imobiliário", {
    x: ML, y: H - 0.43, w: CW, h: 0.2,
    fontSize: 8, fontFace: FONT_B, color: C.muted,
    align: "center", charSpacing: 2, margin: 0,
  });
}

const path = require("path");
const out = path.resolve("/tmp/recolor/Apresentacao_Investidores_30min_v2_Somnium.pptx");
pres.writeFile({ fileName: out }).then(p => console.log("WROTE:", p));
