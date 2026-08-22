// src/components/liste/ArchivedListe.jsx
// Le liste buoni viaggio chiuse (stato "esaurita", non cestinate), mostrate
// come sezione della vista Archivio.
//
// Vive QUI e non in views/Archive.jsx per una ragione di dipendenze: una vista
// "archivio generico" non deve conoscere il data layer di un modulo specifico.
// Prima Archive.jsx importava direttamente il data layer delle liste — insieme a
// Topbar e
// ClientiView, faceva tre viste del core accoppiate alle query delle liste.
// Ora l'Archivio monta questo componente per composizione e non sa nulla di
// come le liste vengano lette.
import { useCallback, useEffect, useState } from "react";
import { ListeAPI, eur, fmtDate, saldoClass } from "./listeApi.js";
import { useListeWrite } from "./listePersistence.js";
import { PERIOD_OPTIONS, filterByPeriod, thStyle, chipStyle } from "../views/archiveFilters.js";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import * as stiliComuni from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF13Muted2 = { padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 };
const txtF12Muted2 = { fontSize: 12, color: "var(--text-muted)", marginTop: 4 };
const boxF13Bold = {
  marginTop: 10, padding: "6px 14px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--stiliComuni.card)",
  color: "var(--navy)", cursor: "pointer", fontSize: 13, fontWeight: 600,
  fontFamily: "inherit",
};
const txtF13Muted3 = { fontSize: 13, color: "var(--text-muted)", marginBottom: 20 };
const rowCenterGap8 = { display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" };
const boxF13MinW0 = {
  flex: "1 1 100%", minWidth: 0, padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};
const boxR12 = {
  background: "var(--stiliComuni.card)", borderRadius: 12, border: "1px solid var(--border)",
  padding: "14px 16px", cursor: "pointer",
};
const txtF14Bold2 = { fontWeight: 600, color: "var(--heading)", fontSize: 14, marginBottom: 6 };
const rowCenterGap6 = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 };
const rowCenterBetween = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" };
const boxF12Bold = {
  background: "var(--navy)", color: "#fff", border: "none",
  padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
  fontWeight: 600, fontFamily: "inherit",
};
const boxF12Bold2 = {
  background: "var(--stiliComuni.card)", color: "var(--danger)", border: "1px solid var(--danger)",
  padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12,
  fontWeight: 600, fontFamily: "inherit",
};
const borderBottom2 = { borderBottom: "1px solid var(--border)", transition: "background 0.15s", cursor: "pointer" };
const txtBoldHeading = { padding: "12px 16px", fontWeight: 600, color: "var(--heading)" };

const SALDO_COLORS = { pos: "var(--success)", neg: "var(--danger)", zero: "var(--text-muted)" };

// ─── Sezione "Liste buoni viaggio" (liste con stato "esaurita", non cestinate) ──
// Le liste non vivono nello state globale come i task (il modulo Liste le
// fetcha sempre on-demand da Supabase): stesso pattern qui, con stato locale.
export const ArchivedListe = ({ dispatch, isMobile }) => {
  const conferma = useConfirm();
  const [liste, setListe] = useState([]);
  const [saldi, setSaldi] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("all");
  const esegui = useListeWrite(dispatch);

  const load = useCallback(async () => {
    setLoadError(null);
    const [rListe, rSaldi] = await Promise.all([ListeAPI.list(), ListeAPI.saldi()]);
    const failed = [rListe, rSaldi].find(r => r.error);
    if (failed) {
      console.error("[liste] archivio", failed.error);
      setLoadError(failed.error.message);
      setLoading(false);
      return;
    }
    setListe((rListe.data || []).filter(l => l.stato === "esaurita"));
    setSaldi(Object.fromEntries((rSaldi.data || []).map(s => [s.lista_id, s])));
    setLoading(false);
  }, []);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const visible = filterByPeriod(liste, period, "closed_at").filter(l => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const hay = `${l.clients?.name || ""} ${l.titolo || ""} ${l.note || ""}`.toLowerCase();
    return hay.includes(q);
  }).sort((a, b) => new Date(b.closed_at || 0) - new Date(a.closed_at || 0));

  const hasActiveFilter = query.trim() || period !== "all";
  const resetFilters = () => { setQuery(""); setPeriod("all"); };

  const apri = (l) => dispatch({ type: "SET_VIEW", payload: "liste", lista: l.id });

  const handleReopen = async (l) => {
    const { ok } = await esegui("riapriLista", l.id);
    if (ok) load();
  };

  const handleTrash = async (l) => {
    const confermato = await conferma({
      title: "Spostare la lista nel cestino?",
      body: `Lista di "${l.clients?.name || "—"}". Resterà recuperabile dal cestino delle liste.`,
      cta: "Sposta nel cestino", danger: true,
    });
    if (!confermato) return;
    const { ok } = await esegui("cestinaLista", l.id);
    if (ok) load();
  };

  if (loading) {
    return <div style={txtF13Muted2}>Caricamento liste…</div>;
  }

  if (loadError) {
    return (
      <div style={stiliComuni.cardVuota}>
        <div style={stiliComuni.txtF13Muted}>Non riesco a caricare le liste buoni viaggio.</div>
        <div style={txtF12Muted2}>{loadError}</div>
        <button onClick={load} style={boxF13Bold}>Riprova</button>
      </div>
    );
  }

  return (
    <>
      <div style={txtF13Muted3}>
        {liste.length === 0
          ? "Nessuna lista buono viaggio esaurita"
          : hasActiveFilter
            ? `${visible.length} di ${liste.length} liste — filtrate`
            : `${liste.length} ${liste.length === 1 ? "lista esaurita" : "liste esaurite"}. Riaprile o spostale nel cestino.`
        }
      </div>

      {/* Filtri — solo se ci sono liste chiuse */}
      {liste.length > 0 && (
        <div style={rowCenterGap8}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca per cliente, titolo, note…"
            style={boxF13MinW0}
            onFocus={e => e.target.style.borderColor = "var(--gold)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>
      )}

      {/* Filtro periodo (per data di chiusura) — solo se ci sono liste chiuse */}
      {liste.length > 0 && (
        <div style={stiliComuni.rowCenterGap82}>
          <span style={stiliComuni.txtF11Bold}>Chiuse:</span>
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.key} type="button" onClick={() => setPeriod(opt.key)} style={chipStyle(period === opt.key)}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {liste.length === 0 ? (
        <div style={stiliComuni.cardVuotaAlta}>
          <div style={stiliComuni.txtF48Mb16}>🧾</div>
          <div style={stiliComuni.txtF16Bold}>Nessuna lista esaurita</div>
          <div style={stiliComuni.txtF13Muted}>
            Le liste buoni viaggio chiuse verranno raccolte qui. Potrai riaprirle o spostarle nel cestino.
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div style={stiliComuni.cardVuota}>
          <div style={stiliComuni.txtF36Mb12}>📭</div>
          <div style={stiliComuni.txtF14Bold}>
            Nessuna lista per i filtri selezionati
          </div>
          <button type="button" onClick={resetFilters} style={stiliComuni.btnGhostMini}>Azzera filtri</button>
        </div>
      ) : isMobile ? (
        /* Mobile: stiliComuni.card list */
        <div style={stiliComuni.colGap10}>
          {visible.map(l => {
            const s = saldi[l.id] || { saldo: 0 };
            return (
              <div
                key={l.id}
                onClick={() => apri(l)}
                style={boxR12}
              >
                <div style={txtF14Bold2}>
                  {l.clients?.name || "—"}
                </div>
                <div style={rowCenterGap6}>
                  {l.titolo && <span style={stiliComuni.txtF12Muted}>{l.titolo}</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: SALDO_COLORS[saldoClass(Number(s.saldo))] }}>{eur(s.saldo)}</span>
                </div>
                <div style={rowCenterBetween}>
                  <span style={stiliComuni.txtF12Muted}>
                    {l.closed_at ? `chiusa ${fmtDate(l.closed_at.slice(0, 10))}` : "—"}
                  </span>
                  <div style={stiliComuni.rowGap6} onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleReopen(l)} style={boxF12Bold}>↩ Riapri</button>
                    <button onClick={() => handleTrash(l)} style={boxF12Bold2}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop: table */
        <div style={stiliComuni.card}>
          <table style={stiliComuni.tabella}>
            <thead>
              <tr style={stiliComuni.rigaIntestazione}>
                <th style={thStyle("left", "16px")}>CLIENTE</th>
                <th style={thStyle("left")}>TITOLO</th>
                <th style={thStyle("left")}>SALDO</th>
                <th style={thStyle("left")}>CHIUSA IL</th>
                <th style={thStyle("right", "16px")}>AZIONI</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(l => {
                const s = saldi[l.id] || { saldo: 0 };
                return (
                  <tr key={l.id} style={borderBottom2}
                    onClick={() => apri(l)}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={txtBoldHeading}>{l.clients?.name || "—"}</td>
                    <td style={stiliComuni.cella}>
                      {l.titolo || <span style={stiliComuni.txtMuted}>—</span>}
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: 700, color: SALDO_COLORS[saldoClass(Number(s.saldo))] }}>
                      {eur(s.saldo)}
                    </td>
                    <td style={stiliComuni.cellaMuted}>
                      {l.closed_at ? fmtDate(l.closed_at.slice(0, 10)) : "—"}
                    </td>
                    <td style={stiliComuni.cellaAzioni} onClick={e => e.stopPropagation()}>
                      <div style={stiliComuni.rowGap62}>
                        <button onClick={() => handleReopen(l)} title="Riapri (rimetti attiva)" style={stiliComuni.btnNavyMini}>↩ Riapri</button>
                        <button onClick={() => handleTrash(l)} title="Sposta nel cestino" style={stiliComuni.btnDangerMini}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};
