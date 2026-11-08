// Marca Pessoal (Marketing): plano de 6 meses do Alexandre Mendes.
// Fonte do conteúdo base. As alterações feitas na app (estado, textos
// editados, notas, link) ficam na tabela marca_pessoal_posts e
// sobrepõem-se a estes valores (ver juntarPosts).
import { POSTS_MES_1 } from './marcaPessoalMes1.js'
import { POSTS_MES_2 } from './marcaPessoalMes2.js'
import { POSTS_MES_3 } from './marcaPessoalMes3.js'
import { POSTS_MES_4 } from './marcaPessoalMes4.js'
import { POSTS_MES_5 } from './marcaPessoalMes5.js'
import { POSTS_MES_6 } from './marcaPessoalMes6.js'

export const MP_PLANO = {
  titulo: 'Plano de marca pessoal · Alexandre Mendes',
  periodo: 'Dezembro 2026 a Maio 2027',
  objetivo: 'Aumentar a literacia imobiliária de quem nos segue e, com isso, ganhar a confiança de investidores, proprietários e consultores.',
  posicionamento: 'O sócio que mostra os números. Explica, com dados reais de Coimbra, como se analisa, financia e executa um investimento imobiliário. Não vende oportunidades nas redes: mostra como trabalha.',
  tese: 'Quem ensina com rigor ganha autoridade. Quem mostra a obra real prova que o que ensina funciona. Dois terços das publicações ensinam; um terço prova, sobretudo com o projecto T2 Sub-Cave Lages.',
  regraOuro: 'Nunca anunciar rentabilidades nem pedir capital publicamente.',
  rodape: 'Conteúdo informativo. Não constitui recomendação de investimento.',
}

// Semana 1 de cada mês começa na segunda-feira indicada; as 3 publicações da
// semana saem segunda, quarta e sexta (ordem 1, 2, 3).
export const MP_MESES = [
  { n: 1, nome: 'Dezembro', ano: 2026, tema: 'Fundamentos', subtitulo: 'Investir em imobiliário sem mitos', objetivo: 'Explicar as formas de investir em imobiliário e os termos básicos, sem mitos.', ancora: 'Glossário Somnium (PDF com 25 termos)', palavraChave: 'GLOSSÁRIO', criterio: '4 semanas seguidas com publicações', semanas: ['2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28'] },
  { n: 2, nome: 'Janeiro', ano: 2027, tema: 'Comprar bem', subtitulo: 'Analisar antes de fazer proposta', objetivo: 'Ensinar a analisar um imóvel antes de fazer proposta.', ancora: 'Checklist de visita e due diligence (PDF)', palavraChave: 'CHECKLIST', criterio: 'Primeira mensagem de investidor com origem nas redes', semanas: ['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25'] },
  { n: 3, nome: 'Fevereiro', ano: 2027, tema: 'Obra e risco', subtitulo: 'O lucro ganha-se ou perde-se na obra', objetivo: 'Mostrar que o lucro de um projecto se ganha ou se perde na obra.', ancora: 'Manual de Orçamento de Obra Somnium (versão pública)', palavraChave: 'ORÇAMENTO', criterio: 'Decisão dos sócios: continuar, ajustar ou pausar', semanas: ['2027-02-01', '2027-02-08', '2027-02-15', '2027-02-22'] },
  { n: 4, nome: 'Março', ano: 2027, tema: 'Vender bem', subtitulo: 'Preço certo, sem surpresas fiscais', objetivo: 'Explicar como se vende um imóvel pelo preço certo e sem surpresas fiscais.', ancora: 'Guia "Vender um imóvel em Portugal" (PDF)', palavraChave: 'VENDER', criterio: 'Venda das Lajes prevista no CRM para 21 de março', semanas: ['2027-03-01', '2027-03-08', '2027-03-15', '2027-03-22'] },
  { n: 5, nome: 'Abril', ano: 2027, tema: 'Investir com segurança', subtitulo: 'Financiar e avaliar quem propõe', objetivo: 'Ensinar a avaliar um investimento e quem o propõe. Todos os posts passam por revisão jurídica.', ancora: '10 perguntas a fazer antes de investir com um operador (PDF)', palavraChave: '10 PERGUNTAS', criterio: '10 conversas qualificadas acumuladas', semanas: ['2027-04-05', '2027-04-12', '2027-04-19', '2027-04-26'] },
  { n: 6, nome: 'Maio', ano: 2027, tema: 'Mercado e estratégia', subtitulo: 'Ler Coimbra e escolher uma estratégia', objetivo: 'Ler o mercado de Coimbra, escolher uma estratégia e fechar o ciclo com o caso de estudo das Lajes.', ancora: 'Caso de estudo Lajes (PDF)', palavraChave: 'CASO', criterio: '15 conversas qualificadas acumuladas', semanas: ['2027-05-03', '2027-05-10', '2027-05-17', '2027-05-24'] },
]

export const MP_PILARES = [
  { nome: 'Comprar bem', foco: 'Janeiro', itens: ['Documentos e visitas', 'Avaliar o imóvel (VVR)', 'Preço máximo de compra', 'IMT e Imposto do Selo'] },
  { nome: 'Obra e risco', foco: 'Fevereiro', itens: ['Orçamentar', 'Licenças', 'Empreiteiros e contratos', 'Stress tests'] },
  { nome: 'Vender bem', foco: 'Março', itens: ['Preço de venda', 'CPCV e escritura', 'Mais-valias', 'Documentos de venda'] },
  { nome: 'Investir seguro', foco: 'Abril e Maio', itens: ['Crédito e alavancagem', 'Modelos de parceria', 'Sinais de alerta', 'Mercado de Coimbra'] },
]

export const MP_PUBLICO = [
  { publico: 'Investidores particulares', prioridade: 1, procura: 'Segurança, transparência, controlo de risco', sentir: '"Estes sabem o que fazem e mostram tudo."' },
  { publico: 'Proprietários com imóveis para reabilitar ou vender', prioridade: 2, procura: 'Rapidez, seriedade, preço justo', sentir: '"Se vender à Somnium, o negócio fecha."' },
  { publico: 'Consultores e mediadores', prioridade: 2, procura: 'Parceiros que compram e cumprem', sentir: '"Vale a pena enviar-lhes negócios."' },
  { publico: 'Bancos, empreiteiros e fornecedores', prioridade: 3, procura: 'Contraparte fiável', sentir: '"Empresa organizada, com processo."' },
]

export const MP_CANAIS = [
  { canal: 'LinkedIn (perfil pessoal)', papel: 'Autoridade e confiança', formatos: 'Texto com foto, carrossel PDF, vídeo curto', frequencia: '3 por semana' },
  { canal: 'Instagram (perfil pessoal)', papel: 'Prova visual da obra', formatos: 'Reels, carrossel, stories', frequencia: '2 a 3 posts + 3 a 5 stories por semana' },
  { canal: 'Páginas Somnium', papel: 'Repartilha institucional', formatos: 'Partilha dos posts do Alexandre', frequencia: '1 a 2 por semana' },
  { canal: 'Newsletter LinkedIn', papel: 'Profundidade e lista própria', formatos: 'Artigo mensal', frequencia: '1 por mês, a partir de fevereiro' },
]

export const MP_ROTINA = [
  { dia: 'Segunda', canal: 'LinkedIn', conteudo: 'Publicação 1 da semana', tempo: '45 min' },
  { dia: 'Terça', canal: 'Instagram', conteudo: 'Versão Instagram da publicação de segunda', tempo: '20 min' },
  { dia: 'Quarta', canal: 'LinkedIn e Instagram', conteudo: 'Publicação 2 da semana', tempo: '30 min' },
  { dia: 'Quinta', canal: 'Stories', conteudo: '3 a 5 stories em obra ou em visita', tempo: '10 min' },
  { dia: 'Sexta', canal: 'LinkedIn', conteudo: 'Publicação 3 da semana', tempo: '45 min' },
  { dia: 'Diário', canal: 'LinkedIn', conteudo: '10 comentários em posts de terceiros e responder a todos', tempo: '15 min' },
]

export const MP_FLUXO = [
  'Em cada visita a obra: 5 fotos (sempre os mesmos ângulos) e 1 vídeo vertical de 30 s.',
  'Domingo: o Alexandre grava uma nota de voz de 3 minutos sobre a semana.',
  'A nota é transcrita e o Claude ajusta os textos da semana nesta aba.',
  'O Alexandre revê; o João valida em 24 h só os posts com números de projectos.',
  'Agendamento no LinkedIn e no Meta Business Suite. Estado passa a "Agendado".',
  'Depois de publicar: colar o link e mudar o estado para "Publicado".',
]

export const MP_PAPEIS = [
  { pessoa: 'Alexandre', responsabilidade: 'Rosto, nota de voz semanal, revisão final, respostas e comentários', tempo: '2 a 3 h por semana' },
  { pessoa: 'João', responsabilidade: 'Valida números de projectos, comenta e partilha nas primeiras horas, aparece 1 vez por mês', tempo: '30 min por semana' },
  { pessoa: 'Equipa de obra', responsabilidade: 'Envia fotos e vídeos curtos pelo grupo de WhatsApp do prédio Lajes', tempo: '10 min por semana' },
]

export const MP_KPIS = [
  { indicador: 'Conversas qualificadas com origem nas redes', m2: '2', m4: '7', m6: '15 acumuladas' },
  { indicador: 'Mensagens privadas sobre a empresa ou os temas', m2: '5', m4: '15', m6: '30 por mês' },
  { indicador: 'Seguidores LinkedIn do Alexandre (a partir do valor da semana 1)', m2: '+150', m4: '+400', m6: '+800' },
  { indicador: 'Taxa de interacção média', m2: '3%', m4: '4%', m6: '5%' },
  { indicador: 'Semanas com as 3 publicações feitas', m2: '100%', m4: '100%', m6: '100%' },
  { indicador: 'Pedidos de peças âncora (PDF)', m2: '10', m4: '30', m6: '60 acumulados' },
]

export const MP_ORCAMENTO = [
  { rubrica: 'Microfone de lapela sem fios', valor: '50 a 150 EUR', quando: 'Mês 1' },
  { rubrica: 'Tripé ou estabilizador para telemóvel', valor: '30 a 80 EUR', quando: 'Mês 1' },
  { rubrica: 'Sessão fotográfica profissional', valor: '150 a 300 EUR', quando: 'Mês 1' },
  { rubrica: 'Revisão jurídica das regras (1 h)', valor: '100 a 250 EUR', quando: 'Mês 1' },
  { rubrica: 'Canva Pro (templates Somnium)', valor: 'cerca de 70 EUR', quando: 'Meses 1 a 6' },
  { rubrica: 'Promoção paga opcional', valor: '0 a 600 EUR', quando: 'Meses 4 a 6' },
]

export const MP_FORMATOS = [
  { nome: 'Carrossel educativo', descricao: '6 a 10 slides: um conceito, um exemplo, uma conclusão.', canal: 'LinkedIn (PDF) e Instagram', tempo: '45 min' },
  { nome: 'Fazer as contas', descricao: 'Cálculo passo a passo com exemplo fictício e valores redondos.', canal: 'LinkedIn e Instagram', tempo: '45 min' },
  { nome: 'Mito ou realidade', descricao: 'Texto curto que desmonta uma ideia feita.', canal: 'LinkedIn', tempo: '20 min' },
  { nome: 'Checklist', descricao: 'Lista para guardar, versão curta da peça âncora.', canal: 'LinkedIn e Instagram', tempo: '30 min' },
  { nome: 'Reel explicativo ou em visita', descricao: '30 a 60 s, o Alexandre a falar para a câmara ou dentro de um imóvel.', canal: 'Instagram e LinkedIn', tempo: '30 min' },
  { nome: 'Prova Lajes', descricao: 'Foto ou vídeo da obra, 1 número e 1 decisão.', canal: 'Todos', tempo: '20 min' },
  { nome: 'Bastidores', descricao: 'Como a Somnium trabalha por dentro.', canal: 'LinkedIn', tempo: '20 min' },
  { nome: 'Respostas', descricao: 'Vídeo de 90 s a responder a perguntas reais recebidas.', canal: 'LinkedIn e Instagram', tempo: '30 min' },
  { nome: 'Sondagem', descricao: 'Pergunta com 3 a 4 opções para descobrir dúvidas.', canal: 'LinkedIn', tempo: '5 min' },
  { nome: 'Peça âncora (PDF mensal)', descricao: 'Guia que as pessoas guardam, enviado a quem pede por mensagem. Quem pede entra no CRM.', canal: 'LinkedIn', tempo: '3 a 4 h por mês' },
  { nome: 'Newsletter mensal', descricao: 'Tema do mês aprofundado e resumo do que se publicou.', canal: 'LinkedIn', tempo: '1 h por mês' },
  { nome: 'Sessão ao vivo', descricao: '30 minutos de perguntas e respostas.', canal: 'LinkedIn ou Instagram', tempo: '1 h' },
]

export const MP_REGRAS = [
  { tema: 'Captação de capital', regra: 'Nunca publicar rentabilidades previstas, vagas, montantes mínimos ou convites a investir. Falar de processo, não de produto. Pedidos para investir tratam-se só em conversa privada.', base: 'Ofertas ao público de investimentos podem estar sujeitas à supervisão da CMVM. Validar com o jurídico externo.' },
  { tema: 'Mediação imobiliária', regra: 'Posts que anunciem um imóvel para venda via mediação levam a denominação da empresa e o número da licença AMI.', base: 'Lei n.º 15/2013 (mediação imobiliária)' },
  { tema: 'Anúncio de venda', regra: 'Indicar a classe energética sempre que um imóvel é publicitado para venda.', base: 'Regime do certificado energético' },
  { tema: 'Dados de investidores', regra: 'Nomes, fotos ou resultados só com autorização escrita e depois da venda.', base: 'RGPD e confidencialidade do contrato' },
  { tema: 'Imagem de terceiros', regra: 'Empreiteiros, vizinhos, consultores e compradores só aparecem com autorização (WhatsApp chega).', base: 'Direito à imagem e RGPD' },
  { tema: 'Moradas e matrículas', regra: 'Sem morada exacta antes da venda. Desfocar matrículas e números de porta.', base: 'Segurança e privacidade' },
  { tema: 'Números', regra: 'Todo o número publicado bate com o CRM. Valores entre [ ] nunca saem publicados. Erros corrigem-se no próprio post, sem apagar.', base: 'Credibilidade' },
  { tema: 'Impostos e direito', regra: 'Posts fiscais e jurídicos levam o rodapé informativo e são confirmados com contabilista ou advogado antes de sair.', base: 'Prudência' },
]

export const MP_LAJES_MOSTRAR = [
  'Preço de compra e custos de transacção',
  'Orçamento de obra por rubrica e desvios reais',
  'Decisões: empreiteiro, planta, materiais',
  'Problemas e como foram resolvidos',
  'Lógica do valor de venda (comparáveis)',
  'Resultado final depois da escritura, com autorização',
]
export const MP_LAJES_NAO_MOSTRAR = [
  'Nomes, capital ou retorno dos investidores',
  'Margem prevista ou rentabilidade esperada',
  'Nome do vendedor ou condições da negociação',
  'Morada exacta, matrículas, caras sem autorização',
  'Preços pedidos por vizinhos',
  'Qualquer frase do tipo "ainda há vagas para investir"',
]

export const MP_ESTADOS = ['Por produzir', 'Em produção', 'Pronto', 'Agendado', 'Publicado']
export const MP_ESTADO_TONE = { 'Por produzir': 'gray', 'Em produção': 'yellow', 'Pronto': 'blue', 'Agendado': 'purple', 'Publicado': 'green' }
export const MP_TIPOS = ['Literacia', 'Prova']

function somarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Data prevista: segunda, quarta ou sexta da semana do mês.
export function dataPrevista(post) {
  const mes = MP_MESES.find(m => m.n === post.mes)
  const inicio = mes?.semanas[(post.semana || 1) - 1]
  if (!inicio) return null
  return somarDias(inicio, [0, 2, 4][(post.ordem || 1) - 1] ?? 0)
}

export const MP_POSTS_BASE = [...POSTS_MES_1, ...POSTS_MES_2, ...POSTS_MES_3, ...POSTS_MES_4, ...POSTS_MES_5, ...POSTS_MES_6]
  .map(p => ({ ...p, data_prevista: dataPrevista(p), estado: 'Por produzir', base: true }))

// Campos da BD que se sobrepõem ao conteúdo base (null = manter o base).
export const MP_CAMPOS_EDITAVEIS = ['mes', 'semana', 'ordem', 'tipo', 'pilar', 'tema', 'objetivo', 'formato', 'canal', 'guiao', 'linkedin', 'instagram', 'data_prevista', 'estado', 'link_publicacao', 'data_publicacao', 'notas', 'arquivado']

export function juntarPosts(linhas = []) {
  const porId = new Map(linhas.map(l => [l.id, l]))
  const base = MP_POSTS_BASE.map(p => {
    const l = porId.get(p.id)
    if (!l) return p
    const out = { ...p, updated_at: l.updated_at }
    for (const k of MP_CAMPOS_EDITAVEIS) if (l[k] !== null && l[k] !== undefined) out[k] = l[k]
    return out
  })
  const extra = linhas
    .filter(l => !MP_POSTS_BASE.some(p => p.id === l.id))
    .map(l => ({ estado: 'Por produzir', tipo: 'Literacia', ...l, base: false }))
  return [...base, ...extra]
    .filter(p => !p.arquivado)
    .sort((a, b) => (a.data_prevista || '9999').localeCompare(b.data_prevista || '9999') || (a.ordem || 0) - (b.ordem || 0))
}

export function temPorPreencher(texto) {
  return /\[[^\]]+\]/.test(texto || '')
}
