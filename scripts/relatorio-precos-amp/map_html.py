#!/usr/bin/env python3
"""Gera o mapa geral (map.html) e um mini-mapa por zona (map_<slug>.html),
cada um com um marcador por imovel colorido pelo €/m²."""
import json, os, re, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "amp_dataset.json"), encoding="utf-8"))
allpts = [d for d in data["imoveis"] if d.get("lat") and d.get("lng") and d.get("valor_mercado_m2")]
VMIN = min(d["valor_mercado_m2"] for d in allpts)
VMAX = max(d["valor_mercado_m2"] for d in allpts)

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

TPL = """<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body{{margin:0;padding:0;background:#fff}}
  #map{{width:{W}px;height:{H}px}}
  .lbl{{background:#0d0d0d;color:#C9A84C;border:1.5px solid #C9A84C;border-radius:6px;
        padding:2px 6px;font:700 {FS}px/1 Arial;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3)}}
  {LEGEND_CSS}
</style></head><body>
<div id="map"></div>
{LEGEND}
<script>
var VMIN={VMIN}, VMAX={VMAX};
function color(v){{
  var t=(v-VMIN)/((VMAX-VMIN)||1);
  var r,g,b;
  if(t<0.5){{var k=t/0.5; r=Math.round(46+(249-46)*k); g=Math.round(125+(168-125)*k); b=Math.round(50+(37-50)*k);}}
  else{{var k=(t-0.5)/0.5; r=Math.round(249+(198-249)*k); g=Math.round(168+(40-168)*k); b=Math.round(37+(40-37)*k);}}
  return 'rgb('+r+','+g+','+b+')';
}}
var map=L.map('map',{{zoomControl:false,attributionControl:false}});
L.tileLayer('https://{{s}}.basemaps.cartocdn.com/rastertiles/voyager/{{z}}/{{x}}/{{y}}{{r}}.png',{{maxZoom:19}}).addTo(map);
var pts={MARKERS};
var group=[];
pts.forEach(function(p){{
  var m=L.circleMarker([p.lat,p.lng],{{radius:{R},color:'#0d0d0d',weight:2,fillColor:color(p.m2),fillOpacity:0.92}}).addTo(map);
  m.bindTooltip((p.m2/1000).toFixed(1).replace('.',',')+'k €/m²',{{permanent:true,direction:'top',className:'lbl',offset:[0,-6]}});
  group.push([p.lat,p.lng]);
}});
if(group.length===1){{ map.setView(group[0],{ZOOM1}); }}
else {{ map.fitBounds(group,{{padding:[{PAD},{PAD}]}}); {ZOOMPLUS} }}
setTimeout(function(){{window.__ready=true;}},300);
</script></body></html>"""

LEGEND_CSS = (".legend{position:absolute;bottom:24px;left:24px;z-index:1000;background:#0d0d0d;color:#fff;"
              "padding:14px 16px;border-radius:10px;font:13px Arial;box-shadow:0 2px 10px rgba(0,0,0,.4)}"
              ".legend b{color:#C9A84C;font-size:14px}.legend .row{display:flex;align-items:center;gap:8px;margin-top:6px}"
              ".legend .sw{width:16px;height:16px;border-radius:50%;border:2px solid #fff}")
LEGEND = (f'<div class="legend"><b>Preço de mercado (€/m²)</b>'
          f'<div class="row"><span class="sw" style="background:#2e7d32"></span> {VMIN:,.0f} (mais baixo)</div>'
          f'<div class="row"><span class="sw" style="background:#f9a825"></span> ~{(VMIN+VMAX)/2:,.0f}</div>'
          f'<div class="row"><span class="sw" style="background:#c62828"></span> {VMAX:,.0f} (mais alto)</div></div>')

def render(path, pts, W, H, R, FS, PAD, zoom1, legend=False, zoomplus=False):
    markers = json.dumps([{"lat": d["lat"], "lng": d["lng"], "m2": d["valor_mercado_m2"]} for d in pts])
    html = TPL.format(W=W, H=H, R=R, FS=FS, PAD=PAD, ZOOM1=zoom1, VMIN=VMIN, VMAX=VMAX,
                      MARKERS=markers, LEGEND_CSS=(LEGEND_CSS if legend else ""),
                      LEGEND=(LEGEND if legend else ""),
                      ZOOMPLUS=("if(map.getZoom()<13){map.setZoom(map.getZoom()+1);}" if zoomplus else ""))
    open(path, "w", encoding="utf-8").write(html)

# mapa geral
render(os.path.join(HERE, "map.html"), allpts, 1240, 1040, 13, 13, 40, 14, legend=True, zoomplus=True)
print("map.html:", len(allpts), "marcadores")

# mini-mapas por zona
zonas = {}
for d in allpts:
    zonas.setdefault(d["freguesia"] or "sem-zona", []).append(d)
for z, arr in zonas.items():
    render(os.path.join(HERE, f"map_{slug(z)}.html"), arr, 1000, 560, 15, 14, 60, 15)
    print(f"map_{slug(z)}.html:", len(arr), "marcador(es)")
