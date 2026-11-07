// src/components/chat/chatCommands.js
// Le scritture della chat: aggiornamento locale + persistenza, un comando
// esplicito per ognuna.
//
// ⛔ Mai una chiamata di rete dentro l'updater di setState: React 18 lo invoca
// due volte in StrictMode e può rieseguirlo (creare una conversazione faceva
// due INSERT). `setConversations`/`setMessages` restano setter puri; la rete
// parte fuori. E l'intento si dichiara, non si deduce dalla differenza di stato.
//
// USO. Con `enabled: false` (nessun login, mock, test) solo l'aggiornamento
// locale.
//
//   const commands = makeChatCommands({ setConversations, setMessages, enabled });
//   commands.sendMessage(convId, msg);

import {
  Conversations as ConversationsAPI,
  Messages as MessagesAPI,
} from "../../lib/api.js";
import { toDbConversation, toDbMessage, newId, isUuid } from "../../lib/mappers.js";
// A-2 · «Andata bene» non è `!res.error`: la RLS può rifiutare con un 2xx
// (vedi lib/esitoScrittura.js).
import { esitoScrittura } from "../../lib/esitoScrittura.js";

const noop = () => {};

// `esitoScrittura()` ritorna `unknown`: qui serve solo il messaggio, se c'è.
const msgErrore = (e) => (e instanceof Error ? e.message : "");

/**
 * I tipi dei setter sono quelli reali di `useChatData.js`: con un default a
 * `noop` `checkJs` inferirebbe una firma a zero parametri.
 *
 * @param {object} [opts]
 * @param {(updater: (prev: object[]) => object[]) => void} [opts.setConversations]
 * @param {(updater: (prev: object) => object) => void} [opts.setMessages]
 * @param {boolean} [opts.enabled]
 * @param {() => (string|null)} [opts.getCurrentUserId]
 * @param {(messaggio: string) => void} [opts.onError]
 * @param {(messaggio: string) => void} [opts.onSuccess]
 * @param {(convId: string) => void} [opts.onConversationRead]
 * @param {(convId: string, msg: object) => void} [opts.marcaInVolo]
 * @param {(msgId: string) => void} [opts.smarcaInVolo]
 */
export function makeChatCommands({
  setConversations = noop,
  setMessages = noop,
  enabled = false,
  getCurrentUserId = () => null,
  onError = noop,
  onSuccess = noop,
  onConversationRead = noop,
  // A-2 · Il registro delle scritture in volo di useChatData. No-op di default.
  marcaInVolo = noop,
  smarcaInVolo = noop,
} = {}) {
  // convId → Promise dell'INSERT conversazione in volo: il primo messaggio
  // aspetta, o la RLS lo rifiuta perché la conversazione non esiste ancora.
  const creazioniInVolo = new Map();

  // A-5 · Ascoltatori di un invio fallito, per conversazione: il composer
  // ripopola il campo col messaggio perso. Dentro la factory: ogni istanza ha
  // il proprio ciclo di vita.
  const ripristinoAscoltatori = new Map(); // convId → Set<(msg) => void>

  const onInvioFallito = (convId, msg) => {
    for (const fn of ripristinoAscoltatori.get(convId) || []) fn(msg);
  };

  const ascoltaInvioFallito = (convId, fn) => {
    if (!ripristinoAscoltatori.has(convId)) ripristinoAscoltatori.set(convId, new Set());
    const set = ripristinoAscoltatori.get(convId);
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) ripristinoAscoltatori.delete(convId);
    };
  };

  const fallito = (contesto, err, testo) => {
    console.error(`[chat] ${contesto}`, err);
    onError(testo);
  };

  // ─── CONVERSAZIONI ─────────────────────────────────────────────────────────

  // Ritorna la conversazione NORMALIZZATA (id uuid): il chiamante attiva quella.
  // Id uuid anche in mock: i gate isUuid di typing e markRead lo pretendono.
  const createConversation = (conv) => {
    const normalized = isUuid(conv.id) ? conv : { ...conv, id: newId() };
    setConversations(prev => [normalized, ...prev]);
    if (!enabled) return normalized;
    const p = ConversationsAPI.create(toDbConversation(normalized))
      .then(r => {
        const errore = esitoScrittura(r);
        if (errore) {
          fallito("conv.create", errore, `Chat: creazione conversazione fallita: ${msgErrore(errore)}`);
          // Esito normalizzato: un rifiuto silenzioso della RLS non deve far partire il
          // primo messaggio verso una conversazione inesistente.
          return { ...r, error: errore };
        }
        return r;
      })
      .finally(() => creazioniInVolo.delete(normalized.id));
    creazioniInVolo.set(normalized.id, p);
    return normalized;
  };

  // Riceve la conversazione COMPLETA: l'UPDATE scrive tutti i campi modificabili.
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
        fallito("conv.update", errore, `Chat: aggiornamento conversazione fallito: ${msgErrore(errore)}`);
      }
    });
  };

  // Eliminazione conversazione/gruppo.
  // ⚠️ C-1 · PRIMA la DELETE della riga (con `count`), e SOLO se ha tolto
  // davvero la riga si puliscono gli allegati: l'ordine inverso distruggeva i
  // file di tutti anche quando la DELETE falliva o veniva filtrata dalla RLS.
  // Il costo: dopo la DELETE si cancellano solo i file propri (o tutti, se
  // admin); gli orfani li autorizza la migrazione
  // 20260814220000_chat_files_delete_orfani.sql.
  // Riceve la conversazione INTERA per poterla rimettere in lista; i messaggi
  // non si tolgono prima della conferma.
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
        // La riga c'è ancora: si rimette la conversazione e non si tocca lo storage.
        if (snapshot) {
          setConversations(prev => (prev.some(c => c.id === convId) ? prev : [snapshot, ...prev]));
        }
        fallito("conv.delete", errore, `Chat: eliminazione conversazione fallita: ${msgErrore(errore)}`);
        return;
      }
      scartaMessaggi();
      const filesRes = await MessagesAPI.removeConversationFiles(convId);
      if (filesRes?.error) console.warn("[chat] conv files cleanup", filesRes.error);
      onSuccess("Conversazione eliminata");
    })();
  };

  // ─── MESSAGGI ──────────────────────────────────────────────────────────────

  // L'id del messaggio si normalizza solo in modalità DB: in locale resta il
  // provvisorio "m<timestamp>".
  const sendMessage = (convId, msg) => {
    const normalized = !enabled || isUuid(msg.id) ? msg : { ...msg, id: newId() };
    setMessages(prev => ({ ...prev, [convId]: [...(prev[convId] || []), normalized] }));
    if (!enabled) return normalized;

    // A-2 · In volo PRIMA di qualunque await: un reload realtime altrui può
    // partire prima del commit.
    marcaInVolo(convId, normalized);

    // Messaggio mai arrivato: si toglie dallo schermo insieme al toast, o
    // sembrerebbe consegnato.
    const scartaOttimistico = () => {
      setMessages(prev => ({
        ...prev,
        [convId]: (prev[convId] || []).filter(m => m.id !== normalized.id),
      }));
    };

    // A-5 · Un solo percorso di fallimento per i due modi: promise RISOLTA con un
    // errore (RLS, vincolo) e promise RIGETTATA (rete). Entrambi tolgono il
    // messaggio fantasma.
    const fallimento = (errore) => {
      scartaOttimistico();
      // Il testo torna al mittente (A-5): un errore di rete non deve distruggere
      // ciò che ha scritto.
      onInvioFallito(convId, normalized);
      fallito("msg.send", errore, `Chat: invio messaggio fallito: ${errore?.message || ""}`);
    };

    const invia = () => MessagesAPI.send(toDbMessage(normalized, convId))
      .then(r => { const errore = esitoScrittura(r); if (errore) fallimento(errore); })
      .catch(fallimento)
      // finally: un id rimasto marcato bloccherebbe il messaggio dal realtime.
      .finally(() => smarcaInVolo(normalized.id));

    // Conversazione appena creata e ancora in volo: si aspetta. Se la creazione è
    // fallita, niente invio (il toast c'è già), ma messaggio fantasma e testo
    // vanno comunque tolti e restituiti.
    const attesa = creazioniInVolo.get(convId);
    if (attesa) {
      attesa.then(
        (r) => {
          if (r?.error) {
            scartaOttimistico();
            onInvioFallito(convId, normalized);
            smarcaInVolo(normalized.id);
          } else {
            invia();
          }
        },
        // Anche la creazione può RIGETTARE (A-5): senza, il messaggio resterebbe in
        // volo per sempre.
        (err) => { fallimento(err); smarcaInVolo(normalized.id); },
      );
    } else {
      invia();
    }
    return normalized;
  };

  // Pin condiviso: `pinned` è esplicito; pinnedBy/pinnedAt valorizzati al pin,
  // azzerati all'unpin. `precedente` ({ pinned, pinnedBy, pinnedAt }) lo passa
  // il chiamante: serve al ripristino.
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
      // A-2 · `count` letto: il pin è l'unica scrittura sul messaggio ALTRUI, e il
      // trigger `messages_blocca_modifiche_altrui` sorveglia quelle colonne.
      const errore = esitoScrittura(r);
      if (errore) {
        // Pin ottimistico riportato indietro.
        const prima = precedente || { pinned: !pinned, pinnedBy: null, pinnedAt: null };
        setMessages(prev => ({
          ...prev,
          [convId]: (prev[convId] || []).map(m => (m.id === msgId
            ? { ...m, pinned: !!prima.pinned, pinnedBy: prima.pinnedBy ?? null, pinnedAt: prima.pinnedAt ?? null }
            : m)),
        }));
        fallito("msg.pinned", errore, `Chat: pin fallito: ${msgErrore(errore)}`);
      }
    });
  };

  // markRead in blocco: update locale + UNA RPC per la conversazione. Il lettore
  // è auth.uid() lato server; origin_client filtra l'eco.
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
    // Spegne la notifica 'chat_message' della conversazione che si sta leggendo.
    onConversationRead(convId);
    if (!enabled || !isUuid(convId)) return;
    MessagesAPI.markReadBulk(convId).then(r => {
      if (r?.error) {
        fallito("markReadBulk", r.error, `Chat: aggiornamento "letto" fallito: ${r.error.message || ""}`);
      }
    });
  };

  // Toggle reazione via RPC messages_toggle_reaction: read-modify-write sotto
  // lock di riga, reactor = auth.uid(). Scrivere l'oggetto intero da qui
  // sarebbe last-write-wins.
  // A-2 · Il rollback ripristina le SOLE reazioni del messaggio toccato: uno
  // snapshot dell'intera mappa porterebbe via i messaggi arrivati nel frattempo.
  // M-3 · `reazioniPrima` lo passa il chiamante: estrarlo dentro l'updater lo
  // renderebbe impuro.
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
        // Solo le reazioni del messaggio toccato (A-2).
        if (reazioniPrima) {
          setMessages(prev => ({
            ...prev,
            [convId]: (prev[convId] || []).map(m =>
              (m.id === msgId ? { ...m, reactions: reazioniPrima } : m)),
          }));
        }
        fallito("toggleReaction", errore, `Chat: reazione non salvata: ${msgErrore(errore)}`);
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
    ascoltaInvioFallito,
  };
}
