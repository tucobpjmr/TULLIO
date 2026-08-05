// src/components/modals/bulk/DuplicateTab.jsx
// Duplicazione di task esistenti, con spostamento delle scadenze.
import { useState, useEffect } from "react";
import { formatDate } from "../../../lib/taskUtils.js";
import { CATEGORIES } from "../../../state/appGlobals.js";
import { bulkInputStyle, bulkBtnPrimary, bulkBtnGhost, bulkIconBtnSmall } from "./bulkStyles.js";


// ─── BULK: DUPLICATE TAB ───────────────────────────────────────────────────
export const DuplicateTab = ({ tasks, onCreate, onClose, onCancel, onDirty }) => {
  const [selected, setSelected] = useState({});
  const [titleSuffix, setTitleSuffix] = useState(" (copia)");
  const [dayOffset, setDayOffset] = useState(0);
  const [search, setSearch] = useState("");
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
    if (busy) return;
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
    if (!newTasks.length) return;
    setBusy(true);
    setError("");
    const result = await onCreate(newTasks);
    if (result && result.error) {
      setError(`Creazione non riuscita: ${result.error.message || "errore sconosciuto"}. Le selezioni sono ancora qui, riprova.`);
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>TESTO DA AGGIUNGERE AL TITOLO</div>
          <input value={titleSuffix} onChange={e => setTitleSuffix(e.target.value)} placeholder=" (copia)" style={bulkInputStyle} />
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>Aggiunto in fondo al titolo di ogni copia</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>SPOSTA LA SCADENZA DI (giorni)</div>
          <input type="number" value={dayOffset} onChange={e => setDayOffset(parseInt(e.target.value) || 0)} style={bulkInputStyle} />
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>+7 = una settimana dopo l'originale, −3 = tre giorni prima</div>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cerca task da duplicare..." style={{ ...bulkInputStyle, padding: "9px 12px" }} />

      <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nessun task trovato</div>
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
              <input type="checkbox" checked={isSel} readOnly style={{ cursor: "pointer" }} />
              <span style={{ fontSize: 14 }}>{CATEGORIES[t.category]?.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {CATEGORIES[t.category]?.label} • {t.client || "—"} • {formatDate(t.dueDate)}
                </div>
                {isSel && (
                  <div style={{ fontSize: 10.5, color: "var(--success)", fontWeight: 600, marginTop: 3 }}>
                    → {t.title}{titleSuffix}{count > 1 ? ` 1…${count}` : ""} · scad. {resultingDue(t)}
                  </div>
                )}
              </div>
              {isSel && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setCount(t.id, count - 1)} disabled={count <= 1} style={{ ...bulkIconBtnSmall, opacity: count <= 1 ? 0.4 : 1 }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{count}</span>
                  <button onClick={() => setCount(t.id, count + 1)} style={bulkIconBtnSmall}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
          <span>{totalCount} copie da creare</span>
          {error && <span style={{ color: "var(--danger)", fontWeight: 600 }}>{error}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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
