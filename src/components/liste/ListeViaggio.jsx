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
import { memo, useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useViewport } from "../ui/Viewport.jsx";
import { Icona } from "../ui/Icona.jsx";
import { useListeData } from "./useListeData.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useClients } from "../../state/ClientsContext.jsx";
import { useClientiCompleti } from "../../state/ClientiCompletiContext.jsx";
import { useListeWrite } from "./listePersistence.js";
import { useStrumentiDati } from "./useStrumentiDati.js";
import { overlayIniziale, overlayReducer } from "./listeReducers.js";
import "./liste.css";
import { ListaDetail } from "./ListaDetail.jsx";
import { ImportaBackupConfirmModal } from "./modals/ImportaBackupConfirmModal.jsx";
import { NuovaListaModal } from "./modals/NuovaListaModal.jsx";
import { ResetTotaleModal } from "./modals/ResetTotaleModal.jsx";
import { StrumentiDatiModal } from "./modals/StrumentiDatiModal.jsx";
// M-3 del 14 novembre: dettaglio, stato dell'elenco e UI dell'elenco hanno un
// file ciascuno. Qui resta la composizione: chi è aperto, gli overlay, la chrome.
import { useDettaglioLista } from "./useDettaglioLista.js";
import { useHomeListe } from "./useHomeListe.js";
import { ListeHome } from "./ListeHome.jsx";
import * as stiliComuni from "../../styles/common.js";
import { useDispatch } from "../../state/DispatchContext.jsx";


// ─── Modulo ────────────────────────────────────────────────────────────────
// `memo` + lettura dal contesto: vedi state/TasksContext.jsx. Il modulo non
// guarda i task, quindi consuma il solo contesto clienti; `listeTarget` (la
// lista da aprire, richiesta dal tab della scheda cliente) resta una prop,
// piccola e con identità stabile.
// La richiesta di aprire una lista precisa, quando c'è. Vedi la nota gemella
// in Dashboard.jsx: il ripiego è `null`, il tipo della prop no.
/** @typedef {import("../../state/reducer.js").RichiestaLista} RichiestaLista */

export const ListeViaggio = memo(function ListeViaggio({ listeTarget = /** @type {RichiestaLista|null} */ (null) }) {
  const dispatch = useDispatch();
  const { isMobile } = useViewport();
  const { team, io } = useAppData();
  const clientsRaw = useClients();
  // M-1 (passo 2) · `clients` alimenta i due selettori di TITOLARE e
  // COINTESTATARIO (NuovaListaModal, ListaDetail). Un titolare che non compare
  // nel selettore non è un dato mancante: è un operatore che ricrea una scheda
  // che esiste già — il doppione in anagrafica che la sottoscrizione realtime
  // su `clients` esiste per impedire.
  useClientiCompleti();
  // Chi può usare il modulo: una domanda sola, la stessa del reducer, delle
  // viste del core che ci linkano e di can_liste() sul database. Qui era
  // `getRoleType(uid) === "driver"`, cioè la quinta formulazione della stessa
  // regola — quella che, per un ruolo fuori enum o un utente disattivato,
  // rispondeva diversamente dalle altre quattro.
  const listeAllowed = io.accedeListe();
  const isAdminUser = io.isAdmin();

  // Dati della home + realtime: vedi useListeData. Prima erano cinque useState
  // locali con un `await loadHome()` manuale dopo ogni scrittura — tre query di
  // refetch completo per ogni modifica, e nessun evento quando a scrivere era
  // un altro utente.
  const { liste, cestino, saldi, loading, loadError, reload: loadHome } =
    useListeData({ enabled: listeAllowed });
  const esegui = useListeWrite();

  const [listaApertaId, impostaListaAperta] = useState(null);
  const { detail, ricarica: ricaricaDettaglio } = useDettaglioLista(listaApertaId);

  // Gli overlay del modulo — nuova lista, strumenti dati, reset totale,
  // conferma del ripristino da backup — in UNA macchina a stati: erano quattro
  // useState mutuamente esclusivi per costruzione ma non per rappresentazione
  // (ST-7). `dati` porta il corredo dell'overlay aperto: per "import" è
  // { payload, nL, nM, progress }.
  const [overlay, overlayDispatch] = useReducer(overlayReducer, overlayIniziale);
  const apriOverlay = (tipo, dati = null) => overlayDispatch({ type: "APRI", overlay: tipo, dati });
  const chiudiOverlay = () => overlayDispatch({ type: "CHIUDI" });

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


  // Apertura mirata da un'altra vista (tab "Liste viaggio" della scheda
  // cliente): SET_VIEW porta con sé l'id della lista da aprire. Il seq
  // incrementale fa scattare l'effetto anche se si richiede due volte di
  // fila la stessa lista. Stesso meccanismo di state.dashboardQueue.
  const target = listeTarget;
  useEffect(() => {
    if (!target?.id) return;
    impostaListaAperta(target.id);
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
    await Promise.all([loadHome(undefined, tabelle), ricaricaDettaglio()]);
  }, [loadHome, ricaricaDettaglio]);

  // ── Strumenti dati: backup in giù, backup in su, reset totale ──
  // Un file suo (M-5, audit del 25 agosto): è l'unico dei quattro lavori di
  // questo modulo che non tocca né l'elenco né il dettaglio — legge e riscrive
  // l'intero corpus da un file su disco.
  const {
    fileInputRef, scaricaBackup, apriCaricaBackup, onBackupFile,
    confermaImport, confermaReset,
  } = useStrumentiDati({
    overlay, overlayDispatch, apriOverlay, chiudiOverlay, ricarica: loadHome,
  });

  const backToHome = useCallback(async () => {
    impostaListaAperta(null);
    dispatch({ type: "CLEAR_LISTE_TARGET" });
    await loadHome();
  }, [dispatch, loadHome]);

  const home = useHomeListe({ liste, cestino, saldi });

  // Plain: `onError` delle modali porta anche messaggi di VALIDAZIONE («Digita
  // esattamente: RESET TOTALE»), non solo esiti di scrittura — `toastErrore`
  // ci premetterebbe «Salvataggio fallito» a un salvataggio mai partito.
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
            background: "var(--card)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, color: "var(--heading)", cursor: "pointer", flexShrink: 0,
          }}
        >
          <Icona nome="indietro" dimensione={18} spessore={2.6} />
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
                <span style={stiliComuni.txtF13}>{loadError}</span>
                <br />
                <button className="lv-btn" style={stiliComuni.mt12} onClick={() => loadHome()}>
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
              onReload={reloadAll}
              onArchived={backToHome}
              clients={clients}
              saldi={saldi}
            />
          ) : (
            <ListeHome
              home={home}
              saldi={saldi}
              onApri={impostaListaAperta}
              onNuova={() => apriOverlay("nuova")}
              onStrumenti={() => apriOverlay("strumenti")}
              ricaricaHome={loadHome}
            />
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
                  impostaListaAperta(id);
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
            style={stiliComuni.hidden}
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
              nB={overlay.dati.nB}
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
