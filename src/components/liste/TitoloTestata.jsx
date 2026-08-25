// Titolo della lista, modificabile in linea (estratto da ListaDetail.jsx).
import { useEffect, useRef, useState } from "react";
import { useListeWrite } from "./listePersistence.js";
import { useSalvataggioLista } from "./useSalvataggioLista.js";

// Titolo in testata: modificabile con un tocco, come le celle dei movimenti.
// Quando il titolo manca (caso più frequente: le liste importate non ne hanno
// uno) mostra comunque un invito esplicito, altrimenti la possibilità di
// darne uno resterebbe nascosta dentro "Modifica dati".
export function TitoloTestata({ lista, onSaved }) {
  const [editing, setEditing] = useState(false);
  // Nasce vuoto e non da `lista.titolo`: `apri()` riassegna sempre il valore
  // dalla prop prima di mostrare l'editor, quindi un inizializzatore che legge
  // la prop non verrebbe mai usato e farebbe credere a chi legge che ci sia una
  // sincronizzazione prop→stato da mantenere.
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  const esegui = useListeWrite();

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const open = () => { setValue(lista.titolo || ""); setEditing(true); };

  // A-2 · Il contratto porta il freno al doppio invio su un `ref`, il `finally`
  // e il guard di smontaggio. Il testo dell'errore resta il toast del registry:
  // vedi useSalvataggioLista.js per il perché non se ne mostra un secondo.
  const { salva, inVolo } = useSalvataggioLista(
    async (titolo) => (await esegui("modificaTitolo", { id: lista.id, titolo })).ok,
    { alSuccesso: () => { setEditing(false); onSaved(); } },
  );

  const save = () => {
    const titolo = value.trim() || null; // vuoto = lista senza titolo
    if (titolo === (lista.titolo || null)) return setEditing(false); // niente da salvare
    salva(titolo);
  };

  if (editing) {
    return (
      <span className="lv-tit-edit">
        <input
          ref={inputRef}
          type="text"
          maxLength={80}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); save(); }
            else if (e.key === "Escape") setEditing(false);
          }}
          placeholder="Es. Buono viaggio 2026"
          aria-label="Titolo della lista"
        />
        <button className="lv-btn sm" onClick={() => setEditing(false)}>Annulla</button>
        <button className="lv-btn primary sm" disabled={inVolo} onClick={save}>
          {inVolo ? "Salvo…" : "Salva"}
        </button>
      </span>
    );
  }

  return lista.titolo
    ? <button className="lv-tit-btn" title="Modifica il titolo" onClick={open}>{lista.titolo} <span className="pen">✎</span></button>
    : <button className="lv-tit-btn add" title="Aggiungi un titolo" onClick={open}>+ Aggiungi titolo</button>;
}
