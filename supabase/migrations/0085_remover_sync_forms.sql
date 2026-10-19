-- O Google Forms deixou de ser usado: os investidores entram pela landing page
-- (webhook-landing-lead), que já cria o registo e grava o consentimento.
-- Desliga o agendamento do sync e limpa o registo de execução (0081).
-- Investidores e consentimentos vindos do Forms ficam como estão.
DO $$ BEGIN
  PERFORM cron.unschedule('cron-sync-forms');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DELETE FROM cron_execucoes WHERE nome = 'cron-sync-forms';
