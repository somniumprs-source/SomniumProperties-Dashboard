// Leva o modelo de fases e tarefas (src/db/fasesFixFlip.js) aos projetos
// CAEP e Wholesaling já criados: tarefas novas de documentos e relatórios,
// checklists novas ou acrescentadas, e as tarefas que o modelo novo absorveu.
//
//   • Fases concluídas ficam como estão, exceto as tarefas de SEMPRE_ADICIONAR
//     (obrigações do SOP 12 que continuam por cumprir depois da fase).
//   • Tarefas concluídas nunca são renomeadas, apagadas nem ganham checklist.
//   • Checklists existentes só ganham itens; o que já foi marcado mantém-se.
//   • Tarefas próprias do projeto (fora do modelo) ficam a seguir à tarefa que
//     as antecedia.
//
// Idempotente. Dry-run por defeito; passar --apply para gravar.
import 'dotenv/config'
import { randomUUID } from 'crypto'
import pg from 'pg'
import { getTemplateFases } from '../src/db/fasesFixFlip.js'
import { normalizarTarefa, lerChecklist, recalcularFase } from '../src/db/projetoTarefas.js'

const APPLY = process.argv.includes('--apply')
const CATEGORIAS = ['CAEP', 'Wholesaling']
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// categoria → fase_key → { descrição antiga: nova }
const RENOMEAR = {
  CAEP: {
    comercializacao: { 'Listing em portais (Idealista, Imovirtual, Casa Sapo)': 'Lançamento ao mercado conforme o PEV' },
    vendido: {
      'Distribuição de capital + lucro a investidores CAEP': 'Prestação de contas e liquidação ao investidor',
      'Cálculo de TIR realizada': 'Balanço interno do projeto',
    },
  },
}
// categoria → fase_key → descrições absorvidas por outra tarefa
const APAGAR = {
  CAEP: {
    demolicoes: ['Fotografias do estado zero (todas as divisões)'],  // já está na consignação
    vendido: ['Relatório de saída para investidores'],                // parte da prestação de contas
  },
}
const SEMPRE_ADICIONAR = new Set([
  'Dossiê de Investidor e comunicação de boas-vindas',
  'Calendário de obrigações declarativas enviado à contabilista',
])

const concluida = t => Number(t.concluida) === 1 || t.concluida === true

function juntarChecklist(atual, modelo) {
  if (!modelo) return null
  if (!atual) return modelo
  const chaves = new Set(atual.itens.map(i => i.k))
  const novos = modelo.itens.filter(i => !chaves.has(i.k))
  return novos.length ? { ...atual, itens: [...atual.itens, ...novos] } : null
}

const client = await pool.connect()
const resumo = { inserir: 0, renomear: 0, apagar: 0, checklist: 0 }
try {
  await client.query('BEGIN')
  console.log(APPLY ? '>>> MODO APPLY (vai gravar)\n' : '>>> DRY-RUN (nada gravado; usar --apply)\n')
  const { rows: negocios } = await client.query(
    `SELECT id, movimento, categoria FROM negocios WHERE categoria = ANY($1) AND deleted_at IS NULL ORDER BY movimento`, [CATEGORIAS])

  for (const neg of negocios) {
    console.log(`## ${neg.categoria} · ${neg.movimento}`)
    const modelo = getTemplateFases(neg.categoria)
    const { rows: fases } = await client.query('SELECT id, fase_key, estado FROM projeto_fases WHERE negocio_id = $1 ORDER BY ordem', [neg.id])

    for (const fase of fases) {
      const tpl = modelo.find(f => f.key === fase.fase_key)
      if (!tpl) continue
      const fechada = fase.estado === 'concluida'
      const log = msg => console.log(`  [${fase.fase_key}] ${msg}`)
      let { rows: tarefas } = await client.query(
        'SELECT id, descricao, ordem, concluida, checklist, opcional, ativa FROM projeto_tarefas WHERE fase_id = $1 ORDER BY ordem, descricao', [fase.id])
      let mexeu = false

      if (!fechada) {
        for (const [antiga, nova] of Object.entries(RENOMEAR[neg.categoria]?.[fase.fase_key] || {})) {
          const t = tarefas.find(x => x.descricao === antiga && !concluida(x))
          if (!t || tarefas.some(x => x.descricao === nova)) continue
          log(`✏️  «${antiga}» → «${nova}»`)
          t.descricao = nova; resumo.renomear++; mexeu = true
          if (APPLY) await client.query('UPDATE projeto_tarefas SET descricao = $1 WHERE id = $2', [nova, t.id])
        }
        for (const desc of APAGAR[neg.categoria]?.[fase.fase_key] || []) {
          const t = tarefas.find(x => x.descricao === desc && !concluida(x))
          if (!t) continue
          log(`🗑️  «${desc}»`)
          tarefas = tarefas.filter(x => x !== t); resumo.apagar++; mexeu = true
          if (APPLY) await client.query('DELETE FROM projeto_tarefas WHERE id = $1', [t.id])
        }
      }

      // Ordem final: a do modelo; as tarefas próprias seguem a que as antecedia.
      const final = []
      for (const n of tpl.tarefas.map(normalizarTarefa)) {
        let t = tarefas.find(x => x.descricao === n.descricao)
        if (!t) {
          if (fechada && !SEMPRE_ADICIONAR.has(n.descricao)) continue
          log(`➕ «${n.descricao}»${n.checklist ? ` (checklist com ${n.checklist.itens.length} itens)` : ''}`)
          t = { id: randomUUID(), descricao: n.descricao, nova: true, checklist: n.checklist, opcional: n.opcional, ativa: !n.opcional }
          resumo.inserir++; mexeu = true
        } else if (!concluida(t) && !fechada) {
          const junta = juntarChecklist(lerChecklist(t.checklist), n.checklist)
          if (junta) {
            const antes = lerChecklist(t.checklist)?.itens.length || 0
            log(`☑️  «${n.descricao}»: checklist ${antes} → ${junta.itens.length} itens`)
            t.checklist = junta; t.checklistMudou = true; resumo.checklist++; mexeu = true
          }
        }
        final.push(t)
      }
      for (const t of tarefas) {
        if (final.includes(t)) continue
        const antes = tarefas.slice(0, tarefas.indexOf(t)).reverse().find(x => final.includes(x))
        final.splice(antes ? final.indexOf(antes) + 1 : 0, 0, t)
      }
      if (!mexeu || !APPLY) continue

      for (let i = 0; i < final.length; i++) {
        const t = final[i]
        const ch = t.checklist ? JSON.stringify(typeof t.checklist === 'string' ? JSON.parse(t.checklist) : t.checklist) : null
        if (t.nova) {
          await client.query(
            `INSERT INTO projeto_tarefas (id, fase_id, descricao, ordem, checklist, opcional, ativa) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [t.id, fase.id, t.descricao, i, ch, !!t.opcional, t.ativa !== false])
        } else if (t.checklistMudou) {
          await client.query('UPDATE projeto_tarefas SET ordem = $1, checklist = $2 WHERE id = $3', [i, ch, t.id])
        } else if (t.ordem !== i) {
          await client.query('UPDATE projeto_tarefas SET ordem = $1 WHERE id = $2', [i, t.id])
        }
      }
      await recalcularFase(client, fase.id)
    }
  }

  await client.query(APPLY ? 'COMMIT' : 'ROLLBACK')
  console.log(`\n=== ${resumo.inserir} a inserir · ${resumo.renomear} a renomear · ${resumo.apagar} a apagar · ${resumo.checklist} checklist(s) ===`)
  console.log(APPLY ? '✅ Aplicado.' : 'ℹ️  Dry-run — correr com --apply para gravar.')
} catch (e) {
  await client.query('ROLLBACK')
  console.error('❌ rollback:', e.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
