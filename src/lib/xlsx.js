// ─── XLSX LAZY LOADER ──────────────────────────────────────────────────────
// Carica SheetJS (~430KB) solo alla prima import/export e ne cachea il modulo,
// così il bundle iniziale resta leggero (caveat #15, Step N). Estratto dal
// monolite (Step P Phase 2f) per essere condiviso da ImportTab e AdminIOTab.
let _xlsxPromise = null;
export const loadXLSX = () => (_xlsxPromise ||= import("xlsx"));
