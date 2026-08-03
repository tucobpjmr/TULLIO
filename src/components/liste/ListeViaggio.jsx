// src/components/liste/ListeViaggio.jsx
// Modulo "Liste Viaggio" (buoni viaggio): porting in React della SPA vanilla
// `liste-buoni-viaggio/index.html`, che condivide con VoyageDesk lo stesso
// progetto Supabase e la stessa anagrafica clienti/utenti.
//
// Il modulo non ha una voce di sidebar/bottom-nav: ci si arriva dal bottone
// nell'header della Dashboard e dal tab dentro la scheda cliente. Il ritorno
// alla Dashboard passa dal logo/voce già presente in Topbar.
//
// Il CONTENUTO mantiene di proposito lo stile originale (blu #0F4C81, font
// Inter, impaginazione "foglio cartaceo"); solo la chrome di navigazione —
// breadcrumb e testata — segue lo stile Tullio (navy/oro, Playfair).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { getRoleType, isAdmin } from "../../state/appGlobals.js";
import {
  ListeAPI, beneficiariNomi, downloadBlob, eur, fmtDate, intestazioneLista,
  runListeCall, saldoClass, todayISO,
} from "../../lib/listeApi.js";
import { ListeStyles } from "./listeStyles.jsx";
import { ListaDetail } from "./ListaDetail.jsx";
import {
  ConfirmModal, ImportaBackupConfirmModal, NuovaListaModal, ResetTotaleModal,
  StrumentiDatiModal,
} from "./listeModals.jsx";

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
        <b>{intestazioneLista(lista) || "—"}</b>
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
  const isAdminUser = isAdmin(uid);

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

  // Strumenti dati (backup/ripristino/reset) e hard delete dal cestino.
  const [strumentiOpen, setStrumentiOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState(null); // { payload, nL, nM }
  const [importProgress, setImportProgress] = useState(null); // { done, total }
  const [confirm, setConfirm] = useState(null); // { title, body, cta, danger, onOk }
  const fileInputRef = useRef(null);

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
        (l.titolo || "").toLowerCase().includes(q) ||
        beneficiariNomi(l).some((n) => n.toLowerCase().includes(q)));
    }
    return ordinaListe(base, saldi, sort);
  }, [liste, cestino, saldi, filter, search, sort]);

  // Conteggi per il menu a tendina del filtro. Senza, l'elenco mostra il
  // totale delle sole "Attive" (il filtro di default) mentre il backup conta
  // tutte le liste: due numeri diversi e nessun modo di capire perché.
  const conteggi = useMemo(() => ({
    attive: liste.filter((l) => l.stato === "attiva").length,
    esaurite: liste.filter((l) => l.stato === "esaurita").length,
    tutte: liste.length,
    cestino: cestino.length,
  }), [liste, cestino]);

  const ripristina = async (id) => {
    const { ok } = await runListeCall(dispatch, ListeAPI.ripristina(id), "Lista ripristinata");
    if (ok) await loadHome();
  };

  const eliminaDefinitiva = (l) => setConfirm({
    title: "Eliminare definitivamente?",
    body: `"${l.clients?.name || "questa lista"}" e tutti i suoi movimenti e storico verranno eliminati. L'operazione NON è reversibile.`,
    cta: "Elimina definitivamente",
    danger: true,
    onOk: async () => {
      setConfirm(null);
      const { ok } = await runListeCall(dispatch, ListeAPI.eliminaDefinitiva(l.id), "Lista eliminata definitivamente");
      if (ok) await loadHome();
    },
  });

  // ── Strumenti dati: backup JSON, ripristino da backup, reset totale ──
  const scaricaBackup = async () => {
    const { data, error } = await ListeAPI.backupData();
    if (error) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Errore: ${error.message}` } });
      return;
    }
    const backup = {
      app: "liste-viaggio", versione: 1, esportato_il: new Date().toISOString(), ...data,
    };
    downloadBlob(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      `backup_liste_viaggio_${todayISO()}.json`,
    );
    dispatch({
      type: "SHOW_TOAST",
      payload: { type: "success", message: `Backup scaricato: ${data.liste.length} liste, ${data.movimenti.length} movimenti` },
    });
  };

  const apriCaricaBackup = () => {
    setStrumentiOpen(false);
    fileInputRef.current?.click();
  };

  // Legge e valida il file scelto; il conteggio va mostrato PRIMA di scrivere,
  // così l'utente sa cosa sta per aggiungere (importa_backup fa solo merge:
  // aggiunge, salta i duplicati per id, non cancella nulla).
  const onBackupFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "File non valido: JSON non leggibile" } });
      return;
    }
    if (!data || data.app !== "liste-viaggio" || !Array.isArray(data.liste)) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Il file non sembra un backup di questa app." } });
      return;
    }
    setPendingImport({
      payload: { clients: data.clients || [], liste: data.liste || [], movimenti: data.movimenti || [] },
      nL: (data.liste || []).length,
      nM: (data.movimenti || []).length,
    });
  };

  const confermaImport = async () => {
    if (!pendingImport) return false;
    // Il ripristino ora è spezzato in più chiamate: su un backup grande può
    // durare parecchi secondi, e un bottone fermo su "Carico…" sembrerebbe
    // bloccato. L'avanzamento arriva dal layer dati, che sa quanti blocchi ha
    // già scritto.
    setImportProgress({ done: 0, total: 0 });
    const { ok, data: res } = await runListeCall(
      dispatch, ListeAPI.importaBackup(pendingImport.payload, setImportProgress), null,
    );
    setImportProgress(null);
    if (!ok) return false;
    setPendingImport(null);
    dispatch({
      type: "SHOW_TOAST",
      payload: { type: "success", message: `Backup caricato: +${res.clients_added} clienti, +${res.liste_added} liste, +${res.movimenti_added} movimenti` },
    });
    await loadHome();
    return true;
  };

  const confermaReset = async () => {
    const { ok, data: res } = await runListeCall(dispatch, ListeAPI.resetCompleto("RESET TOTALE"), null);
    if (!ok) return false;
    setResetOpen(false);
    dispatch({
      type: "SHOW_TOAST",
      payload: { type: "success", message: `Reset eseguito: ${res.liste_deleted} liste e ${res.movimenti_deleted} movimenti eliminati` },
    });
    await loadHome();
    return true;
  };

  const toastError = (message) => dispatch({ type: "SHOW_TOAST", payload: { type: "error", message } });

  // ─── chrome di navigazione (stile Tullio) ───
  // Nel dettaglio di una lista il titolo si centra e la freccia per tornare
  // all'elenco si affianca sulla stessa riga (pattern app bar mobile); nella
  // home, dove non c'è un "indietro", il titolo resta allineato a sinistra.
  const chrome = (
    <div style={{
      padding: isMobile ? "14px 16px 0" : "20px 28px 0",
      display: "flex", alignItems: "center",
      justifyContent: detail ? "center" : "space-between",
      position: "relative",
      gap: 12, flexWrap: "wrap",
    }}>
      {detail && (
        <button
          type="button"
          title="Torna a tutte le liste"
          aria-label="Torna a tutte le liste"
          onClick={backToHome}
          style={{
            position: "absolute", left: isMobile ? 16 : 28,
            width: 34, height: 34, borderRadius: "50%",
            background: "#fff", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, color: "var(--navy)", cursor: "pointer", flexShrink: 0,
          }}
        >
          ←
        </button>
      )}
      <h1 className="playfair" style={{ fontSize: isMobile ? 19 : 23, color: "var(--heading)", minWidth: 0 }}>
        Liste viaggio
      </h1>
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
              onArchived={backToHome}
              clients={clients}
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
                  <option value="attive">Attive ({conteggi.attive})</option>
                  <option value="esaurite">Esaurite ({conteggi.esaurite})</option>
                  <option value="tutte">Tutte ({conteggi.tutte})</option>
                  <option value="cestino">Cestino{conteggi.cestino ? ` (${conteggi.cestino})` : ""}</option>
                </select>
                <label className="lv-sel-lbl">
                  Ordina
                  <select value={sort} onChange={(e) => setSort(e.target.value)}>
                    {Object.entries(ORDINAMENTI).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </label>
                <button className="lv-btn" title="Strumenti dati (backup e reset)" onClick={() => setStrumentiOpen(true)}>
                  Strumenti dati
                </button>
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
                      <button className="lv-btn danger sm" onClick={() => eliminaDefinitiva(l)}>
                        Elimina definitivamente
                      </button>
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

          {/* Il file input resta fuori dalla modale Strumenti dati così
              "Carica backup" funziona anche dopo che la modale si è chiusa. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={onBackupFile}
          />

          {strumentiOpen && (
            <StrumentiDatiModal
              isAdminUser={isAdminUser}
              onClose={() => setStrumentiOpen(false)}
              onScaricaBackup={async () => { setStrumentiOpen(false); await scaricaBackup(); }}
              onCaricaBackup={apriCaricaBackup}
              onReset={() => { setStrumentiOpen(false); setResetOpen(true); }}
            />
          )}

          {pendingImport && (
            <ImportaBackupConfirmModal
              nL={pendingImport.nL}
              nM={pendingImport.nM}
              progress={importProgress}
              onClose={() => setPendingImport(null)}
              onSave={{ run: confermaImport, onError: toastError }}
            />
          )}

          {resetOpen && (
            <ResetTotaleModal
              onClose={() => setResetOpen(false)}
              onSave={{ run: confermaReset, onError: toastError }}
            />
          )}

          {confirm && (
            <ConfirmModal
              title={confirm.title}
              body={confirm.body}
              cta={confirm.cta}
              danger={confirm.danger}
              onCancel={() => setConfirm(null)}
              onConfirm={confirm.onOk}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default ListeViaggio;
