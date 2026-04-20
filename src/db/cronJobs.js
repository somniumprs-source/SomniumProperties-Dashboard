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
const REACTIVATION_TEMPLATE = (nome) => `Olá ${nome}, sou o Alexandre da Somnium Properties — mudei de contacto (antes era o 925 323 797), daí o número novo.
Continuo à procura de imóveis com potencial de negociação — construção antiga ou que precisem de obras, onde haja margem no preço. Se o proprietário precisar de vender rápido, ainda melhor.
Zonas: Concelho de Coimbra, zona central de Condeixa-a-Nova e Ventosa do Bairro (Mealhada). Valor máximo: 250.000€.
Se cruzares com algo assim, fala comigo.`

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

        // Enviar via template aprovado (necessario para primeira mensagem)
        const templateSids = {
          geral: 'HXa7c0a58c493495883965a44988542916',
          reminder: 'HXacd7d45a76226a7f10619a3878669c13',
          inativo: 'HXac84ceb95bbd70a8d2c492c3a7f08c53',
        }
        const templateSid = diasSem > 30 ? templateSids.inativo : diasSem > 15 ? templateSids.reminder : templateSids.geral
        const firstName = (c.nome || '').split(' ')[0]
        try {
          const twilio = (await import('twilio')).default
          const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
          const to = c.contacto.startsWith('whatsapp:') ? c.contacto : `whatsapp:${c.contacto.replace(/\s/g, '')}`
          await twilioClient.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to,
            contentSid: templateSid,
            contentVariables: JSON.stringify({ '1': firstName }),
          })
        } catch (templateErr) {
          console.warn('[cron] Template falhou, tentando texto livre:', templateErr.message)
          await sendWhatsApp(c.contacto, msg)
        }
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

// ── JOB 4: Reclassificação semanal de investidores (Domingos 10:00) ──
async function runReclassificacaoInvestidores() {
  console.log('[cron] Reclassificação semanal de investidores — a correr')
  try {
    const { rows: investidores } = await pool.query('SELECT * FROM investidores WHERE classificacao IS NOT NULL')
    const { rows: allScorecards } = await pool.query('SELECT * FROM scorecards ORDER BY created_at DESC')
    const now = new Date()
    let reclassificados = 0

    const RULES = {
      A: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, pen_inter: 5, pen_frio: 15 },
      B: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, pen_inter: 8, pen_frio: 20 },
      C: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, pen_inter: 10, pen_frio: 25 },
      D: { dias_quente: 30, dias_intermedio: 60, dias_frio: 90, pen_inter: 5, pen_frio: 10 },
    }

    for (const inv of investidores) {
      if (inv.classificacao === 'D') continue
      const ultimoSc = allScorecards.find(s => s.investidor_id === inv.id)
      if (!ultimoSc) continue

      const ultimoContacto = inv.data_ultimo_contacto || inv.data_reuniao || inv.data_primeiro_contacto
      if (!ultimoContacto) continue

      const diasSem = Math.floor((now - new Date(ultimoContacto)) / 86400000)
      const rules = RULES[inv.classificacao] || RULES.C

      let penalizacao = 0
      let tipoFU = null
      if (diasSem >= rules.dias_frio) { penalizacao = rules.pen_frio; tipoFU = 'frio' }
      else if (diasSem >= rules.dias_intermedio) { penalizacao = rules.pen_inter; tipoFU = 'intermedio' }

      if (penalizacao === 0) continue

      let bonus = 0
      if (inv.nda_assinado) bonus += 5
      if (inv.montante_investido > 0) bonus += 10
      if (inv.numero_negocios > 0) bonus += 10

      const pontuacaoAjustada = Math.max(0, Math.min(100, (inv.pontuacao || 0) - penalizacao + bonus))
      const novaClasse = pontuacaoAjustada >= 88 ? 'A' : pontuacaoAjustada >= 72 ? 'B' : pontuacaoAjustada >= 56 ? 'C' : 'D'

      if (novaClasse !== inv.classificacao) {
        const motivo = `[CRON] Reclassificação semanal — ${diasSem}d sem contacto (${tipoFU}), -${penalizacao}pts${bonus > 0 ? `, +${bonus}pts engagement` : ''}`

        await pool.query('UPDATE investidores SET classificacao = $1, pontuacao = $2, updated_at = $3 WHERE id = $4',
          [novaClasse, pontuacaoAjustada, now.toISOString(), inv.id])

        await pool.query(
          `INSERT INTO classificacao_historico (id, investidor_id, classificacao_anterior, classificacao_nova,
            pontuacao_anterior, pontuacao_nova, motivo, tipo, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [randomUUID(), inv.id, inv.classificacao, novaClasse,
            inv.pontuacao || 0, pontuacaoAjustada, motivo, 'reclassificacao_periodica', now.toISOString()]
        )
        reclassificados++
        console.log(`[cron] Reclassificado: ${inv.nome} ${inv.classificacao}→${novaClasse} (${diasSem}d)`)
      }
    }

    console.log(`[cron] Reclassificação: ${reclassificados} investidores actualizados`)
  } catch (e) {
    console.error('[cron] Erro reclassificação investidores:', e.message)
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

  // Reclassificação semanal investidores Domingos às 10:00
  cron.schedule('0 10 * * 0', runReclassificacaoInvestidores, { timezone: TIMEZONE })
  console.log('[cron] Reclassificação investidores registada → Domingos 10:00 Europe/Lisbon')
}

// Exports para execução manual via API
export { runFollowUp, runRelatorioDiario, runRelatorioSemanal, runReclassificacaoInvestidores, REACTIVATION_TEMPLATE }
