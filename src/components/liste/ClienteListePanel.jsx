// src/components/liste/ClienteListePanel.jsx
// Tab "Liste viaggio" dentro la scheda cliente (ClientiView). Mostra solo le
// liste del cliente selezionato con il rispettivo saldo; aprirne una porta al
// modulo Liste, che è il posto dove si lavora sui movimenti.
//
// Deliberatamente in sola lettura: replicare qui il foglio dei movimenti
// significherebbe due copie della stessa UI da tenere allineate, e la scheda
// cliente non è il contesto in cui si registra un movimento.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ListeAPI, eur, fmtDate, intestazioneLista, saldoClass } from "../../lib/listeApi.js";
import { useListeWrite } from "./listePersistence.js";
import { useIsMounted } from "../../hooks/useIsMounted.js";
import { ListeStyles } from "./listeStyles.jsx";
import { NuovaListaModal } from "./modals/NuovaListaModal.jsx";

export function ClienteListePanel({ cliente, dispatch }) {
  const [liste, setListe] = useState([]);
  const [saldi, setSaldi] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [nuovaOpen, setNuovaOpen] = useState(false);
  const esegui = useListeWrite(dispatch);
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
    return <div style={{ padding: "20px 0", color: "var(--text-muted)", fontSize: 13 }}>Caricamento liste…</div>;
  }

  if (loadError) {
    return (
      <div style={{ padding: "16px 0", color: "var(--text-muted)", fontSize: 13 }}>
        Non riesco a caricare le liste di questo cliente.
        <div style={{ fontSize: 12, marginTop: 4 }}>{loadError}</div>
        <button
          onClick={() => { setLoading(true); load(); }}
          style={{
            marginTop: 10, padding: "6px 14px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--card)",
            color: "var(--navy)", cursor: "pointer", fontSize: 13, fontWeight: 600,
            fontFamily: "inherit",
          }}
        >Riprova</button>
      </div>
    );
  }

  return (
    <>
      <ListeStyles />
      <div className="lv-root" style={{ background: "transparent", marginTop: 4 }}>
        {liste.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: 13 }}>
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <button className="lv-btn sm" onClick={() => setNuovaOpen(true)}>+ Nuova lista per questo cliente</button>
          {liste.length > 1 && (
            <span style={{ fontSize: 13, color: "var(--lv-muted)" }}>
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
