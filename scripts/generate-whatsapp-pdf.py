#!/usr/bin/env python3
"""
Gera PDF com 20 interaccoes de exemplo do agente WhatsApp da Somnium Properties.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# ── Cores Somnium ──────────────────────────────────────────────
GOLD = HexColor('#C9A84C')
DARK = HexColor('#0d0d0d')
LIGHT_GOLD = HexColor('#F5EDD6')
LIGHT_GRAY = HexColor('#F2F2F2')
MID_GRAY = HexColor('#666666')
GREEN_BUBBLE = HexColor('#DCF8C6')
WHITE_BUBBLE = HexColor('#FFFFFF')
BORDER_GRAY = HexColor('#CCCCCC')

# ── Setup documento ────────────────────────────────────────────
output_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'agente-whatsapp-exemplos.pdf'
)

doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    topMargin=2*cm,
    bottomMargin=2*cm,
    leftMargin=2*cm,
    rightMargin=2*cm,
)

# ── Estilos ────────────────────────────────────────────────────
styles = {
    'title': ParagraphStyle(
        'Title',
        fontName='Helvetica-Bold',
        fontSize=22,
        textColor=DARK,
        spaceAfter=4*mm,
        alignment=TA_LEFT,
    ),
    'subtitle': ParagraphStyle(
        'Subtitle',
        fontName='Helvetica',
        fontSize=12,
        textColor=MID_GRAY,
        spaceAfter=2*mm,
        alignment=TA_LEFT,
    ),
    'section_num': ParagraphStyle(
        'SectionNum',
        fontName='Helvetica-Bold',
        fontSize=11,
        textColor=GOLD,
        spaceAfter=1*mm,
    ),
    'section_title': ParagraphStyle(
        'SectionTitle',
        fontName='Helvetica-Bold',
        fontSize=13,
        textColor=DARK,
        spaceAfter=2*mm,
    ),
    'context': ParagraphStyle(
        'Context',
        fontName='Helvetica-Oblique',
        fontSize=9,
        textColor=MID_GRAY,
        spaceAfter=3*mm,
    ),
    'bubble_consultor': ParagraphStyle(
        'BubbleConsultor',
        fontName='Helvetica',
        fontSize=10,
        textColor=DARK,
        leading=14,
    ),
    'bubble_agente': ParagraphStyle(
        'BubbleAgente',
        fontName='Helvetica',
        fontSize=10,
        textColor=DARK,
        leading=14,
    ),
    'label': ParagraphStyle(
        'Label',
        fontName='Helvetica-Bold',
        fontSize=8,
        textColor=MID_GRAY,
        spaceAfter=1*mm,
    ),
    'decision': ParagraphStyle(
        'Decision',
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=GOLD,
        spaceBefore=2*mm,
    ),
    'note': ParagraphStyle(
        'Note',
        fontName='Helvetica-Oblique',
        fontSize=8,
        textColor=MID_GRAY,
        spaceBefore=1*mm,
        spaceAfter=4*mm,
    ),
    'footer': ParagraphStyle(
        'Footer',
        fontName='Helvetica',
        fontSize=8,
        textColor=MID_GRAY,
        alignment=TA_CENTER,
    ),
    'intro': ParagraphStyle(
        'Intro',
        fontName='Helvetica',
        fontSize=10,
        textColor=DARK,
        leading=15,
        spaceAfter=3*mm,
    ),
    'intro_bold': ParagraphStyle(
        'IntroBold',
        fontName='Helvetica-Bold',
        fontSize=10,
        textColor=DARK,
        leading=15,
        spaceAfter=2*mm,
    ),
}

# ── Funcoes auxiliares ─────────────────────────────────────────
def make_bubble(text, is_agente=False):
    """Cria tabela que simula balao WhatsApp."""
    bg = GREEN_BUBBLE if is_agente else WHITE_BUBBLE
    style = styles['bubble_agente'] if is_agente else styles['bubble_consultor']
    label = 'Alexandre (Agente)' if is_agente else 'Consultor'

    label_para = Paragraph(
        f'<font size="7" color="#{MID_GRAY.hexval()[2:]}">{label}</font>',
        styles['label']
    )
    text_para = Paragraph(text, style)

    # Largura diferente para dar efeito de conversa
    col_width = 130*mm if is_agente else 125*mm

    inner = Table(
        [[label_para], [text_para]],
        colWidths=[col_width],
    )
    inner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ('TOPPADDING', (0, 0), (-1, 0), 3),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER_GRAY),
    ]))

    # Alinhar consultor a esquerda, agente a direita
    if is_agente:
        wrapper = Table([[None, inner]], colWidths=[20*mm, col_width + 4*mm])
    else:
        wrapper = Table([[inner, None]], colWidths=[col_width + 4*mm, 20*mm])

    wrapper.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))

    return wrapper


def add_interaction(story, num, title, context, consultor_msg, agente_msg, decision, note=None):
    """Adiciona uma interaccao completa ao story."""
    # Separador
    if num > 1:
        story.append(Spacer(1, 4*mm))
        story.append(HRFlowable(
            width="100%", thickness=0.5, color=LIGHT_GOLD,
            spaceAfter=4*mm, spaceBefore=2*mm
        ))

    # Numero + titulo
    story.append(Paragraph(f'Interaccao {num}', styles['section_num']))
    story.append(Paragraph(title, styles['section_title']))
    story.append(Paragraph(context, styles['context']))

    # Baloes
    story.append(make_bubble(consultor_msg, is_agente=False))
    story.append(Spacer(1, 2*mm))
    story.append(make_bubble(agente_msg, is_agente=True))

    # Decisao
    story.append(Paragraph(f'Decisao: {decision}', styles['decision']))

    # Nota Cashvertising
    if note:
        story.append(Paragraph(f'Cashvertising: {note}', styles['note']))
    else:
        story.append(Spacer(1, 3*mm))


# ── Conteudo ───────────────────────────────────────────────────
story = []

# ── Capa ───────────────────────────────────────────────────────
story.append(Spacer(1, 40*mm))

# Linha dourada
story.append(HRFlowable(width="40%", thickness=2, color=GOLD, spaceAfter=8*mm))

story.append(Paragraph('Agente WhatsApp', styles['title']))
story.append(Paragraph('Somnium Properties', ParagraphStyle(
    'TitleGold', fontName='Helvetica-Bold', fontSize=22,
    textColor=GOLD, spaceAfter=8*mm
)))
story.append(Paragraph('20 Interaccoes de Exemplo', styles['subtitle']))
story.append(Paragraph('Abril 2026 \u00b7 Documento interno', styles['subtitle']))

story.append(Spacer(1, 20*mm))

# Intro
story.append(Paragraph(
    'Este documento apresenta 20 cenarios reais de interaccao entre o agente '
    'WhatsApp da Somnium Properties e consultores imobiliarios. '
    'O agente responde automaticamente via Twilio, usando inteligencia artificial '
    'treinada com as regras comerciais da empresa.',
    styles['intro']
))
story.append(Paragraph(
    'Cada exemplo mostra a mensagem do consultor, a resposta do agente, '
    'a decisao interna tomada, e (quando aplicavel) o principio de persuasao utilizado.',
    styles['intro']
))

story.append(Spacer(1, 10*mm))

story.append(Paragraph('Caracteristicas do agente:', styles['intro_bold']))
story.append(Paragraph(
    '\u2022 Nome: Alexandre \u00b7 Horario: 08:00\u201323:30<br/>'
    '\u2022 Tom: simpatico, acessivel, sempre na 3.a pessoa do plural ("nos", "a equipa")<br/>'
    '\u2022 Max 3\u20134 linhas por mensagem<br/>'
    '\u2022 Nunca promete prazos concretos<br/>'
    '\u2022 Nunca revela criterios internos, margens ou nomes de investidores<br/>'
    '\u2022 Principios Cashvertising integrados de forma invisivel',
    styles['intro']
))

story.append(PageBreak())

# ── 20 Interac\u00e7\u00f5es ─────────────────────────────────────────────

# 1
add_interaction(story, 1,
    'Primeiro Contacto',
    'Consultor novo envia mensagem pela primeira vez. N\u00e3o conhecemos.',
    'Boa tarde, sou a Sofia da Century 21 Coimbra. Disseram-me que voc\u00eas compram im\u00f3veis para renovar.',
    'Ol\u00e1 Sofia! Sou o Alexandre da Somnium Properties. Prazer! '
    'Sim, \u00e9 exactamente isso que fazemos. Procuramos im\u00f3veis com margem em '
    'Coimbra e arredores, at\u00e9 250k. Tem algo para partilhar?',
    'RESPONDER_QUEM_SOMOS',
    'Prova de Rigor: "\u00e9 exactamente isso que fazemos" posiciona como especialista, n\u00e3o como generalista.'
)

# 2
add_interaction(story, 2,
    'Im\u00f3vel OURO (Equity + Obras + Press\u00e3o)',
    'Consultor apresenta im\u00f3vel com todos os crit\u00e9rios: pre\u00e7o com margem, obras totais, propriet\u00e1rio motivado.',
    'Alexandre, tenho um pr\u00e9dio em Solum, 3 frac\u00e7\u00f5es. Propriet\u00e1rio emigrou e quer resolver r\u00e1pido. '
    'Pede 180k mas acho que aceita menos. Precisa de obras totais.',
    'Olha, isto tem muito bom perfil! Pr\u00e9dio com 3 frac\u00e7\u00f5es, obras totais e '
    'propriet\u00e1rio motivado. Consegue dizer-nos a \u00e1rea total e se a estrutura '
    'est\u00e1 em bom estado? Coberturas, caixilharias, redes. Vamos p\u00f4r a equipa a analisar.',
    'ADICIONAR \u00b7 Prioridade OURO \u00b7 Confian\u00e7a 85%',
    'Autoridade: perguntas t\u00e9cnicas espec\u00edficas (coberturas, caixilharias, redes) em vez de "como est\u00e1 o estado?"'
)

story.append(PageBreak())

# 3
add_interaction(story, 3,
    'Im\u00f3vel Qualificado (Equity + Obras)',
    'Im\u00f3vel com margem e obras, mas sem press\u00e3o de venda expl\u00edcita.',
    'Boas Alexandre. T3 em Santa Clara, anos 70, precisa de remodela\u00e7\u00e3o completa. Pedem 150k.',
    'Boa, obrigado por partilhar! Bom perfil. Sabe dizer-nos mais ou menos '
    'a \u00e1rea \u00fatil e qual a situa\u00e7\u00e3o do propriet\u00e1rio? Se est\u00e1 a viver l\u00e1 ou se \u00e9 heran\u00e7a, por exemplo.',
    'ADICIONAR \u00b7 Prioridade NORMAL \u00b7 Confian\u00e7a 70%',
    'Especificidade: pede dados concretos (\u00e1rea, situa\u00e7\u00e3o do propriet\u00e1rio) para qualificar melhor o deal.'
)

# 4
add_interaction(story, 4,
    'Im\u00f3vel Qualificado (Equity + Press\u00e3o)',
    'Im\u00f3vel com margem e propriet\u00e1rio motivado, mas sem indica\u00e7\u00e3o de obras.',
    'Tenho um T2 na Baixa, heran\u00e7a, querem despachar. 120k. Est\u00e1 em razo\u00e1vel estado.',
    'Interessante! A motiva\u00e7\u00e3o do propriet\u00e1rio ajuda. Quando diz "razo\u00e1vel estado", '
    'a interven\u00e7\u00e3o seria mais ao n\u00edvel de acabamentos ou estrutural? E sabe a \u00e1rea aproximada?',
    'ADICIONAR \u00b7 Prioridade NORMAL \u00b7 Confian\u00e7a 65%',
    'Autoridade: distingue entre obras de acabamentos e estruturais. Mostra conhecimento t\u00e9cnico.'
)

# 5
add_interaction(story, 5,
    'Triagem (Informa\u00e7\u00e3o Insuficiente)',
    'Consultor envia informa\u00e7\u00e3o vaga. Precisamos de mais dados para decidir.',
    'Oi! Tenho um apartamento em Coimbra bom pre\u00e7o precisa de umas coisas',
    'Ol\u00e1! Obrigado por pensar em n\u00f3s. Para conseguirmos dar uma resposta '
    's\u00e9ria, precis\u00e1vamos de saber o pre\u00e7o pedido e a zona exacta. Consegue?',
    'TRIAGEM \u00b7 Dados em falta: pre\u00e7o, zona',
    'Especificidade: n\u00e3o aceita "bom pre\u00e7o" nem "umas coisas". Pede os 2 dados priorit\u00e1rios.'
)

story.append(PageBreak())

# 6
add_interaction(story, 6,
    'Rejei\u00e7\u00e3o Gentil (Sem Equity)',
    'Im\u00f3vel sem margem de negocia\u00e7\u00e3o. Pre\u00e7o fechado, sem espa\u00e7o para criar valor.',
    'T2 remodelado em Celas, 220k. Est\u00e1 impec\u00e1vel, pronto a habitar. Dono n\u00e3o baixa.',
    'Obrigado! Este n\u00e3o encaixa no que procuramos. Precisamos de margem no pre\u00e7o '
    'e este est\u00e1 muito fechado. Mas continue a enviar, vamos encontrar o neg\u00f3cio certo juntos!',
    'IGNORAR \u00b7 Sem equity, sem obras',
)

# 7
add_interaction(story, 7,
    'Im\u00f3vel Acima de 250k',
    'Im\u00f3vel acima do limite, mas n\u00e3o rejeitar. Avaliar internamente.',
    'Pr\u00e9dio inteiro na Fern\u00e3o de Magalh\u00e3es, 4 frac\u00e7\u00f5es. Pedem 320k. Precisa de tudo.',
    'Obrigado! Vamos avaliar o neg\u00f3cio internamente. O nosso foco principal '
    's\u00e3o im\u00f3veis at\u00e9 250k, mas sendo pr\u00e9dio com 4 frac\u00e7\u00f5es para obra total, vamos analisar na mesma.',
    'ADICIONAR \u00b7 Prioridade NORMAL \u00b7 Nota: acima de 250k',
)

# 8
add_interaction(story, 8,
    'Sem Licen\u00e7a de Utiliza\u00e7\u00e3o',
    'Im\u00f3vel sem LU. Demonstrar autoridade t\u00e9cnica e remover obst\u00e1culo.',
    'Ser\u00e1 que t\u00eam interesse neste apartamento? Custa 200k e precisa de obras. N\u00e3o tem licen\u00e7a de utiliza\u00e7\u00e3o.',
    'Obrigado! Pode ter interesse, sim. A quest\u00e3o da licen\u00e7a n\u00e3o \u00e9 problema para n\u00f3s, '
    'temos processo pr\u00f3prio para regulariza\u00e7\u00e3o. Sabe porque n\u00e3o tem LU? Constru\u00e7\u00e3o anterior a 1951, '
    'altera\u00e7\u00f5es n\u00e3o licenciadas, ou outra situa\u00e7\u00e3o? E a zona e tipologia, consegue confirmar?',
    'TRIAGEM \u00b7 Dados em falta: zona, tipologia, motivo da falta de LU',
    'Autoridade: conhece as causas t\u00edpicas da falta de LU. Means-End: "n\u00e3o \u00e9 problema para n\u00f3s" remove obst\u00e1culo.'
)

story.append(PageBreak())

# 9
add_interaction(story, 9,
    'Im\u00f3vel Off-Market',
    'Consultor oferece im\u00f3vel que n\u00e3o est\u00e1 publicamente \u00e0 venda.',
    'Alexandre, tenho uma coisa off-market. Moradia em Eiras, o dono s\u00f3 vende a quem vier directamente. 190k, precisa de interven\u00e7\u00e3o.',
    'Off-market \u00e9 exactamente o tipo de oportunidade que valorizamos! '
    'Consegue dizer-nos a \u00e1rea do terreno e da implanta\u00e7\u00e3o? E o propriet\u00e1rio, qual a motiva\u00e7\u00e3o de venda?',
    'TRIAGEM \u00b7 Dados em falta: \u00e1rea, motiva\u00e7\u00e3o',
    'Autoridade: "\u00e1rea do terreno e da implanta\u00e7\u00e3o" s\u00e3o as perguntas certas para moradias.'
)

# 10
add_interaction(story, 10,
    'Link de Portal Sem Coment\u00e1rio',
    'Consultor envia apenas um link do Idealista sem dizer nada.',
    'https://www.idealista.pt/imovel/12345678/',
    'Obrigado! Vimos o an\u00fancio. Vamos analisar e damos feedback brevemente.',
    'TRIAGEM \u00b7 Portal detectado: Idealista',
)

# 11
add_interaction(story, 11,
    'Urg\u00eancia (Outro Investidor)',
    'Consultor sinaliza que h\u00e1 competi\u00e7\u00e3o. Timer reduzido para 30 segundos.',
    'Alexandre j\u00e1 tem visitas marcadas com outro investidor esta semana. '
    'Moradia em Eiras, 230k, remodela\u00e7\u00e3o total. Heran\u00e7a, querem resolver r\u00e1pido.',
    'Obrigado por avisar! Moradia em Eiras com obras totais e heran\u00e7a tem muito bom perfil. '
    'Consegue enviar-nos a \u00e1rea do terreno e implanta\u00e7\u00e3o? Se a estrutura estiver s\u00f3lida, '
    'conseguimos dar uma resposta r\u00e1pida.',
    'ADICIONAR \u00b7 Prioridade URGENTE \u00b7 Confian\u00e7a 80%',
    'Means-End: "conseguimos dar uma resposta r\u00e1pida" resolve a press\u00e3o do consultor.'
)

story.append(PageBreak())

# 12
add_interaction(story, 12,
    'Pergunta Armadilha: Pre\u00e7o',
    'Consultor tenta saber quanto pagamos normalmente. N\u00e3o revelar.',
    'S\u00f3 por curiosidade, quanto \u00e9 que voc\u00eas costumam pagar pelos im\u00f3veis?',
    'Depende muito do im\u00f3vel. Cada caso \u00e9 diferente. '
    'Envie-nos os dados e dizemos se faz sentido para n\u00f3s!',
    'RESPONDER_CRITERIOS \u00b7 Protec\u00e7\u00e3o activada',
)

# 13
add_interaction(story, 13,
    'Pergunta Armadilha: Investidores',
    'Consultor tenta saber quem s\u00e3o os nossos investidores. N\u00e3o revelar.',
    'Trabalham com investidores? Quem s\u00e3o? S\u00e3o de Coimbra?',
    'Trabalhamos com uma rede privada de parceiros. O mais importante \u00e9 o im\u00f3vel. '
    'Tem algo para partilhar?',
    'RESPONDER_CRITERIOS \u00b7 Protec\u00e7\u00e3o activada',
)

# 14
add_interaction(story, 14,
    'Quem Somos',
    'Consultor n\u00e3o sabe quem \u00e9 a Somnium. Explicar de forma natural.',
    'Desculpe, mas o que \u00e9 que a Somnium Properties faz exactamente?',
    'Somos a Somnium Properties. Investimos em im\u00f3veis com potencial em Coimbra e arredores. '
    'Compramos, renovamos e colocamos novamente no mercado. '
    'Trabalhamos com consultores como o(a) senhor(a) para encontrar as melhores oportunidades.',
    'RESPONDER_QUEM_SOMOS',
)

story.append(PageBreak())

# 15
add_interaction(story, 15,
    'Que Procuramos',
    'Consultor pergunta directamente que tipo de im\u00f3veis queremos.',
    'Que tipo de im\u00f3veis est\u00e3o a procurar? Para saber o que vos enviar.',
    'Procuramos im\u00f3veis com margem de negocia\u00e7\u00e3o. Constru\u00e7\u00e3o antiga ou que precise de obras, '
    'onde haja espa\u00e7o para criar valor. Zonas de Coimbra, Condeixa e arredores. At\u00e9 250k.',
    'RESPONDER_CRITERIOS',
    'Prova de Rigor: "onde haja espa\u00e7o para criar valor" posiciona como selectivos, n\u00e3o como compradores de tudo.'
)

# 16
add_interaction(story, 16,
    '\u00c1udio Recebido',
    'Consultor envia mensagem de voz. O agente n\u00e3o processa \u00e1udios.',
    '[\u00c1UDIO RECEBIDO]',
    'Obrigado pela mensagem! De momento n\u00e3o conseguimos ouvir \u00e1udios. '
    'Importa-se de enviar por escrito? Tipologia, zona, pre\u00e7o e se precisa de obras. '
    'Assim conseguimos analisar mais r\u00e1pido \U0001F44D',
    'TRIAGEM \u00b7 \u00c1udio n\u00e3o processado',
)

# 17
add_interaction(story, 17,
    'Sauda\u00e7\u00e3o Casual',
    'Consultor envia "bom dia" sem mencionar im\u00f3vel. Manter rela\u00e7\u00e3o.',
    'Bom dia Alexandre!',
    'Bom dia Sofia! Tudo bem? Como t\u00eam corrido as coisas? Algum im\u00f3vel interessante?',
    'IGNORAR \u00b7 Conversa casual, manter rela\u00e7\u00e3o',
)

story.append(PageBreak())

# 18
add_interaction(story, 18,
    'Follow-up do Consultor',
    'Consultor pergunta por novidades sobre um im\u00f3vel j\u00e1 submetido.',
    'Ent\u00e3o Alexandre, alguma novidade sobre aquele T3 em Santa Clara?',
    'Ainda est\u00e1 a ser avaliado pela equipa. Assim que tivermos uma posi\u00e7\u00e3o, avisamos!',
    'AGUARDAR \u00b7 Sem decis\u00e3o interna ainda',
)

# 19
add_interaction(story, 19,
    'V\u00e1rios Im\u00f3veis de Uma Vez',
    'Consultor envia 3 im\u00f3veis numa s\u00f3 mensagem. N\u00e3o analisar todos ao detalhe.',
    'Alexandre tenho 3 para si: T2 em Celas 140k obras parciais, '
    'T3 Santa Clara 160k obras totais heran\u00e7a, e moradia Eiras 200k terreno grande.',
    'Obrigado, recebemos tudo! Vamos analisar cada um e damos feedback brevemente. '
    '\u00c0 primeira vista, o T3 em Santa Clara parece ter bom perfil. Vamos confirmar.',
    'ADICIONAR (Santa Clara) + TRIAGEM (Celas, Eiras)',
    'Especificidade: destaca o que mais se alinha com os crit\u00e9rios (obras totais + heran\u00e7a).'
)

# 20
add_interaction(story, 20,
    'Pedir Documenta\u00e7\u00e3o',
    'Im\u00f3vel j\u00e1 aprovado internamente. Pedir caderneta, certid\u00e3o, fotos e CPE.',
    'Que bom! Ent\u00e3o querem avan\u00e7ar com a an\u00e1lise do pr\u00e9dio em Solum?',
    'Gostamos muito deste perfil! Para avan\u00e7armos com a an\u00e1lise completa, '
    'consegue enviar-nos a caderneta predial e a certid\u00e3o permanente? '
    'Fotos do interior tamb\u00e9m ajudam muito. Se tiver o CPE, melhor ainda!',
    'ADICIONAR \u00b7 Documenta\u00e7\u00e3o pedida',
    'Means-End: ao pedir documentos concretos, mostramos que levamos o im\u00f3vel a s\u00e9rio. O consultor sente progresso.'
)

# ── Rodape ─────────────────────────────────────────────────────
story.append(Spacer(1, 10*mm))
story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=4*mm))
story.append(Paragraph(
    'Somnium Properties \u00b7 Documento interno \u00b7 Abril 2026<br/>'
    'Agente WhatsApp v1.0 \u00b7 Principios Cashvertising integrados',
    styles['footer']
))

# ── Build ──────────────────────────────────────────────────────
def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MID_GRAY)
    canvas.drawRightString(A4[0] - 2*cm, 1.2*cm, f'{doc.page}')
    # Linha dourada no topo
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(1.5)
    canvas.line(2*cm, A4[1] - 1.5*cm, A4[0] - 2*cm, A4[1] - 1.5*cm)
    canvas.restoreState()

doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
print(f'PDF gerado: {output_path}')
