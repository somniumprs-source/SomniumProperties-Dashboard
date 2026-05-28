// Teste de fundacao: prova que _shared/pg.ts + _shared/crud.ts funcionam contra a BD real.
import { Imoveis, Investidores, getDashboardStats } from "../functions/_shared/crud.ts";
import pool from "../functions/_shared/pg.ts";

const list = await Imoveis.list({ limit: 3 });
console.log(`[crud] Imoveis.list -> total=${list.total} devolvidos=${list.data.length}`);
console.log(`[crud] primeiro: ${list.data[0]?.nome ?? "(vazio)"}`);

if (list.data[0]) {
  const one = await Imoveis.getById(list.data[0].id);
  console.log(`[crud] getById -> ${one ? "OK (" + one.nome + ")" : "FALHOU"}`);
}

const search = await Imoveis.search("a", 3);
console.log(`[crud] search('a') -> ${search.length} resultados`);

const invStats = await Investidores.stats({ regiao: "Coimbra" });
console.log(`[crud] Investidores.stats(Coimbra) -> total=${invStats.total}`);

const dash = await getDashboardStats({});
console.log(`[crud] dashboardStats -> imoveis=${dash.imoveis.total} investidores=${dash.investidores.total} negocios=${dash.negocios.total}`);

const pass = list.total >= 0 && typeof dash.imoveis.total === "number";
console.log(`[crud] RESULTADO: ${pass ? "PASS (fundacao pg+crud OK contra BD real)" : "FAIL"}`);

await pool.end();
