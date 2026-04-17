# Departamento Comercial — Contexto

## Entidades

- **Imoveis**: nome, estado, ask_price, zona, origem, modelo_negocio, tipologia, nome_consultor, VVR, custo_estimado_obra, ROI, fotos (JSON), data_adicionado, data_chamada, data_visita
- **Investidores**: nome, status, origem, email, telemovel, classificacao, capital_max, estrategia, tipo_investidor, data_primeiro_contacto, data_ultimo_contacto
- **Consultores**: nome, estatuto, contacto, email, data_follow_up, pontuacao, zona_actuacao
- **Negocios**: movimento, categoria, fase, imovel_id, lucro_estimado, lucro_real, data_venda
- **Empreiteiros**: nome, especialidade, zona, contacto, classificacao

## Ficheiros chave

| Tarefa | Ficheiros |
|--------|-----------|
| Ficha do imovel/investidor/consultor | src/components/crm/DetailPanel.jsx, FicheirosTab.jsx |
| CRM (tabelas, kanban, filtros) | src/pages/CRM.jsx |
| Endpoints API CRM | src/db/routes.js, src/db/crud.js |
| Adicionar campo a entidade | src/db/pg.js (migration), crud.js, routes.js |

## Ficheiros grandes

| Ficheiro | Linhas | Como ler |
|----------|--------|----------|
| src/pages/CRM.jsx | ~1100 | Ler por funcao (grep nome da funcao) |
| src/db/routes.js | ~500 | Grep endpoint especifico |

## Integracoes

- **Google Drive**: pasta automatica por imovel (subpastas Documentos/Fotos/Estudo de Mercado). Ficheiro: src/db/driveSync.js
- **WhatsApp (Twilio)**: agente de follow-up para consultores. Webhook em server.js
- **Fireflies.ai**: transcricoes de reunioes + auto-fill investidores. Ficheiro: src/db/firefliesSync.js

## Endpoints API

- `/api/crm/imoveis` — CRUD imoveis + fotos + drive-files + analises
- `/api/crm/investidores` — CRUD investidores + search + relatorio
- `/api/crm/consultores` — CRUD consultores + interacoes + scoring
- `/api/crm/negocios` — CRUD negocios
- `/api/crm/reunioes` — Gestao de reunioes
- `/api/comercial/*` — Vistas comerciais agregadas
- `/api/kpis/comercial` — KPIs do departamento

## Estado actual (Abril 2026)

- 14 imoveis, 45 investidores, 84 consultores, 5 negocios
- 0 deals fechados (pipeline em fase de obras)
- Data health: 61%
- 113 fotos importadas do Drive para 8 imoveis
