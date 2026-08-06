import { LvOverlay } from "./LvOverlay.jsx";

// ─── Strumenti dati: backup JSON e reset totale ────────────────────────────
// Raccoglie in un'unica modale le operazioni sui dati, come faceva la SPA.
// "Reset totale…" compare solo per l'admin: la RPC lo rifiuta comunque agli
// altri ruoli (insufficient_privilege), ma non ha senso offrire nella UI un
// bottone che fallirebbe sempre per manager/agent.
export function StrumentiDatiModal({ isAdminUser, onClose, onScaricaBackup, onCaricaBackup, onReset }) {
  return (
    <LvOverlay onClose={onClose}>
      <h2>Strumenti dati</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button className="lv-btn" style={{ justifyContent: "center" }} onClick={onScaricaBackup}>
          ⬇ Scarica backup (JSON)
        </button>
        <button className="lv-btn" style={{ justifyContent: "center" }} onClick={onCaricaBackup}>
          ⬆ Carica backup
        </button>
        {isAdminUser && (
          <button className="lv-btn danger" style={{ justifyContent: "center" }} onClick={onReset}>
            Reset totale…
          </button>
        )}
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Chiudi</button>
      </div>
    </LvOverlay>
  );
}
