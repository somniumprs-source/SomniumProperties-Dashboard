// Spike 1: pdfkit em Deno. Prova: carrega, embute fonte Inter, gera PDF em buffer.
// Tambem testa o comportamento NaN/Infinity (o patch Somnium converte para 0).
import PDFDocument from "npm:pdfkit@0.18.0";

const FONT = new URL("../../public/fonts/Inter-Regular.ttf", import.meta.url);
const FONT_BOLD = new URL("../../public/fonts/Inter-Bold.ttf", import.meta.url);

function streamToBuffer(doc: any): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    doc.on("data", (c: Uint8Array) => chunks.push(c));
    doc.on("end", () => {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      resolve(out);
    });
    doc.on("error", reject);
  });
}

async function main() {
  console.log("[pdfkit] a criar documento...");
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const done = streamToBuffer(doc);

  // Embeber fontes Inter (TTF do repo)
  const regular = await Deno.readFile(FONT);
  const bold = await Deno.readFile(FONT_BOLD);
  doc.registerFont("Inter", regular);
  doc.registerFont("Inter-Bold", bold);

  doc.font("Inter-Bold").fontSize(22).fillColor("#C9A84C")
    .text("Somnium Properties — Spike PDFKit (Deno)", 40, 60);
  doc.font("Inter").fontSize(12).fillColor("#0d0d0d")
    .text("Teste de geracao de PDF com fonte embutida, formas e cor.", 40, 100);

  doc.save().rect(40, 140, 515, 60).fill("#C9A84C").restore();
  doc.fillColor("#ffffff").font("Inter-Bold").fontSize(14)
    .text("Bloco dourado preenchido", 52, 162);

  // Teste NaN/Infinity: sem patch, pdfkit faz throw em PDFObject.number.
  let nanResult = "OK (nao deu throw)";
  try {
    doc.save().rect(40, 230, NaN, 40).fill("#888").restore();
    doc.fontSize(10).fillColor("#000").text("Rect com largura NaN aceite", 40, 280);
  } catch (e) {
    nanResult = "THROW: " + (e as Error).message;
  }

  doc.end();
  const buf = await done;
  await Deno.writeFile(new URL("./out_pdfkit.pdf", import.meta.url), buf);

  const head = new TextDecoder().decode(buf.slice(0, 5));
  console.log(`[pdfkit] bytes=${buf.length} header=${head} (esperado %PDF-)`);
  console.log(`[pdfkit] cenario NaN -> ${nanResult}`);
  console.log(`[pdfkit] RESULTADO: ${buf.length > 1000 && head === "%PDF-" ? "PASS (gera PDF valido)" : "FAIL"}`);
}

main().catch((e) => { console.error("[pdfkit] FAIL:", e); Deno.exit(1); });
