-- Cold Call (SOP 2): dois passos novos do guiao (confirmar disponibilidade do
-- imovel e pedir documentacao base - caderneta predial e planta - antes da
-- pergunta de qualificacao) passam a ter campo proprio no registo manual,
-- mesmo padrao dos restantes campos cc_*.
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cc_disponibilidade TEXT;
  -- 'sim' | 'nao_vendido_reservado'
ALTER TABLE consultor_gravacoes ADD COLUMN IF NOT EXISTS cc_documentacao TEXT;
  -- 'enviada_na_hora' | 'prometida_com_prazo' | 'nao_pedida'
