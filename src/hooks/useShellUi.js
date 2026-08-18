// src/hooks/useShellUi.js
// Lo stato di UI EFFIMERA del guscio: cosa è aperto, cosa si sta cercando.
//
// PERCHÉ ESISTE (M-3, audit di architettura del 15 agosto). `VoyageDeskInner`
// faceva due lavori nello stesso file: montare il reducer e i sei hook di
// dominio (idratazione, notifiche, presenza, push, chat, dispatch sincronizzato)
// **e** tenere sei `useState` di pannelli aperti con i loro callback. Il
// rilievo non era la lunghezza — il file passa `max-lines` — ma il fatto che
// ogni funzionalità trasversale nuova atterrasse lì, perché era l'unico posto
// che vedeva tutto.
//
// PERCHÉ QUESTO STATO NON STA NEL REDUCER, e non è una svista: non è
// persistito, non sopravvive al reload, e portarlo nel reducer globale
// invaliderebbe l'identità di `state` — quindi ri-renderizzerebbe l'intero
// guscio — a ogni carattere digitato nella ricerca (audit ST-2, parte 2).
//
// PERCHÉ NON È `useState` LOCALE DELLA TOPBAR: `searchQuery` è candidato a
// diventare un filtro cross-view, e i pannelli (chat, bulk, scorciatoie) si
// aprono da tre posti diversi — FAB, Sidebar, BottomNav, notifiche. Il guscio
// è il punto giusto da cui distribuirlo; questo hook è solo il modo di farlo
// senza mescolarlo ai sei hook di dominio.
//
// ⚠️ OGNI callback qui è `useCallback`, e non è una precauzione generica: sono
// prop che arrivano a componenti `memo` (Dashboard, Sidebar, BottomNav,
// ChatPanel). Una funzione ricreata a ogni render è una prop diversa a ogni
// render, cioè un confronto che non può mai riuscire — è già successo, ed è
// stato misurato: un render completo della Dashboard per OGNI carattere
// digitato nella ricerca, nonostante il `memo` (ST-1). Blindato da
// `src/test/memoViste.test.jsx`.
import { useCallback, useState } from "react";

export function useShellUi() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showFABModal, setShowFABModal] = useState(false);
  const [showKeyHelp, setShowKeyHelp] = useState(false);
  const [showChat, setShowChat] = useState(false);
  // { toUser, taskLink } oppure { convId }: la chat da aprire preconfezionata.
  const [chatIntent, setChatIntent] = useState(null);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Le setState non entrano nelle dipendenze di nessuno di questi callback:
  // React ne garantisce l'identità stabile per tutta la vita del componente,
  // quindi l'array vuoto è corretto e non un'omissione.
  const openChatTo = useCallback((intent) => {
    if (intent && intent.toUser) setChatIntent(intent);
    setShowChat(true);
  }, []);

  // Apre una conversazione già esistente (tap su una notifica di chat).
  const openConversationById = useCallback((conversationId) => {
    if (!conversationId) return;
    setChatIntent({ convId: conversationId });
    setShowChat(true);
  }, []);

  const openChatPanel = useCallback(() => {
    setChatIntent(null);
    setShowChat(true);
  }, []);

  const closeChatPanel = useCallback(() => {
    setShowChat(false);
    setChatIntent(null);
  }, []);

  const openBulk = useCallback(() => setShowBulkModal(true), []);
  // Chiude tutto ciò che è aperto. Serve al cambio utente: i pannelli mostrano
  // dati filtrati per permessi, e lasciarne uno aperto attraverso un cambio di
  // identità è il modo in cui si guarda la chat di qualcun altro.
  const chiudiPannelli = useCallback(() => {
    setShowChat(false);
    setShowBulkModal(false);
    setShowFABModal(false);
    setChatIntent(null);
  }, []);
  const closeBulk = useCallback(() => setShowBulkModal(false), []);
  const openFAB = useCallback(() => setShowFABModal(true), []);
  const closeFAB = useCallback(() => setShowFABModal(false), []);
  const closeKeyHelp = useCallback(() => setShowKeyHelp(false), []);

  return {
    searchQuery, setSearchQuery,
    showFABModal, openFAB, closeFAB,
    showKeyHelp, setShowKeyHelp, closeKeyHelp,
    showChat, chatIntent, setChatIntent,
    openChatTo, openConversationById, openChatPanel, closeChatPanel,
    showBulkModal, openBulk, closeBulk,
    chiudiPannelli,
  };
}
