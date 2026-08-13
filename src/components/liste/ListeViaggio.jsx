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
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { useListeData } from "./useListeData.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useClients } from "../../state/ClientsContext.jsx";
import { ListeAPI, downloadBlob, todayISO } from "./listeApi.js";
import { useListeWrite } from "./listePersistence.js";
import { overlayIniziale, overlayReducer } from "./listeReducers.js";
import { terminiRicerca } from "../../lib/searchUtils.js";
import { ListeStyles } from "./listeStyles.jsx";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import { ListaDetail } from "./ListaDetail.jsx";
import { ImportaBackupConfirmModal } from "./modals/ImportaBackupConfirmModal.jsx";
import { NuovaListaModal } from "./modals/NuovaListaModal.jsx";
import { ResetTotaleModal } from "./modals/ResetTotaleModal.jsx";
import { StrumentiDatiModal } from "./modals/StrumentiDatiModal.jsx";
// Filtro, insiemi e ordinamento della home + la riga dell'elenco: estratti da
// questo file in A-4 (audit del 12 agosto), quando aveva raggiunto 495/500
// righe. Pure funzioni e un componente senza stato proprio — nessun
// consumatore oltre a questo modulo e ai test che li esercitano direttamente.
import { FILTRI, FILTRI_ALTROVE, filtraListe, ORDINAMENTI, ordinaListe } from "./listeOrdinamento.js";
import { ListaRow } from "./ListaRow.jsx";
import { hidden, mt12, txtF13 } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowMiddleGap8 = { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 10 };
const txtCenter = { padding: "14px 16px", textAlign: "center" };

const HOME_PAGE_SIZE = 10;

// ─── Modulo ────────────────────────────────────────────────────────────────
// `memo` + lettura dal contesto: vedi state/TasksContext.jsx. Il modulo non
// guarda i task, quindi consuma il solo contesto clienti; `listeTarget` (la
// lista da aprire, richiesta dal tab della scheda cliente) resta una prop,
// piccola e con identità stabile.
export const ListeViaggio = memo(function ListeViaggio({ dispatch, listeTarget = null }) {
  const { isMobile } = useViewport();
  const { team, currentUserId, isAdmin, canAccessListe } = useAppData();
  const clientsRaw = useClients();
  const uid = currentUserId;
  // Chi può usare il modulo: una domanda sola, la stessa del reducer, delle
  // viste del core che ci linkano e di can_liste() sul database. Qui era
  // `getRoleType(uid) === "driver"`, cioè la quinta formulazione della stessa
  // regola — quella che, per un ruolo fuori enum o un utente disattivato,
  // rispondeva diversamente dalle altre quattro.
  const listeAllowed = canAccessListe(uid);
  const isAdminUser = isAdmin(uid);

  // Dati della home + realtime: vedi useListeData. Prima erano cinque useState
  // locali con un `await loadHome()` manuale dopo ogni scrittura — tre query di
  // refetch completo per ogni modifica, e nessun evento quando a scrivere era
  // un altro utente.
  const { liste, cestino, saldi, loading, loadError, reload: loadHome } =
    useListeData({ enabled: listeAllowed });
  const esegui = useListeWrite(dispatch);

  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null); // { lista, movimenti, history }

  // Quattro valori INDIPENDENTI dell'elenco: si cerca dentro un filtro, con un
  // ordinamento, mostrando N righe. Restano useState separati di proposito —
  // non sono una macchina a stati e accorparli è la parte del rilievo ST-7 che
  // non va fatta (vedi il commento in listeReducers.js).
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("attive");
  const [sort, setSort] = useState("recenti");
  const [limit, setLimit] = useState(HOME_PAGE_SIZE);

  // Gli overlay del modulo — nuova lista, strumenti dati, reset totale,
  // conferma del ripristino da backup — in UNA macchina a stati: erano quattro
  // useState mutuamente esclusivi per costruzione ma non per rappresentazione
  // (ST-7). `dati` porta il corredo dell'overlay aperto: per "import" è
  // { payload, nL, nM, progress }.
  const [overlay, overlayDispatch] = useReducer(overlayReducer, overlayIniziale);
  const apriOverlay = (tipo, dati = null) => overlayDispatch({ type: "APRI", overlay: tipo, dati });
  const chiudiOverlay = () => overlayDispatch({ type: "CHIUDI" });
  const conferma = useConfirm();
  const fileInputRef = useRef(null);

  // L'anagrafica clienti e il team sono già idratati nello state globale
  // dell'app (stesse tabelle `clients`/`users` del modulo): li riusiamo invece
  // di rifare le due query che faceva la SPA.
  const clients = useMemo(
    () => [...clientsRaw].sort((a, b) => (a.name || "").localeCompare(b.name || "", "it")),
    [clientsRaw],
  );
  const usersById = useMemo(() => {
    const m = {};
    for (const t of team || []) m[t.id] = t.name;
    return m;
  }, [team]);

  // Guardia di staleness del dettaglio: stessa disciplina di useListeData,
  // generazione propria. Senza, il dettaglio di una lista chiusa (o
  // sostituita da un'altra appena aperta) può arrivare in ritardo e
  // sovrascrivere quello della lista che l'utente sta guardando ora — un
  // `setDetail` di A che atterra dopo che si è già passati a B.
  const detailGenRef = useRef(0);

  const loadDetail = useCallback(async (id) => {
    const mia = ++detailGenRef.current;
    const [rLista, rMovs, rHist] = await Promise.all([
      ListeAPI.get(id), ListeAPI.movimenti(id), ListeAPI.history(id),
    ]);
    if (mia !== detailGenRef.current) return; // una loadDetail più recente è già partita
    const failed = [rLista, rMovs, rHist].find((r) => r.error);
    if (failed) {
      console.error("[liste] dettaglio", failed.error);
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Errore: ${failed.error.message}` } });
      return;
    }
    setDetail({ lista: rLista.data, movimenti: rMovs.data || [], history: rHist.data || [] });
  }, [dispatch]);

  useEffect(() => {
    // Chiusura: nessuna loadDetail in volo resta legittima. Bump esplicito
    // (nessuna nuova loadDetail la farebbe da sola) così una risposta tardiva
    // per la lista appena chiusa non può riapparire nel dettaglio.
    if (!openId) { detailGenRef.current += 1; setDetail(null); return; }
    loadDetail(openId);
  }, [openId, loadDetail]);

  // Apertura mirata da un'altra vista (tab "Liste viaggio" della scheda
  // cliente): SET_VIEW porta con sé l'id della lista da aprire. Il seq
  // incrementale fa scattare l'effetto anche se si richiede due volte di
  // fila la stessa lista. Stesso meccanismo di state.dashboardQueue.
  const target = listeTarget;
  useEffect(() => {
    if (!target?.id) return;
    setOpenId(target.id);
  }, [target?.id, target?.seq]);

  // Ricarica dopo una scrittura: il dettaglio va SEMPRE ricaricato (il saldo,
  // i movimenti o i campi della lista possono essere cambiati), la home solo
  // per la parte che `tabelle` dichiara invalidata — è ListaDetail, che sa
  // quale scrittura ha appena fatto, a passarla. Nessun argomento (default
  // `null`) è il default prudente per chi non si esprime: reload completo
  // della home, cioè il comportamento precedente a questa correzione.
  //
  // `loadHome(undefined, tabelle)`: il primo argomento resta `undefined` così
  // useListeData applica il proprio default (`() => true`) — la protezione
  // anti-race qui non dipende più da questo argomento, viene dal generation
  // counter condiviso dentro useListeData stesso.
  const reloadAll = useCallback(async (tabelle = null) => {
    await Promise.all([loadHome(undefined, tabelle), openId ? loadDetail(openId) : Promise.resolve()]);
  }, [loadHome, loadDetail, openId]);

  const backToHome = useCallback(async () => {
    setOpenId(null);
    dispatch({ type: "CLEAR_LISTE_TARGET" });
    await loadHome();
  }, [dispatch, loadHome]);

  // La ricerca si applica a TUTTI e quattro gli insiemi, non solo a quello
  // selezionato: il filtro decide cosa si mostra, ma i conteggi degli altri
  // servono per dire dove sono finiti i risultati che non si vedono.
  const risultati = useMemo(() => {
    const attive = liste.filter((l) => l.stato === "attiva");
    const esaurite = liste.filter((l) => l.stato === "esaurita");
    return {
      attive: filtraListe(attive, search),
      esaurite: filtraListe(esaurite, search),
      tutte: filtraListe(liste, search),
      cestino: filtraListe(cestino, search),
    };
  }, [liste, cestino, search]);

  const visibili = useMemo(
    () => ordinaListe(risultati[filter] || [], saldi, sort),
    [risultati, filter, saldi, sort],
  );

  // Conteggi per il menu a tendina del filtro. Senza, l'elenco mostra il
  // totale delle sole "Attive" (il filtro di default) mentre il backup conta
  // tutte le liste: due numeri diversi e nessun modo di capire perché.
  const conteggi = useMemo(() => ({
    attive: liste.filter((l) => l.stato === "attiva").length,
    esaurite: liste.filter((l) => l.stato === "esaurita").length,
    tutte: liste.length,
    cestino: cestino.length,
  }), [liste, cestino]);

  // Risultati che la ricerca ha trovato ma che il filtro corrente nasconde.
  // È il caso in cui l'elenco mente per omissione: la lista di un cliente
  // esiste, l'anagrafica la conta nel suo badge, ma è ESAURITA e il filtro di
  // default mostra solo le attive — quindi qui non compare e sembra un
  // problema della ricerca.
  const altrove = useMemo(() => {
    if (!terminiRicerca(search).length) return [];
    return (FILTRI_ALTROVE[filter] || [])
      .map((k) => ({ key: k, n: (risultati[k] || []).length }))
      .filter((x) => x.n > 0);
  }, [search, filter, risultati]);

  const vaiA = (key) => { setFilter(key); setLimit(HOME_PAGE_SIZE); };

  // "Esaurite (1)" oppure "Esaurite (1) · Cestino (2)", come bottoni che
  // portano dove i risultati sono.
  const altroveChips = altrove.map(({ key, n }) => (
    <button key={key} type="button" className="lv-btn sm" onClick={() => vaiA(key)}>
      {FILTRI[key]} ({n})
    </button>
  ));

  const ripristina = async (id) => {
    const { ok } = await esegui("ripristinaLista", id);
    if (ok) await loadHome();
  };

  const eliminaDefinitiva = async (l) => {
    if (!(await conferma({
      title: "Eliminare definitivamente?",
      body: `"${l.clients?.name || "questa lista"}" e tutti i suoi movimenti e storico verranno eliminati. L'operazione NON è reversibile.`,
      cta: "Elimina definitivamente",
      danger: true,
    }))) return;
    const { ok } = await esegui("eliminaListaDefinitivamente", l.id);
    if (ok) await loadHome();
  };

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
    chiudiOverlay();
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
    apriOverlay("import", {
      payload: { clients: data.clients || [], liste: data.liste || [], movimenti: data.movimenti || [] },
      nL: (data.liste || []).length,
      nM: (data.movimenti || []).length,
      progress: null,
    });
  };

  const confermaImport = async () => {
    if (overlay.tipo !== "import") return false;
    // Il ripristino ora è spezzato in più chiamate: su un backup grande può
    // durare parecchi secondi, e un bottone fermo su "Carico…" sembrerebbe
    // bloccato. L'avanzamento arriva dal layer dati, che sa quanti blocchi ha
    // già scritto — ed è l'unico dato che cambia mentre l'overlay resta aperto,
    // quindi PROGRESSO e non una transizione.
    overlayDispatch({ type: "PROGRESSO", progress: { done: 0, total: 0 } });
    const { ok, data: res } = await esegui(
      "importaBackup",
      overlay.dati.payload,
      (progress) => overlayDispatch({ type: "PROGRESSO", progress }),
    );
    // Fallito: l'avanzamento sparisce ma la modale resta aperta, così si può
    // riprovare senza riscegliere il file.
    overlayDispatch({ type: "PROGRESSO", progress: null });
    if (!ok) return false;
    chiudiOverlay();
    dispatch({
      type: "SHOW_TOAST",
      payload: { type: "success", message: `Backup caricato: +${res.clients_added} clienti, +${res.liste_added} liste, +${res.movimenti_added} movimenti` },
    });
    await loadHome();
    return true;
  };

  const confermaReset = async () => {
    const { ok, data: res } = await esegui("resetTotale");
    if (!ok) return false;
    chiudiOverlay();
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

  // Chi non ha accesso al modulo (RLS lato DB + gate lato client). Il reducer
  // riporta comunque alla Dashboard chi passa a un utente senza accesso mentre
  // la vista è aperta: questo ramo copre il caso residuo.
  if (!listeAllowed) {
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
                <span style={txtF13}>{loadError}</span>
                <br />
                <button className="lv-btn" style={mt12} onClick={() => loadHome()}>
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
                  placeholder="Cerca cliente, cointestatario o titolo…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setLimit(HOME_PAGE_SIZE); }}
                  aria-label="Cerca lista per cliente, cointestatario o titolo"
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
                <button className="lv-btn" title="Strumenti dati (backup e reset)" onClick={() => apriOverlay("strumenti")}>
                  Strumenti dati
                </button>
                <button className="lv-btn primary" onClick={() => apriOverlay("nuova")}>+ Nuova lista</button>
              </div>

              {/* Risultati nascosti dal filtro: si dice sempre, anche quando
                  l'elenco NON è vuoto — cercando "COLUCCI" fra le attive si
                  vedono tre liste e non si sospetta la quarta, esaurita. */}
              {visibili.length > 0 && altrove.length > 0 && (
                <div className="lv-altrove">
                  <span>Altri risultati per “{search.trim()}” fuori da “{FILTRI[filter]}”:</span>
                  {altroveChips}
                </div>
              )}

              <div className="lv-card">
                {visibili.length === 0 ? (
                  <div className="lv-empty">
                    {terminiRicerca(search).length ? (
                      <>
                        Nessuna lista trovata per “{search.trim()}” in “{FILTRI[filter]}”.
                        {altrove.length > 0 && (
                          <>
                            <br />
                            <span style={txtF13}>Ma c’è altrove:</span>
                            <div style={rowMiddleGap8}>
                              {altroveChips}
                            </div>
                          </>
                        )}
                      </>
                    ) : filter === "cestino" ? (
                      "Il cestino è vuoto."
                    ) : (
                      <>Nessuna lista qui.<br />Crea la prima con “+ Nuova lista”.</>
                    )}
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
                      <div style={txtCenter}>
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

          {overlay.tipo === "nuova" && (
            <NuovaListaModal
              clients={clients}
              onClose={chiudiOverlay}
              onCreate={{
                onError: (message) => dispatch({ type: "SHOW_TOAST", payload: { type: "error", message } }),
                run: async (payload) => {
                  const { ok, data: id } = await esegui("creaLista", payload);
                  if (!ok) return false;
                  chiudiOverlay();
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
            style={hidden}
            onChange={onBackupFile}
          />

          {/* "Vai al reset" era due scritture per una transizione sola
              (`setStrumentiOpen(false); setResetOpen(true);`): fra le due, lo
              stato "due overlay aperti" era rappresentabile. Ora è una APRI, e
              la sostituzione la garantisce il reducer. */}
          {overlay.tipo === "strumenti" && (
            <StrumentiDatiModal
              isAdminUser={isAdminUser}
              onClose={chiudiOverlay}
              onScaricaBackup={async () => { chiudiOverlay(); await scaricaBackup(); }}
              onCaricaBackup={apriCaricaBackup}
              onReset={() => apriOverlay("reset")}
            />
          )}

          {overlay.tipo === "import" && (
            <ImportaBackupConfirmModal
              nL={overlay.dati.nL}
              nM={overlay.dati.nM}
              progress={overlay.dati.progress}
              onClose={chiudiOverlay}
              onSave={{ run: confermaImport, onError: toastError }}
            />
          )}

          {overlay.tipo === "reset" && (
            <ResetTotaleModal
              onClose={chiudiOverlay}
              onSave={{ run: confermaReset, onError: toastError }}
            />
          )}
        </div>
      </div>
    </div>
  );
});

export default ListeViaggio;
