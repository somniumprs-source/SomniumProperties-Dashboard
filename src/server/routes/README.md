# Server Routes — Modularizacao

## Estrutura alvo

```
src/server/routes/
  financeiro.js    — /api/financeiro/*, /api/kpis/financeiro
  comercial.js     — /api/comercial/*, /api/kpis/comercial
  operacoes.js     — /api/operacoes/*, /api/kpis/operacoes
  metricas.js      — /api/metricas, /api/weekly-pulse, /api/ops-scorecard
  okrs.js          — /api/okrs, /api/okrs/:id/krs
  calendar.js      — /api/calendar/*
  automation.js    — scoring, calc-roi, pipeline-to-faturacao
  cron.js          — /api/cron/*, setInterval auto-syncs
```

## Como extrair (padrao)

1. Criar ficheiro com `export default function(app, helpers) { ... }`
2. Mover rotas do server.js para o ficheiro
3. No server.js: `import financeiro from './src/server/routes/financeiro.js'` + `financeiro(app, { pool, getDespesas, getNegócios, ... })`
4. Testar endpoints afectados

## Helpers partilhados (definidos em server.js, passados como argumento)

- `pool` — PostgreSQL connection
- `getImoveis()`, `getInvestidores()`, `getConsultores()`, `getNegócios()`, `getDespesas()`
- `round2()`, `mapImovel()`, `mapInvestidor()`, `mapConsultor()`, `mapNegocio()`, `mapDespesa()`
- `TTLCache` — cache com TTL
