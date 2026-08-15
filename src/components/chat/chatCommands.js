// src/components/chat/chatCommands.js
// Le operazioni di scrittura della chat: aggiornamento locale + persistenza.
//
// PERCHÉ ESISTE. Prima la chat persisteva per DIFFERENZA: VoyageDesk passava ai
// componenti due wrapper di `setConversations`/`setMessages` che, dentro la
// funzione updater di setState, confrontavano lo stato precedente con quello
// nuovo e da lì DEDUCEVANO l'operazione da mandare a Supabase (riga assente in
// prev → INSERT, `pinned` cambiato → UPDATE, …). Due problemi, il primo grave:
//
//   1. L'updater passato a setState deve essere PURO. React 18 lo invoca due
//      volte in StrictMode (attivo in main.jsx) e può rieseguirlo in Concurrent
//      Rendering: una chiamata di rete lì dentro non ha alcuna garanzia di
//      partire una sola volta. In sviluppo creare una conversazione faceva
//      DUE INSERT — il guard `if (!prevById.has(c.id))` non protegge, perché
//      entrambe le invocazioni ricevono lo stesso `prev`.
//   2. Dedurre l'intento dalla differenza di stato è fragile: "questo messaggio
//      non c'era" è un'ipotesi sul perché lo stato è cambiato, non un fatto.
//      Ogni nuovo campo mutabile andava aggiunto al diff, e chi scriveva il
//      call site non aveva modo di sapere che stava innescando una scrittura.
//
// Oggi le due cose sono separate: `setConversations`/`setMessages` tornano ad
// essere normali setter React (updater puri), e ogni scrittura ha un comando
// esplicito che dichiara cosa sta facendo. La chiamata di rete parte FUORI
// dall'updater, dove eseguirla due volte non è più un rischio del framework.
//
// USO. La factory riceve i setter grezzi e ritorna i comandi. Con
// `enabled: false` (nessun login, mock/test) i comandi fanno solo
// l'aggiornamento locale: nessuna chiamata a Supabase.
//
//   const commands = makeChatCommands({ setConversations, setMessages, enabled });
//   commands.sendMessage(convId, msg);

import {
  Conversations as ConversationsAPI,
  Messages as MessagesAPI,
} from "../../lib/api.js";
import { toDbConversation, toDbMessage, newId, isUuid } from "../../lib/mappers.js";
// A-2 (terzo passaggio): "è andata bene" non è `!res.error`. Una scrittura che
// la RLS rifiuta risponde 2xx senza errore — vedi lib/esitoScrittura.js. Fino a
// questo intervento il controllo esisteva solo in hooks/useSyncedDispatch.js,
// cioè per il core: la chat, che è il sottosistema che scrive di più, aveva la
// versione cieca. `Messages.setPinned` chiedeva già `count: 'exact'` e nessuno
// lo leggeva.
import { esitoScrittura } from "../../lib/esitoScrittura.js";

const noop = () => {};

export function makeChatCommands({
  setConversations = noop,
  setMessages = noop,
  enabled = false,
  getCurrentUserId = () => null,
  onError = noop,
  onSuccess = noop,
  onConversationRead = noop,
  // A-2 dell'audit del 14 agosto (secondo passaggio): il registro delle
  // scritture in volo che vive in useChatData (messaggiInVolo). Di default
  // sono no-op, così i chiamanti che non passano protezione contro le
  // scritture in volo (i test, i mock) restano invariati — l'adozione è
  // opt-in dal lato di chi possiede lo stato.
  marcaInVolo = noop,
  smarcaInVolo = noop,
} = {}) {
  // convId → Promise dell'INSERT conversazione ancora in volo. Serve a
  // serializzare il primo messaggio dietro la creazione della conversazione:
  // senza, la RLS messages_insert rifiuta il messaggio perché la
  // conversation_id non esiste ancora lato DB (race conv → primo messaggio,
  // che l'utente vede come "il messaggio non arriva").
  const creazioniInVolo = new Map();

  const fallito = (contesto, err, testo) => {
    console.error(`[chat] ${contesto}`, err);
    onError(testo);
  };

  // ─── CONVERSAZIONI ─────────────────────────────────────────────────────────

  // Ritorna la conversazione NORMALIZZATA (id uuid): il chiamante deve attivare
  // quella, non l'originale. L'id viene assegnato sempre, anche in modalità
  // mock — la vista attivata e la riga persistita devono condividerlo, e un id
  // "c<timestamp>" farebbe saltare i gate isUuid di typing e markRead.
  const createConversation = (conv) => {
    const normalized = isUuid(conv.id) ? conv : { ...conv, id: newId() };
    setConversations(prev => [normalized, ...prev]);
    if (!enabled) return normalized;
    const p = ConversationsAPI.create(toDbConversation(normalized))
      .then(r => {
        const errore = esitoScrittura(r);
        if (errore) {
          fallito("conv.create", errore, `Chat: creazione conversazione fallita: ${errore.message || ""}`);
          // `sendMessage` distingue "creazione fallita" da "riuscita" leggendo
          // `r.error`: normalizziamo l'esito, così un rifiuto silenzioso della
          // RLS non fa partire l'INSERT del primo messaggio verso una
          // conversazione che sul server non esiste.
          return { ...r, error: errore };
        }
        return r;
      })
      .finally(() => creazioniInVolo.delete(normalized.id));
    creazioniInVolo.set(normalized.id, p);
    return normalized;
  };

  // Riceve la conversazione COMPLETA già aggiornata (non un patch parziale):
  // l'UPDATE scrive comunque tutti e tre i campi modificabili, come faceva il
  // vecchio diff.
  const updateConversation = (conv) => {
    setConversations(prev => prev.map(c => (c.id === conv.id ? conv : c)));
    if (!enabled || !isUuid(conv.id)) return;
    ConversationsAPI.update(conv.id, {
      pinned: !!conv.pinned,
      name: conv.name ?? null,
      icon: conv.icon ?? null,
    }).then(r => {
      const errore = esitoScrittura(r);
      if (errore) {
        fallito("conv.update", errore, `Chat: aggiornamento conversazione fallito: ${errore.message || ""}`);
      }
    });
  };

  // Eliminazione conversazione/gruppo.
  //
  // C-1 dell'audit del 14 agosto (terzo passaggio). L'ORDINE dei due passi
  // server era invertito, e la ragione scritta accanto era corretta ma
  // incompleta: «prima il cleanup degli allegati, perché dopo il DELETE della
  // conversazione le policy sul bucket non permetterebbero più di rimuoverli →
  // orfani permanenti». Vero. Ma quell'ordine rende la prima operazione —
  // l'unica IRREVERSIBILE delle due — condizionata a nulla:
  //
  //   1. `removeConversationFiles` cancella dal bucket gli allegati di TUTTI i
  //      partecipanti (vocali, documenti di pratica, foto di passaporti);
  //   2. poi parte la DELETE della riga. Se fallisce — rete caduta fra i due
  //      await, che su mobile è il caso normale, sessione revocata, utente
  //      tolto dai `participants` nel frattempo — la conversazione resta viva
  //      per tutti gli altri, con ogni allegato distrutto e nessun modo di
  //      recuperarlo;
  //   3. e la DELETE poteva anche non fallire affatto pur non facendo nulla:
  //      `ConversationsAPI.remove` non chiedeva `count`, quindi un rifiuto
  //      della RLS (che filtra le righe invece di sollevare un errore) era
  //      indistinguibile da una riuscita — toast verde «Conversazione
  //      eliminata» compreso.
  //
  // Ora l'ordine è: DELETE della riga (con `count`, letto da esitoScrittura),
  // e SOLO se ha davvero tolto la riga si passa alla pulizia degli allegati.
  // Il costo dichiarato di questa inversione è il rovescio dell'osservazione
  // originale: dopo la DELETE la policy `chat_files_delete` autorizza il
  // chiamante solo sui file di cui è `owner_id` (o su tutti, se è admin),
  // quindi gli allegati caricati dagli ALTRI partecipanti restano nel bucket
  // come orfani. È un costo recuperabile — byte e una bonifica — contro una
  // perdita di dati che non lo è; e la migrazione
  // 20260814220000_chat_files_delete_orfani.sql lo azzera del tutto,
  // autorizzando la cancellazione degli oggetti la cui conversazione non
  // esiste più (finché non è applicata, il ramo qui sotto degrada al solo
  // `owner_id` e lo dice a log).
  //
  // Il parametro è la conversazione INTERA e non il solo id: serve a
  // rimetterla in lista se la DELETE non passa, ed è lo stesso motivo per cui
  // `setMessagePinned` riceve `pinned` esplicito invece di dedurlo. I messaggi
  // NON si tolgono più prima della conferma: senza la conversazione in lista
  // sono comunque invisibili, e tenerli è ciò che rende il ripristino completo
  // invece che una conversazione vuota.
  const removeConversation = (conv) => {
    const convId = typeof conv === "string" ? conv : conv?.id;
    if (!convId) return;
    const snapshot = typeof conv === "string" ? null : conv;
    const scartaMessaggi = () => setMessages(prev => {
      if (!(convId in prev)) return prev;
      const next = { ...prev };
      delete next[convId];
      return next;
    });

    setConversations(prev => prev.filter(c => c.id !== convId));
    if (!enabled || !isUuid(convId)) { scartaMessaggi(); return; }

    (async () => {
      const errore = esitoScrittura(await ConversationsAPI.remove(convId));
      if (errore) {
        // La riga è ancora lì: si rimette la conversazione dov'era (i messaggi
        // non sono mai stati tolti) e NON si tocca lo storage.
        if (snapshot) {
          setConversations(prev => (prev.some(c => c.id === convId) ? prev : [snapshot, ...prev]));
        }
        fallito("conv.delete", errore, `Chat: eliminazione conversazione fallita: ${errore.message || ""}`);
        return;
      }
      scartaMessaggi();
      const filesRes = await MessagesAPI.removeConversationFiles(convId);
      if (filesRes?.error) console.warn("[chat] conv files cleanup", filesRes.error);
      onSuccess("Conversazione eliminata");
    })();
  };

  // ─── MESSAGGI ──────────────────────────────────────────────────────────────

  // A differenza delle conversazioni l'id del messaggio si normalizza solo in
  // modalità DB: senza login i messaggi restano locali con l'id provvisorio
  // "m<timestamp>" prodotto dal composer, e nulla lo legge come uuid.
  const sendMessage = (convId, msg) => {
    const normalized = !enabled || isUuid(msg.id) ? msg : { ...msg, id: newId() };
    setMessages(prev => ({ ...prev, [convId]: [...(prev[convId] || []), normalized] }));
    if (!enabled) return normalized;

    // A-2: marca il messaggio come "in volo" PRIMA di qualunque await — è la
    // stessa finestra di rischio descritta in state/persistence.js per i
    // task: un evento realtime altrui può far ripartire il reload della chat
    // (il sottosistema con la frequenza di scrittura più alta dell'app)
    // prima che questa INSERT abbia fatto commit.
    marcaInVolo(convId, normalized);

    // Il messaggio non è mai arrivato sul server: lasciarlo a schermo lo
    // rende indistinguibile da uno consegnato, e sparirebbe da solo al
    // reload — cioè nel momento in cui l'utente non lo sta più guardando.
    // Toglierlo qui, insieme al toast, è l'unica versione onesta di "non è
    // partito". Prima non c'era alcuna compensazione: il messaggio fantasma
    // restava a schermo fino al refresh successivo.
    const scartaOttimistico = () => {
      setMessages(prev => ({
        ...prev,
        [convId]: (prev[convId] || []).filter(m => m.id !== normalized.id),
      }));
    };

    const invia = () => MessagesAPI.send(toDbMessage(normalized, convId))
      .then(r => {
        const errore = esitoScrittura(r);
        if (errore) {
          scartaOttimistico();
          fallito("msg.send", errore, `Chat: invio messaggio fallito: ${errore.message || ""}`);
        }
      })
      // finally e non .then(): un errore di rete che lasciasse l'id marcato
      // per sempre bloccherebbe quel messaggio dal realtime per il resto
      // della sessione — stessa ragione del finally in useSyncedDispatch.
      .finally(() => smarcaInVolo(normalized.id));

    // Se la conversazione è appena stata creata e l'INSERT è ancora in volo,
    // aspetta. Se quella creazione è fallita non si tenta l'invio: il toast
    // d'errore è già stato mostrato per la conversazione, ma il messaggio
    // fantasma va comunque tolto e smarcato — non lo farà mai nessun altro.
    const attesa = creazioniInVolo.get(convId);
    if (attesa) {
      attesa.then(r => {
        if (r?.error) {
          scartaOttimistico();
          smarcaInVolo(normalized.id);
        } else {
          invia();
        }
      });
    } else {
      invia();
    }
    return normalized;
  };

  // Pin condiviso: tutti i partecipanti vedono lo stesso stato. `pinned` è
  // esplicito — il chiamante ha già il messaggio sotto mano e sa se sta
  // fissando o togliendo, non serve dedurlo da un confronto. pinnedBy/pinnedAt
  // sono l'audit: valorizzati al pin, azzerati all'unpin.
  // `precedente` è lo stato del pin PRIMA del comando ({ pinned, pinnedBy,
  // pinnedAt }): lo passa il chiamante, che il messaggio ce l'ha già sotto
  // mano (ConversationView lo cerca comunque per calcolare `!target.pinned`).
  // Serve al ripristino qui sotto: senza, un unpin fallito potrebbe essere
  // riportato indietro solo indovinando chi aveva fissato il messaggio.
  const setMessagePinned = (convId, msgId, pinned, pinnedBy = null, precedente = null) => {
    const quando = pinned ? new Date().toISOString() : null;
    setMessages(prev => ({
      ...prev,
      [convId]: (prev[convId] || []).map(m => (m.id === msgId
        ? { ...m, pinned, pinnedBy: pinned ? pinnedBy : null, pinnedAt: quando }
        : m)),
    }));
    if (!enabled || !isUuid(msgId)) return;
    MessagesAPI.setPinned(msgId, pinned, pinned ? pinnedBy : null).then(r => {
      // `setPinned` chiede `count: 'exact'`: qui quel conteggio viene
      // finalmente letto (A-2). Il pin è la scrittura più esposta al rifiuto
      // silenzioso — è l'unica che si fa sul messaggio ALTRUI, e il trigger
      // `messages_blocca_modifiche_altrui` (20260806150000) sorveglia proprio
      // quelle colonne.
      const errore = esitoScrittura(r);
      if (errore) {
        // Il pin ottimistico va riportato indietro: senza, il messaggio resta
        // fissato a schermo per chi ha cliccato e per nessun altro.
        const prima = precedente || { pinned: !pinned, pinnedBy: null, pinnedAt: null };
        setMessages(prev => ({
          ...prev,
          [convId]: (prev[convId] || []).map(m => (m.id === msgId
            ? { ...m, pinned: !!prima.pinned, pinnedBy: prima.pinnedBy ?? null, pinnedAt: prima.pinnedAt ?? null }
            : m)),
        }));
        fallito("msg.pinned", errore, `Chat: pin fallito: ${errore.message || ""}`);
      }
    });
  };

  // markRead in blocco all'apertura della conversazione: update locale
  // ottimistico + UNA RPC che marca letti tutti i non letti della conv (invece
  // di N UPDATE, uno per messaggio). Il lettore è sempre auth.uid() lato
  // server; origin_client è taggato, così l'eco realtime viene filtrata.
  const markConversationRead = (convId) => {
    const uid = getCurrentUserId();
    if (!convId || !uid) return;
    setMessages(prev => {
      const list = prev[convId] || [];
      let cambiato = false;
      const next = list.map(m => {
        if (m.sender !== uid && !m.readBy?.includes(uid)) {
          cambiato = true;
          return { ...m, readBy: [...(m.readBy || []), uid] };
        }
        return m;
      });
      return cambiato ? { ...prev, [convId]: next } : prev;
    });
    // La notifica 'chat_message' di questa conversazione ha fatto il suo
    // lavoro: spegnerla evita che la campanella resti con un non letto per una
    // chat che l'utente sta leggendo in questo momento.
    onConversationRead(convId);
    if (!enabled || !isUuid(convId)) return;
    MessagesAPI.markReadBulk(convId).then(r => {
      if (r?.error) {
        fallito("markReadBulk", r.error, `Chat: aggiornamento "letto" fallito: ${r.error.message || ""}`);
      }
    });
  };

  // Toggle reazione. La scrittura NON passa dal client: la RPC
  // messages_toggle_reaction fa read-modify-write sotto lock di riga e usa
  // sempre auth.uid() come reactor. Scrivere l'intero oggetto `reactions`
  // calcolato qui sarebbe last-write-wins fra due utenti che reagiscono
  // insieme. In caso di errore si torna alle SOLE reazioni precedenti del
  // messaggio toccato.
  //
  // A-2 dell'audit del 14 agosto (secondo passaggio): prima il rollback
  // ripristinava uno snapshot dell'INTERA mappa `messages` — tutte le
  // conversazioni, non solo quella toccata. Fra il toggle e la risposta della
  // RPC passa un round-trip, e in quella finestra possono arrivare messaggi
  // nuovi da realtime: ripristinare lo snapshot totale li cancellava dallo
  // stato, in ogni conversazione — un rollback che per annullare un'emoji
  // portava via dei messaggi, senza che nulla poi li rimettesse (non erano
  // mai stati toccati sul server). Qui si ricorda solo `reactions` del
  // messaggio toccato, e si applica un merge puntuale.
  // M-3 dell'audit del 14 agosto (terzo passaggio). Lo snapshot da cui
  // dipende il rollback (`reazioniPrima`, e il flag `trovato` che dice se
  // c'era qualcosa da annullare) veniva ASSEGNATO DENTRO l'updater di
  // setMessages — cioè dentro la funzione che l'intestazione di questo stesso
  // file dichiara di aver reso pura, e per una ragione precisa: React 18 la
  // invoca due volte in StrictMode e può rieseguirla in Concurrent Rendering.
  // Scriverci sopra variabili lette poi in un callback asincrono è la stessa
  // forma di prima («dedurre l'intento dalla differenza di stato»), solo più
  // piccola: il valore su cui si basa la compensazione dipende da quante volte
  // React ha deciso di eseguire l'updater e da quale `prev` gli ha passato.
  //
  // Il messaggio ce l'ha già il chiamante — `handleTogglePin`, nello stesso
  // componente, lo cerca con `msgs.find` da sempre — quindi qui si riceve
  // `reazioniPrima` invece di estrarlo di nascosto. L'updater torna una
  // funzione pura di `prev`, e chi compensa sa cosa sta ripristinando.
  const toggleReaction = (convId, msgId, emoji, reazioniPrima = null) => {
    const uid = getCurrentUserId();
    if (!convId || !msgId || !emoji || !uid) return;
    setMessages(prev => {
      const list = prev[convId];
      if (!list || !list.some(m => m.id === msgId)) return prev;
      return {
        ...prev,
        [convId]: list.map(m => {
          if (m.id !== msgId) return m;
          const reactions = { ...(m.reactions || {}) };
          const users = reactions[emoji] || [];
          if (users.includes(uid)) {
            const rimasti = users.filter(u => u !== uid);
            if (rimasti.length === 0) delete reactions[emoji];
            else reactions[emoji] = rimasti;
          } else {
            reactions[emoji] = [...users, uid];
          }
          return { ...m, reactions };
        }),
      };
    });
    if (!enabled || !isUuid(msgId)) return;
    MessagesAPI.toggleReaction(msgId, emoji).then(r => {
      const errore = esitoScrittura(r);
      if (errore) {
        // Si ripristinano le SOLE reazioni del messaggio toccato (A-2 del
        // secondo passaggio): uno snapshot dell'intera mappa porterebbe via i
        // messaggi arrivati nel frattempo.
        if (reazioniPrima) {
          setMessages(prev => ({
            ...prev,
            [convId]: (prev[convId] || []).map(m =>
              (m.id === msgId ? { ...m, reactions: reazioniPrima } : m)),
          }));
        }
        fallito("toggleReaction", errore, `Chat: reazione non salvata: ${errore.message || ""}`);
      }
    });
  };

  return {
    createConversation,
    updateConversation,
    removeConversation,
    sendMessage,
    setMessagePinned,
    markConversationRead,
    toggleReaction,
  };
}
