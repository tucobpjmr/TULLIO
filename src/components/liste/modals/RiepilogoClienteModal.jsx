import { eur, fmtDate, intestazioneLista, riepilogoTesto, saldoClass } from "../../../lib/listeApi.js";
import { LvOverlay } from "./LvOverlay.jsx";

// ─── Riepilogo cliente: anteprima stampabile/condivisibile ─────────────────
// Copia destinata al cliente: niente metodi di pagamento, niente storico
// (quella è la copia agente, vedi copiaAgente in ListaDetail). La stampa
// isola questo blocco dal resto dell'app via @media print in listeStyles.jsx;
// "Invia" usa la Web Share API se disponibile, altrimenti copia negli appunti.
export function RiepilogoClienteModal({ lista, movimenti, dispatch, onClose }) {
  const saldo = movimenti.reduce((s, m) => s + Number(m.importo), 0);
  const cls = saldoClass(saldo);

  const invia = async () => {
    const testo = riepilogoTesto(lista, movimenti);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Riepilogo buono viaggio", text: testo });
      } catch (ex) {
        if (ex.name !== "AbortError") {
          dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Invio non riuscito" } });
        }
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(testo);
      dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: "Riepilogo copiato: incollalo in WhatsApp o in una email" } });
    } catch {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Condivisione non disponibile su questo browser" } });
    }
  };

  return (
    <LvOverlay onClose={onClose} wide>
      <div className="lv-riepilogo">
        <div className="rp-brand">Liste Viaggio · Gestione buoni</div>
        <h2>Riepilogo buono viaggio</h2>
        <div className="rp-cliente">{intestazioneLista(lista) || "—"}</div>
        {lista.titolo && <div className="rp-tit">{lista.titolo}</div>}
        {movimenti.length > 0 ? (
          <table className="lv-mov">
            <thead>
              <tr><th>Data</th><th>Descrizione</th><th style={{ textAlign: "right" }}>Importo</th></tr>
            </thead>
            <tbody>
              {movimenti.map((m) => (
                <tr key={m.id}>
                  <td className="dt lv-num">{fmtDate(m.data_movimento)}</td>
                  <td>{m.descrizione}</td>
                  <td className={`imp lv-num ${Number(m.importo) < 0 ? "neg" : "pos"}`}>{eur(m.importo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rp-vuoto">Nessun movimento registrato.</p>
        )}
        <div className="rp-saldo"><span>Saldo</span><b className={`lv-num ${cls}`}>{eur(saldo)}</b></div>
        {lista.stato === "esaurita" && <div className="rp-esaurita">LISTA ESAURITA</div>}
        <div className="rp-foot">Documento generato il {new Date().toLocaleDateString("it-IT")}</div>
      </div>
      <div className="actions no-print">
        <button className="lv-btn" onClick={onClose}>Chiudi</button>
        <button className="lv-btn" onClick={invia}>Invia</button>
        <button className="lv-btn primary" onClick={() => window.print()}>Stampa</button>
      </div>
    </LvOverlay>
  );
}
