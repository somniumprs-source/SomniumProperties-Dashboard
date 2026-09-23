-- 0061 — Limpeza de tarefas automáticas (23/09/2026)
--
-- 1. Desliga o cron 'cron-gerar-agenda-semanal' (Domingo 20h), que gerava
--    em massa as recorrentes do catálogo + cadeias Pesquisa/Cold Call por
--    imóvel. NA GAVETA para possível implementação futura: o código fica
--    (Edge Function cron-gerar-agenda-semanal, runGerarAgendaSemanal em
--    _shared/cronJobs.ts). Para reactivar, reaplicar 0041. O botão manual
--    "Actualizar fila" da Agenda continua a funcionar.
--
-- 2. Remove as tarefas criadas a partir de ocorrências de eventos
--    recorrentes do Google Calendar (id "<serie>_<data>"). O pull deixou de
--    importar recorrentes (calendarSync: event.recurringEventId → skip).
--
-- 3. Região em tarefas: só faz sentido em tarefas ligadas a um imóvel
--    (herdam a região do imóvel) ou visitas/obras. As restantes perdem o
--    'Coimbra' que o backfill do initSchema (src/db/pg.js) lhes punha.

select cron.unschedule('cron-gerar-agenda-semanal')
where exists (select 1 from cron.job where jobname = 'cron-gerar-agenda-semanal');

delete from tarefas
where gcal_event_id ~ '_\d{8}(T\d{6}Z)?$'
  and status not in ('Concluída', 'Concluida');

update tarefas t set regiao = i.regiao
from imoveis i
where t.origem_tipo = 'imovel' and t.origem_id = i.id
  and t.regiao is distinct from i.regiao;

update tarefas set regiao = 'AMP'
where origem_tipo is null and tarefa ilike '%Avintes%';

update tarefas set regiao = null
where origem_tipo is null and regiao = 'Coimbra'
  and not (
    template_id is null and (
      categoria in ('Visita', 'Visita a Obra')
      or tarefa ilike 'visita%'
      or tarefa ilike '%obra%'
    )
  );
