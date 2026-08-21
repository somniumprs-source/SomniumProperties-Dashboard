// Data de entrada em vigor do bloqueio de checklist no funil de imóveis
// (ver A7 da auditoria): só imóveis criados a partir desta data exigem a
// checklist obrigatória completa para avançar de estado no Kanban — os
// imóveis já existentes continuam a mover livremente.
export const CHECKLIST_ENFORCEMENT_START_DATE = "2026-08-21T00:00:00.000Z";
