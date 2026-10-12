-- Link do perfil público do consultor (página na agência, Idealista, LinkedIn…),
-- para os relatórios de consultores parceiros terem a fonte à mão.
-- Nota: aplicada também via ALTER ... IF NOT EXISTS em runtime (dev e
-- produção), porque as migrações não são auto-aplicadas em produção.
ALTER TABLE consultores ADD COLUMN IF NOT EXISTS link_perfil TEXT;
