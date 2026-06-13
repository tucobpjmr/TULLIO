import { useState } from "react";

import { ManualTab } from "./ManualTab.jsx";
import { DuplicateTab } from "./DuplicateTab.jsx";
import { ImportTab } from "./ImportTab.jsx";
import { TemplateTab } from "./TemplateTab.jsx";

// ─── BULK TASK CREATOR (modale principale) ─────────────────────────────────
export const BulkTaskCreator = ({ existingTasks, onCreate, onClose }) => {
  const [tab, setTab] = useState("manual");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20,
    }}>
      <div className="slide-up" style={{
        background: "#fff", borderRadius: 16, width: 820, maxWidth: "100%",
        maxHeight: "92vh", display: "flex", flexDirection: "column",
        boxShadow: "0 30px 80px rgba(0,0,0,0.25)", border: "1px solid var(--border)", overflow: "hidden",
      }}>
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📑</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>Crea più task</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 1.2, marginTop: 2 }}>MANUALE · DUPLICA · IMPORT · TEMPLATE</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
          {[
            { id: "manual", icon: "✏️", label: "Manuale" },
            { id: "duplicate", icon: "🔁", label: "Duplica" },
            { id: "import", icon: "📥", label: "Importa file" },
            { id: "template", icon: "📋", label: "Da template" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "12px 8px", background: tab === t.id ? "#fff" : "transparent",
              border: "none", borderBottom: tab === t.id ? "2px solid var(--gold)" : "2px solid transparent",
              cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "var(--navy)" : "var(--text-muted)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s",
            }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {tab === "manual" && <ManualTab onCreate={onCreate} onClose={onClose} />}
          {tab === "duplicate" && <DuplicateTab tasks={existingTasks} onCreate={onCreate} onClose={onClose} />}
          {tab === "import" && <ImportTab onCreate={onCreate} onClose={onClose} />}
          {tab === "template" && <TemplateTab onCreate={onCreate} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
};
