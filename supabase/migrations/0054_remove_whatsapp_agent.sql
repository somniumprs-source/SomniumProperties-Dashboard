-- Remove artefactos do agente WhatsApp descontinuado (respostas automáticas
-- a consultores via Twilio). Confirmado por grep: zero referências a estas
-- colunas/tabela fora do agente removido (webhook-whatsapp, whatsappAgent.ts,
-- WhatsAppTab.jsx, cron de follow-up automático).
DROP TABLE IF EXISTS whatsapp_last_seen;
ALTER TABLE consultores DROP COLUMN IF EXISTS canal_followup;
ALTER TABLE consultores DROP COLUMN IF EXISTS controlo_manual;
