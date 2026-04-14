/**
 * Cron Jobs — Follow-up automático + Relatórios com email.
 * Todos os horários em Europe/Lisbon.
 */
import cron from 'node-cron'
import pool from './pg.js'
import { randomUUID } from 'crypto'
import { sendWhatsApp, isConfigured as whatsappConfigured } from './whatsappAgent.js'
import { sendEmail, isConfigured as emailConfigured } from './emailService.js'

const TIMEZONE = 'Europe/Lisbon'

// ── Follow-up config por classe ─────────────────────────────
const FOLLOWUP_RULES = {
  A: { dias: [7, 10, 15], canal: 'chamada' },
  B: { dias: [10, 15], canal: 'chamada' },
  C: { dias: [15], canal: 'whatsapp_auto' },
  D: { dias: [15], canal: 'whatsapp_auto' },
}

// ── Template de reactivação ─────────────────────────────────
const REACTIVATION_TEMPLATE = (nome) => `Olá ${nome}, sou o Alexandre da Somnium Properties — mudei de contacto, daí o número novo.
Já tínhamos falado antes e continuo à procura de imóveis em zonas específicas.
Procuramos imóveis com potencial de negociação — construção antiga ou que precisem de obras, onde haja margem no preço. Se o proprietário precisar de vender rápido ainda melhor.
Zonas: Concelho de Coimbra, zona central de Condeixa-a-Nova e Ventosa do Bairro (Mealhada).
Valor máximo de aquisição: 250.000€.
Se cruzares com algo assim, fala connosco.`

// ── JOB 1: Follow-up diário (08:00 Europe/Lisbon) ──────────
async function runFollowUp() {
  console.log('[cron] Follow-up diário — a correr')
  try {
    const { rows: consultores } = await pool.query(
      "SELECT * FROM consultores WHERE estado_avaliacao != 'Inativo' AND controlo_manual = false"
    )
    const { rows: interacoes } = await pool.query(
      'SELECT consultor_id, MAX(data_hora) as ultima FROM consultor_interacoes GROUP BY consultor_id'
    )
    const ultimaInteracao = {}
    for (const i of interacoes) ultimaInteracao[i.consultor_id] = new Date(i.ultima)

    const now = new Date()
    let enviadosAuto = 0, tarefasCriadas = 0

    for (const c of consultores) {
      const classe = c.classificacao || 'D'
      const rules = FOLLOWUP_RULES[classe]
      if (!rules) continue

      // Calcular dias desde último contacto
      const ultima = ultimaInteracao[c.id] || (c.updated_at ? new Date(c.updated_at) : new Date(c.created_at))
      const diasSem = Math.floor((now - ultima) / 86400000)

      // Verificar se está na janela de follow-up
      const needsFollowUp = rules.dias.some(d => diasSem >= d)
      if (!needsFollowUp) continue

      // Verificar se já houve follow-up recente (últimas 48h)
      const { rows: [recentFU] } = await pool.query(
        "SELECT id FROM consultor_interacoes WHERE consultor_id = $1 AND direcao = 'Enviado' AND data_hora > $2",
        [c.id, new Date(now - 48 * 3600000).toISOString()]
      )
      if (recentFU) continue

      const canal = c.canal_followup || rules.canal

      if (canal === 'whatsapp_auto' && c.contacto && whatsappConfigured()) {
        // Gerar mensagem via Claude API
        const { rows: hist } = await pool.query(
          'SELECT direcao, notas, data_hora FROM consultor_interacoes WHERE consultor_id = $1 ORDER BY data_hora DESC LIMIT 5',
          [c.id]
        )
        const histText = hist.reverse().map(h => `${h.direcao}: ${h.notas}`).join('\n')

        let msg
        try {
          const Anthropic = (await import('@anthropic-ai/sdk')).default
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
          const resp = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            system: `És o Alexandre da Somnium Properties. Escreve uma mensagem curta (max 3 linhas) de follow-up para um consultor imobiliário. Tom: profissional mas acessível. Objectivo: perguntar se tem imóveis novos para partilhar. Nunca "conforme" ou "relativamente". Sê directo.`,
            messages: [{ role: 'user', content: `Consultor: ${c.nome}\nÚltimo contacto: há ${diasSem} dias\nHistórico:\n${histText || '(sem histórico)'}\n\nEscreve APENAS a mensagem (sem JSON, sem explicação).` }]
          })
          msg = resp.content[0]?.text?.trim()
        } catch {
          msg = `Olá ${c.nome}, tudo bem? Alguma novidade de imóveis que possam encaixar no nosso perfil? Estamos à procura de oportunidades com margem negocial em Coimbra e arredores.`
        }

        await sendWhatsApp(c.contacto, msg)
        await pool.query(
          'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
          [randomUUID(), c.id, now.toISOString(), 'whatsapp', 'Enviado', `[FOLLOW-UP AUTO] ${msg}`]
        )
        enviadosAuto++
      } else {
        // Criar tarefa no CRM para follow-up manual (A e B)
        await pool.query(
          `INSERT INTO tarefas (id, tarefa, status, categoria, inicio, funcionario, created_at, updated_at)
           VALUES ($1, $2, 'A fazer', 'Follow-up Consultor', $3, 'Alexandre Mendes', $3, $3)`,
          [randomUUID(), `Follow-up pendente — ${c.nome} (${classe}, ${diasSem}d sem contacto)`, now.toISOString()]
        )
        tarefasCriadas++
      }

      // Actualizar próximo follow-up
      const proximoDias = rules.dias[0]
      const proximo = new Date(now.getTime() + proximoDias * 86400000)
      await pool.query(
        'UPDATE consultores SET data_proximo_follow_up = $1, updated_at = $2 WHERE id = $3',
        [proximo.toISOString().slice(0, 10), now.toISOString(), c.id]
      )
    }

    console.log(`[cron] Follow-up: ${enviadosAuto} auto WhatsApp, ${tarefasCriadas} tarefas manuais`)
  } catch (e) {
    console.error('[cron] Erro follow-up:', e.message)
  }
}

// ── JOB 2: Relatório diário Pré-aprovação (19:00) ──────────
async function runRelatorioDiario() {
  console.log('[cron] Relatório diário Pré-aprovação — a gerar')
  try {
    const now = new Date()
    const ontem = new Date(now - 24 * 3600000).toISOString()

    const { rows: preAprovacao } = await pool.query(
      "SELECT i.*, c.nome as consultor_nome FROM imoveis i LEFT JOIN consultores c ON LOWER(i.nome_consultor) = LOWER(c.nome) WHERE i.estado = 'Pré-aprovação' ORDER BY i.created_at DESC"
    )
    const novos = preAprovacao.filter(i => i.created_at > ontem)
    const pendentes48h = preAprovacao.filter(i => {
      const h = (now - new Date(i.created_at)) / 3600000
      return h > 48
    })

    // Contar acumulado da semana
    const inicioSemana = new Date(now)
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay())
    inicioSemana.setHours(0, 0, 0, 0)
    const { rows: [semana] } = await pool.query(
      "SELECT COUNT(*) as c FROM imoveis WHERE estado = 'Pré-aprovação' AND created_at >= $1",
      [inicioSemana.toISOString()]
    )

    const report = {
      tipo: 'diario_pre_aprovacao',
      gerado_em: now.toISOString(),
      data: now.toISOString().slice(0, 10),
      total_pre_aprovacao: preAprovacao.length,
      novos_hoje: novos.length,
      pendentes_48h: pendentes48h.length,
      acumulado_semana: parseInt(semana.c),
      imoveis_novos: novos.map(i => ({
        nome: i.nome, tipologia: i.tipologia, zona: i.zona,
        ask_price: i.ask_price, tipo_oportunidade: i.tipo_oportunidade,
        consultor: i.nome_consultor, link: i.link,
        notas: i.notas?.slice(0, 200), data_entrada: i.created_at,
      })),
      imoveis_pendentes_48h: pendentes48h.map(i => ({
        nome: i.nome, horas: Math.round((now - new Date(i.created_at)) / 3600000),
        consultor: i.nome_consultor,
      })),
    }

    // Guardar relatório na DB
    await pool.query(
      `CREATE TABLE IF NOT EXISTS relatorios (id TEXT PRIMARY KEY, tipo TEXT, data TEXT, dados JSONB, created_at TEXT DEFAULT (NOW()::TEXT))`
    )
    await pool.query(
      'INSERT INTO relatorios (id, tipo, data, dados) VALUES ($1, $2, $3, $4)',
      [randomUUID(), 'diario_pre_aprovacao', now.toISOString().slice(0, 10), JSON.stringify(report)]
    )

    // Enviar email
    if (emailConfigured()) {
      const subject = `Somnium — Relatório Pré-aprovação ${now.toISOString().slice(0, 10)}`
      const html = `
        <h2 style="color:#C9A84C;">Relatório Diário — Pré-aprovação</h2>
        <p><strong>${novos.length}</strong> imóveis novos hoje · <strong>${preAprovacao.length}</strong> total em pré-aprovação · <strong>${pendentes48h.length}</strong> pendentes há +48h</p>
        ${novos.length > 0 ? `<h3>Novos hoje:</h3><ul>${novos.map(i => `<li><strong>${i.nome}</strong> — ${i.zona || '?'} · ${i.ask_price ? i.ask_price + '€' : '?'} · ${i.tipo_oportunidade || '?'} · Consultor: ${i.nome_consultor || '?'}</li>`).join('')}</ul>` : ''}
        ${pendentes48h.length > 0 ? `<h3 style="color:red;">⚠️ Pendentes há +48h:</h3><ul>${pendentes48h.map(i => `<li>${i.nome} — ${Math.round((now - new Date(i.created_at)) / 3600000)}h sem decisão</li>`).join('')}</ul>` : ''}
        <p>Acumulado da semana: <strong>${semana.c}</strong></p>
        <hr><p style="font-size:11px;color:#999;">Ver relatório completo no CRM → Consultores → Relatório</p>
      `
      await sendEmail(subject, html)
    }

    console.log(`[cron] Relatório diário: ${novos.length} novos, ${preAprovacao.length} total, ${pendentes48h.length} pendentes`)
  } catch (e) {
    console.error('[cron] Erro relatório diário:', e.message)
  }
}

// ── JOB 3: Relatório semanal consultores (Domingo 09:00) ────
async function runRelatorioSemanal() {
  console.log('[cron] Relatório semanal consultores — a gerar')
  try {
    const now = new Date()
    const inicioSemana = new Date(now)
    inicioSemana.setDate(inicioSemana.getDate() - 7)
    const semanaStr = inicioSemana.toISOString()

    const { rows: consultores } = await pool.query('SELECT * FROM consultores')
    const { rows: imoveis } = await pool.query('SELECT * FROM imoveis')
    const { rows: interacoes } = await pool.query('SELECT * FROM consultor_interacoes WHERE data_hora >= $1', [semanaStr])

    const novosConsultores = consultores.filter(c => c.created_at >= semanaStr)
    const imoveisRecebidos = imoveis.filter(i => i.created_at >= semanaStr)
    const imoveisQualificados = imoveis.filter(i => i.check_qualidade && i.updated_at >= semanaStr)

    // Top 3 por score
    const top3 = [...consultores].sort((a, b) => (b.score_prioridade || 0) - (a.score_prioridade || 0)).slice(0, 3)

    // Follow-ups atrasados
    const atrasados = consultores.filter(c =>
      c.data_proximo_follow_up && new Date(c.data_proximo_follow_up) < now && c.estado_avaliacao !== 'Inativo'
    )

    // Distribuição
    const dist = { A: 0, B: 0, C: 0, D: 0 }
    for (const c of consultores) dist[c.classificacao || 'D']++

    // Taxa qualidade geral
    const comImoveis = consultores.filter(c => (c.imoveis_enviados || 0) > 0)
    const mediaQualidade = comImoveis.length > 0
      ? Math.round(comImoveis.reduce((s, c) => s + (c.taxa_qualidade || 0), 0) / comImoveis.length)
      : 0

    const report = {
      tipo: 'semanal_consultores',
      gerado_em: now.toISOString(),
      semana: `${inicioSemana.toISOString().slice(0, 10)} a ${now.toISOString().slice(0, 10)}`,
      novos_consultores: novosConsultores.length,
      imoveis_recebidos: imoveisRecebidos.length,
      imoveis_qualificados: imoveisQualificados.length,
      interacoes_semana: interacoes.length,
      top3: top3.map(c => ({ nome: c.nome, score: c.score_prioridade, classe: c.classificacao })),
      followup_atrasado: atrasados.length,
      distribuicao: dist,
      taxa_qualidade_geral: mediaQualidade,
    }

    // Guardar
    await pool.query(
      `CREATE TABLE IF NOT EXISTS relatorios (id TEXT PRIMARY KEY, tipo TEXT, data TEXT, dados JSONB, created_at TEXT DEFAULT (NOW()::TEXT))`
    )
    await pool.query(
      'INSERT INTO relatorios (id, tipo, data, dados) VALUES ($1, $2, $3, $4)',
      [randomUUID(), 'semanal_consultores', now.toISOString().slice(0, 10), JSON.stringify(report)]
    )

    // Email
    if (emailConfigured()) {
      const subject = `Somnium — Relatório Semanal Consultores ${now.toISOString().slice(0, 10)}`
      const html = `
        <h2 style="color:#C9A84C;">Relatório Semanal — Rede de Consultores</h2>
        <p><strong>${report.semana}</strong></p>
        <table style="border-collapse:collapse;width:100%;max-width:500px;">
          <tr><td style="padding:4px 8px;">Novos consultores</td><td style="padding:4px 8px;font-weight:bold;">${novosConsultores.length}</td></tr>
          <tr><td style="padding:4px 8px;">Imóveis recebidos</td><td style="padding:4px 8px;font-weight:bold;">${imoveisRecebidos.length}</td></tr>
          <tr><td style="padding:4px 8px;">Imóveis qualificados</td><td style="padding:4px 8px;font-weight:bold;">${imoveisQualificados.length}</td></tr>
          <tr><td style="padding:4px 8px;">Interacções registadas</td><td style="padding:4px 8px;font-weight:bold;">${interacoes.length}</td></tr>
          <tr><td style="padding:4px 8px;">Follow-ups em atraso</td><td style="padding:4px 8px;font-weight:bold;color:${atrasados.length > 0 ? 'red' : 'green'};">${atrasados.length}</td></tr>
          <tr><td style="padding:4px 8px;">Taxa qualidade geral</td><td style="padding:4px 8px;font-weight:bold;">${mediaQualidade}%</td></tr>
        </table>
        <h3>Top 3:</h3>
        <ol>${top3.map(c => `<li><strong>${c.nome}</strong> — Score ${c.score_prioridade}, Classe ${c.classificacao}</li>`).join('')}</ol>
        <h3>Distribuição:</h3>
        <p>A: ${dist.A} · B: ${dist.B} · C: ${dist.C} · D: ${dist.D}</p>
        <hr><p style="font-size:11px;color:#999;">Ver relatório completo no CRM → Consultores → Relatório</p>
      `
      await sendEmail(subject, html)
    }

    console.log(`[cron] Relatório semanal: ${novosConsultores.length} novos, ${imoveisRecebidos.length} imóveis, ${atrasados.length} atrasados`)
  } catch (e) {
    console.error('[cron] Erro relatório semanal:', e.message)
  }
}

// ── Registar jobs ───────────────────────────────────────────
export function startCronJobs() {
  // Follow-up diário às 08:00
  cron.schedule('0 8 * * *', runFollowUp, { timezone: TIMEZONE })
  console.log('[cron] Follow-up diário registado → 08:00 Europe/Lisbon')

  // Relatório diário Pré-aprovação às 19:00
  cron.schedule('0 19 * * *', runRelatorioDiario, { timezone: TIMEZONE })
  console.log('[cron] Relatório diário registado → 19:00 Europe/Lisbon')

  // Relatório semanal Domingos às 09:00
  cron.schedule('0 9 * * 0', runRelatorioSemanal, { timezone: TIMEZONE })
  console.log('[cron] Relatório semanal registado → Domingos 09:00 Europe/Lisbon')
}

// Exports para execução manual via API
export { runFollowUp, runRelatorioDiario, runRelatorioSemanal, REACTIVATION_TEMPLATE }
