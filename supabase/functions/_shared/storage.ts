// Supabase Storage. Substitui os uploads em disco (multer) e o helper de
// documentLifecycle.js. supabase-js corre em Deno.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://mjgusjuougzoeiyavsor.supabase.co";
const SUPABASE_SERVICE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY")) || "";

export const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

const ensured = new Set<string>();
async function ensureBucket(bucket: string, isPublic: boolean) {
  if (!supabase || ensured.has(bucket)) return;
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!(buckets || []).some((b: any) => b.name === bucket)) {
      await supabase.storage.createBucket(bucket, { public: isPublic });
    }
    ensured.add(bucket);
  } catch (e) {
    console.error("[storage] ensureBucket:", (e as Error).message);
  }
}

// Sobe bytes e devolve a URL publica (buckets publicos: fotos de imovel, docs PDF).
export async function uploadPublic(
  bucket: string, storagePath: string, bytes: Uint8Array | ArrayBuffer, contentType: string,
): Promise<string> {
  if (!supabase) throw new Error("SUPABASE_SERVICE_KEY em falta — Storage indisponivel");
  await ensureBucket(bucket, true);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`storage upload: ${error.message}`);
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

// Sobe bytes para bucket privado e devolve uma signed URL (docs financeiros/comprovativos).
export async function uploadPrivate(
  bucket: string, storagePath: string, bytes: Uint8Array | ArrayBuffer, contentType: string,
  signedTtlSeconds = 3600,
): Promise<string> {
  if (!supabase) throw new Error("SUPABASE_SERVICE_KEY em falta — Storage indisponivel");
  await ensureBucket(bucket, false);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`storage upload: ${error.message}`);
  const { data, error: e2 } = await supabase.storage.from(bucket).createSignedUrl(storagePath, signedTtlSeconds);
  if (e2) throw new Error(`storage signed url: ${e2.message}`);
  return data.signedUrl;
}

export async function removeFromStorage(bucket: string, storagePath: string) {
  if (!supabase) return;
  try { await supabase.storage.from(bucket).remove([storagePath]); } catch { /* ignore */ }
}
