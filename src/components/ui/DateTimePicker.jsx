// ─── DATE TIME PICKER ────────────────────────────────────────────────────
// Sostituisce l'input nativo <input type="datetime-local">: il calendario
// nativo del browser mostra un link "Oggi" ma nessuna conferma esplicita
// della selezione. Qui l'utente sceglie giorno/ora nel popover e conferma
// con "OK" (o annulla il valore con "Cancella"), senza scorciatoia "Oggi".
import { useState, useRef, useEffect } from "react";

const WEEKDAYS = ["lu", "ma", "me", "gi", "ve", "sa", "do"];
const pad2 = n => String(n).padStart(2, "0");
const monthLabel = d => d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

// Griglia di 42 celle (6 settimane, lu→do) che copre il mese di `viewDate`.
function buildMonthGrid(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // getDay(): 0=dom..6=sab → lu=0..do=6
  const gridStart = new Date(year, month, 1 - startOffset);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

const sameDay = (a, b) => !!a && !!b &&
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// `align`: lato di ancoraggio del popover ("left" | "right") — "right" serve
// quando il campo sta vicino al bordo destro di un modale e il popover
// verrebbe tagliato dall'overflow. `withTime`: se false il picker è solo-data
// (niente riga "Ora"); la conferma fissa mezzogiorno locale, come il filtro
// data della Dashboard, così la data non slitta di giorno tra fusi orari.
export function DateTimePicker({ value, onChange, hasError, style, placeholder = "gg/mm/aaaa --:--", align = "left", withTime = true }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (value ? new Date(value) : new Date()));
  const [draftDay, setDraftDay] = useState(() => (value ? new Date(value) : null));
  const [draftTime, setDraftTime] = useState(() => {
    const d = value ? new Date(value) : null;
    return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "09:00";
  });
  const rootRef = useRef(null);

  // Riallinea la bozza al valore corrente ogni volta che il popover si apre.
  useEffect(() => {
    if (!open) return;
    const d = value ? new Date(value) : null;
    setViewDate(d || new Date());
    setDraftDay(d);
    setDraftTime(d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "09:00");
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const days = buildMonthGrid(viewDate);
  const currentMonth = viewDate.getMonth();
  const today = new Date();

  const confirm = () => {
    if (!draftDay) { onChange(null); setOpen(false); return; }
    const out = new Date(draftDay);
    if (withTime) {
      const [h, m] = draftTime.split(":").map(Number);
      out.setHours(h || 0, m || 0, 0, 0);
    } else {
      out.setHours(12, 0, 0, 0);
    }
    onChange(out.toISOString());
    setOpen(false);
  };

  const clear = () => { onChange(null); setOpen(false); };

  const label = value
    ? withTime
      ? `${new Date(value).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })} ${new Date(value).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
      : new Date(value).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
    : placeholder;

  return (
    <div ref={rootRef} style={{ position: "relative", ...style }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", textAlign: "left", border: `1px solid ${hasError ? "var(--danger)" : "var(--border)"}`,
          borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit",
          background: hasError ? "#FFF5F5" : "var(--card)",
          color: hasError ? "var(--danger)" : value ? "var(--text)" : "var(--text-muted)",
          fontWeight: hasError ? 600 : 400, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        }}
      >
        <span>{label}</span>
        <span aria-hidden="true" style={{ opacity: 0.6 }}>📅</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", ...(align === "right" ? { right: 0 } : { left: 0 }),
          marginTop: 6, zIndex: 30,
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)", padding: 12, width: 260,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              style={navBtnStyle}
              aria-label="Mese precedente"
            >‹</button>
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: "capitalize" }}>{monthLabel(viewDate)}</span>
            <button
              type="button"
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              style={navBtnStyle}
              aria-label="Mese successivo"
            >›</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {WEEKDAYS.map(w => (
              <div key={w} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textAlign: "center", padding: "2px 0" }}>{w}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 10 }}>
            {days.map(d => {
              const outside = d.getMonth() !== currentMonth;
              const isToday = sameDay(d, today);
              const isSelected = sameDay(d, draftDay);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => setDraftDay(d)}
                  style={{
                    fontSize: 12, padding: "5px 0", borderRadius: 6,
                    border: isToday && !isSelected ? "1px solid var(--border)" : "1px solid transparent",
                    background: isSelected ? "var(--navy)" : "transparent",
                    color: isSelected ? "#fff" : outside ? "var(--text-muted)" : "var(--text)",
                    opacity: outside ? 0.45 : 1,
                    cursor: "pointer", fontFamily: "inherit", fontWeight: isSelected || isToday ? 700 : 400,
                  }}
                >{d.getDate()}</button>
              );
            })}
          </div>

          {withTime && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Ora</span>
              <input
                type="time"
                value={draftTime}
                onChange={e => setDraftTime(e.target.value)}
                style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "inherit" }}
              />
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              onClick={clear}
              style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 6px", fontFamily: "inherit" }}
            >Cancella</button>
            <button
              type="button"
              onClick={confirm}
              style={{
                background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8,
                padding: "6px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >OK</button>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle = {
  background: "none", border: "none", cursor: "pointer", fontSize: 16,
  color: "var(--text-muted)", padding: "2px 8px", borderRadius: 6, fontFamily: "inherit",
};
