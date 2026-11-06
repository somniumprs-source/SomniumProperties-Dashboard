// @ts-nocheck
// Documentação da empresa (Administração › Documentos): categorias e regras de
// validade. Espelho de src/constants/documentosEmpresa.js (manter em sync).
//
// • Cada linha da tabela é um documento da Somnium Properties (RCBE, certidão
//   permanente, certidões de não dívida, seguros…). A linha pode ser criada
//   sem ficheiro e o ficheiro anexado mais tarde.
// • A validade é opcional. Com data de validade, o documento fica «A expirar»
//   nos DIAS_AVISO dias anteriores e «Expirado» a partir do dia seguinte;
//   nesses dois estados entra nos Alertas.

export const CATEGORIAS_DOCUMENTOS_EMPRESA = [
  'Constitucionais',
  'Fiscais',
  'Licenças',
  'Seguros',
  'Bancários',
  'Contratos',
  'Recursos Humanos',
  'Outros',
]

export const DIAS_AVISO_VALIDADE = 30

// Sugestões de nome por categoria (datalist do formulário, não obrigatórias).
export const SUGESTOES_DOCUMENTOS_EMPRESA = {
  Constitucionais: ['RCBE', 'Certidão Permanente', 'Pacto Social', 'Cartão de Pessoa Colectiva (NIPC)', 'Acta de Constituição'],
  Fiscais: ['Declaração de Início de Actividade', 'Certidão de Não Dívida AT', 'Certidão de Não Dívida Segurança Social', 'IES', 'Modelo 22'],
  'Licenças': ['Licença AMI (IMPIC)'],
  Seguros: ['Seguro de Responsabilidade Civil'],
  'Bancários': ['Comprovativo de IBAN'],
  Contratos: [],
  'Recursos Humanos': [],
  Outros: [],
}

const DIA_MS = 86400000

function diaUTC(d) {
  const x = d instanceof Date ? d : new Date(String(d).slice(0, 10) + 'T00:00:00Z')
  if (isNaN(x)) return null
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())
}

// → { estado: 'sem_validade' | 'valido' | 'a_expirar' | 'expirado', dias }
// `dias` = dias até à validade (negativo se já expirou; null sem validade).
export function estadoValidade(dataValidade, hoje = new Date()) {
  if (!dataValidade) return { estado: 'sem_validade', dias: null }
  const v = diaUTC(dataValidade)
  const h = diaUTC(hoje)
  if (v == null || h == null) return { estado: 'sem_validade', dias: null }
  const dias = Math.round((v - h) / DIA_MS)
  if (dias < 0) return { estado: 'expirado', dias }
  if (dias <= DIAS_AVISO_VALIDADE) return { estado: 'a_expirar', dias }
  return { estado: 'valido', dias }
}

// Alertas para a página Alertas (mesmo formato dos restantes).
export function alertasDocumentosEmpresa(docs, hoje = new Date()) {
  const alertas = []
  for (const d of docs || []) {
    const { estado, dias } = estadoValidade(d.data_validade, hoje)
    if (estado === 'expirado') {
      alertas.push({ tipo: 'documento_empresa', severidade: 'critico', entidade: d.nome,
        mensagem: `Expirou a ${String(d.data_validade).slice(0, 10)} (${-dias} dia${dias === -1 ? '' : 's'}): renovar e substituir o ficheiro`, status: d.categoria, id: d.id })
    } else if (estado === 'a_expirar') {
      alertas.push({ tipo: 'documento_empresa', severidade: 'aviso', entidade: d.nome,
        mensagem: dias === 0 ? 'Expira hoje' : `Expira a ${String(d.data_validade).slice(0, 10)} (faltam ${dias} dia${dias === 1 ? '' : 's'})`, status: d.categoria, id: d.id })
    }
  }
  return alertas
}
