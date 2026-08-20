// src/components/modals/bulk/DuplicateTab.jsx
// Duplicazione di task esistenti, con spostamento delle scadenze.
import { useState, useEffect, useRef } from "react";
import { formatDate } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { bulkInputStyle, bulkBtnPrimary, bulkBtnGhost, bulkIconBtnSmall } from "./bulkStyles.js";
import {
  colGap14, colGap2F12, rowCenterBetween2, rowGap8, txtBoldDanger, txtF10Bold, txtF11Muted,
  txtF13Bold, txtF14,
} from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const gridGap10R10 = { background: "var(--surface2)", borderRadius: 10, padding: "12px 14px", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 };
const txtF10Muted = { fontSize: 10, color: "var(--text-muted)", marginTop: 3 };
const boxR10 = { maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 };
const txtF13Muted = { padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 };
const cursor2 = { cursor: "pointer" };
const txtF105Bold = { fontSize: 10.5, color: "var(--success)", fontWeight: 600, marginTop: 3 };
const rowCenterGap4 = { display: "flex", alignItems: "center", gap: 4 };
const txtF13Bold2 = { fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" };


// ─── BULK: DUPLICATE TAB ───────────────────────────────────────────────────
export const DuplicateTab = ({ tasks, onCreate, onClose, onCancel, onDirty }) => {
  const { categories } = useAppData();
  const [selected, setSelected] = useState({});
  const [titleSuffix, setTitleSuffix] = useState(" (copia)");
  const [dayOffset, setDayOffset] = useState(0);
  const [search, setSearch] = useState("");
  // Il freno vero al doppio invio è `busyRef`, non lo stato `busy` (stesso
  // caso descritto in hooks/useSalvataggio.js e in ManualTab): fra due tap
  // ravvicinati sul bottone React può non aver ancora ri-renderizzato il
  // bottone disabilitato, e un controllo basato solo sullo stato lascia
  // partire due batch di duplicazione identici.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id) => setSelected(s => {
    const next = { ...s };
    if (next[id]) delete next[id]; else next[id] = 1;
    return next;
  });
  const setCount = (id, n) => setSelected(s => ({ ...s, [id]: Math.max(1, n) }));

  const filtered = tasks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.client?.toLowerCase().includes(search.toLowerCase())
  );
  const totalCount = Object.values(selected).reduce((a, c) => a + (c || 0), 0);

  useEffect(() => { onDirty?.(totalCount > 0); }, [totalCount, onDirty]);

  // Scadenza risultante dopo l'offset (relativo alla scadenza originale, non a
  // oggi): usata per l'anteprima sotto ogni task selezionato.
  const resultingDue = (src) => {
    if (!src.dueDate) return "senza scadenza";
    if (!dayOffset) return formatDate(src.dueDate);
    const d = new Date(src.dueDate);
    d.setDate(d.getDate() + dayOffset);
    return formatDate(d.toISOString());
  };

  const handleCreate = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const newTasks = [];
    Object.entries(selected).forEach(([taskId, count]) => {
      const src = tasks.find(t => t.id === taskId);
      if (!src) return;
      for (let i = 0; i < count; i++) {
        let due = src.dueDate;
        if (due && dayOffset) {
          const d = new Date(due);
          d.setDate(d.getDate() + dayOffset);
          due = d.toISOString();
        }
        newTasks.push({
          ...src,
          // UUID come in ManualTab: gli id "t<timestamp>-<n>" venivano comunque
          // riscritti dal dispatch, quindi l'id mostrato in UI non era quello
          // salvato sul DB finché non arrivava il refresh.
          id: crypto.randomUUID(),
          title: src.title + titleSuffix + (count > 1 ? ` ${i + 1}` : ""),
          status: "todo",
          comments: [],
          dueDate: due,
        });
      }
    });
    if (!newTasks.length) { busyRef.current = false; return; }
    setBusy(true);
    setError("");
    const result = await onCreate(newTasks);
    if (result && result.error) {
      setError(`Creazione non riuscita: ${result.error.message || "errore sconosciuto"}. Le selezioni sono ancora qui, riprova.`);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    busyRef.current = false;
    setBusy(false);
    onClose();
  };

  return (
    <div style={colGap14}>
      <div style={gridGap10R10}>
        <div>
          <div style={txtF10Bold}>TESTO DA AGGIUNGERE AL TITOLO</div>
          <input value={titleSuffix} onChange={e => setTitleSuffix(e.target.value)} placeholder=" (copia)" style={bulkInputStyle} />
          <div style={txtF10Muted}>Aggiunto in fondo al titolo di ogni copia</div>
        </div>
        <div>
          <div style={txtF10Bold}>SPOSTA LA SCADENZA DI (giorni)</div>
          <input type="number" value={dayOffset} onChange={e => setDayOffset(parseInt(e.target.value) || 0)} style={bulkInputStyle} />
          <div style={txtF10Muted}>+7 = una settimana dopo l'originale, −3 = tre giorni prima</div>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cerca task da duplicare..." style={{ ...bulkInputStyle, padding: "9px 12px" }} />

      <div style={boxR10}>
        {filtered.length === 0 ? (
          <div style={txtF13Muted}>Nessun task trovato</div>
        ) : filtered.map(t => {
          const count = selected[t.id] || 0;
          const isSel = count > 0;
          return (
            <div key={t.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              background: isSel ? "rgba(212,168,67,0.08)" : "transparent",
              cursor: "pointer",
            }} onClick={() => toggle(t.id)}>
              <input type="checkbox" checked={isSel} readOnly style={cursor2} />
              <span style={txtF14}>{categories[t.category]?.icon}</span>
              <div className="vd-flex-1-min0">
                <div style={txtF13Bold}>{t.title}</div>
                <div style={txtF11Muted}>
                  {categories[t.category]?.label} • {t.client || "—"} • {formatDate(t.dueDate)}
                </div>
                {isSel && (
                  <div style={txtF105Bold}>
                    → {t.title}{titleSuffix}{count > 1 ? ` 1…${count}` : ""} · scad. {resultingDue(t)}
                  </div>
                )}
              </div>
              {isSel && (
                <div style={rowCenterGap4} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setCount(t.id, count - 1)} disabled={count <= 1} style={{ ...bulkIconBtnSmall, opacity: count <= 1 ? 0.4 : 1 }}>−</button>
                  <span style={txtF13Bold2}>{count}</span>
                  <button onClick={() => setCount(t.id, count + 1)} style={bulkIconBtnSmall}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={rowCenterBetween2}>
        <div style={colGap2F12}>
          <span>{totalCount} copie da creare</span>
          {error && <span style={txtBoldDanger}>{error}</span>}
        </div>
        <div style={rowGap8}>
          <button onClick={onCancel || onClose} disabled={busy} style={{ ...bulkBtnGhost, opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}>Annulla</button>
          <button onClick={handleCreate} disabled={totalCount === 0 || busy} style={{
            ...bulkBtnPrimary,
            opacity: (totalCount === 0 || busy) ? 0.5 : 1,
            cursor: (totalCount === 0 || busy) ? "not-allowed" : "pointer",
          }}>{busy ? "⏳ Creazione…" : `✓ Crea ${totalCount} copie`}</button>
        </div>
      </div>
    </div>
  );
};
