// Mensagens da leitura automática de um anexo de despesa (auditoria D3).
// `lido` = resposta do upload: { leitura, preenchidos }.
// A leitura corre no Mac (Claude Code, plano Claude): com `leitura_em_fila` só
// se avisa que os campos vazios são preenchidos no ciclo seguinte do worker.
export function avisarLeitura(toast, lido) {
  if (lido?.leitura_em_fila && !lido?.leitura) {
    toast?.('Documento guardado. A leitura corre no Mac e preenche os campos vazios no próximo ciclo (até 3 minutos).', 'info', 5000)
    return
  }
  const l = lido?.leitura
  if (!l) return
  const criticos = (l.avisos || []).filter(a => /^\s*CR[IÍ]TICO/i.test(a))
  const outros = (l.avisos || []).filter(a => !/^\s*CR[IÍ]TICO/i.test(a))
  if (criticos.length) toast?.(criticos[0].replace(/^\s*CR[IÍ]TICO\s*:\s*/i, ''), 'error', 8000)
  else if (outros.length) toast?.(outros[0], 'warning', 6000)
  if (lido.preenchidos?.length) toast?.(`Lido do documento: ${lido.preenchidos.join(', ')}.`, 'success', 4000)
}
