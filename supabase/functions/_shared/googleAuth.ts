/**
 * Google OAuth2 helper partilhado — versão ENV-ONLY (Edge Functions / Deno).
 * Port de src/db/googleAuth.js, mas SEM leitura de disco (google-oauth.json /
 * google-token.json não existem no isolate). Constrói o cliente OAuth2 a partir
 * de GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN.
 *
 * Mesma técnica já provada na função `calendar` (googleapis OAuth2 por env em Deno).
 */
import { OAuth2Client } from "google-auth-library";

/**
 * Obter cliente OAuth2 autenticado a partir de env vars.
 * Sem credenciais -> null (os módulos que dependem disto devolvem fallback).
 */
export function getGoogleAuth(): any {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new OAuth2Client(clientId, clientSecret, "http://localhost:3333");
    oauth2.setCredentials({ refresh_token: refreshToken });
    return oauth2;
  }
  return null;
}

/**
 * Verificar se Google OAuth está configurado (apenas env vars).
 */
export function isGoogleConfigured(): boolean {
  return !!(
    Deno.env.get("GOOGLE_CLIENT_ID") &&
    Deno.env.get("GOOGLE_CLIENT_SECRET") &&
    Deno.env.get("GOOGLE_REFRESH_TOKEN")
  );
}
