// pdfkit + guarda NaN/Infinity para Edge Functions (Deno). Port do runtime
// patchPDFKitNaNGuard() de src/db/pdfImovelDocs.js.
//
// Contexto: a app Node aplica DOIS niveis de defesa contra numeros invalidos:
//   1) build-time patch (patches/pdfkit+0.18.0.patch) em PDFObject.number — NAO corre
//      em Deno (patch-package nao existe). PDFObject e interno ao bundle, nao monkey-
//      patchavel de fora.
//   2) runtime: envolve metodos do prototype (rect/text/moveTo/...) para sanear NaN
//      ANTES de chegarem ao buffer. Isto E portavel e e o que portamos aqui.
//
// Como (2) saneia as entradas nos pontos conhecidos onde NaN entra, os numeros
// invalidos nao chegam a PDFObject.number — eliminando o throw "unsupported number:
// NaN" que o spike observou ao passar NaN cru. Importar PDFDocument DESTE modulo
// (em vez de "pdfkit") garante o guard aplicado uma unica vez.
import PDFDocument from "pdfkit";

let patched = false;

export function patchPdfkitGuard(): void {
  if (patched) return;
  patched = true;

  const wrapPositional = (proto: any, method: string, numericIndices: number[]) => {
    if (typeof proto[method] !== "function") return;
    const orig = proto[method];
    proto[method] = function (...args: any[]) {
      let dirty = false;
      for (const i of numericIndices) {
        if (i < args.length && typeof args[i] === "number" && !isFinite(args[i])) {
          dirty = true;
          args[i] = 0;
        }
      }
      const last = args[args.length - 1];
      if (last && typeof last === "object" && !Array.isArray(last)) {
        for (const k of ["width", "height", "x", "y", "lineGap", "characterSpacing", "indent"]) {
          if (typeof last[k] === "number" && !isFinite(last[k])) {
            dirty = true;
            last[k] = 0;
          }
        }
        if (Array.isArray(last.fit)) {
          last.fit = last.fit.map((v: any) => (typeof v === "number" && !isFinite(v)) ? 0 : v);
        }
      }
      if (dirty) console.warn(`[pdfkit-guard] ${method} recebeu NaN/Infinity — saneado para 0`);
      return orig.apply(this, args);
    };
  };

  const proto: any = (PDFDocument as any).prototype;
  wrapPositional(proto, "rect", [0, 1, 2, 3]);
  wrapPositional(proto, "roundedRect", [0, 1, 2, 3, 4]);
  wrapPositional(proto, "circle", [0, 1, 2]);
  wrapPositional(proto, "moveTo", [0, 1]);
  wrapPositional(proto, "lineTo", [0, 1]);
  wrapPositional(proto, "image", [1, 2]);
  wrapPositional(proto, "text", [1, 2]);
  wrapPositional(proto, "fontSize", [0]);
  wrapPositional(proto, "lineWidth", [0]);
  wrapPositional(proto, "translate", [0, 1]);
  wrapPositional(proto, "scale", [0, 1]);

  if (typeof proto.heightOfString === "function") {
    const origH = proto.heightOfString;
    proto.heightOfString = function (text: any, opts: any) {
      const safeText = (text == null) ? "" : String(text);
      const r = origH.call(this, safeText, opts);
      if (typeof r !== "number" || !isFinite(r)) {
        console.warn(`[pdfkit-guard] heightOfString invalido (${r}) — fallback 12`);
        return 12;
      }
      return r;
    };
  }
  if (typeof proto.widthOfString === "function") {
    const origW = proto.widthOfString;
    proto.widthOfString = function (text: any, opts: any) {
      const safeText = (text == null) ? "" : String(text);
      const r = origW.call(this, safeText, opts);
      if (typeof r !== "number" || !isFinite(r)) {
        console.warn(`[pdfkit-guard] widthOfString invalido (${r}) — fallback 50`);
        return 50;
      }
      return r;
    };
  }

  // annotate(x,y,w,h,options) -> options.Rect [x1,y1,x2,y2]; NaN ai explode em doc.end().
  if (typeof proto.annotate === "function") {
    const origAnn = proto.annotate;
    proto.annotate = function (x: any, y: any, w: any, h: any, options: any) {
      const sx = (typeof x === "number" && isFinite(x)) ? x : 0;
      const sy = (typeof y === "number" && isFinite(y)) ? y : 0;
      const sw = (typeof w === "number" && isFinite(w) && w > 0) ? w : 1;
      const sh = (typeof h === "number" && isFinite(h) && h > 0) ? h : 1;
      if (sx !== x || sy !== y || sw !== w || sh !== h) {
        console.warn(`[pdfkit-guard] annotate(${x},${y},${w},${h}) saneado`);
      }
      return origAnn.call(this, sx, sy, sw, sh, options);
    };
  }
}

patchPdfkitGuard();

// streamToBuffer: PDFKit em Deno emite eventos 'data'/'end' como em Node.
export function streamToBuffer(doc: any): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    doc.on("data", (c: Uint8Array) => chunks.push(c));
    doc.on("end", () => {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.length;
      }
      resolve(out);
    });
    doc.on("error", reject);
  });
}

export default PDFDocument;
