#!/usr/bin/env node
// Verifica que src/db/rolesShared.generated.js está actualizado em relação
// à fonte única (supabase/functions/_shared/roles.ts) — regenera em memória
// e compara byte-a-byte com o ficheiro commitado. Falha se alguém editou o
// gerado à mão, ou mudou roles.ts e esqueceu-se de correr
// `npm run generate:roles` antes de commitar.
//
// Uso: node scripts/check-role-parity.mjs   (sai com código 1 se desactualizado)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generate } from "./generate-shared-roles.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "src/db/rolesShared.generated.js";

let current;
try {
  current = readFileSync(join(ROOT, OUT), "utf8");
} catch {
  console.log(`DIVERGE  ${OUT} não existe — corre: npm run generate:roles`);
  process.exit(1);
}

const fresh = generate();

if (current === fresh) {
  console.log(`OK  ${OUT} está actualizado em relação a supabase/functions/_shared/roles.ts.`);
} else {
  console.log(`DIVERGE  ${OUT} está desactualizado em relação a supabase/functions/_shared/roles.ts.`);
  console.log("  Corre: npm run generate:roles — e commita o resultado.");
  process.exit(1);
}
