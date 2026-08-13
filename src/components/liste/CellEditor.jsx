// Editor di cella del foglio movimenti (estratto da ListaDetail.jsx).
import { useEffect, useRef, useState } from "react";
import { METODI, parseImporto } from "./listeApi.js";
import { useListeWrite } from "./listePersistence.js";
import { SegnoSeg } from "./modals/SegnoSeg.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const mb8 = { marginBottom: 8 };

// Modifica in linea: un campo per volta. La riga toccata viene sostituita da
// un editor a tutta larghezza — su schermo stretto un input dentro la cella
// sarebbe troppo piccolo da centrare col dito. Il salvataggio è esplicito e
// non a perdita di fuoco, che sul telefono scatta anche scorrendo la pagina.
const CAMPO_LABELS = { data: "Data", descrizione: "Descrizione", importo: "Importo €", metodo: "Metodo di pagamento" };

export function CellEditor({ movimento, campo, dispatch, onSaved, onCancel }) {
  const [segno, setSegno] = useState(Number(movimento.importo) < 0 ? -1 : 1);
  const [value, setValue] = useState(() => {
    if (campo === "data") return movimento.data_movimento;
    if (campo === "descrizione") return movimento.descrizione;
    if (campo === "importo") return Math.abs(Number(movimento.importo)).toFixed(2).replace(".", ",");
    return movimento.metodo || "";
  });
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const esegui = useListeWrite(dispatch);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (el.type === "text") el.select();
  }, []);

  const err = (message) => dispatch({ type: "SHOW_TOAST", payload: { type: "error", message } });

  const save = async () => {
    if (saving) return;
    // Si modifica un campo per volta: gli altri tre restano quelli del record.
    let data = movimento.data_movimento;
    let descrizione = movimento.descrizione;
    let importo = Number(movimento.importo);
    let metodo = movimento.metodo || null;

    if (campo === "data") {
      if (!value) return err("Inserisci una data");
      data = value;
    } else if (campo === "descrizione") {
      if (!value.trim()) return err("La descrizione non può essere vuota");
      descrizione = value.trim();
    } else if (campo === "importo") {
      const n = parseImporto(value, segno);
      if (n === null) return err("Importo non valido");
      importo = n;
    } else {
      metodo = value || null;
    }

    setSaving(true);
    const { ok } = await esegui("modificaMovimento", { id: movimento.id, data, descrizione, importo, metodo });
    setSaving(false);
    if (ok) await onSaved();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    else if (e.key === "Escape") onCancel();
  };

  return (
    <tr className="lv-edit-row">
      <td colSpan={5}>
        <div className="lv-cell-edit">
          <label htmlFor="lv-cell-input">{CAMPO_LABELS[campo]}</label>
          {campo === "importo" && (
            <div style={mb8}>
              <SegnoSeg segno={segno} onChange={setSegno} />
            </div>
          )}
          {campo === "metodo" ? (
            <select id="lv-cell-input" ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown}>
              {METODI.map((v) => <option key={v || "none"} value={v}>{v ? v.toUpperCase() : "—"}</option>)}
            </select>
          ) : (
            <input
              id="lv-cell-input"
              ref={inputRef}
              type={campo === "data" ? "date" : "text"}
              inputMode={campo === "importo" ? "decimal" : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
            />
          )}
          <div className="lv-cell-edit-actions">
            <button className="lv-btn sm" onClick={onCancel}>Annulla</button>
            <button className="lv-btn primary sm" disabled={saving} onClick={save}>
              {saving ? "Salvo…" : "Salva"}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
