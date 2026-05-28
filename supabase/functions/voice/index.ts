// Edge Function "voice" — port do handler app.post('/api/voice/process') de server.js.
// Interpreta comandos de voz em PT via Claude (Anthropic SDK) e executa a accao
// correspondente no CRM (escritas directas via pool). System prompt, schema JSON e
// toda a logica de pos-processamento sao preservados VERBATIM do original.
//
// Deps: @anthropic-ai/sdk + pool (pg.ts) + crypto.randomUUID() (global no Deno).
import { createApp } from "../_shared/hono.ts";
import { requireAuth } from "../_shared/auth.ts";
import pool from "../_shared/pg.ts";
import Anthropic from "@anthropic-ai/sdk";

const app = createApp("/voice");

// Auth em codigo: o gateway verify_jwt=true aceita a anon key (publica); requireAuth
// exige um utilizador REAL (rejeita anon), como o middleware global do Render. _health isento.
app.use("*", async (c: any, next: any) => {
  if (c.req.path.endsWith("/_health")) return await next();
  return await requireAuth(c, next);
});

// Equivalente a `const { query: pgQuery } = await import('./src/db/pg.js')`.
const pgQuery = (text: string, params?: any[]) => pool.query(text, params);

// ── POST /voice/process (port de server.js 364-614) ──
app.post("/process", async (c: any) => {
  try {
    const { text } = await c.req.json().catch(() => ({}));
    if (!text?.trim()) return c.json({ error: "Texto vazio" }, 400);

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const now = new Date().toISOString();
    const hoje = new Date().toISOString().slice(0, 10);

    // Buscar consultores e imoveis para contexto
    const { rows: consultores } = await pgQuery("SELECT id, nome FROM consultores LIMIT 200");
    const { rows: imoveis } = await pgQuery("SELECT id, nome, estado FROM imoveis LIMIT 200");
    const consNomes = consultores.map((c: any) => c.nome).join(", ");
    const imNomes = imoveis.map((i: any) => `${i.nome} (${i.estado})`).join(", ");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: `Interpretas comandos de voz em português para um CRM imobiliário. Data de hoje: ${hoje}.

CONSULTORES NA BASE: ${consNomes}
IMÓVEIS NA BASE: ${imNomes}

Devolve SEMPRE JSON com exactamente este schema:
{
  "accao": "TAREFA|NOTA_IMOVEL|NOTA_CONSULTOR|INTERACAO|MOVER_ESTADO|CLASSIFICAR|FOLLOW_UP|CRIAR_IMOVEL|ATUALIZAR_IMOVEL|CRIAR_CONSULTOR",
  "descricao": "texto limpo e claro da tarefa/nota (reformula se necessario)",
  "entidade": "nome do consultor ou imovel (exacto da base)",
  "entidade_tipo": "consultor|imovel|null",
  "data": "YYYY-MM-DD",
  "hora_inicio": "HH:MM ou null",
  "hora_fim": "HH:MM ou null",
  "duracao_horas": numero (default 1 se nao especificado),
  "categoria": "Follow-up Consultor|Visita|Análise|Proposta|Documentação|Reunião|Obra|Outro",
  "novo_estado": "estado pipeline ou null",
  "canal": "chamada|whatsapp|null",
  "preencher_data_visita": true|false (true se for visita a imovel),
  "preencher_data_chamada": true|false (true se for chamada a consultor/imovel),
  "mensagem_ui": "texto curto para mostrar ao utilizador"
}

REGRAS DE INTERPRETAÇÃO:
- Se diz "às 18 horas" sem hora fim → hora_inicio=18:00, duracao=1h, hora_fim=19:00
- Se diz "das 10 às 12" → hora_inicio=10:00, hora_fim=12:00, duracao=2
- Se diz "durante 2 horas" → duracao=2
- Se diz "sexta-feira" → calcular a data exacta YYYY-MM-DD
- Se diz "amanhã" → data de amanha
- Se diz "visita ao imovel X" → preencher_data_visita=true + TAREFA categoria Visita
- Se diz "ligar ao consultor X" → preencher_data_chamada=true + INTERACAO/TAREFA
- Se diz "follow up feito" → registar como ja realizado (INTERACAO passada)
- Se diz "nota ao imovel/consultor" → NOTA_IMOVEL ou NOTA_CONSULTOR
- SEMPRE reformula a descricao para ser clara e concisa

Exemplos:
"na sexta-feira vamos fazer visita ao imovel pelas 18 horas" → TAREFA, Visita, imovel match, data=sexta, hora_inicio=18:00, hora_fim=19:00, preencher_data_visita=true
"ligar ao consultor Teresa amanha as 10" → TAREFA, Follow-up, Teresa Sousa, data=amanha, hora_inicio=10:00, hora_fim=10:30, duracao=0.5
"nota ao prédio rua do clube: proprietário aceita 150k" → NOTA_IMOVEL, Prédio Rua do Clube
"follow up ao Amaro feito hoje por chamada" → INTERACAO, Amaro Bailão, canal=chamada, data=hoje
"mover prédio Bencanta para estudo de VVR" → MOVER_ESTADO, Prédio Bencanta, novo_estado=Estudo de VVR

"adicionar imovel T3 em Celas consultor João preço 180 mil" → CRIAR_IMOVEL
"actualizar preço do prédio Bencanta para 340 mil" → ATUALIZAR_IMOVEL
"adicionar consultor Maria Santos telefone 912345678" → CRIAR_CONSULTOR

Faz match aproximado dos nomes (Teresa → Teresa Sousa, prédio clube → Prédio Rua do Clube).
TODAS as tarefas devem ser sincronizadas com Google Calendar.`,
      messages: [{ role: "user", content: text }],
    });

    const respText = (response.content[0] as any)?.text || "{}";
    let parsed: any;
    try {
      const jsonMatch = respText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || respText);
    } catch { parsed = { accao: "TAREFA", descricao: text, mensagem_ui: text }; }

    const accao = parsed.accao || "TAREFA";
    const entNome = parsed.entidade;
    let msg = parsed.mensagem_ui || "Processado";

    // Executar accao
    if (accao === "NOTA_IMOVEL" && entNome) {
      const im = imoveis.find((i: any) => i.nome.toLowerCase().includes(entNome.toLowerCase()));
      if (im) {
        const { rows: [existing] } = await pgQuery("SELECT notas FROM imoveis WHERE id = $1", [im.id]);
        const notas = (existing?.notas || "") + "\n" + `[${hoje}] ${parsed.descricao}`;
        await pgQuery("UPDATE imoveis SET notas = $1, updated_at = $2 WHERE id = $3", [notas.trim(), now, im.id]);
        msg = `Nota adicionada ao imóvel "${im.nome}"`;
      } else { msg = `Imóvel "${entNome}" não encontrado`; }
    } else if (accao === "NOTA_CONSULTOR" && entNome) {
      const cons = consultores.find((c: any) => c.nome.toLowerCase().includes(entNome.toLowerCase()));
      if (cons) {
        const { rows: [existing] } = await pgQuery("SELECT notas FROM consultores WHERE id = $1", [cons.id]);
        const notas = (existing?.notas || "") + "\n" + `[${hoje}] ${parsed.descricao}`;
        await pgQuery("UPDATE consultores SET notas = $1, updated_at = $2 WHERE id = $3", [notas.trim(), now, cons.id]);
        msg = `Nota adicionada ao consultor "${cons.nome}"`;
      } else { msg = `Consultor "${entNome}" não encontrado`; }
    } else if (accao === "INTERACAO" && entNome) {
      const cons = consultores.find((c: any) => c.nome.toLowerCase().includes(entNome.toLowerCase()));
      if (cons) {
        await pgQuery(
          "INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)",
          [crypto.randomUUID(), cons.id, parsed.data ? `${parsed.data}T${parsed.hora || "09:00"}:00Z` : now, parsed.canal || "chamada", "Enviado", parsed.descricao],
        );
        msg = `Interacção registada com "${cons.nome}" (${parsed.canal || "chamada"})`;
      } else { msg = `Consultor "${entNome}" não encontrado`; }
    } else if (accao === "MOVER_ESTADO" && entNome && parsed.novo_estado) {
      const im = imoveis.find((i: any) => i.nome.toLowerCase().includes(entNome.toLowerCase()));
      if (im) {
        await pgQuery("UPDATE imoveis SET estado = $1, updated_at = $2 WHERE id = $3", [parsed.novo_estado, now, im.id]);
        msg = `"${im.nome}" movido para "${parsed.novo_estado}"`;
      } else { msg = `Imóvel "${entNome}" não encontrado`; }
    } else if (accao === "CLASSIFICAR" && entNome) {
      const cons = consultores.find((c: any) => c.nome.toLowerCase().includes(entNome.toLowerCase()));
      if (cons) {
        const estado = parsed.descricao.toLowerCase().includes("inativo") ? "Inativo" : parsed.descricao.toLowerCase().includes("ativo") ? "Ativo" : "Em avaliação";
        await pgQuery("UPDATE consultores SET estado_avaliacao = $1, updated_at = $2 WHERE id = $3", [estado, now, cons.id]);
        msg = `"${cons.nome}" classificado como "${estado}"`;
      }
    } else if (accao === "FOLLOW_UP" && entNome) {
      const cons = consultores.find((c: any) => c.nome.toLowerCase().includes(entNome.toLowerCase()));
      if (cons) {
        const data = parsed.data || hoje;
        await pgQuery("UPDATE consultores SET data_follow_up = $1, data_proximo_follow_up = $2, updated_at = $3 WHERE id = $4", [data, data, now, cons.id]);
        await pgQuery(
          "INSERT INTO consultor_interacoes (id, consultor_id, data_hora, canal, direcao, notas) VALUES ($1, $2, $3, $4, $5, $6)",
          [crypto.randomUUID(), cons.id, `${data}T${parsed.hora || "09:00"}:00Z`, parsed.canal || "chamada", "Enviado", `Follow-up: ${parsed.descricao}`],
        );
        msg = `Follow-up registado com "${cons.nome}" — ${data}`;
      }
    } else if (accao === "CRIAR_IMOVEL") {
      const nome = parsed.descricao || text;
      const PORT = Deno.env.get("PORT") ?? 3001;
      try {
        await fetch(`http://localhost:${PORT}/api/crm/imoveis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome,
            zona: parsed.zona || null,
            tipologia: parsed.tipologia || null,
            ask_price: parsed.ask_price || 0,
            nome_consultor: parsed.entidade || null,
            origem: "Consultor",
          }),
        });
        msg = `Imóvel criado: "${nome}"`;
      } catch { msg = `Erro ao criar imóvel`; }
    } else if (accao === "ATUALIZAR_IMOVEL" && entNome) {
      const im = imoveis.find((i: any) => i.nome.toLowerCase().includes(entNome.toLowerCase()));
      if (im) {
        const updates: Record<string, any> = {};
        if (parsed.ask_price) updates.ask_price = parsed.ask_price;
        if (parsed.valor_proposta) updates.valor_proposta = parsed.valor_proposta;
        if (parsed.tipologia) updates.tipologia = parsed.tipologia;
        if (parsed.zona) updates.zona = parsed.zona;
        if (parsed.descricao) {
          const { rows: [ex] } = await pgQuery("SELECT notas FROM imoveis WHERE id = $1", [im.id]);
          updates.notas = ((ex?.notas || "") + "\n" + `[${hoje}] ${parsed.descricao}`).trim();
        }
        if (Object.keys(updates).length > 0) {
          const sets = Object.entries(updates).map(([k], i) => `${k} = $${i + 1}`);
          sets.push(`updated_at = $${Object.keys(updates).length + 1}`);
          const params = [...Object.values(updates), now, im.id];
          await pgQuery(`UPDATE imoveis SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
        }
        msg = `"${im.nome}" actualizado`;
      }
    } else if (accao === "CRIAR_CONSULTOR") {
      const PORT = Deno.env.get("PORT") ?? 3001;
      try {
        await fetch(`http://localhost:${PORT}/api/crm/consultores/find-or-create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: parsed.entidade || parsed.descricao,
            contacto: parsed.contacto || null,
          }),
        });
        msg = `Consultor criado/encontrado: "${parsed.entidade || parsed.descricao}"`;
      } catch { msg = `Erro ao criar consultor`; }
    } else {
      // Default: criar tarefa com hora inicio/fim
      const hInicio = parsed.hora_inicio || "09:00";
      const duracao = parsed.duracao_horas || 1;
      const hFim = parsed.hora_fim || (() => {
        const [h, m] = hInicio.split(":").map(Number);
        const totalMin = h * 60 + m + duracao * 60;
        return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
      })();
      const dataStr = parsed.data || hoje;
      const inicio = `${dataStr}T${hInicio}:00`;
      const fim = `${dataStr}T${hFim}:00`;

      // Criar tarefa via endpoint interno (sincroniza automaticamente com Google Calendar)
      try {
        const PORT = Deno.env.get("PORT") ?? 3001;
        await fetch(`http://localhost:${PORT}/api/tarefas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tarefa: parsed.descricao || text,
            categoria: parsed.categoria || "Outro",
            funcionario: "Alexandre Mendes",
            inicio,
            fim,
          }),
        });
      } catch (_tarefaErr) {
        // Fallback: criar directamente na DB
        await pgQuery(
          `INSERT INTO tarefas (id, tarefa, status, categoria, funcionario, inicio, fim, created_at, updated_at)
               VALUES ($1, $2, 'A fazer', $3, $4, $5, $6, $7, $7)`,
          [crypto.randomUUID(), parsed.descricao || text, parsed.categoria || "Outro", "Alexandre Mendes", inicio, fim, now],
        );
      }

      // Preencher datas nas fichas dos imoveis
      if (parsed.preencher_data_visita && entNome) {
        const im = imoveis.find((i: any) => i.nome.toLowerCase().includes(entNome.toLowerCase()));
        if (im) {
          await pgQuery("UPDATE imoveis SET data_visita = $1, updated_at = $2 WHERE id = $3", [dataStr, now, im.id]);
          msg = `Visita agendada: "${parsed.descricao}" (${hInicio}-${hFim}) — data_visita preenchida + Google Calendar sincronizado`;
        } else {
          msg = `Tarefa criada: "${parsed.descricao}" (${hInicio}-${hFim}) + Google Calendar`;
        }
      } else if (parsed.preencher_data_chamada && entNome) {
        const im = imoveis.find((i: any) => i.nome.toLowerCase().includes(entNome.toLowerCase()));
        if (im) {
          await pgQuery("UPDATE imoveis SET data_chamada = $1, updated_at = $2 WHERE id = $3", [dataStr, now, im.id]);
        }
        msg = `Tarefa criada: "${parsed.descricao}" (${hInicio}-${hFim}) + Google Calendar`;
      } else {
        msg = `Tarefa criada: "${parsed.descricao}" (${hInicio}-${hFim}) + Google Calendar`;
      }
    }

    return c.json({ ok: true, message: msg, accao, parsed });
  } catch (e) { return c.json({ ok: false, error: (e as Error).message }, 500); }
});

app.get("/_health", (c) => c.json({ ok: true, fn: "voice" }));

Deno.serve(app.fetch);
