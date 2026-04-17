# email-ops

Organiza, prioriza e responde ao email do Gmail. Classifica por urgencia, prepara rascunhos de resposta, cria tarefas no CRM a partir de emails relevantes.

## Pre-requisito

Antes de executar, ler `.claude/dept/administrativo.md` para contexto do departamento administrativo.

## Quando usar

- Inicio do dia ou inicio de sessao de trabalho
- Quando o utilizador diz "ve o meu email", "organiza o email", "o que tenho de urgente"
- Periodicamente para limpar inbox acumulada

## Instrucoes

### Fase 1: Ler inbox

Usar o MCP Gmail para buscar emails nao lidos:
```
gmail_search_messages: query="is:unread", maxResults=50
```

Para cada email, ler o conteudo:
```
gmail_read_message: messageId=...
```

### Fase 2: Classificar cada email

Atribuir a cada email:

**Categoria:**
| Categoria | Exemplos |
|-----------|----------|
| Investidor | Pergunta sobre negocio, proposta, documentos, capital |
| Consultor | Lead, imovel, follow-up, parceria |
| Negocio | Contrato, escritura, proposta, CPCV |
| Financeiro | Factura, pagamento, contabilidade, banco |
| Administrativo | Subscricoes, renovacoes, plataformas, licencas |
| Newsletter | Marketing, noticias do sector, updates de plataformas |
| Pessoal | Nao relacionado com Somnium |

**Prioridade:**
| Prioridade | Criterio |
|------------|----------|
| Urgente | Envolve dinheiro, prazo hoje/amanha, investidor/cliente a esperar |
| Importante | Precisa de resposta esta semana, decisao pendente, lead quente |
| Normal | Informativo, pode esperar, sem prazo |
| Baixa | Newsletter, notificacao automatica, spam |

### Fase 3: Apresentar triagem

Formato:

```
INBOX — [data] — [X] emails nao lidos

URGENTE (responder hoje)
| De | Assunto | Categoria | Accao sugerida |
|----|---------|-----------|----------------|

IMPORTANTE (responder esta semana)
| De | Assunto | Categoria | Accao sugerida |
|----|---------|-----------|----------------|

NORMAL (quando possivel)
| De | Assunto | Categoria | Accao sugerida |
|----|---------|-----------|----------------|

BAIXA (arquivar ou ignorar)
| De | Assunto | Accao |
|----|---------|-------|
```

### Fase 4: Rascunhos de resposta

Para emails urgentes e importantes, preparar rascunho de resposta:

**Tom por contexto:**
- Investidores e clientes: formal corporativo ("Caro/a [nome]", "Atenciosamente")
- Consultores conhecidos: profissional proximo ("Ola [nome]", "Cumprimentos")
- Equipa interna: directo e informal ("Bom dia", "Abraco")
- Fornecedores: profissional neutro

**Estrutura do rascunho:**
1. Saudacao adequada ao contexto
2. Referencia ao email original (1 frase)
3. Resposta directa e objectiva
4. Proximos passos (se aplicavel)
5. Fecho + assinatura Somnium Properties

Usar MCP Gmail para criar rascunho:
```
gmail_create_draft: to=..., subject=..., body=...
```

### Fase 5: Integrar com CRM

Para cada email de investidor ou consultor que esta no CRM:

1. Procurar no CRM por email ou nome:
   ```
   GET /api/crm/investidores?search=[nome ou email]
   GET /api/crm/consultores?search=[nome ou email]
   ```

2. Se encontrar, criar interaccao automaticamente:
   ```
   POST /api/crm/consultor-interacoes (para consultores)
   PUT /api/crm/investidores/:id (actualizar data_ultimo_contacto para investidores)
   ```

3. Se o email implica uma tarefa (ex: "enviar documento", "marcar reuniao"):
   ```
   POST /api/tarefas
   ```

### Fase 6: Organizar emails por departamento

Usar os endpoints da Gmail API do backend para organizar:

1. Garantir que os labels existem:
   ```
   GET /api/crm/gmail/labels
   ```

2. Para cada email classificado, mover para o label correcto e marcar como lido:
   ```
   POST /api/crm/gmail/organize-batch
   Body: { "messages": [
     { "messageId": "...", "label": "Somnium/Comercial", "markRead": true },
     { "messageId": "...", "label": "Somnium/Financeiro", "markRead": true },
     ...
   ]}
   ```

**Mapeamento categoria → label Gmail:**
| Categoria da triagem | Label Gmail |
|---------------------|-------------|
| Investidor | Somnium/Comercial/Investidores |
| Consultor | Somnium/Comercial/Consultores |
| Negocio | Somnium/Comercial/Negocios |
| Financeiro / Factura / Despesa | Somnium/Financeiro |
| Administrativo / Plataforma / Alerta | Somnium/Administrativo |
| Newsletter | Somnium/Newsletter |
| Promocional / Spam | Somnium/Arquivo |

3. Emails urgentes e importantes: mover para o label MAS nao marcar como lido (para o utilizador ver).

4. Em alternativa, organizar tudo automaticamente de uma vez:
   ```
   POST /api/crm/gmail/auto-organize
   ```
   (usa regras automaticas baseadas em remetente e assunto)

**Objectivo: inbox a zero.** Todos os emails ficam organizados por departamento. Nada fica por ler excepto os urgentes/importantes.

### Fase 7: Resumo final

```
RESUMO
- Emails processados: X
- Urgentes: X (rascunhos criados: Y, marcados como nao lidos: Z)
- CRM actualizado: X contactos
- Tarefas criadas: X
- Organizados por departamento:
  - Somnium/Comercial: X
  - Somnium/Financeiro: X
  - Somnium/Administrativo: X
  - Somnium/Newsletter: X
  - Somnium/Arquivo: X
- Inbox: 0 nao lidos (excepto urgentes)
```

## Assinatura padrao

```
Alexandre Mendes
CFO — Somnium Properties
Investimento Imobiliario
```

## Quando nao usar

- Para escrever emails longos ou propostas (usar /doc-coauthoring)
- Para gerir CRM sem relacao com email (usar /comercial/crm-health)
