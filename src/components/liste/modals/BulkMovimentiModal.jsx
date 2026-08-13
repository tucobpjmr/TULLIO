import { useState } from "react";
import { eur, parseImporto, todayISO } from "../listeApi.js";
import { LvOverlay } from "./LvOverlay.jsx";
import { MetodoSelect } from "./MetodoSelect.jsx";
import { SegnoSeg } from "./SegnoSeg.jsx";
import { mb14 } from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const mt6 = { marginTop: 6 };

// ─── Inserimento multiplo ──────────────────────────────────────────────────
// Data e metodo valgono per tutte le righe, il segno è per riga. Una sola RPC
// (registra_movimenti_lista) scrive tutte le righe in un'unica transazione.
let bulkRowSeq = 0;
const emptyBulkRow = () => ({ key: ++bulkRowSeq, desc: "", imp: "", segno: 1 });

export function BulkMovimentiModal({ onSave, onClose }) {
  const [data, setData] = useState(todayISO());
  const [metodo, setMetodo] = useState(null);
  const [rows, setRows] = useState(() => [emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
  const [saving, setSaving] = useState(false);

  const setRow = (key, patch) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key) => {
    if (rows.length <= 1) return onSave.onError("Serve almeno una riga");
    setRows((rs) => rs.filter((r) => r.key !== key));
  };

  const totale = rows.reduce((s, r) => s + (parseImporto(r.imp, r.segno) || 0), 0);
  const totCls = totale > 0.004 ? "pos" : totale < -0.004 ? "neg" : "";

  const submit = async () => {
    if (saving) return;
    if (!data) return onSave.onError("Inserisci la data comune");
    const movimenti = [];
    let incomplete = 0;
    for (const r of rows) {
      const desc = r.desc.trim();
      const grezzo = r.imp.trim();
      if (!desc && !grezzo) continue; // riga lasciata vuota: si ignora
      const importo = parseImporto(grezzo, r.segno);
      if (!desc || importo === null) { incomplete++; continue; }
      movimenti.push({ descrizione: desc, importo });
    }
    if (incomplete) return onSave.onError(`${incomplete} righe hanno descrizione o importo mancante`);
    if (!movimenti.length) return onSave.onError("Compila almeno una riga");
    setSaving(true);
    const ok = await onSave.run({ data, movimenti, metodo });
    if (!ok) setSaving(false);
  };

  return (
    <LvOverlay onClose={onClose} wide>
      <h2>Aggiungi più movimenti</h2>
      <p className="lv-bulk-hint">
        Data e metodo valgono per tutte le righe. Per ogni riga scegli se è un
        versamento (+) o un utilizzo (−).
      </p>
      <div className="lv-form-grid" style={mb14}>
        <div className="lv-field">
          <label htmlFor="bulk-data">Data (comune)</label>
          <input id="bulk-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="lv-field">
          <label htmlFor="bulk-met">Metodo (comune)</label>
          <MetodoSelect id="bulk-met" value={metodo} onChange={setMetodo} />
        </div>
      </div>
      <div>
        {rows.map((r) => (
          <div key={r.key} className="lv-bulk-row">
            <input
              value={r.desc}
              onChange={(e) => setRow(r.key, { desc: e.target.value })}
              placeholder="Descrizione (es. ROSSI MARIO)"
              aria-label="Descrizione del movimento"
            />
            <div className="lv-bulk-bottom">
              <div className="lv-bulk-seg">
                <SegnoSeg segno={r.segno} onChange={(s) => setRow(r.key, { segno: s })} labels={false} />
              </div>
              <input
                className="lv-bulk-imp"
                inputMode="decimal"
                value={r.imp}
                onChange={(e) => setRow(r.key, { imp: e.target.value })}
                placeholder="0,00"
                aria-label="Importo del movimento"
              />
              <button type="button" className="lv-icon-btn" title="Togli riga" aria-label="Togli riga" onClick={() => removeRow(r.key)}>✕</button>
            </div>
          </div>
        ))}
      </div>
      <button className="lv-btn sm" style={mt6} onClick={() => setRows((rs) => [...rs, emptyBulkRow()])}>
        + Aggiungi riga
      </button>
      <div className="lv-bulk-tot">
        <span>Totale</span>
        <b className={`lv-num ${totCls}`}>{eur(totale)}</b>
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Registro…" : "Registra tutti"}
        </button>
      </div>
    </LvOverlay>
  );
}
