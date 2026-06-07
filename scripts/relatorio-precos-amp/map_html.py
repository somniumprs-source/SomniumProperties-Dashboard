#!/usr/bin/env python3
"""Gera map.html (Leaflet) com um marcador por imovel colorido pelo €/m²."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "amp_dataset.json"), encoding="utf-8"))
pts = [d for d in data["imoveis"] if d.get("lat") and d.get("lng") and d.get("valor_mercado_m2")]
vals = [d["valor_mercado_m2"] for d in pts]
vmin, vmax = min(vals), max(vals)
markers = json.dumps([{
    "lat": d["lat"], "lng": d["lng"], "m2": d["valor_mercado_m2"],
    "freg": d["freguesia"], "tip": d["tipologia"], "nome": d["nome"],
} for d in pts], ensure_ascii=False)

html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body{{margin:0;padding:0;background:#fff}}
  #map{{width:1240px;height:1040px}}
  .lbl{{background:#0d0d0d;color:#C9A84C;border:1.5px solid #C9A84C;border-radius:6px;
        padding:2px 6px;font:700 13px/1 Arial;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3)}}
  .legend{{position:absolute;bottom:24px;left:24px;z-index:1000;background:#0d0d0d;color:#fff;
        padding:14px 16px;border-radius:10px;font:13px Arial;box-shadow:0 2px 10px rgba(0,0,0,.4)}}
  .legend b{{color:#C9A84C;font-size:14px}}
  .legend .row{{display:flex;align-items:center;gap:8px;margin-top:6px}}
  .legend .sw{{width:16px;height:16px;border-radius:50%;border:2px solid #fff}}
</style></head><body>
<div id="map"></div>
<div class="legend"><b>Preço de mercado (€/m²)</b>
  <div class="row"><span class="sw" style="background:#2e7d32"></span> {vmin:,.0f} (mais baixo)</div>
  <div class="row"><span class="sw" style="background:#f9a825"></span> ~{(vmin+vmax)/2:,.0f}</div>
  <div class="row"><span class="sw" style="background:#c62828"></span> {vmax:,.0f} (mais alto)</div>
</div>
<script>
var VMIN={vmin}, VMAX={vmax};
function color(v){{
  var t=(v-VMIN)/(VMAX-VMIN); // 0..1 verde->amarelo->vermelho
  var r,g,b;
  if(t<0.5){{var k=t/0.5; r=Math.round(46+(249-46)*k); g=Math.round(125+(168-125)*k); b=Math.round(50+(37-50)*k);}}
  else{{var k=(t-0.5)/0.5; r=Math.round(249+(198-249)*k); g=Math.round(168+(40-168)*k); b=Math.round(37+(40-37)*k);}}
  return 'rgb('+r+','+g+','+b+')';
}}
var map=L.map('map',{{zoomControl:false,attributionControl:false}});
L.tileLayer('https://{{s}}.basemaps.cartocdn.com/rastertiles/voyager/{{z}}/{{x}}/{{y}}{{r}}.png',{{maxZoom:19}}).addTo(map);
var pts={markers};
var group=[];
pts.forEach(function(p){{
  var m=L.circleMarker([p.lat,p.lng],{{radius:13,color:'#0d0d0d',weight:2,fillColor:color(p.m2),fillOpacity:0.92}}).addTo(map);
  m.bindTooltip((p.m2/1000).toFixed(1).replace('.',',')+'k €/m²',{{permanent:true,direction:'top',className:'lbl',offset:[0,-6]}});
  group.push([p.lat,p.lng]);
}});
map.fitBounds(group,{{padding:[40,40]}});
if(map.getZoom()<13){{map.setZoom(map.getZoom()+1);}}  // ampliar um pouco mais quando possivel
setTimeout(function(){{window.__ready=true;}},300);
</script></body></html>"""
open(os.path.join(HERE, "map.html"), "w", encoding="utf-8").write(html)
print("map.html gerado com", len(pts), "marcadores | €/m²:", round(vmin), "->", round(vmax))
