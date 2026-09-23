-- Licenças e certificações na Análise Financeira: licenciamento passa a ser o
-- subtotal de 3 linhas (camarárias, certificação ARU, outras). Valores antigos
-- de licenciamento migram para lic_outros (total inalterado).
ALTER TABLE analises ADD COLUMN IF NOT EXISTS lic_camara REAL DEFAULT 0;
ALTER TABLE analises ADD COLUMN IF NOT EXISTS lic_aru REAL DEFAULT 0;
ALTER TABLE analises ADD COLUMN IF NOT EXISTS lic_outros REAL DEFAULT 0;
UPDATE analises SET lic_outros = licenciamento
  WHERE COALESCE(licenciamento, 0) > 0
    AND COALESCE(lic_camara, 0) + COALESCE(lic_aru, 0) + COALESCE(lic_outros, 0) = 0;
