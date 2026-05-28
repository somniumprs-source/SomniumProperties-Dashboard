# CLAUDE.md — Somnium Properties Dashboard

CRM e dashboard operacional da Somnium Properties: gere imoveis, investidores, consultores, negocios, despesas, tarefas e OKRs.

## Tech Stack

- Frontend: React 18 + Vite 5 + Tailwind CSS + Recharts + Lucide Icons
- Backend producao: Supabase Edge Functions (Deno/Hono) em `supabase/functions/`
- Backend Express (server.js + src/db/routes.js): so dev local (`npm run dev`); Render decomissionado
- Auth: Supabase JWT (desactivado em dev quando SUPABASE_SERVICE_KEY vazio)
- Deploy: tudo auto-deploy no push para main — frontend no Vercel; Edge Functions via GitHub Actions (`.github/workflows/deploy-supabase.yml`, dispara quando muda `supabase/functions/**` ou `config.toml`; usa o secret `SUPABASE_ACCESS_TOKEN`)
- Repo: github.com/somniumprs-source/SomniumProperties-Dashboard
- Restos: `render.yaml` e `railway.json` (raiz) sao do setup Render antigo (decomissionado). Nao usados em deploy; mantidos por historico.

IMPORTANTE: alteracoes a endpoints precisam de ser portadas para AMBOS `src/db/routes.js` (Express, dev) e `supabase/functions/crm/index.ts` (producao). So o segundo chega a producao.

## Comandos

```bash
npm run dev          # Backend (3001) + Vite (5173)
npm run build        # Build producao
```

## Mapa de Navegacao

Onde mexer por dominio. Backend dev = `server.js` (rotas inline) + `src/db/routes.js` (so `/api/crm`, montado em server.js:128). Localizar rotas por `grep "/api/<dominio>" server.js` (linhas aproximadas abaixo, podem mover).

| Dominio | Backend dev (server.js ~linha / routes) | Frontend |
|---|---|---|
| CRM, imoveis, investidores | `/api/crm` -> `src/db/routes.js` | `src/pages/CRM.jsx`, `src/components/crm/` |
| Consultores | `/api/consultores` ~344 | `src/components/crm/` |
| Financeiro, despesas, negocios | `/api/financeiro` ~1311 | `src/pages/Financeiro.jsx`, `src/components/analise/` |
| Comercial | `/api/comercial` ~1776 | `src/pages/CRM.jsx` |
| KPIs e metricas | `/api/kpis` ~1204, `/api/metricas` ~2743 | `src/pages/Metricas.jsx`, `src/components/dashboard/` |
| Operacoes | `/api/operacoes` ~2345 | `src/pages/Operacoes.jsx` |
| OKRs e tarefas | `/api/okrs` ~4517, `/api/tarefas` ~4216 | `src/pages/Administracao*.jsx` |
| Alertas | `/api/alertas` ~5019 | `src/pages/Alertas.jsx` |
| Calendario | `/api/calendar` ~4020 | `src/pages/ProjectosCalendario.jsx` |
| Relatorios | `/api/relatorios` ~753 | `src/pages/RelatoriosAdmin.jsx`, `Relatorios/` |
| SOPs | `/api/sops` ~137 | `src/pages/AdministracaoSOP.jsx` |
| Utilizadores e acessos | `/api/users`, `/api/acessos` ~120 | `src/pages/Utilizadores.jsx` |
| Automation e webhooks | `/api/automation` ~5456, `/api/webhook` ~159 | `src/api/automation/` |
| Cron jobs | `/api/cron` ~650 | — |

Transversal: fetch -> `src/lib/api.js` (`apiFetch`). Limpeza de forms -> `src/db/crud.js` (`cleanFormData`). Migracoes BD -> `supabase/migrations/`. Fotos -> `public/uploads/imoveis/`.

Producao: Edge Functions em `supabase/functions/` (crm, dashboard, calendar, users, sops, voice, webhook-*, cron-*, scrape-portal). Endpoints alterados em dev precisam de port para a funcao respectiva (ver IMPORTANTE acima).

## Departamentos

| Departamento | Contexto | Skills |
|---|---|---|
| Comercial (CRM, imoveis, investidores, consultores) | `.claude/dept/comercial.md` | /comercial/crm-audit, /comercial/crm-health |
| Financeiro (despesas, negocios, analises, PDFs) | `.claude/dept/financeiro.md` | /financeiro/pdf-upgrade |
| Administrativo (OKRs, tarefas, alertas, metricas, email) | `.claude/dept/administrativo.md` | /administrativo/email-ops |
| Geral (cross-department) | Perguntar qual departamento | /geral/layout-review, /geral/new-feature, /geral/cashvertising |

Para trabalhar num departamento: correr o skill respectivo ou ler o ficheiro de contexto.

## Documentacao de negocio

Documentos de referencia (contexto, checklists, apresentacoes) vivem em `docs/`:

- `docs/contexto/` — snapshots de contexto do CRM e investidores (CONTEXTO_*.md/pdf). Ler antes de tarefas que envolvam dados de imoveis ou investidores.
- `docs/comercial/`, `docs/administrativo/`, `docs/diversos/` — checklists e materiais por area.

Outputs gerados por scripts ficam na raiz (ex: `Manual_Orcamento_Obra_Somnium.pdf`, `Apresentacao_Investidores_Marco_2026.pptx`, `somnium-investidores.html`): nao mover, os scripts dependem destes caminhos.

## Regras de Operacao

- Todos os fetch no frontend usam `apiFetch()` de `src/lib/api.js` (nunca fetch directo).
- Campos numericos vazios ("") convertidos para null pelo `cleanFormData()` no `src/db/crud.js`.
- Fotos: guardadas em `/public/uploads/imoveis/` com metadados JSON na coluna `fotos`.
- PDFs incluem fotografias do imovel automaticamente (max 6 por documento).
- Palette: brand gold #C9A84C, brand dark #0d0d0d (tailwind.config.js).
- Commit messages em portugues. Commit e push automatico quando build passa (gate no Stop hook de `.claude/settings.json`).

## Proibicoes (NAO fazer)

- NAO ler `server.js` inteiro: usar offset/limit ou grep (ver Mapa de Navegacao).
- NAO criar ficheiros fora das pastas existentes sem perguntar.

## Convencoes de Nomenclatura

- Componentes React: `PascalCase.jsx` (ex: DetailPanel.jsx)
- Ficheiros backend: `camelCase.js` (ex: driveSync.js)
- Campos BD: `snake_case` (ex: custo_mensal)
- Campos API Notion: `camelCase` — normalizar para snake_case nos forms
- CSS: Tailwind utility classes, cores via tailwind.config.js
