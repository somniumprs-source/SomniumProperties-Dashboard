-- Marca Pessoal (Marketing › Marca Pessoal): estado e edições das publicações
-- do plano de 6 meses. O conteúdo base vive no frontend
-- (src/constants/marcaPessoal.js); cada linha sobrepõe-se ao conteúdo base com
-- o mesmo id, ou é uma publicação nova (id "mp-<uuid>"). Apagar a linha de uma
-- publicação base repõe o original.
-- Esquema também garantido em runtime (ensureMarcaPessoal), porque as
-- migrações não são auto-aplicadas em produção.

CREATE TABLE IF NOT EXISTS marca_pessoal_posts (
  id TEXT PRIMARY KEY,
  mes INTEGER,
  semana INTEGER,
  ordem INTEGER,
  tipo TEXT,
  pilar TEXT,
  tema TEXT,
  objetivo TEXT,
  formato TEXT,
  canal TEXT,
  guiao TEXT,
  linkedin TEXT,
  instagram TEXT,
  data_prevista TEXT,
  estado TEXT,
  link_publicacao TEXT,
  data_publicacao TEXT,
  notas TEXT,
  arquivado BOOLEAN,
  created_at TEXT DEFAULT (NOW()::TEXT),
  updated_at TEXT DEFAULT (NOW()::TEXT)
);
