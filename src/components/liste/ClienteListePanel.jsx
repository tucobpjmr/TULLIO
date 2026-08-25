// src/components/liste/ClienteListePanel.jsx
// Tab "Liste viaggio" dentro la scheda cliente (ClientiView). Mostra solo le
// liste del cliente selezionato con il rispettivo saldo; aprirne una porta al
// modulo Liste, che è il posto dove si lavora sui movimenti.
//
// Deliberatamente in sola lettura: replicare qui il foglio dei movimenti
// significherebbe due copie della stessa UI da tenere allineate, e la scheda
// cliente non è il contesto in cui si registra un movimento.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ListeAPI, eur, fmtDate, intestazioneLista, saldoClass } from "./listeApi.js";
import { useListeWrite } from "./listePersistence.js";
import { useIsMounted } from "../../hooks/useIsMounted.js";
import "./liste.css";
import { NuovaListaModal } from "./modals/NuovaListaModal.jsx";
import { useDispatch } from "../../state/DispatchContext.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF13Muted = { padding: "20px 0", color: "var(--text-muted)", fontSize: 13 };
const txtF13Muted2 = { padding: "16px 0", color: "var(--text-muted)", fontSize: 13 };
const txtF12Mt4 = { fontSize: 12, marginTop: 4 };
const boxF13Bold = {
  marginTop: 10, padding: "6px 14px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--card)",
  color: "var(--navy)", cursor: "pointer", fontSize: 13, fontWeight: 600,
  fontFamily: "inherit",
};
const boxMt4 = { background: "transparent", marginTop: 4 };
const txtF13Muted3 = { textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: 13 };
const rowCenterBetween = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" };
const txtF13LvMuted = { fontSize: 13, color: "var(--lv-muted)" };

export function ClienteListePanel({ cliente }) {
  const dispatch = useDispatch();
  const [liste, setListe] = useState([]);
  const [saldi, setSaldi] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [nuovaOpen, setNuovaOpen] = useState(false);
  const esegui = useListeWrite();
  const montato = useIsMounted();

  const load = useCallback(async () => {
    setLoadError(null);
    const [rListe, rSaldi] = await Promise.all([
      ListeAPI.listByClient(cliente.id), ListeAPI.saldiByClient(cliente.id),
    ]);
    // Criticità #11: il pannello sta dentro la scheda cliente, che si chiude
    // mentre le due query sono ancora in volo.
    if (!montato()) return;
    const failed = [rListe, rSaldi].find((r) => r.error);
    if (failed) {
      console.error("[liste] scheda cliente", failed.error);
      setLoadError(failed.error.message);
      setLoading(false);
      return;
    }
    setListe(rListe.data || []);
    setSaldi(Object.fromEntries((rSaldi.data || []).map((s) => [s.lista_id, s])));
    setLoading(false);
  }, [cliente.id, montato]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const totale = useMemo(
    () => liste.reduce((s, l) => s + Number(saldi[l.id]?.saldo || 0), 0),
    [liste, saldi],
  );

  // Apre la lista nel modulo: SET_VIEW porta con sé l'id, ListeViaggio lo
  // raccoglie da state.listeTarget e apre direttamente il dettaglio.
  const apri = (id) => dispatch({ type: "SET_VIEW", payload: "liste", lista: id });

  if (loading) {
    return <div style={txtF13Muted}>Caricamento liste…</div>;
  }

  if (loadError) {
    return (
      <div style={txtF13Muted2}>
        Non riesco a caricare le liste di questo cliente.
        <div style={txtF12Mt4}>{loadError}</div>
        <button
          onClick={() => { setLoading(true); load(); }}
          style={boxF13Bold}
        >Riprova</button>
      </div>
    );
  }

  return (
    <>
      <div className="lv-root" style={boxMt4}>
        {liste.length === 0 ? (
          <div style={txtF13Muted3}>
            Nessuna lista viaggio per questo cliente
          </div>
        ) : (
          <div className="lv-card">
            {liste.map((l) => {
              const s = saldi[l.id] || { saldo: 0, num_movimenti: 0 };
              const sub = [
                l.titolo,
                `${s.num_movimenti} movimenti`,
                s.ultimo_movimento ? `ultimo ${fmtDate(s.ultimo_movimento)}` : null,
              ].filter(Boolean).join(" · ");
              return (
                <button key={l.id} type="button" className="lv-lista-row" onClick={() => apri(l.id)}>
                  <div className="who">
                    <b>{l.titolo || intestazioneLista(l) || "—"}</b>
                    <span>{sub}</span>
                  </div>
                  <span className={`lv-badge ${l.stato}`}>{l.stato}</span>
                  <span className={`lv-saldo lv-num ${saldoClass(Number(s.saldo))}`}>{eur(s.saldo)}</span>
                </button>
              );
            })}
          </div>
        )}

        <div style={rowCenterBetween}>
          <button className="lv-btn sm" onClick={() => setNuovaOpen(true)}>+ Nuova lista per questo cliente</button>
          {liste.length > 1 && (
            <span style={txtF13LvMuted}>
              Totale su {liste.length} liste:{" "}
              <b className={`lv-saldo lv-num ${saldoClass(totale)}`}>{eur(totale)}</b>
            </span>
          )}
        </div>

        {nuovaOpen && (
          <NuovaListaModal
            clients={[{ id: cliente.id, name: cliente.name }]}
            presetClientId={cliente.id}
            onClose={() => setNuovaOpen(false)}
            onCreate={{
              onError: (message) => dispatch({ type: "SHOW_TOAST", payload: { type: "error", message } }),
              run: async (payload) => {
                const { ok, data: id } = await esegui("creaLista", payload);
                if (!ok) return false;
                setNuovaOpen(false);
                apri(id); // si continua nel modulo, dove si registrano i movimenti
                return true;
              },
            }}
          />
        )}
      </div>
    </>
  );
}

export default ClienteListePanel;
