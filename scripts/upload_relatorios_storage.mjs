// Sobe os ficheiros de Relatorios/<semana>/ para o bucket privado "Relatorios"
// no Supabase Storage, para ficarem disponiveis na aba Administracao -> Relatorios
// (funciona em dev e em producao, via URLs assinadas geradas pelo backend).
//
// Uso:
//   node scripts/upload_relatorios_storage.mjs              # semana 2026-W23
//   node scripts/upload_relatorios_storage.mjs 2026-W24
//
// Sobe apenas .pdf e .pptx. Requer SUPABASE_URL e SUPABASE_SERVICE_KEY no .env.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "Relatorios";
const SEMANA = process.argv[2] || "2026-W23";

// --- carregar .env (sem dependencias) ---------------------------------------
const env = {};
try {
  for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
} catch { /* sem .env */ }

const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Erro: faltam SUPABASE_URL / SUPABASE_SERVICE_KEY no ambiente ou .env");
  process.exit(1);
}

const CONTENT_TYPES = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  // garantir bucket privado
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) throw error;
    console.log(`Bucket "${BUCKET}" criado (privado).`);
  } else {
    console.log(`Bucket "${BUCKET}" ja existe.`);
  }

  const dir = path.join(ROOT, "Relatorios", SEMANA);
  const files = readdirSync(dir).filter((f) => {
    const ext = f.split(".").pop()?.toLowerCase();
    return ext && CONTENT_TYPES[ext] && !f.startsWith("~$");
  });
  if (!files.length) {
    console.log(`Sem ficheiros .pdf/.pptx em ${dir}`);
    return;
  }

  for (const name of files) {
    const ext = name.split(".").pop().toLowerCase();
    const buf = readFileSync(path.join(dir, name));
    const dest = `${SEMANA}/${name}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(dest, buf, { contentType: CONTENT_TYPES[ext], upsert: true });
    if (error) {
      console.error(`  FALHOU ${dest}: ${error.message}`);
    } else {
      console.log(`  OK ${dest} (${(buf.length / 1024).toFixed(0)} KB)`);
    }
  }
  console.log(`\nConcluido: ${files.length} ficheiro(s) de ${SEMANA} no bucket "${BUCKET}".`);
}

main().catch((e) => { console.error(e); process.exit(1); });
