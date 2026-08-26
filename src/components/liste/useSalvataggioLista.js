// src/components/liste/useSalvataggioLista.js
// Il contratto «salva e chiudi» nel dialetto del modulo Liste (A-2 dell'audit
// del 26 agosto).
//
// PERCHÉ ESISTE. `hooks/useSalvataggio.js` è il contratto dell'app, e fino a
// qui aveva tredici call site e nessuno dentro `liste/`. Le dodici form del
// modulo tenevano lo stato di invio a mano:
//
//     const [saving, setSaving] = useState(false);
//     if (saving) return;              // ① il freno legge lo STATO
//     setSaving(true);
//     const ok = await onSave.run(payload);
//     if (!ok) setSaving(false);       // ② nessun finally, ③ nessun guard
//
// Le tre differenze non sono di stile, e sono tutte argomentate dentro
// `useSalvataggio.js` — cioè erano già state scoperte una volta, altrove:
//
//   ① Il freno al doppio invio deve stare su un `ref`. Fra due click
//      ravvicinati React può non aver ancora ri-renderizzato: entrambi i
//      gestori leggono `saving === false` e partono DUE scritture. Su
//      `registraMovimento` sono due movimenti su un saldo, ed è il modulo in
//      cui — per dichiarazione della sua stessa architettura (M-1 del 25
//      agosto) — il dato è denaro.
//   ② `setSaving(false)` deve stare in un `finally`. È il difetto che
//      `QuickAddTask` ha avuto: un'eccezione lasciava il flag a `true` per
//      sempre, cioè modale congelata, bottone spento e nessun messaggio.
//      `useListeWrite` non ha un try attorno a `persist`, e solleva esso
//      stesso su un'operazione non dichiarata.
//   ③ Dopo l'`await` serve il guard di smontaggio: sulla riuscita è il
//      genitore a chiudere l'overlay, quindi lo smontaggio è la conseguenza
//      NORMALE del successo, non un caso limite.
//
// PERCHÉ UN ADATTATORE E NON L'HOOK NUDO. Due ragioni, entrambe di dominio.
//
// La prima è la forma: nel modulo una scrittura risponde `true`/`false` — è il
// contratto di `run()` delle otto modali e di `{ ok }` di `useListeWrite` —
// mentre l'hook legge `{ error }`. La conversione è una riga, ma scritta dodici
// volte sarebbe dodici occasioni di scriverla in modo leggermente diverso.
//
// La seconda è più importante: nel modulo Liste il testo dell'errore lo mostra
// GIÀ il registry, come toast (`toastErrore` in `listePersistence.js`). Per
// questo `errore` non viene ri-esposto qui: renderizzarlo accanto al toast
// darebbe due frasi diverse per lo stesso evento davanti allo stesso utente,
// che è esattamente il difetto chiuso da M-1 dell'audit del 25 agosto. Chi
// legge questo file non deve chiedersi dove sia finito il messaggio: non è
// finito da nessuna parte, è nel toast.
//
// La validazione, invece, resta a chi ha i campi: `onError` per un toast di
// riepilogo, `<FieldError>` per il messaggio sotto il campo (`AddMovBox`,
// `EditListaModal`). Questo hook non la tocca — si occupa dell'invio, non di
// cosa si invia.
import { useSalvataggio } from "../../hooks/useSalvataggio.js";

/**
 * @param {(...argomenti: any[]) => Promise<boolean>} scrivi la scrittura del
 *        modulo: `onSave.run` per le modali, un `esegui(...)` per gli editor in
 *        linea. `true` = riuscita.
 * @param {object} [opzioni]
 * @param {() => void} [opzioni.alSuccesso] ciò che si fa a esito noto e
 *        positivo — chiudere l'editor, ricaricare. Le modali NON ne hanno
 *        bisogno: `run()` chiude già l'overlay al proprio interno, e il guard
 *        di smontaggio fa il resto.
 * @returns {{salva: (...argomenti: any[]) => void, inVolo: boolean}}
 */
export function useSalvataggioLista(scrivi, { alSuccesso } = {}) {
  const { salva, inVolo } = useSalvataggio(
    async (...argomenti) => (await scrivi(...argomenti) ? {} : { error: true }),
    { alSuccesso },
  );
  return { salva, inVolo };
}
