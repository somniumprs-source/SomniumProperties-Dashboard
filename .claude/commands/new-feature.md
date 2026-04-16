# new-feature

Adiciona uma feature completa ao CRM: backend (API + BD) + frontend (UI) + integracao (se aplicavel).

## Instrucoes

### Fase 1: Planear
1. Ler CLAUDE.md para perceber a arquitectura
2. Usar a Tabela de Encaminhamento para identificar ficheiros a alterar
3. Apresentar plano ao utilizador com:
   - O que vai ser criado/alterado
   - Ficheiros envolvidos
   - Estimativa de complexidade (simples/medio/complexo)
4. Esperar aprovacao antes de executar

### Fase 2: Backend
1. Se precisa de novo campo: migration no `src/db/pg.js`
2. Se precisa de novo endpoint: adicionar no `src/db/routes.js`
3. Se precisa de logica complexa: adicionar no `server.js` (ler por seccoes, nunca inteiro)
4. Se envolve integracao externa: criar ficheiro dedicado em `src/db/` (ex: driveSync.js, calendarSync.js)
5. Testar endpoint via curl antes de avancar para frontend

### Fase 3: Frontend
1. Se e tab nova no DetailPanel: criar componente em `src/components/crm/`
2. Se e pagina nova: criar em `src/pages/`
3. Se e alteracao a pagina existente: ler por seccoes (grep funcao)
4. Seguir padroes existentes:
   - Usar `apiFetch()` (nunca fetch directo)
   - Usar `EUR`, `PCT` de `constants.js`
   - Palette: brand gold, neutral backgrounds
   - Responsive: testar mobile
5. Usar Skeleton loader durante loading

### Fase 4: Verificar
1. Build: `npx vite build`
2. Testar no browser (arrancar com `npm run dev`)
3. Testar edge cases (campos vazios, dados inexistentes)

### Fase 5: Entregar
Build, commit e push automatico.

## Quando usar

- Utilizador pede funcionalidade que nao existe
- Nova integracao com servico externo
- Novo modulo ou seccao do CRM

## Quando nao usar

- Para corrigir bugs (usar crm-audit)
- Para redesign visual (usar layout-review)
