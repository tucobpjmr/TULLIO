// src/components/liste/listeFormato.js
//
// ─── B-1 (audit del 26 agosto) · LA FORMATTAZIONE DEL MODULO LISTE ────────
//
// Estratto da `listeApi.js`, che dichiarava in testa di essere «il layer dati
// del modulo Liste Viaggio» e per le prime quattrocento righe lo era. Poi
// c'erano queste: formattazione, costanti di dominio, parsing dell'importo —
// cose che non cambiano mai insieme a una query.
//
// L'effetto pratico era misurabile: `verifica:convenzioni` leggeva quel file a
// 255 righe EFFETTIVE (sotto ogni soglia) mentre chi lo apriva ne trovava 537.
// È la stessa diagnosi di A-4 dell'audit del 23 agosto su `api.js`.
//
// ⚠️ NESSUN IMPORT DA `listeApi.js`, ed è il vincolo che decide cosa sta qui:
// questo modulo non conosce Supabase, quindi si può leggere e verificare senza
// il data layer. Per la stessa ragione `beneficiariNomi` e `intestazioneLista`
// sono qui e non là — leggono la forma dell'embed, ma per DIRLA a schermo o in
// un documento, ed è da qui che le prende anche `listeOrdinamento.js`, che di
// query non ne fa nessuna.
//
// PERCHÉ STA IN `components/liste/` E NON IN `src/lib/`: vale parola per
// parola ciò che ne dice `listeApi.js` (ST-6). È privato del modulo; il core
// parla al modulo solo da `listeModuleApi.js`.
import { dataNumerica } from "../../lib/dates.js";

// Nomi dei soli cointestatari (non il titolare). Ordine di arrivo dalla query
// (nessun ORDER BY dedicato: sono in numero piccolo, non serve).
export const beneficiariNomi = (lista) =>
  (lista?.lista_beneficiari || []).map((b) => b.clients?.name).filter(Boolean);

// "Chi è questa lista": titolare + cointestatari, per la UI e per i documenti
// (riepilogo cliente, copia agente). "MARIO ROSSI" da solo, o
// "MARIO ROSSI e MARIA BIANCHI" con un cointestatario, "MARIO ROSSI, MARIA
// BIANCHI e LUCA ROSSI" con più di uno.
export const intestazioneLista = (lista) => {
  const nomi = [lista?.clients?.name, ...beneficiariNomi(lista)].filter(Boolean);
  if (nomi.length <= 1) return nomi[0] || '';
  return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`;
};
export const eur = (v) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0);

// Le date dei movimenti sono `date` (YYYY-MM-DD), non timestamp: vanno
// formattate a mano. new Date("2026-07-28") sarebbe interpretata come UTC e
// in Italia potrebbe rendere il giorno precedente.
//
// Convive di proposito con `formatDate` in lib/taskUtils.js, che rende
// "08 ago 2026" partendo da un timestamp ISO: input diverso, formato diverso,
// e il modulo Liste ha una sua identità visiva. Non sono due copie da
// riconciliare.
// La forma numerica del modulo Liste ("28/07/2026"). Da ST-8 il formato vive
// in lib/dates.js insieme agli altri sei: questa resta l'API pubblica del
// modulo (undici call site) e il caveat che la fa esistere — `data_movimento` è
// una colonna `date`, non un timestamp, e passarla per `new Date` la
// interpreterebbe come UTC-mezzanotte — è ora gestito da `aData` in quel
// modulo, per TUTTI i formati e non solo per questo.
export const fmtDate = (d) => dataNumerica(d);

export const todayISO = () => {
  // Data locale, non `toISOString()`: quest'ultima è in UTC e dopo le 22:00
  // (ora legale italiana) proporrebbe il giorno dopo come data di default.
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Soglia di tolleranza sul saldo: gli importi sono numeric(12,2), sotto mezzo
// centesimo il saldo si considera in pari (evita "-0,00 €" in rosso).
export const EPS = 0.004;

export const saldoClass = (v) => (v > EPS ? 'pos' : v < -EPS ? 'neg' : 'zero');

export const METODI = ['', 'pos', 'bonifico', 'contanti', 'assegno', 'altro'];

export const ACTION_LABELS = {
  lista_creata: 'ha creato la lista',
  lista_modificata: 'ha modificato i dati della lista',
  lista_chiusa: 'ha segnato la lista ESAURITA',
  lista_riaperta: 'ha riaperto la lista',
  lista_archiviata: 'ha spostato la lista nel cestino',
  lista_ripristinata: 'ha ripristinato la lista dal cestino',
  movimento_aggiunto: 'ha registrato un movimento',
  movimento_modificato: 'ha modificato un movimento',
  movimento_eliminato: 'ha eliminato un movimento',
  lista_note_modificata: 'ha modificato le note interne',
  beneficiario_aggiunto: 'ha aggiunto un cointestatario',
  beneficiario_rimosso: 'ha rimosso un cointestatario',
  titolare_spostato: 'ha spostato la lista su un altro cliente',
};

export const actionLabel = (a) => ACTION_LABELS[a] || a;

// L'importo digitato non si interpreta più QUI (C-1 e M-1 dell'audit di
// codebase del 31 agosto). L'implementazione stava in questo file e leggeva
// "1.250,00" come 1,25 — mille volte meno — mentre `aNumero` in
// `scripts/importa-liste/parser.js` leggeva la stessa cifra correttamente:
// la stessa regola di dominio in due copie, e quella sbagliata era proprio
// quella su cui digita l'operatore. Ora è una sola, in `src/lib/importi.js`
// (che è anche sotto `checkJs`), e questa riga la ri-esporta per i dodici
// importatori del modulo: il ragionamento sta là, non qui.
//
// ⛔ Non riscriverla in linea in un componente: vedi il preambolo di
// `lib/importi.js`.
export { parseImporto } from "../../lib/importi.js";