# Departamento Administrativo — Contexto

## Entidades

- **OKRs**: titulo, descricao, trimestre, status + Key Results (kr, valor_actual, valor_alvo, unidade)
- **Tarefas**: titulo, descricao, prioridade, estado, data_limite, responsavel, gcal_event_id
- **Alertas**: gerados automaticamente baseados em regras de negocio (data health, follow-ups, prazos)
- **Calendar events**: sync bidireccional com Google Calendar
- **Automacoes**: scoring investidores/consultores, calc ROI, pipeline-to-faturacao

## Ficheiros chave

| Tarefa | Ficheiros |
|--------|-----------|
| Metricas e OKRs | src/pages/Metricas.jsx |
| Operacoes (tarefas, calendario, equipa) | src/pages/Operacoes.jsx |
| Alertas e data health | src/pages/Alertas.jsx |
| Dashboard geral | src/pages/Dashboard.jsx |
| OKRs API | server.js (grep "/api/okrs") |
| Tarefas API | server.js (grep "/api/tarefas") |
| Alertas API | server.js (grep "/api/alertas") |
| Cron jobs | server.js (grep "cron\|autoSync\|setInterval") |

## Ficheiros grandes

| Ficheiro | Linhas | Como ler |
|----------|--------|----------|
| src/pages/Metricas.jsx | ~1200 | Ler por tab (grep "tab === 'nome'") |
| src/pages/Operacoes.jsx | ~770 | Ler por tab |
| server.js | ~4200 | NUNCA ler inteiro. Grep para seccao especifica |

## Integracoes

- **Google Calendar**: sync bidireccional de tarefas. Ficheiro: src/db/calendarSync.js
- **Google Forms**: sync automatico de investidores a cada 15 min. Ficheiro: src/db/formsSync.js
- **Notion**: sync bidireccional (PostgreSQL e fonte de verdade). Ficheiro: src/db/sync.js
- **Gmail**: triagem e classificacao de emails (via MCP)
- **Cron jobs**: relatorio diario, relatorio semanal, follow-up automatico

## Endpoints API

- `/api/okrs` — CRUD OKRs + Key Results
- `/api/tarefas` — CRUD tarefas
- `/api/calendar/events` — Eventos do calendario
- `/api/calendar/sync` — Sync Google Calendar
- `/api/alertas` — Alertas do sistema
- `/api/data-health` — Saude dos dados
- `/api/weekly-pulse` — Pulso semanal
- `/api/ops-scorecard` — Scorecard operacional
- `/api/kpis/operacoes` — KPIs operacionais
- `/api/crm/automation/*` — Automacoes (scoring, calc, sync)
- `/api/cron/*` — Jobs agendados

## Estado actual (Abril 2026)

- Score semanal: 20/100 (operacao em arranque)
- Google Calendar, Forms e WhatsApp activos
- Notion sync activo
