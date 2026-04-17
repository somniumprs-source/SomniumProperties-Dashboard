# crm-audit

Testa o CRM completo em dois niveis: tecnico (API + edge cases) e operacional (como utilizador real). Corrige todos os bugs encontrados.

## Pre-requisito

Antes de executar, ler `.claude/dept/comercial.md` para contexto do departamento comercial.

## Instrucoes

### Fase 1: Arrancar servidor
1. Arrancar o servidor com `npm run dev` ou `node server.js`
2. Esperar que fique pronto (4-5 segundos)

### Fase 2: Teste tecnico (API)
Testar TODOS os endpoints CRUD para cada entidade:
- Despesas: criar, editar, editar com campos vazios, apagar, search, listar
- Negocios: criar, editar, apagar
- Imoveis: criar, editar, mudar estado (kanban), ficha completa, PDF, Drive files
- Investidores: criar, editar, ficha completa, search
- Consultores: criar, editar, ficha completa, interacoes
- Tarefas: criar, editar, apagar
- OKRs: criar, editar, criar KR, apagar

Testar edge cases:
- Campos vazios em numeros
- SQL injection payloads
- IDs invalidos (GET, PUT, DELETE)
- JSON malformado
- Concorrencia (5 updates simultaneos)

### Fase 3: Teste operacional (como utilizador)
Simular ciclo de vida completo:
1. Lifecycle imovel: Adicionar -> Visita -> Analise -> Proposta -> Venda
2. Lifecycle investidor: Lead -> Call -> Classificar -> NDA -> Parceria
3. Criar negocio ligado ao imovel e investidor
4. Fechar venda e verificar KPIs
5. Criar/editar despesas
6. Verificar alertas, data health, weekly pulse, metricas

Perfis a testar (escolher pelo menos 1):
- **Gestor**: foco em KPIs, pipeline, alertas
- **Investidor**: foco em ROI, documentos, fichas
- **Funcionario**: foco em CRUD, formularios, botoes

### Fase 4: Corrigir
Para cada erro encontrado:
1. Diagnosticar a causa raiz
2. Corrigir no codigo
3. Re-testar que o fix funciona

### Fase 5: Relatorio
Gerar tabela com:
- Total testes: X passed, Y failed
- Lista de bugs encontrados e corrigidos
- Bugs que precisam de decisao do utilizador

Limpar dados de teste. Build, commit e push.

## Quando usar

- Apos sessao de desenvolvimento com muitas alteracoes
- Antes de deploy importante
- Quando o utilizador reporta que "algo nao funciona"

## Quando nao usar

- Para redesign visual (usar /geral/layout-review)
- Para melhorar PDFs (usar /financeiro/pdf-upgrade)
