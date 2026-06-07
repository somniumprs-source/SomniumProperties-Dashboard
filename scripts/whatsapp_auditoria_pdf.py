#!/usr/bin/env python3
"""
Auditoria de Ideias e Visao de Melhoria — Somnium Properties (semana W23).

Reutiliza os helpers visuais de whatsapp_weekly_report.py (paleta gold/preto,
capa empresarial, footer confidencial, headers com letter-spacing) para
renderizar o documento de auditoria de ideias + melhoria da semana.

Uso:
    python scripts/whatsapp_auditoria_pdf.py

Output: Relatorios/2026-W23/auditoria-ideias-melhoria-2026-W23.pdf
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

import whatsapp_weekly_report as wr
from whatsapp_weekly_report import (
    GOLD, BLACK, DARK, WHITE, LIGHT, BODY, MUTED, BORDER,
    PW, PH, ML, PT, PB, CW, LOGO_PATH,
    page_break, render_footer, hdr, sec, bullet, wrap_text, kpi_card,
    _logo_fallback,
)

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "Relatorios" / "2026-W23"
OUT_PATH = OUT_DIR / "auditoria-ideias-melhoria-2026-W23.pdf"

DATA_GERACAO = "2026-06-07"
REF = "WSP-AUD-2026-W23"


# ── Capa ────────────────────────────────────────────────────────────────────

def render_capa(c: canvas.Canvas) -> None:
    c.setFillColor(BLACK)
    c.rect(0, 0, PW, PH, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(0, PH - 5, PW, 5, stroke=0, fill=1)
    c.saveState()
    c.setFillAlpha(0.3)
    c.setFillColor(GOLD)
    c.rect(35, 80, 2, PH - 160, stroke=0, fill=1)
    c.restoreState()

    logo_x = (PW - 200) / 2
    logo_y = PH - 100 - 200
    if LOGO_PATH.exists():
        try:
            c.drawImage(str(LOGO_PATH), logo_x, logo_y, width=200, height=200,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            _logo_fallback(c)
    else:
        _logo_fallback(c)

    c.setFillColor(GOLD)
    c.rect(PW / 2 - 30, PH - 270 - 1, 60, 1, stroke=0, fill=1)

    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 9)
    eyebrow = "A U D I T O R I A   D E   I D E I A S   E   M E L H O R I A"
    c.drawCentredString(PW / 2, PH - 295, eyebrow)

    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(PW / 2, PH - 350, "Semana W23")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 11)
    c.drawCentredString(PW / 2, PH - 380, "1 de Junho  a  7 de Junho de 2026")

    c.setFillColor(HexColor("#888888"))
    c.setFont("Helvetica", 9)
    c.drawCentredString(PW / 2, PH - 405,
                        "3 conversas  ·  532 mensagens  ·  132 audios analisados")

    c.setFillColor(DARK)
    c.rect(0, 0, PW, 60, stroke=0, fill=1)
    c.saveState()
    c.setFillAlpha(0.5)
    c.setFillColor(GOLD)
    c.rect(0, 60, PW, 1, stroke=0, fill=1)
    c.restoreState()
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(PW / 2, 35, "SOMNIUM PROPERTIES · CONFIDENCIAL")
    c.setFillColor(HexColor("#666666"))
    c.setFont("Helvetica", 7)
    c.drawCentredString(PW / 2, 20, f"Ref. {REF} · {DATA_GERACAO}")


# ── Helpers de conteudo ──────────────────────────────────────────────────────

def para(c: canvas.Canvas, y: float, text: str, size: int = 9,
         leading: float = 12.5, color=BODY) -> float:
    y = page_break(c, y, 30)
    return wrap_text(c, ML, y, CW, text, size, leading=leading, color=color) - 4


def subtitulo(c: canvas.Canvas, y: float, title: str) -> float:
    y = page_break(c, y, 40)
    return sec(c, title, y)


def item_bullet(c: canvas.Canvas, y: float, text: str, marker: str = "tri") -> float:
    y = page_break(c, y, 26)
    return bullet(c, y, text, marker=marker) - 5


def numbered(c: canvas.Canvas, y: float, n: int, text: str) -> float:
    y = page_break(c, y, 26)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(ML, y - 9, f"{n}.")
    new_y = wrap_text(c, ML + 18, y, CW - 22, text, 9, leading=12.5)
    return new_y - 6


def section_header(c: canvas.Canvas, title: str) -> float:
    c.showPage()
    y = PH - PT
    y = hdr(c, title, y)
    return y - 6


# ── Documento ────────────────────────────────────────────────────────────────

def build() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT_PATH), pagesize=A4)

    # Capa
    render_capa(c)

    # ── Pagina: contexto + KPIs ──────────────────────────────────────────────
    c.showPage()
    y = PH - PT
    y = hdr(c, "CONTEXTO", y) - 6
    y = para(c, y,
             "Documento de trabalho que extrai as ideias discutidas durante a semana "
             "(CEO, Investidores e Implementacao Claude Code) para que nada se perca, "
             "e acrescenta uma visao de melhoria sobre o que foi falado. Resulta da "
             "auditoria pedida no audio de domingo: exportar os audios da semana e "
             "consolidar as ideias antes que fiquem esquecidas.")
    y -= 6

    card_w = (CW - 24) / 3
    card_h = 56
    y = page_break(c, y, card_h + 10)
    kpi_card(c, ML, y, card_w, card_h, "Ideias capturadas", "30+")
    kpi_card(c, ML + card_w + 12, y, card_w, card_h, "Decisoes registadas", "8")
    kpi_card(c, ML + 2 * (card_w + 12), y, card_w, card_h, "Areas de melhoria", "8")
    y -= card_h + 16
    y = para(c, y,
             "Destaque para a reuniao: a decisao da estrutura societaria esta a ser "
             "tomada sem fechar a duvida que a propria contabilista levantou (1 empresa "
             "vs 3 entidades). Vale resolver isso antes de assumir o custo recorrente.",
             color=BLACK)

    # ── 1. Banco de ideias ───────────────────────────────────────────────────
    y = section_header(c, "BANCO DE IDEIAS (PARA NAO SE PERDER)")
    banco = [
        ("Estrutura e empresa", [
            "Estrutura de 3 entidades: empresa A (Alexandre + Joao, 50/50), empresa B (Luis, 100%) e empresa conjunta (66% A / 33% B).",
            "Conceito de vesting levantado na reuniao da contabilista (proteger a quota se um socio sair). Por aprofundar.",
            "Duvida em aberto: poderia bastar 1 empresa com 2 modelos internos, em vez de duas.",
            "Morada fiscal na casa do Alexandre (um socio tem de ser proprietario da morada).",
            "Opcao empresa na hora online vs balcao; mapear cartorios/IRN com marcacao rapida.",
        ]),
        ("Negocios em curso", [
            "Lajes: proposta de 315.000 euros pelas 3 fraccoes, com interesse na 4.a apos reabilitacao.",
            "Cedencia de Braga (Daniel): CPCV em numerario; visita quarta 10h com investidor + empreiteiro.",
            "NOZ Investimentos: certidao permanente + procuracao recebidas; compra em numerario.",
            "Santo Varao: cedencia de ~40k em estudo (Rafael Simoes como possivel alvo).",
            "Predio de fraccoes: estruturar em 2 cenarios (conjunto vs separado), equilibrar ROI das fraccoes.",
        ]),
        ("Plataforma / produto digital (ideia maior)", [
            "Comercializar o CRM/dashboard como produto (CRM de imoveis + investidores + consultores + construtores, dashboard, gestao de projetos, modulo financeiro). Nao existe equivalente no mercado.",
            "Preco discutido: ~49 a 99 euros inicial + mensalidade ~49 euros. Alvo: nicho comum a preco baixo, nao consultores topo.",
            "Trazer Diogo (desenvolvimento) e/ou Ruben (gestao) com 30-50% por assumir parte tecnica + comercial.",
            "Reforcar camada de metricas (marketing, financeiras, operacionais) para tornar o produto mais forte.",
            "Programa de referencia/descontos; publicidade via Veda/Diogo.",
        ]),
        ("Aplicacao (melhorias tecnicas definidas)", [
            "Wholesaling: valor de compra = valor com cedencia; ROI ja com cedencia; faturacao = cedencia menos proposta.",
            "Esconder automaticamente campos/documentos irrelevantes no estado wholesaling; recuperar se voltar a flip/CAEP.",
            "ROI medio por modelo (expectavel, anualizado e real), sobre todos os negocios.",
            "Reanalisar moradia do Candal como moradia (estava como 2 apartamentos); corrigir valores.",
            "Repor purga automatica (quebrou apos migracao para o Marcelo); solucao para imoveis por fraccao.",
        ]),
        ("Pipeline e comercial", [
            "Meta de 10 investidores ativos classe A; sempre 2-3 prontos por criterio.",
            "Elsio (capital/equipa sem problema, ROI 40-50%, 60% anualizado fora do Porto).",
            "Sintia (~130k, dois negocios quase fechados, follow-up 1 Jul); Daniel Nogueira (classificar quarta); FlipWise (4 responderam, ticket 300k).",
            "Landing page de investir como funil de classificacao.",
            "Resumo da zona Porto/Gaia (como o Joao fez para Coimbra) para apoiar a pesquisa.",
        ]),
        ("Metodo de trabalho", [
            "Regra Claude Code: so partilhar versoes finais lidas, corrigidas e validadas.",
            "Auditar os audios da semana para nao perder ideias (este documento).",
        ]),
    ]
    for title, items in banco:
        y = subtitulo(c, y, title)
        for it in items:
            y = item_bullet(c, y, it)
        y -= 4

    # ── 2. Decisoes tomadas ──────────────────────────────────────────────────
    y = section_header(c, "DECISOES TOMADAS (REGISTO)")
    decisoes = [
        "Avancar com a estrutura de duas empresas-mae + empresa conjunta (66/33).",
        "Enviar proposta de 315.000 euros pelas Lajes (feito por email ao Sr. Alfredo).",
        "Nao ceder mais margem ao intermediario de Braga: ou leva 5 de 30, ou 0 de 0.",
        "Pivotar o foco de Coimbra para Porto/Gaia, mantendo Coimbra para CAEP e off-market.",
        "Regra de so partilhar versoes finais de documentos gerados com Claude Code.",
        "Reescrever o conteudo da landing page de investidores.",
        "Guardar a ideia da plataforma como projeto futuro documentado.",
        "App: valor com cedencia como valor de compra no wholesaling; ROI medio sobre todos os negocios.",
    ]
    for d in decisoes:
        y = item_bullet(c, y, d, marker="check")

    # ── 3. Visao de melhoria ─────────────────────────────────────────────────
    y = section_header(c, "VISAO DE MELHORIA (ANALISE CFO)")
    melhoria = [
        ("A. Estrutura societaria: simplificar antes de complicar", [
            "A duvida que a propria contabilista levantou (1 empresa em vez de 2) e o ponto mais importante da semana e ficou por resolver. Tres entidades trazem ~620 euros/mes de contabilidade, IRC fragmentado e burocracia tripla, numa fase em que a faturacao real ainda e 1.5k.",
            "Antes de abrir, confirmar por escrito se a separacao de IRC compensa o custo. A taxa reduzida de IRC (PME) aplica-se so aos primeiros 50k de materia coletavel; abaixo disso e custo sem retorno.",
            "Alternativa a estudar: 1 empresa operacional com acordo parassocial (quotas, vesting, clausulas de saida) em vez de 3 entidades. Resolve a protecao sem o custo recorrente.",
        ]),
        ("B. Padronizar a politica de cedencia", [
            "A postura no caso de Braga foi correta (risco e custos sao dos socios). O problema e renegociar do zero em cada negocio.",
            "Fixar uma politica de fee de intermediacao/cedencia escrita (fee fixo por escalao, ou % com teto) e um checklist de risco por negocio (sinal parado, custos de CPCV, clausula de devolucao, prazo).",
            "Sobre usar nomes reais de investidores para pressionar: manter verdadeiro, senao queima credibilidade.",
        ]),
        ("C. Pivot Porto/Gaia: transformar intuicao em playbook", [
            "A leitura esta certa (Coimbra nao tem volume). Falta sistematizar.",
            "Produzir o resumo de zona Porto/Gaia como documento unico (bairros-alvo, gama de precos por tipologia, empreiteiros, consultores). E o quick win de maior impacto na pesquisa.",
            "Definir alocacao explicita de esforco (ex: 90% Porto/Gaia, 10% Coimbra off-market + Felix) e medir. Nao perder o lado de obra/CAEP em Coimbra.",
        ]),
        ("D. Plataforma como produto: validar antes de construir", [
            "Tem valor real, mas e onde se perde mais foco e dinheiro se for mal feita.",
            "Validar procura antes de investir: lista de espera/pre-venda com a audiencia do Veda/Diogo. Se nao houver pre-inscricoes, nao avancar.",
            "Clarificar o modelo: 49-99 euros inicial + mensalidade e confuso. Subscricao pura (29-49 euros/mes, desconto anual) gera receita recorrente.",
            "Custo escondido: passar de CRM interno para SaaS implica multi-tenant, isolamento de dados, autenticacao, faturacao, onboarding, suporte e RGPD. E um projeto, nao um ajuste.",
            "Proteger o IP: a plataforma fica propriedade da Somnium; Diogo/Ruben recebem rev-share ou equity numa entidade de produto separada, com o que cada um detem definido por escrito.",
            "Time-box: fechar agora so uma especificacao documentada e reabrir no Q4, quando as cedencias derem capital.",
        ]),
        ("E. Metodo Claude Code e landing: voz humana no externo", [
            "A regra (so versao final validada) resolve o interno.",
            "Para conteudo externo (propostas, landing, apresentacoes) a validacao humana e sempre obrigatoria. O feedback de parece scam e sintoma de copy gerado sem voz propria.",
            "Reescrever a landing a volta de credibilidade e numeros reais (negocios ja feitos), remover ROI e certificados ficticios, posicionar bem o investidor passivo da diaspora.",
        ]),
        ("F. Pipeline de investidores: tornar repetivel", [
            "Formalizar uma rubrica de classificacao fixa: capital, ROI alvo, apetite de risco, geografia, velocidade de decisao.",
            "Manter sempre uma shortlist pronta a investir visivel no CRM, para casar de imediato com cada negocio.",
            "Calendarizar os follow-ups (Sintia 1 Jul, Elsio, Daniel quarta) como tarefas, nao como memoria.",
        ]),
        ("G. Reality check financeiro: disciplinar o otimismo", [
            "O salto de 1.5k real para 100-200k projetado e estrutural (pipeline), mas a tesouraria e fina.",
            "Medir semanalmente o cash efetivamente entrado vs pipeline comprometido vs fechado.",
            "Nao sobre-construir estrutura (3 empresas, SaaS) antes da primeira receita relevante aterrar.",
        ]),
        ("H. Metricas da app: o ativo analitico mais valioso", [
            "Acompanhar ROI real vs expectavel por modelo e a melhor feature para um wholesaler.",
            "Acrescentar tempo ate fechar e dias de capital em risco por negocio. Calibra estimativas futuras e mostra controlo a investidores.",
        ]),
    ]
    for title, paras in melhoria:
        y = subtitulo(c, y, title)
        for p in paras:
            y = item_bullet(c, y, p)
        y -= 4

    # ── 4. Riscos ────────────────────────────────────────────────────────────
    y = section_header(c, "RISCOS A VIGIAR")
    riscos = [
        "Solicitadora que promete uma semana e meia quando todas falam de um mes: confirmar por escrito e ter alternativa.",
        "Custo recorrente de contabilidade (620 euros/mes) antes de haver receita.",
        "Dispersao de foco com a plataforma SaaS em paralelo com a expansao Porto/Gaia.",
        "Dependencia de poucos investidores ativos: sem 2-3 prontos por criterio, os negocios travam.",
        "Conteudo externo gerado por IA sem validacao: risco reputacional junto de investidores.",
    ]
    for r in riscos:
        y = item_bullet(c, y, r)

    # ── 5. Quick wins ────────────────────────────────────────────────────────
    y = section_header(c, "QUICK WINS DESTA SEMANA")
    quick = [
        "Pergunta escrita a contabilista: 1 empresa + acordo parassocial vs 3 entidades (decidir antes de abrir).",
        "Resumo de zona Porto/Gaia num documento unico.",
        "Politica de fee de cedencia/intermediacao fixada por escrito.",
        "Reescrever a landing de investir com numeros reais e voz propria.",
        "Calendarizar os follow-ups de investidores (Sintia, Elsio, Daniel) como tarefas.",
        "Especificacao de uma pagina da plataforma (modelo, preco, divisao com Diogo/Ruben) para arquivar e reabrir no Q4.",
    ]
    for i, q in enumerate(quick, 1):
        y = numbered(c, y, i, q)

    render_footer(c)
    c.save()
    print(f"OK · PDF gerado: {OUT_PATH}")


if __name__ == "__main__":
    build()
