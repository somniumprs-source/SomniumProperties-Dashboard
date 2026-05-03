# whatsapp-weekly-report

Gera relatorio semanal empresarial em PDF a partir de exports WhatsApp das 8 chats criticas da Somnium Properties. Inclui texto, transcricao de audios e imagens partilhadas. Layout identico ao dos restantes relatorios (paleta gold/preto, capa empresarial, headers em letter-spacing, footer "SOMNIUM PROPERTIES · CONFIDENCIAL").

## Pre-requisito

Antes de executar, ler `.claude/dept/administrativo.md` para contexto do departamento administrativo.

**Estrutura de pastas (criada por `scripts/whatsapp_setup.sh`):**

```
inputs/whatsapp/
  ceo/
    _export/                          <- export completo do WhatsApp (cresce com tempo)
      _chat.txt
      AUD-*.opus, IMG-*.jpg, ...
    2026-W18/                         <- filtro Seg-Dom (criado por whatsapp_filter_week.py)
      _chat.txt
      AUD-*.opus, IMG-*.jpg
      _audios.json                    <- transcricoes (whatsapp_transcribe.py)
  claude-code/
  financeiro/
  t2-condeixa/
  predio-lajes/
  comercial-investidores/
  comercial-imoveis/
  caep/
```

**Conversas esperadas (8 ids exactos):** `ceo`, `claude-code`, `financeiro`, `t2-condeixa`, `predio-lajes`, `comercial-investidores`, `comercial-imoveis`, `caep`.

## Quando usar

- Final de cada semana (Sexta/Sabado/Domingo) para revisao de comunicacoes
- Antes de reuniao de board
- Onboarding de novo membro que precisa de catch-up
- Quando o utilizador disser "gera o relatorio semanal de WhatsApp", "compila as conversas da semana", "relatorio das chats"

## Quando nao usar

- Para resumo de uma so conversa (responder em texto, sem PDF)
- Para chats com clientes finais sem consentimento (RGPD)

## Skills do Claude a invocar

1. **`pdf` skill** — guidance para PDF profissional.
2. **`internal-comms` skill** — tom empresarial PT-PT, sumario executivo.
3. **`brand-guidelines`** — paleta gold #C9A84C / dark #0d0d0d (ja embutida no script).

## Instrucoes

### Fase 1: Validar inputs e filtrar semana

1. Pedir ao utilizador a data alvo (qualquer dia da semana). Default: data de hoje.

2. Calcular o label da semana ISO (`YYYY-Www`, ex: `2026-W18`) e os limites Seg-Dom.

3. Verificar se `inputs/whatsapp/` existe. Se nao, correr:
   ```bash
   ./scripts/whatsapp_setup.sh
   ```
   E pedir ao utilizador para colocar exports em cada `<chat>/_export/`.

4. Correr o filtro semanal:
   ```bash
   python scripts/whatsapp_filter_week.py YYYY-MM-DD
   ```
   Apresentar a tabela de resultados (mensagens / audios / imagens por chat).

5. Se algum chat estiver vazio, perguntar se prosseguir mesmo assim.

### Fase 2: Transcrever audios

Correr Whisper para transcrever todos os audios da semana:
```bash
python scripts/whatsapp_transcribe.py 2026-W18
```

Por defeito usa modelo `base` (rapido). Para qualidade superior em portugues, passar `--model small`. Cada chat ganha um `_audios.json` com transcricoes.

Se ffmpeg nao estiver disponivel:
- Verificar com `which ffmpeg`
- Se em falta, descarregar binario arm64 de https://www.osxexperts.net/ e copiar para `~/bin/ffmpeg`

### Fase 3: Sintese editorial

Para cada chat com mensagens:

1. Ler `inputs/whatsapp/<chat>/<YYYY-Www>/_chat.txt` (so msgs Seg-Dom).
2. Ler `inputs/whatsapp/<chat>/<YYYY-Www>/_audios.json` se existir (transcricoes adicionam contexto).
3. Listar imagens em `<chat>/<YYYY-Www>/*.{jpg,png,heic,webp}`.

Extrair:
- **Periodo**: Seg DD/MM a Dom DD/MM
- **Mensagens**: contagem total
- **Participantes**: nomes unicos (max 6)
- **Sentimento dominante**: Positivo / Neutro / Tenso / Misto
- **Ratio de resposta**: Activo / Moderado / Quieto
- **Topicos discutidos**: 5-8 bullets editorializados (sintese, nao copia)
- **Decisoes tomadas**: max 6
- **Accoes pendentes**: lista `{responsavel, prazo, accao}`
- **Proximos passos**: paragrafo curto
- **Audios**: lista `{file, autor, duracao, transcricao}` (incluir transcricoes integrais ou resumos curtos)
- **Imagens**: lista `{file, legenda}` ou apenas nomes (script resolve paths automaticamente da pasta semanal)

Para `t2-condeixa` e `predio-lajes`, opcionalmente cross-ref com CRM:
```bash
curl -s --max-time 2 "http://localhost:3001/api/crm/imoveis?search=Condeixa"
```

Compor:
- **Sumario executivo**: paragrafo de 5-8 linhas (visao do CEO sobre a semana)
- **Top 5 topicos da semana**: cross-conversa
- **Mensagens criticas**: max 25, com `{data, conversa, excerto}` (montantes >50k EUR, decisoes, contratos)
- **Totais**: mensagens, conversas activas, decisoes, accoes pendentes, audios, imagens

### Fase 4: Gerar PDF

1. Escrever JSON em `inputs/whatsapp/<YYYY-Www>_summary.json`:

   ```json
   {
     "semana_label": "2026-W18",
     "data_geracao": "YYYY-MM-DD",
     "periodo": {"inicio": "YYYY-MM-DD", "fim": "YYYY-MM-DD"},
     "totais": {
       "mensagens": 0, "conversas_activas": 0,
       "decisoes": 0, "accoes_pendentes": 0,
       "audios": 0, "imagens": 0
     },
     "sumario_executivo": "...",
     "top_topicos": ["..."],
     "conversas": [
       {
         "id": "ceo",
         "periodo": "27 Abr a 3 Mai",
         "mensagens": 62,
         "participantes": ["..."],
         "ratio_resposta": "Activo",
         "sentimento": "Positivo",
         "topicos": ["..."],
         "decisoes": ["..."],
         "accoes": [{"responsavel": "...", "prazo": "...", "accao": "..."}],
         "proximos_passos": "...",
         "audios": [{"file": "AUD-....opus", "autor": "Joao", "duracao": "1:20", "transcricao": "..."}],
         "imagens": ["IMG-....jpg"],
         "cross_ref_crm": null
       }
     ],
     "mensagens_criticas": [{"data": "DD/MM", "conversa": "CEO", "excerto": "..."}]
   }
   ```

   IDs validos (manter exactos): `ceo`, `claude-code`, `financeiro`, `t2-condeixa`, `predio-lajes`, `comercial-investidores`, `comercial-imoveis`, `caep`.

2. Correr:
   ```bash
   python scripts/whatsapp_weekly_report.py 2026-W18
   ```

3. Output: `scripts/output/relatorio-whatsapp-semanal-2026-W18.pdf`.

### Fase 5: Entrega

1. Mostrar caminho absoluto do PDF.
2. Sumario textual de 3-5 linhas com as principais conclusoes.
3. Sugerir: abrir o PDF, partilhar com o CEO/socio, arquivar em Drive.

## Workflow rapido (resumo)

```bash
# 1. Setup inicial (uma vez)
./scripts/whatsapp_setup.sh

# 2. Cada semana, descomprimir exports do WhatsApp em inputs/whatsapp/<chat>/_export/

# 3. Filtrar semana
python scripts/whatsapp_filter_week.py 2026-04-29   # qualquer data da semana

# 4. Transcrever audios
python scripts/whatsapp_transcribe.py 2026-W18

# 5. Pedir ao Claude: "gera o relatorio semanal de WhatsApp"
#    Claude faz a sintese editorial e corre:
python scripts/whatsapp_weekly_report.py 2026-W18
```

## Anti-padroes (nao fazer)

- **Nao copiar mensagens textuais** para o PDF. Sintetizar editorialmente.
- **Nao incluir transcricoes integrais longas** se passarem de 5 linhas — resumir.
- **Nao listar mais de 6 imagens por chat** no PDF (mantem ficheiro <5 MB).
- **Nao incluir conteudo de chats com terceiros sem consentimento** (RGPD).
- **Nao alterar `scripts/generate-whatsapp-pdf.py`** (script separado).

## Verificacao

Apos gerar o PDF:
- Capa: preto + faixa gold + logo + label `2026-W18` + ref `WSP-RPT-...`
- Sumario executivo com 4 KPIs (incluir audios/imagens se totais > 0)
- Cada conversa com seccoes: metadata, topicos, decisoes, accoes, proximos passos, **audios transcritos**, **imagens partilhadas** (grid 3xN)
- Footer "SOMNIUM PROPERTIES · CONFIDENCIAL" em todas as paginas internas
