-- Reuniões adicionadas manualmente na ficha (investidores/consultores) com
-- relatório PDF anexado. relatorio_path = caminho no bucket privado
-- "Relatorios" (reunioes-manuais/<id>/relatorio.pdf). NULL = reunião Fireflies
-- (PDF gerado na hora a partir da análise).
-- Nota: aplicada também via ALTER ... IF NOT EXISTS em runtime (dev e
-- produção), porque as migrações não são auto-aplicadas em produção.
ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS relatorio_path TEXT;
