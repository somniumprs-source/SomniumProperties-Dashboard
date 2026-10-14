-- Lista fixa de imobiliárias de Coimbra (e distrito) para escolher no perfil
-- dos consultores. Alimenta o autocomplete do campo Imobiliárias junto com os
-- valores já usados (GET /consultores/sugestoes-tags). Categoria por região
-- para a AMP poder ter a sua lista sem se misturar.
-- Lista aprovada pelo João (out 2026).
INSERT INTO lookups (categoria, valor, ordem, ativo)
SELECT 'imobiliaria_coimbra', v.valor, v.ordem, true
FROM (VALUES
  ('RE/MAX White', 1),
  ('RE/MAX White II', 2),
  ('RE/MAX Visão', 3),
  ('RE/MAX Vantagem Académica', 4),
  ('RE/MAX Coral', 5),
  ('RE/MAX Best Selection', 6),
  ('RE/MAX Fénix', 7),
  ('RE/MAX White III', 8),
  ('RE/MAX White Farol', 9),
  ('RE/MAX Confiança', 10),
  ('RE/MAX Vantagem Aliança', 11),
  ('ERA Coimbra Universitária', 12),
  ('ERA Coimbra Celas', 13),
  ('ERA Coimbra Mondego', 14),
  ('ERA Figueira da Foz', 15),
  ('ERA Cantanhede / Mira', 16),
  ('KW Union', 17),
  ('Century 21 Nobre', 18),
  ('Century 21 Académica', 19),
  ('Century 21 4You', 20),
  ('Century 21 Realty Art Almedina', 21),
  ('Zome Coimbra', 22),
  ('Lux Properties', 23),
  ('Soluções Ideais', 24),
  ('Idealcasa (Argumentotal)', 25),
  ('Sales 2 Go', 26),
  ('GAHP Real Estate', 27),
  ('Villas Property', 28)
) AS v(valor, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM lookups l WHERE l.categoria = 'imobiliaria_coimbra' AND l.valor = v.valor
);

-- "Kw Union" e "KW Union" eram a mesma agência escrita de duas formas.
UPDATE consultores SET imobiliaria = replace(imobiliaria, '"Kw Union"', '"KW Union"')
WHERE imobiliaria LIKE '%"Kw Union"%';

-- Gralha: "Soluções Ideiais" → "Soluções Ideais" (alinha com a lista fixa).
UPDATE consultores SET imobiliaria = replace(imobiliaria, '"Soluções Ideiais"', '"Soluções Ideais"')
WHERE imobiliaria LIKE '%"Soluções Ideiais"%';
