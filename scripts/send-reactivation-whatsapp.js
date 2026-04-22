#!/usr/bin/env node
/**
 * Envio em massa de mensagem de reactivação a consultores via WhatsApp (Twilio).
 * Puxa consultores com contacto da BD, envia mensagem personalizada,
 * regista interacção no CRM.
 *
 * Uso: node scripts/send-reactivation-whatsapp.js [--dry-run]
 *
 * Pré-requisito: conta Twilio verificada pela Meta.
 */
import 'dotenv/config'
import pool from '../src/db/pg.js'
import { randomUUID } from 'crypto'

const DRY_RUN = process.argv.includes('--dry-run')

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER

// ── Mensagem de reactivação (adaptada do email para WhatsApp) ──
function buildMessage(nome) {
  const primeiroNome = nome.split(' ')[0]
  return `Boa tarde ${primeiroNome}, sou o Alexandre Mendes da Somnium Properties.

Mudei recentemente de contacto e estou a retomar a comunicação com consultores com quem já trabalhei ou que operam na zona de Coimbra.

Investimos em imóveis com potencial de valorização. Compramos directamente, renovamos e recolocamos no mercado. Trabalhamos com consultores como parceiros de negócio e valorizamos quem nos apresenta boas oportunidades.

*O que procuramos:*
• Imóveis com margem de negociação, construção anterior a 2000 ou que precisem de obras
• Proprietário com motivação concreta para vender (herança, emigração, divórcio, dificuldades financeiras)
• Questões de licenciamento ou documentação não são impedimento
• Zonas: concelho de Coimbra, zona central de Condeixa-a-Nova e Ventosa do Bairro (Mealhada)
• Valor máximo de aquisição: 250.000€

Quando encontramos o imóvel certo, avançamos com rapidez e sem burocracia.

Se cruzar com algo neste perfil, basta responder aqui. Cumprimentos.`
}

// ── Enviar WhatsApp via Twilio ──
async function enviarWhatsApp(telefone, mensagem) {
  const twilio = (await import('twilio')).default
  const client = twilio(TWILIO_SID, TWILIO_TOKEN)
  const to = telefone.startsWith('whatsapp:') ? telefone : `whatsapp:${telefone.replace(/\s/g, '')}`
  return client.messages.create({
    from: TWILIO_NUMBER,
    to,
    body: mensagem,
  })
}

// ── Registar interacção no CRM ──
async function registarInteraccao(consultorId, telefone) {
  await pool.query(
    'INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)',
    [randomUUID(), consultorId, new Date().toISOString(), 'whatsapp', 'Enviado', `[REACTIVAÇÃO WHATSAPP] Mensagem de reactivação enviada para ${telefone}`]
  )
}

// ── Main ──
async function main() {
  console.log('=== Envio de reactivação por WhatsApp ===')
  console.log(`Modo: ${DRY_RUN ? 'DRY RUN (não envia)' : 'ENVIO REAL'}`)
  console.log('')

  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_NUMBER) {
    console.error('Twilio não configurado. Verificar TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_NUMBER no .env')
    process.exit(1)
  }

  // Buscar consultores com contacto telefónico (exclui inativos e sem número)
  const { rows: consultores } = await pool.query(`
    SELECT id, nome, contacto, classificacao, estado_avaliacao
    FROM consultores
    WHERE contacto IS NOT NULL
      AND contacto != ''
      AND estado_avaliacao != 'Inativo'
    ORDER BY classificacao ASC, nome ASC
  `)

  console.log(`Consultores com contacto: ${consultores.length}`)
  console.log('')

  // Filtrar números válidos (formato português: +351 ou 9xxxxxxxx)
  const validos = consultores.filter(c => {
    const num = c.contacto.replace(/[\s\-()]/g, '')
    return /^(\+351)?9\d{8}$/.test(num) || /^whatsapp:\+351/.test(num)
  })

  console.log(`Com número válido para WhatsApp: ${validos.length}`)
  console.log('')

  let enviados = 0, falhas = 0

  for (const c of validos) {
    const msg = buildMessage(c.nome)
    const telefone = c.contacto.replace(/[\s\-()]/g, '')
    const numFormatado = telefone.startsWith('+') || telefone.startsWith('whatsapp:')
      ? telefone
      : `+351${telefone}`

    if (DRY_RUN) {
      console.log(`[DRY] ${c.nome} (${c.classificacao || 'D'}) → ${numFormatado}`)
      enviados++
      continue
    }

    try {
      const sent = await enviarWhatsApp(numFormatado, msg)
      await registarInteraccao(c.id, numFormatado)
      console.log(`[OK] ${c.nome} → ${numFormatado} (SID: ${sent.sid})`)
      enviados++

      // Delay 3s entre mensagens (rate limit Twilio)
      await new Promise(resolve => setTimeout(resolve, 3000))
    } catch (e) {
      console.error(`[ERRO] ${c.nome} → ${numFormatado}: ${e.message}`)
      falhas++
    }
  }

  console.log('')
  console.log(`=== Concluído: ${enviados} enviados, ${falhas} falhas ===`)

  await pool.end()
}

main().catch(e => {
  console.error('Erro fatal:', e)
  process.exit(1)
})
