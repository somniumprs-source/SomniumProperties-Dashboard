-- 0082_tarefas_atrasada_calculada.sql — tarefas com regras únicas (auditoria D11).
--
-- «Atrasada» passa a ser calculada a partir do prazo (src/constants/regrasTarefas.js);
-- as tarefas marcadas à mão voltam a «A fazer» e aparecem atrasadas se o prazo
-- já passou. Datas vazias ('') passam a NULL, para o prazo se calcular sempre.

UPDATE tarefas SET status = 'A fazer', updated_at = NOW()::text WHERE status = 'Atrasada';
UPDATE tarefas SET inicio = NULL WHERE inicio = '';
UPDATE tarefas SET fim = NULL WHERE fim = '';
UPDATE tarefas SET data_limite = NULL WHERE data_limite = '';
