#!/usr/bin/env node
// Compara as constantes de roles/módulos entre o Express de dev
// (src/db/userRoutes.js) e a fonte única de produção
// (supabase/functions/_shared/roles.ts). Node não consegue importar um
// módulo Deno directamente, por isso o lado de dev mantém a sua própria
// cópia à mão — este script é o que garante que as duas cópias não divergem
// em silêncio (foi exactamente isto que aconteceu com "crm.despesas": existia
// numa Edge Function mas não nas outras nem em dev).
//
// Extrai os literais por regex (não executa o código de nenhum dos lados —
// userRoutes.js abre ligação à BD/Supabase à importação) e avalia-os como
// JSON depois de normalizar `new Set([...])` para array. Falha alto e claro
// se não conseguir encontrar/parsear uma constante, em vez de passar em
// silêncio — mais seguro para um lint check do que assumir "sem match = OK".
//
// Uso: node scripts/check-role-parity.mjs   (sai com código 1 se divergir)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

// Extrai o literal de `export const NAME[: Tipo] = <literal>` até ao fecho
// top-level (objecto `{...}`, array `[...]`, ou `new Set([...])`), ignorando
// a anotação de tipo TS quando presente.
function extractLiteral(src, name, file) {
  const re = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*`, "g");
  const m = re.exec(src);
  if (!m) throw new Error(`Não encontrei "${name}" em ${file} — actualiza o regex ou o ficheiro mudou de forma inesperada.`);
  const start = m.index + m[0].length;
  const rest = src.slice(start);

  let open, close;
  if (rest.startsWith("new Set(")) { open = "["; close = "]"; }
  else if (rest.startsWith("{")) { open = "{"; close = "}"; }
  else if (rest.startsWith("[")) { open = "["; close = "]"; }
  else throw new Error(`"${name}" em ${file} não começa por objecto/array/Set — literal inesperado.`);

  const openIdx = rest.indexOf(open);
  let depth = 0, i = openIdx;
  for (; i < rest.length; i++) {
    if (rest[i] === open) depth++;
    else if (rest[i] === close) { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error(`"${name}" em ${file}: não fechei o literal (chavetas/parêntesis desequilibrados?).`);

  const literal = rest.slice(openIdx, i + 1);
  // eslint-disable-next-line no-new-func
  const value = new Function(`return (${literal});`)();
  return Array.isArray(value) ? value.slice().sort() : value;
}

function normalizeRoleMap(map) {
  const out = {};
  for (const role of Object.keys(map).sort()) out[role] = [...map[role]].sort();
  return out;
}

const DEV_FILE = "src/db/userRoutes.js";
const SHARED_FILE = "supabase/functions/_shared/roles.ts";

const devSrc = readSrc(DEV_FILE);
const sharedSrc = readSrc(SHARED_FILE);

const CHECKS = [
  { name: "ROLES", kind: "array" },
  { name: "ROLE_AREAS", kind: "map" },
  { name: "ROLE_MODULES", kind: "map" },
  { name: "RECORD_RESTRICTED_ROLES", kind: "array" },
];

let hasDiff = false;

for (const { name, kind } of CHECKS) {
  let devVal, sharedVal;
  try {
    devVal = extractLiteral(devSrc, name, DEV_FILE);
    sharedVal = extractLiteral(sharedSrc, name, SHARED_FILE);
  } catch (e) {
    console.error(`ERRO a extrair ${name}: ${e.message}`);
    hasDiff = true;
    continue;
  }
  if (kind === "map") { devVal = normalizeRoleMap(devVal); sharedVal = normalizeRoleMap(sharedVal); }
  const devJson = JSON.stringify(devVal);
  const sharedJson = JSON.stringify(sharedVal);
  if (devJson === sharedJson) {
    console.log(`OK  ${name} — igual em dev e produção.`);
  } else {
    hasDiff = true;
    console.log(`\nDIVERGE  ${name}`);
    console.log(`  ${DEV_FILE}:\n    ${devJson}`);
    console.log(`  ${SHARED_FILE}:\n    ${sharedJson}`);
  }
}

// NON_ID_SEGS não é exportado em userRoutes.js (é local a uma função) — regex à parte.
{
  const devMatch = devSrc.match(/NON_ID_SEGS\s*=\s*new Set\((\[[^\]]*\])\)/);
  const sharedMatch = sharedSrc.match(/NON_ID_SEGS\s*=\s*new Set\((\[[^\]]*\])\)/);
  if (!devMatch || !sharedMatch) {
    console.error("ERRO a extrair NON_ID_SEGS de um dos ficheiros.");
    hasDiff = true;
  } else {
    const devVal = JSON.parse(devMatch[1].replace(/'/g, '"')).sort();
    const sharedVal = JSON.parse(sharedMatch[1].replace(/'/g, '"')).sort();
    if (JSON.stringify(devVal) === JSON.stringify(sharedVal)) {
      console.log("OK  NON_ID_SEGS — igual em dev e produção.");
    } else {
      hasDiff = true;
      console.log(`\nDIVERGE  NON_ID_SEGS\n  ${DEV_FILE}: ${JSON.stringify(devVal)}\n  ${SHARED_FILE}: ${JSON.stringify(sharedVal)}`);
    }
  }
}

if (hasDiff) {
  console.log(`\n${DEV_FILE} e ${SHARED_FILE} têm de descrever exactamente as mesmas roles/módulos — actualiza os dois lados.`);
  process.exit(1);
}
