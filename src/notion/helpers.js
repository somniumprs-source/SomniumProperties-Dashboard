/**
 * Shared Notion property extraction helpers.
 * Used by all database modules to parse Notion API responses.
 */

export function extractText(prop) {
  return prop?.rich_text?.map(r => r.plain_text).join('') ?? ''
}

export function extractSelect(prop) {
  return prop?.select?.name ?? null
}

export function extractNumber(prop) {
  return prop?.number ?? 0
}

export function extractTitle(prop) {
  return prop?.title?.map(r => r.plain_text).join('') ?? ''
}

export function extractDate(prop) {
  return prop?.date?.start ?? null
}

export function extractMultiSelect(prop) {
  return (prop?.multi_select ?? []).map(s => s.name)
}

export function extractCheckbox(prop) {
  return prop?.checkbox ?? false
}

export function extractEmail(prop) {
  return prop?.email ?? null
}

export function extractPhone(prop) {
  return prop?.phone_number ?? null
}

export function extractFormula(prop) {
  return prop?.formula?.number ?? prop?.formula?.string ?? null
}

export function extractStatus(prop) {
  return prop?.status?.name ?? null
}

export function extractRelation(prop) {
  return prop?.relation?.map(r => r.id) ?? []
}
