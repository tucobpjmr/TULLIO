import { useRef, useState } from "react";
import { eur, parseImporto, todayISO } from "../listeFormato.js";
import { LvOverlay } from "./LvOverlay.jsx";
import { MetodoSelect } from "./MetodoSelect.jsx";
import { SegnoSeg } from "./SegnoSeg.jsx";
import { FieldError, ariaCampo } from "../../ui/FieldError.jsx";
import * as stiliComuni from "../../../styles/common.js";
import { useSalvataggioLista } from "../useSalvataggioLista.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const mt6 = { marginTop: 6 };

// M-1 dell'audit UX/errori del 31 agosto — il caso peggiore dei quattro
// modali migrati: «3 righe hanno descrizione o importo mancante» su una
// tabella di dieci righe non diceva QUALI tre. Qui la validazione è PER RIGA
// e l'errore va sotto la cella sbagliata, non in un toast che le riassume.
//
// Una riga completamente vuota non è un errore — è la riga di scorta lasciata
// lì dall'utente — e viene ignorata in silenzio, esattamente come prima.
function erroriRiga(r) {
  const desc = r.desc.trim();
  const grezzo = r.imp.trim();
  if (!desc && !grezzo) return null;
  const errori = {};
  if (!desc) errori.desc = "La descrizione non può essere vuota.";
  if (parseImporto(grezzo, r.segno) === null) {
    errori.imp = "Importo non valido: usa una cifra come 1.250,00.";
  }
  return Object.keys(errori).length ? errori : null;
}

// ─── Inserimento multiplo ──────────────────────────────────────────────────
// Data e metodo valgono per tutte le righe, il segno è per riga. Una sola RPC
// (registra_movimenti_lista) scrive tutte le righe in un'unica transazione.
let bulkRowSeq = 0;
const emptyBulkRow = () => ({ key: ++bulkRowSeq, desc: "", imp: "", segno: 1 });

export function BulkMovimentiModal({ onSave, onClose }) {
  const [data, setData] = useState(todayISO());
  const [metodo, setMetodo] = useState(null);
  const [rows, setRows] = useState(() => [emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
  const [erroreData, setErroreData] = useState(null);
  const [erroriRighe, setErroriRighe] = useState({});
  // Ciò che non ha un campo a cui appendersi: "nessuna riga compilata", "non
  // puoi togliere l'ultima". `role="alert"` lo annuncia comunque — la stessa
  // forma che NewConversationView usa per l'elenco membri, dove non c'è un
  // singolo controllo da marcare `aria-invalid` (vedi docs/CLAUDE.md).
  const [avviso, setAvviso] = useState(null);
  const dataRef = useRef(null);
  // key → { desc: nodo, imp: nodo }, popolata dai ref callback qui sotto: le
  // righe sono dinamiche, un useRef per campo non basterebbe.
  const campiRiga = useRef(new Map());
  const rifRiga = (key, campo) => (nodo) => {
    const voce = campiRiga.current.get(key) || {};
    voce[campo] = nodo;
    campiRiga.current.set(key, voce);
  };

  const setRow = (key, patch) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    // Come negli altri form del modulo: l'errore del CAMPO toccato si spegne
    // appena si scrive, non al prossimo invio.
    setErroriRighe((prec) => {
      if (!prec[key]) return prec;
      const campiPatch = Object.keys(patch);
      const restano = { ...prec[key] };
      let cambiato = false;
      for (const c of campiPatch) {
        if (restano[c]) { delete restano[c]; cambiato = true; }
      }
      if (!cambiato) return prec;
      const next = { ...prec };
      if (Object.keys(restano).length) next[key] = restano; else delete next[key];
      return next;
    });
  };

  const removeRow = (key) => {
    if (rows.length <= 1) { setAvviso("Serve almeno una riga."); return; }
    setRows((rs) => rs.filter((r) => r.key !== key));
    setErroriRighe((prec) => {
      if (!prec[key]) return prec;
      const next = { ...prec };
      delete next[key];
      return next;
    });
  };

  const totale = rows.reduce((s, r) => s + (parseImporto(r.imp, r.segno) || 0), 0);
  const totCls = totale > 0.004 ? "pos" : totale < -0.004 ? "neg" : "";

  const { salva, inVolo } = useSalvataggioLista(onSave.run);

  const submit = () => {
    if (!data) {
      setErroreData("Indica la data comune.");
      dataRef.current?.focus();
      return;
    }
    setErroreData(null);

    const nuoviErrori = {};
    let primaRigaInErrore = null;
    const movimenti = [];
    for (const r of rows) {
      const e = erroriRiga(r);
      if (e) {
        nuoviErrori[r.key] = e;
        if (primaRigaInErrore === null) primaRigaInErrore = r;
        continue;
      }
      const desc = r.desc.trim();
      const grezzo = r.imp.trim();
      if (!desc && !grezzo) continue; // riga lasciata vuota: si ignora
      movimenti.push({ descrizione: desc, importo: parseImporto(grezzo, r.segno) });
    }

    if (primaRigaInErrore) {
      setErroriRighe(nuoviErrori);
      setAvviso(null);
      const campi = campiRiga.current.get(primaRigaInErrore.key);
      const erroriQuellaRiga = nuoviErrori[primaRigaInErrore.key];
      (erroriQuellaRiga.desc ? campi?.desc : campi?.imp)?.focus();
      return;
    }
    if (!movimenti.length) {
      setErroriRighe({});
      setAvviso("Compila almeno una riga.");
      return;
    }
    setErroriRighe({});
    setAvviso(null);
    salva({ data, movimenti, metodo });
  };

  return (
    <LvOverlay onClose={onClose} wide>
      {/* M-4 · `<form>` e non `<div>`: Invio deve inviare. */}
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <h2>Aggiungi più movimenti</h2>
        <p className="lv-bulk-hint">
          Data e metodo valgono per tutte le righe. Per ogni riga scegli se è un
          versamento (+) o un utilizzo (−).
        </p>
        <div className="lv-form-grid" style={stiliComuni.mb14}>
          <div className="lv-field">
            <label htmlFor="bulk-data">Data (comune)</label>
            <input
              id="bulk-data" type="date" ref={dataRef} value={data}
              onChange={(e) => { setData(e.target.value); if (erroreData) setErroreData(null); }}
              {...ariaCampo("bulk-data-err", erroreData)}
            />
            <FieldError id="bulk-data-err">{erroreData}</FieldError>
          </div>
          <div className="lv-field">
            <label htmlFor="bulk-met">Metodo (comune)</label>
            <MetodoSelect id="bulk-met" value={metodo} onChange={setMetodo} />
          </div>
        </div>
        <div>
          {rows.map((r) => {
            const errRiga = erroriRighe[r.key] || {};
            return (
              <div key={r.key} className="lv-bulk-row">
                <input
                  ref={rifRiga(r.key, "desc")}
                  value={r.desc}
                  onChange={(e) => setRow(r.key, { desc: e.target.value })}
                  placeholder="Descrizione (es. ROSSI MARIO)"
                  aria-label="Descrizione del movimento"
                  {...ariaCampo(`bulk-desc-err-${r.key}`, errRiga.desc)}
                />
                <FieldError id={`bulk-desc-err-${r.key}`}>{errRiga.desc}</FieldError>
                <div className="lv-bulk-bottom">
                  <div className="lv-bulk-seg">
                    <SegnoSeg segno={r.segno} onChange={(s) => setRow(r.key, { segno: s })} labels={false} />
                  </div>
                  <input
                    ref={rifRiga(r.key, "imp")}
                    className="lv-bulk-imp"
                    inputMode="decimal"
                    value={r.imp}
                    onChange={(e) => setRow(r.key, { imp: e.target.value })}
                    placeholder="0,00"
                    aria-label="Importo del movimento"
                    {...ariaCampo(`bulk-imp-err-${r.key}`, errRiga.imp)}
                  />
                  <button type="button" className="lv-icon-btn" title="Togli riga" aria-label="Togli riga" onClick={() => removeRow(r.key)}>✕</button>
                </div>
                <FieldError id={`bulk-imp-err-${r.key}`}>{errRiga.imp}</FieldError>
              </div>
            );
          })}
        </div>
        <button type="button" className="lv-btn sm" style={mt6} onClick={() => setRows((rs) => [...rs, emptyBulkRow()])}>
          + Aggiungi riga
        </button>
        {avviso && <FieldError id="bulk-avviso">{avviso}</FieldError>}
        <div className="lv-bulk-tot">
          <span>Totale</span>
          <b className={`lv-num ${totCls}`}>{eur(totale)}</b>
        </div>
        <div className="actions">
          <button type="button" className="lv-btn" onClick={onClose}>Annulla</button>
          <button type="submit" className="lv-btn primary" disabled={inVolo}>
            {inVolo ? "Registro…" : "Registra tutti"}
          </button>
        </div>
      </form>
    </LvOverlay>
  );
}
