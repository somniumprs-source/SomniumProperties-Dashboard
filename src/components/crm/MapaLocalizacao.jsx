// Mapa interativo da aba Localização: satélite (ortofotos DGT OrtoSat 2023,
// dados abertos) ou ruas (OpenStreetMap), com o imóvel e os pontos de
// interesse coloridos pelo estado. Clicar num ponto permite aprová-lo ou excluí-lo.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Verde fica reservado ao imóvel; aprovados a azul.
const COR = { validado: '#2563eb', proposto: '#ca8a04', excluido: '#9ca3af' }
const ROTULO = { validado: 'Aprovado', proposto: 'Por aprovar', excluido: 'Excluído' }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const min = s => (s == null ? '—' : `${Math.max(1, Math.round(s / 60))} min`)

export default function MapaLocalizacao({ origem, pois, onDecidir }) {
  const div = useRef(null)
  const mapa = useRef(null)
  const camadaPois = useRef(null)
  const decidir = useRef(onDecidir)
  decidir.current = onDecidir
  const [fundo, setFundo] = useState('satelite')
  const [verExcluidos, setVerExcluidos] = useState(false)
  const fundos = useRef({})

  // Cria o mapa uma vez.
  useEffect(() => {
    const m = L.map(div.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
    fundos.current = {
      satelite: L.tileLayer.wms('https://ortos.dgterritorio.gov.pt/wms/ortosat2023', {
        layers: 'ortoSat2023-CorVerdadeira', format: 'image/jpeg', maxZoom: 20,
        attribution: 'Imagem: DGT, OrtoSat 2023 · Dados: © OpenStreetMap',
      }),
      ruas: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© contribuidores do OpenStreetMap',
      }),
    }
    fundos.current.satelite.addTo(m)
    camadaPois.current = L.layerGroup().addTo(m)
    // Ativa o scroll do rato só depois de clicar no mapa (não prende a página).
    m.on('click', () => m.scrollWheelZoom.enable())
    m.on('mouseout', () => m.scrollWheelZoom.disable())
    mapa.current = m
    return () => { m.remove(); mapa.current = null }
  }, [])

  useEffect(() => {
    const m = mapa.current
    if (!m) return
    Object.entries(fundos.current).forEach(([k, l]) => (k === fundo ? l.addTo(m) : m.removeLayer(l)))
  }, [fundo])

  // Desenha o imóvel e os pontos sempre que mudam.
  useEffect(() => {
    const m = mapa.current, g = camadaPois.current
    if (!m || !g || origem?.lat == null) return
    g.clearLayers()
    const casa = L.marker([origem.lat, origem.lng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:30px;height:30px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font:800 14px Inter,sans-serif;color:#fff">I</div>',
        iconSize: [30, 30], iconAnchor: [15, 15],
      }),
      zIndexOffset: 1000,
    }).bindTooltip('Imóvel')
    g.addLayer(casa)
    for (const p of pois) {
      if (p.lat == null || (p.estado === 'excluido' && !verExcluidos)) continue
      const c = L.circleMarker([p.lat, p.lng], {
        radius: p.estado === 'validado' ? 8 : 6, color: '#fff', weight: 2,
        fillColor: COR[p.estado] || COR.proposto, fillOpacity: p.estado === 'excluido' ? 0.6 : 0.95,
      })
      c.bindTooltip(esc(p.nome))
      c.bindPopup(() => {
        const el = document.createElement('div')
        el.style.minWidth = '200px'
        el.innerHTML = `
          <div style="font-weight:700;font-size:13px">${esc(p.nome)}</div>
          <div style="font-size:11px;color:#666;margin-bottom:6px">${esc(p.categoria_label)} · ${ROTULO[p.estado] || ''}</div>
          ${p.linhas ? `<div style="font-size:11px;margin-bottom:4px">Linhas ${esc(p.linhas)}</div>` : ''}
          <div style="font-size:11px;margin-bottom:8px">A pé ${min(p.pe?.s)} · Bicicleta ${min(p.bicicleta?.s)} · Carro ${min(p.carro?.s)}</div>
          <div style="display:flex;gap:6px">
            <button data-e="validado" style="flex:1;padding:4px 6px;border-radius:6px;border:1px solid #2563eb;background:${p.estado === 'validado' ? '#2563eb' : '#fff'};color:${p.estado === 'validado' ? '#fff' : '#2563eb'};font-size:11px;font-weight:600;cursor:pointer">Aprovar</button>
            <button data-e="excluido" style="flex:1;padding:4px 6px;border-radius:6px;border:1px solid #e11d48;background:${p.estado === 'excluido' ? '#e11d48' : '#fff'};color:${p.estado === 'excluido' ? '#fff' : '#e11d48'};font-size:11px;font-weight:600;cursor:pointer">Excluir</button>
          </div>`
        el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
          const novo = b.dataset.e === p.estado ? 'proposto' : b.dataset.e
          m.closePopup()
          decidir.current?.([p.id], novo)
        }))
        return el
      })
      g.addLayer(c)
    }
  }, [origem?.lat, origem?.lng, pois, verExcluidos])

  // Enquadra o imóvel e os pontos não excluídos quando a pesquisa muda.
  useEffect(() => {
    const m = mapa.current
    if (!m || origem?.lat == null) return
    const pts = [[origem.lat, origem.lng], ...pois.filter(p => p.estado !== 'excluido' && p.lat != null).map(p => [p.lat, p.lng])]
    if (pts.length > 1) m.fitBounds(pts, { padding: [30, 30], maxZoom: 17 })
    else m.setView(pts[0], 16)
  }, [origem?.lat, origem?.lng, pois.length])

  return (
    <div className="relative rounded-lg overflow-hidden border border-line">
      <div ref={div} className="h-[420px] w-full z-0" />
      <div className="absolute top-2 right-2 z-[400] flex rounded-md overflow-hidden border border-line shadow bg-white text-[11px] font-semibold">
        {[['satelite', 'Satélite'], ['ruas', 'Ruas']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFundo(k)}
            className={`px-2.5 py-1 ${fundo === k ? 'bg-brand-dark text-white' : 'text-ink'}`}>{l}</button>
        ))}
      </div>
      <div className="absolute bottom-6 left-2 z-[400] flex items-center gap-2 rounded-md bg-white/90 px-2 py-1 text-[10px] text-ink shadow">
        {Object.entries(ROTULO).filter(([k]) => k !== 'excluido' || verExcluidos).map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COR[k] }} />{l}</span>
        ))}
        <label className="inline-flex items-center gap-1 cursor-pointer border-l border-line pl-2">
          <input type="checkbox" checked={verExcluidos} onChange={e => setVerExcluidos(e.target.checked)} className="w-3 h-3" />Mostrar excluídos
        </label>
      </div>
    </div>
  )
}
