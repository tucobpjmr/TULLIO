// src/components/tasks/bulk/DuplicateTab.jsx
// Duplicazione di task esistenti, con spostamento delle scadenze.
import { useState, useEffect } from "react";
import { useSalvataggio } from "../../../hooks/useSalvataggio.js";
import { formatDate } from "../../../lib/taskUtils.js";
import { nuovoTask } from "../../../lib/tasks/nuovoTask.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { bulkInputStyle, bulkBtnPrimary, bulkBtnGhost, bulkIconBtnSmall } from "./bulkStyles.js";
import * as stiliComuni from "../../../styles/common.js";

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

  // Le copie da creare: funzione PURA di `selected`/`tasks`/suffisso/offset.
  // Sta fuori dal salvataggio perché serve anche al chiamante, che sul suo
  // risultato decide se c'è una scrittura da avviare (vedi handleCreate).
  const costruisciCopie = () => {
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
        // I campi da copiare sono NOMINATI, non ereditati da uno spread di
        // `src`. Prima era `{ ...src, … }`, che si portava dietro anche ciò che
        // descrive la VITA della task sorgente e non il suo contenuto:
        // `completedAt` in testa — duplicare una task conclusa produceva una
        // copia `status: "todo"` con una data di completamento addosso. Sul
        // server non si vedeva (`toDbTask` non scrive mai `completed_at`, lo
        // gestisce il trigger), ma la copia ottimistica a schermo sì, fino al
        // primo refetch. Con i campi nominati la domanda "cosa si duplica" ha
        // una risposta leggibile invece di essere "tutto tranne quello che mi
        // ricordo di sovrascrivere".
        newTasks.push(nuovoTask({
          title: src.title + titleSuffix + (count > 1 ? ` ${i + 1}` : ""),
          category: src.category,
          priority: src.priority,
          assignees: src.assignees,
          client: src.client,
          praticaRef: src.praticaRef,
          contact: src.contact,
          estimatedHours: src.estimatedHours,
          description: src.description,
          dueDate: due,
        }));
      }
    });
    return newTasks;
  };

  // Il freno al doppio invio, l'attesa a schermo e il «le selezioni sono
  // ancora qui» vengono da useSalvataggio (A-2 dell'audit del 23 agosto,
  // secondo passaggio): erano `busyRef` + `busy` + `error` scritti a mano, con
  // il teardown ricopiato in tre punti di uscita e nessun try — un throw di
  // `onCreate` lasciava `busyRef` a `true` per sempre, cioè la modale viva col
  // bottone spento e nessun messaggio.
  const { salva, inVolo: busy, errore: error } = useSalvataggio(
    (newTasks) => onCreate(newTasks),
    {
      alSuccesso: onClose,
      messaggioErrore: (e) =>
        `Creazione non riuscita: ${e?.message || "errore sconosciuto"}. Le selezioni sono ancora qui, riprova.`,
    },
  );

  // Zero copie da creare non è né un successo né un errore: è "non c'è niente
  // da fare", e resta un no-op silenzioso come prima. Il caso si raggiunge
  // solo se una task selezionata è sparita da `tasks` nel frattempo — il
  // bottone è già disabilitato a selezione vuota. Il guard sta QUI e non
  // dentro `esegui` perché per useSalvataggio un ritorno senza errore è un
  // successo, e chiuderebbe la modale senza aver scritto nulla.
  const handleCreate = () => {
    const newTasks = costruisciCopie();
    if (!newTasks.length) return;
    return salva(newTasks);
  };

  return (
    <div style={stiliComuni.colGap14}>
      <div style={gridGap10R10}>
        <div>
          <div style={stiliComuni.txtF10Bold}>TESTO DA AGGIUNGERE AL TITOLO</div>
          <input value={titleSuffix} onChange={e => setTitleSuffix(e.target.value)} placeholder=" (copia)" style={bulkInputStyle} />
          <div style={txtF10Muted}>Aggiunto in fondo al titolo di ogni copia</div>
        </div>
        <div>
          <div style={stiliComuni.txtF10Bold}>SPOSTA LA SCADENZA DI (giorni)</div>
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
              <span style={stiliComuni.txtF14}>{categories[t.category]?.icon}</span>
              <div className="vd-flex-1-min0">
                <div style={stiliComuni.txtF13Bold}>{t.title}</div>
                <div style={stiliComuni.txtF11Muted}>
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

      <div style={stiliComuni.rowCenterBetween2}>
        <div style={stiliComuni.colGap2F12}>
          <span>{totalCount} copie da creare</span>
          {error && <span style={stiliComuni.txtBoldDanger}>{error}</span>}
        </div>
        <div style={stiliComuni.rowGap8}>
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
