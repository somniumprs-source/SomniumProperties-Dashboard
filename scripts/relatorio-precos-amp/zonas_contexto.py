# -*- coding: utf-8 -*-
"""Contexto curado por freguesia de Vila Nova de Gaia (AMP), fundamentado em
pesquisa. Descricoes factuais e conservadoras, para apresentar a zona a quem
nao a conhece. Chaves coincidem com o campo 'freguesia' do amp_dataset.json."""

INTRO_AMP = (
    "Vila Nova de Gaia situa-se na margem sul do rio Douro, em frente ao Porto, ligada a este por várias pontes "
    "(Luís I, Arrábida, Freixo). É o concelho mais populoso do Norte e lê-se em três faixas: a frente ribeirinha do "
    "Douro (centro histórico, caves do Vinho do Porto, Cais de Gaia), a faixa litoral a poente (praias de Canidelo e "
    "Madalena) e a coroa residencial a sul (Pedroso/Carvalhos, Serzedo, Sandim), mais tranquila e acessível. A "
    "mobilidade assenta na Linha D (amarela) do Metro, que cruza o Douro pela Ponte Luís I até ao centro do Porto, e "
    "numa malha de auto-estradas (A1, A29, A32) e linha ferroviária do Norte. Como regra, quanto mais perto do rio, do "
    "mar e do centro, mais alto o preço por m²; para sul, o valor desce e a área cresce. Os números que se seguem "
    "distinguem sempre o nível de mercado da zona (estudos Alfredo) do valor estimado dos nossos imóveis."
)

CONTEXTO = {
    "Santa Marinha e São Pedro da Afurada": {
        "etiqueta": "Premium ribeirinho e centro histórico",
        "descricao": (
            "É a frente ribeirinha e histórica de Gaia, na margem sul do Douro frente ao Porto (fusão de Santa Marinha "
            "— a freguesia mais antiga e populosa do concelho — com a Afurada). Santa Marinha concentra o centro "
            "histórico e as caves do Vinho do Porto; a Afurada mantém o núcleo piscatório, com marina e restaurantes "
            "de peixe. É a zona mais central e turística do concelho, com forte procura de arrendamento."
        ),
        "acessos": (
            "Metro Linha D (amarela) com as estações General Torres, Câmara de Gaia, João de Deus e Jardim do Morro "
            "(junto à Ponte Luís I, a pé para o Porto). Comboio em Devesas. Pontes Luís I e Arrábida e proximidade à "
            "A1/A20 (VCI). O teleférico de Gaia liga o cais ao Jardim do Morro. Centro do Porto a poucos minutos, de "
            "metro ou a pé pela Ponte Luís I."
        ),
        "amenidades": {
            "Saúde": "Centro Hospitalar V.N. Gaia/Espinho (rede de Gaia).",
            "Ensino": "Rede pública e privada de Gaia.",
            "Comércio": "Mercado Municipal da Afurada; superfícies e centros comerciais de Gaia nas redondezas.",
            "Lazer e restauração": "Cais de Gaia, caves do Vinho do Porto, Mosteiro da Serra do Pilar (UNESCO), peixe grelhado na Afurada.",
        },
        "fortes": ["Localização ribeirinha e turística premium", "Ligação directa ao Porto (metro + pontes)", "Forte procura de arrendamento"],
        "fraco": "Preços elevados e construção antiga no núcleo histórico (custos de reabilitação, estacionamento limitado).",
    },
    "Mafamude e Vilar do Paraíso": {
        "etiqueta": "Central urbano e bem servido",
        "descricao": (
            "É a freguesia mais populosa e urbana de Gaia (~53 mil habitantes), de elevada densidade. Concentra o "
            "centro administrativo do concelho (Câmara Municipal) e o polo de Santo Ovídio. Procurada por famílias de "
            "classe média e média-alta pela centralidade, serviços e ligação directa ao Porto."
        ),
        "acessos": (
            "Metro Linha D (amarela) com terminal sul em Santo Ovídio (interface rodoviário) e estações D. João II e "
            "Câmara de Gaia (frente ao El Corte Inglés). Ligação ao Porto via Ponte Luís I (General Torres, Jardim do "
            "Morro, São Bento, Aliados, Trindade) em poucos minutos. Próximo da A1, A29 e VL8."
        ),
        "amenidades": {
            "Saúde": "Hospital Eduardo Santos Silva (Centro Hospitalar V.N. Gaia/Espinho), referência regional.",
            "Ensino": "Escola Secundária Almeida Garrett, Agrupamento Dr. Costa Matos, Escola Profissional do Infante.",
            "Comércio": "El Corte Inglés (Av. da República) e ampla oferta de comércio e serviços.",
            "Lazer e restauração": "Parque de S. Caetano e Quinta da Formiga (Vilar do Paraíso).",
        },
        "fortes": ["Centralidade administrativa e de serviços", "Metro directo ao Porto", "Forte procura residencial (liquidez)"],
        "fraco": "Malha consolidada e densa, com pouco terreno livre e maior pressão de preço.",
    },
    "Oliveira do Douro": {
        "etiqueta": "Residencial junto ao rio",
        "descricao": (
            "Freguesia periurbana na margem do Douro e uma das mais populosas da Área Metropolitana (~22,6 mil "
            "habitantes). Mistura malha urbana com espaços verdes e frente ribeirinha. A proximidade ao Porto alimenta "
            "forte procura habitacional e nova construção; atrai quem quer viver perto da cidade em zonas mais calmas."
        ),
        "acessos": (
            "Sem metro na freguesia, mas próxima do terminal de Santo Ovídio (Linha D). Forte acesso rodoviário: VL8 e "
            "nó do Areinho para a Ponte do Freixo (VCI/A20) e A1; Porto a cerca de 6 km. Está em construção a nova "
            "Ponte D. António Francisco dos Santos, que ligará a freguesia directamente ao Porto."
        ),
        "amenidades": {
            "Saúde": "Hospital Santos Silva no concelho (freguesia vizinha) e saúde de proximidade.",
            "Ensino": "Oferta básica e secundária (ex. EB do Outeiro).",
            "Comércio": "Supermercados e comércio de proximidade.",
            "Lazer e restauração": "Parque da Lavandeira, EcoParque do Atlântico, passadiço do Areinho, Parque Biológico de Gaia (adjacente).",
        },
        "fortes": ["Excelente acessibilidade rodoviária", "Frente de Douro e espaços verdes", "Preço abaixo da frente ribeirinha central"],
        "fraco": "Sem metro na freguesia — dependência de carro ou autocarro.",
    },
    "Canidelo": {
        "etiqueta": "Litoral e praia",
        "descricao": (
            "Freguesia litoral de Gaia (~28 mil habitantes), entre o Douro a norte e o Atlântico a poente. "
            "Predominantemente residencial e familiar, valorizada pela frente de mar (praias de Lavadores, Cabedelo e "
            "Salgueiros) e pela Reserva Natural Local do Estuário do Douro. Procurada por quem quer qualidade de vida "
            "junto à praia sem sair da área metropolitana."
        ),
        "acessos": (
            "Sem metro na freguesia (as estações da nova Linha Rubi ficam na VL8, a nascente; conclusão prevista para "
            "2028). Servida por autocarros e pela proximidade à Ponte da Arrábida (A1/IC23), com o Porto a cerca de "
            "10–15 min de carro fora de ponta. Avenida da Beira-Mar na marginal; estação ferroviária mais próxima em "
            "Coimbrões."
        ),
        "amenidades": {
            "Saúde": "Unidades de saúde locais; hospitais de referência no Porto/Gaia próximos.",
            "Ensino": "Do pré-escolar ao secundário (ex. Escola Secundária Inês de Castro).",
            "Comércio": "Comércio de proximidade e superfícies na área de Gaia.",
            "Lazer e restauração": "Marginal de Lavadores, restaurantes de peixe e marisco, praias e Reserva Natural do Estuário do Douro.",
        },
        "fortes": ["Frente de mar e praias com reserva natural", "Perfil residencial estável e procurado", "Acesso rápido ao Porto pela Arrábida"],
        "fraco": "Ausência de metro na freguesia.",
    },
    "Pedroso e Seixezelo": {
        "etiqueta": "Periférico residencial (Carvalhos)",
        "descricao": (
            "Zona periférica e residencial no sul do concelho (~10 km do Porto), com os Carvalhos como polo de "
            "comércio e serviços. Pedroso é a maior freguesia do concelho em área. Procurada por famílias que valorizam "
            "preço mais acessível que o centro, mais espaço e habitação unifamiliar, mantendo boa ligação à cidade."
        ),
        "acessos": (
            "Estação dos Carvalhos na Linha do Norte (comboios urbanos Porto–Aveiro até Campanhã/São Bento, ~20–30 "
            "min). Forte nó rodoviário: A1 em Pedroso/Carvalhos, com ligação à A29 e à A32, e a EN1. Porto a cerca de "
            "15–20 min de carro fora de ponta."
        ),
        "amenidades": {
            "Saúde": "Centro de Saúde dos Carvalhos.",
            "Ensino": "Escola Secundária dos Carvalhos, EB 2/3 Padre António Luís Moreira, Colégio Internato dos Carvalhos.",
            "Comércio": "Feira dos Carvalhos (semanal, à quarta), banca, farmácias e superfícies.",
            "Lazer e restauração": "Colectividades desportivas e culturais; restauração local.",
        },
        "fortes": ["Acessibilidade dupla: comboio urbano + nó da A1", "Preço/m² inferior ao centro com mais área", "Serviços completos nos Carvalhos"],
        "fraco": "Carácter periférico, sem a dinâmica urbana do centro de Gaia/Porto.",
    },
    "Serzedo e Perosinho": {
        "etiqueta": "Periférico, próximo do litoral",
        "descricao": (
            "Zona residencial periférica a sudoeste (~14 mil habitantes), com mancha rural e industrial, a curta "
            "distância da faixa litoral (Madalena, Miramar e Aguda nas redondezas). Procurada por famílias que querem "
            "proximidade ao mar e à cidade com preços inferiores aos da orla."
        ),
        "acessos": (
            "Ligação à A29 (poucos minutos) e, por esta, à A1 rumo ao Porto; também a EN109. As estações de comboio "
            "mais próximas ficam na orla (Madalena, Aguda, Miramar, Valadares), na Linha do Norte, com ligação a "
            "Campanhã/São Bento. Porto a cerca de 20–25 min de carro."
        ),
        "amenidades": {
            "Saúde": "UCSP de Serzedo e UCSP de Perosinho.",
            "Ensino": "Escolas básicas e JI; Escola de Música de Perosinho.",
            "Comércio": "Pingo Doce em Perosinho; Continente nas redondezas.",
            "Lazer e restauração": "Praias próximas de Madalena, Miramar e Aguda.",
        },
        "fortes": ["Bons acessos (A29/A1/EN109)", "Litoral a poucos minutos", "Preço competitivo face à orla"],
        "fraco": "Dependência do automóvel, sem estação ferroviária na freguesia.",
    },
    "Sandim, Olival, Lever e Crestuma": {
        "etiqueta": "Rural e mais acessível",
        "descricao": (
            "Extremo sudeste do concelho, na margem do Douro — a maior freguesia em área e de baixa densidade (~17 mil "
            "habitantes). Lever e Crestuma mantêm carácter rural; Sandim e Olival concentram a vida administrativa. "
            "Procurada por quem quer espaço e terreno a preço inferior ao Gaia urbano, com ligação rápida ao Porto."
        ),
        "acessos": (
            "A acessibilidade é o trunfo: A32 (Douro Litoral) com nó em Sandim, ligação à A41 (CREP) e à A1 (lado de "
            "Argoncilhe/Santa Maria da Feira). EN222 ao longo do Douro. Porto a cerca de 20–25 km (~25–30 min por "
            "auto-estrada); centro de Gaia a poucos minutos pela A32. Transporte público por autocarros."
        ),
        "amenidades": {
            "Saúde": "UCSP de Olival e USF Além d'Ouro (Sandim).",
            "Ensino": "Rede pública de escolas básicas locais.",
            "Comércio": "Serviços de proximidade; grandes superfícies a curta distância em Gaia.",
            "Lazer e restauração": "Barragem de Crestuma-Lever, praia fluvial de Crestuma, Clube Náutico, passeios de barco; rota dos moinhos de Sandim.",
        },
        "fortes": ["Preço/m² e terreno dos mais acessíveis do concelho", "Excelente ligação A32/A1", "Frente de rio com atractivo de lazer"],
        "fraco": "Dependência de viatura e oferta limitada de comércio e serviços na própria freguesia.",
    },
}

def get(freguesia):
    return CONTEXTO.get(freguesia, {"etiqueta": "Vila Nova de Gaia", "descricao": "",
                                    "acessos": "", "amenidades": {}, "fortes": [], "fraco": ""})
