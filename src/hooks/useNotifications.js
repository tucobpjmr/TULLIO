// src/hooks/useNotifications.js
// La campanella: idratazione + realtime della tabella `notifications` e le
// cinque azioni che spengono o tolgono qualcosa dall'elenco (segna letta, segna
// tutte, elimina una, svuota, spegni quelle di una conversazione).
//
// Tutte le mutazioni sono OTTIMISTICHE con rollback: l'elenco si aggiorna
// subito e, se la scrittura su DB fallisce, si torna allo snapshot precedente
// e si mostra un toast. È la stessa disciplina del registry di
// state/persistence.js, applicata a uno stato che non passa dal reducer —
// le notifiche non sono dati di dominio, sono un feed. Da A-2 dell'audit del
// 28 agosto ne condivide anche l'ALTRA metà, il registro delle scritture in
// volo: vedi `inVoloRef` più sotto.
//
//   const { notifications, setNotifications, nonLetteOltreFinestra, markRead,
//           markAllRead, remove, clearAll, markReadForConversation }
//     = useNotifications({ enabled, onError });
//
// ⚠️ `setNotifications` è esportato per l'idratazione dei test e per i mock:
// NON è la porta da cui scrivere una mutazione. Chi scrive questo feed deve
// passare da una delle cinque azioni qui sotto, altrimenti la sua riga non
// entra nel registro delle scritture in volo e il primo refetch concorrente la
// riporta indietro — è esattamente com'era `markChatNotificationsRead` prima di
// diventare `markReadForConversation`.

import { useState, useCallback, useRef } from "react";
import { Notifications as NotificationsAPI } from "../lib/api.js";
import { fromDbNotification, isUuid } from "../lib/mappers.js";
import { fondiScrittureInVolo } from "../state/pendingWrites.js";
import { useDebouncedTableSubscription } from "./useDebouncedTableSubscription.js";

/**
 * @typedef {{ id: string, userId: string, type: string, payload: object,
 *   read: boolean, createdAt: string }} Notifica
 */

export function useNotifications({ enabled, onError }) {
  // M-5 dell'audit del 4 settembre: `useState([])` da solo inferisce `never[]`,
  // e `fondiScrittureInVolo` (generica su `T extends {id: string}`) risolve
  // `T` al vincolo minimo quando uno dei due array è `never[]` — da qui in
  // giù `notifications` veniva letto come se avesse solo `id`, segnalando
  // `n.read` come proprietà inesistente più sotto in questo file.
  /** @type {[Notifica[], (v: Notifica[]|((prev: Notifica[]) => Notifica[])) => void]} */
  const [notifications, setNotifications] = useState([]);
  // ─── B-1 (audit del 28 agosto) · il badge conta OLTRE la finestra ─────────
  //
  // `notifications` porta solo le 100 più recenti: un unread oltre quella
  // soglia non ha MAI una riga qui dentro, quindi filtrare questo array (come
  // faceva prima la Topbar) sottostima il badge senza dirlo. Il rimedio non è
  // sostituire il filtro locale con un conteggio server ad ogni render — lo
  // farebbe perdere la reattività ottimistica (`markRead`/`remove` aggiornano
  // il badge nello stesso istante del click, prima che qualunque round-trip
  // torni) — ma AGGIUNGERGLI la sola parte che il filtro locale non può
  // vedere: quante non lette restano fuori dalla finestra. Il chiamante
  // somma questo numero al proprio conteggio sull'elenco visibile.
  const [nonLetteOltreFinestra, setNonLetteOltreFinestra] = useState(0);

  // B-1 · lo stato da cui si costruisce la compensazione si legge DA QUI, non
  // da dentro l'updater di setState. Un updater deve essere PURO: React 18 può
  // invocarlo più di una volta per lo stesso aggiornamento (StrictMode lo fa di
  // proposito per scovare gli effetti collaterali; il Concurrent rendering può
  // scartare un render già calcolato e rigiocare la coda su una base più
  // recente). Un `snapshot = prev` scritto lì dentro è proprio l'effetto
  // collaterale che quel meccanismo esiste per rendere visibile: a decidere
  // cosa il rollback rimetterà è l'ULTIMA invocazione, non la prima, e quale
  // sia dipende da quante volte React ha scelto di girare.
  //
  // Il ref è assegnato in RENDER e letto solo dentro i callback, come lo
  // `stateRef` di useSyncedDispatch: non rende impuro questo hook e tiene
  // `remove`/`clearAll` a identità stabile — con `notifications` fra le deps si
  // ricreerebbero a ogni notifica in arrivo, invalidando chi le memoizza.
  const vive = useRef(notifications);
  vive.current = notifications;

  // ─── A-2 (audit del 28 agosto) · le scritture in volo del feed ────────────
  //
  // Il registro `id → scritture in volo` del core (state/pendingWrites.js), per
  // uno stato che non passa dal reducer — la stessa cosa che `useChatData` fa
  // per i messaggi con `messaggiInVolo`, e per la STESSA ragione. Il reload
  // sostituiva l'elenco intero:
  //
  //   1. l'utente clicca su una notifica → `markRead` applica in ottimistico e
  //      manda l'UPDATE;
  //   2. nello stesso istante un trigger DB inserisce una notifica nuova. Le
  //      notifiche nascono server-side con `origin_client` NULL (lo dice
  //      lib/api/notifiche.js), quindi l'evento NON è filtrato e alimenta il
  //      debounce;
  //   3. 200 ms dopo parte `list()`, e l'UPDATE del passo 1 può non aver ancora
  //      committato: la risposta contiene la notifica con `read: false`;
  //   4. la sostituzione secca la rimette non letta → il pallino torna, il
  //      badge risale;
  //   5. quando l'UPDATE committa, la sua eco porta il NOSTRO `origin_client` e
  //      viene scartata da `subscribeToTable`. Nessun reload viene a
  //      correggere: lo stato resta divergente dal database — dove la notifica
  //      È letta — fino a un evento che può non arrivare mai nella sessione.
  //
  // La fusione è `fondiScrittureInVolo` e non una copia locale: l'invariante è
  // la stessa parola per parola («per un id con una scrittura in volo vince
  // SEMPRE la riga locale»), compresi i due casi che qui contano davvero — una
  // notifica eliminata in ottimistico non deve rientrare col refetch, e una
  // riga che il server non serve ancora non va persa. Scriverne una seconda
  // versione qui sarebbe la quarta copia di un'invariante che quel modulo esiste
  // per tenere UNA.
  //
  // Un ref e non uno stato: non deve provocare render da solo, cambia sempre
  // insieme alla riga che rappresenta, già applicata in ottimistico. È un
  // CONTATORE per id come nel reducer, non un booleano: sulla stessa notifica
  // possono sovrapporsi due scritture (segna letta, poi elimina), e uno
  // smarcamento che azzerasse l'altra riaprirebbe la finestra a metà strada.
  const inVoloRef = useRef(new Map());
  const marca = useCallback((ids) => {
    for (const id of ids) inVoloRef.current.set(id, (inVoloRef.current.get(id) ?? 0) + 1);
  }, []);
  // `smarca` e non un `delete`: vedi sopra. E va chiamato in `finally`, mai in
  // `then` — un errore di rete che lasciasse un id marcato per sempre farebbe
  // smettere QUELLA notifica di aggiornarsi da realtime per il resto della
  // sessione, che è un difetto peggiore di quello chiuso qui. È lo stesso
  // ragionamento, con le stesse parole, di hooks/useSyncedDispatch.js.
  const smarca = useCallback((ids) => {
    for (const id of ids) {
      const n = (inVoloRef.current.get(id) ?? 0) - 1;
      if (n > 0) inVoloRef.current.set(id, n); else inVoloRef.current.delete(id);
    }
  }, []);

  // Notifiche reali (Step F): in modalità Supabase idratiamo + realtime.
  // Senza login restiamo sui mock NOTIFICATIONS.
  useDebouncedTableSubscription(["notifications"], async (isCurrent) => {
    const [{ data, error }, conteggio] = await Promise.all([
      NotificationsAPI.list({ limit: 100 }),
      NotificationsAPI.contaNonLette(),
    ]);
    if (!isCurrent()) return;
    if (error) {
      console.error("[notifications] list", error);
      onError(`Notifiche: caricamento fallito: ${error.message || ""}`);
      return;
    }
    // `fromDbNotification` ritorna `null` solo per una riga falsy — qui non
    // può accadere (le righe vengono da una SELECT), ma il suo tipo di
    // ritorno è `Notifica|null` e senza filtrarlo `fondiScrittureInVolo`
    // riceverebbe `T` ambiguo fra i due array e cadrebbe sul solo vincolo
    // `{id: string}` — da qui in giù `.read` sparirebbe dal tipo.
    /** @type {Notifica[]} */
    const arrivate = (data || []).map(fromDbNotification).filter(Boolean);
    // La copia del registro si prende QUI e non dentro l'updater: così
    // l'updater resta una funzione pura del suo `prev` — la stessa disciplina
    // per cui B-1 (28 agosto, primo passaggio, sulla campanella) ha tolto da
    // lì lo snapshot del rollback. `prev` e non `vive.current` perché fra
    // questa risoluzione e il render successivo può esserci una mutazione
    // ottimistica non ancora renderizzata.
    const inVolo = new Map(inVoloRef.current);
    setNotifications(prev => fondiScrittureInVolo(arrivate, prev, inVolo));
    if (conteggio.error) {
      console.error("[notifications] contaNonLette", conteggio.error);
    } else {
      // Le VISIBILI si ricavano con la stessa fusione di sopra (`vive.current`
      // è la copia più fresca disponibile qui, fuori dall'updater) perché il
      // conteggio server è una foto del database e non sa nulla delle
      // scritture in volo: senza, una `markRead` ancora in transito
      // farebbe apparire per un istante una non letta oltre la finestra che
      // in realtà è già stata gestita in ottimistico.
      const fuse = fondiScrittureInVolo(arrivate, vive.current, inVolo);
      const nonLetteVisibili = fuse.filter(n => !n.read).length;
      setNonLetteOltreFinestra(Math.max(0, (conteggio.count ?? 0) - nonLetteVisibili));
    }
  }, { enabled, deps: [enabled] });

  const markRead = useCallback((id) => {
    if (!enabled) return;
    // Ottimistico
    marca([id]);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    NotificationsAPI.markRead(id).then(r => {
      if (r?.error) {
        console.error("[notifications] markRead", r.error);
        onError("Notifica: aggiornamento fallito");
      }
    }).finally(() => smarca([id]));
  }, [enabled, onError, marca, smarca]);

  const markAllRead = useCallback(() => {
    if (!enabled) return;
    // Gli id si leggono da `vive.current`, non da dentro l'updater (B-1): il
    // registro deve marcare esattamente le righe che questa scrittura tocca, e
    // deciderle in una funzione che React può rieseguire significherebbe
    // marcarne un insieme diverso da quello applicato.
    const ids = vive.current.map(n => n.id);
    marca(ids);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    // `markAllRead` sul server è un `.eq('read', false)` senza altra
    // condizione: segna TUTTE le righe dell'utente, comprese quelle oltre la
    // finestra dei 100 che questo hook non ha mai visto. L'overflow va a
    // zero nello stesso istante, non al prossimo reload.
    setNonLetteOltreFinestra(0);
    NotificationsAPI.markAllRead().then(r => {
      if (r?.error) {
        console.error("[notifications] markAllRead", r.error);
        onError("Notifiche: aggiornamento fallito");
      }
    }).finally(() => smarca(ids));
  }, [enabled, onError, marca, smarca]);

  // Pulizia elenco notifiche: rimozione singola e in blocco. Entrambe
  // ottimistiche, entrambe con una compensazione MIRATA se la delete su DB
  // fallisce — non un `setNotifications(snapshot)` che riscrive l'elenco
  // intero. Questo è un feed vivo: fra il click e la risposta del server passa
  // il tempo di un round-trip, e in quella finestra il realtime può aver già
  // consegnato notifiche nuove. Reinstallare lo snapshot le cancellerebbe dalla
  // campanella senza che nulla le riporti, perché la loro eco è già passata.
  const remove = useCallback((id) => {
    if (!enabled) return;
    const prima = vive.current;
    const posizione = prima.findIndex(n => n.id === id);
    if (posizione < 0) return;
    const rimossa = prima[posizione];
    marca([id]);
    setNotifications(prev => prev.filter(n => n.id !== id));
    NotificationsAPI.remove(id).then(r => {
      if (r?.error) {
        console.error("[notifications] remove", r.error);
        // Torna al suo posto solo LEI, e solo se nel frattempo non è già
        // rientrata da un refetch.
        setNotifications(prev => (prev.some(n => n.id === id)
          ? prev
          : [...prev.slice(0, posizione), rimossa, ...prev.slice(posizione)]));
        onError("Notifica: eliminazione fallita");
      }
      // A-2: lo smarcamento è in `finally` e quindi DOPO questa compensazione,
      // così nemmeno un refetch che arrivasse nel mezzo può sovrascriverla —
      // stesso ordine, e stesso motivo, di useSyncedDispatch.
    }).finally(() => smarca([id]));
  }, [enabled, onError, marca, smarca]);

  const clearAll = useCallback(() => {
    if (!enabled) return;
    const prima = vive.current;
    const ids = prima.map(n => n.id);
    marca(ids);
    setNotifications([]);
    // Stessa ragione di `markAllRead`: `removeAll` cancella ogni riga
    // dell'utente, non solo le 100 visibili, quindi non resta nessuna non
    // letta nascosta da recuperare al prossimo reload.
    setNonLetteOltreFinestra(0);
    NotificationsAPI.removeAll().then(r => {
      if (r?.error) {
        console.error("[notifications] removeAll", r.error);
        // Unione e non sostituzione: quello che è arrivato dopo lo svuotamento
        // resta in testa, e sotto tornano le notifiche che il server non ha
        // eliminato. Nel caso normale — nessun arrivo nel frattempo — `prev` è
        // vuoto e il risultato è esattamente l'elenco di prima.
        setNotifications(prev => {
          const presenti = new Set(prev.map(n => n.id));
          return [...prev, ...prima.filter(n => !presenti.has(n.id))];
        });
        onError("Notifiche: pulizia fallita");
      }
    }).finally(() => smarca(ids));
  }, [enabled, onError, marca, smarca]);

  // ─── Il quinto ingresso, A-2 · aprire una conversazione spegne la sua ──────
  //
  // Viveva in VoyageDeskInner.jsx come `markChatNotificationsRead`, scritto su
  // questo feed dal di FUORI via `setNotifications`: era quindi l'unica
  // mutazione della campanella che il registro delle scritture in volo non
  // poteva vedere, cioè l'unico ingresso rimasto scoperto. Spostarlo qui non è
  // un riordino — è ciò che rende la protezione una proprietà del feed invece
  // di una cosa che ogni chiamante deve ricordarsi.
  //
  // La firma resta `(convId)` e l'identità è stabile (`useCallback` con sole
  // dipendenze stabili): è `onConversationRead` di useChatData, e da A-2
  // dell'audit del 16 agosto quella stabilità è ciò che tiene fermo l'intero
  // registro `commands` della chat — misurato da src/test/chat/chatMemo.test.jsx.
  //
  // Il ramo non-Supabase applica in locale e non marca nulla: senza login non
  // esiste alcun refetch da cui proteggersi, e marcare id che nessuno smarcherà
  // è il difetto che il `finally` esiste per evitare.
  //
  // ⚠️ La scrittura parte ANCHE quando in locale non c'è niente da spegnere, ed
  // è il comportamento di prima da non perdere: `state.notifications` sono le
  // 100 più recenti (B-1), quindi il server può avere per questa conversazione
  // righe non lette che il client non ha mai viste. È la marcatura a dipendere
  // dagli id noti, non la chiamata.
  const markReadForConversation = useCallback((convId) => {
    const daSpegnere = vive.current.filter(n => (
      n.type === "chat_message" && n.payload?.conversation_id === convId && !n.read
    ));
    const scrive = enabled && isUuid(convId);
    const ids = daSpegnere.map(n => n.id);
    if (ids.length) {
      // Prima marca, poi applica: lo stesso ordine delle altre quattro.
      if (scrive) marca(ids);
      const spenti = new Set(ids);
      setNotifications(prev => prev.map(n => (spenti.has(n.id) ? { ...n, read: true } : n)));
    }
    // Niente `setNotifications` quando non c'è nulla da spegnere: aprire una
    // conversazione già letta produrrebbe un array nuovo — cioè un render — per
    // una mappa che non cambia nulla, a ogni apertura.
    if (!scrive) return;
    NotificationsAPI.markReadForConversation(convId).then(r => {
      if (r?.error) console.error("[notifications] markReadForConversation", r.error);
    }).finally(() => smarca(ids));
  }, [enabled, marca, smarca]);

  return {
    notifications, setNotifications, nonLetteOltreFinestra,
    markRead, markAllRead, remove, clearAll, markReadForConversation,
  };
}
