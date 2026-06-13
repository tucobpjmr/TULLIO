// xlsx (SheetJS, ~430KB) è caricato on-demand via import() dinamico solo
// quando l'utente importa o esporta un file. Tenerlo fuori dal bundle
// iniziale è il singolo guadagno più grande sul chunk principale.
let _xlsxPromise = null;
export const loadXLSX = () => (_xlsxPromise ||= import("xlsx"));
