-- Sistema de Agenda: disponibilidade manual semana-a-semana por pessoa +
-- catálogo de tarefas recorrentes + tarefas ad-hoc do Kanban, ambas a
-- competir pelo mesmo pool de agendamento. Camada adicional: o Kanban de
-- Operações continua a ser a fonte de verdade do estado da tarefa, esta
-- feature só decide o "quando" (ver Agenda.jsx / agendaRoutes.js).

-- Blocos de disponibilidade: um bloco livre concreto de um dia (não é um
-- padrão recorrente — "copiar semana anterior" é feito por endpoint,
-- reinserindo linhas com data + 7 dias).
CREATE TABLE IF NOT EXISTS disponibilidade_blocos (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data         TEXT NOT NULL,
  hora_inicio  TEXT NOT NULL,
  hora_fim     TEXT NOT NULL,
  created_at   TEXT DEFAULT (NOW()::TEXT),
  updated_at   TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_disponibilidade_user_data ON disponibilidade_blocos(user_id, data);

-- Catálogo de tarefas recorrentes. Instanciar um template = INSERT normal
-- em `tarefas` (via template_id) — não há tabela de "instâncias" separada.
CREATE TABLE IF NOT EXISTS tarefas_templates (
  id                          TEXT PRIMARY KEY,
  titulo                      TEXT NOT NULL,
  categoria                   TEXT,
  duracao_estimada_horas      REAL NOT NULL DEFAULT 1,
  frequencia                  TEXT NOT NULL DEFAULT 'semanal',
  frequencia_intervalo_dias   INT,
  dias_semana                 TEXT,
  prioridade                  TEXT NOT NULL DEFAULT 'media',
  sop_ref                     TEXT,
  user_id_default             TEXT REFERENCES users(id) ON DELETE SET NULL,
  regiao                      TEXT,
  activo                      BOOLEAN NOT NULL DEFAULT true,
  ultima_instancia_gerada_em  TEXT,
  created_at                  TEXT DEFAULT (NOW()::TEXT),
  updated_at                  TEXT DEFAULT (NOW()::TEXT),
  updated_by                  TEXT
);
CREATE INDEX IF NOT EXISTS idx_tarefas_templates_activo ON tarefas_templates(activo);

-- Atribuição tarefa -> bloco de tempo. Tabela própria (não popula
-- tarefas.inicio/fim directamente) porque o motor de agendamento (Fase 2)
-- gera propostas que a pessoa confirma antes de ficarem definitivas — só ao
-- confirmar é que tarefas.inicio/fim é escrito e a tarefa aparece no Kanban
-- e no Google Calendar partilhado.
CREATE TABLE IF NOT EXISTS agendamentos (
  id                        TEXT PRIMARY KEY,
  tarefa_id                 TEXT NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  user_id                   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  disponibilidade_bloco_id  TEXT REFERENCES disponibilidade_blocos(id) ON DELETE SET NULL,
  data                       TEXT NOT NULL,
  hora_inicio                TEXT NOT NULL,
  hora_fim                   TEXT NOT NULL,
  estado                     TEXT NOT NULL DEFAULT 'proposto',
  gerado_em                  TEXT DEFAULT (NOW()::TEXT),
  confirmado_em              TEXT,
  confirmado_por             TEXT,
  created_at                 TEXT DEFAULT (NOW()::TEXT),
  updated_at                 TEXT DEFAULT (NOW()::TEXT)
);
CREATE INDEX IF NOT EXISTS idx_agendamentos_tarefa ON agendamentos(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_user_data ON agendamentos(user_id, data);

-- Extensão de `tarefas`: prioridade + prazo + responsável estruturado +
-- origem (template). `funcionario` (texto livre) mantém-se intocado como
-- fonte de verdade para exibição de tarefas multi-responsável; `user_id`
-- é o campo que o motor de agendamento usa e só é preenchido quando há um
-- responsável único.
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS prioridade  TEXT DEFAULT 'media';
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS data_limite TEXT;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS user_id     TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS template_id TEXT REFERENCES tarefas_templates(id) ON DELETE SET NULL;

-- Backfill: só os registos com um único responsável em `funcionario`
-- mapeiam 1:1 para user_id. Multi-responsável (ex: "João Abreu, Alexandre
-- Mendes") e sem responsável ficam NULL — não entram no motor automático,
-- continuam geridos à mão como hoje.
UPDATE tarefas SET user_id = 'owner'      WHERE funcionario = 'João Abreu';
UPDATE tarefas SET user_id = 'admin-alex' WHERE funcionario = 'Alexandre Mendes';
