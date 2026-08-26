// src/components/liste/useStrumentiDati.js
// Gli "Strumenti dati" del modulo Liste viaggio: backup JSON in giù, backup
// JSON in su, reset totale.
//
// PERCHÉ È USCITO DA ListeViaggio.jsx (M-5, audit del 25 agosto). Il modulo
// faceva quattro lavori nello stesso file: la navigazione fra home e dettaglio,
// l'elenco (ricerca, filtri, ordinamento, finestra), il cestino e QUESTO —
// leggere e scrivere l'intero corpus da un file su disco. L'ultimo non
// condivide niente con gli altri tre: non tocca `liste`, `cestino` o `saldi`,
// non ha nulla a che vedere con ciò che si vede a schermo, ed è l'unico che
// parla con il filesystem dell'utente. Era anche il più lungo dei quattro.
//
// Il confine è netto e si vede dalla firma: qui entrano l'overlay (queste tre
// operazioni sono tutte modali) e il modo di ricaricare la home dopo aver
// riscritto il corpus; esce ciò che i bottoni chiamano. Nessun altro pezzo
// dello stato del modulo attraversa questo file.
import { useRef } from "react";
import { ListeAPI } from "./listeApi.js";
import { todayISO } from "./listeFormato.js";
import { downloadBlob } from "./listeDocumenti.js";
import { useListeWrite } from "./listePersistence.js";
import { useDispatch } from "../../state/DispatchContext.jsx";
import { toastSuccesso } from "../../state/registroScritture.js";

/**
 * @param {object}   opts
 * @param {object}   opts.overlay          lo stato dell'overlay (serve il suo
 *   corredo: il payload del backup letto dal file e l'avanzamento del carico).
 * @param {Function} opts.overlayDispatch  per l'avanzamento, che cambia MENTRE
 *   la modale resta aperta — è un progresso, non una transizione.
 * @param {Function} opts.apriOverlay
 * @param {Function} opts.chiudiOverlay
 * @param {Function} opts.ricarica         ricarica la home dopo una scrittura
 *   che ha riscritto il corpus.
 */
export function useStrumentiDati({
  overlay, overlayDispatch, apriOverlay, chiudiOverlay, ricarica,
}) {
  const dispatch = useDispatch();
  const esegui = useListeWrite();
  // Il campo file vive qui perché è l'unico posto che lo usa: `apriCaricaBackup`
  // lo clicca, `onBackupFile` ne legge il contenuto. Il JSX resta in
  // ListeViaggio — un <input type="file"> nascosto è markup, non stato — e
  // riceve il ref insieme al gestore.
  const fileInputRef = useRef(null);

  const scaricaBackup = async () => {
    const { data, error } = await ListeAPI.backupData();
    if (error) {
      // Una LETTURA fallita, non una scrittura: qui non è ancora stato scritto
      // niente, e `toastErrore` direbbe «Salvataggio fallito» di un backup che
      // non è mai partito. Vale lo stesso per i due controlli sul file qui
      // sotto, che sono validazione e non esito di una scrittura.
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Errore: ${error.message}` } });
      return;
    }
    const backup = {
      app: "liste-viaggio", versione: 1, esportato_il: new Date().toISOString(), ...data,
    };
    downloadBlob(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      `backup_liste_viaggio_${todayISO()}.json`,
    );
    dispatch(toastSuccesso(
      `Backup scaricato: ${data.liste.length} liste, ${data.movimenti.length} movimenti`,
    ));
  };

  const apriCaricaBackup = () => {
    chiudiOverlay();
    fileInputRef.current?.click();
  };

  // Legge e valida il file scelto; il conteggio va mostrato PRIMA di scrivere,
  // così l'utente sa cosa sta per aggiungere (importa_backup fa solo merge:
  // aggiunge, salta i duplicati per id, non cancella nulla).
  const onBackupFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "File non valido: JSON non leggibile" } });
      return;
    }
    if (!data || data.app !== "liste-viaggio" || !Array.isArray(data.liste)) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Il file non sembra un backup di questa app." } });
      return;
    }
    apriOverlay("import", {
      // `beneficiari` NON è opzionale per distrazione: i backup prodotti prima
      // della cointestazione (2 agosto) non hanno il campo, e per quelli `[]`
      // è la risposta giusta. Ometterlo del tutto invece — com'era fino al 14
      // agosto (C-1) — fa sparire i cointestatari anche dai backup che LI
      // CONTENGONO, senza errore: `chunk(undefined)` ritorna `[]` e il passo
      // non viene nemmeno costruito (listeApi.js: chunk, importaBackup).
      payload: {
        clients: data.clients || [],
        liste: data.liste || [],
        beneficiari: data.beneficiari || [],
        movimenti: data.movimenti || [],
      },
      nL: (data.liste || []).length,
      nB: (data.beneficiari || []).length,
      nM: (data.movimenti || []).length,
      progress: null,
    });
  };

  const confermaImport = async () => {
    if (overlay.tipo !== "import") return false;
    // Il ripristino ora è spezzato in più chiamate: su un backup grande può
    // durare parecchi secondi, e un bottone fermo su "Carico…" sembrerebbe
    // bloccato. L'avanzamento arriva dal layer dati, che sa quanti blocchi ha
    // già scritto — ed è l'unico dato che cambia mentre l'overlay resta aperto,
    // quindi PROGRESSO e non una transizione.
    overlayDispatch({ type: "PROGRESSO", progress: { done: 0, total: 0 } });
    const { ok, data: res } = await esegui(
      "importaBackup",
      overlay.dati.payload,
      (progress) => overlayDispatch({ type: "PROGRESSO", progress }),
    );
    // Fallito: l'avanzamento sparisce ma la modale resta aperta, così si può
    // riprovare senza riscegliere il file.
    overlayDispatch({ type: "PROGRESSO", progress: null });
    if (!ok) return false;
    chiudiOverlay();
    dispatch(toastSuccesso(
      `Backup caricato: +${res.clients_added} clienti, +${res.liste_added} liste, `
      + `+${res.beneficiari_added} cointestatari, +${res.movimenti_added} movimenti`,
    ));
    await ricarica();
    return true;
  };

  const confermaReset = async () => {
    const { ok, data: res } = await esegui("resetTotale");
    if (!ok) return false;
    chiudiOverlay();
    dispatch(toastSuccesso(
      `Reset eseguito: ${res.liste_deleted} liste e ${res.movimenti_deleted} movimenti eliminati`,
    ));
    await ricarica();
    return true;
  };

  return {
    fileInputRef, scaricaBackup, apriCaricaBackup, onBackupFile,
    confermaImport, confermaReset,
  };
}
