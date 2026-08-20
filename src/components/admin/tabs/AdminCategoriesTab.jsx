// src/components/admin/tabs/AdminCategoriesTab.jsx
// Dizionario delle categorie task: creazione, rinomina, eliminazione.
import { useState } from "react";
import { useSalvataggio } from "../../../hooks/useSalvataggio.js";
import { fieldStyle, btnPrimary, btnGhost, btnDanger } from "../adminStyles.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { useTasks } from "../../../state/TasksContext.jsx";
import { AddCategoryModal } from "../../modals/AddCategoryModal.jsx";
import { FieldError, ariaCampo } from "../../ui/FieldError.jsx";
import { obbligatorio, validaCampi } from "../../../lib/validators.js";
import { useConfirm } from "../../../state/ConfirmContext.jsx";
import { gridGap10, rowCenterBetween, txtF12Muted2, txtF13Muted } from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterGap14 = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
  padding: 14, display: "flex", alignItems: "center", gap: 14,
};
const gridGap8 = { display: "grid", gridTemplateColumns: "1fr 70px 90px 90px", gap: 8 };
const txtF15Bold = { fontSize: 15, fontWeight: 600, color: "var(--text)" };
const rowGap6 = { display: "flex", gap: 6 };

// M-3 dell'audit del 16 agosto: la rinomina in linea usciva in silenzio a
// etichetta vuota (`if (!draft.label?.trim()) return;`), lasciando la riga in
// modifica senza dire perché "💾 Salva" non facesse nulla.
const REGOLE = { label: obbligatorio("L'etichetta non può essere vuota.") };

// ─── ADMIN TAB: CATEGORIE ──────────────────────────────────────────────────
export const AdminCategoriesTab = ({ dispatch }) => {
  const conferma = useConfirm();
  const { categories } = useAppData();
  const tasks = useTasks();
  const [editingKey, setEditingKey] = useState(null);
  const [errori, setErrori] = useState({});
  const [draft, setDraft] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const usageCount = (key) => tasks.filter(t => !t.deletedAt && t.category === key).length;

  const startEdit = (key, c) => { setEditingKey(key); setDraft({ key, ...c }); setErrori({}); };
  const cancelEdit = () => { setEditingKey(null); setDraft(null); setErrori({}); };
  // A-4 · L'esito prima della chiusura dell'editor in linea (audit del 19
  // agosto). Era `dispatch(...)` senza `await` seguito da `cancelEdit()`, che
  // azzera `draft`: su una scrittura rifiutata l'etichetta, l'icona e i colori
  // appena scelti sparivano insieme all'editor, e restava solo un toast su una
  // riga tornata com'era.
  const { salva, inVolo, errore: erroreSalvataggio } = useSalvataggio(
    (payload) => dispatch({ type: "UPDATE_CATEGORY", payload }),
    {
      alSuccesso: () => { setEditingKey(null); setDraft(null); setErrori({}); },
      messaggioErrore: "Categoria non salvata. Le modifiche sono ancora qui, riprova.",
    },
  );

  const saveEdit = () => {
    const trovati = validaCampi({ label: draft.label }, REGOLE);
    if (trovati.label) { setErrori(trovati); return; }
    setErrori({});
    salva(draft);
  };

  return (
    <div>
      <div style={rowCenterBetween}>
        <div style={txtF13Muted}>
          🏷️ <b>{Object.keys(categories).length}</b> categorie definite
        </div>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi categoria</button>
      </div>

      <div style={gridGap10}>
        {Object.entries(categories).map(([key, c]) => {
          const isEditing = editingKey === key;
          const count = usageCount(key);
          return (
            <div key={key} style={rowCenterGap14}>
              <div style={{
                width: 42, height: 42, borderRadius: 8, fontSize: 22,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: c.bg, color: c.color, flexShrink: 0,
              }}>{isEditing ? draft.icon : c.icon}</div>
              <div className="vd-flex-1-min0">
                {isEditing ? (
                  <div className="vd-grid-collapse" style={gridGap8}>
                    <div>
                      <input value={draft.label}
                        onChange={e => {
                          setDraft({ ...draft, label: e.target.value });
                          setErrori(prec => (prec.label ? {} : prec));
                        }}
                        placeholder="Etichetta" style={fieldStyle}
                        {...ariaCampo(`vd-cat-edit-err-${key}`, errori.label)} />
                      <FieldError id={`vd-cat-edit-err-${key}`}>{errori.label}</FieldError>
                    </div>
                    <input value={draft.icon} onChange={e => setDraft({...draft, icon: e.target.value})}
                      placeholder="Icona" style={fieldStyle} maxLength={2} />
                    <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                      style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore primario" />
                    <input type="color" value={draft.bg} onChange={e => setDraft({...draft, bg: e.target.value})}
                      style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore sfondo" />
                    {/* A-4 · Il fallimento accanto ai dati rimasti: il toast
                        del registry riporta il messaggio del database, questo
                        dice che l'editor non si è svuotato. */}
                    <FieldError id={`vd-cat-${key}-save-err`}>{erroreSalvataggio}</FieldError>
                  </div>
                ) : (
                  <>
                    <div style={txtF15Bold}>{c.label}</div>
                    <div style={txtF12Muted2}>
                      Chiave: <code>{key}</code> • {count} task usano questa categoria
                    </div>
                  </>
                )}
              </div>
              <div style={rowGap6}>
                {isEditing ? (
                  <>
                    <button onClick={saveEdit} disabled={inVolo} style={btnPrimary}>
                      {inVolo ? "Salvataggio…" : "💾 Salva"}
                    </button>
                    <button onClick={cancelEdit} style={btnGhost}>Annulla</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(key, c)} style={btnGhost}>✏️ Modifica</button>
                    <button onClick={async () => {
                      // Criticità #8: `alert()` → toast (è un errore vero),
                      // `window.confirm` → conferma dell'app.
                      if (count > 0) {
                        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Impossibile rimuovere "${c.label}": ${count} task usano questa categoria.` } });
                        return;
                      }
                      const ok = await conferma({
                        title: `Rimuovere la categoria "${c.label}"?`,
                        cta: "Rimuovi", danger: true,
                      });
                      if (ok) dispatch({ type: "REMOVE_CATEGORY", payload: key });
                    }} style={btnDanger}>🗑️</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && <AddCategoryModal onClose={() => setShowAdd(false)} dispatch={dispatch} existingKeys={Object.keys(categories)} />}
    </div>
  );
};

// AddCategoryModal → src/components/modals/AddCategoryModal.jsx (Step P Phase 2f)
