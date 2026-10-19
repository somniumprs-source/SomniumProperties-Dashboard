-- Auditoria D3: o tipo de documento da despesa só existe quando há documento.
-- Sem valor por defeito; as despesas sem anexo deixam de dizer «fatura».
ALTER TABLE despesas ALTER COLUMN tipo_documento DROP DEFAULT;

UPDATE despesas SET tipo_documento = NULL
 WHERE tipo_documento IS NOT NULL
   AND (documentos IS NULL OR documentos IN ('', '[]'));
