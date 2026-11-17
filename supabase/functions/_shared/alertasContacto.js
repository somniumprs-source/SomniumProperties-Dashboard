// Contagem dos alertas de contacto a consultores e investidores reiniciada.
//
// A 17/11/2026 a equipa começou a recuperar o histórico de contactos e a marcar
// o próximo contacto de toda a gente. Os alertas continuam ativos, mas nenhuma
// contagem recua para antes desta data: nesse dia tudo começa a zero e daí em
// diante conta normalmente. Um contacto registado depois desta data conta a
// partir dele, como sempre.
//
// Usado pelo Express de dev (server.js, src/db) e pelas Edge Functions.
export const INICIO_CONTAGEM_CONTACTOS = "2026-11-17";
const INICIO_MS = Date.parse(`${INICIO_CONTAGEM_CONTACTOS}T00:00:00Z`);
// Um próximo contacto marcado antes do reinício conta como marcado para o dia
// do reinício: só fica atrasado a partir do dia seguinte.
const FIM_DIA_INICIO_MS = INICIO_MS + 86400000;

/** @param {Date|number|string} v */
const ms = (v) => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v));

// Dias sem contacto: nunca mais do que os dias desde o reinício.
/** @param {number|null|undefined} dias @param {Date|number|string} [agora] @returns {any} */
export function diasContados(dias, agora = Date.now()) {
  if (dias == null) return dias;
  return Math.min(dias, Math.max(0, Math.floor((ms(agora) - INICIO_MS) / 86400000)));
}

// Horas desde a criação (alerta das 48h sem primeiro contacto), com o mesmo limite.
/** @param {number|null|undefined} horas @param {Date|number|string} [agora] @returns {any} */
export function horasContadas(horas, agora = Date.now()) {
  if (horas == null) return horas;
  return Math.min(horas, Math.max(0, (ms(agora) - INICIO_MS) / 3600000));
}

// Data do último contacto (ou da criação): nunca anterior ao reinício.
/** @param {any} data @returns {any} */
export function ultimoContactoContado(data) {
  if (!data) return data;
  const t = ms(data);
  return isNaN(t) || t >= INICIO_MS ? data : new Date(INICIO_MS).toISOString();
}

// Data do próximo contacto / follow-up para decidir se está atrasado.
/** @param {any} data @returns {any} */
export function proximoContactoContado(data) {
  if (!data) return data;
  const t = ms(data);
  return isNaN(t) || t >= FIM_DIA_INICIO_MS ? data : new Date(FIM_DIA_INICIO_MS).toISOString();
}
