// ─── DATE TIME PICKER ────────────────────────────────────────────────────
// Sostituisce l'input nativo <input type="datetime-local">: il calendario
// nativo del browser mostra un link "Oggi" ma nessuna conferma esplicita
// della selezione. Qui l'utente sceglie giorno/ora nel popover e conferma
// con "OK" (o annulla il valore con "Cancella"), senza scorciatoia "Oggi".
//
// Impaginazione: su schermi larghi il pannello è un dropdown ancorato al
// campo (a sinistra o a destra secondo `align`) e riportato dentro i bordi
// del contenitore quando lì sforerebbe. Su mobile diventa una card centrata
// con backdrop, così non sfora mai il margine destro e non provoca scroll
// orizzontale. La selezione dell'ora usa due select compatte (ore / minuti)
// invece dell'<input type="time">, che aprirebbe l'orologio nativo del
// browser — anch'esso soggetto a sforare fuori dallo schermo su mobile.
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Z } from "../../styles/tokens.js";

const WEEKDAYS = ["lu", "ma", "me", "gi", "ve", "sa", "do"];
const pad2 = n => String(n).padStart(2, "0");
const monthLabel = d => d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

// Come il campo mostra un valore selezionato. Esportata perché chi deve
// esibire una data *ereditata* senza selezionarla davvero (es. la scadenza
// comune di BulkTaskCreator, mostrata come placeholder nelle righe che non la
// sovrascrivono) la deve rendere identica a una data impostata: duplicare il
// formato qui porterebbe le due viste a divergere alla prima modifica.
export const formatPickerValue = (value, withTime = true) => {
  if (!value) return "";
  const d = new Date(value);
  const date = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  return withTime
    ? `${date} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
    : date;
};

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

// Ore 00→23 e minuti a passi di 5 (00,05,…,55): liste corte e comode al tocco.
const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad2(i * 5));

// Larghezza del dropdown desktop e distanza minima dai bordi del contenitore.
const PANEL_W = 260;
const PANEL_MARGIN = 8;

// Scostamento orizzontale del pannello rispetto al bordo sinistro del campo,
// in px. Parte dal lato preferito (`align`) e riporta il pannello dentro
// [boundsLeft, boundsRight] quando lì sforerebbe. Tutta la geometria del
// posizionamento sta qui — il resto è solo misurazione del DOM — così è
// verificabile senza simulare un layout.
export function computePanelOffset({ fieldLeft, fieldRight, boundsLeft, boundsRight, align, panelW = PANEL_W }) {
  const ideal = align === "right" ? fieldRight - panelW : fieldLeft;
  // Il limite destro è applicato prima di quello sinistro: se il contenitore
  // è più stretto del pannello vince l'ancoraggio a sinistra, così restano
  // visibili i controlli del mese invece del lato destro del calendario.
  const x = Math.max(boundsLeft, Math.min(ideal, boundsRight - panelW));
  return x - fieldLeft;
}

// Bordi orizzontali entro cui il pannello deve stare: intersezione tra il
// viewport e il box di CONTENUTO di ogni antenato che ritaglia (overflow
// diverso da visible, es. il corpo scrollabile di un modale). Guardare solo
// il viewport non bastava: dentro un modale il pannello restava dentro la
// finestra ma sforava il bordo destro del modale e, siccome un overflow in
// `auto` su un asse rende `auto` anche l'altro, comparivano bordo tagliato e
// scroll orizzontale (caso del campo SCADENZA nella colonna destra di
// "Nuovo Task"). Il box di contenuto — non quello di padding — allinea il
// pannello ai campi del form invece che al bordo del modale.
function getClipBounds(el) {
  let left = PANEL_MARGIN;
  let right = (typeof window !== "undefined" ? window.innerWidth : 0) - PANEL_MARGIN;
  for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
    const r = node.getBoundingClientRect();
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const br = parseFloat(cs.borderRightWidth) || 0;
    // La scrollbar verticale occupa spazio a destra dentro il bordo: senza
    // scalarla il pannello finirebbe parzialmente sotto di essa.
    const scrollbar = Math.max(0, node.offsetWidth - node.clientWidth - bl - br);
    left = Math.max(left, r.left + bl + (parseFloat(cs.paddingLeft) || 0));
    right = Math.min(right, r.right - br - scrollbar - (parseFloat(cs.paddingRight) || 0));
  }
  return { left, right };
}

// Breakpoint sotto il quale il pannello diventa una card centrata con backdrop.
const MOBILE_MAX = 640;
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_MAX
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_MAX);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

// `align`: lato di ancoraggio del popover ("left" | "right") — "right" serve
// quando il campo sta vicino al bordo destro di un modale e il popover
// verrebbe tagliato dall'overflow. `withTime`: se false il picker è solo-data
// (niente riga "Ora"); la conferma fissa mezzogiorno locale, come il filtro
// data della Dashboard, così la data non slitta di giorno tra fusi orari.
//
// Chiusura senza "OK" (click fuori, Escape, backdrop su mobile): il giorno
// eventualmente già scelto nel calendario viene APPLICATO, non buttato via.
// Prima veniva scartato in silenzio pur restando evidenziato in navy fino
// all'ultimo frame: nel BulkTaskCreator, dove si passa da un campo all'altro
// senza toccare "OK", le task nascevano senza scadenza ("la data inserita
// non persiste"). "Cancella" resta l'unico modo per azzerare una data.
export function DateTimePicker({ value, onChange, hasError, style, placeholder = "gg/mm/aaaa --:--", align = "left", withTime = true }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (value ? new Date(value) : new Date()));
  const [draftDay, setDraftDay] = useState(() => (value ? new Date(value) : null));
  const [draftTime, setDraftTime] = useState(() => {
    const d = value ? new Date(value) : null;
    return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "09:00";
  });
  const rootRef = useRef(null);
  const isMobile = useIsMobile();
  // `dismiss` sempre aggiornata per i listener su `document`: quelli sono
  // registrati una volta sola per apertura e senza questo rimando leggerebbero
  // una bozza stale, chiudendo il pannello senza vedere il giorno appena
  // scelto. Il ref viene riassegnato a ogni render (vedi più sotto).
  const dismissRef = useRef(null);
  // Scostamento orizzontale del dropdown desktop rispetto al campo.
  const [panelOffset, setPanelOffset] = useState(0);

  // All'apertura su desktop misura campo e contenitore e posiziona il pannello
  // dentro i bordi. useLayoutEffect (non useEffect) perché la misura deve
  // essere applicata PRIMA che il browser dipinga: con useEffect il pannello
  // lampeggerebbe per un frame nella posizione sforante.
  useLayoutEffect(() => {
    if (!open || isMobile) return;
    const place = () => {
      const el = rootRef.current;
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      const { left: boundsLeft, right: boundsRight } = getClipBounds(el);
      setPanelOffset(computePanelOffset({
        fieldLeft: rect.left, fieldRight: rect.right, boundsLeft, boundsRight, align,
      }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, isMobile, align]);

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
    const onDocClick = e => { if (rootRef.current && !rootRef.current.contains(e.target)) dismissRef.current(); };
    const onKey = e => { if (e.key === "Escape") dismissRef.current(); };
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

  const [draftH, draftM] = draftTime.split(":");
  // Se il minuto corrente non è multiplo di 5 (valori legacy) lo aggiungo alla
  // lista così resta selezionabile e non viene perso all'apertura.
  const minuteOptions = MINUTES.includes(draftM) ? MINUTES : [...MINUTES, draftM].sort();
  const setHour = h => setDraftTime(`${h}:${draftM}`);
  const setMinute = m => setDraftTime(`${draftH}:${m}`);

  // ISO della bozza corrente (null se non è stato scelto nessun giorno).
  const draftIso = () => {
    if (!draftDay) return null;
    const out = new Date(draftDay);
    if (withTime) {
      const [h, m] = draftTime.split(":").map(Number);
      out.setHours(h || 0, m || 0, 0, 0);
    } else {
      out.setHours(12, 0, 0, 0);
    }
    return out.toISOString();
  };

  const confirm = () => {
    onChange(draftIso());
    setOpen(false);
  };

  // Abbandono del pannello: applica il giorno scelto se ce n'è uno nuovo,
  // altrimenti lascia il valore com'era. Non azzera mai una data esistente —
  // per quello c'è "Cancella".
  const dismiss = () => {
    const iso = draftIso();
    const current = value ? new Date(value).toISOString() : null;
    if (iso && iso !== current) onChange(iso);
    setOpen(false);
  };
  dismissRef.current = dismiss;

  const clear = () => { onChange(null); setOpen(false); };

  const label = value ? formatPickerValue(value, withTime) : placeholder;

  // Contenuto del pannello (calendario + ora + azioni), condiviso tra il
  // dropdown desktop e la card centrata mobile.
  const panel = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          style={navBtnStyle}
          aria-label="Mese precedente"
        >‹</button>
        <span style={{ fontSize: 14, fontWeight: 700, textTransform: "capitalize" }}>{monthLabel(viewDate)}</span>
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
                fontSize: 13, padding: isMobile ? "9px 0" : "6px 0", borderRadius: 6,
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
          <select
            value={draftH}
            onChange={e => setHour(e.target.value)}
            aria-label="Ora"
            style={timeSelectStyle}
          >
            {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)" }}>:</span>
          <select
            value={draftM}
            onChange={e => setMinute(e.target.value)}
            aria-label="Minuti"
            style={timeSelectStyle}
          >
            {minuteOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={clear}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "6px 8px", fontFamily: "inherit" }}
        >Cancella</button>
        <button
          type="button"
          onClick={confirm}
          style={{
            background: "var(--navy)", color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >OK</button>
      </div>
    </>
  );

  return (
    <div ref={rootRef} style={{ position: "relative", ...style }}>
      <button
        type="button"
        onClick={() => (open ? dismiss() : setOpen(true))}
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

      {open && (isMobile ? (
        // Mobile: card centrata a schermo con backdrop — sempre dentro i
        // margini, niente scroll orizzontale.
        <div
          onMouseDown={e => { if (e.target === e.currentTarget) dismiss(); }}
          style={{
            position: "fixed", inset: 0, zIndex: Z.datePicker,
            background: "rgba(0,0,0,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div style={{
            width: "min(320px, 100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto",
            background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
            boxShadow: "0 20px 50px rgba(0,0,0,0.30)", padding: 16,
          }}>
            {panel}
          </div>
        </div>
      ) : (
        // Desktop: dropdown ancorato al campo e rientrato quando il lato
        // preferito lo farebbe sforare oltre il contenitore.
        <div style={{
          position: "absolute", top: "100%", left: panelOffset,
          marginTop: 6, zIndex: Z.swipePanel,
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)", padding: 12, width: PANEL_W,
        }}>
          {panel}
        </div>
      ))}
    </div>
  );
}

const navBtnStyle = {
  background: "none", border: "none", cursor: "pointer", fontSize: 18,
  color: "var(--text-muted)", padding: "4px 12px", borderRadius: 6, fontFamily: "inherit",
};

const timeSelectStyle = {
  border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px",
  fontSize: 13, fontFamily: "inherit", background: "var(--card)",
  color: "var(--text)", cursor: "pointer",
};
