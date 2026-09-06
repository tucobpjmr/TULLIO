// src/lib/api.js
// Layer dati: CRUD su tutte le entità VoyageDesk via supabase-js.
// Le policy RLS sul DB filtrano automaticamente i risultati per utente loggato.
//
// ─── QUESTO FILE È UNA PORTA, NON UN'IMPLEMENTAZIONE (A-4) ──────────────────
// Fino a questa sessione era un modulo unico da 1001 righe con tredici
// namespace dentro — utenti, task, thread, avvisi, chat, allegati, notifiche,
// push, clienti, categorie, template — più i loro helper privati. Passava il
// tetto `max-lines` di 500 e la ragione è il rilievo A-4: la regola è
// configurata con `skipComments: true`, e qui i commenti erano il 61% del file.
// Il tetto misurava 386 righe su 1001, cioè non misurava la cosa che si apre.
//
// Le sezioni erano già separate — tredici `// ----------------- X -----------`
// — quindi lo split non ha dovuto inventare confini: li ha resi moduli. Ogni
// file di `lib/api/` corrisponde a una di quelle sezioni; `comuni.js` e
// `storage.js` raccolgono gli helper che più sezioni condividevano.
//
// PERCHÉ RESTA UN BARREL, e non "importate dal modulo che vi serve". Il
// confine che protegge le entità dello stato è dichiarato SU QUESTO PERCORSO:
// `VIETATE_ENTITA_DELLO_STATE` in eslint.config.js vieta ai componenti di
// importare `Tasks`, `Notices`, `Clients`… da `**/lib/api`, perché quelle si
// mutano con `dispatch()` e non a mano. Un import diretto di `lib/api/task.js`
// aggirerebbe quel divieto senza che nulla lo segnali — un'apertura silenziosa
// del confine, prodotta da un refactoring di sola forma. Per questo i moduli
// sotto `lib/api/` sono PRIVATI: li chiude `VIETATI_MODULI_API_INTERNI`, che
// ammette come importatore solo questo file.
//
// Il beneficio dello split è quindi tutto interno: 40+ importatori non
// cambiano una riga, e chi apre il data layer per una singola entità legge il
// modulo di quella entità invece di scorrere le altre dodici.

export { Users } from './api/utenti.js';
export { Tasks, TaskThreads, Comments } from './api/task.js';
export { Notices } from './api/avvisi.js';
export { Conversations, Messages } from './api/chat.js';
export { TaskFiles } from './api/allegati.js';
export { Notifications, Push } from './api/notifiche.js';
export { Clients } from './api/clienti.js';
export { Categories, MessageTemplates, AuditLog, ErrorReports } from './api/configurazione.js';
// B-4 dell'audit del 5 settembre: `storage.js` è un helper condiviso, non
// un'entità con un namespace proprio, ma `svuotaCacheUrl` serve a chi sta
// FUORI dal data layer (AuthContext, al logout) — passa da qui invece che
// da un import diretto di `./api/storage.js`, che VIETATI_MODULI_API_INTERNI
// (eslint.config.js) chiude a tutto il resto del progetto.
export { svuotaCacheUrl } from './api/storage.js';

// ----------------- REALTIME -----------------
// L'implementazione — e il perché di ogni scelta: nomi di canale, filtro
// dell'eco, degradazione senza client — sta in lib/realtime.js. Qui resta la
// PORTA: il data layer si importa da un modulo solo, ed è ciò che permette ai
// test di sostituirlo con un doppio solo. Vedi il blocco in cima a quel file.
export { subscribeToTable, subscribeToPresence, subscribeToTyping } from './realtime.js';
