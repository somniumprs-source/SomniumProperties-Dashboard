-- Remove imoveis.check_ouro: selo sem critérios definidos em código, sem uso
-- a jusante (ao contrário de check_qualidade). Confirmado por grep: zero
-- referências fora da definição da coluna após remover UI + queries.
ALTER TABLE imoveis DROP COLUMN IF EXISTS check_ouro;
