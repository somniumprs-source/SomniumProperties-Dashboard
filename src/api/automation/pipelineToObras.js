import * as pipelineDB from '../../notion/databases/pipeline.js'
import * as obrasDB from '../../notion/databases/obras.js'

/**
 * Verifica entradas do Pipeline com Fase = "Contrato fechado"
 * e cria a entrada correspondente no Registo de Obras (se ainda não existir).
 */
export async function syncPipelineToObras() {
  const contratos = await pipelineDB.listAll([
    { property: 'Fase', select: { equals: 'Contrato fechado' } },
  ])

  const obrasExistentes = await obrasDB.listAll()
  const nomesExistentes = new Set(obrasExistentes.map(o => o.nome.trim().toLowerCase()))

  let criadas = 0
  for (const contrato of contratos) {
    const nomeNorm = contrato.nome.trim().toLowerCase()
    if (nomesExistentes.has(nomeNorm)) continue

    await obrasDB.create({
      nome:               contrato.nome,
      cliente:            contrato.cliente,
      tipoObra:           contrato.tipoObra ?? 'Construção nova',
      orcamentoAprovado:  contrato.valorEstimado,
      status:             'Planeada',
      dataInicioPrevista: contrato.dataFechoPrevista ?? new Date().toISOString().slice(0, 10),
    })
    criadas++
    console.log(`[pipelineToObras] Obra criada: ${contrato.nome}`)
  }

  console.log(`[pipelineToObras] Sync concluído — ${criadas} obra(s) criada(s)`)
  return { criadas }
}
