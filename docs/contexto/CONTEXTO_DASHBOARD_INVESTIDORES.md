# CONTEXTO COMPLETO — SOMNIUM PROPERTIES DASHBOARD

**Para uso em Claude.ai (ou outro LLM) sem acesso ao código-fonte.**
Objectivo: dar ao modelo todo o contexto necessário para construir apresentações, pitch decks, memorandos ou materiais de comunicação para investidores.

---

## 1. EMPRESA

**Somnium Properties** é uma empresa portuguesa de investimento imobiliário sediada em Coimbra. Opera em quatro linhas de negócio:

1. **Wholesaling** — identificação e revenda de imóveis off-market a investidores, sem reabilitação.
2. **Fix and Flip** — aquisição, reabilitação e revenda de imóveis com mais-valia.
3. **CAEP (Contrato de Associação em Participação)** — captação de capital de investidores particulares, com distribuição de lucro proporcional ao capital alocado.
4. **Mediação Imobiliária** — angariação e venda de imóveis a terceiros mediante comissão.

A empresa actua sobretudo na zona Centro de Portugal e tem uma rede de consultores/mediadores que alimentam o pipeline de oportunidades. CFO: Alexandre Mendes.

---

## 2. O QUE É A DASHBOARD

A **Somnium Properties Dashboard** é a plataforma operacional interna que centraliza toda a actividade da empresa: pipeline comercial, análise financeira, execução de obras, gestão de investidores e reporting. Foi construída internamente e substitui o uso disperso de folhas de cálculo, Notion e ferramentas avulsas.

A dashboard suporta o ciclo completo: identificação de imóvel → análise de rentabilidade → captação de investidores → execução da obra → venda → distribuição de lucro → reporting.

### Princípios da plataforma

- **Single source of truth** para imóveis, investidores, consultores, negócios e despesas.
- **Cálculo automático** de ROI, TIR, cash-on-cash, impostos (IMT, IS, IRC, IRS, IVA, Derrama) com base nas tabelas fiscais OE 2026.
- **Stress tests** automáticos a cada análise (variações de VVR, custo de obra e prazos).
- **Portal público para investidores** com acesso via token, sem necessidade de login.
- **Automação de follow-up** com consultores via WhatsApp e email.
- **Geração automática de PDFs** com análises, fotos e fichas de projecto.
- **Integrações** com Notion, Google Drive, Gmail, Supabase, Fireflies, Twilio.

---

## 3. ARQUITECTURA E STACK TÉCNICO

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite 5 + Tailwind CSS + Recharts + Lucide Icons |
| Backend | Node.js 18+ com Express 5 (~5.700 linhas de lógica de servidor) |
| Base de dados | PostgreSQL (Supabase) em produção, SQLite local em dev |
| Autenticação | Supabase JWT |
| Deploy | Render (auto-deploy do branch main) |
| Storage | Supabase Storage para PDFs e ficheiros |
| Cron | node-cron para tarefas periódicas |

**Escala do código**: 13 páginas React, 41 componentes, motor de cálculo dedicado (calcEngine ~520 linhas), gerador de PDF (~3.500 linhas) e backend com mais de 5.700 linhas. Branding gold (#C9A84C) sobre fundo escuro (#0d0d0d).

---

## 4. PÁGINAS E MÓDULOS

A dashboard tem 11 áreas principais (10 internas + 1 portal público):

| Página | Função |
|---|---|
| **Dashboard** | KPIs em tempo real (receita, lucro, pipeline, alertas). Atualização a cada 30s. |
| **CRM** | Gestão de imóveis e consultores. Pipeline com 7 estados (Adicionado → Negócio). Filtros por estado, zona, modelo. |
| **Projectos** | Vista kanban/lista de negócios. Para Fix and Flip, mostra fases de obra com progresso visual. |
| **Projecto (detalhe)** | Ficha completa do projecto: análise ROI/TIR, fases, tarefas, fotos, documentos partilhados. |
| **Financeiro** | Despesas recorrentes e únicas, faturação, orçamentos de obra, comparação estimado vs. real. |
| **Operações** | Tarefas por fase de obra, alertas de atraso, status de documentos (licenças, certificados, escrituras). |
| **Métricas** | Indicadores executivos: ROI médio, TIR, lucro por deal, taxa de reinvestimento, analytics por zona e consultor. |
| **Alertas** | Notificações críticas: deals bloqueados, atrasos, follow-ups pendentes. |
| **Relatórios** | Geração e envio automático de relatórios semanais. |
| **Utilizadores** | Gestão de acessos por departamento (Comercial, Financeiro, Administrativo). |
| **Portal Investidor (público)** | `/investidor/projeto/:token` — vista filtrada de um projecto com fotos, fases e projecção de retorno. Sem login. |

---

## 5. MODELO DE DADOS

Doze tabelas principais. Visão simplificada:

### 5.1. Pipeline comercial

- **imoveis** — Oportunidade em pipeline. Estado (Adicionado, Chamada, Visita, Estudo Mercado, Proposta, Aceite, Negócio, Descartado), tipologia, ask price, valor de proposta, custo de obra estimado, VVR (valor de venda remodelado), ROI estimado, zona, origem (consultor/lead/off-market), notas (forças, fraquezas, riscos), fotografias.
- **consultores** — Rede de mediadores/distribuidores. Estatuto (Cold Call → Activo), classificação A-D, áreas de cobertura, contacto, meta mensal de leads, comissão, lucro gerado, histórico de contactos.
- **investidores** — Perfil de investidor. Estatuto, classificação A-D, capital mínimo/máximo, montante já investido, nº de negócios, estratégia, perfil de risco, ROI/TIR históricos, datas de reunião e follow-up.

### 5.2. Execução

- **negocios** — Deal/operação. Categoria (Wholesalling, CAEP, Mediação, Fix and Flip), fase (Aquisição → Vendido), lucro estimado vs. realizado, capital total, nº de investidores, quota Somnium, ligação ao imóvel.
- **projeto_fases** — Fases de obra (Fix and Flip). 8 fases padronizadas: Aquisição, Projecto & Licença, Demolições, Estrutura & Especialidades, Acabamentos, Exterior & Fecho, Comercialização, Vendido. Cada fase tem estado, % de execução, datas previstas/reais, orçamento alocado vs. custo real, responsável.
- **projeto_tarefas** — Checklist dentro de cada fase.
- **projeto_fotos** — Documentação visual (antes/durante/depois).

### 5.3. Suporte

- **despesas** — Custos da empresa (mensais, anuais, únicos) por categoria.
- **tarefas** — Tarefas gerais (não ligadas a obra).
- **documentos_investidor** — Histórico de documentos enviados a cada investidor.
- **audit_log** — Registo de alterações para auditoria.
- **sync_state** — Estado de sincronização com integrações externas (Notion, Drive, etc).

---

## 6. MOTOR DE ANÁLISE DE RENTABILIDADE

O motor de cálculo (`calcEngine.js`) é o coração analítico da dashboard. Recebe os inputs de um deal e devolve a análise financeira completa.

### Inputs

- Preço de compra, custo de obra, VVR.
- Estrutura de capital (próprio vs. financiamento bancário, taxa de juro, prazo).
- Regime fiscal (Empresa ou Particular — Categoria G/B).
- Prazos de cada fase.

### Outputs

- ROI total e anualizado.
- TIR (Taxa Interna de Rentabilidade).
- Cash-on-Cash.
- Break-even VVR (preço mínimo de venda para zerar).
- Lucro bruto e líquido.
- Distribuição CAEP (quanto recebe cada investidor proporcionalmente ao capital).

### Tabelas fiscais OE 2026 incluídas

- IMT (Imposto Municipal sobre Transmissões) por escalão.
- Imposto de Selo.
- IRC (regime PME e geral).
- IRS Categoria G (mais-valias particulares) e Categoria B (actividade empresarial).
- IVA aplicável a obras (taxa reduzida, intermédia, normal).
- Derrama Municipal.

### Stress tests automáticos

Cada análise corre cenários:
- VVR ±10% e ±20% (downside e upside).
- Custo de obra ±10% e ±20%.
- Prazos ±2 a 6 meses.

Devolve um **veredicto** (resiliente, neutro, em risco) e identifica quais variáveis matam o deal.

---

## 7. FLUXOS DE NEGÓCIO

### 7.1. Captação de oportunidade

1. Consultor ou lead reporta imóvel → adicionado em CRM.
2. Chamada para reunir dados → visita agendada.
3. Estudo de mercado e análise de rentabilidade (motor de cálculo).
4. Decisão: descartar, propor ou aguardar.
5. Se aprovado: proposta enviada → aceite → cria-se um **Negócio**.

### 7.2. Captação de capital (CAEP)

1. Investidor com perfil compatível é abordado.
2. Apresentação do deal (PDF gerado automaticamente com análise, fotos e cenários).
3. Aceitação → contrato CAEP assinado → capital depositado.
4. Cálculo automático de quotas: Somnium fica com X%, investidores recebem proporcionalmente ao capital alocado.

### 7.3. Execução de obra (Fix and Flip)

1. Negócio passa a estado "Em execução".
2. Sistema cria automaticamente as 8 fases padrão com tarefas-tipo.
3. Equipa actualiza estado, custos reais, fotos.
4. Alertas automáticos para atrasos ou desvios orçamentais.
5. Investidor consulta progresso no portal público (token partilhado).

### 7.4. Venda e distribuição

1. Imóvel vai para fase "Comercialização" — fotos finais, anúncios.
2. Venda → fase "Vendido" → cálculo do lucro real.
3. Distribuição automática conforme quotas CAEP.
4. Geração de documento final para cada investidor com retorno real vs. projectado.

---

## 8. AUTOMAÇÕES E INTEGRAÇÕES

| Sistema | Função |
|---|---|
| **Notion** | Sincronização bidirecional de imóveis, investidores, consultores, negócios, despesas. |
| **Google Drive** | Criação automática de pastas por imóvel, upload de documentos. |
| **Gmail** | Organização e labeling automático de emails relacionados com cada deal. |
| **Google Calendar** | Sincronização de reuniões, visitas e follow-ups. |
| **Supabase Storage** | Armazenamento de PDFs gerados e ficheiros do utilizador. |
| **Twilio / WhatsApp** | Envio de mensagens automáticas de follow-up a consultores. |
| **Fireflies** | Transcrição automática de reuniões. |
| **Anthropic Claude API** | Análise assistida de imóveis e geração de conteúdo. |

### Cron jobs activos

- **Diário 08:00** — Follow-up automático a consultores com base na classificação A-D e dias desde último contacto.
- **Semanal** — Campanha de reactivação a consultores inactivos.
- **Segunda-feira 09:00** — Relatório semanal automático por email a stakeholders.
- **Periódico** — Sincronização com Notion, Drive, Gmail, Fireflies.

---

## 9. KPIs RASTREADOS EM TEMPO REAL

### Financeiros

- Receita total e por linha de negócio (Wholesaling, Fix and Flip, CAEP, Mediação).
- Lucro total e médio por deal.
- ROI médio, TIR média, Cash-on-Cash médio.
- Capital total investido e por investidor.
- Lucro real vs. estimado (delta %).
- Despesas mensais/anuais vs. orçamento.

### Comerciais

- Pipeline por estado (quantos imóveis em cada fase).
- Taxa de conversão (propostas vs. aceites).
- Distribuição por zona, tipologia e modelo de negócio.
- Performance de consultores: lucro gerado, % de meta, comissões pagas.

### Operacionais

- Tarefas por status (a fazer / em curso / concluído).
- Taxa de cumprimento de deadlines.
- Nº de alertas críticos abertos.
- Dias médios por fase de obra.

### Investidores

- Nº de investidores activos por classificação.
- Taxa de reinvestimento (% com mais de um deal).
- Capital total sob gestão.
- ROI médio entregue por investidor.

---

## 10. PORTAL DO INVESTIDOR

O portal público (`/investidor/projeto/:token`) é uma vista filtrada e read-only de um projecto específico, acessível sem login através de um token único partilhado.

### O que mostra

- Identificação do projecto e localização.
- Fotos do progresso (antes / durante / depois).
- Fases de obra concluídas e em curso, com % de execução.
- Projecção de retorno (ROI/TIR estimados).
- Datas-chave (início, conclusão prevista, venda prevista).

### O que esconde

- Dados internos de custo real (configurável).
- Margens internas e quotas Somnium.
- Outros investidores ou deals.

### Tracking

- Visitas ao portal são registadas.
- Tokens podem ter validade configurável.

---

## 11. RESUMO EXECUTIVO (PARA PITCH)

A Somnium Properties opera com **infraestrutura tecnológica própria** que diferencia a empresa de concorrentes que ainda dependem de folhas de cálculo. A dashboard:

1. **Reduz tempo de análise** de um deal de horas para minutos, com cálculo automático e stress tests integrados.
2. **Profissionaliza a relação com investidores** através de um portal dedicado com transparência selectiva.
3. **Garante rastreabilidade total** de cada euro investido, fase de obra e decisão.
4. **Escala operacionalmente** — automatização de follow-ups, sincronização entre sistemas e geração de documentação eliminam trabalho manual repetitivo.
5. **Suporta o modelo CAEP** com cálculo automático de distribuição, transparência total e geração de documentação contratual.
6. **Integra fiscalidade portuguesa actualizada** (OE 2026), garantindo que as projecções reflectem o quadro fiscal real.

Esta infraestrutura permite à Somnium gerir simultaneamente múltiplos projectos, dezenas de investidores e uma rede ampla de consultores, com a mesma equipa que outras empresas precisariam de duplicar.

---

## 12. INSTRUÇÕES PARA O LLM

Quando lhe for pedido para preparar apresentações, pitches, memorandos ou comunicação para investidores:

- **Tom**: profissional, directo, formal. PT-PT. Sem emojis. Sem travessões longos.
- **Foco**: rentabilidade, controlo de risco, transparência, escalabilidade.
- **Evitar**: linguagem de startup hype, superlativos vazios, promessas de retorno garantido.
- **Sempre incluir**: dados quantitativos (ROI, TIR, capital sob gestão, pipeline) quando disponíveis.
- **Quando faltarem dados específicos**: pedir ao Alexandre antes de inventar números.
- **Estrutura típica de pitch**: Problema → Solução → Tracção → Modelo de negócio → Equipa → Pedido de capital → Retorno esperado.
- **Diferenciadores a destacar**: motor de análise próprio, fiscalidade integrada, portal de investidor, automação de operação, modelo CAEP estruturado.

---

*Documento gerado a partir da estrutura real da dashboard. Última actualização: 2026-05-18.*
