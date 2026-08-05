// ─── BULK TASK CREATOR ───────────────────────────────────────────────────────
// Shell della modale: schermata di scelta, barra tab, guardia sulle modifiche
// non salvate. Le quattro modalità vivono in ./bulk/ — erano quattro
// componenti già separati dentro un file da 1.366 righe, con contratto
// identico (onCreate, onClose, onCancel, onDirty) ma nessuna possibilità di
// aprirne uno solo in un test.
import { useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { ManualTab } from "./bulk/ManualTab.jsx";
import { DuplicateTab } from "./bulk/DuplicateTab.jsx";
import { ImportTab } from "./bulk/ImportTab.jsx";
import { TemplateTab } from "./bulk/TemplateTab.jsx";


// Descrizione breve di ogni modalità: mostrata sotto le tab per orientare
// l'operatore su "quando" usare ciascuna (v-bulk-ux fase 1).
const TAB_META = [
  { id: "manual",    icon: "✏️", label: "Manuale",     desc: "Inserisci le task a mano, una per riga. Le impostazioni comuni valgono per le righe che non specificano un valore." },
  { id: "duplicate", icon: "🔁", label: "Duplica",      desc: "Riparti da task esistenti: scegli quali duplicare, cambia il titolo e sposta le scadenze." },
  { id: "import",    icon: "📥", label: "Importa file", desc: "Carica un file CSV o Excel e abbina le colonne ai campi delle task." },
  { id: "template",  icon: "📋", label: "Da template",  desc: "Genera una serie di task predefinite a partire dalla data di un evento." },
];

// ─── BULK TASK CREATOR (modale principale) ─────────────────────────────────
export const BulkTaskCreator = ({ existingTasks, onCreate, onClose, clients = [] }) => {
  const { isMobile } = useViewport();
  const [tab, setTab] = useState("manual");
  // Fase 2: si parte da una schermata di scelta ("Come vuoi creare i task?")
  // con 4 card grandi, invece di atterrare direttamente su una tab fitta —
  // riduce il carico cognitivo, soprattutto su mobile. `entered` distingue la
  // schermata di scelta dal contenuto della modalità.
  const [entered, setEntered] = useState(false);
  // Traccia se ogni modalità contiene dati non ancora creati, così la chiusura
  // (✕ / sfondo / Annulla) può avvisare invece di buttare via il lavoro.
  const [dirty, setDirty] = useState({});
  const markDirty = (id) => (v) => setDirty(d => (d[id] === v ? d : { ...d, [id]: v }));
  const anyDirty = Object.values(dirty).some(Boolean);
  const requestClose = () => {
    if (anyDirty && !window.confirm("Ci sono dati inseriti non ancora creati. Vuoi chiudere e perderli?")) return;
    onClose();
  };

  const activeMeta = TAB_META.find(t => t.id === tab);

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,32,68,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20,
      }}
    >
      <div className="slide-up vd-modal-mh" style={{
        background: "var(--card)", borderRadius: 16, width: 820, maxWidth: "100%",
        display: "flex", flexDirection: "column",
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
          <button onClick={requestClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>

        {/* Barra tab + descrizione: solo dopo aver scelto una modalità. */}
        {entered && (
          <>
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
              {TAB_META.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  flex: 1, padding: "12px 8px", background: tab === t.id ? "#fff" : "transparent",
                  border: "none", borderBottom: tab === t.id ? "2px solid var(--gold)" : "2px solid transparent",
                  cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                  color: tab === t.id ? "var(--navy)" : "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s",
                  position: "relative",
                }}>
                  <span>{t.icon}</span> {!isMobile && t.label}
                  {dirty[t.id] && tab !== t.id && (
                    <span title="Contiene dati non ancora creati" style={{
                      position: "absolute", top: 8, right: 8, width: 7, height: 7,
                      borderRadius: "50%", background: "var(--gold)",
                    }} />
                  )}
                </button>
              ))}
            </div>

            {activeMeta && (
              <div style={{
                padding: "9px 22px", background: "var(--surface)", borderBottom: "1px solid var(--border)",
                fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4, flexShrink: 0,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <button
                  type="button"
                  onClick={() => setEntered(false)}
                  title="Torna alla scelta della modalità"
                  style={{
                    background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
                    padding: "3px 8px", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    color: "var(--text-muted)", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap",
                  }}
                >‹ Modalità</button>
                <span>{activeMeta.desc}</span>
              </div>
            )}
          </>
        )}

        {/* Le 4 modalità restano montate (display:none quando inattive o in
            schermata di scelta): cambiare tab o tornare alla scelta non azzera
            i dati già inseriti. */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {!entered && (
            <div>
              <div className="playfair" style={{ fontSize: 18, fontWeight: 700, color: "var(--heading)", marginBottom: 4 }}>
                Come vuoi creare i task?
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16 }}>
                Scegli una modalità. Potrai passare da una all'altra senza perdere quello che hai inserito.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                {TAB_META.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setTab(t.id); setEntered(true); }}
                    className="hover-lift"
                    style={{
                      textAlign: "left", padding: "16px 18px", borderRadius: 12,
                      border: `1px solid ${dirty[t.id] ? "var(--gold)" : "var(--border)"}`,
                      background: "var(--card)", cursor: "pointer", fontFamily: "inherit",
                      display: "flex", flexDirection: "column", gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, background: "var(--surface2)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0,
                      }}>{t.icon}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{t.label}</div>
                      {dirty[t.id] && (
                        <span title="Contiene dati non ancora creati" style={{
                          marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "var(--navy)",
                          background: "rgba(212,168,67,0.18)", borderRadius: 999, padding: "2px 8px", flexShrink: 0,
                        }}>bozza</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: entered && tab === "manual" ? "block" : "none" }}>
            <ManualTab onCreate={onCreate} onClose={onClose} onCancel={requestClose} onDirty={markDirty("manual")} clients={clients} />
          </div>
          <div style={{ display: entered && tab === "duplicate" ? "block" : "none" }}>
            <DuplicateTab tasks={existingTasks} onCreate={onCreate} onClose={onClose} onCancel={requestClose} onDirty={markDirty("duplicate")} />
          </div>
          <div style={{ display: entered && tab === "import" ? "block" : "none" }}>
            <ImportTab onCreate={onCreate} onClose={onClose} onCancel={requestClose} onDirty={markDirty("import")} />
          </div>
          <div style={{ display: entered && tab === "template" ? "block" : "none" }}>
            <TemplateTab onCreate={onCreate} onClose={onClose} onCancel={requestClose} onDirty={markDirty("template")} clients={clients} />
          </div>
        </div>
      </div>
    </div>
  );
};
