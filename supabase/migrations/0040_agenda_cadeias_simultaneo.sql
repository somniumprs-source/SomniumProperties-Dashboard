-- Fase 2 (revisão): tarefas com dependências reais entre si.
--  - `simultaneo`: tarefa que exige os dois membros da equipa no mesmo
--    bloco ao mesmo tempo (ex: Revisão de Obras em Curso, com o sócio).
--    Propagado de tarefas_templates para tarefas ao instanciar.
-- A cadeia Pesquisa->Cold Call->Estudo de Mercado não precisa de coluna
-- nova: usa origem_tipo='imovel' + origem_campo específico
-- ('cadeia_pesquisa'/'cadeia_cold_call'/'estudo_mercado_vvr') já
-- suportado pelo schema da migration 0039.
ALTER TABLE tarefas_templates ADD COLUMN IF NOT EXISTS simultaneo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS simultaneo BOOLEAN NOT NULL DEFAULT false;
