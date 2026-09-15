// Extrai o literal de `export const NAME[: Tipo] = <literal>` de código
// fonte TS/JS, por casamento de chavetas/parêntesis (não é um parser real,
// mas chega para objectos/arrays/Set de primitivos como os deste repo).
// Partilhado por generate-shared-roles.mjs e check-role-parity.mjs — extrair
// isto para aqui foi exactamente para não repetir a mesma lógica de parsing
// em dois scripts e arriscar divergirem entre si também.

export function extractLiteral(src, name, file) {
  const re = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*`, "g");
  const m = re.exec(src);
  if (!m) throw new Error(`Não encontrei "${name}" em ${file} — actualiza o regex ou o ficheiro mudou de forma inesperada.`);
  const start = m.index + m[0].length;
  const rest = src.slice(start);

  let open, close, isSet = false;
  if (rest.startsWith("new Set(")) { open = "["; close = "]"; isSet = true; }
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
  return { value: Array.isArray(value) ? value.slice().sort() : value, isSet };
}

export function normalizeRoleMap(map) {
  const out = {};
  for (const role of Object.keys(map).sort()) out[role] = [...map[role]].sort();
  return out;
}
