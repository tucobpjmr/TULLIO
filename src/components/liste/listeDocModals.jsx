// src/components/liste/listeDocModals.jsx
// Modali "documento" del modulo Liste viaggio: il riepilogo da consegnare al
// cliente, la raccolta degli strumenti dati e la conferma del reset totale.
//
// Il riepilogo cliente è l'unico pezzo del modulo che va in stampa, e per
// questo è montato in un portal su <body>: le regole @media print nascondono
// tutti i figli di body tranne il portal, cosa impossibile se la modale
// restasse annidata dentro l'albero dell'app (sidebar e topbar sono antenati,
// non fratelli, e non si possono escludere da una regola di stampa).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { eur, fmtDate, saldoClass } from "../../lib/listeApi.js";
import { riepilogoTesto, saldoOf } from "../../lib/listeExport.js";

const PORTAL_ID = "lv-print-root";

// Monta un nodo figlio diretto di <body> e marca il body per la durata della
// stampa. Al ritorno rimuove entrambi: se restassero, la stampa di un'altra
// vista dell'app troverebbe tutto nascosto.
function usePrintPortal() {
  const [host] = useState(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.id = PORTAL_ID;
    // Il portal è figlio di <body>, fuori dall'albero del modulo: senza la
    // classe radice perderebbe le variabili --lv-* e tutti i selettori
    // discendenti (.lv-root .lv-btn e simili), e i bottoni resterebbero nudi.
    el.className = "lv-root";
    return el;
  });

  useEffect(() => {
    if (!host) return undefined;
    document.body.appendChild(host);
    document.body.classList.add("lv-printing");
    return () => {
      document.body.classList.remove("lv-printing");
      host.remove();
    };
  }, [host]);

  return host;
}

// ─── riepilogo per il cliente ─────────────────────────────────────────────
// Copia destinata al cliente: niente metodi di pagamento e niente storico —
// sono informazioni interne. La differenza con la copia agente è deliberata.
export function RiepilogoClienteModal({ lista, movimenti, onClose, onToast }) {
  const host = usePrintPortal();
  const saldo = saldoOf(movimenti);

  const invia = async () => {
    const testo = riepilogoTesto(lista, movimenti);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Riepilogo buono viaggio", text: testo });
      } catch (ex) {
        // L'utente che chiude il foglio di condivisione non è un errore.
        if (ex?.name !== "AbortError") onToast("error", "Invio non riuscito");
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(testo);
      onToast("success", "Riepilogo copiato: incollalo in WhatsApp o in una email");
    } catch {
      onToast("error", "Condivisione non disponibile su questo browser");
    }
  };

  if (!host) return null;

  return createPortal(
    <div className="lv-overlay" onClick={onClose}>
      <div className="lv-modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="lv-riep">
          <div className="lv-riep-brand">Liste Viaggio · Gestione buoni</div>
          <h2>Riepilogo buono viaggio</h2>
          <div className="lv-riep-cliente">{lista.clients?.name || "—"}</div>
          {lista.titolo && <div className="lv-riep-tit">{lista.titolo}</div>}

          {movimenti.length > 0 ? (
            <table className="lv-riep-mov">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrizione</th>
                  <th style={{ textAlign: "right" }}>Importo</th>
                </tr>
              </thead>
              <tbody>
                {movimenti.map((m) => (
                  <tr key={m.id}>
                    <td className="dt">{fmtDate(m.data_movimento)}</td>
                    <td>{m.descrizione}</td>
                    <td className={`imp ${Number(m.importo) < 0 ? "neg" : "pos"}`}>{eur(m.importo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="lv-riep-vuoto">Nessun movimento registrato.</p>
          )}

          <div className="lv-riep-saldo">
            <span>Saldo</span>
            <b className={`lv-saldo ${saldoClass(saldo)}`}>{eur(saldo)}</b>
          </div>
          {lista.stato === "esaurita" && <div className="lv-riep-esaurita">LISTA ESAURITA</div>}
          <div className="lv-riep-foot">
            Documento generato il {new Date().toLocaleDateString("it-IT")}
          </div>
        </div>

        <div className="actions no-print">
          <button className="lv-btn" onClick={onClose}>Chiudi</button>
          <button className="lv-btn" onClick={invia}>Invia</button>
          <button className="lv-btn primary" onClick={() => window.print()}>Stampa</button>
        </div>
      </div>
    </div>,
    host,
  );
}

// ─── strumenti dati ───────────────────────────────────────────────────────
// Export, backup e reset in un unico posto. `canReset` arriva dal chiamante:
// il reset totale è riservato agli admin, perché azzera l'archivio dell'intera
// agenzia e non è reversibile.
export function StrumentiDatiModal({ canReset, busy, onExportAll, onScarica, onCarica, onReset, onClose }) {
  return (
    <div className="lv-overlay" onClick={busy ? undefined : onClose}>
      <div className="lv-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Strumenti dati</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="lv-btn" style={{ justifyContent: "center" }} disabled={busy} onClick={onExportAll}>
            Esporta tutte (Word in ZIP)
          </button>
          <button className="lv-btn" style={{ justifyContent: "center" }} disabled={busy} onClick={onScarica}>
            ⬇ Scarica backup (JSON)
          </button>
          <button className="lv-btn" style={{ justifyContent: "center" }} disabled={busy} onClick={onCarica}>
            ⬆ Carica backup
          </button>
          {canReset && (
            <button className="lv-btn danger" style={{ justifyContent: "center" }} disabled={busy} onClick={onReset}>
              Reset totale…
            </button>
          )}
        </div>
        {!canReset && (
          <p style={{ fontSize: 12, color: "var(--lv-muted)", marginTop: 12 }}>
            Il reset totale dell&apos;archivio è riservato agli amministratori.
          </p>
        )}
        <div className="actions">
          <button className="lv-btn" disabled={busy} onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}

// ─── reset totale ─────────────────────────────────────────────────────────
export const RESET_FRASE = "RESET TOTALE";

export function ResetTotaleModal({ onConfirm, onClose }) {
  const [conf, setConf] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // La frase è validata anche lato DB: qui serve a evitare il round-trip e,
  // soprattutto, a rendere impossibile il reset per errore di click.
  const pronto = conf.trim() === RESET_FRASE;

  const conferma = async () => {
    if (!pronto || busy) return;
    setBusy(true);
    const ok = await onConfirm(conf.trim());
    if (!ok) setBusy(false); // riuscito → la modale viene smontata dal chiamante
  };

  return (
    <div className="lv-overlay" onClick={busy ? undefined : onClose}>
      <div className="lv-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Reset totale dell&apos;archivio liste</h2>
        <p style={{ color: "var(--lv-neg)", fontWeight: 600 }}>Attenzione: operazione irreversibile.</p>
        <p style={{ fontSize: 14, color: "var(--lv-muted)" }}>
          Verranno eliminati <b>definitivamente tutte le liste, tutti i movimenti e tutto lo storico</b>,
          cestino compreso. L&apos;anagrafica clienti e gli account restano. Scarica prima un backup.
        </p>
        <div className="row lv-field" style={{ marginTop: 12 }}>
          <label htmlFor="lv-reset-conf">
            Per confermare digita esattamente: {RESET_FRASE}
          </label>
          <input
            id="lv-reset-conf"
            ref={inputRef}
            value={conf}
            onChange={(e) => setConf(e.target.value)}
            placeholder={RESET_FRASE}
            autoComplete="off"
            autoCapitalize="characters"
            onKeyDown={(e) => { if (e.key === "Enter" && pronto) conferma(); }}
          />
        </div>
        <div className="actions">
          <button className="lv-btn" disabled={busy} onClick={onClose}>Annulla</button>
          <button className="lv-btn danger" disabled={!pronto || busy} onClick={conferma}>
            {busy ? "Elimino…" : "Elimina tutto"}
          </button>
        </div>
      </div>
    </div>
  );
}
