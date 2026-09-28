-- Tarefas de projeto com checklist e tarefas opcionais (blocos ativados).
--   checklist: { por_investidor, itens: [{k, t, slot, obrigatoria}], estado: {chave: {feito, por, em, nota}} }
--   opcional:  a tarefa vem de um bloco que só se usa quando é necessário
--   ativa:     tarefas opcionais começam desativadas e não contam para a % da fase
ALTER TABLE projeto_tarefas ADD COLUMN IF NOT EXISTS checklist JSONB;
ALTER TABLE projeto_tarefas ADD COLUMN IF NOT EXISTS opcional BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projeto_tarefas ADD COLUMN IF NOT EXISTS ativa BOOLEAN NOT NULL DEFAULT true;
