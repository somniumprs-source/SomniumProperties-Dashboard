// Motor de agendamento — Fase 2 do Sistema de Agenda (revisão 21/08/2026:
// cadeia de angariação, gatilho por estado do imóvel, tarefas simultâneas).
// Porta 1:1 de src/db/agendaEngine.js (Node -> Deno). Ver esse ficheiro
// para os comentários completos de desenho.
import pool from "./pg.ts";

const ROLES_EQUIPA = ["admin", "comercial", "financeiro", "operacoes"];
const GAP_MAX_CADEIA_MIN = 60;
const PRAZO_ESTUDO_MERCADO_DIAS = 2;
// Datas de "próxima acção" já preenchidas ANTES desta data de corte não
// geram tarefa — só contam a partir daqui (ver agendaEngine.js).
const DATA_CORTE_ORIGEM = "2026-08-21T21:41:15.000Z";

const ORIGEM_CAMPOS = [
  { tabela: "consultores", campo: "data_proximo_follow_up", origemTipo: "consultor", categoria: "Follow Up Consultores", duracaoHoras: 0.5, tituloPrefix: "Follow-up", historico: false },
  { tabela: "investidores", campo: "data_proxima_acao", origemTipo: "investidor", categoria: "Follow Up Investidores", duracaoHoras: 0.5, tituloPrefix: "Próxima ação", historico: true },
  { tabela: "imoveis", campo: "data_visita", origemTipo: "imovel", categoria: "Visita", duracaoHoras: 1.5, tituloPrefix: "Visita", historico: false },
  { tabela: "imoveis", campo: "data_proposta", origemTipo: "imovel", categoria: "Proposta", duracaoHoras: 1, tituloPrefix: "Proposta", historico: true },
  { tabela: "imoveis", campo: "data_follow_up", origemTipo: "imovel", categoria: "Follow Up Consultores", duracaoHoras: 0.5, tituloPrefix: "Follow-up imóvel", historico: true },
];

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDias(dataISO: string, n: number): string {
  const d = new Date(dataISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function resolverResponsavelPorHistorico(tabela: string, entidadeId: string, campo: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT user_nome FROM historico_alteracoes
     WHERE entidade = $1 AND entidade_id = $2
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(alteracoes) e WHERE e->>'campo' = $3)
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [tabela, entidadeId, campo],
  );
  const nome = rows[0]?.user_nome;
  if (!nome) return null;
  const { rows: users } = await pool.query("SELECT id FROM users WHERE nome = $1 LIMIT 1", [nome]);
  return users[0]?.id || null;
}

export async function gerarCadeiasAngariacao() {
  const { rows: imoveis } = await pool.query(
    `SELECT id, nome FROM imoveis i
     WHERE NOT EXISTS (
       SELECT 1 FROM tarefas t WHERE t.origem_tipo = 'imovel' AND t.origem_id = i.id AND t.origem_campo = 'cadeia_pesquisa'
     )`,
  );
  let criadas = 0;
  for (const im of imoveis) {
    const idPesquisa = crypto.randomUUID();
    const idColdCall = crypto.randomUUID();
    await pool.query(
      `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, user_id, tempo_horas, origem_tipo, origem_id, origem_campo)
       VALUES ($1,$2,'Pesquisa de Imóveis','A fazer','alta',NULL,1,'imovel',$3,'cadeia_pesquisa')`,
      [idPesquisa, `Pesquisa de Imóveis — ${im.nome}`, im.id],
    );
    await pool.query(
      `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, user_id, tempo_horas, origem_tipo, origem_id, origem_campo)
       VALUES ($1,$2,'Cold Call','A fazer','alta',NULL,1,'imovel',$3,'cadeia_cold_call')`,
      [idColdCall, `Cold Call — ${im.nome}`, im.id],
    );
    criadas += 2;
  }
  return { criadas };
}

export async function gerarEstudoDeMercado() {
  const { rows: imoveis } = await pool.query(
    `SELECT id, nome, data_chamada, created_at FROM imoveis i
     WHERE estado = 'Estudo de VVR'
       AND NOT EXISTS (
         SELECT 1 FROM tarefas t WHERE t.origem_tipo = 'imovel' AND t.origem_id = i.id AND t.origem_campo = 'estudo_mercado_vvr'
       )`,
  );
  let criadas = 0;
  for (const im of imoveis) {
    const ancora = String(im.data_chamada || im.created_at || hojeISO()).slice(0, 10);
    const dataLimite = addDias(ancora, PRAZO_ESTUDO_MERCADO_DIAS);
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, data_limite, user_id, tempo_horas, origem_tipo, origem_id, origem_campo)
       VALUES ($1,$2,'Estudo de Mercado','A fazer','alta',$3,NULL,1.5,'imovel',$4,'estudo_mercado_vvr')`,
      [id, `Estudo de Mercado — ${im.nome}`, dataLimite, im.id],
    );
    criadas++;
  }
  return { criadas };
}

export async function gerarTarefasSinteticas() {
  const hoje = hojeISO();
  let criadas = 0;
  let actualizadas = 0;

  for (const cfg of ORIGEM_CAMPOS) {
    const { rows: entidades } = await pool.query(
      `SELECT id, nome, ${cfg.campo} AS data_valor FROM ${cfg.tabela}
       WHERE ${cfg.campo} IS NOT NULL AND ${cfg.campo} >= $1 AND updated_at >= $2`,
      [hoje, DATA_CORTE_ORIGEM],
    );
    for (const ent of entidades) {
      const dataValor = String(ent.data_valor).slice(0, 10);
      const { rows: existentes } = await pool.query(
        `SELECT id, data_limite FROM tarefas
         WHERE origem_tipo = $1 AND origem_id = $2 AND origem_campo = $3 AND status != 'Concluída'`,
        [cfg.origemTipo, ent.id, cfg.campo],
      );
      if (existentes.length) {
        const existente = existentes[0];
        if (existente.data_limite !== dataValor) {
          await pool.query(
            `UPDATE tarefas SET data_limite = $1, inicio = NULL, fim = NULL, updated_at = NOW() WHERE id = $2`,
            [dataValor, existente.id],
          );
          actualizadas++;
        }
        continue;
      }
      const userId = cfg.historico ? await resolverResponsavelPorHistorico(cfg.tabela, ent.id, cfg.campo) : null;
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, data_limite, user_id, tempo_horas, origem_tipo, origem_id, origem_campo)
         VALUES ($1,$2,$3,'A fazer','alta',$4,$5,$6,$7,$8,$9)`,
        [id, `${cfg.tituloPrefix} — ${ent.nome}`, cfg.categoria, dataValor, userId, cfg.duracaoHoras, cfg.origemTipo, ent.id, cfg.campo],
      );
      criadas++;
    }
  }
  return { criadas, actualizadas };
}

function diasAlvoTemplate(tpl: any, semanaInicio: string): string[] {
  if (tpl.dias_semana) {
    const nums = tpl.dias_semana.split(",").map(Number);
    return nums.map((n: number) => addDias(semanaInicio, n - 1));
  }
  if (tpl.frequencia === "diaria") return Array.from({ length: 7 }, (_, i) => addDias(semanaInicio, i));
  if (tpl.frequencia === "semanal") return [semanaInicio];
  if (tpl.frequencia === "quinzenal") {
    if (!tpl.ultima_instancia_gerada_em) return [semanaInicio];
    const dias = (new Date(semanaInicio).getTime() - new Date(tpl.ultima_instancia_gerada_em).getTime()) / 86400000;
    return dias >= 14 ? [semanaInicio] : [];
  }
  if (tpl.frequencia === "mensal") {
    if (!tpl.ultima_instancia_gerada_em) return [semanaInicio];
    return semanaInicio.slice(0, 7) !== String(tpl.ultima_instancia_gerada_em).slice(0, 7) ? [semanaInicio] : [];
  }
  if (tpl.frequencia === "custom" && tpl.frequencia_intervalo_dias) {
    if (!tpl.ultima_instancia_gerada_em) return [semanaInicio];
    const dias = (new Date(semanaInicio).getTime() - new Date(tpl.ultima_instancia_gerada_em).getTime()) / 86400000;
    return dias >= tpl.frequencia_intervalo_dias ? [semanaInicio] : [];
  }
  return [];
}

export async function instanciarTemplatesDevidos(semanaInicio: string) {
  const { rows: templates } = await pool.query("SELECT * FROM tarefas_templates WHERE activo = true");
  let criadas = 0;

  for (const tpl of templates) {
    const dias = diasAlvoTemplate(tpl, semanaInicio);
    for (const dia of dias) {
      const { rows: existentes } = await pool.query(
        `SELECT id FROM tarefas WHERE template_id = $1 AND data_limite = $2`,
        [tpl.id, dia],
      );
      if (existentes.length) continue;
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO tarefas (id, tarefa, categoria, status, prioridade, data_limite, user_id, template_id, tempo_horas, regiao, simultaneo)
         VALUES ($1,$2,$3,'A fazer',$4,$5,$6,$7,$8,$9,$10)`,
        [id, tpl.titulo, tpl.categoria, tpl.prioridade, dia, tpl.user_id_default, tpl.id, tpl.duracao_estimada_horas, tpl.regiao, !!tpl.simultaneo],
      );
      criadas++;
    }
    if (dias.length) {
      await pool.query(`UPDATE tarefas_templates SET ultima_instancia_gerada_em = $1 WHERE id = $2`, [semanaInicio, tpl.id]);
    }
  }
  return { criadas };
}

function minutosDe(hhmm: string): number { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function hhmmDe(min: number): string { return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; }

export async function gerarProposta(semanaInicio: string) {
  const semanaFim = addDias(semanaInicio, 6);

  await pool.query(`DELETE FROM agendamentos WHERE data >= $1 AND data <= $2 AND estado = 'proposto'`, [semanaInicio, semanaFim]);

  const { rows: users } = await pool.query(
    `SELECT id, nome FROM users WHERE ativo = true AND role = ANY($1) ORDER BY id`,
    [ROLES_EQUIPA],
  );
  const blocosPorUser: Record<string, any[]> = {};
  const blocosPorUserDia: Record<string, Record<string, any[]>> = {};
  for (const u of users) {
    const { rows } = await pool.query(
      `SELECT id, data, hora_inicio, hora_fim FROM disponibilidade_blocos
       WHERE user_id = $1 AND data >= $2 AND data <= $3
       ORDER BY data, hora_inicio`,
      [u.id, semanaInicio, semanaFim],
    );
    const blocos = rows.map((b: any) => ({ ...b, cursorMin: minutosDe(b.hora_inicio), restanteMin: minutosDe(b.hora_fim) - minutosDe(b.hora_inicio) }));
    blocosPorUser[u.id] = blocos;
    blocosPorUserDia[u.id] = {};
    for (const b of blocos) (blocosPorUserDia[u.id][b.data] ||= []).push(b);
  }

  const criados: any[] = [];
  const naoAgendadas: any[] = [];

  async function inserirAgendamento(tarefaId: string, userId: string, bloco: any, horaInicio: string, horaFim: string) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agendamentos (id, tarefa_id, user_id, disponibilidade_bloco_id, data, hora_inicio, hora_fim, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'proposto')`,
      [id, tarefaId, userId, bloco.id, bloco.data, horaInicio, horaFim],
    );
    criados.push({ id, tarefa_id: tarefaId, user_id: userId, data: bloco.data, hora_inicio: horaInicio, hora_fim: horaFim });
  }

  async function tentarEncaixar(tarefa: any, userId: string, dataLimiteMax?: string | null): Promise<boolean> {
    const blocos = blocosPorUser[userId] || [];
    const duracaoMin = Math.max(15, Math.round((Number(tarefa.tempo_horas) || 1) * 60));
    for (const bloco of blocos) {
      if (dataLimiteMax && bloco.data > dataLimiteMax) continue;
      if (bloco.restanteMin >= duracaoMin) {
        const horaInicio = hhmmDe(bloco.cursorMin);
        const horaFim = hhmmDe(bloco.cursorMin + duracaoMin);
        bloco.cursorMin += duracaoMin;
        bloco.restanteMin -= duracaoMin;
        await inserirAgendamento(tarefa.id, userId, bloco, horaInicio, horaFim);
        return true;
      }
    }
    return false;
  }

  // 5a. Cadeias de angariação
  const { rows: pesquisas } = await pool.query(
    `SELECT * FROM tarefas WHERE origem_tipo='imovel' AND origem_campo='cadeia_pesquisa' AND inicio IS NULL AND status != 'Concluída'`,
  );
  for (const pesquisa of pesquisas) {
    const { rows: coldCalls } = await pool.query(
      `SELECT * FROM tarefas WHERE origem_tipo='imovel' AND origem_id=$1 AND origem_campo='cadeia_cold_call' AND inicio IS NULL AND status != 'Concluída'`,
      [pesquisa.origem_id],
    );
    const coldCall = coldCalls[0];
    if (!coldCall) { naoAgendadas.push(pesquisa); continue; }

    const durP = Math.max(15, Math.round((Number(pesquisa.tempo_horas) || 1) * 60));
    const durC = Math.max(15, Math.round((Number(coldCall.tempo_horas) || 1) * 60));
    let encaixado = false;

    for (const u of users) {
      const porDia = blocosPorUserDia[u.id];
      for (const dia of Object.keys(porDia).sort()) {
        const blocosDia = porDia[dia];
        for (let i = 0; i < blocosDia.length && !encaixado; i++) {
          const bA = blocosDia[i];
          if (bA.restanteMin < durP) continue;
          const inicioP = bA.cursorMin;
          const fimP = inicioP + durP;
          if (bA.restanteMin - durP >= durC) {
            const inicioC = fimP;
            const fimC = inicioC + durC;
            bA.cursorMin = fimC;
            bA.restanteMin -= (durP + durC);
            await inserirAgendamento(pesquisa.id, u.id, bA, hhmmDe(inicioP), hhmmDe(fimP));
            await inserirAgendamento(coldCall.id, u.id, bA, hhmmDe(inicioC), hhmmDe(fimC));
            encaixado = true;
            break;
          }
          for (let j = i + 1; j < blocosDia.length; j++) {
            const bB = blocosDia[j];
            const gap = bB.cursorMin - fimP;
            if (gap < 0) continue;
            if (gap <= GAP_MAX_CADEIA_MIN && bB.restanteMin >= durC) {
              const inicioC = bB.cursorMin;
              const fimC = inicioC + durC;
              bA.cursorMin = fimP;
              bA.restanteMin -= durP;
              bB.cursorMin = fimC;
              bB.restanteMin -= durC;
              await inserirAgendamento(pesquisa.id, u.id, bA, hhmmDe(inicioP), hhmmDe(fimP));
              await inserirAgendamento(coldCall.id, u.id, bB, hhmmDe(inicioC), hhmmDe(fimC));
              encaixado = true;
            }
            break;
          }
          if (encaixado) break;
        }
        if (encaixado) break;
      }
      if (encaixado) break;
    }
    if (!encaixado) { naoAgendadas.push(pesquisa); naoAgendadas.push(coldCall); }
  }

  // 5b. Tarefas simultâneas
  const { rows: simultaneas } = await pool.query(
    `SELECT * FROM tarefas WHERE simultaneo = true AND inicio IS NULL AND status != 'Concluída'
     ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, data_limite NULLS LAST, created_at`,
  );
  for (const tarefa of simultaneas) {
    if (users.length < 2) { naoAgendadas.push(tarefa); continue; }
    const duracaoMin = Math.max(15, Math.round((Number(tarefa.tempo_horas) || 1) * 60));
    let encaixado = false;
    const [uA, uB] = users;
    for (const dia of Object.keys(blocosPorUserDia[uA.id] || {}).sort()) {
      const blocosA = (blocosPorUserDia[uA.id] || {})[dia] || [];
      const blocosB = (blocosPorUserDia[uB.id] || {})[dia] || [];
      for (const ba of blocosA) {
        if (ba.restanteMin < duracaoMin) continue;
        for (const bb of blocosB) {
          if (bb.restanteMin < duracaoMin) continue;
          const inicio = Math.max(ba.cursorMin, bb.cursorMin);
          const fimA = ba.cursorMin + ba.restanteMin;
          const fimB = bb.cursorMin + bb.restanteMin;
          const fimComum = Math.min(fimA, fimB);
          if (fimComum - inicio >= duracaoMin) {
            const fim = inicio + duracaoMin;
            ba.restanteMin -= (fim - ba.cursorMin); ba.cursorMin = fim;
            bb.restanteMin -= (fim - bb.cursorMin); bb.cursorMin = fim;
            await inserirAgendamento(tarefa.id, uA.id, ba, hhmmDe(inicio), hhmmDe(fim));
            await inserirAgendamento(tarefa.id, uB.id, bb, hhmmDe(inicio), hhmmDe(fim));
            encaixado = true;
            break;
          }
        }
        if (encaixado) break;
      }
      if (encaixado) break;
    }
    if (!encaixado) naoAgendadas.push(tarefa);
  }

  // 5c. Resto do pool
  const coldCallIds = (await pool.query(`SELECT id FROM tarefas WHERE origem_tipo='imovel' AND origem_campo='cadeia_cold_call'`)).rows.map((r: any) => r.id);
  const jaTratadas = new Set([...pesquisas.map((t: any) => t.id), ...coldCallIds, ...simultaneas.map((t: any) => t.id)]);

  const { rows: poolComDono } = await pool.query(
    `SELECT * FROM tarefas WHERE inicio IS NULL AND status != 'Concluída' AND user_id IS NOT NULL AND simultaneo = false
     ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, data_limite NULLS LAST, created_at`,
  );
  const { rows: poolSemDono } = await pool.query(
    `SELECT * FROM tarefas WHERE inicio IS NULL AND status != 'Concluída' AND user_id IS NULL AND simultaneo = false
     ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, data_limite NULLS LAST, created_at`,
  );

  for (const u of users) {
    const minhas = poolComDono.filter((t: any) => t.user_id === u.id && !jaTratadas.has(t.id));
    for (const tarefa of minhas) {
      let ok = await tentarEncaixar(tarefa, u.id, tarefa.data_limite);
      if (!ok && tarefa.origem_tipo) {
        for (const outro of users.filter((x: any) => x.id !== u.id)) {
          ok = await tentarEncaixar(tarefa, outro.id, tarefa.data_limite);
          if (ok) break;
        }
      }
      if (!ok) naoAgendadas.push(tarefa);
    }
  }

  for (const tarefa of poolSemDono) {
    if (jaTratadas.has(tarefa.id)) continue;
    let ok = false;
    for (const u of users) {
      ok = await tentarEncaixar(tarefa, u.id, tarefa.data_limite);
      if (ok) break;
    }
    if (!ok) naoAgendadas.push(tarefa);
  }

  return { criados, naoAgendadas };
}
