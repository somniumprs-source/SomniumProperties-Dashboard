-- As tarefas das conversas WhatsApp passam a viver na tabela tarefas
-- (Operações > Tarefas, origem_tipo = 'whatsapp', estado inicial "A fazer").
-- A tabela intermédia criada em 0066 deixa de ser usada.
DROP TABLE IF EXISTS tarefas_conversas;
