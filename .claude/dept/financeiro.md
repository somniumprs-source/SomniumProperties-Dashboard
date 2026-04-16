# Departamento Financeiro — Contexto

## Entidades

- **Despesas**: movimento, timing, custo_mensal, custo_anual, categoria, notas
- **Negocios (vista financeira)**: lucro_estimado, lucro_real, custo_real_obra, comissao, data_venda
- **Analises**: modelo_negocio (wholesaling, fix_flip, caep, mediacao), ROI, stress tests, cenarios
- **Cashflow**: receitas vs despesas por periodo
- **P&L**: demonstracao de resultados

## Ficheiros chave

| Tarefa | Ficheiros |
|--------|-----------|
| Pagina financeiro (tabs, forms, graficos) | src/pages/Financeiro.jsx |
| Calculadora de rentabilidade | src/db/analiseRoutes.js |
| PDFs financeiros e investidor | src/db/pdfReport.js, src/db/pdfImovelDocs.js |
| CRUD despesas e negocios | src/db/routes.js, src/db/crud.js |

## Ficheiros grandes

| Ficheiro | Linhas | Como ler |
|----------|--------|----------|
| src/pages/Financeiro.jsx | ~1350 | Ler por tab (grep "tab === 'nome'") ou form |
| src/db/pdfImovelDocs.js | ~1000 | Grep gerador especifico (ex: "apresentacao_investidor:") |
| src/db/pdfReport.js | ~300 | Pode ler inteiro |

## Endpoints API

- `/api/crm/despesas` — CRUD despesas (com upload de documentos)
- `/api/crm/negocios` — CRUD negocios (campos financeiros)
- `/api/crm/analises` — Calculadora de rentabilidade (ROI, stress test, CAEP)
- `/api/crm/imoveis/:id/analises` — Analise por imovel
- `/api/financeiro/despesas` — Vista financeira de despesas
- `/api/financeiro/cashflow` — Fluxo de caixa
- `/api/financeiro/pl` — Demonstracao de resultados
- `/api/financeiro/budget` — Orcamento
- `/api/financeiro/rentabilidade` — Analise de rentabilidade
- `/api/financeiro/projecao` — Projecoes financeiras
- `/api/kpis/financeiro` — KPIs do departamento

## PDFs (18 tipos)

Geradores em pdfImovelDocs.js (DocBuilder class):
- ficha_imovel, relatorio_visita, apresentacao_investidor, proposta_investimento
- analise_mercado, relatorio_obra, due_diligence, contrato_parceria
- relatorio_final, comparativo_mercado, plano_investimento, stress_test
- resumo_executivo, carta_intencao, dossier_completo, relatorio_mensal, orcamento_obra, timeline_projeto

## Estado actual (Abril 2026)

- 11 despesas registadas
- 0 deals fechados (pipeline em fase de obras)
- 5 negocios em pipeline
