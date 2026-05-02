-- ============================================================
-- Migration 001 — Ficha do Imóvel
-- Adiciona campos de caracterização documental + tabelas auxiliares
-- ============================================================

-- 1. Novos campos em `imoveis` (caracterização documental)
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS freguesia text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS concelho text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS distrito text DEFAULT 'Coimbra';
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS coordenadas_lat real;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS coordenadas_lng real;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS artigo_matricial text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS descricao_predial text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS fracao text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS cru text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS ano_construcao integer;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS licenca_utilizacao text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS certificado_energetico text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS numero_ce text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS andar text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS numero_pisos_predio integer;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS predio_tipo text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS tem_elevador text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS condominio_mensal_anunciado real;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS imi_anual real;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS vpt real;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS regime_propriedade text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS onus_registados text[];
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS proprietario_nome text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS proprietario_nif text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS proprietario_contacto text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS motivo_venda_declarado text;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS data_anuncio date;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS tempo_no_mercado_dias integer;
ALTER TABLE imoveis ADD COLUMN IF NOT EXISTS ref_interna text;

-- 2. Tabela `lookups` para dropdowns editáveis
CREATE TABLE IF NOT EXISTS lookups (
  id serial PRIMARY KEY,
  categoria text NOT NULL,
  valor text NOT NULL,
  ordem int DEFAULT 0,
  ativo bool DEFAULT true,
  UNIQUE(categoria, valor)
);
CREATE INDEX IF NOT EXISTS idx_lookups_categoria ON lookups(categoria) WHERE ativo = true;

-- 3. Tabela `documentos_imovel` — persistência dos PDFs gerados
CREATE TABLE IF NOT EXISTS documentos_imovel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imovel_id text NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  tipo text NOT NULL,                 -- ficha | ficha_visita | relatorio_visita | analise_negocio | proposta_proprietario | dossier_projeto | resumo_negociacao | resumo_followup
  version int NOT NULL DEFAULT 1,
  pdf_path text NOT NULL,             -- /uploads/documentos/{imovel_id}/{tipo}_v{N}.pdf
  pdf_size_bytes bigint,
  frozen bool DEFAULT false,          -- true = imutável (versões históricas)
  trigger_event text,                 -- estado que despoletou (ex: 'imovel.created', 'estado:Estudo de VVR')
  generated_by text DEFAULT 'system',
  generated_at timestamptz DEFAULT now(),
  snapshot_data jsonb,                -- snapshot dos dados no momento da geração
  UNIQUE(imovel_id, tipo, version)
);
CREATE INDEX IF NOT EXISTS idx_doc_imovel ON documentos_imovel(imovel_id, tipo, version DESC);

-- 4. Popular lookups
INSERT INTO lookups (categoria, valor, ordem) VALUES
  ('cru','Habitação',1),('cru','Comércio',2),('cru','Serviços',3),('cru','Misto',4),('cru','Outro',5),
  ('certificado_energetico','A+',1),('certificado_energetico','A',2),('certificado_energetico','B',3),('certificado_energetico','B−',4),
  ('certificado_energetico','C',5),('certificado_energetico','D',6),('certificado_energetico','E',7),('certificado_energetico','F',8),
  ('certificado_energetico','Em emissão',9),('certificado_energetico','Não tem',10),('certificado_energetico','A obter',11),
  ('andar','Sub-cave',1),('andar','Cave',2),('andar','R/c',3),('andar','1º',4),('andar','2º',5),('andar','3º',6),
  ('andar','4º',7),('andar','5º',8),('andar','6º+',9),('andar','Sótão',10),('andar','Duplex',11),('andar','Triplex',12),
  ('predio_tipo','Edifício multifamiliar',1),('predio_tipo','Moradia',2),('predio_tipo','Edifício comercial',3),('predio_tipo','Misto',4),
  ('tem_elevador','Sim',1),('tem_elevador','Não',2),('tem_elevador','N/A (R/c)',3),
  ('regime_propriedade','Propriedade horizontal',1),('regime_propriedade','Propriedade total',2),('regime_propriedade','Compropriedade',3),
  ('onus_registados','Sem ónus',1),('onus_registados','Hipoteca',2),('onus_registados','Penhora',3),('onus_registados','Usufruto',4),
  ('onus_registados','Servidão',5),('onus_registados','Arrendamento ativo',6),('onus_registados','A confirmar',7),
  ('origem','Referência',1),('origem','Idealista',2),('origem','Imovirtual',3),('origem','OLX',4),('origem','Casa SAPO',5),
  ('origem','Custojusto',6),('origem','Mediadora',7),('origem','Contacto direto',8),('origem','Leilão',9),('origem','Banca',10),
  ('origem','Email frio',11),('origem','Networking',12),('origem','Outro',13),
  ('tipo_oportunidade','Off-Market',1),('tipo_oportunidade','Market',2),('tipo_oportunidade','Pré-mercado',3),
  ('tipo_oportunidade','Distressed',4),('tipo_oportunidade','Reabilitação',5),('tipo_oportunidade','Devoluto',6),('tipo_oportunidade','Herança',7),
  ('modelo_negocio','CAEP',1),('modelo_negocio','Direto',2),('modelo_negocio','Joint Venture',3),('modelo_negocio','Mediação',4),
  ('modelo_negocio','Permuta',5),('modelo_negocio','Buy-to-Let',6),('modelo_negocio','Buy-to-Sell',7),
  ('motivo_venda','Mudança',1),('motivo_venda','Investimento',2),('motivo_venda','Herança',3),('motivo_venda','Divórcio',4),
  ('motivo_venda','Necessidade financeira',5),('motivo_venda','Outro',6),
  ('habitabilidade','Pronto a habitar',1),('habitabilidade','Bom estado',2),('habitabilidade','Pequenas obras',3),
  ('habitabilidade','Remodelação parcial',4),('habitabilidade','Remodelação total',5),('habitabilidade','Reabilitação profunda',6),('habitabilidade','Devoluto/Ruína',7),
  ('ocupacao','Devoluto',1),('ocupacao','Ocupado pelo proprietário',2),('ocupacao','Arrendado (com contrato)',3),
  ('ocupacao','Arrendado (renda antiga)',4),('ocupacao','Cedido',5),('ocupacao','Ocupação ilegal',6)
ON CONFLICT (categoria, valor) DO NOTHING;
