# CLAUDE.md — Somnium Properties Dashboard

CRM e dashboard operacional da Somnium Properties: gere imoveis, investidores, consultores, negocios, despesas, tarefas e OKRs.

## Tech Stack

- Frontend: React 18 + Vite 5 + Tailwind CSS + Recharts + Lucide Icons
- Backend: Express 5 (server.js ~4200 linhas) + PostgreSQL (Supabase)
- Auth: Supabase JWT (desactivado em dev quando SUPABASE_SERVICE_KEY vazio)
- Deploy: Render (auto-deploy do branch main)
- Repo: github.com/somniumprs-source/SomniumProperties-Dashboard

## Comandos

```bash
npm run dev          # Backend (3001) + Vite (5173)
npm run build        # Build producao
```

## Departamentos

| Departamento | Contexto | Skills |
|---|---|---|
| Comercial (CRM, imoveis, investidores, consultores) | `.claude/dept/comercial.md` | /comercial/crm-audit, /comercial/crm-health |
| Financeiro (despesas, negocios, analises, PDFs) | `.claude/dept/financeiro.md` | /financeiro/pdf-upgrade |
| Administrativo (OKRs, tarefas, alertas, metricas, email) | `.claude/dept/administrativo.md` | /administrativo/email-ops |
| Geral (cross-department) | Perguntar qual departamento | /geral/layout-review, /geral/new-feature |

Para trabalhar num departamento: correr o skill respectivo ou ler o ficheiro de contexto.

## Regras de Operacao

- Todos os fetch no frontend usam `apiFetch()` de `src/lib/api.js` (nunca fetch directo).
- Campos numericos vazios ("") convertidos para null pelo `cleanFormData()` no crud.js.
- server.js: NAO ler inteiro. Usar offset/limit ou grep.
- Fotos: guardadas em `/public/uploads/imoveis/` com metadados JSON na coluna `fotos`.
- PDFs incluem fotografias do imovel automaticamente (max 6 por documento).
- Palette: brand gold #C9A84C, brand dark #0d0d0d (tailwind.config.js).
- Commit messages em portugues. Commit e push automatico quando build passa.
- Nunca criar ficheiros fora das pastas existentes sem perguntar.

## Convencoes de Nomenclatura

- Componentes React: `PascalCase.jsx` (ex: DetailPanel.jsx)
- Ficheiros backend: `camelCase.js` (ex: driveSync.js)
- Campos BD: `snake_case` (ex: custo_mensal)
- Campos API Notion: `camelCase` — normalizar para snake_case nos forms
- CSS: Tailwind utility classes, cores via tailwind.config.js
