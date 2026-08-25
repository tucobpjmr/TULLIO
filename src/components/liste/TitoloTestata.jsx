// Titolo della lista, modificabile in linea (estratto da ListaDetail.jsx).
import { useEffect, useRef, useState } from "react";
import { useListeWrite } from "./listePersistence.js";

// Titolo in testata: modificabile con un tocco, come le celle dei movimenti.
// Quando il titolo manca (caso più frequente: le liste importate non ne hanno
// uno) mostra comunque un invito esplicito, altrimenti la possibilità di
// darne uno resterebbe nascosta dentro "Modifica dati".
export function TitoloTestata({ lista, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(lista.titolo || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const esegui = useListeWrite();

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const open = () => { setValue(lista.titolo || ""); setEditing(true); };

  const save = async () => {
    if (saving) return;
    const titolo = value.trim() || null; // vuoto = lista senza titolo
    if (titolo === (lista.titolo || null)) { setEditing(false); return; } // niente da salvare
    setSaving(true);
    const { ok } = await esegui("modificaTitolo", { id: lista.id, titolo });
    setSaving(false);
    if (!ok) return;
    setEditing(false);
    await onSaved();
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
        <button className="lv-btn primary sm" disabled={saving} onClick={save}>
          {saving ? "Salvo…" : "Salva"}
        </button>
      </span>
    );
  }

  return lista.titolo
    ? <button className="lv-tit-btn" title="Modifica il titolo" onClick={open}>{lista.titolo} <span className="pen">✎</span></button>
    : <button className="lv-tit-btn add" title="Aggiungi un titolo" onClick={open}>+ Aggiungi titolo</button>;
}
