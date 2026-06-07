// ─── SWIPE ACTIONS (mobile/tablet) ─────────────────────────────────────────
// Wrapper riusabile: swipe verso destra rivela 3 bottoni (Completato / Cestino / Inoltra).
// Soglia 40% larghezza card → si "blocca aperto". Tap fuori chiude.
// Su desktop è trasparente. Disabilitato anche se l'utente non può editare la task.
import React, { useState, useRef, useEffect } from "react";
import { useViewport } from "../contexts/ViewportContext.jsx";
import { CURRENT_USER } from "../data/mockData.js";
import { canEditTask } from "../utils/permissions.js";
import { getMember, getAssignableTeam } from "../utils/helpers.js";
import Avatar from "./ui/Avatar.jsx";

const SwipeActions = ({ task, dispatch, children, disabled = false }) => {
  const { isDesktop } = useViewport();
  const [offset, setOffset] = useState(0);          // px di traslazione attuale
  const [opened, setOpened] = useState(false);      // stato "aperto" (bottoni visibili)
  const [showForward, setShowForward] = useState(false);
  const containerRef = useRef(null);
  const startX = useRef(null);
  const startY = useRef(null);
  const tracking = useRef(false);
  const containerWidth = useRef(0);

  const OPEN_WIDTH = 210; // larghezza pannello bottoni rivelato (3 bottoni × 70)

  // Disabilita su desktop / disabilitato esplicitamente / no permessi di edit (v0.8)
  // Leggo il currentUserId dal globale (sincronizzato dal reducer).
  const canEdit = canEditTask(task, CURRENT_USER);
  const swipeEnabled = !isDesktop && !disabled && canEdit;

  // tap fuori per chiudere
  useEffect(() => {
    if (!opened) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpened(false);
        setOffset(0);
        setShowForward(false);
      }
    };
    document.addEventListener("touchstart", handler, { passive: true });
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("mousedown", handler);
    };
  }, [opened]);

  const onTouchStart = (e) => {
    if (!swipeEnabled) return;
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    tracking.current = false;
    containerWidth.current = containerRef.current?.offsetWidth || 300;
  };

  const onTouchMove = (e) => {
    if (!swipeEnabled || startX.current === null) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    // determina se è uno swipe orizzontale (più orizzontale che verticale)
    if (!tracking.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        tracking.current = true;
      } else {
        startX.current = null;
        return;
      }
    }

    // permetti solo swipe destro (dx > 0), max OPEN_WIDTH (+ piccolo overshoot)
    const newOffset = Math.max(0, Math.min(dx, OPEN_WIDTH + 30));
    setOffset(newOffset);
  };

  const onTouchEnd = () => {
    if (!swipeEnabled || startX.current === null) {
      startX.current = null;
      return;
    }
    const threshold = containerWidth.current * 0.4;
    if (offset >= threshold) {
      setOffset(OPEN_WIDTH);
      setOpened(true);
    } else {
      setOffset(0);
      setOpened(false);
    }
    startX.current = null;
    tracking.current = false;
  };

  const closeAndDo = (fn) => {
    setOpened(false);
    setOffset(0);
    setShowForward(false);
    setTimeout(fn, 50);
  };

  const handleComplete = (e) => {
    e.stopPropagation();
    closeAndDo(() => dispatch({ type: "MOVE_TASK", payload: { taskId: task.id, newStatus: "done" }, swipe: true }));
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    closeAndDo(() => dispatch({ type: "DELETE_TASK", payload: task.id, swipe: true }));
  };

  const handleForwardToggle = (e) => {
    e.stopPropagation();
    setShowForward(s => !s);
  };

  const handleForwardTo = (e, memberId) => {
    e.stopPropagation();
    const member = getMember(memberId);
    closeAndDo(() => dispatch({
      type: "UPDATE_TASK",
      payload: { id: task.id, assignees: [memberId] },
      swipe: true,
      toastMessage: `↪ Inoltrato a ${member?.name || memberId}`,
    }));
  };

  if (!swipeEnabled) {
    return <>{children}</>;
  }

  const assignable = getAssignableTeam();

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", overflow: "visible", touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pannello bottoni sotto la card (rivelato da sinistra) */}
      {offset > 0 && (
        <div
          style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: OPEN_WIDTH, display: "flex",
            borderRadius: 10, overflow: "hidden",
            boxShadow: "inset 0 0 0 1px var(--border)",
          }}
        >
          {/* Completato */}
          <button
            onClick={handleComplete}
            aria-label="Completato"
            style={{
              flex: 1, background: "var(--success)", color: "#fff", border: "none",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, padding: "0 4px",
            }}
          >
            <span style={{ fontSize: 20 }}>✓</span>
            <span>Fatto</span>
          </button>
          {/* Cestino */}
          <button
            onClick={handleDelete}
            aria-label="Cestino"
            style={{
              flex: 1, background: "var(--danger)", color: "#fff", border: "none",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, padding: "0 4px",
            }}
          >
            <span style={{ fontSize: 20 }}>🗑</span>
            <span>Cestino</span>
          </button>
          {/* Inoltra */}
          <button
            onClick={handleForwardToggle}
            aria-label="Inoltra"
            style={{
              flex: 1, background: "var(--gold)", color: "var(--navy)", border: "none",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, padding: "0 4px", position: "relative",
            }}
          >
            <span style={{ fontSize: 18 }}>↪</span>
            <span>Inoltra</span>
          </button>
        </div>
      )}

      {/* Forward menu (lista agenti) */}
      {showForward && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            zIndex: 30, background: "#fff",
            border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            minWidth: 200, maxHeight: 240, overflowY: "auto",
            padding: 6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", padding: "6px 10px 4px", letterSpacing: 0.5 }}>
            INOLTRA A
          </div>
          {assignable.map(m => (
            <button
              key={m.id}
              onClick={e => handleForwardTo(e, m.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", background: "transparent", border: "none",
                borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                color: "var(--text)", textAlign: "left",
              }}
              onMouseDown={e => e.currentTarget.style.background = "var(--surface2)"}
              onMouseUp={e => e.currentTarget.style.background = "transparent"}
            >
              <Avatar memberId={m.id} size={26} />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Card traslata */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: tracking.current ? "none" : "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)",
          position: "relative",
          zIndex: 2,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeActions;
