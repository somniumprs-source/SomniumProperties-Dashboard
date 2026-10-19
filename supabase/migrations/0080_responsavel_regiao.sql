-- 0080_responsavel_regiao.sql — responsável por região (auditoria D10).
--
-- A responsabilidade é por listas: o dono de um imóvel, consultor ou projeto é
-- o administrador da região dele (src/db/responsavelRegiao.js). João Abreu fica
-- com Coimbra e Alexandre Mendes com o Porto/AMP (confirmado pelo João).

ALTER TABLE users ADD COLUMN IF NOT EXISTS regiao TEXT;
UPDATE users SET regiao = 'Coimbra' WHERE id = 'owner' AND regiao IS DISTINCT FROM 'Coimbra';
UPDATE users SET regiao = 'AMP' WHERE id = 'admin-alex' AND regiao IS DISTINCT FROM 'AMP';
