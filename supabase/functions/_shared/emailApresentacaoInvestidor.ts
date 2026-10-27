// @ts-nocheck
/**
 * Email de apresentação da Somnium enviado ao lead logo após submeter o
 * formulário da landing page (/investir), para chegar à primeira chamada já
 * com contexto. Só leads novos: um lead existente actualizado por telemóvel
 * não volta a receber.
 * Espelho de src/db/emailApresentacaoInvestidor.js (manter em sync).
 */

export const REPLY_TO_APRESENTACAO = 'somniumprs@gmail.com'

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

const bloco = (titulo, corpo) => `
    <div style="background: #f9fafb; border-left: 3px solid #C9A84C; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <p style="margin: 0; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">${titulo}</p>
      <p style="margin: 6px 0 0; font-size: 14px; color: #0d0d0d; line-height: 1.6;">${corpo}</p>
    </div>`

// Os valores do formulário vêm como o lead os escreveu: aparecem tal e qual
// (escapados) e o texto à volta muda só com o objetivo, que é uma pill fixa.
function textoPerfil({ objetivo, experiencia, capital, empreiteiro }) {
  const linhas = [
    objetivo && ['Objetivo', objetivo],
    experiencia && ['Experiência', experiencia],
    capital && ['Capital disponível', capital],
    empreiteiro && ['Equipa de obras', empreiteiro],
  ].filter(Boolean)
  const resumo = linhas.map(([k, v]) => `<strong>${k}:</strong> ${escapeHtml(v)}`).join('<br>')
  const resumoTxt = linhas.map(([k, v]) => `${k}: ${v}`).join('\n')
  const leitura = objetivo === 'Retorno passivo'
    ? 'Para quem procura retorno sem gerir a operação, o CAEP é normalmente o modelo mais adequado: a Somnium executa tudo e o investidor acompanha cada marco.'
    : objetivo === 'Gerir o meu projeto'
      ? 'Para quem quer gerir o próprio projeto, acrescentamos valor sobretudo na identificação de oportunidades (cedência de posição) e no apoio à execução de obra.'
      : 'Na chamada vamos perceber qual dos modelos se adequa melhor ao que procura.'
  return {
    html: `${resumo ? `${resumo}<br><br>` : ''}${leitura}`,
    text: `${resumoTxt ? `${resumoTxt}\n\n` : ''}${leitura}`,
  }
}

export function emailApresentacaoInvestidor({ nome, objetivo, experiencia, capital, empreiteiro }) {
  const primeiroNome = String(nome || '').trim().split(/\s+/)[0] || ''
  const perfil = textoPerfil({ objetivo, experiencia, capital, empreiteiro })

  const intro = 'Obrigado por ter preenchido o nosso formulário de investidor. Antes de falarmos por telefone, deixo-lhe uma breve apresentação de quem somos e de como trabalhamos, para que a nossa conversa seja o mais útil possível.'
  const quemSomos = 'A Somnium Properties é uma empresa de investimento imobiliário com origem em Coimbra. Temos atualmente duas operações em curso na região de Coimbra e estamos a expandir a atividade para o Porto e Vila Nova de Gaia, onde estamos a construir uma rede de investidores e parceiros.'
  const modelos = [
    ['Fix &amp; Flip', 'Fix & Flip', 'aquisição, reabilitação e venda de imóveis.'],
    ['CAEP', 'CAEP', 'parcerias em que gerimos a operação de ponta a ponta e o investidor participa com capital.'],
    ['Cedência de posição', 'Cedência de posição', 'identificamos e negociamos oportunidades que cedemos a investidores ativos, com possibilidade de acompanhamento e consultoria de obra.'],
  ]
  const proximo = 'Nos próximos dias vou ligar-lhe para perceber melhor o que procura e avaliarmos juntos se faz sentido trabalharmos em parceria. Se preferir marcar um dia e uma hora, basta responder a este email ou ligar-me diretamente.'

  const subject = 'Somnium Properties | A sua candidatura de investidor'
  const html = `
<div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff;">
  <div style="background: #0d0d0d; padding: 24px; border-radius: 12px; text-align: center;">
    <p style="color: #C9A84C; font-size: 11px; letter-spacing: 1px; margin: 0; text-transform: uppercase;">SOMNIUM PROPERTIES</p>
    <h1 style="color: #C9A84C; margin: 8px 0 0; font-size: 22px;">Olá${primeiroNome ? `, ${escapeHtml(primeiroNome)}` : ''}</h1>
  </div>
  <div style="padding: 24px 0;">
    <p style="font-size: 15px; color: #1f2937; line-height: 1.6;">${intro}</p>
    ${bloco('Quem somos', quemSomos)}
    ${bloco('Como trabalhamos', modelos.map(([h, , d]) => `<strong>${h}:</strong> ${d}`).join('<br>'))}
    ${bloco('O seu perfil', perfil.html)}
    ${bloco('Próximo passo', proximo)}
  </div>
  <div style="border-top: 1px solid #e5e7eb; padding-top: 16px;">
    <p style="font-size: 14px; color: #1f2937; margin: 0 0 4px;">Com os melhores cumprimentos,</p>
    <p style="font-size: 14px; color: #0d0d0d; margin: 0; font-weight: 600;">Alexandre Mendes</p>
    <p style="font-size: 13px; color: #6b7280; margin: 2px 0 0;">CFO | Somnium Properties</p>
    <p style="font-size: 13px; color: #6b7280; margin: 2px 0 0;">925 323 797 | somniumprs@gmail.com</p>
  </div>
</div>`

  const text = [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}`,
    intro,
    `QUEM SOMOS\n${quemSomos}`,
    `COMO TRABALHAMOS\n${modelos.map(([, t, d]) => `${t}: ${d}`).join('\n')}`,
    `O SEU PERFIL\n${perfil.text}`,
    `PRÓXIMO PASSO\n${proximo}`,
    'Com os melhores cumprimentos,\nAlexandre Mendes\nCFO | Somnium Properties\n925 323 797 | somniumprs@gmail.com',
  ].join('\n\n')

  return { subject, html, text }
}
