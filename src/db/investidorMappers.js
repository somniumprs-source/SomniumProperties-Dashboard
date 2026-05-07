/**
 * Mapeadores que convertem texto livre vindo de fontes externas (Google Forms,
 * imports legacy) nos valores canónicos esperados pelos selects da Ficha do
 * Investidor. Partilhados entre formsSync.js e o script de migration.
 */

const ROI = ['<10%', '10–15%', '15–20%', '20–25%', '>25%']
const EXPERIENCIA = ['Nenhuma', '1–2 negócios', '3–10 negócios', '>10 negócios']
const TIPO_IMOVEL = ['T0','T1','T2','T3+','Apartamento','Moradia','Edifício','Comercial','Terreno','Ruína','Indiferente']
const DISTRITOS = ['Aveiro','Beja','Braga','Bragança','Castelo Branco','Coimbra','Évora','Faro','Guarda','Leiria','Lisboa','Portalegre','Porto','Santarém','Setúbal','Viana do Castelo','Vila Real','Viseu','Açores','Madeira']
const EQUIPA = ['Própria', 'Da Somnium', 'Indiferente', 'Sem opinião']

const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function mapRoi(raw) {
  if (!raw) return null
  if (ROI.includes(raw)) return raw
  const m = raw.toString().match(/(\d+)/g)
  if (!m) return null
  const v = parseInt(m[m.length - 1])
  if (v < 10) return '<10%'
  if (v < 15) return '10–15%'
  if (v < 20) return '15–20%'
  if (v < 25) return '20–25%'
  return '>25%'
}

export function mapExperiencia(raw) {
  if (!raw) return null
  if (EXPERIENCIA.includes(raw)) return raw
  const n = norm(raw)
  if (/^nao$|^nula$|nenhum|sem experi|primeiro|primeira|^zero$|^0$/.test(n)) return 'Nenhuma'
  const m = n.match(/(\d+)/)
  if (m) {
    const v = parseInt(m[1])
    if (v === 0) return 'Nenhuma'
    if (v <= 2) return '1–2 negócios'
    if (v <= 10) return '3–10 negócios'
    return '>10 negócios'
  }
  if (/iniciante|pouca|baixa|alguma|ainda pouca/.test(n)) return '1–2 negócios'
  if (/intermedi|^media$|moderad|com experi|investidor passivo|transformacao/.test(n)) return '3–10 negócios'
  if (/avancada|muita|alta|elevad|expert|profissional|veterano/.test(n)) return '>10 negócios'
  return null
}

export function mapTipoImovel(raw) {
  if (!raw) return null
  try { const v = JSON.parse(raw); if (Array.isArray(v)) return JSON.stringify(v.filter(x => TIPO_IMOVEL.includes(x))) } catch {}
  const tokens = raw.toString().split(/[,;/]| e | ou /i).map(t => t.trim()).filter(Boolean)
  const out = new Set()
  const all = norm(raw)
  if (/qualquer|indiferente|todo o tipo|sem prefer|flexivel/.test(all)) out.add('Indiferente')
  for (const t of tokens) {
    const n = norm(t)
    if (/^t0|estudio|studio/.test(n)) out.add('T0')
    else if (/^t1\b/.test(n)) out.add('T1')
    else if (/^t2\b/.test(n)) out.add('T2')
    else if (/^t3|^t4|^t5|t3\+/.test(n)) out.add('T3+')
    else if (/moradia/.test(n)) out.add('Moradia')
    else if (/edif[íi]cio|predio/.test(n)) out.add('Edifício')
    else if (/comerci|loja|escrit|armazem/.test(n)) out.add('Comercial')
    else if (/terreno|lote/.test(n)) out.add('Terreno')
    else if (/ruina|recuperac/.test(n)) out.add('Ruína')
    else if (/apartamento|^apart\b/.test(n)) out.add('Apartamento')
  }
  return out.size ? JSON.stringify([...out]) : null
}

export function mapLocalizacao(raw) {
  if (!raw) return null
  try { const v = JSON.parse(raw); if (Array.isArray(v)) return JSON.stringify(v.filter(x => DISTRITOS.includes(x))) } catch {}
  const tokens = raw.toString().split(/[,;/]| e | ou /i).map(t => t.trim()).filter(Boolean)
  const out = new Set()
  for (const t of tokens) {
    const n = norm(t)
    for (const d of DISTRITOS) {
      if (norm(d) === n || n.includes(norm(d))) { out.add(d); break }
    }
  }
  return out.size ? JSON.stringify([...out]) : null
}

export function mapEquipa(raw) {
  if (!raw) return null
  if (EQUIPA.includes(raw)) return raw
  const n = norm(raw)
  if (/propri|tenho|minha equipa|em casa|^sim$/.test(n)) return 'Própria'
  if (/somnium|vossa|da empresa|indicada/.test(n)) return 'Da Somnium'
  if (/indiferente|qualquer|tanto faz/.test(n)) return 'Indiferente'
  if (/sem opin|nao sei|n\/a|nao tenho preferenc|^nao$/.test(n)) return 'Sem opinião'
  return null
}
