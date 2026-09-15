#!/usr/bin/env node
// Gera src/db/rolesShared.generated.js a partir de
// supabase/functions/_shared/roles.ts — a fonte única de roles/módulos.
//
// Porquê: Node não importa um módulo Deno directamente, por isso o Express
// de dev não conseguia partilhar literalmente o mesmo ficheiro que as Edge
// Functions. A alternativa anterior (copiar as constantes à mão em
// userRoutes.js + um script a comparar as duas cópias) ainda deixava espaço
// para alguém esquecer de correr o script antes de commitar. Gerar o
// ficheiro Node a partir do .ts elimina essa hipótese: só há UM sítio onde
// as constantes são escritas à mão (roles.ts); tudo o resto é derivado.
//
// Corre automaticamente antes de "dev"/"build"/"server" (ver package.json).
// O ficheiro gerado FICA commitado no git (para um checkout novo funcionar
// mesmo antes de correr npm run dev/build) — o CI verifica que está
// actualizado regenerando e comparando (ver check-role-parity.mjs).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractLiteral } from "./lib/extractTsLiteral.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "supabase/functions/_shared/roles.ts";
const OUT = "src/db/rolesShared.generated.js";

const NAMES = ["ROLES", "ROLE_AREAS", "ROLE_MODULES", "RECORD_RESTRICTED_ROLES", "NON_ID_SEGS"];

export function generate() {
  const tsSrc = readFileSync(join(ROOT, SRC), "utf8");
  const consts = {};
  for (const name of NAMES) consts[name] = extractLiteral(tsSrc, name, SRC);

  const lines = [
    "// GERADO AUTOMATICAMENTE a partir de " + SRC + " — NÃO editar à mão.",
    "// Para regenerar: npm run generate:roles (já corre sozinho antes de dev/build/server).",
    "// Mudar roles/módulos/áreas: editar " + SRC + " e regenerar — nunca este ficheiro directamente.",
    "",
  ];
  for (const name of NAMES) {
    const { value, isSet } = consts[name];
    const json = JSON.stringify(value);
    lines.push(`export const ${name} = ${isSet ? `new Set(${json})` : json}`);
  }
  lines.push("");
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const content = generate();
  writeFileSync(join(ROOT, OUT), content);
  console.log(`Gerado ${OUT} a partir de ${SRC}.`);
}
