#!/usr/bin/env node
/**
 * Envio em massa de email de reactivação a consultores via Gmail API.
 * Usa googleAuth.js para autenticação, aplica label "Consultores",
 * regista interacção no CRM.
 *
 * Uso: node scripts/send-reactivation-emails.js [--dry-run]
 */
import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth, isGoogleConfigured } from '../src/db/googleAuth.js'
import pool from '../src/db/pg.js'
import { randomUUID } from 'crypto'

const DRY_RUN = process.argv.includes('--dry-run')

// ── Lista de destinatários (nome, email construído por padrão da agência) ──
const RECIPIENTS = [
  // Remax
  { nome: 'Edgar Correia', email: 'edgar.correia@remax.pt', agencia: 'Remax' },
  { nome: 'Alcino Rodrigues', email: 'alcino.rodrigues@remax.pt', agencia: 'Remax' },
  { nome: 'Carla Torres', email: 'carla.torres@remax.pt', agencia: 'Remax' },
  { nome: 'Ludimila Simão', email: 'ludimila.simao@remax.pt', agencia: 'Remax' },
  { nome: 'Isabel Nascimento', email: 'isabel.nascimento@remax.pt', agencia: 'Remax' },
  { nome: 'Helena Salgado', email: 'helena.salgado@remax.pt', agencia: 'Remax' },
  { nome: 'João Lara', email: 'joao.lara@remax.pt', agencia: 'Remax' },
  { nome: 'Amaro Bailão', email: 'amaro.bailao@remax.pt', agencia: 'Remax' },
  { nome: 'João Rodrigues', email: 'joao.rodrigues@remax.pt', agencia: 'Remax' },
  { nome: 'Zita Valente', email: 'zita.valente@remax.pt', agencia: 'Remax' },
  { nome: 'Carlos Pita', email: 'carlos.pita@remax.pt', agencia: 'Remax' },
  { nome: 'Rui Silva', email: 'rui.silva@remax.pt', agencia: 'Remax' },
  { nome: 'Luís Aveleira', email: 'luis.aveleira@remax.pt', agencia: 'Remax' },
  { nome: 'Nelson Luís', email: 'nelson.luis@remax.pt', agencia: 'Remax' },
  { nome: 'Leriano Lucas', email: 'leriano.lucas@remax.pt', agencia: 'Remax' },
  { nome: 'David Caria', email: 'david.caria@remax.pt', agencia: 'Remax' },
  { nome: 'Ana Rei', email: 'ana.rei@remax.pt', agencia: 'Remax' },
  { nome: 'Pedro Graça', email: 'pedro.graca@remax.pt', agencia: 'Remax' },
  { nome: 'Miguel Marques', email: 'miguel.marques@remax.pt', agencia: 'Remax' },
  { nome: 'Hernani Ferreira', email: 'hernani.ferreira@remax.pt', agencia: 'Remax' },
  { nome: 'Gilberto Martins', email: 'gilberto.martins@remax.pt', agencia: 'Remax' },
  { nome: 'Sónia Henriques', email: 'sonia.henriques@remax.pt', agencia: 'Remax' },
  { nome: 'Cláudia Primo', email: 'claudia.primo@remax.pt', agencia: 'Remax' },
  { nome: 'Anabela Nunes', email: 'anabela.nunes@remax.pt', agencia: 'Remax' },
  { nome: 'João Catulo', email: 'joao.catulo@remax.pt', agencia: 'Remax' },
  { nome: 'Marilu Moura', email: 'marilu.moura@remax.pt', agencia: 'Remax' },
  // KW Union
  { nome: 'Nicole Cleto', email: 'nicole.cleto@kwportugal.pt', agencia: 'KW Union' },
  { nome: 'Francisco Cardoso', email: 'francisco.cardoso@kwportugal.pt', agencia: 'KW Union' },
  { nome: 'Natália Silva', email: 'natalia.silva@kwportugal.pt', agencia: 'KW Union' },
  { nome: 'José Duarte', email: 'jose.duarte@kwportugal.pt', agencia: 'KW Union' },
  { nome: 'Joel Simões', email: 'joel.simoes@kwportugal.pt', agencia: 'KW Union' },
  { nome: 'Diogo Martins', email: 'diogo.martins@kwportugal.pt', agencia: 'KW Union' },
  { nome: 'Sónia Lucas', email: 'sonia.lucas@kwportugal.pt', agencia: 'KW Union' },
  // Century 21
  { nome: 'Elsa Gonçalves', email: 'elsa.goncalves@century21.pt', agencia: 'Century 21' },
  { nome: 'Liliana Serra', email: 'liliana.serra@century21.pt', agencia: 'Century 21' },
  { nome: 'Carlos Pina', email: 'carlos.pina@century21.pt', agencia: 'Century 21' },
  { nome: 'Daniel Carvalho', email: 'daniel.carvalho@century21.pt', agencia: 'Century 21' },
  { nome: 'Augusto Sousa', email: 'augusto.sousa@century21.pt', agencia: 'Century 21' },
  { nome: 'José Forte', email: 'jose.forte@century21.pt', agencia: 'Century 21' },
  // ERA
  { nome: 'Vera Antunes', email: 'vera.antunes@era.pt', agencia: 'ERA' },
  { nome: 'Mauro Neto', email: 'mauro.neto@era.pt', agencia: 'ERA' },
  { nome: 'Ana Balula', email: 'ana.balula@era.pt', agencia: 'ERA' },
  { nome: 'Teresa Sousa', email: 'teresa.sousa@era.pt', agencia: 'ERA' },
  // Zome
  { nome: 'Ricardo Oliveira', email: 'ricardooliveira@zome.pt', agencia: 'Zome' },
  { nome: 'Lina Pinto', email: 'linapinto@zome.pt', agencia: 'Zome' },
  // IAD
  { nome: 'Débora Andrade', email: 'debora.andrade@iad-pt.com', agencia: 'IAD' },
  // Outras agências (email geral)
  { nome: 'Bruno Batista', email: 'bruno.batista@comprarcasa.pt', agencia: 'Comprar Casa' },
  { nome: 'Cátia Moura', email: 'coimbra@luxproperties.pt', agencia: 'Lux Properties' },
  { nome: 'Hélder Paixão', email: 'coimbra@luxproperties.pt', agencia: 'Lux Properties' },
  { nome: 'Teresa Mendes', email: 'geral@onehouse.pt', agencia: 'One House' },
  { nome: 'Susana Moreira', email: 'susana.moreira@maisimoveis.pt', agencia: 'Mais Imóveis' },
  { nome: 'Manuel Manceles', email: 'geral@predialrainhasanta.pt', agencia: 'Predial Rainha Santa' },
  { nome: 'Impercasa', email: 'geral@impercasa.pt', agencia: 'Impercasa' },
  { nome: 'Isilda', email: 'geral@prabitar.pt', agencia: 'Prabitar' },
  // Consultores com email já no CRM
  { nome: 'Luís Vaz', email: 'Luis.Vaz@expportugal.com', agencia: 'EXP' },
  { nome: 'José Murta', email: 'jmmurta@remax.pt', agencia: 'Remax' },
  { nome: 'José Afonso', email: 'jaafonso@remax.pt', agencia: 'Remax' },
  { nome: 'Fernando Pimenta', email: 'fpimenta@remax.pt', agencia: 'Remax' },
  { nome: 'Graça', email: 'graca@imobiliariasantacruz.com', agencia: 'Santa Cruz' },
  { nome: 'Amélia Cerejo', email: 'amelia.cerejo@homelusa.pt', agencia: 'Homelusa' },
  { nome: 'Imoarrenda', email: 'geral@imoarrenda.pt', agencia: 'Imoarrenda' },
]

// ── Remover duplicados de email ──
const seen = new Set()
const uniqueRecipients = RECIPIENTS.filter(r => {
  if (seen.has(r.email.toLowerCase())) return false
  seen.add(r.email.toLowerCase())
  return true
})

// ── Template do email ──
function buildEmailHtml(nome) {
  const primeiroNome = nome.split(' ')[0]
  return `
<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1A1A1A;line-height:1.7;">
  <p>Boa tarde ${primeiroNome},</p>

  <p>Sou o Alexandre Mendes, da Somnium Properties. Mudei recentemente de contacto e gostaria de retomar a nossa comunicação.</p>

  <p>Investimos em imóveis com potencial de valorização na região de Coimbra. Compramos directamente, renovamos e recolocamos no mercado. Trabalhamos com consultores como parceiros de negócio e valorizamos quem nos apresenta boas oportunidades.</p>

  <p>Analisamos vários imóveis por mês e poucos passam os nossos critérios. Quando encontramos o imóvel certo, avançamos com rapidez e sem burocracia desnecessária.</p>

  <p><strong>O que procuramos:</strong></p>

  <p>Imóveis com margem de negociação no preço, preferencialmente de construção anterior a 2000 ou que necessitem de intervenção. Situações em que o proprietário tenha motivação concreta para vender (herança, emigração, divórcio, dificuldades financeiras) são exactamente o tipo de oportunidade que nos interessa.</p>

  <p>Questões de licenciamento ou documentação não constituem impedimento para nós. No entanto, privilegiamos imóveis que não exijam alterações de áreas nem processos camarários, por permitirem uma execução mais célere.</p>

  <p>Zonas: concelho de Coimbra (todas as freguesias), zona central de Condeixa-a-Nova e Ventosa do Bairro (Mealhada). Valor máximo de aquisição: 250.000 EUR.</p>

  <p>Se cruzar com algo neste perfil, basta responder a este e-mail ou contactar-me pelo WhatsApp: +351 930 642 708.</p>

  <p>Cumprimentos,<br>
  <strong>Alexandre Mendes</strong><br>
  Somnium Properties<br>
  +351 930 642 708</p>
</div>`
}

// ── Construir email MIME ──
function buildMimeEmail({ to, subject, html }) {
  const boundary = '----=_Part_' + Date.now()
  const plainText = html.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim()
  const lines = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    plainText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '',
    `--${boundary}--`,
  ]
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

// ── Obter ou criar label "Consultores" ──
let labelId = null
async function ensureLabel(gmail) {
  if (labelId) return labelId
  const { data } = await gmail.users.labels.list({ userId: 'me' })
  const existing = data.labels.find(l => l.name === 'Consultores')
  if (existing) { labelId = existing.id; return labelId }
  const { data: newLabel } = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name: 'Consultores', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
  })
  labelId = newLabel.id
  console.log(`Label "Consultores" criado: ${labelId}`)
  return labelId
}

// ── Registar interacção no CRM ──
async function registarInteraccao(nome, email) {
  try {
    // Procurar consultor por nome
    const { rows } = await pool.query(
      "SELECT id FROM consultores WHERE LOWER(nome) = LOWER($1) LIMIT 1",
      [nome]
    )
    if (rows[0]) {
      await pool.query(
        'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), rows[0].id, new Date().toISOString(), 'email', 'Enviado', `[REACTIVAÇÃO EMAIL] Enviado para ${email}`]
      )
      // Actualizar email do consultor se estiver vazio
      await pool.query(
        "UPDATE consultores SET email = $1, updated_at = $2 WHERE id = $3 AND (email IS NULL OR email = '')",
        [email, new Date().toISOString(), rows[0].id]
      )
    }
  } catch (e) {
    console.warn(`  [CRM] Erro ao registar ${nome}: ${e.message}`)
  }
}

// ── Main ──
async function main() {
  console.log('=== Envio de emails de reactivação ===')
  console.log(`Total destinatários: ${uniqueRecipients.length}`)
  console.log(`Modo: ${DRY_RUN ? 'DRY RUN (não envia)' : 'ENVIO REAL'}`)
  console.log('')

  if (!isGoogleConfigured()) {
    console.error('Google OAuth não configurado. Verificar google-oauth.json/google-token.json ou env vars.')
    process.exit(1)
  }

  const auth = getGoogleAuth()
  const gmail = google.gmail({ version: 'v1', auth })
  const lid = await ensureLabel(gmail)

  // Obter email do remetente
  const { data: profile } = await gmail.users.getProfile({ userId: 'me' })
  console.log(`Remetente: ${profile.emailAddress}`)
  console.log('')

  let enviados = 0, falhas = 0

  for (const r of uniqueRecipients) {
    const subject = 'Somnium Properties — Procuramos imóveis com potencial em Coimbra'
    const html = buildEmailHtml(r.nome)

    if (DRY_RUN) {
      console.log(`[DRY] ${r.nome} → ${r.email} (${r.agencia})`)
      enviados++
      continue
    }

    try {
      const raw = buildMimeEmail({ to: r.email, subject, html })
      const { data: sent } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      })

      // Aplicar label
      if (sent.id && lid) {
        await gmail.users.messages.modify({
          userId: 'me', id: sent.id,
          requestBody: { addLabelIds: [lid] },
        })
      }

      // Registar no CRM
      await registarInteraccao(r.nome, r.email)

      console.log(`[OK] ${r.nome} → ${r.email} (${sent.id})`)
      enviados++

      // Delay 2s entre emails (rate limit)
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (e) {
      console.error(`[ERRO] ${r.nome} → ${r.email}: ${e.message}`)
      falhas++
    }
  }

  console.log('')
  console.log(`=== Concluído: ${enviados} enviados, ${falhas} falhas ===`)
  process.exit(0)
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1) })
