-- Fecha à API pública de dados as 17 tabelas que tinham RLS desligada e
-- permissões totais para os papéis anon/authenticated (levantamento da
-- Administração, 19/10/2026). A chave anon vai no código do site, por isso
-- estas tabelas ficavam legíveis e alteráveis por quem a tivesse.
--
-- RLS ligada sem políticas = anon/authenticated não veem nada pela API.
-- O servidor (Edge Functions e Express) liga-se como `postgres`, dono das
-- tabelas e com BYPASSRLS, e não é afetado — igual às outras 49 tabelas,
-- que já estavam assim. O site não lê tabelas diretamente (só usa o
-- Supabase para login).
ALTER TABLE public.agendamentos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consentimentos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultor_documentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultor_gravacoes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_execucoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disponibilidade_blocos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investidor_interacoes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidades_scraper     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos_obra_recebidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parceiro_interacoes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parceiros                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preco_m2_referencia       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reunioes_documentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reunioes_investidor       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistorias_obra            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_last_seen        ENABLE ROW LEVEL SECURITY;
