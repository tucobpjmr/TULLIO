// src/components/ui/StatoEntita.jsx
// ─── A-3 · il riquadro del TERZO STATO (audit UX/errori del 31 agosto) ─────
//
// Quello che una vista mostra quando la sua entità NON si è caricata.
//
// PERCHÉ NON BASTAVA IL TOAST. Il canale dell'errore di caricamento c'era già
// (`onError` in useAppHydration, sei call site) ed è il canale giusto per
// l'ANNUNCIO. Ma è effimero per costruzione: l'utente lo chiude, oppure il cap
// della coda lo espelle quando arrivano altri messaggi. Da quel momento a
// schermo non resta nulla che dica che quei numeri non sono i numeri — e sotto
// c'è lo stato VUOTO della vista, che afferma il contrario con sicurezza:
//
//   Dashboard → «Nessuna task aperta a tuo nome. Buon lavoro!»
//   Archivio  → «Archivio vuoto»
//   Bacheca   → «Nessun avviso»
//
// È la criticità #6 vista dall'altro capo. Quella riguardava la finestra PRIMA
// della risposta («non lo so ancora» detto come «non c'è niente»), questa la
// finestra DOPO una risposta fallita: la stessa affermazione falsa su dati
// operativi, e in un gestionale qualcuno smette di lavorare su una coda che
// crede vuota.
//
// PERCHÉ UN COMPONENTE SOLO, montato UNA volta. Il riquadro sta sopra la
// vista attiva in VoyageDeskInner e non dentro ognuna delle nove: la regola
// («un caricamento fallito non si disegna come un vuoto») è una sola, e
// riscritta nove volte diventa nove varianti — è la stessa ragione per cui
// ErrorDetails è uno per tre boundary e creaErrorBoundary uno per tre
// lifecycle.
//
// ⚠️ I FIGLI SI DISEGNANO COMUNQUE. Il riquadro si AGGIUNGE alla vista, non la
// sostituisce: ciò che era stato caricato prima dell'errore — o le altre
// entità della stessa schermata — resta utilizzabile. Sostituire tutto sarebbe
// la reazione sproporzionata che ViewErrorBoundary esiste per non avere.
import * as stiliComuni from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const riquadro = {
  display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
  margin: "0 0 16px", padding: "12px 16px", borderRadius: 10,
  background: "var(--card)", border: "1px solid var(--danger)",
  borderLeft: "4px solid var(--danger)",
};
const testo = { flex: 1, minWidth: 200, fontSize: 13, lineHeight: 1.45, color: "var(--text)" };
const btnRiprova = {
  padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--card)", color: "var(--navy)", fontWeight: 700,
  cursor: "pointer", fontSize: 12.5, fontFamily: "inherit", flexShrink: 0,
};

/**
 * @param {Array<{chiave: string, etichetta: string, stato: {messaggio: string, riprova: () => void}|null}>} voci
 *   Le entità di cui questa vista vive. `stato` null = tutto a posto.
 */
export function StatoEntita({ voci = [], children }) {
  const rotte = voci.filter(v => v.stato);
  if (rotte.length === 0) return children;

  return (
    <>
      {rotte.map(({ chiave, etichetta, stato }) => (
        // `role="status"` e non `role="alert"`: l'annuncio interrompente lo ha
        // già fatto il toast nel momento in cui l'errore è avvenuto. Questo
        // riquadro è la CONDIZIONE che resta, e ripetere l'interruzione a ogni
        // render della vista sarebbe rumore per chi usa uno screen reader.
        <div key={chiave} role="status" style={riquadro}>
          <span style={stiliComuni.txtF15} aria-hidden="true">⚠️</span>
          <div style={testo}>
            Non è stato possibile caricare {etichetta}.{" "}
            <strong>Quello che vedi qui sotto non è l&#39;elenco completo.</strong>
          </div>
          {/* L'unica azione utile, e c'è: prima di A-3 l'unico rimedio era
              ricaricare la pagina, e l'interfaccia non lo diceva da nessuna
              parte. */}
          <button onClick={stato.riprova} style={btnRiprova}>Riprova</button>
        </div>
      ))}
      {children}
    </>
  );
}
