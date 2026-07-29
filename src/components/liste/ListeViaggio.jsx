// src/components/liste/ListeViaggio.jsx
// Modulo "Liste Viaggio" (buoni viaggio): porting in React della SPA vanilla
// `liste-buoni-viaggio/index.html`, che condivide con VoyageDesk lo stesso
// progetto Supabase e la stessa anagrafica clienti/utenti.
//
// Il modulo non ha una voce di sidebar/bottom-nav: ci si arriva dal bottone
// nell'header della Dashboard e dal tab dentro la scheda cliente. Senza una
// voce di nav attiva l'utente non ha, su mobile, un segnale di "dove sono":
// per questo il modulo fornisce la propria via d'uscita esplicita (breadcrumb
// "← Dashboard"), oltre al logo in Topbar che porta comunque alla Dashboard.
//
// Il CONTENUTO mantiene di proposito lo stile originale (blu #0F4C81, font
// Inter, impaginazione "foglio cartaceo"); solo la chrome di navigazione —
// breadcrumb e testata — segue lo stile Tullio (navy/oro, Playfair).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { getRoleType } from "../../state/appGlobals.js";
import { ListeAPI, eur, fmtDate, runListeCall, saldoClass } from "../../lib/listeApi.js";
import { ListeStyles } from "./listeStyles.jsx";
import { ListaDetail } from "./ListaDetail.jsx";
import { NuovaListaModal } from "./listeModals.jsx";

const HOME_PAGE_SIZE = 10;

// Criteri di ordinamento della home. 'recenti' è l'ordine in cui il database
// restituisce le liste (updated_at DESC): ordinare qui, sul client, evita di
// rifare la query a ogni cambio di criterio.
const ORDINAMENTI = {
  recenti: "Ultima modifica",
  mov_recente: "Movimento più recente",
  mov_vecchio: "Movimento più vecchio",
  nome: "Cliente A–Z",
  saldo: "Saldo più alto",
};

// Le liste senza movimenti non hanno una data: vanno in fondo in entrambi i
// versi, altrimenti ordinando dal più vecchio occuperebbero le prime righe.
const cmpData = (a, b, verso) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a === b ? 0 : (a < b ? -verso : verso);
};

export function ordinaListe(liste, saldi, sort) {
  const nome = (l) => l.clients?.name || "";
  const mov = (l) => saldi[l.id]?.ultimo_movimento || "";
  const saldo = (l) => Number(saldi[l.id]?.saldo || 0);
  const perNome = (a, b) => nome(a).localeCompare(nome(b), "it");
  const arr = liste.slice(); // mai riordinare l'array in state
  switch (sort) {
    case "mov_recente": return arr.sort((a, b) => cmpData(mov(a), mov(b), -1) || perNome(a, b));
    case "mov_vecchio": return arr.sort((a, b) => cmpData(mov(a), mov(b), 1) || perNome(a, b));
    case "nome": return arr.sort(perNome);
    case "saldo": return arr.sort((a, b) => saldo(b) - saldo(a) || perNome(a, b));
    default: return arr; // 'recenti': ordine del database
  }
}

// Riga della home: cliente, titolo, numero movimenti, stato e saldo.
export function ListaRow({ lista, saldo, onOpen, trashed = false, children }) {
  const s = saldo || { saldo: 0, num_movimenti: 0 };
  // Nel cestino conta da quanto la lista è archiviata, non il dettaglio dei
  // movimenti: la vista `liste_saldi` esclude comunque le liste archiviate,
  // quindi lì num_movimenti/ultimo_movimento sarebbero sempre a zero.
  const sub = trashed
    ? `${lista.titolo ? `${lista.titolo} · ` : ""}nel cestino dal ${fmtDate((lista.deleted_at || "").slice(0, 10))}`
    : [
      lista.titolo,
      `${s.num_movimenti} movimenti`,
      s.ultimo_movimento ? `ultimo ${fmtDate(s.ultimo_movimento)}` : null,
    ].filter(Boolean).join(" · ");

  const content = (
    <>
      <div className="who">
        <b>{lista.clients?.name || "—"}</b>
        <span>{sub}</span>
      </div>
      {!trashed && <span className={`lv-badge ${lista.stato}`}>{lista.stato}</span>}
      {/* Nel cestino il saldo non si mostra: `liste_saldi` filtra le liste
          archiviate, quindi il valore sarebbe uno 0,00 € fuorviante e non il
          saldo reale della lista (la SPA sorgente lo mostrava comunque). */}
      {!trashed && (
        <span className={`lv-saldo lv-num ${saldoClass(Number(s.saldo))}`}>{eur(s.saldo)}</span>
      )}
      {children}
    </>
  );

  // Nel cestino la riga non è cliccabile (porta i propri bottoni): resta un
  // div, così i bottoni interni non finiscono annidati dentro un <button>.
  if (!onOpen) {
    return <div className="lv-lista-row" style={{ cursor: "default" }}>{content}</div>;
  }
  return (
    <button type="button" className="lv-lista-row" onClick={onOpen}>{content}</button>
  );
}

// ─── Modulo ────────────────────────────────────────────────────────────────
export function ListeViaggio({ state, dispatch }) {
  const { isMobile } = useViewport();
  const uid = state.currentUserId;
  const role = getRoleType(uid);
  const isDriver = role === "driver";

  const [liste, setListe] = useState([]);
  const [cestino, setCestino] = useState([]);
  const [saldi, setSaldi] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null); // { lista, movimenti, history }

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("attive");
  const [sort, setSort] = useState("recenti");
  const [limit, setLimit] = useState(HOME_PAGE_SIZE);
  const [nuovaOpen, setNuovaOpen] = useState(false);

  // L'anagrafica clienti e il team sono già idratati nello state globale
  // dell'app (stesse tabelle `clients`/`users` del modulo): li riusiamo invece
  // di rifare le due query che faceva la SPA.
  const clients = useMemo(
    () => [...(state.clients || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "", "it")),
    [state.clients],
  );
  const usersById = useMemo(() => {
    const m = {};
    for (const t of state.team || []) m[t.id] = t.name;
    return m;
  }, [state.team]);

  const loadHome = useCallback(async () => {
    setLoadError(null);
    const [rListe, rCestino, rSaldi] = await Promise.all([
      ListeAPI.list(), ListeAPI.listTrash(), ListeAPI.saldi(),
    ]);
    const failed = [rListe, rCestino, rSaldi].find((r) => r.error);
    if (failed) {
      console.error("[liste] caricamento", failed.error);
      setLoadError(failed.error.message);
      setLoading(false);
      return;
    }
    setListe(rListe.data || []);
    setCestino(rCestino.data || []);
    setSaldi(Object.fromEntries((rSaldi.data || []).map((s) => [s.lista_id, s])));
    setLoading(false);
  }, []);

  const loadDetail = useCallback(async (id) => {
    const [rLista, rMovs, rHist] = await Promise.all([
      ListeAPI.get(id), ListeAPI.movimenti(id), ListeAPI.history(id),
    ]);
    const failed = [rLista, rMovs, rHist].find((r) => r.error);
    if (failed) {
      console.error("[liste] dettaglio", failed.error);
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Errore: ${failed.error.message}` } });
      return;
    }
    setDetail({ lista: rLista.data, movimenti: rMovs.data || [], history: rHist.data || [] });
  }, [dispatch]);

  useEffect(() => {
    if (isDriver) { setLoading(false); return; }
    loadHome();
  }, [isDriver, loadHome]);

  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    loadDetail(openId);
  }, [openId, loadDetail]);

  // Apertura mirata da un'altra vista (tab "Liste viaggio" della scheda
  // cliente): SET_VIEW porta con sé l'id della lista da aprire. Il seq
  // incrementale fa scattare l'effetto anche se si richiede due volte di
  // fila la stessa lista. Stesso meccanismo di state.dashboardQueue.
  const target = state.listeTarget;
  useEffect(() => {
    if (!target?.id) return;
    setOpenId(target.id);
  }, [target?.id, target?.seq]);

  // Ricarica dopo una scrittura: il dettaglio e i saldi della home vanno
  // entrambi aggiornati (il saldo cambia la riga in elenco).
  const reloadAll = useCallback(async () => {
    await Promise.all([loadHome(), openId ? loadDetail(openId) : Promise.resolve()]);
  }, [loadHome, loadDetail, openId]);

  const backToHome = useCallback(async () => {
    setOpenId(null);
    dispatch({ type: "CLEAR_LISTE_TARGET" });
    await loadHome();
  }, [dispatch, loadHome]);

  const visibili = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = filter === "cestino" ? cestino : liste;
    if (filter === "attive" || filter === "esaurite") {
      base = base.filter((l) => (filter === "attive" ? l.stato === "attiva" : l.stato === "esaurita"));
    }
    if (q) {
      base = base.filter((l) =>
        (l.clients?.name || "").toLowerCase().includes(q) ||
        (l.titolo || "").toLowerCase().includes(q));
    }
    return ordinaListe(base, saldi, sort);
  }, [liste, cestino, saldi, filter, search, sort]);

  const ripristina = async (id) => {
    const { ok } = await runListeCall(dispatch, ListeAPI.ripristina(id), "Lista ripristinata");
    if (ok) await loadHome();
  };

  // ─── chrome di navigazione (stile Tullio) ───
  const chrome = (
    <div style={{
      padding: isMobile ? "14px 16px 0" : "20px 28px 0",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <button
          onClick={() => dispatch({ type: "SET_VIEW", payload: "dashboard" })}
          style={{
            padding: "7px 14px", borderRadius: 9, border: "1px solid var(--border)",
            background: "var(--card)", color: "var(--navy)", cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
          }}
        >← Dashboard</button>
        <h1 className="playfair" style={{ fontSize: isMobile ? 19 : 23, color: "var(--heading)", minWidth: 0 }}>
          Liste viaggio
        </h1>
      </div>
    </div>
  );

  // Il Driver non ha accesso al modulo (RLS lato DB + gate lato client). Il
  // reducer riporta comunque alla Dashboard chi passa a un utente driver
  // mentre la vista è aperta: questo ramo copre il caso residuo.
  if (isDriver) {
    return (
      <div className="fade-in">
        {chrome}
        <div style={{ padding: isMobile ? 16 : 28, color: "var(--text-muted)", fontSize: 14 }}>
          Il modulo Liste viaggio non è disponibile per il tuo ruolo.
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <ListeStyles />
      {chrome}
      <div className="lv-root">
        <div className="lv-main">
          {loading ? (
            <div className="lv-card"><div className="lv-empty">Caricamento…</div></div>
          ) : loadError ? (
            <div className="lv-card">
              <div className="lv-empty">
                Non riesco a caricare le liste.
                <br />
                <span style={{ fontSize: 13 }}>{loadError}</span>
                <br />
                <button className="lv-btn" style={{ marginTop: 12 }} onClick={() => { setLoading(true); loadHome(); }}>
                  Riprova
                </button>
              </div>
            </div>
          ) : detail ? (
            <ListaDetail
              lista={detail.lista}
              movimenti={detail.movimenti}
              history={detail.history}
              usersById={usersById}
              dispatch={dispatch}
              onReload={reloadAll}
              onBack={backToHome}
              onArchived={backToHome}
            />
          ) : (
            <>
              <div className="lv-toolbar">
                <input
                  type="search"
                  placeholder="Cerca cliente…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setLimit(HOME_PAGE_SIZE); }}
                  aria-label="Cerca lista per cliente o titolo"
                />
                <select
                  value={filter}
                  onChange={(e) => { setFilter(e.target.value); setLimit(HOME_PAGE_SIZE); }}
                  aria-label="Filtra le liste"
                >
                  <option value="attive">Attive</option>
                  <option value="esaurite">Esaurite</option>
                  <option value="tutte">Tutte</option>
                  <option value="cestino">Cestino{cestino.length ? ` (${cestino.length})` : ""}</option>
                </select>
                <label className="lv-sel-lbl">
                  Ordina
                  <select value={sort} onChange={(e) => setSort(e.target.value)}>
                    {Object.entries(ORDINAMENTI).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </label>
                <button className="lv-btn primary" onClick={() => setNuovaOpen(true)}>+ Nuova lista</button>
              </div>

              <div className="lv-card">
                {visibili.length === 0 ? (
                  <div className="lv-empty">
                    {filter === "cestino"
                      ? "Il cestino è vuoto."
                      : <>Nessuna lista qui.<br />Crea la prima con “+ Nuova lista”.</>}
                  </div>
                ) : filter === "cestino" ? (
                  visibili.map((l) => (
                    <ListaRow key={l.id} lista={l} saldo={saldi[l.id]} trashed>
                      <button className="lv-btn sm" onClick={() => ripristina(l.id)}>Ripristina</button>
                    </ListaRow>
                  ))
                ) : (
                  <>
                    {visibili.slice(0, limit).map((l) => (
                      <ListaRow key={l.id} lista={l} saldo={saldi[l.id]} onOpen={() => setOpenId(l.id)} />
                    ))}
                    {visibili.length > limit && (
                      <div style={{ padding: "14px 16px", textAlign: "center" }}>
                        <button className="lv-btn" onClick={() => setLimit((n) => n + HOME_PAGE_SIZE)}>
                          Mostra altre liste ({visibili.length - limit} rimanenti)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {nuovaOpen && (
            <NuovaListaModal
              clients={clients}
              onClose={() => setNuovaOpen(false)}
              onCreate={{
                onError: (message) => dispatch({ type: "SHOW_TOAST", payload: { type: "error", message } }),
                run: async (payload) => {
                  const { ok, data: id } = await runListeCall(dispatch, ListeAPI.crea(payload), "Lista creata");
                  if (!ok) return false;
                  setNuovaOpen(false);
                  await loadHome();
                  setOpenId(id);
                  return true;
                },
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default ListeViaggio;
