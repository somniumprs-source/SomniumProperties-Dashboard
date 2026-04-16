# email-ops

Organiza, prioriza e responde ao email do Gmail. Classifica por urgencia, prepara rascunhos de resposta, cria tarefas no CRM a partir de emails relevantes.

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

### Fase 6: Sugerir labels Gmail

Na primeira execucao, sugerir criacao de labels no Gmail:
- Somnium/Investidores
- Somnium/Consultores
- Somnium/Negocios
- Somnium/Financeiro
- Somnium/Administrativo
- Arquivo

Nas execucoes seguintes, sugerir mover cada email para o label correcto.

### Fase 7: Resumo final

```
RESUMO
- Emails processados: X
- Urgentes: X (rascunhos criados: Y)
- CRM actualizado: X contactos
- Tarefas criadas: X
- Para arquivar: X
```

## Assinatura padrao

```
Alexandre Mendes
CFO — Somnium Properties
Investimento Imobiliario
```

## Quando nao usar

- Para escrever emails longos ou propostas (usar /doc-coauthoring)
- Para gerir CRM sem relacao com email (usar /crm-health)
