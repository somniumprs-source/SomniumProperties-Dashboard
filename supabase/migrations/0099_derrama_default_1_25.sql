-- Fiscalidade dos negócios: IRC 19% a direito + derrama municipal 1,25% (nov 2026).
ALTER TABLE analises ALTER COLUMN derrama_perc SET DEFAULT 1.25;
UPDATE analises SET derrama_perc = 1.25 WHERE derrama_perc IS DISTINCT FROM 1.25;
