// ─── QUICK ADD TASK ──────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useRef } from "react";
import { PRIORITIES, RECURRENCE_OPTIONS } from "../../lib/taskConstants.js";
import { CURRENT_USER, getAssignableTeam, getAvailableCategories } from "../../state/appGlobals.js";
import { TaskFiles } from "../../lib/api.js";
import { MAX_TASK_FILE_SIZE, formatFileSize, fileIcon, isWithinSizeLimit } from "../../lib/fileUtils.js";

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

export const QuickAddTask = ({ onAdd, onClose, clients = [] }) => {
  // Categorie filtrate per il ruolo dell'utente loggato (v0.8)
  const availableCats = getAvailableCategories(CURRENT_USER);
  const firstCatKey = Object.keys(availableCats)[0] || "booking";

  const [form, setForm] = useState({
    title: "", category: firstCatKey, priority: "medium",
    status: "todo", assignees: [], dueDate: "", recurrence: "none",
    client: "", praticaRef: "", description: ""
  });
  // true se l'utente ha cambiato manualmente la categoria → non sovrascrivere
  const [catManual, setCatManual] = useState(false);
  // Allegati selezionati in fase di creazione: tenuti in memoria e caricati
  // subito DOPO che la task è stata persistita (l'upload via RLS richiede la
  // riga task già esistente, e serve il suo UUID definitivo).
  const [pendingFiles, setPendingFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  // Autocomplete cliente: mostra la tendina dei clienti in anagrafica mentre si
  // digita. Il campo resta testo libero (task.client è una stringa), così si può
  // anche inserire un cliente non ancora presente in anagrafica.
  const [clientFocus, setClientFocus] = useState(false);
  const fileInputRef = useRef(null);

  const clientQuery = form.client.trim().toLowerCase();
  const clientMatches = (clientQuery
    ? clients.filter(c => c.name?.toLowerCase().includes(clientQuery))
    : clients
  ).slice(0, 6);
  // Nasconde la tendina quando l'unico match coincide esattamente con quanto
  // digitato (cliente già selezionato → niente suggerimento ridondante).
  const showClientList = clientFocus && clientMatches.length > 0 &&
    !(clientMatches.length === 1 && clientMatches[0].name?.toLowerCase() === clientQuery);

  const addFiles = (fileList) => {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    setFileError("");
    const ok = [];
    for (const f of arr) {
      if (!isWithinSizeLimit(f.size)) {
        setFileError(`"${f.name}" supera il limite di ${formatFileSize(MAX_TASK_FILE_SIZE)}`);
        continue;
      }
      ok.push(f);
    }
    if (ok.length) setPendingFiles(prev => [...prev, ...ok]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    // UUID generato qui: dispatch lo conserva (è già un uuid valido), così
    // conosciamo l'id definitivo della task per caricarci gli allegati.
    const id = crypto.randomUUID();
    const result = await onAdd({
      id,
      ...form,
      client: form.client.trim() || null,
      praticaRef: form.praticaRef || null,
      comments: [],
      estimatedHours: 1,
      recurrence: form.recurrence || "none",
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
    });

    // Se la creazione è andata a buon fine, carica gli allegati in sequenza.
    if (pendingFiles.length && !(result && result.error)) {
      for (const f of pendingFiles) {
        const { error: e } = await TaskFiles.upload(f, id, { uploadedBy: CURRENT_USER });
        if (e) {
          setFileError(`Task creata, ma l'upload di "${f.name}" è fallito. Riprova dal dettaglio della task.`);
          setBusy(false);
          return; // tieni il modale aperto per dare contesto sull'errore
        }
      }
    }
    setBusy(false);
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
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
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>RICORRENZA</label>
              <select
                value={form.recurrence}
                onChange={e => setForm(p => ({ ...p, recurrence: e.target.value }))}
                style={{ ...inp("category").style, cursor: "pointer" }}
              >
                {Object.entries(RECURRENCE_OPTIONS).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>CLIENTE</label>
            <input
              {...inp("client")}
              placeholder={clients.length ? "Cerca in anagrafica o scrivi un nome…" : "Es. Famiglia Rossi…"}
              autoComplete="off"
              onFocus={() => setClientFocus(true)}
              // Ritardo la chiusura per dare tempo al click sull'opzione (mousedown).
              onBlur={() => setTimeout(() => setClientFocus(false), 150)}
            />
            {showClientList && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                marginTop: 4, background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                maxHeight: 200, overflowY: "auto",
              }}>
                {clientMatches.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => { setForm(p => ({ ...p, client: c.name })); setClientFocus(false); }}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
                      width: "100%", textAlign: "left", padding: "8px 10px", border: "none",
                      borderBottom: "1px solid var(--border)", background: "transparent",
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{c.name}</span>
                    {(c.city || c.email) && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {[c.city, c.email].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>N° PRATICA</label>
            <input {...inp("praticaRef")} placeholder="es. PR-2026-001" />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>DESCRIZIONE</label>
            <textarea {...inp("description")} rows={3} placeholder="Dettagli del task..." style={{ ...inp("description").style, resize: "vertical" }} />
          </div>

          {/* Allegati (immagini, video, audio, documenti) */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>ALLEGATI</label>
            {pendingFiles.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                {pendingFiles.map((f, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
                    background: "var(--surface2)", borderRadius: 8,
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{fileIcon(f.type || f.name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatFileSize(f.size)}</div>
                    </div>
                    <button type="button" onClick={() => removeFile(i)} disabled={busy} title="Rimuovi" style={{
                      background: "none", border: "none", cursor: busy ? "default" : "pointer", fontSize: 13, padding: 4, color: "var(--text-muted)",
                    }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={e => addFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => !busy && fileInputRef.current?.click()}
              style={{
                width: "100%", border: "2px dashed var(--border)", borderRadius: 8,
                padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13,
                cursor: busy ? "default" : "pointer", background: "transparent", fontFamily: "inherit",
              }}
            >📎 Aggiungi file</button>
            <div style={{ fontSize: 11, color: "var(--text-light)", marginTop: 4 }}>
              Immagini, video, audio e documenti · max {formatFileSize(MAX_TASK_FILE_SIZE)} per file.
            </div>
            {fileError && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>{fileError}</div>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={busy} style={{
            padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)",
            background: "transparent", cursor: busy ? "default" : "pointer", fontSize: 13, fontWeight: 500,
            opacity: busy ? 0.6 : 1,
          }}>Annulla</button>
          <button onClick={handleSubmit} disabled={busy} style={{
            padding: "9px 20px", borderRadius: 8, border: "none",
            background: "var(--navy)", color: "#fff", cursor: busy ? "default" : "pointer", fontSize: 13, fontWeight: 600,
            opacity: busy ? 0.7 : 1,
          }}>{busy ? "⏳ Creazione…" : "✓ Crea Task"}</button>
        </div>
      </div>
    </div>
  );
};
