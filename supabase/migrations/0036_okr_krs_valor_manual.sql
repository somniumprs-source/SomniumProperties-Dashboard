-- KR com fonte "Manual": a opção já existia na lista de fontes (id: null,
-- "Manual — introduzir valor à mão"), mas não havia nenhuma coluna para
-- guardar esse valor — qualquer KR manual ficava preso a 0% para sempre.
ALTER TABLE okr_krs ADD COLUMN IF NOT EXISTS valor_manual REAL;
