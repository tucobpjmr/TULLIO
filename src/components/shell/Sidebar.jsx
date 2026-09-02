// ─── SIDEBAR ─────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f). BottomNav e gli helper condivisi
// (NAV_ITEMS/getNavItemsForRole/getNavBadges, NavBadge) sono stati spostati
// in file propri (B-3 dell'audit del 13 agosto: un file, un componente —
// vedi docs/CLAUDE.md, e BottomNav.jsx/navHelpers.js/NavBadge.jsx qui accanto).
import { useEffect, useRef, useState, memo } from "react";
import { useViewport } from "../ui/Viewport.jsx";
import { useAppData } from "../../state/AppDataContext.jsx";
import { getNavItemsForRole, getNavBadges } from "./navHelpers.js";
import { NavBadge } from "./NavBadge.jsx";
import { Icona } from "../ui/Icona.jsx";
import { useDispatch } from "../../state/DispatchContext.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const whiteSpace2 = { whiteSpace: "nowrap", overflow: "hidden" };
const marginTop2 = { marginTop: "auto", padding: "16px 12px", borderTop: "1px solid rgba(15,32,68,0.12)" };
const txtF10Mb8 = { fontSize: 10, color: "rgba(15,32,68,0.65)", letterSpacing: 1, marginBottom: 8 };
const rowGap4 = { display: "flex", flexWrap: "wrap", gap: 4 };
const boxAbsoluteW7 = { position: "absolute", bottom: 0, right: 0, width: 7, height: 7, borderRadius: "50%", background: "#2D7A4F", border: "1px solid var(--sky)" };

// ST-2: `activeView` invece di `state`, e `memo`. Team e utente corrente
// arrivano da AppDataContext, dov'erano già.
//
// Il guadagno è concreto e misurato: prima ogni carattere digitato nella
// ricerca della Topbar ri-renderizzava questa nav insieme a tutto il resto.
// Ora la nav si ri-renderizza solo quando cambia la voce attiva o il team
// (per il badge "in attesa"). Blindato da src/test/memoViste.test.jsx.
//
// `collapsed` è `useState` locale (audit ST-2 parte 2): nessun altro
// componente lo legge — BottomNav non lo riceve, VoyageDesk non lo passa più —
// quindi non c'è motivo per cui debba sopravvivere fuori da questo file, né
// per cui debba invalidare l'identità di `state` ad ogni resize.
export const Sidebar = memo(function Sidebar({ activeView, onOpenBulk, onOpenChat, unreadChat = 0 }) {
  const dispatch = useDispatch();
  const { isDesktop, width } = useViewport();
  const { team, getAssignableTeam, io } = useAppData();
  const [collapsed, setCollapsed] = useState(false);
  // Auto-collassa la sidebar nella fascia "desktop stretto" (1025–1280px) dove
  // 210px di nav rubano troppo spazio orizzontale; si ri-espande sopra i 1280px.
  // Guardia per banda: agisce solo sulle transizioni, così il toggle manuale
  // dentro la stessa banda non viene contrastato.
  const prevBandRef = useRef(null);
  useEffect(() => {
    if (!isDesktop) { prevBandRef.current = null; return; }
    const band = width <= 1280 ? "narrow" : "wide";
    const prev = prevBandRef.current;
    prevBandRef.current = band;
    if (prev === band) return;
    if (band === "narrow" && !collapsed) {
      setCollapsed(true);
    } else if (band === "wide" && prev !== null && collapsed) {
      setCollapsed(false);
    }
  }, [width, isDesktop, collapsed]);
  if (!isDesktop) return null;
  const col = collapsed;
  const navItems = getNavItemsForRole(io.ruolo());
  const badges = getNavBadges(team);
  return (
    <div style={{
      width: col ? 60 : 210, background: "var(--sky)", color: "var(--navy)",
      display: "flex", flexDirection: "column",
      transition: "width 0.25s ease", flexShrink: 0,
      borderRight: "1px solid rgba(212,168,67,0.3)", position: "relative",
    }}>
      <button onClick={() => setCollapsed(c => !c)} style={{
        position: "absolute", top: 12, right: col ? "50%" : 8,
        transform: col ? "translateX(50%)" : "none",
        background: "rgba(15,32,68,0.09)", border: "1px solid rgba(15,32,68,0.18)",
        borderRadius: 6, width: 24, height: 24, cursor: "pointer", color: "rgba(15,32,68,0.7)",
        fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s",
      }}>{col ? "→" : "←"}</button>

      <div style={{ marginTop: 48, padding: col ? "0 8px" : "0 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map(item => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => dispatch({ type: "SET_VIEW", payload: item.id })}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: col ? "10px 8px" : "10px 12px",
              borderRadius: 8, cursor: "pointer", border: "none",
              background: active ? "rgba(212,168,67,0.18)" : "transparent",
              color: active ? "var(--navy)" : "rgba(15,32,68,0.8)",
              fontSize: 14, fontWeight: active ? 600 : 400,
              transition: "all 0.2s", textAlign: "left",
              borderLeft: active ? "2px solid var(--gold)" : "2px solid transparent",
              position: "relative",
            }}>
              <Icona nome={item.icon} dimensione={17} />
              {!col && <span style={whiteSpace2}>{item.label}</span>}
              <NavBadge count={badges[item.id] || 0} collapsed={col} />
            </button>
          );
        })}

        {/* Chat team (spostata dalla Topbar) */}
        <button
          onClick={onOpenChat}
          title="Messaggi team"
          aria-label="Messaggi team"
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: col ? "10px 8px" : "10px 12px",
            borderRadius: 8, cursor: "pointer", border: "none",
            background: "transparent", color: "rgba(15,32,68,0.8)",
            fontSize: 14, fontWeight: 400, transition: "all 0.2s", textAlign: "left",
            borderLeft: "2px solid transparent", position: "relative",
            justifyContent: col ? "center" : "flex-start",
          }}
        >
          <Icona nome="chat" dimensione={17} />
          {!col && <span style={whiteSpace2}>Chat</span>}
          <NavBadge count={unreadChat} collapsed={col} />
        </button>

        {/* Azione: crea più task / import / template (spostata dal FAB secondario) */}
        <button
          onClick={onOpenBulk}
          title="Crea più task / Import / Template"
          aria-label="Crea più task"
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: col ? "10px 8px" : "10px 12px", marginTop: 8,
            borderRadius: 8, cursor: "pointer",
            border: "1px solid rgba(212,168,67,0.4)",
            background: "rgba(212,168,67,0.12)",
            color: "var(--gold)", fontSize: 14, fontWeight: 600,
            transition: "all 0.2s", textAlign: "left",
            justifyContent: col ? "center" : "flex-start",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(212,168,67,0.22)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(212,168,67,0.12)"; }}
        >
          <Icona nome="piuTask" dimensione={17} />
          {!col && <span style={whiteSpace2}>Più task</span>}
        </button>
      </div>

      {!col && (
        <div style={marginTop2}>
          <div style={txtF10Mb8}>TEAM ONLINE</div>
          <div style={rowGap4}>
            {getAssignableTeam().slice(0, 4).map(m => (
              <div key={m.id} title={m.name} style={{
                width: 26, height: 26, borderRadius: "50%", background: m.color,
                fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#fff", border: "2px solid var(--sky)",
                position: "relative"
              }}>
                {m.avatar}
                <div style={boxAbsoluteW7} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
