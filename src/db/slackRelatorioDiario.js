/**
 * Relatório diário do canal Slack — agrega as mensagens das últimas 24h
 * (tabela slack_mensagens, alimentada pelo webhook Slack) com Claude e envia
 * por email. Port de supabase/functions/_shared/slackRelatorioDiario.ts.
 */
import pool from './pg.js'
import { isConfigured as emailConfigured, sendEmail } from './emailService.js'
import { randomUUID } from 'crypto'

const REPORT_EMAIL_TO = 'somniumprs@gmail.com'

export async function runRelatorioDiarioSlack() {
  const now = new Date()
  const desde = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const { rows: mensagens } = await pool.query(
    'SELECT user_name, texto, created_at FROM slack_mensagens WHERE created_at >= $1 ORDER BY created_at ASC',
    [desde]
  )

  if (mensagens.length === 0) {
    return { ran: true, gerado: false, reason: 'sem mensagens nas últimas 24h' }
  }

  const conteudo = process.env.ANTHROPIC_API_KEY
    ? await aggregateWithClaude(mensagens)
    : aggregateFallback(mensagens)

  await pool.query(
    `CREATE TABLE IF NOT EXISTS relatorios (id TEXT PRIMARY KEY, tipo TEXT, data TEXT, dados JSONB, created_at TEXT DEFAULT (NOW()::TEXT))`
  )
  const dataStr = now.toISOString().slice(0, 10)
  await pool.query(
    'INSERT INTO relatorios (id, tipo, data, dados) VALUES ($1, $2, $3, $4)',
    [randomUUID(), 'diario_slack', dataStr, JSON.stringify({ ...conteudo, total_mensagens: mensagens.length })]
  )

  if (emailConfigured()) {
    const subject = `Somnium — Relatório Diário Slack ${dataStr}`
    const html = buildEmailHtml(conteudo, mensagens.length, dataStr)
    await sendEmail(subject, html, { to: REPORT_EMAIL_TO })
  }

  return { ran: true, gerado: true, mensagens: mensagens.length }
}

async function aggregateWithClaude(mensagens) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const concat = mensagens
    .map(m => `[${m.created_at}] ${m.user_name || '?'}: ${m.texto}`)
    .join('\n')
    .slice(0, 30000)
  const participantes = [...new Set(mensagens.map(m => m.user_name).filter(Boolean))]

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `És analista executivo da Somnium Properties (investimento imobiliário, Coimbra/Porto). Recebes as mensagens do canal Slack interno da equipa das últimas 24h e compões uma síntese editorial curta em PT-PT formal — nunca copiar mensagens literalmente.

MENSAGENS:
${concat}

Devolve APENAS JSON válido com esta estrutura:
{
  "sumario_executivo": "2-4 frases sintetizando o dia, registo executivo PT-PT",
  "topicos": ["até 6 bullets editorializados"],
  "decisoes": ["decisões tomadas, até 5; [] se nenhuma"],
  "accoes_pendentes": [{"responsavel": "nome ou Equipa", "prazo": "data ou —", "accao": "..."}],
  "participantes": ${JSON.stringify(participantes)}
}`
    }]
  })

  const respText = message.content[0]?.text || '{}'
  try {
    const match = respText.match(/\{[\s\S]*\}/)
    return JSON.parse(match?.[0] || respText)
  } catch {
    return aggregateFallback(mensagens)
  }
}

function aggregateFallback(mensagens) {
  const participantes = [...new Set(mensagens.map(m => m.user_name).filter(Boolean))]
  return {
    sumario_executivo: `${mensagens.length} mensagens no canal Slack nas últimas 24h. Relatório gerado sem análise IA.`,
    topicos: [],
    decisoes: [],
    accoes_pendentes: [],
    participantes,
  }
}

function buildEmailHtml(conteudo, totalMensagens, dataStr) {
  const topicos = (conteudo.topicos || []).map(t => `<li>${t}</li>`).join('')
  const decisoes = (conteudo.decisoes || []).map(d => `<li>${d}</li>`).join('')
  const accoes = (conteudo.accoes_pendentes || [])
    .map(a => `<li><strong>${a.responsavel || 'Equipa'}</strong> — ${a.accao} (${a.prazo || '—'})</li>`)
    .join('')
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
      <div style="border-top:3px solid #C9A84C;padding-top:18px;margin-bottom:18px;">
        <h2 style="margin:0 0 4px;font-size:20px;font-weight:600;">Relatório Diário — Canal Slack</h2>
        <p style="margin:0;color:#888;font-size:13px;">${dataStr} · ${totalMensagens} mensagens</p>
      </div>
      <p style="font-size:14px;color:#444;">${conteudo.sumario_executivo || ''}</p>
      ${topicos ? `<h3 style="font-size:15px;">Tópicos</h3><ul style="font-size:14px;color:#444;">${topicos}</ul>` : ''}
      ${decisoes ? `<h3 style="font-size:15px;">Decisões</h3><ul style="font-size:14px;color:#444;">${decisoes}</ul>` : ''}
      ${accoes ? `<h3 style="font-size:15px;">Acções pendentes</h3><ul style="font-size:14px;color:#444;">${accoes}</ul>` : ''}
      <hr style="margin:24px 0;border:0;border-top:1px solid #eee;">
      <p style="font-size:12px;color:#999;margin:0;">Gerado automaticamente a partir do canal Slack da equipa Somnium Properties.</p>
    </div>
  `
}
