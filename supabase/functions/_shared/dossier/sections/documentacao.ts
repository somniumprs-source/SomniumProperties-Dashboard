// Espelho Deno do src/db/dossier/sections/documentacao.js (frontend não acessível aqui).
// A lista CHECKLIST_DOCUMENTACAO está duplicada por design — versão JS e versão Deno
// têm de viver em árvores separadas. Sempre que mexer numa, mexer na outra.
export const CHECKLIST_DOCUMENTACAO = [
  { slot: "caderneta_predial", titulo: "Caderneta Predial Urbana" },
  { slot: "certidao_permanente", titulo: "Certidão Permanente do Registo Predial" },
  { slot: "licenca_utilizacao", titulo: "Licença de Utilização" },
  { slot: "ficha_tecnica", titulo: "Ficha Técnica de Habitação" },
  { slot: "certificado_energetico", titulo: "Certificado Energético" },
  { slot: "planta_imovel", titulo: "Planta do imóvel" },
  { slot: "cpcv", titulo: "Contrato Promessa Compra e Venda" },
  { slot: "id_vendedor", titulo: "Documento de identificação do vendedor" },
  { slot: "comprovativo_imi", titulo: "Comprovativo de IMI" },
];

export function renderDocumentacaoChecklist(b: any, im: any) {
  let fotos: any[] = [];
  try { fotos = typeof im.fotos === "string" ? JSON.parse(im.fotos || "[]") : (im.fotos || []); } catch { fotos = []; }

  const porSlot = new Map<string, any>();
  for (const f of fotos) if (f?.slot) porSlot.set(f.slot, f);

  b.newPage();
  b.header("DOCUMENTAÇÃO");

  const rows = CHECKLIST_DOCUMENTACAO.map((item) => {
    const f = porSlot.get(item.slot);
    const isPdf = f && (/\.pdf$/i.test(f.name || "") || f.type === "application/pdf");
    const estado = !f
      ? "Em falta"
      : isPdf ? "Anexo · PDF" : "Anexo · imagem (apenas listado)";
    return { label: item.titulo, value: estado };
  });

  b.simpleTable(rows);
  b.space(3);
  b.note("Os documentos PDF importados na checklist constam como páginas anexas no fim deste dossier. Documentos em formato de imagem ficam apenas listados aqui; para os anexar contacte a Somnium Properties.");
}
