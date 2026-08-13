// Estratto da AdvancedSearchPanel.jsx (B-3 dell'audit del 13 agosto: un file,
// un componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
//
// Menù a tendina multi-selezione (Categoria/Status/Agente nel pannello Ricerca).
// Sostituisce i chip toggle: trigger compatto + pannello a scomparsa con checkbox.
import { useState, useRef, useEffect } from "react";
import { Z } from "../../styles/tokens.js";
import { relative } from "../../styles/common.js";

export const FilterDropdown = ({ options, selected, onToggle }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const count = selected.length;

  return (
    <div ref={ref} style={relative}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          width: "100%", padding: "7px 10px", borderRadius: 6,
          border: `1px solid ${count ? "var(--gold)" : "var(--border)"}`,
          background: "#fff", fontSize: 12, fontWeight: 600, color: "var(--text)",
          cursor: "pointer", fontFamily: "inherit", boxSizing: "border-box",
        }}
      >
        <span>{count ? `${count} selezionat${count === 1 ? "a" : "e"}` : "Tutte"}</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, minWidth: 200,
          maxHeight: 240, overflowY: "auto", background: "#fff",
          border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 12px 30px rgba(0,0,0,0.15)", zIndex: Z.panelRaised, padding: 6,
        }}>
          {options.map(opt => {
            const active = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                  borderRadius: 6, cursor: "pointer", fontSize: 12,
                  background: active ? "var(--surface2)" : "transparent",
                }}
              >
                <input type="checkbox" checked={active} onChange={() => onToggle(opt.value)} />
                {opt.icon}
                {opt.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};
