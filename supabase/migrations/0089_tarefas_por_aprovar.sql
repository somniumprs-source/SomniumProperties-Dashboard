-- Pré-aprovação das tarefas criadas sozinhas (24/10/2026, decisão do João).
-- Tarefa que o sistema cria (mudança de fase no pipeline, contacto marcado ou
-- feito na ficha, follow-up do imóvel, evento do Google Calendar igual a uma
-- tarefa que já existe) fica "Por aprovar": não vai para o Google Calendar nem
-- entra no calendário/lista da Agenda até alguém a aprovar. Rejeitar = apagar.
-- Objetivo: deixar de aparecerem 2/3 tarefas duplicadas.
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS por_aprovar BOOLEAN NOT NULL DEFAULT false;

-- Cópias já existentes: duas sincronizações ao mesmo tempo importaram o mesmo
-- evento duas vezes. A mais recente perde a ligação ao evento e vai para
-- aprovação (nada se apaga aqui).
WITH dup AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY gcal_event_id ORDER BY created_at, id) AS n
  FROM tarefas WHERE gcal_event_id IS NOT NULL
)
UPDATE tarefas t SET gcal_event_id = NULL, por_aprovar = true
FROM dup WHERE dup.id = t.id AND dup.n > 1;

-- Cópias vindas do Google Calendar de uma tarefa do CRM (mesmo título e mesma
-- hora, sem origem): ficam por aprovar para se rejeitarem na Agenda.
UPDATE tarefas c SET por_aprovar = true
WHERE c.origem_tipo IS NULL AND c.status NOT IN ('Concluída', 'Concluida')
  AND EXISTS (
    SELECT 1 FROM tarefas o
    WHERE o.id <> c.id AND o.origem_tipo IS NOT NULL
      AND lower(trim(o.tarefa)) = lower(trim(c.tarefa))
      AND left(o.inicio, 16) = left(c.inicio, 16)
  );

-- Um evento do Google Calendar liga-se a uma só tarefa.
CREATE UNIQUE INDEX IF NOT EXISTS tarefas_gcal_event_id_unico
  ON tarefas (gcal_event_id) WHERE gcal_event_id IS NOT NULL;
