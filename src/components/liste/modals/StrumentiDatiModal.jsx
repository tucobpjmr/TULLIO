import { LvOverlay } from "./LvOverlay.jsx";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const middle = { justifyContent: "center" };

// ─── Strumenti dati: backup JSON e reset totale ────────────────────────────
// Raccoglie in un'unica modale le operazioni sui dati, come faceva la SPA.
// "Reset totale…" e, dal 15 agosto (M-1 dell'audit), "Carica backup" compaiono
// solo per l'admin: entrambe le RPC (resetCompleto, importa_backup) rifiutano
// comunque gli altri ruoli (insufficient_privilege — private.is_admin() nel
// corpo di entrambe), ma non ha senso offrire nella UI un bottone che
// fallirebbe sempre per manager/agent. "Scarica backup" resta per tutti: è
// una lettura, non una scrittura privilegiata.
export function StrumentiDatiModal({ isAdminUser, onClose, onScaricaBackup, onCaricaBackup, onReset }) {
  // M-2 · solo scelte/bottoni: niente da perdere con un click a lato.
  return (
    <LvOverlay onClose={onClose} chiudiSuVelo>
      <h2>Strumenti dati</h2>
      <div style={stiliComuni.colGap10}>
        <button className="lv-btn" style={middle} onClick={onScaricaBackup}>
          ⬇ Scarica backup (JSON)
        </button>
        {isAdminUser && (
          <button className="lv-btn" style={middle} onClick={onCaricaBackup}>
            ⬆ Carica backup
          </button>
        )}
        {isAdminUser && (
          <button className="lv-btn danger" style={middle} onClick={onReset}>
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
