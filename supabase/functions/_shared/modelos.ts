// Deteção robusta do modelo Wholesalling (espelho de src/lib/modelos.js).
// Aceita modelo_negocio OU estado como sinal, para o modelo não partir quando
// o campo editável modelo_negocio diverge do estado/pipeline.
export function isWholesaling(imovel: any): boolean {
  if (!imovel) return false;
  if (imovel.modelo_negocio === "Wholesaling") return true;
  const estado = imovel.estado;
  return estado === "Wholesaling" || estado === "Wholesalling";
}
