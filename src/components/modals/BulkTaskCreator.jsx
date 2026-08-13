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
import { Modal } from "../ui/Modal.jsx";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import { useClients } from "../../state/ClientsContext.jsx";
import { rowCenterGap12 } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterBetween = {
  background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
  padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
};
const rowCenterMiddle = { width: 38, height: 38, borderRadius: 10, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 };
const txtF17Bold = { color: "#fff", fontSize: 17, fontWeight: 700, lineHeight: 1.1 };
const txtF10Mt2 = { color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 1.2, marginTop: 2 };
const boxF14White = { background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14 };
const row = { display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 };
const boxAbsoluteW7 = {
  position: "absolute", top: 8, right: 8, width: 7, height: 7,
  borderRadius: "50%", background: "var(--gold)",
};
const rowCenterGap10 = {
  padding: "9px 22px", background: "var(--surface)", borderBottom: "1px solid var(--border)",
  fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4, flexShrink: 0,
  display: "flex", alignItems: "center", gap: 10,
};
const boxF11Bold = {
  background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
  padding: "3px 8px", cursor: "pointer", fontSize: 11, fontWeight: 600,
  color: "var(--text-muted)", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap",
};
const flex1 = { flex: 1, overflowY: "auto", padding: "18px 22px" };
const txtF18Bold = { fontSize: 18, fontWeight: 700, color: "var(--heading)", marginBottom: 4 };
const txtF125Muted = { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16 };
const rowCenterMiddle2 = {
  width: 44, height: 44, borderRadius: 12, background: "var(--surface2)",
  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0,
};
const txtF15Bold = { fontSize: 15, fontWeight: 700, color: "var(--text)" };
const boxF10Bold = {
  marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "var(--navy)",
  background: "rgba(212,168,67,0.18)", borderRadius: 999, padding: "2px 8px", flexShrink: 0,
};
const txtF12Muted = { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 };


// Descrizione breve di ogni modalità: mostrata sotto le tab per orientare
// l'operatore su "quando" usare ciascuna (v-bulk-ux fase 1).
const TAB_META = [
  { id: "manual",    icon: "✏️", label: "Manuale",     desc: "Inserisci le task a mano, una per riga. Le impostazioni comuni valgono per le righe che non specificano un valore." },
  { id: "duplicate", icon: "🔁", label: "Duplica",      desc: "Riparti da task esistenti: scegli quali duplicare, cambia il titolo e sposta le scadenze." },
  { id: "import",    icon: "📥", label: "Importa file", desc: "Carica un file CSV o Excel e abbina le colonne ai campi delle task." },
  { id: "template",  icon: "📋", label: "Da template",  desc: "Genera una serie di task predefinite a partire dalla data di un evento." },
];

// ─── BULK TASK CREATOR (modale principale) ─────────────────────────────────
export const BulkTaskCreator = ({ existingTasks, onCreate, onClose }) => {
  const conferma = useConfirm();
  // ST-11 · L'anagrafica dal contesto, non come prop (vedi QuickAddTask). Alle
  // due tab che la usano continua ad arrivare come prop: il rilievo riguarda il
  // confine con VoyageDesk, non la composizione interna della modale.
  const clients = useClients();
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
  const requestClose = async () => {
    if (anyDirty) {
      const ok = await conferma({
        title: "Chiudere senza creare?",
        body: "Ci sono dati inseriti che non sono ancora stati trasformati in task: chiudendo vanno persi.",
        cta: "Chiudi e perdi", danger: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  const activeMeta = TAB_META.find(t => t.id === tab);

  return (
    <Modal
      open onClose={requestClose} labelledBy="bulk-title"
      width={820} padding={20} layer="modalFull"
      cardStyle={{ borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <>
        <div style={rowCenterBetween}>
          <div style={rowCenterGap12}>
            <div style={rowCenterMiddle}>📑</div>
            <div>
              <div id="bulk-title" className="playfair" style={txtF17Bold}>Crea più task</div>
              <div style={txtF10Mt2}>MANUALE · DUPLICA · IMPORT · TEMPLATE</div>
            </div>
          </div>
          <button onClick={requestClose} style={boxF14White}>✕</button>
        </div>

        {/* Barra tab + descrizione: solo dopo aver scelto una modalità. */}
        {entered && (
          <>
            <div style={row}>
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
                    <span title="Contiene dati non ancora creati" style={boxAbsoluteW7} />
                  )}
                </button>
              ))}
            </div>

            {activeMeta && (
              <div style={rowCenterGap10}>
                <button
                  type="button"
                  onClick={() => setEntered(false)}
                  title="Torna alla scelta della modalità"
                  style={boxF11Bold}
                >‹ Modalità</button>
                <span>{activeMeta.desc}</span>
              </div>
            )}
          </>
        )}

        {/* Le 4 modalità restano montate (display:none quando inattive o in
            schermata di scelta): cambiare tab o tornare alla scelta non azzera
            i dati già inseriti. */}
        <div style={flex1}>
          {!entered && (
            <div>
              <div className="playfair" style={txtF18Bold}>
                Come vuoi creare i task?
              </div>
              <div style={txtF125Muted}>
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
                    <div style={rowCenterGap12}>
                      <div style={rowCenterMiddle2}>{t.icon}</div>
                      <div style={txtF15Bold}>{t.label}</div>
                      {dirty[t.id] && (
                        <span title="Contiene dati non ancora creati" style={boxF10Bold}>bozza</span>
                      )}
                    </div>
                    <div style={txtF12Muted}>{t.desc}</div>
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
      </>
    </Modal>
  );
};
