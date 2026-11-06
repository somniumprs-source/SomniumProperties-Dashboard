/**
 * Aba "Documentos" (Administração): documentação da Somnium Properties
 * (RCBE, certidão permanente, certidões de não dívida, licenças, seguros…).
 * Tabela única com pesquisa, filtros e estado de validade. Cada linha é criada
 * à mão e pode ficar sem ficheiro até ser anexado. Os documentos expirados ou
 * a expirar entram também na página Alertas. Só administradores.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, FileText, Paperclip, Pencil, Trash2, Download, Upload, FolderLock } from 'lucide-react'
import { apiFetch, openDocument } from '../lib/api.js'
import { fmtDate } from '../constants.js'
import { CATEGORIAS_DOCUMENTOS_EMPRESA, SUGESTOES_DOCUMENTOS_EMPRESA, DIAS_AVISO_VALIDADE, estadoValidade } from '../constants/documentosEmpresa.js'
import { Button } from '../components/ui/Button.jsx'
import { Input, Select, Textarea } from '../components/ui/Input.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'
import { ScrollableTable } from '../components/ui/ScrollableTable.jsx'
import { confirmar } from '../components/ui/ConfirmDialog.jsx'
import { useToast } from '../components/ui/Toast.jsx'
import { friendlyError } from '../lib/friendlyError.js'

const ESTADO_UI = {
  expirado:     { label: 'Expirado',     tone: 'red',    ordem: 0 },
  a_expirar:    { label: 'A expirar',    tone: 'yellow', ordem: 1 },
  valido:       { label: 'Válido',       tone: 'green',  ordem: 2 },
  sem_validade: { label: 'Sem validade', tone: 'gray',   ordem: 3 },
}
const ACEITES = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv'
const VAZIO = { categoria: 'Constitucionais', nome: '', entidade: '', codigo_acesso: '', data_emissao: '', data_validade: '', notas: '' }

async function lerErro(r, fallback) {
  const j = await r.json().catch(() => ({}))
  return Object.assign(new Error(j.error || fallback), { status: r.status })
}

function fmtTamanho(b) {
  if (!b) return ''
  return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
}

function textoValidade({ estado, dias }) {
  if (estado === 'expirado') return `há ${-dias} dia${dias === -1 ? '' : 's'}`
  if (estado === 'a_expirar') return dias === 0 ? 'expira hoje' : `faltam ${dias} dia${dias === 1 ? '' : 's'}`
  return null
}

function Resumo({ label, valor, tom = 'text-ink', activo, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left rounded-xl border px-4 py-3 transition-colors ${activo ? 'border-ink/30 bg-surface-muted' : 'border-line bg-surface-raised hover:bg-surface-muted'}`}>
      <p className="text-overline uppercase font-semibold text-ink-muted">{label}</p>
      <p className={`text-xl font-semibold num ${tom}`}>{valor}</p>
    </button>
  )
}

function FormDocumento({ open, inicial, onClose, onGuardado }) {
  const toast = useToast()
  const [form, setForm] = useState(VAZIO)
  const [ficheiro, setFicheiro] = useState(null)
  const [aGuardar, setAGuardar] = useState(false)
  const editar = !!inicial?.id

  useEffect(() => {
    if (!open) return
    setForm(inicial?.id ? Object.fromEntries(Object.keys(VAZIO).map(k => [k, inicial[k] ?? ''])) : { ...VAZIO, ...(inicial || {}) })
    setFicheiro(null)
  }, [open, inicial])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function guardar(e) {
    e.preventDefault()
    if (!form.nome.trim()) { toast('Indica o nome do documento', 'error'); return }
    if (form.data_emissao && form.data_validade && form.data_validade < form.data_emissao) {
      toast('A data de validade é anterior à data de emissão', 'error'); return
    }
    setAGuardar(true)
    try {
      let doc
      if (editar) {
        const r = await apiFetch(`/api/crm/empresa-documentos/${inicial.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        })
        if (!r.ok) throw await lerErro(r, 'Erro ao guardar')
        doc = await r.json()
        if (ficheiro) {
          const fd = new FormData(); fd.append('ficheiro', ficheiro)
          const r2 = await apiFetch(`/api/crm/empresa-documentos/${inicial.id}/ficheiro`, { method: 'POST', body: fd })
          if (!r2.ok) throw await lerErro(r2, 'Dados guardados, mas o ficheiro não foi anexado')
          doc = await r2.json()
        }
      } else {
        const fd = new FormData()
        for (const [k, v] of Object.entries(form)) fd.append(k, v)
        if (ficheiro) fd.append('ficheiro', ficheiro)
        const r = await apiFetch('/api/crm/empresa-documentos', { method: 'POST', body: fd })
        if (!r.ok) throw await lerErro(r, 'Erro ao criar o documento')
        doc = await r.json()
      }
      toast(editar ? 'Documento actualizado' : 'Documento adicionado', 'success')
      onGuardado(doc)
    } catch (err) {
      toast(err.status === 400 ? err.message : friendlyError(err), 'error')
    } finally { setAGuardar(false) }
  }

  const sugestoes = SUGESTOES_DOCUMENTOS_EMPRESA[form.categoria] || []

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={editar ? 'Editar documento' : 'Novo documento'}
      subtitle={editar ? inicial.nome : 'Cria a linha e anexa o ficheiro agora ou mais tarde'}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Categoria" value={form.categoria} onChange={set('categoria')}>
            {CATEGORIAS_DOCUMENTOS_EMPRESA.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <div>
            <Input label="Nome do documento" value={form.nome} onChange={set('nome')} list="sugestoes-docs-empresa"
              placeholder="Ex.: RCBE" autoFocus required />
            <datalist id="sugestoes-docs-empresa">
              {sugestoes.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <Input label="Entidade emissora" value={form.entidade} onChange={set('entidade')} placeholder="Ex.: IRN, AT, Segurança Social, IMPIC" />
          <Input label="Código de acesso" value={form.codigo_acesso} onChange={set('codigo_acesso')}
            placeholder="Ex.: código da certidão online" hint="Para quem precisar de consultar o documento online" />
          <Input label="Data de emissão" type="date" value={form.data_emissao} onChange={set('data_emissao')} />
          <Input label="Válido até" type="date" value={form.data_validade} onChange={set('data_validade')}
            hint={`Opcional. Entra nos Alertas ${DIAS_AVISO_VALIDADE} dias antes`} />
        </div>
        <Textarea label="Notas" value={form.notas} onChange={set('notas')} rows={2} placeholder="Ex.: renovar todos os anos em Março" />

        <div>
          <p className="block text-overline uppercase font-semibold text-ink-muted mb-1.5">
            {editar && inicial.ficheiro_nome ? 'Substituir ficheiro' : 'Ficheiro'}
          </p>
          {editar && inicial.ficheiro_nome && !ficheiro && (
            <p className="text-caption text-ink-muted mb-1.5">Actual: {inicial.ficheiro_nome}</p>
          )}
          <label className="flex items-center gap-3 px-3 py-3 rounded-lg border border-dashed border-line bg-surface hover:bg-surface-muted cursor-pointer transition-colors">
            <Upload className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
            <span className="text-sm text-ink truncate">{ficheiro ? ficheiro.name : 'Escolher ficheiro (PDF, imagem ou Office, máx. 15MB)'}</span>
            <input type="file" accept={ACEITES} className="sr-only" onChange={e => setFicheiro(e.target.files?.[0] || null)} />
          </label>
        </div>

        <Modal.Footer>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={aGuardar}>{editar ? 'Guardar' : 'Adicionar'}</Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}

export function AdministracaoDocumentos() {
  const toast = useToast()
  const [docs, setDocs] = useState(null)
  const [erro, setErro] = useState(null)
  const [pesquisa, setPesquisa] = useState('')
  const [categoria, setCategoria] = useState('todas')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [form, setForm] = useState({ open: false, inicial: null })
  const [aAnexar, setAAnexar] = useState(null)
  const inputAnexo = useRef(null)
  const alvoAnexo = useRef(null)

  async function carregar() {
    setErro(null)
    try {
      const r = await apiFetch('/api/crm/empresa-documentos')
      if (!r.ok) throw await lerErro(r, 'Erro ao carregar')
      setDocs(await r.json())
    } catch (e) { setErro(e); setDocs([]) }
  }
  useEffect(() => { carregar() }, [])

  const linhas = useMemo(() => (docs || []).map(d => ({ ...d, validade: estadoValidade(d.data_validade) })), [docs])

  const contagem = useMemo(() => ({
    total: linhas.length,
    expirado: linhas.filter(d => d.validade.estado === 'expirado').length,
    a_expirar: linhas.filter(d => d.validade.estado === 'a_expirar').length,
    sem_ficheiro: linhas.filter(d => !d.ficheiro_nome).length,
  }), [linhas])

  const visiveis = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    return linhas
      .filter(d => categoria === 'todas' || d.categoria === categoria)
      .filter(d => filtroEstado === 'todos' ? true : filtroEstado === 'sem_ficheiro' ? !d.ficheiro_nome : d.validade.estado === filtroEstado)
      .filter(d => !q || [d.nome, d.entidade, d.categoria, d.notas, d.ficheiro_nome].some(v => v && v.toLowerCase().includes(q)))
      .sort((a, b) => (ESTADO_UI[a.validade.estado].ordem - ESTADO_UI[b.validade.estado].ordem)
        || (CATEGORIAS_DOCUMENTOS_EMPRESA.indexOf(a.categoria) - CATEGORIAS_DOCUMENTOS_EMPRESA.indexOf(b.categoria))
        || a.nome.localeCompare(b.nome, 'pt'))
  }, [linhas, pesquisa, categoria, filtroEstado])

  function guardado(doc) {
    setDocs(ds => {
      const lista = ds || []
      return lista.some(d => d.id === doc.id) ? lista.map(d => d.id === doc.id ? doc : d) : [...lista, doc]
    })
    setForm({ open: false, inicial: null })
  }

  function escolherAnexo(doc) {
    alvoAnexo.current = doc
    inputAnexo.current?.click()
  }

  async function anexar(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const doc = alvoAnexo.current
    if (!file || !doc) return
    setAAnexar(doc.id)
    try {
      const fd = new FormData(); fd.append('ficheiro', file)
      const r = await apiFetch(`/api/crm/empresa-documentos/${doc.id}/ficheiro`, { method: 'POST', body: fd })
      if (!r.ok) throw await lerErro(r, 'Erro ao anexar')
      const novo = await r.json()
      setDocs(ds => ds.map(d => d.id === novo.id ? novo : d))
      toast(`Ficheiro anexado a ${doc.nome}`, 'success')
    } catch (err) {
      toast(err.status === 400 ? err.message : friendlyError(err), 'error')
    } finally { setAAnexar(null) }
  }

  async function apagar(doc) {
    const ok = await confirmar(`Apagar "${doc.nome}"?${doc.ficheiro_nome ? ' O ficheiro sai do CRM e a cópia no Drive vai para "Elementos apagados do CRM".' : ''}`)
    if (!ok) return
    try {
      const r = await apiFetch(`/api/crm/empresa-documentos/${doc.id}`, { method: 'DELETE' })
      if (!r.ok) throw await lerErro(r, 'Erro ao apagar')
      setDocs(ds => ds.filter(d => d.id !== doc.id))
      toast('Documento apagado', 'success')
    } catch (err) { toast(friendlyError(err), 'error') }
  }

  const abrir = (doc, download = false) =>
    openDocument(`/api/crm/empresa-documentos/${doc.id}/ficheiro`, download ? { download: true, filename: doc.ficheiro_nome } : {}).catch(() => {})

  const alternar = estado => setFiltroEstado(f => f === estado ? 'todos' : estado)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Resumo label="Documentos" valor={contagem.total} activo={filtroEstado === 'todos'} onClick={() => setFiltroEstado('todos')} />
        <Resumo label="Expirados" valor={contagem.expirado} tom={contagem.expirado ? 'text-danger' : 'text-ink'} activo={filtroEstado === 'expirado'} onClick={() => alternar('expirado')} />
        <Resumo label={`A expirar (${DIAS_AVISO_VALIDADE} dias)`} valor={contagem.a_expirar} tom={contagem.a_expirar ? 'text-warning' : 'text-ink'} activo={filtroEstado === 'a_expirar'} onClick={() => alternar('a_expirar')} />
        <Resumo label="Sem ficheiro" valor={contagem.sem_ficheiro} activo={filtroEstado === 'sem_ficheiro'} onClick={() => alternar('sem_ficheiro')} />
      </div>

      <div className="bg-surface-raised rounded-xl border border-line p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3 mb-4">
          <Input wrapperClassName="flex-1" placeholder="Pesquisar por nome, entidade, notas…" value={pesquisa}
            onChange={e => setPesquisa(e.target.value)} prefix={<Search className="w-4 h-4" aria-hidden="true" />} aria-label="Pesquisar documentos" />
          <Select wrapperClassName="md:w-48" value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoria">
            <option value="todas">Todas as categorias</option>
            {CATEGORIAS_DOCUMENTOS_EMPRESA.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select wrapperClassName="md:w-44" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} aria-label="Estado">
            <option value="todos">Todos os estados</option>
            {Object.entries(ESTADO_UI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            <option value="sem_ficheiro">Sem ficheiro</option>
          </Select>
          <Button icon={Plus} onClick={() => setForm({ open: true, inicial: categoria !== 'todas' ? { categoria } : null })}>Novo documento</Button>
        </div>

        {docs === null ? (
          <p className="text-sm text-ink-muted py-8 text-center">A carregar...</p>
        ) : erro ? (
          <p className="text-sm text-danger py-8 text-center">{erro.status === 403 ? 'Só administradores têm acesso à documentação da empresa.' : friendlyError(erro)}</p>
        ) : linhas.length === 0 ? (
          <EmptyState icon={FolderLock} title="Sem documentos"
            description="Adiciona o primeiro documento da empresa (ex.: RCBE ou certidão permanente)."
            action={<Button icon={Plus} onClick={() => setForm({ open: true, inicial: null })}>Novo documento</Button>} />
        ) : visiveis.length === 0 ? (
          <p className="text-sm text-ink-muted py-8 text-center">Nenhum documento corresponde aos filtros.</p>
        ) : (
          <ScrollableTable>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-overline uppercase text-ink-muted border-b border-line">
                  <th className="pb-2 pr-3">Documento</th>
                  <th className="pb-2 pr-3">Categoria</th>
                  <th className="pb-2 pr-3">Emissão</th>
                  <th className="pb-2 pr-3">Validade</th>
                  <th className="pb-2 pr-3">Estado</th>
                  <th className="pb-2 pr-3">Ficheiro</th>
                  <th className="pb-2 text-right"><span className="sr-only">Acções</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(d => {
                  const ui = ESTADO_UI[d.validade.estado]
                  const extra = textoValidade(d.validade)
                  return (
                    <tr key={d.id} className="border-b border-line align-top">
                      <td className="py-2.5 pr-3 min-w-[200px]">
                        <p className="font-medium text-ink">{d.nome}</p>
                        {(d.entidade || d.notas) && (
                          <p className="text-caption text-ink-muted line-clamp-2">{[d.entidade, d.notas].filter(Boolean).join(' · ')}</p>
                        )}
                        {d.codigo_acesso && <p className="text-caption text-ink-muted">Código: <span className="font-mono select-all">{d.codigo_acesso}</span></p>}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted whitespace-nowrap">{d.categoria}</td>
                      <td className="py-2.5 pr-3 text-ink-muted num whitespace-nowrap">{fmtDate(d.data_emissao)}</td>
                      <td className="py-2.5 pr-3 num whitespace-nowrap">
                        <span className="text-ink">{fmtDate(d.data_validade)}</span>
                        {extra && <p className="text-caption text-ink-muted">{extra}</p>}
                      </td>
                      <td className="py-2.5 pr-3"><Badge tone={ui.tone} dot>{ui.label}</Badge></td>
                      <td className="py-2.5 pr-3 min-w-[160px]">
                        {d.ficheiro_nome ? (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => abrir(d)} title={d.ficheiro_nome}
                              className="inline-flex items-center gap-1.5 text-ink hover:text-accent-ink min-w-0">
                              <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                              <span className="truncate max-w-[140px]">{d.ficheiro_nome}</span>
                            </button>
                            <button type="button" onClick={() => abrir(d, true)} title="Descarregar" aria-label={`Descarregar ${d.ficheiro_nome}`}
                              className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-muted">
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <Button size="sm" variant="secondary" icon={Paperclip} loading={aAnexar === d.id} onClick={() => escolherAnexo(d)}>Anexar</Button>
                        )}
                        {d.ficheiro_nome && <p className="text-caption text-ink-muted">{fmtTamanho(d.tamanho)}</p>}
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        <button type="button" onClick={() => setForm({ open: true, inicial: d })} title="Editar" aria-label={`Editar ${d.nome}`}
                          className="p-1.5 rounded text-ink-muted hover:text-ink hover:bg-surface-muted"><Pencil className="w-4 h-4" /></button>
                        <button type="button" onClick={() => apagar(d)} title="Apagar" aria-label={`Apagar ${d.nome}`}
                          className="p-1.5 rounded text-ink-muted hover:text-danger hover:bg-surface-muted"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollableTable>
        )}
      </div>

      <input ref={inputAnexo} type="file" accept={ACEITES} className="hidden" onChange={anexar} />
      <FormDocumento open={form.open} inicial={form.inicial} onClose={() => setForm({ open: false, inicial: null })} onGuardado={guardado} />
    </div>
  )
}
