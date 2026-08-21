-- REF Investidor: numeração sequencial (0001, 0002, ...) que identifica cada
-- investidor, tal como ref_interna já identifica cada imóvel. Ao contrário do
-- ref_interna (sequencial por região), esta é uma sequência única e global —
-- um investidor não pertence a uma única região (regioes_preferidas é
-- multi-valor).
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS ref_investidor TEXT;

-- Backfill: numerar os investidores já existentes, por ordem de criação.
WITH numerados AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS n
  FROM investidores
  WHERE ref_investidor IS NULL
)
UPDATE investidores i
SET ref_investidor = LPAD(numerados.n::text, 4, '0')
FROM numerados
WHERE i.id = numerados.id;
