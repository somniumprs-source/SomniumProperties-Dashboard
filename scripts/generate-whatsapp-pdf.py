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

# ── 20 Interaccoes ─────────────────────────────────────────────

# 1
add_interaction(story, 1,
    'Primeiro Contacto',
    'Consultor novo envia mensagem pela primeira vez. Nao conhecemos.',
    'Boa tarde, sou a Sofia da Century 21 Coimbra. Disseram-me que voces compram imoveis para renovar.',
    'Ola Sofia! Sou o Alexandre da Somnium Properties. Prazer! '
    'Sim, e exactamente isso que fazemos. Procuramos imoveis com margem em '
    'Coimbra e arredores, ate 250k. Tens algo para partilhar?',
    'RESPONDER_QUEM_SOMOS',
    'Prova de Rigor: "e exactamente isso que fazemos" posiciona como especialista, nao como generalista.'
)

# 2
add_interaction(story, 2,
    'Imovel OURO (Equity + Obras + Pressao)',
    'Consultor apresenta imovel com todos os criterios: preco com margem, obras totais, proprietario motivado.',
    'Alexandre, tenho um predio em Solum, 3 fraccoes. Proprietario emigrou e quer resolver rapido. '
    'Pede 180k mas acho que aceita menos. Precisa de obras totais.',
    'Olha, isto tem muito bom perfil! Predio com 3 fraccoes, obras totais e '
    'proprietario motivado. Consegues dizer-nos a area total e se a estrutura '
    'esta em bom estado? Coberturas, caixilharias, redes. Assim a equipa avanca de imediato.',
    'ADICIONAR \u00b7 Prioridade OURO \u00b7 Confianca 85%',
    'Autoridade: perguntas tecnicas especificas (coberturas, caixilharias, redes) em vez de "como esta o estado?"'
)

story.append(PageBreak())

# 3
add_interaction(story, 3,
    'Imovel Qualificado (Equity + Obras)',
    'Imovel com margem e obras, mas sem pressao de venda explicita.',
    'Boas Alexandre. T3 em Santa Clara, anos 70, precisa de remodelacao completa. Pedem 150k.',
    'Boa, obrigado por partilhares! Bom perfil. Sabes dizer-nos mais ou menos '
    'a area util e qual a situacao do proprietario? Se esta a viver la ou se e heranca, por exemplo.',
    'ADICIONAR \u00b7 Prioridade NORMAL \u00b7 Confianca 70%',
    'Especificidade: pede dados concretos (area, situacao do proprietario) para qualificar melhor o deal.'
)

# 4
add_interaction(story, 4,
    'Imovel Qualificado (Equity + Pressao)',
    'Imovel com margem e proprietario motivado, mas sem indicacao de obras.',
    'Tenho um T2 na Baixa, heranca, querem despachar. 120k. Esta em razoavel estado.',
    'Interessante! A motivacao do proprietario ajuda. Quando dizes "razoavel estado", '
    'a intervencao seria mais ao nivel de acabamentos ou estrutural? E sabes a area aproximada?',
    'ADICIONAR \u00b7 Prioridade NORMAL \u00b7 Confianca 65%',
    'Autoridade: distingue entre obras de acabamentos e estruturais. Mostra conhecimento tecnico.'
)

# 5
add_interaction(story, 5,
    'Triagem (Informacao Insuficiente)',
    'Consultor envia informacao vaga. Precisamos de mais dados para decidir.',
    'Oi! Tenho um apartamento em Coimbra bom preco precisa de umas coisas',
    'Ola! Obrigado por pensares em nos. Para conseguirmos dar-te uma resposta '
    'seria, precisavamos de saber o preco pedido e a zona exacta. Consegues?',
    'TRIAGEM \u00b7 Dados em falta: preco, zona',
    'Especificidade: nao aceita "bom preco" nem "umas coisas". Pede os 2 dados prioritarios.'
)

story.append(PageBreak())

# 6
add_interaction(story, 6,
    'Rejeicao Gentil (Sem Equity)',
    'Imovel sem margem de negociacao. Preco fechado, sem espaco para criar valor.',
    'T2 remodelado em Celas, 220k. Esta impecavel, pronto a habitar. Dono nao baixa.',
    'Obrigado! Este nao encaixa no que procuramos. Precisamos de margem no preco '
    'e este esta muito fechado. Mas continua a enviar, vamos encontrar o negocio certo juntos!',
    'IGNORAR \u00b7 Sem equity, sem obras',
)

# 7
add_interaction(story, 7,
    'Imovel Acima de 250k',
    'Imovel acima do limite, mas nao rejeitar. Avaliar internamente.',
    'Predio inteiro na Fernao de Magalhaes, 4 fraccoes. Pedem 320k. Precisa de tudo.',
    'Obrigado! Vamos avaliar o negocio internamente. O nosso foco principal '
    'sao imoveis ate 250k, mas sendo predio com 4 fraccoes para obra total, vamos analisar na mesma.',
    'ADICIONAR \u00b7 Prioridade NORMAL \u00b7 Nota: acima de 250k',
)

# 8
add_interaction(story, 8,
    'Sem Licenca de Utilizacao',
    'Imovel sem LU. Demonstrar autoridade tecnica e remover obstaculo.',
    'Sera que tens interesse neste apartamento? Custa 200k e precisa de obras. Nao tem licenca de utilizacao.',
    'Obrigado! Pode ter interesse, sim. A questao da licenca nao e problema para nos, '
    'temos processo proprio para regularizacao. Sabes porque nao tem LU? Construcao anterior a 1951, '
    'alteracoes nao licenciadas, ou outra situacao? E a zona e tipologia, consegues confirmar?',
    'TRIAGEM \u00b7 Dados em falta: zona, tipologia, motivo da falta de LU',
    'Autoridade: conhece as causas tipicas da falta de LU. Means-End: "nao e problema para nos" remove obstaculo.'
)

story.append(PageBreak())

# 9
add_interaction(story, 9,
    'Imovel Off-Market',
    'Consultor oferece imovel que nao esta publicamente a venda.',
    'Alexandre, tenho uma coisa off-market. Moradia em Eiras, o dono so vende a quem vier directamente. 190k, precisa de intervencao.',
    'Off-market e exactamente o tipo de oportunidade que valorizamos! '
    'Consegues dizer-nos a area do terreno e da implantacao? E o proprietario, qual a motivacao de venda?',
    'TRIAGEM \u00b7 Dados em falta: area, motivacao',
    'Autoridade: "area do terreno e da implantacao" sao as perguntas certas para moradias.'
)

# 10
add_interaction(story, 10,
    'Link de Portal Sem Comentario',
    'Consultor envia apenas um link do Idealista sem dizer nada.',
    'https://www.idealista.pt/imovel/12345678/',
    'Obrigado! Vimos o anuncio. Vamos analisar e damos-te feedback brevemente.',
    'TRIAGEM \u00b7 Portal detectado: Idealista',
)

# 11
add_interaction(story, 11,
    'Urgencia (Outro Investidor)',
    'Consultor sinaliza que ha competicao. Timer reduzido para 30 segundos.',
    'Alexandre ja tem visitas marcadas com outro investidor esta semana. '
    'Moradia em Eiras, 230k, remodelacao total. Heranca, querem resolver rapido.',
    'Obrigado por avisares! Moradia em Eiras com obras totais e heranca tem muito bom perfil. '
    'Consegues enviar-nos a area do terreno e implantacao? Se a estrutura estiver solida, '
    'conseguimos dar-te uma resposta rapida.',
    'ADICIONAR \u00b7 Prioridade URGENTE \u00b7 Confianca 80%',
    'Means-End: "conseguimos dar-te uma resposta rapida" resolve a pressao do consultor.'
)

story.append(PageBreak())

# 12
add_interaction(story, 12,
    'Pergunta Armadilha: Preco',
    'Consultor tenta saber quanto pagamos normalmente. Nao revelar.',
    'So por curiosidade, quanto e que voces costumam pagar pelos imoveis?',
    'Depende muito do imovel. Cada caso e diferente. '
    'Envia-nos os dados e dizemos-te se faz sentido para nos!',
    'RESPONDER_CRITERIOS \u00b7 Proteccao activada',
)

# 13
add_interaction(story, 13,
    'Pergunta Armadilha: Investidores',
    'Consultor tenta saber quem sao os nossos investidores. Nao revelar.',
    'Trabalham com investidores? Quem sao? Sao de Coimbra?',
    'Trabalhamos com uma rede privada de parceiros. O mais importante e o imovel. '
    'Tens algo para partilhar?',
    'RESPONDER_CRITERIOS \u00b7 Proteccao activada',
)

# 14
add_interaction(story, 14,
    'Quem Somos',
    'Consultor nao sabe quem e a Somnium. Explicar de forma natural.',
    'Desculpa, mas o que e que a Somnium Properties faz exactamente?',
    'Somos a Somnium Properties. Investimos em imoveis com potencial em Coimbra e arredores. '
    'Compramos, renovamos e colocamos novamente no mercado. '
    'Trabalhamos com consultores como tu para encontrar as melhores oportunidades.',
    'RESPONDER_QUEM_SOMOS',
)

story.append(PageBreak())

# 15
add_interaction(story, 15,
    'Que Procuramos',
    'Consultor pergunta directamente que tipo de imoveis queremos.',
    'Que tipo de imoveis estao a procurar? Para saber o que vos enviar.',
    'Procuramos imoveis com margem de negociacao. Construcao antiga ou que precise de obras, '
    'onde haja espaco para criar valor. Zonas de Coimbra, Condeixa e arredores. Ate 250k.',
    'RESPONDER_CRITERIOS',
    'Prova de Rigor: "onde haja espaco para criar valor" posiciona como selectivos, nao como compradores de tudo.'
)

# 16
add_interaction(story, 16,
    'Audio Recebido',
    'Consultor envia mensagem de voz. O agente nao processa audios.',
    '[AUDIO RECEBIDO]',
    'Obrigado pela mensagem! De momento nao conseguimos ouvir audios. '
    'Importas-te de enviar por escrito? Tipologia, zona, preco e se precisa de obras. '
    'Assim conseguimos analisar mais rapido \U0001F44D',
    'TRIAGEM \u00b7 Audio nao processado',
)

# 17
add_interaction(story, 17,
    'Saudacao Casual',
    'Consultor envia "bom dia" sem mencionar imovel. Manter relacao.',
    'Bom dia Alexandre!',
    'Bom dia Sofia! Tudo bem? Como tem corrido por ai? Algum imovel interessante?',
    'IGNORAR \u00b7 Conversa casual, manter relacao',
)

story.append(PageBreak())

# 18
add_interaction(story, 18,
    'Follow-up do Consultor',
    'Consultor pergunta por novidades sobre um imovel ja submetido.',
    'Entao Alexandre, alguma novidade sobre aquele T3 em Santa Clara?',
    'Ainda esta a ser avaliado pela equipa. Assim que tivermos uma posicao, avisamos-te!',
    'AGUARDAR \u00b7 Sem decisao interna ainda',
)

# 19
add_interaction(story, 19,
    'Varios Imoveis de Uma Vez',
    'Consultor envia 3 imoveis numa so mensagem. Nao analisar todos ao detalhe.',
    'Alexandre tenho 3 para ti: T2 em Celas 140k obras parciais, '
    'T3 Santa Clara 160k obras totais heranca, e moradia Eiras 200k terreno grande.',
    'Obrigado, recebemos tudo! Vamos passar os olhos por cada um e damos-te feedback brevemente. '
    'A primeira vista, o T3 em Santa Clara parece ter bom perfil. Vamos confirmar.',
    'ADICIONAR (Santa Clara) + TRIAGEM (Celas, Eiras)',
    'Especificidade: destaca o que mais se alinha com os criterios (obras totais + heranca).'
)

# 20
add_interaction(story, 20,
    'Pedir Documentacao',
    'Imovel ja aprovado internamente. Pedir caderneta, certidao, fotos e CPE.',
    'Que bom! Entao querem avancar com a analise do predio em Solum?',
    'Gostamos muito deste perfil! Para avancarmos com a analise completa, '
    'consegues enviar-nos a caderneta predial e a certidao permanente? '
    'Fotos do interior tambem ajudam muito. Se tiveres o CPE, melhor ainda!',
    'ADICIONAR \u00b7 Documentacao pedida',
    'Means-End: ao pedir documentos concretos, mostramos que levamos o imovel a serio. O consultor sente progresso.'
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
