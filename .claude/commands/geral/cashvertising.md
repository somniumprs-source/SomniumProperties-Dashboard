# cashvertising

Gera copy de marketing persuasivo baseado nos principios do livro Cashvertising, adaptado ao contexto imobiliario da Somnium Properties. Dois modos: criar do zero (briefing) ou reescrever texto existente.

## Pre-requisito

Antes de executar, ler `.claude/dept/comercial.md` para contexto sobre audiencias (investidores, consultores, proprietarios), modelos de negocio (wholesaling, CAEP, fix & flip, mediacao) e terminologia.

## Instrucoes

### Fase 0: Detectar modo

Se `$ARGUMENTS` contiver texto:
- Tratar o texto como copy a reescrever
- Saltar para Fase 2 (inferir audiencia e canal pelo contexto do texto)

Se `$ARGUMENTS` estiver vazio:
- Entrar em MODO BRIEFING (Fase 1)

### Fase 1: Briefing interactivo

Fazer as 4 perguntas numa unica mensagem:

---

Para criar o melhor copy possivel, preciso de 4 informacoes:

**1. Audiencia** — Quem vai receber esta mensagem?
- Investidor quente (ja conhece a Somnium ou o conceito)
- Investidor frio (nunca ouviu falar da Somnium)
- Consultor imobiliario (agente/mediador)
- Proprietario (quer vender o seu imovel)
- Outro (descrever)

**2. Canal** — Onde vai ser publicado/enviado?
- Email (formal, com assunto)
- WhatsApp/SMS (curto, directo)
- Descricao de imovel (ficha ou anuncio)
- Post redes sociais
- Outro (descrever)

**3. Objectivo** — Qual e a accao que queremos?
- Marcar reuniao/call
- Responder a mensagem
- Visitar imovel
- Assinar NDA / avancar no processo
- Outro (descrever)

**4. Informacao chave** — Que factos, numeros ou detalhes especificos temos?
(Ex: ROI de 18%, imovel em Coimbra centro, prazo limite sexta, testemunho de parceiro)
Se nao tiver dados concretos, dizer "sem dados especificos".

---

Aguardar resposta antes de continuar.

### Fase 2: Analise e seleccao de principios

Com base na audiencia, canal e objectivo, seleccionar principios da tabela de referencia (seccao abaixo).

Regras de seleccao automatica:

| Condicao | Principios obrigatorios |
|----------|------------------------|
| Audiencia nova (nao conhece Somnium) | Autoridade, Prova Social, Evidencia |
| Objectivo = marcar reuniao | Escassez, Fear Factor |
| Objectivo = avancar no processo | Means-End Chain, Evidencia |
| Canal = WhatsApp | Max 3 principios, copy < 150 palavras |
| Canal = Email primeiro contacto | 4-6 principios, template completo |
| Canal = Descricao de imovel | PVAs, Especificidade Extrema |
| Objecao de confianca detectada | Activar contra-tecnica Confianca |
| Objecao de timing detectada | Activar contra-tecnica Timing |

Seleccionar o template de canal correspondente (seccao Templates).

### Fase 3: Gerar copy

Aplicar o template do canal com os principios seleccionados.

**Regras de qualidade obrigatorias:**
- Lingua: PT-PT exclusivamente (ortografia europeia)
- Frases: max 20 palavras
- Paragrafos: max 3 frases
- Numeros concretos sempre que possivel (substituir adjectivos vagos por factos)
- Adjectivos como "excelente", "incrivel", "unico" so sao validos com dado concreto a seguir
- Tom: profissional e credivel. Nunca entusiastico, nunca vendedor
- Emojis: proibidos em emails formais. Max 1 em WhatsApp
- Nunca prometer resultados que a Somnium nao pode garantir
- Nunca inventar dados, numeros ou testemunhos

**Numero de versoes:**

| Tipo de copy | Versoes |
|-------------|---------|
| WhatsApp/SMS | 1 versao |
| Email simples (follow-up, resposta) | 1 versao |
| Email importante (primeiro contacto, pitch, proposta) | 3 versoes |

As 3 versoes para emails importantes seguem angulos diferentes:
- **Versao A**: angulo autoridade + prova social
- **Versao B**: angulo escassez + fear factor
- **Versao C**: angulo means-end chain (beneficio do beneficio)

### Fase 4: Principios Aplicados

Obrigatorio em todos os outputs. Apresentar apos o copy:

---

**Principios Cashvertising Aplicados**

| Principio | Onde foi usado | Porque foi escolhido |
|-----------|---------------|----------------------|
| [nome] | "[frase exacta do copy]" | [razao ligada a audiencia/objectivo] |

**Objecao tratada**: [se aplicavel: qual contra-tecnica foi usada e em que frase]

---

## Referencia: Principios Cashvertising

### Life-Force 8 (LF8) — Desejos Primarios

Os 8 desejos biologicos mais fortes. Usar pelo menos 1 por copy.

| Desejo | Trigger para imobiliario | Exemplo Somnium |
|--------|-------------------------|-----------------|
| Sobrevivencia / saude financeira | Proteccao de patrimonio | "O seu capital esta parado. A inflacao come-o todos os meses." |
| Vida confortavel | Investimento sem dores de cabeca | "Rentabilidade sem gestao activa. Nos tratamos de tudo." |
| Ser superior / bem-sucedido | Status e resultados | "Os investidores com quem trabalhamos tomam decisoes baseadas em dados, nao em intuicao." |
| Proteger familia | Legado e seguranca | "Um activo real que fica para os seus filhos." |
| Aprovacao social | Pertencer a um grupo selecto | "Trabalhamos com um numero limitado de parceiros por zona." |

### Fear Factor — Medo de Perder

Usar com moderacao. Sempre oferecer a solucao imediatamente apos o medo.

- Medo de perder o negocio: "Temos 2 investidores a analisar este imovel neste momento."
- Medo de ma decisao: "Sem analise de rentabilidade documentada, o risco e real."
- Medo de ficar de fora: "Este tipo de operacao raramente chega ao mercado aberto."

Regra: Fear Factor sem solucao = paralisia. Fear Factor com solucao = accao.

### Autoridade e Transferencia

Credibilidade por posicionamento e associacao.

- Citar volume de analise: "Analisamos entre 20 a 30 imoveis por mes. Menos de 15% passam o filtro."
- Citar metodologia: "Analise baseada em 3 cenarios de rentabilidade (conservador, base, optimista)."
- Posicionar como filtro, nao vendedor: "O nosso papel e dizer nao a 85% do que vemos."
- Citar fontes externas: INE, Banco de Portugal, dados de mercado de Coimbra.

### Prova Social

Comportamento de outros valida a decisao.

- Numero de parceiros: "X investidores ja em parceria activa."
- Accoes concretas: "Nos ultimos 6 meses, X imoveis analisados, X propostas submetidas."
- Bandwagon subtil: "Os consultores com quem trabalhamos preferem este modelo porque..."

**Nota importante (Abril 2026)**: com 0 deals fechados, usar prova social de processo e rigor, nunca de resultados. "Preferimos dizer nao a 85% dos imoveis do que apresentar algo que nao passaria a nossa propria analise." Actualizar esta nota quando fechar o primeiro deal.

### Escassez e Urgencia

Limitacao real cria accao. Nunca inventar escassez.

- Escassez de oportunidade: "Este imovel tem prazo de decisao ate [data concreta]."
- Escassez de acesso: "Trabalhamos com um numero limitado de parceiros por zona."
- Urgencia de mercado: "Coimbra esta a ver compressao de yields. A janela e agora."

Regra: so usar escassez quando for real e verificavel.

### Means-End Chain — Beneficio do Beneficio

Nao vender o produto. Vender o que o produto permite.

Cadeias para imobiliario:
- Imovel → Rentabilidade → Liberdade financeira → Mais tempo para o que importa
- Parceria Somnium → Sem gestao activa → Mais tempo para o negocio principal
- Analise rigorosa → Menos risco → Mais confianca → Decisoes melhores

Tecnica: perguntar "e depois?" 3 vezes ao beneficio imediato. Usar na abertura ou no fecho do copy.

### Especificidade Extrema

Numeros concretos criam mais credibilidade do que adjectivos.

| Fraco | Forte |
|-------|-------|
| "boa rentabilidade" | "ROI estimado de 18,4% em 14 meses" |
| "imovel bem localizado" | "a 400 metros da Universidade de Coimbra, zona com 97% de ocupacao" |
| "processo rigoroso" | "due diligence com 23 pontos de verificacao" |
| "equipa experiente" | "4 anos de experiencia combinada em wholesaling e fix & flip" |

Regra: substituir todo o adjectivo qualitativo por um numero ou facto.

### PVAs — Adjectivos Visuais Poderosos

Descricoes sensoriais que criam imagem mental. Usar para descricoes de imovel, nunca para argumentos financeiros.

| Generico | Com PVAs |
|----------|---------|
| "fachada recuperada" | "fachada em pedra calcaria restaurada, com caixilharia lacada a branco" |
| "bom estado" | "estrutura solida, sem humidades, janelas a sul com luz directa todo o dia" |
| "sala ampla" | "sala de 32m2 com pavimento em carvalho natural e pe direito de 2,80m" |

### Simplicidade

Copy facil de ler e mais persuasivo.

- Frases: max 20 palavras
- Paragrafos: max 3 frases
- Uma ideia por paragrafo
- Palavras curtas e directas (evitar jargao tecnico sem explicacao)
- Teste: consegue ler em voz alta sem pausar? Se nao, simplificar.

### Evidencia e Factos

Substituir claims por prova verificavel.

| Claim | Evidencia |
|-------|-----------|
| "Somos de confianca" | "Processo de due diligence com 23 pontos de verificacao" |
| "Mercado em crescimento" | "Coimbra: +12% em valor de transaccao nos ultimos 18 meses (INE, 2025)" |
| "Equipa qualificada" | "Formacao em [area]. X anos de experiencia em investimento imobiliario." |

## Templates por Canal

### Template: Email primeiro contacto (Investidor)

**ASSUNTO**: [Facto concreto] + [Beneficio] — sem "!", sem "oportunidade unica"
Exemplo: "Imovel em Coimbra centro: ROI estimado 18% — analise disponivel"

**ESTRUTURA**:

[P1 — Autoridade / gancho sem hype]
Uma frase que posiciona a Somnium como filtro.
Ex: "A Somnium analisa entre 20 a 30 imoveis por mes. Menos de 15% chegam a esta fase."

[P2 — O activo concreto / Especificidade]
Factos: localizacao, tipologia, ask price, ROI estimado, modelo de negocio.
Max 5 linhas. Numeros, nao adjectivos.

[P3 — Means-End Chain]
Conectar o imovel ao resultado desejado pelo investidor.
Ex: "Nao estamos a vender um imovel. Estamos a propor uma operacao com retorno documentado e prazo definido."

[P4 — Prova Social OU Fear Factor (escolher UM)]
Validacao social OU urgencia real. Nunca os dois no mesmo email.

[CTA — unico, claro, sem opcoes multiplas]
Ex: "Tem disponibilidade para uma call de 20 minutos esta semana?"
Nunca: "Contacte-nos / visite o site / ligue-nos / preencha o formulario"

ASSINATURA: Nome, cargo, Somnium Properties. Sem slogan, sem emojis.

### Template: Email proposta formal (Investidor em processo)

Para investidores ja classificados, em fase de NDA ou parceria. Tom: parceria de negocio.

**ASSUNTO**: "Proposta [Ref. Imovel] — [Modelo] — [Data]"

**ESTRUTURA**:

[Introducao — referencia ao contexto anterior]
Nao comecar com "Conforme combinado". Comecar com o facto mais importante.

[Seccao 1 — O activo (tabela ou bullets com dados)]
Ask price, VVR estimado, custo obra, lucro estimado, ROI, prazo.

[Seccao 2 — Analise de risco (Evidencia)]
Mostrar que pensamos no downside. Constroi mais confianca do que focar so no upside.

[Seccao 3 — Proximos passos (numerados, com datas)]
1. Visita ao imovel — [data proposta]
2. Envio de due diligence completa — [data]
3. Decisao — [prazo maximo]

[Fecho — sem pressao, com escassez real se existir]
Ex: "Temos de comunicar ao vendedor ate [data]. Qualquer questao, estou disponivel."

### Template: WhatsApp (Consultor / Proprietario)

Max 120 palavras. A primeira frase tem de funcionar como notificacao (60 caracteres visiveis sem abrir).

**ESTRUTURA**:

[Linha 1 — Contexto imediato, sem saudacao longa]
Ex: "[Nome], tenho um T3 em [zona] que pode interessar a algum cliente seu."

[Linhas 2-3 — Facto especifico + beneficio]
Um numero concreto + o que resolve para o destinatario.

[Linha 4 — CTA directo]
Ex: "Envio ficha completa?" ou "Tem 5 minutos amanha de manha?"

Regra WhatsApp: se a primeira frase nao funcionar como preview de notificacao, a mensagem nao vai ser aberta.

### Template: Descricao de Imovel (anuncio / ficha)

**ESTRUTURA**:

[Titulo — Especificidade + Localizacao + Facto diferenciador]
Nao: "Excelente apartamento em Coimbra"
Sim: "T3 junto a UC — estrutura solida, potencial de rentabilidade documentado"

[P1 — PVAs: descricao sensorial, 3-4 linhas]
O que se ve, sente, imagina ao entrar. Luz, materiais, orientacao solar.

[P2 — Factos tecnicos com especificidade]
Area, divisoes, estado de conservacao, ano, infraestrutura.

[P3 — Contexto de mercado / Evidencia]
Dados da zona: ocupacao, comparaveis, tendencia de precos.

[P4 — Means-End Chain]
Para investidor: rentabilidade → liberdade financeira.
Para utilizador final: qualidade de vida → bem-estar da familia.

## Contra-tecnicas para Objecoes

### Objecao: Falta de Confianca ("Nao conheco a Somnium")

Nao se vence com palavras sobre confianca. Vence-se com evidencia.

Tecnicas (escolher 2-3 por copy):

1. **Transparencia de processo**: "O nosso processo de analise tem 23 pontos de verificacao antes de apresentarmos um imovel a qualquer parceiro."
2. **Especificidade de numeros**: "Analisamos 22 imoveis em Marco. Apresentamos 2."
3. **Prova de rigor, nao de resultados**: "Preferimos dizer nao a um imovel do que apresentar algo que nao passaria a nossa propria analise."
4. **Autenticidade sobre limitacoes**: "Somos uma empresa jovem em Coimbra. O que temos e rigor de analise e zero pressao para fechar."
5. **Referencia verificavel**: pessoa, empresa ou dado que o destinatario pode verificar por conta propria.

### Objecao: Timing ("Agora nao e a altura certa")

Frequentemente e uma objecao de confianca disfarçada. Quando e genuina:

1. **Fear Factor de espera**: "Cada mes que passa, o capital parado perde poder de compra. Com inflacao a X%, 100.000 euros valem Y euros daqui a um ano."
2. **Escassez de janela**: "A compressao de yields em Coimbra esta a acontecer agora. Os imoveis que analisamos hoje a este ask price vao estar 15% mais caros em 18 meses."
3. **Baixar o risco do primeiro passo**: "Nao estou a pedir compromisso. Estou a pedir 20 minutos para mostrar como o processo funciona."
4. **Means-End invertida**: conectar a inaccao ao resultado que o investidor quer evitar. O que custa NAO agir?

## Quando usar

- Escrever email a investidor (primeiro contacto, follow-up, proposta)
- Mensagem de WhatsApp a consultor ou proprietario
- Criar descricao de imovel para anuncio ou ficha
- Reescrever texto existente que "nao esta a converter"
- Criar 3 versoes de um email para testar qual funciona melhor
- Qualquer comunicacao onde o objectivo e gerar uma accao concreta

## Quando nao usar

- Comunicacao interna entre equipa (usar tom directo, sem tecnicas)
- Emails administrativos / operacionais sem objectivo persuasivo (ex: "seguem documentos em anexo")
- Contratos e documentos legais
- Revisao gramatical simples (pedir explicitamente revisao, nao cashvertising)
- Para operacoes de email do dia-a-dia (usar /administrativo/email-ops)
