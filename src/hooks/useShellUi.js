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
// PERCHÉ NON È `useState` LOCALE DELLA TOPBAR: `ricerca` è candidato a
// diventare un filtro cross-view, e i pannelli (chat, bulk, scorciatoie) si
// aprono da tre posti diversi — FAB, Sidebar, BottomNav, notifiche. Il guscio
// è il punto giusto da cui distribuirlo; questo hook è solo il modo di farlo
// senza mescolarlo ai sei hook di dominio.
//
// ⚠️ B-3 (audit del 25 agosto): i nomi di questo file sono in ITALIANO, come
// tutto ciò che nominiamo noi. Erano in inglese con UNA eccezione italiana in
// mezzo (`chiudiPannelli`) — il caso peggiore, perché chi legge non ricava
// nessuna regola dal file e deve ricordarsi caso per caso come si chiama cosa.
// Restano in inglese solo i nomi che non scegliamo noi: le prop `on*` che React
// impone per convenzione, e i campi che rispecchiano il database.
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
  const [ricerca, impostaRicerca] = useState("");
  const [fabAperto, setFabAperto] = useState(false);
  const [scorciatoieAperte, setScorciatoieAperte] = useState(false);
  const [chatAperta, setChatAperta] = useState(false);
  // { toUser, taskLink } oppure { convId }: la chat da aprire preconfezionata.
  const [intentoChat, setIntentoChat] = useState(null);
  const [bulkAperto, setBulkAperto] = useState(false);

  // Le setState non entrano nelle dipendenze di nessuno di questi callback:
  // React ne garantisce l'identità stabile per tutta la vita del componente,
  // quindi l'array vuoto è corretto e non un'omissione.
  const apriChatCon = useCallback((intento) => {
    if (intento && intento.toUser) setIntentoChat(intento);
    setChatAperta(true);
  }, []);

  // Apre una conversazione già esistente (tap su una notifica di chat).
  const apriConversazione = useCallback((conversationId) => {
    if (!conversationId) return;
    setIntentoChat({ convId: conversationId });
    setChatAperta(true);
  }, []);

  const apriChat = useCallback(() => {
    setIntentoChat(null);
    setChatAperta(true);
  }, []);

  const chiudiChat = useCallback(() => {
    setChatAperta(false);
    setIntentoChat(null);
  }, []);

  const apriBulk = useCallback(() => setBulkAperto(true), []);
  // Chiude tutto ciò che è aperto. Serve al cambio utente: i pannelli mostrano
  // dati filtrati per permessi, e lasciarne uno aperto attraverso un cambio di
  // identità è il modo in cui si guarda la chat di qualcun altro.
  const chiudiPannelli = useCallback(() => {
    setChatAperta(false);
    setBulkAperto(false);
    setFabAperto(false);
    setIntentoChat(null);
  }, []);
  const chiudiBulk = useCallback(() => setBulkAperto(false), []);
  const apriFAB = useCallback(() => setFabAperto(true), []);
  const chiudiFAB = useCallback(() => setFabAperto(false), []);
  // Un COMANDO e non il setter grezzo: la scorciatoia `?` alterna il pannello,
  // e finché usciva `setScorciatoieAperte` il guscio doveva conoscere la forma
  // dello stato per invertirlo (`p => !p`). Vedi la regola in docs/CLAUDE.md.
  const alternaScorciatoie = useCallback(() => setScorciatoieAperte(p => !p), []);
  const chiudiScorciatoie = useCallback(() => setScorciatoieAperte(false), []);

  return {
    ricerca, impostaRicerca,
    fabAperto, apriFAB, chiudiFAB,
    scorciatoieAperte, alternaScorciatoie, chiudiScorciatoie,
    chatAperta, intentoChat,
    apriChatCon, apriConversazione, apriChat, chiudiChat,
    bulkAperto, apriBulk, chiudiBulk,
    chiudiPannelli,
  };
}
