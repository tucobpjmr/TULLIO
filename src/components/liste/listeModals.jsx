// src/components/liste/listeModals.jsx
// Modali del modulo Liste Viaggio. Nella SPA sorgente erano stringhe HTML
// iniettate in un div #modal e pilotate da funzioni su `window`; qui sono
// componenti controllati, con lo stato dei campi in useState.
//
// Il guard anti doppio-click della SPA (`let creatingLista=false`) diventa lo
// stato `saving`: il bottone si disabilita finché la RPC non risponde.
import { useEffect, useRef, useState } from "react";
import { METODI, eur, parseImporto, todayISO } from "../../lib/listeApi.js";

// Chiude con Escape e blocca la propagazione del click interno, come faceva
// l'overlay della SPA. Il focus va al primo campo all'apertura.
export function LvOverlay({ children, onClose, wide = false }) {
  const boxRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    boxRef.current?.querySelector("input, select")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="lv-overlay" onClick={onClose}>
      <div
        ref={boxRef}
        className={`lv-modal${wide ? " wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

const MetodoSelect = ({ value, onChange, id }) => (
  <select id={id} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
    {METODI.map((v) => (
      <option key={v || "none"} value={v}>{v ? v.toUpperCase() : "—"}</option>
    ))}
  </select>
);

// Segmento Versamento (+) / Utilizzo (−). Il segno è separato dall'importo:
// l'utente digita sempre un numero positivo.
const SegnoSeg = ({ segno, onChange, labels = true }) => (
  <div className="lv-seg">
    <button type="button" className={segno > 0 ? "on-pos" : ""} onClick={() => onChange(1)}>
      {labels ? "Versamento +" : "+"}
    </button>
    <button type="button" className={segno < 0 ? "on-neg" : ""} onClick={() => onChange(-1)}>
      {labels ? "Utilizzo −" : "−"}
    </button>
  </div>
);

// ─── Nuova lista ───────────────────────────────────────────────────────────
// Il cliente si sceglie dall'anagrafica condivisa; "+ Nuovo cliente…" lo crea
// contestualmente (la RPC crea_lista fa INSERT su clients nella stessa
// transazione, così non restano clienti orfani se la creazione lista fallisce).
export function NuovaListaModal({ clients, onCreate, onClose, presetClientId = null }) {
  const [clientId, setClientId] = useState(presetClientId || "");
  const [newName, setNewName] = useState("");
  const [titolo, setTitolo] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (!clientId) return onCreate.onError("Scegli un cliente");
    if (clientId === "__new__" && !newName.trim()) return onCreate.onError("Inserisci il nome del cliente");
    setSaving(true);
    const ok = await onCreate.run({
      clientId: clientId === "__new__" ? null : clientId,
      titolo: titolo.trim() || null,
      newClientName: clientId === "__new__" ? newName.trim() : null,
    });
    if (!ok) setSaving(false); // consenti un nuovo tentativo
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Nuova lista</h2>
      <div className="row lv-field">
        <label htmlFor="nl-client">Cliente</label>
        <select id="nl-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">— scegli cliente —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new__">+ Nuovo cliente…</option>
        </select>
      </div>
      {clientId === "__new__" && (
        <div className="row lv-field">
          <label htmlFor="nl-newname">Nome nuovo cliente</label>
          <input id="nl-newname" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Es. ROSSI MARIO" />
        </div>
      )}
      <div className="row lv-field">
        <label htmlFor="nl-title">Titolo (facoltativo)</label>
        <input id="nl-title" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Buono viaggio 2026" />
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Creo…" : "Crea lista"}
        </button>
      </div>
    </LvOverlay>
  );
}

// ─── Modifica dati lista (nome cliente + titolo) ───────────────────────────
export function EditListaModal({ lista, onSave, onClose }) {
  const [name, setName] = useState(lista.clients?.name || "");
  const [titolo, setTitolo] = useState(lista.titolo || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (!name.trim()) return onSave.onError("Il nome del cliente è obbligatorio");
    setSaving(true);
    const ok = await onSave.run({ id: lista.id, titolo: titolo.trim() || null, clientName: name.trim() });
    if (!ok) setSaving(false);
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Modifica dati lista</h2>
      <div className="row lv-field">
        <label htmlFor="el-client">Nome cliente</label>
        <input id="el-client" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. ROSSI MARIO" />
      </div>
      <div className="row lv-field">
        <label htmlFor="el-title">Titolo (facoltativo)</label>
        <input id="el-title" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Buono viaggio 2026" />
      </div>
      <p style={{ fontSize: 12, color: "var(--lv-muted)", marginTop: 4 }}>
        Il nome cliente è condiviso: se il cliente ha più liste, la modifica vale per tutte.
      </p>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Salvo…" : "Salva modifiche"}
        </button>
      </div>
    </LvOverlay>
  );
}

// ─── Modifica di un movimento già registrato ───────────────────────────────
// Form completo in modale: i campi in riga (modifica in linea) su schermo
// stretto non ci stanno tutti, questa è la via utilizzabile anche da telefono.
export function EditMovimentoModal({ movimento, onSave, onClose }) {
  const [data, setData] = useState(movimento.data_movimento);
  const [desc, setDesc] = useState(movimento.descrizione);
  const [segno, setSegno] = useState(Number(movimento.importo) < 0 ? -1 : 1);
  const [imp, setImp] = useState(Math.abs(Number(movimento.importo)).toFixed(2).replace(".", ","));
  const [metodo, setMetodo] = useState(movimento.metodo || null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    const importo = parseImporto(imp, segno);
    if (!data || !desc.trim() || importo === null) {
      return onSave.onError("Compila data, descrizione e importo");
    }
    setSaving(true);
    const ok = await onSave.run({ id: movimento.id, data, descrizione: desc.trim(), importo, metodo });
    if (!ok) setSaving(false);
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Modifica movimento</h2>
      <div className="row lv-field">
        <label htmlFor="ed-data">Data</label>
        <input id="ed-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </div>
      <div className="row lv-field">
        <label htmlFor="ed-desc">Descrizione</label>
        <input id="ed-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="row lv-field">
        <label>Tipo</label>
        <SegnoSeg segno={segno} onChange={setSegno} />
      </div>
      <div className="row lv-field">
        <label htmlFor="ed-imp">Importo €</label>
        <input id="ed-imp" inputMode="decimal" value={imp} onChange={(e) => setImp(e.target.value)} />
      </div>
      <div className="row lv-field">
        <label htmlFor="ed-met">Metodo</label>
        <MetodoSelect id="ed-met" value={metodo} onChange={setMetodo} />
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Salvo…" : "Salva modifiche"}
        </button>
      </div>
    </LvOverlay>
  );
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
      <div className="lv-form-grid" style={{ marginBottom: 14 }}>
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
      <button className="lv-btn sm" style={{ marginTop: 6 }} onClick={() => setRows((rs) => [...rs, emptyBulkRow()])}>
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

export { SegnoSeg, MetodoSelect };
