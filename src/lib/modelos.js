// Deteção robusta do modelo Wholesalling.
//
// Todo o comportamento de Wholesalling (esconder abas Stress/CAEP, campo de
// fee de cedência, calcEngine compra+fee, lucro=fee) estava amarrado a um único
// campo editável — `modelo_negocio === 'Wholesaling'`. Quando esse campo diverge
// do estado/pipeline (ex.: imóvel em estado 'Wholesaling' com modelo_negocio a
// dizer 'CAEP'), o modelo "desligava" só para esse imóvel. Este helper aceita
// também o estado como sinal, para o modelo não partir por inconsistência de dados.
export function isWholesaling(imovel) {
  if (!imovel) return false
  if (imovel.modelo_negocio === 'Wholesaling') return true
  const estado = imovel.estado
  return estado === 'Wholesaling' || estado === 'Wholesalling'
}
