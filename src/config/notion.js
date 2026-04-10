export const PAGES = {
  dashboard:  import.meta.env.VITE_NOTION_PAGE_DASHBOARD,
  financeiro: import.meta.env.VITE_NOTION_PAGE_FINANCEIRO,
  comercial:  import.meta.env.VITE_NOTION_PAGE_COMERCIAL,
  marketing:  import.meta.env.VITE_NOTION_PAGE_MARKETING,
  operacoes:  import.meta.env.VITE_NOTION_PAGE_OPERACOES,
}

export const DATABASES = {
  faturacao:       import.meta.env.VITE_NOTION_DB_FATURACAO,
  despesas:        import.meta.env.VITE_NOTION_DB_DESPESAS,
  pipelineImoveis: import.meta.env.VITE_NOTION_DB_PIPELINE_IMOVEIS,
  investidores:    import.meta.env.VITE_NOTION_DB_INVESTIDORES,
  // Legacy (inacessíveis — mantidos para referência)
  pipeline:   import.meta.env.VITE_NOTION_DB_PIPELINE,
  clientes:   import.meta.env.VITE_NOTION_DB_CLIENTES,
  campanhas:  import.meta.env.VITE_NOTION_DB_CAMPANHAS,
  obras:      import.meta.env.VITE_NOTION_DB_OBRAS,
}

// Versão Node.js (scripts/)
export function getNodeConfig() {
  return {
    pages: {
      dashboard:  process.env.NOTION_PAGE_DASHBOARD,
      financeiro: process.env.NOTION_PAGE_FINANCEIRO,
      comercial:  process.env.NOTION_PAGE_COMERCIAL,
      marketing:  process.env.NOTION_PAGE_MARKETING,
      operacoes:  process.env.NOTION_PAGE_OPERACOES,
    },
    databases: {
      faturacao:       process.env.NOTION_DB_FATURACAO,
      despesas:        process.env.NOTION_DB_DESPESAS,
      pipelineImoveis: process.env.NOTION_DB_PIPELINE_IMOVEIS,
      investidores:    process.env.NOTION_DB_INVESTIDORES,
      empreiteiros:    process.env.NOTION_DB_EMPREITEIROS,
      consultores:     process.env.NOTION_DB_CONSULTORES,
      projetos:        process.env.NOTION_DB_PROJETOS,
      // Legacy
      pipeline:   process.env.NOTION_DB_PIPELINE,
      clientes:   process.env.NOTION_DB_CLIENTES,
      campanhas:  process.env.NOTION_DB_CAMPANHAS,
      obras:      process.env.NOTION_DB_OBRAS,
    },
  }
}
