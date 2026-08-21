-- Fase 2 do Sistema de Agenda: motor de agendamento. `origem_tipo`/
-- `origem_id`/`origem_campo` ligam uma tarefa "sintética" à entidade e ao
-- campo de data que a gerou (ex: consultores.data_proximo_follow_up), para
-- o motor nunca duplicar ao correr "gerar-semana" outra vez sobre a mesma
-- entidade. NULL nos três = tarefa normal (Kanban/catálogo), como hoje.
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_tipo TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_id TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS origem_campo TEXT;
CREATE INDEX IF NOT EXISTS idx_tarefas_origem ON tarefas(origem_tipo, origem_id, origem_campo);
