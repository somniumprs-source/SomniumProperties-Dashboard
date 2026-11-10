-- Análise IA da localização (aba Localização da ficha do imóvel): pontos de
-- interesse do Google Places com a decisão da equipa (validado/excluído) e a
-- análise de pontos fortes e fracos gerada pela fila IA.
-- Também garantida em runtime (ensureColunaAnaliseLocalizacao), porque as
-- migrações não são auto-aplicadas em produção.
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS analise_localizacao_ia JSONB;
