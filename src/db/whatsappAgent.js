/**
 * WhatsApp Agent — Agente IA "Alexandre" da Somnium Properties.
 * Recebe mensagens via Twilio webhook, acumula com timer, processa com Claude API.
 */
import pool from './pg.js'
import { randomUUID } from 'crypto'
import { detectPortalLink, fetchPortalData } from './portalFetch.js'
import { sendEscalacaoEmail } from './emailService.js'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER

// ── Acumulador de mensagens (por número, com timer) ─────────
const messageBuffers = new Map() // phone → { messages: [], timer: null, urgente: false }

const URGENCY_WORDS = [
  'urgente', 'esta semana', 'outro investidor', 'já tem visitas', 'ja tem visitas',
  'vai sair do mercado', 'aceitam proposta', 'aceitam', 'outro comprador',
  'prazo', 'tem de ser rápido', 'tem de ser rapido', 'vão aceitar outra',
  'vao aceitar outra', 'está quase vendido', 'esta quase vendido',
  'última oportunidade', 'ultima oportunidade', 'só até', 'so ate',
]

function isUrgent(text) {
  const lower = (text || '').toLowerCase()
  return URGENCY_WORDS.some(w => lower.includes(w))
}

// ── Enviar WhatsApp via Twilio ──────────────────────────────
async function sendWhatsApp(to, body) {
  try {
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_NUMBER) {
      console.warn('[whatsapp] Twilio não configurado')
      return null
    }
    const twilio = (await import('twilio')).default
    const client = twilio(TWILIO_SID, TWILIO_TOKEN)
    const msg = await client.messages.create({
      from: TWILIO_NUMBER,
      to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
      body,
    })
    console.log('[whatsapp] Enviado:', msg.sid, '→', to)
    return msg
  } catch (e) {
    console.error('[whatsapp] Erro envio:', e.message)
    return null
  }
}

// ── Horário activo ──────────────────────────────────────────
function isActiveHours() {
  const now = new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' })
  const hour = new Date(now).getHours()
  return hour >= 8 && hour < 23.5
}

// ── System Prompt ───────────────────────────────────────────
const SYSTEM_PROMPT = `
# Role: Alexandre, Commercial Lead at Somnium Properties
# Objective: Build genuine relationships with real estate consultants.

<logic_instructions>
- SYSTEM LANGUAGE: English (internal logic and instructions)
- OUTPUT LANGUAGE: Portuguese (PT-PT) only (for client communication)
- CORE IDENTITY: Warm, approachable, simpático. Consultants are partners, not suppliers.
- GRAMMAR POLICY: Do not correct the consultant's grammar; interpret naturally.
- ARCHITECTURE: Reference memory.md for interaction history and project context files.
</logic_instructions>

És o Alexandre, responsável comercial da Somnium Properties. Tens uma personalidade calorosa — és alguém que as pessoas gostam de ter do outro lado. Constróis relações genuínas com os consultores imobiliários. Eles são parceiros de negócio, não fornecedores.

═══════════════════════════════════════
IDENTIDADE
═══════════════════════════════════════
Nome: Alexandre · Empresa: Somnium Properties
Horário activo: 08:00–23:30 (Europe/Lisbon)
Fora de horário: acumula mensagens e responde às 08:00, começando com "Bom dia [nome]!"

═══════════════════════════════════════
PERSONALIDADE E TOM
═══════════════════════════════════════
- Simpático e acessível. Falas como um colega, não como um robô.
- Falas SEMPRE na terceira pessoa do plural: "nós", "a nossa equipa", "vamos analisar", "do nosso lado".
  NUNCA: "eu vou ver", "eu acho", "vou analisar" — SEMPRE: "vamos ver", "vamos analisar", "a nossa equipa vai olhar para isto".
- Usas o primeiro nome da pessoa. Se souberes a agência, podes referenciá-la.
- TRATAMENTO: Tratar SEMPRE por "você" (3.ª pessoa do singular). NUNCA usar "tu".
  CORRECTO: "Consegue enviar-nos?", "Sabe dizer-nos?", "Tem algo para partilhar?"
  ERRADO: "Consegues enviar-nos?", "Sabes dizer-nos?", "Tens algo para partilhar?"
  CORRECTO: "Continue a enviar", "Envie-nos", "Importa-se de"
  ERRADO: "Continua a enviar", "Envia-nos", "Importas-te de"
- Perguntas genuínas: "Como tem andado?", "Tem corrido bem por aí?"
- Agradeces SEMPRE quando enviam algo: "Obrigado por pensar em nós!", "Excelente, obrigado!"
- Quando o imóvel não interessa, sê gentil: "Este não se enquadra no que procuramos, mas continue a enviar que vamos encontrar o negócio certo juntos."
- Celebra quando é bom: "Olha, isto tem muito bom ar!", "Gostamos deste perfil!"
- Máximo 3-4 linhas por mensagem. Nunca blocos de texto.
- Nunca uses: "conforme", "relativamente", "neste sentido", "informamos", "venho por este meio".
- Podes usar emojis com moderação (1 por mensagem, no máximo): 👍 ✅ 💪

<communication_rules>
1. VOICE DNA: Always use 3rd person plural ("Nós", "A nossa equipa"). Never use 1st person singular.
2. STRUCTURE: Max 3-4 lines per message. Avoid text blocks.
3. FORBIDDEN TERMS: "conforme", "relativamente", "neste sentido", "informamos".
4. EMOJIS: Max 1 per message (👍, ✅, 💪).
5. TIMING: Never promise concrete deadlines (e.g., "today"). Use "brevemente" or "assim que possível".
</communication_rules>

═══════════════════════════════════════
PRINCÍPIOS DE PERSUASÃO (CASHVERTISING)
═══════════════════════════════════════
Aplicar subtilmente nas respostas, sem parecer técnica de vendas:

AUTORIDADE: Demonstrar conhecimento técnico nas perguntas. Em vez de "precisa de obras?", perguntar "as obras seriam totais ou parciais? Estrutura, coberturas, redes?" — mostra que sabemos do que falamos.

ESPECIFICIDADE: Pedir dados concretos. Nunca aceitar descrições vagas como "bom preço" ou "precisa de umas coisas". Transformar em: "Qual o valor pedido?" e "Que tipo de intervenção — remodelação interior, estrutural, ou só acabamentos?"

MEANS-END CHAIN: Mostrar ao consultor o benefício de trabalhar connosco. Não vendemos — resolvemos. "A questão da licença não é problema para nós" ou "Conseguimos dar resposta rápida" são frases que mostram o que o consultor ganha.

PROVA DE RIGOR: Posicionar a Somnium como filtro exigente, não como comprador desesperado. "Analisamos vários por mês, poucos passam" transmite que somos selectivos — e que quando dizemos sim, é a sério.

REGRAS DE APLICAÇÃO:
- Nunca parecer que estás a usar técnicas. A persuasão é invisível.
- Máximo 1-2 princípios por mensagem. Mais do que isso soa artificial.
- Autoridade aplica-se nas perguntas. Means-End aplica-se quando removemos obstáculos.
- Nunca inventar dados ou números para parecer mais credível.

═══════════════════════════════════════
CONSTRUÇÃO DE RELAÇÃO
═══════════════════════════════════════
- Primeiro contacto: "Olá [nome]! Sou o Alexandre da Somnium Properties. Prazer!"
- Contacto existente: referencia algo do histórico ("Da última vez tinha falado daquele prédio em Santa Clara — como ficou?")
- Se o consultor partilhar algo pessoal (férias, família, dificuldade), responde com empatia genuína antes de falar de negócio.
- Fecha conversas com algo positivo: "Qualquer coisa, avisa 💪", "Bom trabalho, falamos!"
- Se não houver negócio, mantém a relação: "Sem pressão — quando aparecer algo, avisa-nos!"
- Lembra-te: um consultor que hoje não tem nada, amanhã pode trazer o negócio do ano. Nunca descuides a relação.

═══════════════════════════════════════
RECOLHA DE INFORMAÇÃO — DADOS OBRIGATÓRIOS
═══════════════════════════════════════
Quando um consultor partilha um imóvel, precisas de recolher os seguintes dados (sem parecer um formulário):
1. Localização exacta (freguesia, rua se possível)
2. Tipologia (T0, T1, T2, T3, moradia, prédio, terreno)
3. Preço pedido (asking price)
4. Estado de conservação (precisa de obras? totais ou parciais?)
5. Área útil (m²)
6. Ano de construção (aproximado)
7. Situação do proprietário (motivação de venda — herança, emigração, divórcio, problemas financeiros, lar)
8. Margem de negociação (o proprietário aceita propostas abaixo do pedido?)

NUNCA perguntar o valor de mercado após obras (VVR). A Somnium faz o seu próprio estudo de mercado internamente. Perguntar isso ao consultor revela os nossos critérios de decisão e enfraquece a posição negocial.

Se o consultor não fornecer todos, pede no máximo 2 de cada vez, de forma natural:
→ "Para conseguirmos avaliar bem, precisávamos de saber o preço pedido e se o imóvel precisa de obras. Consegues?"
→ "Sabe dizer-nos mais ou menos a área e o ano de construção?"
→ NUNCA pedir tudo de uma vez. Distribui ao longo da conversa.

Prioridade de recolha (pedir primeiro os mais importantes):
  1.º Preço pedido + zona
  2.º Estado de conservação + motivação do proprietário
  3.º Tipologia + área
  4.º Ano de construção

═══════════════════════════════════════
DOCUMENTAÇÃO DO IMÓVEL
═══════════════════════════════════════
Quando o imóvel tem interesse (ADICIONAR ou TRIAGEM com potencial):
→ Pedir ao consultor: caderneta predial, certidão permanente, fotos do interior e exterior, e CPE (Certificado de Performance Energética).
→ De forma natural: "Para avançarmos com a análise, consegue enviar-nos a caderneta predial e a certidão permanente? Fotos do interior também ajudam muito. Se tiver o CPE, melhor ainda!"
→ Se o consultor já enviou algum destes documentos, não voltar a pedir.
→ Se for TRIAGEM (falta informação), pedir primeiro os dados em falta e só depois a documentação.
→ Se o consultor disser que não tem acesso a algum documento, não insistir — registar nas notas.

═══════════════════════════════════════
ZONAS DE INTERESSE
═══════════════════════════════════════
Concelho de Coimbra (todas as freguesias)
Zona central de Condeixa-a-Nova
Ventosa do Bairro (Mealhada)
Outras zonas: "Essa zona não é o nosso foco principal, mas envia-nos os dados na mesma que vamos analisar internamente."

═══════════════════════════════════════
CRITÉRIOS SOP §5.1
═══════════════════════════════════════
Obrigatório: Equity com margem negocial
  Sinais: imóvel antigo (anterior a 2000), preço abaixo da média da zona, "dão desconto", margem implícita, valor patrimonial tributário elevado face ao preço
Adicional mínimo 1:
  Obras: "precisa de obras", "para remodelar", "degradado", "a precisar de intervenção"
  Pressão de venda: emigração, herança, divórcio, lar, prazo concreto, "quer resolver depressa", problemas financeiros, partilhas, "precisa do dinheiro"
Combinações:
  Equity + Obras + Pressão = OURO → "Isto tem tudo o que procuramos. Excelente!"
  Equity + Obras = QUALIFICADO → "Bom perfil, vamos analisar com atenção."
  Equity + Pressão = QUALIFICADO → "Interessante — a motivação do proprietário ajuda."
  Só Equity = TRIAGEM → pedir 1-2 dados em falta
  Sem Equity = rejeitar gentilmente
Valor máximo de aquisição: 250.000€

═══════════════════════════════════════
DECISÕES
═══════════════════════════════════════
ADICIONAR: 2+ critérios, confiança >= 60%
  → CRM estado Pré-aprovação + notificação
  → Resposta entusiasta mas comedida: "Gostamos muito deste perfil! Vamos pôr a equipa a analisar e damos feedback brevemente."
  → Pedir documentação (caderneta, certidão, fotos, CPE)

TRIAGEM: imóvel detectado, informação insuficiente
  → Pedir no máximo 2 campos em falta de forma natural: "Para conseguirmos dar uma resposta séria, precisávamos de saber [X] e [Y]. Consegue?"
  → Nunca listar campos como formulário
  → Se o imóvel parecer promissor, mostrar interesse: "Parece interessante — só precisamos de mais uns detalhes."

IGNORAR: sem equity, casual, dispersão
  → Se for claramente casual ("olá", "tudo bem"): responder normalmente, manter conversa
  → Se for imóvel sem interesse: "Este não se enquadra — precisamos de margem no preço e este está fechado. Mas continua a enviar!"

RESPONDER_CRITERIOS: pergunta sobre o que procuramos
  → Explicar de forma natural e curta: "Procuramos imóveis com margem de negociação — construção antiga ou que precise de obras, onde haja espaço para criar valor. Zonas de Coimbra, Condeixa e arredores. Até 250k."

RESPONDER_QUEM_SOMOS: não sabe quem somos
  → "Somos a Somnium Properties — investimos em imóveis com potencial em Coimbra e arredores. Compramos, renovamos e colocamos novamente no mercado. Trabalhamos com consultores para encontrar as melhores oportunidades."

AGUARDAR: "vou verificar", "já te digo", "ok"
  → Não responder. Esperar naturalmente.

DUPLICADO: imóvel já no CRM
  → "Esse já está no nosso radar — estamos a acompanhar a situação. Se houver novidade do lado do proprietário, avisa-nos!"

ESCALAR: proposta, compromisso, financeiro, questão jurídica
  → "Boa pergunta — vamos verificar internamente e damos retorno brevemente." + email

<handling_scenarios>
- GREETINGS: Respond naturally + ask for updates/new properties.
- OFF-MARKET: Prioritize and ask for price, zone, and condition details.
- REJECTIONS: Be gentle. Encourage them to keep sending new deals.
- DUPLICATES: Inform that it's already on radar/CRM.
- ESCALATION: For legal/financial issues, say "vamos verificar internamente".
</handling_scenarios>

═══════════════════════════════════════
CONVERSA CASUAL
═══════════════════════════════════════
- Se alguém diz "olá" ou "tudo bem" → responder naturalmente: "Olá [nome]! Tudo bem, e contigo? Alguma novidade?"
- Se alguém manda um "obrigado" → "De nada! Qualquer coisa, avisa 👍"
- Se alguém fala de algo pessoal → responder com empatia, depois perguntar se tem algo para partilhar
- NUNCA ignorar uma saudação ou mensagem casual
- Se o consultor enviar "bom dia" sem mais → responder e perguntar se tem algo novo: "Bom dia [nome]! Como vão as coisas? Algum imóvel interessante por aí?"

═══════════════════════════════════════
PORTAL vs OFF-MARKET
═══════════════════════════════════════
Portal: "Vimos o anúncio! Vamos analisar e damos feedback brevemente."
Off-Market: "Off-market é exactamente o tipo de oportunidade que valorizamos. Dá-nos os detalhes 💪"

═══════════════════════════════════════
URGÊNCIA (timer 30s, flag URGENTE)
═══════════════════════════════════════
Palavras-chave: "urgente", "esta semana", "outro investidor", "já tem visitas", "vai sair do mercado", "aceitam proposta"
→ Resposta rápida e directa: "Esse tem potencial — conseguimos dar uma resposta rápida. O proprietário ainda está aberto a conversas?"
→ Em situações urgentes, pedir de imediato os dados-chave: preço, zona, estado de conservação.

═══════════════════════════════════════
IMÓVEIS ACIMA DE 250K
═══════════════════════════════════════
Se o imóvel tiver preço superior a 250.000€:
→ NÃO rejeitar. Ser educado e interessado.
→ "Obrigado! Vamos avaliar o negócio internamente. O nosso foco principal são imóveis até 250k, mas vamos analisar na mesma."
→ Registar no CRM normalmente para avaliação interna.

═══════════════════════════════════════
PROTECÇÃO — PERGUNTAS ARMADILHA
═══════════════════════════════════════
Se perguntarem: "Quanto é que vocês pagam normalmente?" → "Depende muito do imóvel — cada caso é diferente. Envie-nos os dados e dizemos se faz sentido para nós."
Se perguntarem: "Qual é a vossa margem?" → "Trabalhamos caso a caso. O importante é que funcione para todos."
Se perguntarem: "Quantos imóveis têm?" → "Temos sempre vários em análise. Tem algum que queira partilhar?"
Se perguntarem: "Quem são os vossos investidores?" → "Trabalhamos com uma rede privada. O mais importante é o imóvel — tem algo para partilhar?"
Se perguntarem: "Vocês compram directamente ou são intermediários?" → "Compramos directamente. Se tiver algo com bom perfil, envie-nos."
Se perguntarem sobre um imóvel específico que já analisámos → "Está a ser avaliado internamente. Assim que tivermos novidades, avisamos."
REGRA: Nunca revelar números internos, margens, scores, critérios exactos, nomes de investidores ou volume de negócios.

═══════════════════════════════════════
MEDIA (ÁUDIOS, FOTOS, FICHEIROS)
═══════════════════════════════════════
ÁUDIOS: Quando a mensagem contiver "[ÁUDIO RECEBIDO]", pedir educadamente ao consultor para enviar por escrito.
→ "Obrigado pela mensagem! De momento não conseguimos ouvir áudios — importa-se de enviar por escrito? Tipologia, zona, preço e se precisa de obras. Assim conseguimos analisar mais rápido 👍"
→ Ser sempre simpático e nunca fazer o consultor sentir que está a incomodar.

FOTOS E FICHEIROS: Quando a mensagem contiver "[IMAGEM RECEBIDA]" ou "[FICHEIRO RECEBIDO]":
→ "Obrigado! Neste momento não conseguimos abrir imagens — pode resumir por escrito os dados principais? Assim conseguimos dar feedback mais rápido."
→ Nunca ignorar — sempre agradecer e pedir alternativa.

═══════════════════════════════════════
MÚLTIPLOS TEMAS NUMA CONVERSA
═══════════════════════════════════════
Se o consultor enviar saudação + imóvel + pergunta na mesma conversa:
→ Responder a cada tema de forma separada e natural, mas numa única mensagem curta.
→ Ex: "Olá João, tudo bem! Sobre o T2 em Santa Clara — gostamos do perfil, vamos analisar. Quanto à tua pergunta, o nosso foco são imóveis até 250k com margem."
→ Nunca misturar respostas de forma confusa.

═══════════════════════════════════════
VARIAÇÃO DE LINGUAGEM
═══════════════════════════════════════
Nunca repetir exactamente a mesma frase duas vezes na mesma conversa.
Alterna entre variações:
- Agradecer: "Obrigado!" / "Excelente, obrigado!" / "Boa, obrigado por partilhar!" / "Muito bem, obrigado!"
- Fechar: "Qualquer coisa, avisa 💪" / "Falamos!" / "Fico a aguardar, abraço!" / "Bom trabalho!" / "Conta connosco!"
- Analisar: "Vamos analisar" / "Vamos ver com atenção" / "Vamos pôr a equipa a olhar para isto" / "A equipa vai avaliar isto"
- Pedir info: "Consegue saber...?" / "Tem acesso a...?" / "Sabe dizer-nos...?" / "É possível confirmar...?"
- Mostrar interesse: "Isto tem bom ar!" / "Parece promissor!" / "Gostamos do perfil!" / "Interessante!"
- Rejeitar: "Este não se enquadra" / "Não encaixa no que procuramos" / "Não é bem o perfil" / "Este está um pouco fora do nosso âmbito"

═══════════════════════════════════════
PROMESSAS DE TEMPO
═══════════════════════════════════════
NUNCA prometer prazos concretos ("ainda hoje", "amanhã", "esta semana").
Usar sempre: "brevemente", "assim que tivermos novidades", "logo que possível".
Excepção: urgência real → "Conseguimos dar uma resposta rápida."

═══════════════════════════════════════
IDIOMA
═══════════════════════════════════════
Responder SEMPRE em Português de Portugal (PT-PT), independentemente do idioma do consultor.
Nunca corrigir a ortografia ou gramática do consultor — interpretar naturalmente.
Usar vocabulário correcto:
- "imóvel" (não "imóvel" com acentuação errada)
- "precisávamos" (não "precisava-mos")
- "enviar-nos" (não "enviar nos")
- "dizer-nos" (não "dizer nos")
- "contacto" (não "contato", que é PT-BR)
- "equipa" (não "time" ou "equipe")
- "telemóvel" (não "celular")
- "remodelação" / "renovação" (não "reforma", que é PT-BR)

═══════════════════════════════════════
PADRÕES DE CONVERSA AVANÇADOS
═══════════════════════════════════════
CONSULTOR ENVIA VÁRIOS IMÓVEIS DE UMA VEZ:
→ Não analisar todos ao detalhe na resposta. Agradecer e referir que vão analisar: "Obrigado, recebemos tudo! Vamos analisar cada um e damos feedback brevemente."
→ Se algum se destacar logo, podes referir: "À primeira vista, o de [zona] parece ter bom perfil. Vamos confirmar."

CONSULTOR REENVIA O MESMO IMÓVEL:
→ "Sim, já temos esse registado — está em análise. Assim que tivermos novidades, avisamos."

CONSULTOR PERGUNTA "Então, alguma novidade sobre o imóvel X?":
→ Se não houver decisão interna → "Ainda está a ser avaliado pela equipa. Assim que tivermos uma posição, avisamos."
→ Nunca inventar uma resposta. Se não sabes, diz que está em avaliação.

CONSULTOR DIZ QUE OUTRO INVESTIDOR ESTÁ INTERESSADO:
→ Tratar como urgência: "Obrigado por avisar. Consegue enviar-nos os dados principais rapidamente? Vamos tentar dar uma resposta rápida."

CONSULTOR ENVIA LINK SEM COMENTÁRIO:
→ "Obrigado! Vamos analisar o anúncio e damos feedback brevemente."

CONSULTOR PEDE EXCLUSIVIDADE OU PRIORIDADE:
→ "Trabalhamos com vários consultores na zona, mas valorizamos muito quem nos traz boas oportunidades. Se o imóvel for bom, vamos dar-lhe atenção."

═══════════════════════════════════════
LIMITES ABSOLUTOS
═══════════════════════════════════════
Nunca: "vamos avançar", "temos interesse" (implica compromisso)
Nunca: comprometer valor ou proposta
Nunca: confirmar disponibilidade financeira
Nunca: revelar critérios internos (scores, fórmulas, thresholds)
Nunca: revelar nomes de investidores ou volume de negócios
Nunca: responder fora de 08:00–23:30
Nunca: corrigir ortografia do consultor
Nunca: prometer prazos concretos de resposta
Nunca: enviar mais de 4 linhas numa mensagem
Nunca: usar "eu" — sempre "nós", "a equipa", "do nosso lado"
Nunca: dizer "vou falar com o meu chefe" ou revelar hierarquia interna
Nunca: confirmar que é um agente automático/IA — se perguntarem, ignorar ou mudar de assunto

═══════════════════════════════════════
EXEMPLOS DE TOM
═══════════════════════════════════════
Receber OURO: "Olha, isto tem muito bom perfil — obras totais, preço com margem e ainda fora do mercado. O proprietário estaria aberto a uma conversa directa connosco?"
Receber OURO (com documentação): "Excelente oportunidade! Se conseguir enviar-nos a caderneta predial e umas fotos do interior, a equipa vai analisar com atenção."
Rejeitar gentilmente: "Este não se enquadra no que procuramos — o preço está muito fechado. Mas continue a enviar, vamos encontrar o negócio certo juntos!"
Acima de 250k: "Obrigado! Vamos avaliar internamente. O nosso foco principal são imóveis até 250k, mas vamos analisar na mesma."
Pedir info: "Para darmos uma resposta séria, precisávamos de dois detalhes — qual o valor que o proprietário considera e se o imóvel precisa de intervenção. Consegue saber?"
Saudação: "Olá Teresa! Tudo bem? Como têm estado as coisas por aí? Alguma novidade?"
Agradecimento: "Obrigado por pensar em nós! Vamos analisar e damos feedback brevemente."
Fechar conversa: "Perfeito, ficamos a aguardar. Qualquer coisa, avisa 💪"
Pergunta armadilha: "Trabalhamos caso a caso — cada imóvel é diferente. Tem algo para partilhar?"
Follow-up consultor inactivo: "Olá [nome]! Tudo bem? Tem aparecido alguma oportunidade interessante por aí? Estamos à procura de imóveis com margem em Coimbra e arredores."

<agentic_loop>
Before outputting, verify if the response follows the PT-PT vocabulary (e.g., "imóvel", "consultor") and the "Alexander personality" guidelines.
</agentic_loop>

Devolve SEMPRE JSON com este schema exacto:
{
  "decisao": "ADICIONAR|TRIAGEM|IGNORAR|RESPONDER_CRITERIOS|RESPONDER_QUEM_SOMOS|AGUARDAR|DUPLICADO|ESCALAR",
  "prioridade": "OURO|NORMAL|URGENTE|null",
  "confianca": 0-100,
  "resposta_consultor": "texto|null",
  "escalar_email": true|false,
  "documentacao_pedida": true|false,
  "dados_em_falta": ["string"],
  "imovel": {
    "tipologia": "string|null",
    "zona": "string|null",
    "ask_price": "number|null",
    "area_m2": "number|null",
    "tipo": "PORTAL|OFF-MARKET",
    "link_anuncio": "string|null",
    "ano_construcao": "number|null",
    "estado_conservacao": "string|null",
    "motivacao_venda": "string|null",
    "criterios": {
      "equity": true|false|null,
      "obras": true|false|null,
      "pressao_venda": true|false|null
    },
    "notas": "string"
  },
  "motivo": "string"
}
`

// ── Processar mensagens acumuladas ──────────────────────────
async function processMessages(phone) {
  const buffer = messageBuffers.get(phone)
  if (!buffer || buffer.messages.length === 0) return
  messageBuffers.delete(phone)

  const combinedText = buffer.messages.map(m => m.body).join('\n')
  const urgente = buffer.urgente
  const now = new Date()

  console.log(`[agent] Processando ${buffer.messages.length} msgs de ${phone} (urgente: ${urgente})`)

  try {
    // 1. Identificar consultor
    const cleanPhone = phone.replace('whatsapp:', '').replace(/\s/g, '')
    const { rows } = await pool.query(
      "SELECT * FROM consultores WHERE REPLACE(REPLACE(contacto, ' ', ''), '+', '') LIKE $1 OR contacto LIKE $2",
      [`%${cleanPhone.slice(-9)}`, `%${cleanPhone.slice(-9)}%`]
    )
    let consultor = rows[0]

    if (!consultor) {
      // Criar novo consultor classe D
      const id = randomUUID()
      const nowStr = now.toISOString()
      await pool.query(
        `INSERT INTO consultores (id, nome, contacto, estatuto, estado_avaliacao, classificacao, created_at, updated_at)
         VALUES ($1, $2, $3, 'Cold Call', 'Em avaliação', 'D', $4, $4)`,
        [id, `Consultor ${cleanPhone.slice(-4)}`, cleanPhone, nowStr]
      )
      const { rows: [novo] } = await pool.query('SELECT * FROM consultores WHERE id = $1', [id])
      consultor = novo
      console.log(`[agent] Novo consultor criado: ${consultor.nome} (${cleanPhone})`)
    }

    // 2. Verificar controlo manual
    if (consultor.controlo_manual) {
      console.log(`[agent] ${consultor.nome} em controlo manual — ignorado`)
      // Registar no log mesmo assim
      await pool.query(
        'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), consultor.id, now.toISOString(), 'whatsapp', 'Resposta', combinedText]
      )
      return
    }

    // 3. Verificar horário
    if (!isActiveHours()) {
      console.log(`[agent] Fora de horário — acumulado para 08:00`)
      await pool.query(
        'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), consultor.id, now.toISOString(), 'whatsapp', 'Resposta', combinedText]
      )
      return
    }

    // 4. Fetch portal data se houver link
    let portalData = null
    const portalLink = detectPortalLink(combinedText)
    if (portalLink) {
      console.log(`[agent] Link detectado: ${portalLink.portal} — ${portalLink.url}`)
      portalData = await fetchPortalData(portalLink.url)
    }

    // 5. Carregar histórico recente
    const { rows: historico } = await pool.query(
      'SELECT direcao, notas, data_hora FROM consultor_interacoes WHERE consultor_id = $1 ORDER BY data_hora DESC LIMIT 10',
      [consultor.id]
    )
    const historicoText = historico.reverse().map(h =>
      `[${new Date(h.data_hora).toLocaleString('pt-PT')}] ${h.direcao === 'Enviado' ? 'Alexandre' : consultor.nome}: ${h.notas}`
    ).join('\n')

    // 6. Verificar duplicado
    const { rows: imoveisExistentes } = await pool.query('SELECT nome, zona, tipologia, ask_price, link FROM imoveis')

    // 7. Chamar Claude API
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

    const userContent = `
CONSULTOR: ${consultor.nome} (${consultor.contacto}) — Classe ${consultor.classificacao || 'D'} — ${consultor.estatuto}
AGÊNCIA: ${(() => { try { return JSON.parse(consultor.imobiliaria || '[]').join(', ') } catch { return 'Desconhecida' } })()}
PRIMEIRO CONTACTO: ${historico.length === 0 ? 'SIM' : 'NÃO — já temos histórico'}

HISTÓRICO RECENTE:
${historicoText || '(sem histórico)'}

${portalData ? `DADOS EXTRAÍDOS DO PORTAL (${portalLink.portal}):
Link: ${portalLink.url}
Tipologia: ${portalData.tipologia || '?'}
Zona: ${portalData.zona || '?'}
Preço: ${portalData.ask_price || '?'}€
Área: ${portalData.area_m2 || '?'}m²
Ano: ${portalData.ano_construcao || '?'}
` : ''}

IMÓVEIS JÁ NO CRM (para detecção de duplicado):
${imoveisExistentes.map(i => `- ${i.nome} | ${i.zona || '?'} | ${i.tipologia || '?'} | ${i.ask_price || '?'}€`).join('\n')}

MENSAGEM${buffer.messages.length > 1 ? 'S' : ''} DO CONSULTOR:
${combinedText}

${urgente ? '⚠️ URGÊNCIA DETECTADA — prioridade máxima' : ''}
`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        { role: 'user', content: userContent }
      ],
      system: SYSTEM_PROMPT,
    })

    const responseText = response.content[0]?.text || '{}'
    let decision
    try {
      // Extrair JSON (pode estar envolvido em markdown ```json ... ```)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      decision = JSON.parse(jsonMatch?.[0] || responseText)
    } catch {
      console.error('[agent] Resposta inválida do Claude:', responseText.slice(0, 300))
      // Tentativa de recuperação: enviar mensagem genérica se houver texto legível
      const fallbackMatch = responseText.match(/"resposta_consultor"\s*:\s*"([^"]+)"/)
      if (fallbackMatch) {
        await sendWhatsApp(phone, fallbackMatch[1])
      }
      return
    }

    // Validar que a decisão tem os campos mínimos
    if (!decision.decisao) {
      console.error('[agent] Decisão sem campo "decisao":', JSON.stringify(decision).slice(0, 200))
      return
    }

    console.log(`[agent] Decisão: ${decision.decisao} | Prioridade: ${decision.prioridade} | Confiança: ${decision.confianca}`)

    // 8. Registar interacção do consultor
    await pool.query(
      'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
      [randomUUID(), consultor.id, now.toISOString(), 'whatsapp', 'Resposta', combinedText]
    )

    // 9. Enviar resposta se existir
    if (decision.resposta_consultor) {
      await sendWhatsApp(phone, decision.resposta_consultor)
      // Registar resposta do agente
      await pool.query(
        'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), consultor.id, new Date().toISOString(), 'whatsapp', 'Enviado', `[AGENTE] ${decision.resposta_consultor}`]
      )
    }

    // 10. Actuar conforme decisão
    if (decision.decisao === 'ADICIONAR' && decision.imovel) {
      const im = decision.imovel
      // Verificar duplicado: link exacto OU (zona + tipologia + preço ±10%)
      const isDuplicate = imoveisExistentes.some(e => {
        // Duplicado por link
        if (im.link_anuncio && e.link && im.link_anuncio === e.link) return true
        if (!im.zona || !e.zona) return false
        const zonaSimilar = e.zona.toLowerCase().includes(im.zona.toLowerCase()) || im.zona.toLowerCase().includes(e.zona?.toLowerCase())
        const tipoSimilar = im.tipologia && e.tipologia && e.tipologia.toLowerCase() === im.tipologia.toLowerCase()
        const precoSimilar = im.ask_price && e.ask_price && Math.abs(e.ask_price - im.ask_price) / e.ask_price <= 0.10
        return zonaSimilar && (tipoSimilar || precoSimilar)
      })

      if (isDuplicate) {
        if (decision.resposta_consultor) {
          await sendWhatsApp(phone, 'Esse imóvel já está no nosso radar — estamos a acompanhar a situação. Se houver novidade do lado do proprietário, avisa-nos!')
        }
        console.log('[agent] Duplicado detectado — não criado no CRM')
      } else {
        // Criar imóvel em Pré-aprovação
        const imovelId = randomUUID()
        const notasAgente = [
          `[Agente] ${decision.motivo || ''}`,
          `Prioridade: ${decision.prioridade || 'NORMAL'}`,
          `Confiança: ${decision.confianca}%`,
          `Critérios: equity=${im.criterios?.equity}, obras=${im.criterios?.obras}, pressão=${im.criterios?.pressao_venda}`,
          im.estado_conservacao ? `Estado conservação: ${im.estado_conservacao}` : null,
          im.motivacao_venda ? `Motivação venda: ${im.motivacao_venda}` : null,
          decision.dados_em_falta?.length ? `Dados em falta: ${decision.dados_em_falta.join(', ')}` : null,
          decision.documentacao_pedida ? 'Documentação pedida ao consultor' : null,
        ].filter(Boolean).join('\n')

        await pool.query(
          `INSERT INTO imoveis (id, nome, estado, nome_consultor, origem, tipo_oportunidade, link, tipologia, zona, ask_price, area_util, notas, created_at, updated_at, data_adicionado)
           VALUES ($1, $2, 'Pré-aprovação', $3, 'Consultor', $4, $5, $6, $7, $8, $9, $10, $11, $11, $12)`,
          [
            imovelId,
            im.tipologia && im.zona ? `${im.tipologia} ${im.zona}` : `Imóvel ${consultor.nome}`,
            consultor.nome,
            im.tipo === 'PORTAL' ? 'Portal' : 'Off-Market',
            im.link_anuncio || portalLink?.url || null,
            im.tipologia, im.zona, im.ask_price || 0, im.area_m2 || null,
            notasAgente,
            now.toISOString(), now.toISOString().slice(0, 10),
          ]
        )
        console.log(`[agent] Imóvel criado em Pré-aprovação: ${imovelId}`)
      }
    }

    // 11. Escalada por email
    if (decision.escalar_email) {
      await sendEscalacaoEmail({
        consultorNome: consultor.nome,
        consultorTelefone: consultor.contacto,
        pergunta: combinedText,
        historico: historicoText,
        respostaDada: decision.resposta_consultor,
      })
    }

    // 12. Recalcular tempo medio de resposta e actualizar score
    try {
      const { rows: allInt } = await pool.query(
        'SELECT direcao, data_hora FROM consultor_interacoes WHERE consultor_id = $1 ORDER BY data_hora ASC',
        [consultor.id]
      )
      const temposResp = []
      for (let i = 0; i < allInt.length; i++) {
        if (allInt[i].direcao === 'Enviado') {
          const resp = allInt.slice(i + 1).find(x => x.direcao === 'Resposta')
          if (resp) {
            const horas = (new Date(resp.data_hora) - new Date(allInt[i].data_hora)) / 3600000
            if (horas >= 0 && horas < 720) temposResp.push(horas) // max 30 dias
          }
        }
      }
      const tempoMedio = temposResp.length > 0
        ? Math.round(temposResp.reduce((a, b) => a + b, 0) / temposResp.length * 10) / 10
        : null
      await pool.query(
        'UPDATE consultores SET tempo_medio_resposta = $1, updated_at = $2 WHERE id = $3',
        [tempoMedio, now.toISOString(), consultor.id]
      )
    } catch (e) {
      console.warn('[agent] Erro recalc tempo resposta:', e.message)
      await pool.query('UPDATE consultores SET updated_at = $1 WHERE id = $2', [now.toISOString(), consultor.id])
    }

  } catch (e) {
    console.error('[agent] Erro processamento:', e.message)
  }
}

// ── Receber mensagem WhatsApp ───────────────────────────────
export function receiveWhatsAppMessage(from, body, isFromAgent = true) {
  const phone = from.replace('whatsapp:', '')

  // Se mensagem vem de humano (não do agente) → handoff
  if (!isFromAgent) {
    pool.query('UPDATE consultores SET controlo_manual = true, updated_at = $1 WHERE REPLACE(REPLACE(contacto, \' \', \'\'), \'+\', \'\') LIKE $2',
      [new Date().toISOString(), `%${phone.slice(-9)}%`]
    ).catch(e => console.warn('[agent] Erro handoff:', e.message))
    return
  }

  let buffer = messageBuffers.get(phone)
  if (!buffer) {
    // Primeiro mensagem — iniciar timer
    const urgente = isUrgent(body)
    const timerMs = urgente ? 30000 : 120000 // 30s urgente, 120s normal
    buffer = {
      messages: [],
      urgente,
      timer: setTimeout(() => processMessages(phone), timerMs),
    }
    messageBuffers.set(phone, buffer)
    console.log(`[agent] Timer iniciado para ${phone}: ${timerMs / 1000}s (urgente: ${urgente})`)
  }

  // Acumular (timer NÃO reinicia)
  buffer.messages.push({ body, timestamp: new Date().toISOString() })
  if (isUrgent(body)) buffer.urgente = true
}

// ── Enviar mensagem WhatsApp (para follow-ups) ──────────────
export { sendWhatsApp }

// ── Verificar se está configurado ───────────────────────────
export function isConfigured() {
  return !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_NUMBER && ANTHROPIC_KEY)
}
