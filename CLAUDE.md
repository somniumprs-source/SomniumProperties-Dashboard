# CLAUDE.md — Somnium Properties Dashboard

## O que e este projecto

CRM e dashboard operacional da Somnium Properties. Gere imoveis, investidores, consultores, negocios, despesas, tarefas e OKRs. Full-stack com React frontend e Express backend.

## Tech Stack

- Frontend: React 18 + Vite 5 + Tailwind CSS + Recharts + Lucide Icons
- Backend: Express 5 (server.js ~4200 linhas) + PostgreSQL (Supabase)
- Auth: Supabase JWT (desactivado em dev quando SUPABASE_SERVICE_KEY vazio)
- Deploy: Render (auto-deploy do branch main)
- Repo: github.com/somniumprs-source/SomniumProperties-Dashboard

## Integracoes

- Notion: sync bidireccional (PostgreSQL e fonte de verdade)
- Google Drive: pasta automatica por imovel com subpastas Documentos/Fotos/Estudo de Mercado
- Google Calendar: sync bidireccional de tarefas
- Google Forms: sync automatico de investidores (a cada 15 min)
- Fireflies.ai: transcricoes de reunioes + auto-fill investidores
- WhatsApp (Twilio): agente de follow-up automatico para consultores
- Anthropic API: analise de reunioes com Claude

## Estrutura de ficheiros chave

```
server.js                    # Backend monolitico (4200 linhas) — maior ficheiro, ler por seccoes
src/pages/CRM.jsx            # Pagina principal do CRM (imoveis, investidores, consultores, negocios)
src/pages/Financeiro.jsx     # Departamento financeiro (despesas, negocios, cashflow, P&L)
src/pages/Metricas.jsx       # Metricas avancadas (6 tabs, 1200 linhas)
src/pages/Operacoes.jsx      # Tarefas, time-tracking, calendario
src/pages/Dashboard.jsx      # Dashboard central com KPIs
src/components/crm/DetailPanel.jsx  # Ficha de imovel/investidor/consultor
src/components/crm/FicheirosTab.jsx # Galeria de fotos + documentos
src/db/crud.js               # CRUD generico com cleanFormData()
src/db/routes.js             # API REST do CRM (endpoints /api/crm/*)
src/db/pg.js                 # Schema PostgreSQL + migrations
src/db/pdfReport.js          # Relatorio geral PDF do imovel
src/db/pdfImovelDocs.js      # 14 tipos de documentos PDF (DocBuilder)
src/db/driveSync.js          # Google Drive: criar/mover pastas
src/db/calendarSync.js       # Google Calendar sync
src/db/firefliesSync.js      # Fireflies.ai sync
src/db/formsSync.js          # Google Forms sync
src/server/shared.js         # Helpers e mappers partilhados do server
src/constants.js             # Formatters (EUR, PCT), cores, estados
src/lib/api.js               # apiFetch() — wrapper com auth token
```

## Comandos

```bash
npm run dev          # Arranca backend (3001) + Vite (5173) em simultaneo
npm run build        # Build de producao
npm start            # Build + servidor de producao
node scripts/auth-google.js           # Configurar OAuth do Google
node scripts/import-drive-photos.js   # Importar fotos do Drive para o CRM
node scripts/migrate-from-notion.js   # Migrar dados do Notion para PostgreSQL
```

## Regras do projecto

- Todos os fetch no frontend usam `apiFetch()` de `src/lib/api.js` (nunca fetch directo)
- Campos numericos vazios ("") sao convertidos para null pelo `cleanFormData()` no crud.js
- server.js: NAO ler inteiro. Usar offset/limit para ler seccoes especificas.
- Fotos dos imoveis: guardadas em `/public/uploads/imoveis/` com metadados JSON na coluna `fotos`
- PDFs incluem fotografias do imovel automaticamente (max 4-6 por documento)
- Palette: brand gold #C9A84C, brand dark #0d0d0d (definidos em tailwind.config.js)
- Commit messages em portugues, com Co-Authored-By do Claude

## Estado actual (Abril 2026)

- 14 imoveis, 45 investidores, 84 consultores, 5 negocios, 11 despesas
- 0 deals fechados (pipeline em fase de obras)
- Score semanal: 20/100 (operacao em arranque)
- Data health: 61%
- Google Drive, Calendar, Forms e WhatsApp todos activos e a sincronizar
- 113 fotos importadas do Drive para 8 imoveis
