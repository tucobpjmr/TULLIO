// src/components/liste/useModificaInLinea.js
//
// ─── B-2 (audit del 26 agosto) · IL CICLO DELL'EDITOR IN LINEA ────────────
//
// Apri → focus → digita → Enter salva / Escape annulla → chiudi. Era scritto
// due volte alla lettera, in `TitoloTestata` e `NoteInterne`, con un solo
// token di differenza: il nome del campo.
//
// Con A-2 già applicato le tre garanzie del salvataggio arrivano da
// `useSalvataggioLista` e non sono più il duplicato: lo è il ciclo attorno.
//
// ⛔ `CellEditor` NON usa questo hook, ed è una scelta e non una dimenticanza.
// Sembra il terzo gemello e non lo è: non ha uno stato `editing` (il genitore
// lo monta già aperto e gli passa `onCancel`), non ha un `apri`, non legge un
// valore iniziale da una prop ma da quattro campi del movimento, e la sua
// conferma VALIDA per campo con tre messaggi diversi prima di comporre il
// payload. Di condiviso ha il focus iniziale, i due tasti e la barra azioni —
// e la barra azioni infatti la condivide (`AzioniModifica.jsx`). Forzare
// dentro l'hook un caso senza `editing` e con validazione propria vorrebbe
// dire riaprirlo caso per caso dentro l'hook, cioè spostare il problema.
import { useEffect, useRef, useState } from "react";
import { useListeWrite } from "./listePersistence.js";
import { useSalvataggioLista } from "./useSalvataggioLista.js";

/**
 * @param {object} opzioni
 * @param {() => string|null} opzioni.leggi  il valore attuale, dalla prop
 * @param {string} opzioni.operazione        nome dell'operazione nel registry
 * @param {(v: string|null) => object} opzioni.componi  il payload della scrittura
 * @param {() => void} opzioni.onSaved
 */
export function useModificaInLinea({ leggi, operazione, componi, onSaved }) {
  const [editing, setEditing] = useState(false);
  // Nasce vuoto e non dal valore attuale: `apri()` riassegna sempre dalla prop
  // prima di mostrare l'editor, quindi un inizializzatore che la legge non
  // verrebbe mai usato e farebbe credere a chi legge che ci sia una
  // sincronizzazione prop→stato da mantenere.
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  const esegui = useListeWrite();

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    el?.focus();
    // Solo su un `<input type="text">`: su una `<textarea>` (`type` vale
    // "textarea") selezionare tutto significherebbe che il primo carattere
    // digitato cancella una nota che si voleva solo ritoccare.
    if (el?.type === "text") el.select();
  }, [editing]);

  // A-2 · Il contratto porta il freno al doppio invio su un `ref`, il `finally`
  // e il guard di smontaggio. Il testo dell'errore resta il toast del registry:
  // vedi useSalvataggioLista.js per il perché non se ne mostra un secondo.
  const { salva, inVolo } = useSalvataggioLista(
    async (v) => (await esegui(operazione, componi(v))).ok,
    { alSuccesso: () => { setEditing(false); onSaved(); } },
  );

  const chiudi = () => setEditing(false);
  const apri = () => { setValue(leggi() || ""); setEditing(true); };

  const conferma = () => {
    const nuovo = value.trim() || null;   // vuoto = campo non valorizzato
    if (nuovo === (leggi() || null)) return chiudi();   // niente da salvare
    salva(nuovo);
  };

  return {
    editing, value, setValue, inputRef, inVolo, apri, chiudi, conferma,
    onKeyDown: (e) => {
      // In una `<textarea>` Invio è un a capo, non una conferma.
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); conferma(); }
      else if (e.key === "Escape") chiudi();
    },
  };
}
