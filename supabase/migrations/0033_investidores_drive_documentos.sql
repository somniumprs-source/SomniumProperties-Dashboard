-- Documentos do investidor no Google Drive (ver B6 da auditoria): cada
-- investidor passa a ter pasta própria, e os documentos anexados na aba
-- "Documentos do Investidor" passam a ser ficheiros reais em vez de só um
-- registo de tipo/nome/nota sem ficheiro por trás.
ALTER TABLE investidores ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
ALTER TABLE documentos_investidor ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE documentos_investidor ADD COLUMN IF NOT EXISTS drive_file_id TEXT;
