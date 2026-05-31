-- Tarefas: coluna regiao opcional.
-- Só é preenchida em tarefas cuja categoria é geograficamente situada
-- (Cold Call, Visita, Visita a Obra, Pesquisa de Imóveis, Estudo de Mercado,
-- Follow Up/Contacto Consultores, Análise de Negócio, Proposta, Negociações,
-- Apresentação de Negócios, Networking/Eventos).
-- Tarefas de investidores, equipa, gestão financeira e similares ficam com NULL
-- e devem aparecer independentemente da região seleccionada.

ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS regiao TEXT NULL;
