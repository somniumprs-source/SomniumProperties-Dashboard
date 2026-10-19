// @ts-nocheck
// Extração de documentos com IA (agente «extrator-documentos»).
// Espelho de src/db/extratorDocumentos.js (manter em sync).
// Definição do agente para o Claude Code: .claude/agents/extrator-documentos.md.
//
// A IA só lê e devolve JSON (PROMPT_EXTRATOR); é a plataforma que decide o que
// gravar (camposParaFicha): só campos vazios e só a partir do documento certo.
// paraAnalise() converte a extração no registo que o separador Documentos já
// mostra (estado, campos, alertas, cruzamento de dados entre documentos).

export const MODELO_EXTRATOR = 'claude-sonnet-5-5'

export const PROMPT_EXTRATOR = `És um assistente de extração documental para uma empresa de promoção imobiliária, reabilitação e construção em Portugal.

## Objetivo
Ler o documento fornecido, identificar o tipo de documento e extrair apenas informação explicitamente presente. Nunca inventes, completes ou infiras dados que não estejam no documento.

## Tipos de documentos
- Fatura de fornecedor
- Orçamento / proposta
- Contrato
- Fatura/recibo
- Guia de remessa
- Medição de obra
- Relatório técnico
- Licenciamento / alvará / parecer
- Caderneta predial / certidão
- Documento bancário
- Outro

## Regras obrigatórias
1. Lê o documento completo antes de responder.
2. Identifica o tipo de documento.
3. Extrai somente dados que existam literalmente no documento.
4. Se um campo não existir, devolve \`null\`.
5. Se um valor for ilegível, ambíguo ou contraditório, devolve \`null\` e explica em \`observacoes\`.
6. Não calcules IVA, totais, prazos ou conversões, exceto se o cálculo estiver explícito no documento.
7. Normaliza datas para \`YYYY-MM-DD\`.
8. Normaliza valores monetários para número decimal, sem símbolos.
9. Preserva o nome exato de entidades, obras, moradas, referências e números de documento.
10. Distingue claramente NIF, número de cliente, número de fatura, número de obra e referência interna.
11. Para documentos em português, mantém os termos originais quando relevantes.
12. Nunca escrevas diretamente na plataforma. Devolve apenas o JSON estruturado.

## Formato de saída
Responde exclusivamente com JSON válido, sem texto extra:

{
  "tipo_documento": "string",
  "confianca": "alta | media | baixa",
  "fornecedor": {
    "nome": "string | null",
    "nif": "string | null",
    "morada": "string | null",
    "email": "string | null",
    "telefone": "string | null",
    "iban": "string | null"
  },
  "cliente": {
    "nome": "string | null",
    "nif": "string | null"
  },
  "documento": {
    "numero": "string | null",
    "data_emissao": "YYYY-MM-DD | null",
    "data_vencimento": "YYYY-MM-DD | null",
    "moeda": "EUR | null",
    "valor_total_sem_iva": "number | null",
    "valor_iva": "number | null",
    "valor_total_com_iva": "number | null",
    "condicoes_pagamento": "string | null"
  },
  "obra": {
    "nome": "string | null",
    "morada": "string | null",
    "referencia_interna": "string | null",
    "fase": "string | null"
  },
  "linhas": [
    {
      "descricao": "string | null",
      "quantidade": "number | null",
      "unidade": "string | null",
      "preco_unitario": "number | null",
      "valor_total": "number | null",
      "taxa_iva": "number | null"
    }
  ],
  "campos_plataforma": {
    "campo_1": "valor | null",
    "campo_2": "valor | null"
  },
  "documentos_relacionados": [
    "string | null"
  ],
  "alertas": [
    "string | null"
  ],
  "observacoes": "string | null"
}

## Critério de confiança
- \`alta\`: todos os campos críticos estão legíveis e coerentes.
- \`media\`: faltam campos não críticos ou há pequenas ambiguidades.
- \`baixa\`: documento ilegível, incompleto, contraditório ou com dados críticos em falta.

## Antes de finalizar
Verifica se:
- O JSON é válido.
- Nenhum campo foi inventado.
- Todas as datas estão em \`YYYY-MM-DD\`.
- Todos os valores monetários são números.
- Os alertas indicam qualquer risco, incoerência ou campo crítico em falta.`

// Contexto de um documento do imóvel: o que é campos_plataforma e o que
// assinalar nos alertas. Vai na mensagem, junto com o documento.
export function contextoImovel(tipoImovel) {
  const t = String(tipoImovel || '').toLowerCase()
  const tipo = t.includes('morad') ? 'moradia' : t.trim() ? 'apartamento' : 'não especificado'
  return `Contexto: documento carregado na ficha de um imóvel (tipo: ${tipo}).

Em "campos_plataforma" usa exatamente estas chaves (null quando não constam do documento):
{
  "artigo_matricial": "artigo da matriz, como aparece (ex.: U-1234 ou 1234)",
  "descricao_predial": "número da descrição na conservatória, como aparece (ex.: 1234/20010315)",
  "fracao": "letra(s) da fração autónoma",
  "freguesia": "string", "concelho": "string", "distrito": "string",
  "morada": "morada do prédio, como aparece",
  "area_bruta_privativa": "number (m²)", "area_bruta_dependente": "number (m²)",
  "vpt": "number (valor patrimonial tributário, €)",
  "titulares": [{ "nome": "string", "nif": "string | null" }],
  "licenca_utilizacao_numero": "string", "licenca_utilizacao_data": "YYYY-MM-DD",
  "certificado_energetico_classe": "A+ | A | B | B- | C | D | E | F",
  "certificado_energetico_numero": "string", "certificado_energetico_validade": "YYYY-MM-DD"
}
"titulares": na certidão permanente, os sujeitos ativos da última aquisição registada (o proprietário atual); na caderneta, os titulares do rendimento.

Nos "alertas", começa por "CRÍTICO:" o que impede ou põe em risco a compra. Verifica, quando se aplicar:
- Certidão permanente: ónus, penhoras, hipotecas ou outros encargos registados (CRÍTICO).
- Caderneta predial: área ou afetação incoerente com o tipo de imóvel.
- Licença de utilização: uso não habitacional (CRÍTICO).
- Certificado energético: validade expirada; classe abaixo de D.
- Ficha técnica da habitação: falta de assinatura técnica.
- Declaração do condomínio: dívidas em atraso (CRÍTICO).
- Qualquer documento: datas vencidas, assinaturas em falta, dados contraditórios.`
}

const tem = v => v !== null && v !== undefined && String(v).trim() !== ''
const num = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const x = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(x) ? x : null
}
const dataPt = d => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? String(d).split('-').reverse().join('/') : d)

// Lê o JSON da resposta da IA (tolera texto à volta). null se for ilegível.
export function lerExtracao(texto) {
  try {
    const m = String(texto || '').match(/\{[\s\S]*\}/)
    const j = JSON.parse(m?.[0] || texto)
    return j && typeof j === 'object' ? j : null
  } catch { return null }
}

// Chama a IA com o documento (bloco document/image da API). Devolve a extração.
export async function extrairDocumento(client, fileBlock, contexto) {
  const r = await client.messages.create({
    model: MODELO_EXTRATOR,
    max_tokens: 4096,
    system: PROMPT_EXTRATOR,
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: contexto }] }],
  })
  return lerExtracao(r.content?.find(b => b.type === 'text')?.text)
}

const ROTULOS = {
  artigo_matricial: 'Artigo matricial', descricao_predial: 'Descrição predial', fracao: 'Fração',
  morada: 'Morada', freguesia: 'Freguesia', concelho: 'Concelho', vpt: 'VPT',
  area_bruta_privativa: 'ABP (m²)', area_bruta_dependente: 'ABD (m²)',
  licenca_utilizacao_numero: 'Licença n.º', licenca_utilizacao_data: 'Data da licença',
  certificado_energetico_classe: 'Classe energética', certificado_energetico_numero: 'N.º do CE',
  certificado_energetico_validade: 'Validade do CE',
}

const titularesDe = cp => (Array.isArray(cp?.titulares) ? cp.titulares : []).filter(t => tem(t?.nome))

// Registo da análise no formato do separador Documentos (documentacao_analise).
export function paraAnalise(ex) {
  const cp = ex?.campos_plataforma || {}
  const doc = ex?.documento || {}
  const alertas = (Array.isArray(ex?.alertas) ? ex.alertas : []).filter(tem).map(String)
  const flags = alertas.map(a => {
    const critico = /^\s*CR[IÍ]TICO\s*:/i.test(a)
    const texto = a.replace(/^\s*CR[IÍ]TICO\s*:\s*/i, '').trim()
    return { severity: critico ? 'critical' : 'warning', titulo: texto.length > 80 ? `${texto.slice(0, 77)}…` : texto, descricao: texto }
  })
  if (ex?.confianca === 'baixa') flags.push({ severity: 'warning', titulo: 'Leitura com confiança baixa', descricao: ex?.observacoes || 'Confirmar os dados no documento.' })
  const valido = flags.some(f => f.severity === 'critical') ? false : flags.length ? 'warning' : true

  const tit = titularesDe(cp)
  const campos = []
  for (const [k, rot] of Object.entries(ROTULOS)) if (tem(cp[k])) campos.push({ label: rot, valor: k.endsWith('_data') || k.endsWith('_validade') ? dataPt(cp[k]) : String(cp[k]) })
  if (tit.length) campos.push({ label: tit.length > 1 ? 'Titulares' : 'Titular', valor: tit.map(t => (t.nif ? `${t.nome} (NIF ${t.nif})` : t.nome)).join('; ') })
  if (tem(ex?.fornecedor?.nome)) campos.push({ label: 'Emitente', valor: ex.fornecedor.nome })
  if (tem(doc.numero)) campos.push({ label: 'N.º do documento', valor: String(doc.numero) })
  if (tem(doc.data_emissao)) campos.push({ label: 'Data', valor: dataPt(doc.data_emissao) })
  if (tem(doc.valor_total_com_iva)) campos.push({ label: 'Total com IVA (€)', valor: String(doc.valor_total_com_iva) })

  const dados_chave = {}
  const put = (k, v) => { if (tem(v)) dados_chave[k] = String(v) }
  put('morada', cp.morada); put('freguesia', cp.freguesia); put('concelho', cp.concelho)
  put('artigo_matricial', cp.artigo_matricial); put('fracao', cp.fracao)
  put('area', cp.area_bruta_privativa); put('vpt', cp.vpt)
  put('titular', tit.map(t => t.nome).join(', ')); put('data_documento', doc.data_emissao)
  put('validade', cp.certificado_energetico_validade)

  return {
    tipo_documento: ex?.tipo_documento || 'Documento',
    valido,
    confianca: ex?.confianca || null,
    campos: campos.slice(0, 8),
    dados_chave,
    flags,
    resumo: ex?.observacoes || '',
    pontos_verificar: [],
    extracao: ex,
  }
}

// ── Preenchimento da ficha do imóvel ─────────────────────────────
// Só a partir do documento certo (num contrato ou numa fatura, o «titular» não
// é o proprietário) e só campos vazios. Exceções que se corrigem: descrição
// predial com texto corrido em vez do número; licença e certificado em
// «Em obtenção»/«Não tem» quando chega o documento.
const CLASSES_CE = ['A+', 'A', 'B', 'B−', 'C', 'D', 'E', 'F']
const vazio = (im, k) => !tem(im[k]) || (['vpt', 'area_bruta', 'area_bruta_dependente'].includes(k) && !num(im[k]))

export function camposParaFicha(ex, imovel = {}) {
  const cp = ex?.campos_plataforma || {}
  const tipo = String(ex?.tipo_documento || '')
  const out = {}
  const se = (k, v, podeSubstituir = false) => { if (tem(v) && (vazio(imovel, k) || podeSubstituir)) out[k] = typeof v === 'string' ? v.trim() : v }

  if (/certid|caderneta|registo predial/i.test(tipo)) {
    se('artigo_matricial', cp.artigo_matricial)
    const desc = String(imovel.descricao_predial || '')
    se('descricao_predial', cp.descricao_predial, desc.length > 40 && !/^\s*\d+\/\d+/.test(desc))
    se('fracao', cp.fracao)
    se('morada', cp.morada)
    se('freguesia', cp.freguesia)
    se('concelho', cp.concelho)
    se('distrito', cp.distrito)
    se('vpt', num(cp.vpt))
    se('area_bruta', num(cp.area_bruta_privativa))
    se('area_bruta_dependente', num(cp.area_bruta_dependente))
    const tit = titularesDe(cp)
    if (tit.length) {
      se('proprietario_nome', tit.map(t => t.nome.trim()).join(', '))
      if (tit.every(t => tem(t.nif))) se('proprietario_nif', tit.map(t => String(t.nif).trim()).join(', '))
    }
  }
  if (/licen[cç]a|alvar[aá]/i.test(tipo) && (tem(cp.licenca_utilizacao_numero) || tem(cp.licenca_utilizacao_data))) {
    se('licenca_utilizacao', 'Tem', ['Em obtenção', 'Não tem'].includes(String(imovel.licenca_utilizacao || '')))
    const det = [cp.licenca_utilizacao_numero && `n.º ${cp.licenca_utilizacao_numero}`, cp.licenca_utilizacao_data && `de ${dataPt(cp.licenca_utilizacao_data)}`].filter(Boolean).join(' ')
    se('licenca_utilizacao_detalhe', det)
  }
  if (/energ/i.test(tipo)) {
    const classe = String(cp.certificado_energetico_classe || '').trim().toUpperCase().replace('-', '−')
    if (CLASSES_CE.includes(classe)) se('certificado_energetico', classe, ['Em obtenção', 'Não tem'].includes(String(imovel.certificado_energetico || '')))
    se('numero_ce', cp.certificado_energetico_numero)
  }
  return out
}

const NOMES_CAMPOS = {
  artigo_matricial: 'artigo matricial', descricao_predial: 'descrição predial', fracao: 'fração', morada: 'rua',
  freguesia: 'freguesia', concelho: 'concelho', distrito: 'distrito', vpt: 'VPT', area_bruta: 'ABP',
  area_bruta_dependente: 'ABD', proprietario_nome: 'proprietário', proprietario_nif: 'NIF do proprietário',
  licenca_utilizacao: 'licença de utilização', licenca_utilizacao_detalhe: 'n.º e data da licença',
  certificado_energetico: 'classe energética', numero_ce: 'n.º do CE',
}
export const nomesPreenchidos = campos => Object.keys(campos).map(k => NOMES_CAMPOS[k] || k)
