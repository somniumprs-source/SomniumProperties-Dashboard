# crm-health

Analisa a saude dos dados do CRM, identifica falhas criticas, incoerencias e campos por preencher. Sugere accoes concretas para cada problema. Compara com a ultima analise para mostrar evolucao.

## Quando usar

- Inicio de cada sessao de trabalho (apos /session-start)
- Quando o utilizador quer saber "como estao os dados"
- Antes de gerar relatorios ou apresentacoes para investidores

## Instrucoes

### Fase 1: Recolher dados

Arrancar o servidor se nao estiver a correr. Chamar estes endpoints:

```
GET /api/crm/stats
GET /api/data-health
GET /api/alertas
GET /api/weekly-pulse
GET /api/crm/imoveis?limit=200
GET /api/crm/investidores?limit=200
GET /api/crm/consultores?limit=200
GET /api/crm/negocios?limit=200
GET /api/crm/despesas?limit=200
```

### Fase 2: Analisar cada entidade

Para cada entidade, calcular score de saude (0-100%) baseado em campos preenchidos.

**Imoveis** (campos criticos):
- Nome, estado, ask_price, zona, origem (obrigatorios)
- modelo_negocio, tipologia, nome_consultor (importantes)
- VVR, custo_estimado_obra, ROI (necessarios para analise)
- Fotos (pelo menos 1 para apresentar a investidor)
- data_adicionado, data_chamada, data_visita (cronologia)
- Incoerencias: estado avancado mas sem dados basicos, ROI negativo, VVR = 0 em estado avancado

**Investidores** (campos criticos):
- Nome, status, origem (obrigatorios)
- Email OU telemovel (pelo menos 1 contacto)
- Classificacao (obrigatorio se status >= Follow Up)
- Capital max (obrigatorio para calculos)
- Estrategia, tipo_investidor (importantes)
- data_primeiro_contacto, data_ultimo_contacto (cronologia)
- Incoerencias: "Em parceria" sem montante investido, "Classificado" sem classificacao, NDA pendente em estados avancados

**Consultores** (campos criticos):
- Nome, estatuto (obrigatorios)
- Contacto OU email (pelo menos 1)
- data_follow_up (obrigatorio se estatuto activo)
- Incoerencias: "Follow up" sem data_proximo_follow_up, activo sem interacoes ha 15+ dias

**Negocios** (campos criticos):
- Movimento, categoria, fase (obrigatorios)
- imovel_id (deve estar ligado a um imovel)
- lucro_estimado (obrigatorio)
- Incoerencias: "Vendido" sem lucro_real, sem data_venda, imovel_id que nao existe

**Despesas** (campos criticos):
- Movimento, timing (obrigatorios)
- custo_mensal OU custo_anual (pelo menos 1)
- categoria (importante)

### Fase 3: Classificar falhas

Para cada falha encontrada, classificar:

- **Critico**: Bloqueia um negocio ou impede apresentacao a investidor
  - Ex: imovel em "Enviar proposta ao investidor" sem VVR
  - Ex: investidor "Em parceria" sem montante investido
  - Ex: negocio sem imovel associado

- **Aviso**: Risco operacional ou dado desactualizado
  - Ex: investidor sem contacto ha 30+ dias
  - Ex: consultor activo sem follow-up agendado
  - Ex: imovel sem fotos

- **Info**: Melhoria recomendada
  - Ex: campo opcional vazio que ajudaria nos relatorios
  - Ex: classificacao em falta mas nao urgente

### Fase 4: Comparar com ultima analise

Ler o ficheiro `.claude/crm-health-last.json` (se existir) e comparar:
- Score global: subiu ou desceu?
- Criticos: quantos novos, quantos resolvidos?
- Campos preenchidos: percentagem anterior vs actual

Guardar a analise actual em `.claude/crm-health-last.json` para proxima comparacao.

### Fase 5: Apresentar relatorio

Formato do relatorio:

```
SAUDE DO CRM — [data]

Score Global: XX% (anterior: YY%, evolucao: +/-Z%)

SCORES POR ENTIDADE
| Entidade      | Score | Registos | Criticos | Avisos |
|---------------|-------|----------|----------|--------|
| Imoveis       | XX%   | N        | X        | Y      |
| Investidores  | XX%   | N        | X        | Y      |
| Consultores   | XX%   | N        | X        | Y      |
| Negocios      | XX%   | N        | X        | Y      |
| Despesas      | XX%   | N        | X        | Y      |

FALHAS CRITICAS (resolver primeiro)
| Entidade | Nome | Falha | Accao sugerida |
|----------|------|-------|----------------|
| ...      | ...  | ...   | ...            |

AVISOS (resolver esta semana)
| Entidade | Nome | Falha | Accao sugerida |
|----------|------|-------|----------------|
| ...      | ...  | ...   | ...            |

EVOLUCAO (vs ultima analise)
- Criticos: X -> Y (Z resolvidos, W novos)
- Score: XX% -> YY%
- Campos preenchidos: lista de melhorias
```

### Fase 6: Sugerir optimizacoes

Para facilitar o preenchimento futuro, sugerir:
- Campos que deviam ser obrigatorios no formulario
- Validacoes automaticas que podiam ser adicionadas
- Automacoes que preencheriam dados em falta (ex: auto-calc ROI)

## Quando nao usar

- Para testar funcionalidade do CRM (usar /crm-audit)
- Para redesign visual (usar /layout-review)
- Para alterar PDFs (usar /pdf-upgrade)
