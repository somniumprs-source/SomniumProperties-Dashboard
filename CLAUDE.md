# CLAUDE.md — Somnium Properties Dashboard

## Identidade do projecto

O meu papel neste projecto e CFO da Somnium Properties. O projecto e o CRM e dashboard operacional da empresa: gere imoveis, investidores, consultores, negocios, despesas, tarefas e OKRs.

## Tech Stack

- Frontend: React 18 + Vite 5 + Tailwind CSS + Recharts + Lucide Icons
- Backend: Express 5 (server.js ~4200 linhas) + PostgreSQL (Supabase)
- Auth: Supabase JWT (desactivado em dev quando SUPABASE_SERVICE_KEY vazio)
- Deploy: Render (auto-deploy do branch main)
- Repo: github.com/somniumprs-source/SomniumProperties-Dashboard

## Integracoes

- Notion: sync bidireccional (PostgreSQL e fonte de verdade)
- Google Drive: pasta automatica por imovel (subpastas Documentos/Fotos/Estudo de Mercado)
- Google Calendar: sync bidireccional de tarefas
- Google Forms: sync automatico de investidores (a cada 15 min)
- Fireflies.ai: transcricoes de reunioes + auto-fill investidores
- WhatsApp (Twilio): agente de follow-up para consultores
- Anthropic API: analise de reunioes com Claude

## Estrutura de pastas (Workspaces)

| Pasta | Conteudo | Ler antes de trabalhar |
|-------|----------|----------------------|
| `/src/pages/` | Paginas do frontend (CRM, Financeiro, Metricas, Operacoes, Dashboard, Alertas) | CLAUDE.md |
| `/src/components/` | Componentes reutilizaveis (DetailPanel, FicheirosTab, Skeleton, etc.) | CLAUDE.md |
| `/src/db/` | Backend: CRUD, routes, PDFs, syncs, migrations | CLAUDE.md |
| `/scripts/` | Scripts de automacao (auth Google, import fotos, migracao Notion) | CLAUDE.md |
| `/public/uploads/imoveis/` | Fotos carregadas dos imoveis | — |

## Tabela de Encaminhamento

| Tarefa | Ir para | Ficheiros chave |
|--------|---------|----------------|
| Alterar ficha do imovel/investidor/consultor | src/components/crm/ | DetailPanel.jsx, FicheirosTab.jsx |
| Alterar CRM (tabelas, kanban, filtros) | src/pages/ | CRM.jsx |
| Alterar financeiro (despesas, negocios, KPIs) | src/pages/ | Financeiro.jsx |
| Alterar PDFs e documentos | src/db/ | pdfReport.js, pdfImovelDocs.js |
| Alterar endpoints API | src/db/ | routes.js, crud.js |
| Alterar integracoes (Drive, Calendar, Forms) | src/db/ | driveSync.js, calendarSync.js, formsSync.js |
| Alterar metricas, OKRs, alertas | src/pages/ + server.js | Metricas.jsx, server.js (ler por seccoes) |
| Adicionar novo campo a uma entidade | src/db/ | pg.js (migration), crud.js, routes.js |

## Ficheiros grandes (nao ler inteiros)

| Ficheiro | Linhas | Como ler |
|----------|--------|----------|
| server.js | ~4200 | Usar offset/limit. Grep para encontrar seccao relevante. |
| src/pages/CRM.jsx | ~1100 | Ler por funcao (grep nome da funcao). |
| src/pages/Metricas.jsx | ~1200 | Ler por tab (grep "tab === 'nome'"). |
| src/pages/Financeiro.jsx | ~1350 | Ler por tab ou form. |
| src/db/pdfImovelDocs.js | ~1000 | Ler gerador especifico (grep tipo do documento). |

## Comandos

```bash
npm run dev          # Backend (3001) + Vite (5173)
npm run build        # Build producao
node scripts/auth-google.js           # OAuth Google
node scripts/import-drive-photos.js   # Importar fotos do Drive
```

## Regras de Operacao

- Ler este CLAUDE.md primeiro em cada nova sessao.
- Todos os fetch no frontend usam `apiFetch()` de `src/lib/api.js` (nunca fetch directo).
- Campos numericos vazios ("") convertidos para null pelo `cleanFormData()` no crud.js.
- server.js: NAO ler inteiro. Usar offset/limit ou grep.
- Fotos: guardadas em `/public/uploads/imoveis/` com metadados JSON na coluna `fotos`.
- PDFs incluem fotografias do imovel automaticamente (max 6 por documento).
- Palette: brand gold #C9A84C, brand dark #0d0d0d (tailwind.config.js).
- Commit messages em portugues. Commit e push automatico quando build passa.
- Nunca criar ficheiros fora das pastas existentes sem perguntar.
- Se tiver duvidas sobre onde colocar algo, parar e perguntar.

## Convencoes de Nomenclatura

- Componentes React: `PascalCase.jsx` (ex: DetailPanel.jsx, FicheirosTab.jsx)
- Ficheiros backend: `camelCase.js` (ex: driveSync.js, pdfReport.js)
- Campos BD: `snake_case` (ex: custo_mensal, data_follow_up)
- Campos API Notion: `camelCase` (ex: custoMensal) — normalizar para snake_case nos forms
- CSS: Tailwind utility classes, cores via tailwind.config.js

## Estado actual (Abril 2026)

- 14 imoveis, 45 investidores, 84 consultores, 5 negocios, 11 despesas
- 0 deals fechados (pipeline em fase de obras)
- Score semanal: 20/100 (operacao em arranque)
- Data health: 61%
- Google Drive, Calendar, Forms e WhatsApp activos
- 113 fotos importadas do Drive para 8 imoveis
