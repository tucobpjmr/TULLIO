// src/hooks/useUrlStato.js
// A-2 dell'audit del 5 settembre. Il ponte fra `activeView`/`selectedTask` e
// la barra degli indirizzi, nei DUE versi.
//
// PERCHÉ ESISTE. L'app non aveva URL: zero `pushState`, zero `popstate`, nessun
// router in 286 file, e `vercel.json` riscrive ogni path su `/`. Le quattro
// conseguenze non erano di eleganza architetturale — erano cose che l'utente
// non poteva fare:
//   1. mandare un link a una pratica («guarda questa», l'atto più comune fra
//      un manager e un agente, in un'app che ha una chat interna e le
//      menzioni, cioè tutto il contesto in cui un link servirebbe);
//   2. tornare indietro — su Android e sulla PWA installata il tasto Indietro
//      non ha uno stack da svuotare e CHIUDE l'applicazione;
//   3. ricaricare senza perdere il posto (un refresh, o il ripristino di una
//      scheda dopo che iOS ha liberato memoria, riportava alla dashboard);
//   4. aprire due cose in due schede.
//
// PERCHÉ NON UN ROUTER. Il progetto ha una dipendenza runtime sola oltre a
// React e supabase-js, ed è una scelta dichiarata. Qui non c'è niente da
// risolvere che la giustifichi: le viste sono sette, non c'è annidamento, non
// ci sono parametri di path. Serve la History API e basta.
//
// ─── COSA STA IN URL, E COSA NO ───────────────────────────────────────────
//
// `?v=<vista>` e `?task=<id>`. Non ci va lo stato EFFIMERO — filtri, ricerca,
// tab aperta, finestra di `useFinestra`: sono valori che cambiano a ogni tasto
// premuto, finirebbero nella cronologia e renderebbero il tasto Indietro
// inutilizzabile, cioè il difetto opposto a quello che questo file chiude.
//
// ⚠️ `?lista=<id>` è letto e NON è scritto, ed è un limite dichiarato, non una
// dimenticanza. Un link a una lista funziona (l'intent arriva a `SET_VIEW` come
// `action.lista`, che è il meccanismo che `listeTarget` ha già per l'apertura
// mirata dalla scheda cliente), ma aprire una lista CLICCANDOLA dentro il
// modulo non aggiorna la barra degli indirizzi: `listaApertaId` è `useState`
// dentro `components/liste/ListeViaggio.jsx`, e il modulo Liste tiene il
// proprio stato fuori dal reducer per scelta dichiarata (docs/CLAUDE.md).
// Sollevarlo qui sarebbe un cambio all'architettura di quel modulo travestito
// da correzione di questo rilievo. Come per `?task=`/`?chat=` di
// `usePushNavigation`, il parametro viene CONSUMATO: la prima
// normalizzazione lo toglie dalla URL, così nessuna voce di cronologia lo
// porta e nessun «indietro» lo riesegue.
//
// ─── L'ORDINE DEI TRE EFFETTI È IL CONTRATTO ──────────────────────────────
//
// Lo STATO è la fonte di verità e l'URL ne è il RIFLESSO. I tre effetti sono
// in quest'ordine e non è indifferente:
//
//   1. all'avvio si APPLICA l'URL allo stato (un `SET_VIEW`), e solo dopo
//   2. si comincia a RIFLETTERE lo stato nell'URL — `pronto` esiste per
//      questo: senza, il primo riflesso girerebbe con `activeView` ancora al
//      suo valore iniziale e cancellerebbe il `?v=` che stiamo per applicare;
//   3. `popstate` riporta l'URL nello stato, e scatta SOLO sulla navigazione
//      dell'utente (avanti/indietro): `pushState`/`replaceState` non lo
//      emettono, quindi il ciclo non si chiude da sé.
//
// ⚠️ QUESTO HOOK VA CHIAMATO DOPO `usePushNavigation`, che al mount consuma
// `?task=`/`?chat=` e li toglie dalla URL. Gli effetti girano nell'ordine in
// cui gli hook sono chiamati: invertirli farebbe riscrivere a questo file un
// `?task=` che l'altro sta per cancellare. Il deep-link da notifica resta di
// `usePushNavigation` anche per un'altra ragione, che è la regola del
// progetto e non una preferenza: lì l'id resta in sospeso finché il task non
// è idratato, e riscrivere quella logica qui sarebbe la seconda copia di un
// percorso che ne deve avere uno solo.
//
// ─── PERMESSI: NON SE NE AGGIUNGONO ───────────────────────────────────────
//
// `SET_VIEW` e `SET_SELECTED_TASK` passano già dai permessi nel reducer
// (`canAccessAdmin`, `canAccessListe`, `canViewTask`), quindi un URL scritto a
// mano verso una vista vietata produce il toast di rifiuto e non la vista —
// senza aggiungere un solo controllo qui. È anche il motivo per cui la vista
// iniziale si applica con un `dispatch` invece di essere seminata in
// `makeInitialState`: quella strada salterebbe entrambi i guard, e `liste` —
// a differenza di `admin` — non ha una seconda difesa al montaggio.
//
// ⚠️ E l'id di un task in URL NON È UN SEGRETO: a decidere cosa si vede è la
// RLS, non l'ignoranza dell'id. Il dubbio verrà a chi legge, ed è scritto qui
// perché la risposta non vada cercata due volte.

import { useEffect, useRef, useState } from "react";

// ⚠️ SECONDA DEFINIZIONE DI «quali viste esistono», e la prima è lo `switch`
// di `renderView` in `src/VoyageDeskInner.jsx`. Serve perché un `?v=` scritto
// a mano non deve poter raggiungere il reducer con un valore che nessun case
// gestisce — la vista resterebbe montata sul `default` con `activeView` fuori
// enum. Le due non possono divergere in silenzio: `src/test/hooks/
// useUrlStato.test.jsx` legge i `case` dal sorgente di `VoyageDeskInner.jsx` e
// li confronta con questo Set, come `persistenceGuards.test.js` fa già per i
// case del reducer.
export const VISTE = new Set([
  "dashboard", "calendar", "clienti", "archivio", "trash", "admin", "liste",
]);

// La dashboard non si scrive: è il default, così `/` resta `/`.
const VISTA_PREDEFINITA = "dashboard";

/**
 * Lo stato navigabile letto da una query string.
 * @param {string} search
 * @returns {{ vista: string, task: string|null, lista: string|null }}
 */
export function daRicerca(search) {
  const p = new URLSearchParams(search || "");
  const v = p.get("v");
  return {
    vista: v && VISTE.has(v) ? v : VISTA_PREDEFINITA,
    task: p.get("task") || null,
    lista: p.get("lista") || null,
  };
}

/**
 * La URL che rappresenta uno stato. I NOSTRI parametri sono riscritti in
 * ordine fisso e gli eventuali altri conservati in coda: il confronto con
 * `ultimo` è testuale, quindi due stati uguali devono dare la STESSA stringa.
 * @param {{ vista: string, task: string|null }} stato
 * @param {string} search  la query string corrente, da cui si conserva il resto
 * @param {string} pathname
 * @returns {string}
 */
export function aRicerca(stato, search, pathname) {
  const resto = new URLSearchParams(search || "");
  // `lista` è consumato come `task`/`chat` in usePushNavigation: letto una
  // volta, poi tolto. Vedi il preambolo per il perché non viene riscritto.
  for (const nostro of ["v", "task", "lista"]) resto.delete(nostro);
  const miei = new URLSearchParams();
  if (stato.vista && stato.vista !== VISTA_PREDEFINITA) miei.set("v", stato.vista);
  if (stato.task) miei.set("task", stato.task);
  const qs = [miei.toString(), resto.toString()].filter(Boolean).join("&");
  return `${pathname}${qs ? `?${qs}` : ""}`;
}

/**
 * Tiene allineati `activeView`/`selectedTask` e la barra degli indirizzi.
 *
 * @param {object} opzioni
 * @param {string} opzioni.vista              `state.activeView`
 * @param {string|null} opzioni.taskId        `state.selectedTask?.id ?? null`
 * @param {Array<{id: string, deletedAt?: string|null}>} opzioni.tasks  `state.tasks`
 * @param {(azione: object) => unknown} opzioni.dispatch  il dispatch sincronizzato
 */
export function useUrlStato({ vista, taskId, tasks, dispatch }) {
  // Snapshot vivi, letti solo dentro i gestori: con `tasks` nelle dipendenze
  // il listener di `popstate` si ri-registrerebbe a ogni mutazione dei task, e
  // `vista`/`taskId` servono solo a non dispatchare ciò che è già vero.
  // Assegnati in render come in `useSyncedDispatch`: non vengono letti durante
  // il render, quindi il componente resta puro.
  const tasksRif = useRef(tasks);
  tasksRif.current = tasks;
  const vistaRif = useRef(vista);
  vistaRif.current = vista;
  const taskIdRif = useRef(taskId);
  taskIdRif.current = taskId;

  // L'URL com'era al PRIMO render, catturato prima che qualunque effetto la
  // tocchi — `usePushNavigation` cancella `?task=`/`?chat=` nel proprio, che
  // gira dopo tutti i render. In un ref e non in una costante di modulo: una
  // costante sarebbe condivisa fra le istanze e renderebbe il montaggio non
  // ripetibile in test.
  const inizialeRif = useRef(/** @type {{vista: string, task: string|null, lista: string|null}|null} */(null));
  if (inizialeRif.current === null) {
    inizialeRif.current = daRicerca(typeof window === "undefined" ? "" : window.location.search);
  }

  // L'ultima URL che abbiamo scritto noi. Il confronto è testuale ed è ciò che
  // impedisce di riscrivere (e impilare nella cronologia) una URL già corrente.
  const ultimoRif = useRef(/** @type {string|null} */(null));
  // `true` quando la prossima scrittura deve SOSTITUIRE invece di impilare.
  // Due casi soli: la normalizzazione iniziale (non è una navigazione, è
  // l'URL che si mette in forma canonica) e la correzione dopo un `popstate`
  // rifiutato dai permessi (una voce in più per dire «no» sarebbe una voce da
  // riattraversare all'indietro).
  const sostituisciRif = useRef(true);
  const [pronto, impostaPronto] = useState(false);
  // Un contatore, non un dato: fa RIPARTIRE il riflesso dopo ogni `popstate`,
  // anche quando lo stato non è cambiato. Senza, un `popstate` RIFIUTATO dai
  // permessi non muove `vista` né `taskId` — cioè nessuna dipendenza del
  // riflesso — e la barra degli indirizzi resta a dichiarare una vista che non
  // è montata. È il caso che `sostituisci` qui sopra esiste per servire, e
  // finché mancava questo contatore quel ramo non era raggiungibile.
  const [passoPop, impostaPassoPop] = useState(0);

  // ── 1. URL → STATO, al mount ────────────────────────────────────────────
  useEffect(() => {
    const iniziale = inizialeRif.current;
    // `SET_VIEW` solo se c'è qualcosa da applicare: dispatchare la dashboard
    // su un avvio senza parametri azzererebbe `listeTarget` e costerebbe un
    // render per non cambiare niente.
    if (iniziale && (iniziale.vista !== VISTA_PREDEFINITA || iniziale.lista)) {
      dispatch({
        type: "SET_VIEW",
        payload: iniziale.vista,
        ...(iniziale.lista ? { lista: iniziale.lista } : {}),
      });
    }
    // Nello stesso effetto del dispatch: React li accorpa, quindi il render
    // successivo ha insieme `pronto` e la vista applicata — che è la
    // condizione perché il riflesso qui sotto non giri sullo stato vecchio.
    impostaPronto(true);
  }, [dispatch]);

  // ── 2. STATO → URL ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!pronto || typeof window === "undefined") return;
    const url = aRicerca({ vista, task: taskId }, window.location.search, window.location.pathname);
    if (url === ultimoRif.current) return;
    ultimoRif.current = url;
    if (sostituisciRif.current) {
      sostituisciRif.current = false;
      window.history.replaceState({ vd: true }, "", url);
    } else {
      window.history.pushState({ vd: true }, "", url);
    }
  }, [pronto, vista, taskId, passoPop]);

  // ── 3. URL → STATO, sulla navigazione dell'utente ───────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const alPop = () => {
      const s = daRicerca(window.location.search);
      // `ultimo` si aggiorna QUI, prima dei dispatch: senza, il riflesso
      // vedrebbe una URL diversa da quella che ha appena scritto il browser e
      // impilerebbe una voce nuova per lo stato che l'utente ha appena
      // annullato — il tasto Indietro non funzionerebbe.
      ultimoRif.current = aRicerca(
        { vista: s.vista, task: s.task }, window.location.search, window.location.pathname);
      // Se un dispatch viene rifiutato (una vista che il ruolo non ha) lo
      // stato non segue e il riflesso correggerà la URL: quella correzione
      // sostituisce, non impila.
      sostituisciRif.current = true;
      impostaPassoPop(p => p + 1);
      if (s.vista !== vistaRif.current || s.lista) {
        dispatch({
          type: "SET_VIEW",
          payload: s.vista,
          ...(s.lista ? { lista: s.lista } : {}),
        });
      }
      // Il task si RISOLVE qui e non resta in sospeso come nel deep-link da
      // notifica: a `popstate` l'app è viva da un pezzo e i task sono
      // idratati. Un id che non si trova più (task purgato mentre la scheda
      // era aperta) chiude il dettaglio invece di alzare un toast — è una
      // navigazione all'indietro, non un tentativo di aprire qualcosa.
      const trovato = s.task
        ? (tasksRif.current || []).find(t => t.id === s.task && !t.deletedAt) ?? null
        : null;
      if ((trovato?.id ?? null) !== taskIdRif.current) {
        dispatch({ type: "SET_SELECTED_TASK", payload: trovato });
      }
    };
    window.addEventListener("popstate", alPop);
    return () => window.removeEventListener("popstate", alPop);
  }, [dispatch]);
}
