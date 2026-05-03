# whatsapp-weekly-report

Gera relatorio semanal empresarial em PDF a partir de exports manuais de conversas WhatsApp das 8 chats criticas da Somnium Properties. Layout identico ao dos restantes relatorios (paleta gold/preto, capa empresarial, headers em letter-spacing, footer "SOMNIUM PROPERTIES · CONFIDENCIAL").

## Pre-requisito

Antes de executar, ler `.claude/dept/administrativo.md` para contexto do departamento administrativo.

Confirmar que existem exports `.txt` em `inputs/whatsapp/YYYY-MM-DD/`. Se a pasta nao existir, criar e pedir ao utilizador para colocar os ficheiros la.

**Conversas esperadas (8 ficheiros .txt):**

| Ficheiro | Chat WhatsApp |
|---|---|
| `ceo.txt` | CEO |
| `claude-code.txt` | Implementacao Claude Code |
| `financeiro.txt` | Departamento Financeiro |
| `t2-condeixa.txt` | T2 Condeixa |
| `predio-lajes.txt` | Predio Lajes |
| `comercial-investidores.txt` | Comercial — Investidores |
| `comercial-imoveis.txt` | Comercial — Imoveis |
| `caep.txt` | CAEP |

## Quando usar

- Final de cada semana (Sexta) para revisao de comunicacoes criticas
- Antes de reuniao de board
- Onboarding de novo membro que precisa de catch-up
- Quando o utilizador diz "gera o relatorio semanal de WhatsApp", "compila as conversas", "relatorio das chats da semana"

## Quando nao usar

- Para resumo de uma so conversa (responder em texto, sem PDF)
- Para dados em tempo real (este e snapshot semanal)
- Para chats com clientes finais sem consentimento (RGPD — usar so chats internos)

## Skills do Claude a invocar

Durante a execucao, o Claude deve aplicar conhecimento de:

1. **`pdf` skill** — guidance para PDF profissional (tipografia, hierarquia visual, paginacao).
2. **`internal-comms` skill** — tom empresarial PT-PT, formato de status report, sumario executivo.
3. **`brand-guidelines`** — paleta gold #C9A84C / dark #0d0d0d ja embutida no script. Manter consistencia visual com `pdfMeetingReport.js`.

## Instrucoes

### Fase 1: Validar inputs

1. Pedir ao utilizador a data da pasta (default: hoje no formato `YYYY-MM-DD`).
2. Listar `.txt` esperados (8 ficheiros). Para cada um, verificar se existe e nao esta vazio.
3. Apresentar tabela:

```
INPUTS — inputs/whatsapp/YYYY-MM-DD/
| Ficheiro | Estado | Tamanho |
|----------|--------|---------|
| ceo.txt | Encontrado | 124 KB |
| claude-code.txt | Em falta | — |
| ... | ... | ... |
```

4. Se faltam ficheiros, perguntar se prosseguir mesmo assim (conversas em falta aparecem com "Sem mensagens neste periodo" no PDF) ou abortar.

### Fase 2: Parse + sintese

1. Ler cada `.txt`. Formato standard de export WhatsApp:
   ```
   [DD/MM/YYYY, HH:MM:SS] Nome: mensagem
   ```
   ou em ingles:
   ```
   DD/MM/YYYY, HH:MM - Nome: mensagem
   ```

2. Para cada conversa, extrair:
   - **Periodo**: data da primeira e ultima mensagem (formato pt-PT: `27 Abr a 3 Mai`)
   - **Mensagens**: contagem total
   - **Participantes**: nomes unicos (max 6 mostrados)
   - **Sentimento dominante**: `Positivo` / `Neutro` / `Tenso` / `Misto` (heuristica: presenca de "obrigado", "perfeito" vs "problema", "atrasado", "urgente")
   - **Ratio de resposta**: `Activo` (msgs/dia > 5) / `Moderado` (1-5) / `Quieto` (<1)
   - **Topicos discutidos**: 5-8 bullets editorializados (nao copiar mensagens; sintetizar)
   - **Decisoes tomadas**: max 6 bullets concretas (ex: "Aprovada compra do T2 Condeixa por 95k EUR")
   - **Accoes pendentes**: lista de `{responsavel, prazo, accao}`
   - **Proximos passos**: paragrafo curto (3-5 linhas)

3. Para `t2-condeixa` e `predio-lajes`, **opcionalmente** cross-ref com CRM:
   ```bash
   curl -s --max-time 2 "http://localhost:3001/api/crm/imoveis?search=Condeixa" 2>/dev/null
   curl -s --max-time 2 "http://localhost:3001/api/crm/imoveis?search=Lajes" 2>/dev/null
   ```
   Se servidor nao estiver a correr, falhar silenciosamente (saltar bloco). Se encontrar, popular `cross_ref_crm`:
   ```json
   {
     "estado": "Negociacao",
     "tipologia": "T2",
     "vvr": "115.000 EUR",
     "valor_aquisicao": "85.000 EUR",
     "investidor": "Nome do investidor associado"
   }
   ```

4. Compor **sumario executivo**: paragrafo de 5-8 linhas que destaque o que e relevante para um leitor que so leia esta pagina (CEO, board). Tom directo, formal, sem rodeios. Incluir: principais decisoes, riscos, oportunidades, tom geral da semana.

5. Compor **top 5 topicos da semana** (cross-conversa): assuntos que apareceram em multiplas chats ou que dominaram pela frequencia.

6. Extrair **mensagens criticas** (max 25): regex/heuristica para mensagens que contenham montantes >50k EUR, datas-prazo, palavras como "decidi", "aprovado", "fechado", "contrato", "escritura", "transferi", "pagamento". Cada uma com `{data, conversa, excerto}`. Excerto max 130 chars.

### Fase 3: Gerar PDF

1. Escrever JSON estruturado em `inputs/whatsapp/YYYY-MM-DD/.summary.json` com schema:

   ```json
   {
     "data_geracao": "YYYY-MM-DD",
     "semana_num": 18,
     "periodo": {"inicio": "YYYY-MM-DD", "fim": "YYYY-MM-DD"},
     "totais": {
       "mensagens": 0,
       "conversas_activas": 0,
       "decisoes": 0,
       "accoes_pendentes": 0
     },
     "sumario_executivo": "...",
     "top_topicos": ["...", "..."],
     "conversas": [
       {
         "id": "ceo",
         "periodo": "27 Abr a 3 Mai",
         "mensagens": 45,
         "participantes": ["Alexandre", "..."],
         "ratio_resposta": "Activo",
         "sentimento": "Positivo",
         "topicos": ["..."],
         "decisoes": ["..."],
         "accoes": [{"responsavel": "X", "prazo": "Y", "accao": "Z"}],
         "proximos_passos": "...",
         "cross_ref_crm": null
       }
     ],
     "mensagens_criticas": [
       {"data": "DD/MM", "conversa": "CEO", "excerto": "..."}
     ]
   }
   ```

   **IDs validos** (manter exactos): `ceo`, `claude-code`, `financeiro`, `t2-condeixa`, `predio-lajes`, `comercial-investidores`, `comercial-imoveis`, `caep`.

2. Correr o script Python:
   ```bash
   python scripts/whatsapp_weekly_report.py inputs/whatsapp/YYYY-MM-DD/
   ```

3. Output em `scripts/output/relatorio-whatsapp-semanal-YYYY-MM-DD.pdf`.

4. Confirmar que o ficheiro foi gerado e ver tamanho. Se < 30 KB, algo correu mal.

### Fase 4: Entrega

1. Mostrar caminho absoluto do PDF.
2. Sumario textual de 3-5 linhas com as principais conclusoes (replica do paragrafo executivo do PDF, mas em texto plano para leitura rapida).
3. Sugestao de proximos passos:
   - Abrir o PDF para revisao
   - Partilhar com o socio/CEO
   - Arquivar em Drive (pasta `Somnium / Relatorios Semanais`)

## Anti-padroes (nao fazer)

- **Nao copiar mensagens textuais** para o PDF. Sintetizar editorialmente.
- **Nao listar todas as mensagens**. Filtrar pelo que importa: decisoes, accoes, riscos, oportunidades.
- **Nao incluir conteudo de chats com terceiros sem consentimento** (RGPD). So chats internos da Somnium.
- **Nao criar PDFs com layout diferente** (cores, fontes, headers). O script ja garante consistencia.
- **Nao alterar `scripts/generate-whatsapp-pdf.py`** (script separado, deve continuar a funcionar).

## Verificacao

Apos gerar o PDF:
- Abrir e confirmar visualmente: capa preta + faixa gold + logo, footer "SOMNIUM PROPERTIES · CONFIDENCIAL" em todas as paginas internas, headers gold em letter-spacing.
- Comparar com PDF de Reuniao Investidor (`pdfMeetingReport.js`) — devem ser visualmente irmãos.
- Validar referencia `WSP-RPT-YYYY-WW` na capa.
