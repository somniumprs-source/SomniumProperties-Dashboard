/**
 * Templates de checklist obrigatoria por estado do imovel.
 * Cada item gera uma entrada na tabela checklist_imovel quando o imovel entra no estado.
 * campo_crm: campo(s) que esta tarefa garante que ficam preenchidos (para metricas).
 * categoria: categoria de time tracking (para tarefas no calendario).
 * tempo_estimado: horas estimadas para completar a tarefa.
 */

export const CHECKLIST_TEMPLATES = {
  'Pré-aprovação': [
    { key: 'pre_verificar_duplicados', titulo: 'Verificar se o imóvel já existe no pipeline (pesquisar por morada/link)', campo_crm: null, categoria: 'Pesquisa de Imóveis', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'pre_nome_padrao', titulo: 'Preencher nome do imóvel com formato padrão (Tipologia + Zona)', campo_crm: 'nome', categoria: 'Pesquisa de Imóveis', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pre_link', titulo: 'Registar link do anúncio (Idealista/Imovirtual/Supercasa)', campo_crm: 'link', categoria: 'Pesquisa de Imóveis', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pre_origem', titulo: 'Registar origem do lead (portal, consultor, referência)', campo_crm: 'origem', categoria: 'Pesquisa de Imóveis', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pre_ask_price', titulo: 'Preencher ask price do anúncio', campo_crm: 'ask_price', categoria: 'Pesquisa de Imóveis', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pre_tipologia', titulo: 'Preencher tipologia (T0, T1, T2, T3, T4+)', campo_crm: 'tipologia', categoria: 'Pesquisa de Imóveis', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pre_zona', titulo: 'Preencher zona/freguesia', campo_crm: 'zona', categoria: 'Pesquisa de Imóveis', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pre_areas', titulo: 'Preencher áreas do anúncio (área bruta e área útil)', campo_crm: 'area_bruta, area_util', categoria: 'Pesquisa de Imóveis', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pre_screening', titulo: 'Fazer pré-screening: calcular preço/m2 e comparar com média da zona', campo_crm: 'notas', categoria: 'Pesquisa de Imóveis', tempo_estimado: 0.25, obrigatoria: false },
    { key: 'pre_caderneta', titulo: 'Consultar Caderneta Predial Urbana online (Portal das Finanças)', campo_crm: 'notas', categoria: 'Pesquisa de Imóveis', tempo_estimado: 0.25, obrigatoria: false },
  ],

  'Adicionado': [
    { key: 'add_chamada', titulo: 'Fazer primeira chamada ao proprietário/consultor', campo_crm: 'data_chamada', categoria: 'Cold Call', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'add_data_chamada', titulo: 'Registar data da chamada no CRM', campo_crm: 'data_chamada', categoria: 'Cold Call', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'add_ask_price', titulo: 'Confirmar ask price real (pode diferir do anúncio)', campo_crm: 'ask_price', categoria: 'Cold Call', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'add_motivo_venda', titulo: 'Perguntar motivo de venda e urgência', campo_crm: 'notas', categoria: 'Cold Call', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'add_negocia', titulo: 'Perguntar se aceita propostas abaixo do ask price', campo_crm: 'notas', categoria: 'Cold Call', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'add_consultor', titulo: 'Registar nome do consultor/agente (se aplicável)', campo_crm: 'nome_consultor', categoria: 'Cold Call', tempo_estimado: 0.1, obrigatoria: false },
    { key: 'add_fotos', titulo: 'Extrair e guardar fotos do anúncio no CRM', campo_crm: 'fotos', categoria: 'Pesquisa de Imóveis', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'add_modelo', titulo: 'Definir modelo de negócio inicial (Wholesaling/CAEP/Fix&Flip/Mediação)', campo_crm: 'modelo_negocio', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
  ],

  'Chamada Não Atendida': [
    { key: 'cna_2a_chamada', titulo: 'Tentar 2a chamada (mínimo 24h após 1a tentativa)', campo_crm: 'data_chamada', categoria: 'Cold Call', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'cna_sms', titulo: 'Enviar SMS ou WhatsApp com identificação e interesse', campo_crm: 'notas', categoria: 'Cold Call', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'cna_3a_tentativa', titulo: 'Agendar 3a tentativa para 72h depois', campo_crm: null, categoria: 'Cold Call', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'cna_registar', titulo: 'Registar todas as tentativas de contacto com data/hora nas notas', campo_crm: 'notas', categoria: 'Cold Call', tempo_estimado: 0.1, obrigatoria: true },
  ],

  'Pendentes': [
    { key: 'pend_motivo', titulo: 'Registar motivo exacto da pendência nas notas', campo_crm: 'notas', categoria: 'Planeamento', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pend_data', titulo: 'Definir data concreta de reactivação', campo_crm: 'data_follow_up', categoria: 'Planeamento', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pend_tarefa', titulo: 'Criar tarefa de follow-up no calendário para a data de reactivação', campo_crm: null, categoria: 'Follow Up Consultores', tempo_estimado: 0.1, obrigatoria: true },
  ],

  'Necessidade de Visita': [
    { key: 'nv_ligar', titulo: 'Ligar ao proprietário/consultor para agendar visita', campo_crm: 'notas', categoria: 'Cold Call', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'nv_data', titulo: 'Confirmar data e hora exactas da visita', campo_crm: 'data_visita', categoria: 'Visita', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'nv_calendario', titulo: 'Criar evento no calendário com morada completa do imóvel', campo_crm: null, categoria: 'Visita', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'nv_checklist', titulo: 'Preparar checklist de inspecção (estrutura, cobertura, caixilharia, humidades, canalização, electricidade, fachada)', campo_crm: null, categoria: 'Visita', tempo_estimado: 0.25, obrigatoria: false },
    { key: 'nv_distancia', titulo: 'Verificar distância e tempo de deslocação até ao imóvel', campo_crm: 'notas', categoria: 'Visita', tempo_estimado: 0.1, obrigatoria: false },
  ],

  'Visita Marcada': [
    { key: 'vm_visita', titulo: 'Realizar a visita presencial ao imóvel', campo_crm: 'data_visita', categoria: 'Visita', tempo_estimado: 1.5, obrigatoria: true },
    { key: 'vm_fotos', titulo: 'Fotografar: fachada, entrada, sala, cozinha, quartos, WC, varandas, garagem (mín. 15 fotos)', campo_crm: 'fotos', categoria: 'Visita', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'vm_medir', titulo: 'Medir áreas reais com fita métrica: sala, quartos, cozinha, WC', campo_crm: 'area_util, area_bruta', categoria: 'Visita', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'vm_ficha', titulo: 'Preencher ficha de visita: cobertura (1-5), humidades, caixilharia, canalização, electricidade, fachada', campo_crm: 'notas', categoria: 'Visita', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'vm_custo_obra', titulo: 'Estimar custo de obra com base na inspecção (valor preliminar)', campo_crm: 'custo_estimado_obra', categoria: 'Estudo de Mercado', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'vm_abd', titulo: 'Confirmar área bruta dependente (varandas, terraços, arrecadações)', campo_crm: 'area_bruta_dependente', categoria: 'Visita', tempo_estimado: 0.1, obrigatoria: false },
    { key: 'vm_notas', titulo: 'Registar notas da visita: pontos fortes, pontos fracos, riscos identificados', campo_crm: 'notas', categoria: 'Visita', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'vm_doc', titulo: 'Gerar documento "Ficha de Visita" no CRM', campo_crm: null, categoria: 'Visita', tempo_estimado: 0.1, obrigatoria: false },
  ],

  'Estudo de VVR': [
    { key: 'vvr_comparaveis', titulo: 'Pesquisar 3 comparáveis de venda na zona (link, preço, área, tipologia)', campo_crm: 'analise: comparaveis', categoria: 'Estudo de Mercado', tempo_estimado: 1.0, obrigatoria: true },
    { key: 'vvr_preco_m2', titulo: 'Calcular preço/m2 médio ajustado (ajustes: negociação, área, localização, idade, conservação)', campo_crm: 'analise: comparaveis', categoria: 'Estudo de Mercado', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'vvr_definir', titulo: 'Definir VVR (Valor de Venda Remodelado) final', campo_crm: 'valor_venda_remodelado', categoria: 'Estudo de Mercado', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'vvr_data', titulo: 'Registar data do estudo de mercado', campo_crm: 'data_estudo_mercado', categoria: 'Estudo de Mercado', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'vvr_obra', titulo: 'Refinar custo estimado de obra (após visita detalhada)', campo_crm: 'custo_estimado_obra', categoria: 'Estudo de Mercado', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'vvr_compra', titulo: 'Preencher valor de compra na análise financeira', campo_crm: 'analise: compra', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'vvr_meses', titulo: 'Definir meses de detenção estimados', campo_crm: 'analise: meses', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'vvr_aru', titulo: 'Verificar se imóvel está em zona ARU (Câmara Municipal)', campo_crm: 'analise: aru', categoria: 'Estudo de Mercado', tempo_estimado: 0.25, obrigatoria: false },
    { key: 'vvr_aquisicao', titulo: 'Preencher custos de aquisição: escritura, IMT, IS (usar calculadora)', campo_crm: 'analise: escritura, imt, imposto_selo', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'vvr_detencao', titulo: 'Preencher custos de detenção: seguro, condomínio, IMI', campo_crm: 'analise: seguro_mensal, condominio_mensal, taxa_imi', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: false },
    { key: 'vvr_venda', titulo: 'Preencher custos de venda: comissão, cert. energético, home staging', campo_crm: 'analise: comissao_perc, cert_energetico, home_staging', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: false },
    { key: 'vvr_roi', titulo: 'Verificar que ROI e retorno anualizado foram calculados automaticamente', campo_crm: 'roi, roi_anualizado', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'vvr_activar', titulo: 'Activar a análise como cenário activo (checkbox "activa")', campo_crm: 'analise: activa', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'vvr_stress', titulo: 'Correr stress tests (cenários pessimista/base/optimista)', campo_crm: 'analise: stress_tests', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: false },
    { key: 'vvr_doc_analise', titulo: 'Gerar documento "Análise de Rentabilidade"', campo_crm: null, categoria: 'Estudo de Mercado', tempo_estimado: 0.1, obrigatoria: false },
    { key: 'vvr_doc_comp', titulo: 'Gerar documento "Estudo de Comparáveis"', campo_crm: null, categoria: 'Estudo de Mercado', tempo_estimado: 0.1, obrigatoria: false },
  ],

  'Criar Proposta ao Proprietário': [
    { key: 'cp_valor', titulo: 'Definir valor da proposta (com base no estudo VVR e margem pretendida)', campo_crm: 'valor_proposta', categoria: 'Proposta', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'cp_modelo', titulo: 'Confirmar/actualizar modelo de negócio definitivo', campo_crm: 'modelo_negocio', categoria: 'Proposta', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'cp_redigir', titulo: 'Redigir proposta formal: valor, condições de pagamento, prazo de validade, cláusulas', campo_crm: null, categoria: 'Proposta', tempo_estimado: 1.0, obrigatoria: true },
    { key: 'cp_caep', titulo: 'Se CAEP: preencher distribuição de lucro Somnium vs investidor(es)', campo_crm: 'analise: caep', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: false },
    { key: 'cp_doc', titulo: 'Gerar documento "Proposta Formal" no CRM', campo_crm: null, categoria: 'Proposta', tempo_estimado: 0.1, obrigatoria: false },
  ],

  'Enviar proposta ao Proprietário': [
    { key: 'ep_enviar', titulo: 'Enviar proposta ao proprietário/consultor (email ou presencial)', campo_crm: 'data_proposta', categoria: 'Proposta', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'ep_data', titulo: 'Registar data de envio da proposta', campo_crm: 'data_proposta', categoria: 'Proposta', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'ep_confirmar', titulo: 'Confirmar recepção (pedir confirmação por escrito)', campo_crm: 'notas', categoria: 'Proposta', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'ep_followup', titulo: 'Criar tarefa de follow-up para 48h-72h depois', campo_crm: null, categoria: 'Follow Up Consultores', tempo_estimado: 0.1, obrigatoria: true },
  ],

  'Em negociação': [
    { key: 'neg_contra', titulo: 'Registar contra-proposta do proprietário (valor e condições)', campo_crm: 'notas', categoria: 'Proposta', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'neg_valor', titulo: 'Actualizar valor da proposta no CRM se houve negociação', campo_crm: 'valor_proposta', categoria: 'Proposta', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'neg_recalc', titulo: 'Recalcular análise financeira com novo valor de compra', campo_crm: 'analise: compra', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'neg_deadline', titulo: 'Definir deadline para resposta final e registar nas notas', campo_crm: 'notas', categoria: 'Proposta', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'neg_doc', titulo: 'Gerar documento "Resumo de Negociação" actualizado', campo_crm: null, categoria: 'Proposta', tempo_estimado: 0.1, obrigatoria: false },
  ],

  'Proposta aceite': [
    { key: 'pa_data', titulo: 'Registar data de aceitação da proposta', campo_crm: 'data_proposta_aceite', categoria: 'Proposta', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pa_escrito', titulo: 'Obter confirmação de aceitação por escrito (email, CPCV)', campo_crm: 'notas', categoria: 'Proposta', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'pa_certidao', titulo: 'Solicitar Certidão Permanente (código de acesso online)', campo_crm: 'notas', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'pa_caderneta', titulo: 'Solicitar Caderneta Predial actualizada', campo_crm: 'notas', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pa_licenca', titulo: 'Solicitar Licença de Utilização', campo_crm: 'notas', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: false },
    { key: 'pa_onus', titulo: 'Verificar Certidão Permanente: ónus, hipotecas, penhoras, usufrutos', campo_crm: 'notas', categoria: 'Análise de Negócio', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'pa_fiscal', titulo: 'Verificar situação fiscal: dívidas de IMI (Portal das Finanças)', campo_crm: 'notas', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'pa_imt', titulo: 'Calcular IMT e IS definitivos (com VPT real da Caderneta)', campo_crm: 'analise: vpt, imt, imposto_selo', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'pa_valor', titulo: 'Actualizar valor da proposta final no CRM', campo_crm: 'valor_proposta', categoria: 'Proposta', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'pa_doc', titulo: 'Gerar documento "Resumo de Acordo"', campo_crm: null, categoria: 'Proposta', tempo_estimado: 0.1, obrigatoria: false },
  ],

  'Enviar proposta ao investidor': [
    { key: 'ei_seleccionar', titulo: 'Seleccionar investidores compatíveis (capital >= necessário, classif. A/B)', campo_crm: 'notas', categoria: 'Apresentação de Negócios', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'ei_doc_anonima', titulo: 'Gerar documento "Proposta de Investimento Anónima" (sem morada)', campo_crm: null, categoria: 'Apresentação de Negócios', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'ei_dossier', titulo: 'Gerar "Dossier Investidor" completo (análise, comparáveis, stress tests, fotos)', campo_crm: null, categoria: 'Apresentação de Negócios', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'ei_enviar', titulo: 'Enviar dossier a cada investidor seleccionado (email ou reunião)', campo_crm: 'notas', categoria: 'Apresentação de Negócios', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'ei_data', titulo: 'Registar data de envio', campo_crm: 'data_follow_up', categoria: 'Apresentação de Negócios', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'ei_followup', titulo: 'Criar tarefa de follow-up para 48h depois por investidor', campo_crm: null, categoria: 'Follow Up Investidores', tempo_estimado: 0.1, obrigatoria: true },
  ],

  'Follow Up após proposta': [
    { key: 'fup_contactar', titulo: 'Contactar cada investidor que recebeu proposta', campo_crm: 'data_follow_up', categoria: 'Follow Up Investidores', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'fup_resposta', titulo: 'Registar resposta de cada investidor (interessado/não/quer reunião/mais info)', campo_crm: 'notas', categoria: 'Follow Up Investidores', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'fup_reuniao', titulo: 'Se investidor quer reunião: agendar apresentação', campo_crm: null, categoria: 'Reunião Investidores', tempo_estimado: 0.1, obrigatoria: false },
    { key: 'fup_info', titulo: 'Se investidor pede informação adicional: preparar e enviar', campo_crm: null, categoria: 'Apresentação de Negócios', tempo_estimado: 0.5, obrigatoria: false },
    { key: 'fup_doc', titulo: 'Gerar documento "Ficha de Follow-Up"', campo_crm: null, categoria: 'Follow Up Investidores', tempo_estimado: 0.1, obrigatoria: false },
  ],

  'Follow UP': [
    { key: 'fu_identificar', titulo: 'Identificar todas as partes pendentes (proprietário? investidor? consultor?)', campo_crm: 'notas', categoria: 'Follow Up Consultores', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'fu_contactar', titulo: 'Contactar cada parte pendente e registar resultado', campo_crm: 'data_follow_up', categoria: 'Follow Up Consultores', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'fu_notas', titulo: 'Actualizar notas: o que ficou acordado, próximos passos, prazos', campo_crm: 'notas', categoria: 'Follow Up Consultores', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'fu_proximo', titulo: 'Criar tarefa de próximo follow-up com data específica', campo_crm: null, categoria: 'Follow Up Consultores', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'fu_doc', titulo: 'Gerar documento "Ficha de Follow-Up"', campo_crm: null, categoria: 'Follow Up Consultores', tempo_estimado: 0.1, obrigatoria: false },
  ],

  'Wholesaling': [
    { key: 'wh_negocio', titulo: 'Criar registo de negócio no CRM (categoria: Wholesalling)', campo_crm: 'negocio: movimento, categoria, fase, imovel_id', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'wh_lucro', titulo: 'Preencher lucro estimado do negócio', campo_crm: 'negocio: lucro_estimado', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'wh_investidor', titulo: 'Associar investidor(es) ao negócio', campo_crm: 'negocio: investidor_ids', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'wh_consultor', titulo: 'Associar consultor(es) ao negócio', campo_crm: 'negocio: consultor_ids', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: false },
    { key: 'wh_data_compra', titulo: 'Registar data de compra (CPCV ou escritura)', campo_crm: 'negocio: data_compra', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'wh_data_venda', titulo: 'Registar data estimada de cedência/venda', campo_crm: 'negocio: data_estimada_venda', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'wh_aceite', titulo: 'Registar data de aceitação do investidor', campo_crm: 'data_aceite_investidor', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'wh_contrato', titulo: 'Elaborar/rever contrato de cessão de posição com advogado', campo_crm: 'notas', categoria: 'Proposta', tempo_estimado: 1.0, obrigatoria: true },
    { key: 'wh_capital', titulo: 'Confirmar que investidor tem capital disponível (comprovativo)', campo_crm: 'notas', categoria: 'Reunião Investidores', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'wh_escritura', titulo: 'Agendar escritura/cedência', campo_crm: null, categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'wh_margens', titulo: 'Calcular comissões e margens finais definitivas', campo_crm: 'negocio: lucro_estimado', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'wh_doc', titulo: 'Gerar documento "Ficha de Cedência"', campo_crm: null, categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: false },
  ],

  'CAEP': [
    { key: 'caep_negocio', titulo: 'Criar registo de negócio no CRM (categoria: CAEP)', campo_crm: 'negocio: movimento, categoria, fase, imovel_id', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'caep_capital', titulo: 'Preencher capital total do negócio', campo_crm: 'negocio: capital_total', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'caep_n_inv', titulo: 'Preencher número de investidores', campo_crm: 'negocio: n_investidores', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'caep_quota', titulo: 'Preencher quota Somnium', campo_crm: 'negocio: quota_somnium', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'caep_lucro', titulo: 'Preencher lucro estimado total', campo_crm: 'negocio: lucro_estimado', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'caep_relacoes', titulo: 'Associar investidor(es) e consultor(es) ao negócio', campo_crm: 'negocio: investidor_ids, consultor_ids', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'caep_compra', titulo: 'Registar data de compra', campo_crm: 'negocio: data_compra', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'caep_venda', titulo: 'Registar data estimada de venda', campo_crm: 'negocio: data_estimada_venda', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'caep_aceite', titulo: 'Registar data de aceitação do investidor', campo_crm: 'data_aceite_investidor', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'caep_dist', titulo: 'Preencher distribuição CAEP na análise (% Somnium, base, investidores)', campo_crm: 'analise: caep', categoria: 'Análise de Negócio', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'caep_tranches', titulo: 'Definir faseamento de pagamentos (tranches com descrição, valor, data)', campo_crm: 'negocio: pagamentos_faseados', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'caep_contrato', titulo: 'Elaborar contrato CAEP com advogado', campo_crm: 'notas', categoria: 'Proposta', tempo_estimado: 1.0, obrigatoria: true },
    { key: 'caep_empreiteiro', titulo: 'Seleccionar empreiteiro(s) e pedir orçamentos (mín. 2)', campo_crm: 'notas', categoria: 'Análise de Negócio', tempo_estimado: 1.0, obrigatoria: true },
    { key: 'caep_cronograma', titulo: 'Definir cronograma de obra com datas de início e fim', campo_crm: 'notas', categoria: 'Planeamento', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'caep_doc', titulo: 'Gerar documento "Ficha de Acompanhamento de Obra"', campo_crm: null, categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: false },
  ],

  'Fix and Flip': [
    { key: 'ff_negocio', titulo: 'Criar registo de negócio no CRM (categoria: Fix and Flip)', campo_crm: 'negocio: movimento, categoria, fase, imovel_id', categoria: 'Análise de Negócio', tempo_estimado: 0.25, obrigatoria: true },
    { key: 'ff_lucro', titulo: 'Preencher lucro estimado', campo_crm: 'negocio: lucro_estimado', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'ff_compra', titulo: 'Registar data de compra', campo_crm: 'negocio: data_compra', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'ff_venda', titulo: 'Registar data estimada de venda', campo_crm: 'negocio: data_estimada_venda', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'ff_consultor', titulo: 'Associar consultor(es) ao negócio', campo_crm: 'negocio: consultor_ids', categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: false },
    { key: 'ff_orcamento', titulo: 'Definir orçamento de obra detalhado por divisão', campo_crm: 'custo_estimado_obra', categoria: 'Análise de Negócio', tempo_estimado: 1.0, obrigatoria: true },
    { key: 'ff_empreiteiro', titulo: 'Seleccionar empreiteiro(s) e pedir orçamentos (mín. 2)', campo_crm: 'notas', categoria: 'Análise de Negócio', tempo_estimado: 1.0, obrigatoria: true },
    { key: 'ff_cronograma', titulo: 'Definir cronograma de obra com fases e deadlines', campo_crm: 'notas', categoria: 'Planeamento', tempo_estimado: 0.5, obrigatoria: true },
    { key: 'ff_contrato', titulo: 'Elaborar contrato de compra com advogado', campo_crm: 'notas', categoria: 'Proposta', tempo_estimado: 1.0, obrigatoria: true },
    { key: 'ff_plano_venda', titulo: 'Preparar plano de venda: portais, preço, home staging', campo_crm: 'notas', categoria: 'Planeamento', tempo_estimado: 0.5, obrigatoria: false },
    { key: 'ff_doc', titulo: 'Gerar documento "Ficha de Acompanhamento de Obra"', campo_crm: null, categoria: 'Análise de Negócio', tempo_estimado: 0.1, obrigatoria: false },
  ],

  'Não interessa': [
    { key: 'ni_motivo', titulo: 'Seleccionar motivo de descarte', campo_crm: 'motivo_descarte', categoria: 'Outros', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'ni_detalhe', titulo: 'Registar detalhes do motivo nas notas (ex: "ROI 3%, mínimo 15%")', campo_crm: 'notas', categoria: 'Outros', tempo_estimado: 0.1, obrigatoria: true },
    { key: 'ni_doc', titulo: 'Gerar documento "Ficha de Descarte"', campo_crm: null, categoria: 'Outros', tempo_estimado: 0.1, obrigatoria: false },
    { key: 'ni_notificar', titulo: 'Notificar consultor do descarte (se aplicável)', campo_crm: null, categoria: 'Contacto Consultores', tempo_estimado: 0.1, obrigatoria: false },
  ],
}
