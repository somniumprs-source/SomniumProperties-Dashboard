/**
 * Filtros dinâmicos por tab.
 */
export function Filters({ tab, filters, onChange }) {
  function set(key, value) {
    onChange({ ...filters, [key]: value || undefined })
  }

  const selectClass = "px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {tab === 'Imóveis' && <>
        <select value={filters.estado ?? ''} onChange={e => set('estado', e.target.value)} className={selectClass}>
          <option value="">Todos os estados</option>
          {['Adicionado','Chamada Não Atendida','Pendentes','Necessidade de Visita','Visita Marcada','Estudo de VVR','Criar Proposta ao Proprietário','Enviar proposta ao Proprietário','Em negociação','Proposta aceite','Enviar proposta ao investidor','Follow Up após proposta','Follow UP','Wholesaling','CAEP','Fix and Flip','Não interessa'].map(o =>
            <option key={o} value={o}>{o}</option>
          )}
        </select>
        <select value={filters.origem ?? ''} onChange={e => set('origem', e.target.value)} className={selectClass}>
          <option value="">Todas as origens</option>
          {['Idealista','Imovirtual','Supercasa','Consultor','Referência'].map(o =>
            <option key={o} value={o}>{o}</option>
          )}
        </select>
        <select value={filters.modelo_negocio ?? ''} onChange={e => set('modelo_negocio', e.target.value)} className={selectClass}>
          <option value="">Todos os modelos</option>
          {['Wholesaling','Fix & Flip','CAEP','Mediação'].map(o =>
            <option key={o} value={o}>{o}</option>
          )}
        </select>
      </>}
      {tab === 'Investidores' && <>
        <select value={filters.status ?? ''} onChange={e => set('status', e.target.value)} className={selectClass}>
          <option value="">Todos os status</option>
          {['Potencial Investidor','Marcar call','Call marcada','Follow Up','Investidor classificado','Investidor em parceria'].map(o =>
            <option key={o} value={o}>{o}</option>
          )}
        </select>
        <select value={filters.classificacao ?? ''} onChange={e => set('classificacao', e.target.value)} className={selectClass}>
          <option value="">Todas as classes</option>
          {['A','B','C','D'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={filters.origem ?? ''} onChange={e => set('origem', e.target.value)} className={selectClass}>
          <option value="">Todas as origens</option>
          {['Skool','Grupos Whatsapp','Referenciação','LinkedIn'].map(o =>
            <option key={o} value={o}>{o}</option>
          )}
        </select>
      </>}
      {tab === 'Consultores' && <>
        <select value={filters.estatuto ?? ''} onChange={e => set('estatuto', e.target.value)} className={selectClass}>
          <option value="">Todos os estatutos</option>
          {['Cold Call','Follow up','Aberto Parcerias','Acesso imoveis Off market','Consultores em Parceria'].map(o =>
            <option key={o} value={o}>{o}</option>
          )}
        </select>
        <select value={filters.classificacao ?? ''} onChange={e => set('classificacao', e.target.value)} className={selectClass}>
          <option value="">Todas as classes</option>
          {['A','B','C','D'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </>}
      {tab === 'Negócios' && <>
        <select value={filters.categoria ?? ''} onChange={e => set('categoria', e.target.value)} className={selectClass}>
          <option value="">Todas as categorias</option>
          {['Wholesalling','CAEP','Mediação Imobiliária','Fix and Flip'].map(o =>
            <option key={o} value={o}>{o}</option>
          )}
        </select>
        <select value={filters.fase ?? ''} onChange={e => set('fase', e.target.value)} className={selectClass}>
          <option value="">Todas as fases</option>
          {['Fase de obras','Fase de venda','Vendido'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </>}
      {tab === 'Despesas' && <>
        <select value={filters.timing ?? ''} onChange={e => set('timing', e.target.value)} className={selectClass}>
          <option value="">Todos os timings</option>
          {['Mensalmente','Anual','Único'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </>}
      {Object.values(filters).some(v => v) && (
        <button onClick={() => onChange({})} className="text-xs text-red-500 hover:text-red-700 underline">Limpar</button>
      )}
    </div>
  )
}
