#!/usr/bin/env python3
"""
Modifica a Proposta de Investimento (Rua do Clube) para novo destinatario
e prazo de retencao de 12 meses, recalculando todos os valores financeiros.

Uso: python3 scripts/pdf-proposta-rua-do-clube.py
Saida: scripts/output/Investimento_Rua_do_Clube_<nome>.pdf
"""
import fitz  # PyMuPDF
import os
import math

SOURCE = os.path.expanduser("~/Downloads/Investimento Rua do Clube Coimbra.pdf")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Cores (Somnium brand) ────────────────────────────────────
BODY = (0.165, 0.165, 0.165)   # #2a2a2a
WHITE = (1, 1, 1)

# ── Dados financeiros fixos do imovel ────────────────────────
COMPRA = 185000
TOTAL_AQUISICAO = 191234
OBRA_COM_IVA = 143518
COMISSAO_PERC = 2.5
VVR = 500000
CPCV_VENDA = 100
MANUT_MENSAL = 190  # seguros 50 + condominio 40 + electr 50 + agua 50
IRC_RATE = 0.20

# ── Motor de calculo ─────────────────────────────────────────
def calc(vvr, obra, meses):
    """Calcula metricas financeiras para um cenario."""
    manutencao = MANUT_MENSAL * meses
    comissao = round(vvr * (COMISSAO_PERC / 100) * 1.23)
    custo_total = TOTAL_AQUISICAO + obra + manutencao + comissao + CPCV_VENDA
    capital_proprio = TOTAL_AQUISICAO + obra + manutencao  # sem custos de venda
    lucro_bruto = vvr - custo_total
    irc = round(lucro_bruto * IRC_RATE)
    lucro_liquido = lucro_bruto - irc
    rt = round(lucro_bruto / custo_total * 100, 1) if custo_total > 0 else 0
    coc = round(lucro_bruto / capital_proprio * 100, 1) if capital_proprio > 0 else 0
    ra = round((math.pow(1 + lucro_bruto / custo_total, 12 / meses) - 1) * 100, 1) if custo_total > 0 and meses > 0 else 0
    return {
        'manutencao': manutencao,
        'comissao': comissao,
        'custo_total': custo_total,
        'capital_proprio': capital_proprio,
        'lucro_bruto': lucro_bruto,
        'irc': irc,
        'lucro_liquido': lucro_liquido,
        'rt': rt,
        'coc': coc,
        'ra': ra,
    }

def eur(v):
    """Formata valor em euros PT."""
    if v is None or v == 0:
        return '—'
    s = f"{abs(v):,.0f}".replace(",", ".")
    return f"{'-' if v < 0 else ''}{s} €"

def pct(v):
    """Formata percentagem."""
    return f"{v}%"


# ── Classe auxiliar para editar paginas ───────────────────────
class PageEditor:
    """Acumula redactions e text inserts, aplica de uma vez."""
    def __init__(self, page):
        self.page = page
        self._inserts = []

    def redact(self, rect, fill=WHITE):
        """Marca area para remover conteudo (whitout)."""
        self.page.add_redact_annot(rect, text="", fill=fill)

    def redact_search(self, old, new, fontname="helv", fontsize=10, color=BODY):
        """Procura texto e substitui via redaction (remove e reescreve)."""
        areas = self.page.search_for(old)
        for area in areas:
            self.page.add_redact_annot(area, text=new, fontname=fontname,
                                       fontsize=fontsize, text_color=color, fill=WHITE)
        return len(areas)

    def replace(self, rect, text, fontname="helv", fontsize=10, color=BODY):
        """Apaga conteudo do rect e agenda escrita de novo texto."""
        self.page.add_redact_annot(rect, text="", fill=WHITE)
        self._inserts.append((rect, text, fontname, fontsize, color))

    def apply(self):
        """Aplica todas as redactions e escreve textos novos."""
        self.page.apply_redactions()
        for rect, text, fontname, fontsize, color in self._inserts:
            lines = text.split('\n')
            y = rect.y0 + fontsize + 1
            for line in lines:
                self.page.insert_text((rect.x0 + 1, y), line,
                                      fontname=fontname, fontsize=fontsize, color=color)
                y += fontsize + 2


# ══════════════════════════════════════════════════════════════
# GERACAO DO PDF MODIFICADO
# ══════════════════════════════════════════════════════════════
def generate(dest_name, meses):
    doc = fitz.open(SOURCE)
    nome_antigo = "Luís Gouveia"

    # Calculos
    base = calc(VVR, OBRA_COM_IVA, meses)

    # Stress tests individuais
    mod_vvr10 = calc(450000, OBRA_COM_IVA, meses)
    mod_obra10 = calc(VVR, round(OBRA_COM_IVA * 1.10), meses)
    mod_ret3 = calc(VVR, OBRA_COM_IVA, meses + 3)
    sev_vvr20 = calc(400000, OBRA_COM_IVA, meses)
    sev_obra20 = calc(VVR, round(OBRA_COM_IVA * 1.20), meses)
    sev_ret6 = calc(VVR, OBRA_COM_IVA, meses + 6)

    # Stress tests combinados
    comb_mod = calc(450000, round(OBRA_COM_IVA * 1.10), meses + 3)
    comb_sev = calc(400000, round(OBRA_COM_IVA * 1.20), meses + 6)

    # ══════════════════════════════════════════════════════════
    # PAGINAS 3-8: Apenas substituir nome no header/footer
    # ══════════════════════════════════════════════════════════
    for pn in range(2, 8):
        ed = PageEditor(doc[pn])
        ed.redact_search(nome_antigo, dest_name, fontsize=8)
        ed.apply()

    # ══════════════════════════════════════════════════════════
    # PAGINA 1 — Capa
    # ══════════════════════════════════════════════════════════
    ed = PageEditor(doc[0])
    # Nome bold grande
    ed.redact_search(nome_antigo, dest_name, fontname="hebo", fontsize=14)
    ed.apply()

    # ══════════════════════════════════════════════════════════
    # PAGINA 2 — Sumario Executivo
    # ══════════════════════════════════════════════════════════
    ed = PageEditor(doc[1])
    # Nome no header
    ed.redact_search(nome_antigo, dest_name, fontsize=8)
    # "Preparado para: Luis Gouveia"
    ed.redact_search(f"Preparado para: {nome_antigo}",
                     f"Preparado para: {dest_name}", fontsize=11)

    # Retorno Total: rect preciso
    ed.replace(fitz.Rect(308, 455, 380, 483), pct(base['rt']), fontname="hebo", fontsize=16)
    # Retorno Anualizado
    ed.replace(fitz.Rect(431, 455, 510, 483), pct(base['ra']), fontname="hebo", fontsize=16)
    # "base 9 meses"
    ed.replace(fitz.Rect(431, 475, 500, 493), f"base {meses} meses", fontsize=8.5)

    # Lucro Bruto Estimado
    ed.replace(fitz.Rect(61, 539, 155, 567), eur(base['lucro_bruto']), fontname="hebo", fontsize=16)
    # Lucro Liquido (IRC)
    ed.replace(fitz.Rect(184, 539, 270, 567), eur(base['lucro_liquido']), fontname="hebo", fontsize=16)
    # Total Investido
    ed.replace(fitz.Rect(308, 539, 395, 567), eur(base['custo_total']), fontname="hebo", fontsize=16)
    # Prazo de Retencao
    ed.replace(fitz.Rect(431, 539, 510, 567), f"{meses} meses", fontname="hebo", fontsize=16)

    ed.apply()

    # ══════════════════════════════════════════════════════════
    # PAGINA 9 — Analise Financeira
    # ══════════════════════════════════════════════════════════
    ed = PageEditor(doc[8])

    # Nome header
    ed.redact_search(nome_antigo, dest_name, fontsize=8)

    # Manutencao label + valor
    ed.replace(fitz.Rect(67, 319, 215, 338), f"Manutenção ({meses} meses)", fontsize=10)
    ed.replace(fitz.Rect(215, 319, 270, 338), eur(base['manutencao']), fontsize=10)

    # Total Investido (coluna esquerda)
    ed.replace(fitz.Rect(215, 391, 270, 411), eur(base['custo_total']), fontname="hebo", fontsize=10)

    # Lucro Estimado (Bruto)
    ed.replace(fitz.Rect(452, 257, 510, 277), eur(base['lucro_bruto']), fontname="hebo", fontsize=10)

    # IRC
    ed.replace(fitz.Rect(452, 295, 510, 314), eur(base['irc']), fontsize=10)

    # Lucro Estimado Liquido
    ed.replace(fitz.Rect(452, 319, 510, 340), eur(base['lucro_liquido']), fontname="hebo", fontsize=11)

    # Retorno Total Investimento
    ed.replace(fitz.Rect(452, 343, 495, 364), pct(base['rt']), fontname="hebo", fontsize=11)

    # Retorno Cash-on-Cash
    ed.replace(fitz.Rect(452, 367, 495, 388), pct(base['coc']), fontname="hebo", fontsize=11)

    # Retorno Anualizado
    ed.replace(fitz.Rect(452, 391, 495, 412), pct(base['ra']), fontname="hebo", fontsize=11)

    # Pressupostos: "Prazo: 9 meses"
    ed.redact_search("Prazo: 9 meses", f"Prazo: {meses} meses",
                     fontname="hebi", fontsize=9)

    ed.apply()

    # ══════════════════════════════════════════════════════════
    # PAGINA 10 — Stress Tests Individuais
    # ══════════════════════════════════════════════════════════
    ed = PageEditor(doc[9])
    ed.redact_search(nome_antigo, dest_name, fontsize=8)

    # ── Caixa de resumo (topo) ──
    ed.replace(fitz.Rect(221, 204, 300, 224), f"{meses} meses", fontname="hebo", fontsize=10)
    ed.replace(fitz.Rect(304, 204, 380, 225), pct(base['rt']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(386, 204, 460, 225), pct(base['ra']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(468, 204, 540, 225), eur(base['lucro_liquido']), fontname="hebo", fontsize=11)

    # ── TABELA MODERADO ──
    def write_table_row(ed, y_top, y_bot, scenario, base_data):
        """Escreve uma linha da tabela de stress tests."""
        # Meses
        ed.replace(fitz.Rect(219, y_top, 242, y_bot), f"{scenario['_meses']}\nm", fontsize=10)
        # Lucro Bruto
        lb_str = eur(scenario['lucro_bruto']).replace(' €', '')
        ed.replace(fitz.Rect(243, y_top, 292, y_bot), f"{lb_str}\n€", fontname="hebo", fontsize=11)
        # Lucro Liq
        ll_str = eur(scenario['lucro_liquido']).replace(' €', '')
        ed.replace(fitz.Rect(294, y_top, 342, y_bot), f"{ll_str}\n€", fontsize=10)
        # RT
        ed.replace(fitz.Rect(346, y_top, 378, y_bot), f"{scenario['rt']}\n%", fontname="hebo", fontsize=11)
        # CoC
        ed.replace(fitz.Rect(382, y_top, 414, y_bot), f"{scenario['coc']}\n%", fontsize=10)
        # RA
        ed.replace(fitz.Rect(417, y_top, 455, y_bot), f"{scenario['ra']}%", fontsize=10)
        # Variacoes
        if base_data:
            var_rt = round(scenario['rt'] - base_data['rt'], 1)
            var_ra = round(scenario['ra'] - base_data['ra'], 1)
            ed.replace(fitz.Rect(457, y_top, 498, y_bot), f"\u2193\n{var_rt}%", fontname="hebo", fontsize=9.5)
            ed.replace(fitz.Rect(500, y_top, 540, y_bot), f"\u2193\n{var_ra}%", fontname="hebo", fontsize=9.5)

    # Base moderado — adicionar _meses para a funcao
    base_row = {**base, '_meses': meses}
    mod_vvr10_row = {**mod_vvr10, '_meses': meses}
    mod_obra10_row = {**mod_obra10, '_meses': meses}
    mod_ret3_row = {**mod_ret3, '_meses': meses + 3}

    write_table_row(ed, 324, 358, base_row, None)
    write_table_row(ed, 362, 396, mod_vvr10_row, base)
    write_table_row(ed, 400, 434, mod_obra10_row, base)

    # Retencao +3: tambem atualizar descricao
    ed.replace(fitz.Rect(56, 438, 132, 486), f"Retenção +3\nmeses ({meses+3}\nmeses)", fontsize=10)
    write_table_row(ed, 445, 479, mod_ret3_row, base)

    # ── TABELA SEVERO ──
    sev_base_row = {**base, '_meses': meses}
    sev_vvr20_row = {**sev_vvr20, '_meses': meses}
    sev_obra20_row = {**sev_obra20, '_meses': meses}
    sev_ret6_row = {**sev_ret6, '_meses': meses + 6}

    write_table_row(ed, 571, 605, sev_base_row, None)
    write_table_row(ed, 609, 643, sev_vvr20_row, base)
    write_table_row(ed, 647, 681, sev_obra20_row, base)

    # Retencao +6: atualizar descricao
    ed.replace(fitz.Rect(56, 685, 132, 733), f"Retenção +6\nmeses ({meses+6}\nmeses)", fontsize=10)
    write_table_row(ed, 692, 726, sev_ret6_row, base)

    # Nota no fundo
    ed.replace(fitz.Rect(55, 742, 540, 772),
        f"Nota: O impacto individual mais crítico é a queda do VVR em −20%, que reduz o lucro líquido para "
        f"{eur(sev_vvr20['lucro_liquido'])} e o retorno\n"
        f"total para {pct(sev_vvr20['rt'])}. O aumento de 20% no custo de obra e o prolongamento "
        f"da retenção têm um impacto mais moderado.",
        fontname="hebi", fontsize=9)

    ed.apply()

    # ══════════════════════════════════════════════════════════
    # PAGINA 11 — Stress Test Combinado Moderado
    # ══════════════════════════════════════════════════════════
    ed = PageEditor(doc[10])
    ed.redact_search(nome_antigo, dest_name, fontsize=8)

    # Caixa de resumo (topo)
    ed.replace(fitz.Rect(221, 218, 300, 238), f"{meses} meses", fontname="hebo", fontsize=10)
    ed.replace(fitz.Rect(304, 218, 380, 239), pct(base['rt']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(386, 218, 460, 239), pct(base['ra']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(468, 218, 540, 239), eur(base['lucro_liquido']), fontname="hebo", fontsize=11)

    # Descricao: "meses (9 → 12 meses)" → "meses (12 → 15 meses)"
    ed.redact_search("meses (9 \u2192 12 meses)", f"meses ({meses} \u2192 {meses+3} meses)",
                     fontname="heit", fontsize=9)

    # Meses no box
    ed.replace(fitz.Rect(306, 357, 370, 377), f"{meses+3} meses", fontname="hebo", fontsize=10)
    # Lucro Liquido no box
    ed.replace(fitz.Rect(429, 357, 490, 377), eur(comb_mod['lucro_liquido']), fontname="hebo", fontsize=10)

    # Tabela comparativa — coluna Cenario Combinado
    ed.replace(fitz.Rect(208, 416, 275, 436), eur(comb_mod['capital_proprio']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(208, 440, 265, 460), eur(comb_mod['lucro_bruto']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(208, 464, 265, 484), eur(comb_mod['lucro_liquido']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(208, 488, 255, 508), pct(comb_mod['rt']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(208, 512, 255, 532), pct(comb_mod['coc']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(208, 536, 255, 556), pct(comb_mod['ra']), fontname="hebo", fontsize=11)

    # Coluna Base (Normal) — novos valores base 12m
    ed.replace(fitz.Rect(284, 416, 350, 436), eur(base['capital_proprio']), fontsize=10)
    ed.replace(fitz.Rect(284, 440, 345, 460), eur(base['lucro_bruto']), fontsize=10)
    ed.replace(fitz.Rect(284, 464, 345, 484), eur(base['lucro_liquido']), fontsize=10)
    ed.replace(fitz.Rect(284, 488, 330, 508), pct(base['rt']), fontsize=10)
    ed.replace(fitz.Rect(284, 512, 330, 532), pct(base['coc']), fontsize=10)
    ed.replace(fitz.Rect(284, 536, 330, 556), pct(base['ra']), fontsize=10)

    # Coluna Variacao (€)
    diff_cap = comb_mod['capital_proprio'] - base['capital_proprio']
    diff_lb = abs(comb_mod['lucro_bruto'] - base['lucro_bruto'])
    diff_ll = abs(comb_mod['lucro_liquido'] - base['lucro_liquido'])
    ed.replace(fitz.Rect(361, 416, 430, 436), f"\u2191 +{eur(diff_cap)}", fontsize=9.5)
    ed.replace(fitz.Rect(361, 440, 430, 460), f"\u2193 {eur(diff_lb)}", fontsize=9.5)
    ed.replace(fitz.Rect(361, 464, 430, 484), f"\u2193 {eur(diff_ll)}", fontsize=9.5)

    # Coluna Variacao (%)
    ed.replace(fitz.Rect(455, 416, 520, 436), f"\u2191 +{eur(diff_cap)}", fontsize=9.5)
    ed.replace(fitz.Rect(455, 440, 520, 460), f"\u2193 {eur(diff_lb)}", fontsize=9.5)
    ed.replace(fitz.Rect(455, 464, 520, 484), f"\u2193 {eur(diff_ll)}", fontsize=9.5)
    var_rt = round(comb_mod['rt'] - base['rt'], 1)
    var_coc = round(comb_mod['coc'] - base['coc'], 1)
    var_ra = round(comb_mod['ra'] - base['ra'], 1)
    ed.replace(fitz.Rect(455, 488, 520, 508), f"\u2193 {var_rt}%", fontsize=9.5)
    ed.replace(fitz.Rect(455, 512, 520, 532), f"\u2193 {var_coc}%", fontsize=9.5)
    ed.replace(fitz.Rect(455, 536, 520, 556), f"\u2193 {var_ra}%", fontsize=9.5)

    ed.apply()

    # ══════════════════════════════════════════════════════════
    # PAGINA 12 — Stress Test Combinado Severo + Conclusao
    # ══════════════════════════════════════════════════════════
    ed = PageEditor(doc[11])
    ed.redact_search(nome_antigo, dest_name, fontsize=8)

    # Descricao: "meses (9 → 15 meses)" → "meses (12 → 18 meses)"
    ed.redact_search("meses (9 \u2192 15 meses)", f"meses ({meses} \u2192 {meses+6} meses)",
                     fontname="heit", fontsize=9)

    # Meses e Lucro Liquido nos boxes
    ed.replace(fitz.Rect(306, 146, 370, 166), f"{meses+6} meses", fontname="hebo", fontsize=10)
    ed.replace(fitz.Rect(429, 146, 490, 166), eur(comb_sev['lucro_liquido']), fontname="hebo", fontsize=10)

    # Tabela — Cenario Combinado
    ed.replace(fitz.Rect(208, 205, 275, 225), eur(comb_sev['capital_proprio']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(208, 229, 270, 249), eur(comb_sev['lucro_bruto']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(208, 253, 270, 273), eur(comb_sev['lucro_liquido']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(208, 277, 255, 297), pct(comb_sev['rt']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(208, 301, 255, 321), pct(comb_sev['coc']), fontname="hebo", fontsize=11)
    ed.replace(fitz.Rect(208, 325, 255, 345), pct(comb_sev['ra']), fontname="hebo", fontsize=11)

    # Base (Normal) — novos valores
    ed.replace(fitz.Rect(284, 205, 350, 225), eur(base['capital_proprio']), fontsize=10)
    ed.replace(fitz.Rect(284, 229, 345, 249), eur(base['lucro_bruto']), fontsize=10)
    ed.replace(fitz.Rect(284, 253, 345, 273), eur(base['lucro_liquido']), fontsize=10)
    ed.replace(fitz.Rect(284, 277, 330, 297), pct(base['rt']), fontsize=10)
    ed.replace(fitz.Rect(284, 301, 330, 321), pct(base['coc']), fontsize=10)
    ed.replace(fitz.Rect(284, 325, 330, 345), pct(base['ra']), fontsize=10)

    # Variacoes
    diff_cap = comb_sev['capital_proprio'] - base['capital_proprio']
    diff_lb = abs(comb_sev['lucro_bruto'] - base['lucro_bruto'])
    diff_ll = abs(comb_sev['lucro_liquido'] - base['lucro_liquido'])
    ed.replace(fitz.Rect(361, 205, 430, 225), f"\u2191 +{eur(diff_cap)}", fontsize=9.5)
    ed.replace(fitz.Rect(361, 229, 430, 249), f"\u2193 {eur(diff_lb)}", fontsize=9.5)
    ed.replace(fitz.Rect(361, 253, 430, 273), f"\u2193 {eur(diff_ll)}", fontsize=9.5)
    ed.replace(fitz.Rect(455, 205, 520, 225), f"\u2191 +{eur(diff_cap)}", fontsize=9.5)
    ed.replace(fitz.Rect(455, 229, 520, 249), f"\u2193 {eur(diff_lb)}", fontsize=9.5)
    ed.replace(fitz.Rect(455, 253, 520, 273), f"\u2193 {eur(diff_ll)}", fontsize=9.5)
    var_rt = round(comb_sev['rt'] - base['rt'], 1)
    var_coc = round(comb_sev['coc'] - base['coc'], 1)
    var_ra = round(comb_sev['ra'] - base['ra'], 1)
    ed.replace(fitz.Rect(455, 277, 520, 297), f"\u2193 {var_rt}%", fontsize=9.5)
    ed.replace(fitz.Rect(455, 301, 520, 321), f"\u2193 {var_coc}%", fontsize=9.5)
    ed.replace(fitz.Rect(455, 325, 520, 345), f"\u2193 {var_ra}%", fontsize=9.5)

    # ── Conclusao ──
    # Apagar texto antigo (7 linhas)
    ed.redact(fitz.Rect(55, 381, 540, 485))

    ed.apply()

    # Inserir nova conclusao apos redactions
    p = doc[11]
    conclusao = (
        f"O projecto apresenta um perfil de risco-retorno atractivo: no cenário base conservador, o investimento gera\n"
        f"um retorno total de {pct(base['rt'])} e anualizado de {pct(base['ra'])} num prazo de {meses} meses. No cenário moderado combinado,\n"
        f"o lucro líquido é de {eur(comb_mod['lucro_liquido'])} com retorno de {pct(comb_mod['rt'])}. No cenário severo combinado — o pior caso possível\n"
        f"com todas as adversidades em simultâneo — o lucro líquido cai para {eur(comb_sev['lucro_liquido'])} e o retorno para apenas\n"
        f"{pct(comb_sev['rt'])}. O investimento mantém lucro positivo mesmo no pior cenário, o que valida a solidez estrutural do\n"
        f"projecto. A localização em Santa Clara, Coimbra, com forte procura de arrendamento universitário e\n"
        f"crescente interesse de compra, sustenta os valores de venda projectados."
    )
    y = 395
    for i, line in enumerate(conclusao.split('\n')):
        font = "hebo" if i == 4 else "helv"  # linha do "5.5%..." fica bold como no original
        p.insert_text((57, y), line, fontname=font, fontsize=10, color=BODY)
        y += 14

    # ── Guardar ──
    nome_ficheiro = dest_name.replace(" ", "_")
    output_path = os.path.join(OUTPUT_DIR, f"Investimento_Rua_do_Clube_{nome_ficheiro}.pdf")
    doc.save(output_path, deflate=True, garbage=4)
    doc.close()
    print(f"  Gerado: {output_path}")
    return output_path


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("Proposta de Investimento — Rua do Clube, Coimbra")
    print(f"Fonte: {SOURCE}")
    print(f"Retencao: 12 meses\n")

    base = calc(VVR, OBRA_COM_IVA, 12)
    print("Cenario base (12 meses):")
    print(f"  Total Investido: {eur(base['custo_total'])}")
    print(f"  Lucro Bruto:     {eur(base['lucro_bruto'])}")
    print(f"  IRC:             {eur(base['irc'])}")
    print(f"  Lucro Liquido:   {eur(base['lucro_liquido'])}")
    print(f"  Retorno Total:   {pct(base['rt'])}")
    print(f"  Cash-on-Cash:    {pct(base['coc'])}")
    print(f"  Ret. Anualizado: {pct(base['ra'])}")
    print()

    generate("Miguel Rodrigues", 12)
    generate("Pedro Sousa", 12)

    print("\nConcluido.")
