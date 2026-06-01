-- 0016_investidores_roi_anualizado_pretendido.sql
-- Acrescenta campo ROI Anualizado Pretendido (TEXT enum) a investidores,
-- complementando o roi_pretendido existente que passa a representar o ROI Total.
-- Para Investidores Ativos os intervalos passam a estender-se ate >50% (gerido no UI).

ALTER TABLE investidores ADD COLUMN IF NOT EXISTS roi_anualizado_pretendido TEXT;
