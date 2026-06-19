// ─── QUICK ADD TASK ──────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState } from "react";
import { PRIORITIES } from "../../lib/taskConstants.js";
import { CURRENT_USER, getAssignableTeam, getAvailableCategories } from "../../state/appGlobals.js";

// v2.8 Round 6: auto-suggerisci la categoria in base a keyword nel titolo.
// Regole: primo match vince (ordine top-down). Solo per categorie disponibili all'utente.
const CATEGORY_KEYWORDS = [
  { cat: "transfer",  words: ["transfer", "navetta", "shuttle", "ncc "] },
  { cat: "visa",      words: ["visto", "passaporto", "visa", "documenti sanitar", "document"] },
  { cat: "booking",   words: ["volo", "voli", "aereo", "aerei", "bigliett", "compagnia aerea", "check-in", "checkin", "flight"] },
  { cat: "hotel",     words: ["hotel", "albergo", "resort", "villa", "bed ", "bungalow", "ryokan", "appartament", "ospitalit"] },
  { cat: "payment",   words: ["pagament", "acconto", "saldo", "fattura", "bonifico", "invoice", "polizza", "tariffa"] },
  { cat: "itinerary", words: ["itinerario", "programma viaggio", "tappe", "tour ", "percorso", "preventivo"] },
  { cat: "client",    words: ["cliente", "followup", "follow-up", "chiamata", "contatto", "incontro", "appuntamento", "meeting"] },
  { cat: "marketing", words: ["newsletter", "social", "post ", "campagna", "promo", "pubblicità", "instagram", "facebook"] },
  { cat: "supplier",  words: ["fornitore", "contratto", "accordo", "autobus", "bus "] },
  { cat: "admin",     words: ["riunione", "agenda", "report", "log ", "amministrazion"] },
];
const suggestCategory = (title, availableCats) => {
  const lower = (title || "").toLowerCase();
  if (lower.length < 4) return null;
  for (const { cat, words } of CATEGORY_KEYWORDS) {
    if (!availableCats[cat]) continue;
    if (words.some(w => lower.includes(w))) return cat;
  }
  return null;
};

export const QuickAddTask = ({ onAdd, onClose }) => {
  // Categorie filtrate per il ruolo dell'utente loggato (v0.8)
  const availableCats = getAvailableCategories(CURRENT_USER);
  const firstCatKey = Object.keys(availableCats)[0] || "booking";

  const [form, setForm] = useState({
    title: "", category: firstCatKey, priority: "medium",
    status: "todo", assignees: [], dueDate: "", client: "", praticaRef: "", description: ""
  });
  // true se l'utente ha cambiato manualmente la categoria → non sovrascrivere
  const [catManual, setCatManual] = useState(false);

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    onAdd({
      id: "t" + Date.now(),
      ...form,
      client: form.client.trim() || null,
      praticaRef: form.praticaRef || null,
      comments: [],
      estimatedHours: 1,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
    });
    onClose();
  };

  // Auto-suggerisci categoria al cambio titolo (se l'utente non ha impostato manualmente)
  const suggested = !catManual ? suggestCategory(form.title, availableCats) : null;

  const inp = (field) => ({
    value: form[field],
    onChange: e => {
      const val = e.target.value;
      setForm(p => {
        const next = { ...p, [field]: val };
        // Auto-applica la categoria suggerita se non è stata modificata manualmente
        if (field === "title" && !catManual) {
          const s = suggestCategory(val, availableCats);
          if (s) next.category = s;
        }
        return next;
      });
    },
    style: {
      width: "100%", border: "1px solid var(--border)", borderRadius: 8,
      padding: "8px 10px", fontSize: 13, background: "var(--surface)",
      outline: "none", fontFamily: "inherit",
    }
  });

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16
    }}>
      <div className="slide-up" style={{
        background: "var(--card)", borderRadius: 14, padding: 28, width: 500, maxWidth: "100%",
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 30px 80px rgba(0,0,0,0.2)", border: "1px solid var(--border)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div className="playfair" style={{ fontSize: 20, fontWeight: 700 }}>Nuovo Task</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>TITOLO *</label>
            <input {...inp("title")} placeholder="Descrivi brevemente il task..." />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>
                CATEGORIA
                {suggested && (
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 700,
                    background: "#E0F2FE", color: "#0369A1",
                    padding: "1px 6px", borderRadius: 4,
                  }}>💡 auto</span>
                )}
              </label>
              <select
                value={form.category}
                onChange={e => { setCatManual(true); setForm(p => ({ ...p, category: e.target.value })); }}
                style={{ ...inp("category").style, cursor: "pointer",
                  borderColor: suggested ? "#0369A1" : "var(--border)",
                }}
              >
                {Object.entries(availableCats).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
              {catManual && form.title.length >= 4 && suggestCategory(form.title, availableCats) && suggestCategory(form.title, availableCats) !== form.category && (
                <button
                  type="button"
                  onClick={() => { setCatManual(false); const s = suggestCategory(form.title, availableCats); if (s) setForm(p => ({ ...p, category: s })); }}
                  style={{
                    marginTop: 5, fontSize: 11, color: "#0369A1", background: "none",
                    border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
                  }}
                >
                  💡 Usa categoria suggerita: {availableCats[suggestCategory(form.title, availableCats)]?.label}
                </button>
              )}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>PRIORITÀ</label>
              <select {...inp("priority")} style={{ ...inp("priority").style, cursor: "pointer" }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>ASSEGNA A</label>
              <select
                value={form.assignees[0] || ""}
                onChange={e => setForm(p => ({ ...p, assignees: e.target.value ? [e.target.value] : [] }))}
                style={{ ...inp("category").style, cursor: "pointer" }}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>SCADENZA</label>
              <input type="datetime-local" {...inp("dueDate")} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>CLIENTE</label>
            <input {...inp("client")} placeholder="Es. Famiglia Rossi..." />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>N° PRATICA</label>
            <input {...inp("praticaRef")} placeholder="es. PR-2026-001" />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>DESCRIZIONE</label>
            <textarea {...inp("description")} rows={3} placeholder="Dettagli del task..." style={{ ...inp("description").style, resize: "vertical" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)",
            background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500
          }}>Annulla</button>
          <button onClick={handleSubmit} style={{
            padding: "9px 20px", borderRadius: 8, border: "none",
            background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600
          }}>✓ Crea Task</button>
        </div>
      </div>
    </div>
  );
};
