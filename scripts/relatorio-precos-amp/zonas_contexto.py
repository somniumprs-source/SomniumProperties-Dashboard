# -*- coding: utf-8 -*-
"""Contexto curado por freguesia de Vila Nova de Gaia (AMP).
Descricoes factuais e conservadoras, para apresentar a zona a quem nao a conhece.
Chaves coincidem com o campo 'freguesia' do amp_dataset.json."""

INTRO_AMP = (
    "Vila Nova de Gaia situa-se na margem sul do rio Douro, em frente ao Porto, com o qual está ligada por "
    "várias pontes (Luís I, Arrábida, Infante). É o concelho mais populoso do Norte e combina três realidades: "
    "a frente ribeirinha do Douro (onde estão as caves do Vinho do Porto e o Cais de Gaia), uma faixa litoral "
    "com praias a poente, e uma coroa residencial a sul, mais tranquila e acessível. Esta leitura do território "
    "explica grande parte da diferença de preços entre zonas: quanto mais perto do rio, do mar e do centro, "
    "mais alto o valor por m²; à medida que se desce para sul (Pedroso, Serzedo, Sandim) os preços tornam-se "
    "mais acessíveis. As avaliações abaixo resultam dos estudos de mercado automáticos (Alfredo AI) de cada "
    "imóvel da carteira, agregados pela freguesia oficial."
)

CONTEXTO = {
    "Santa Marinha e São Pedro da Afurada": {
        "etiqueta": "Premium ribeirinho e centro histórico",
        "descricao": (
            "É o coração de Gaia, na margem do Douro frente ao Porto. Santa Marinha concentra o centro histórico, "
            "as caves do Vinho do Porto e a frente ribeirinha do Cais de Gaia, com o teleférico e o acesso pela "
            "Ponte Luís I ao Jardim do Morro. A Afurada mantém o núcleo piscatório tradicional junto à foz do "
            "Douro, com marina e restaurantes de peixe grelhado muito procurados. É a zona mais central e turística "
            "do concelho, bem servida de comércio, serviços e farmácias, o que sustenta os valores por m² mais "
            "elevados da carteira."
        ),
    },
    "Mafamude e Vilar do Paraíso": {
        "etiqueta": "Central urbano e bem servido",
        "descricao": (
            "É o centro administrativo e urbano de Gaia. Mafamude acolhe a Câmara Municipal e o polo de Santo "
            "Ovídio (terminal de metro, El Corte Inglés, grande oferta de comércio e serviços); Vilar do Paraíso é "
            "mais residencial. Zona densa, consolidada e muito bem servida de transportes e equipamentos, a "
            "poucos minutos do centro histórico e do Porto. Combina boa liquidez de mercado com preços "
            "intermédios a altos, consoante a proximidade ao eixo de Santo Ovídio."
        ),
    },
    "Oliveira do Douro": {
        "etiqueta": "Residencial junto ao rio",
        "descricao": (
            "Freguesia residencial encostada à margem do Douro, a nascente do centro de Gaia. Beneficia da "
            "proximidade ao rio e da boa ligação ao Porto pelas pontes, mantendo um ambiente mais calmo e "
            "familiar do que o centro. Oferta sobretudo de habitação, com comércio de proximidade e bons acessos "
            "rodoviários, num posicionamento de preço intermédio."
        ),
    },
    "Canidelo": {
        "etiqueta": "Litoral e praia",
        "descricao": (
            "Freguesia litoral a poente, junto à foz do Douro e às praias (Lavadores, Canidelo) e à reserva natural "
            "do Cabedelo. É uma das zonas residenciais mais procuradas pela combinação de frente de mar, ambiente "
            "tranquilo e proximidade ao centro de Gaia e ao Porto. A procura por habitação junto à praia sustenta "
            "valores por m² na faixa alta do concelho."
        ),
    },
    "Pedroso e Seixezelo": {
        "etiqueta": "Periférico residencial (Carvalhos)",
        "descricao": (
            "Zona residencial a sul do concelho, em torno do polo dos Carvalhos, conhecido pelo comércio e pela "
            "feira. Ambiente mais suburbano e tranquilo, com moradias e habitação a preços mais acessíveis do que "
            "o centro, e bons acessos à A1/A29 que aproximam do Porto e do litoral. Posicionamento de valor."
        ),
    },
    "Serzedo e Perosinho": {
        "etiqueta": "Periférico residencial, próximo do litoral",
        "descricao": (
            "Freguesias residenciais a sudoeste, entre o interior do concelho e a faixa litoral (Madalena/Miramar a "
            "curta distância). Predomínio de moradias e ambiente calmo, com preços por m² mais baixos que o centro "
            "e o litoral consolidado, e boa ligação rodoviária. Atractivo para quem procura espaço a custo "
            "controlado."
        ),
    },
    "Sandim, Olival, Lever e Crestuma": {
        "etiqueta": "Rural e mais acessível",
        "descricao": (
            "Conjunto de freguesias no extremo sudeste do concelho, ao longo do Douro (barragem de Crestuma-Lever). "
            "Carácter mais rural e de baixa densidade, com moradias e terreno a preços dos mais acessíveis da "
            "região, compensando a maior distância ao centro com a proximidade à A1. Adequado a operações onde o "
            "preço de entrada e a área são determinantes."
        ),
    },
}

def get(freguesia):
    return CONTEXTO.get(freguesia, {"etiqueta": "Vila Nova de Gaia", "descricao": ""})
