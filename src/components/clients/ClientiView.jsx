// src/components/clients/ClientiView.jsx
// Anagrafica Clienti: elenco, ricerca, ordinamento e apertura del pannello di
// dettaglio. Modale, card e pannello vivono in moduli propri — erano sei
// componenti in questo file, di cui uno (la modale) da 120 righe.
import { memo, useReducer, useState, useMemo, useEffect, lazy } from "react";
import { ClienteModal } from "./ClienteModal.jsx";
import { ClienteCard } from "./ClienteCard.jsx";
import { ClienteDetailPanel } from "./ClienteDetailPanel.jsx";
import { useViewport } from "../Viewport.jsx";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";
import { LazyPanel } from "../ui/LazyPanel.jsx";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useTasks } from "../../state/TasksContext.jsx";
import { useClients } from "../../state/ClientsContext.jsx";
import { useClientiCompleti } from "../../state/ClientiCompletiContext.jsx";
// L'anagrafica chiede al modulo Liste un conteggio per cliente, non le sue
// query: vedi components/liste/listeModuleApi.js.
import { conteggioListePerCliente } from "../liste/listeModuleApi.js";
import { tasksDelCliente } from "../../lib/clientNotes.js";
import { indicizza, matchIndice, terminiRicerca } from "../../lib/searchUtils.js";
import { useFinestra } from "../../hooks/useFinestra.js";
import { MostraAltri } from "../ui/MostraAltri.jsx";
import { fieldStyle } from "./clientStyles.js";
import { Modal } from "../ui/Modal.jsx";
import { rowGap8, txtF13, txtF13Muted, txtF40Mb12 } from "../../styles/common.js";
import {
  boxF14Bold, boxF14Bold2, boxF14Muted, maxW1100, mb20, mt8,
  rowCenterBetween, rowCenterGap6, rowCenterGap62, rowCenterGap63, rowGap10, rowGap6Mt10,
  txtBoldMb6, txtF14Muted, txtF14Muted2, txtF16Bold, txtMutedTxtCenter,
} from "./clientiViewStyles.js";

// Chunk async: porta con sé lib/xlsx.js e resta chiuso nella grande
// maggioranza delle sessioni (import CSV/Excel, non il percorso comune).
const ClientImportModal = lazy(() =>
  import("./ClientImportModal.jsx").then(m => ({ default: m.ClientImportModal }))
);

// ST-9 · Quante card si disegnano alla volta. 24 = tre file da otto sulla
// griglia desktop (`minmax(340px, 1fr)`), una schermata piena su mobile.
const PAGINA = 24;

const CLIENT_SORT_OPTS = [
  { key: "name",    label: "Nome A-Z" },
  { key: "name_z",  label: "Nome Z-A" },
  { key: "date",    label: "Più recenti" },
  { key: "city",    label: "Città A-Z" },
];

// Filtro per appartenenza al modulo Liste viaggio. Le due popolazioni della
// tabella `clients` (anagrafiche CRM e intestatari dei buoni viaggio) sono
// mescolate per costruzione — è la stessa tabella, ed è giusto che lo sia —
// ma poterle separare a vista è ciò che rende l'elenco leggibile.
const LINK_FILTERS = [
  { key: "all",      label: "Tutti" },
  { key: "conListe", label: "Con liste viaggio" },
  { key: "soloCrm",  label: "Solo anagrafica" },
];

// ─── B-3 (audit di architettura del 15 agosto) · gli overlay in UNA macchina
// a stati ─────────────────────────────────────────────────────────────────
// I tre overlay dell'anagrafica — la modale nuovo/modifica cliente, l'import
// da Excel, la conferma di eliminazione — sono mutuamente esclusivi PER
// COSTRUZIONE (nessun handler ne apre due), ma non lo erano per
// RAPPRESENTAZIONE: tre `useState` indipendenti ammettono le otto
// combinazioni, di cui sette non devono esistere. È lo stesso rilievo che ST-7
// ha chiuso sugli overlay del modulo Liste, e la stessa forma della soluzione:
// uno stato solo, dove "aperto X" implica "chiuso tutto il resto" senza che
// nessun handler debba ricordarselo.
//
// Il pannello di dettaglio (`selectedClient` + `panelTab`) NON entra qui, ed è
// una distinzione che vale la pena scrivere: non è un overlay ma un pannello
// affiancato, resta legittimamente aperto MENTRE si apre una modale, e la
// conferma di eliminazione ci naviga dentro («Vedi le liste») invece di
// escluderlo. Sono due cose diverse che si somigliavano solo perché erano
// entrambe `useState(null)`.
const OVERLAY_CHIUSO = { tipo: null, cliente: null };

function overlayClientiReducer(_s, a) {
  switch (a.type) {
    case "NUOVO":    return { tipo: "modale", cliente: null };
    case "MODIFICA": return { tipo: "modale", cliente: a.cliente };
    case "IMPORTA":  return { tipo: "import", cliente: null };
    case "ELIMINA":  return { tipo: "elimina", cliente: a.cliente };
    case "CHIUDI":   return OVERLAY_CHIUSO;
    default:         return _s;
  }
}

// `memo` + lettura dal contesto: vedi state/TasksContext.jsx sul perché il
// provider da solo non basterebbe. Le prop rimaste — `dispatch` e il flag
// `loading` dell'idratazione CRM — hanno identità stabile.
export const ClientiView = memo(function ClientiView({ dispatch, loading = false }) {
  const { isMobile } = useViewport();
  const { currentUserId, canAccessListe, canEditClient, canDeleteClient } = useAppData();
  // A-1 dell'audit del 14 agosto (secondo passaggio): la RLS su public.clients
  // distingue chi può scrivere (admin/manager/agent) da chi può eliminare
  // (solo admin/manager) — prima la UI mostrava «Modifica»/«Rimuovi» a
  // chiunque, e solo il database decideva davvero, senza che l'utente lo
  // scoprisse (nessun errore su una DELETE che la RLS filtra a zero righe).
  const puoModificare = canEditClient(currentUserId);
  const puoEliminare = canDeleteClient(currentUserId);
  const tasks = useTasks();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name"); // v2.8 Round 8
  const [linkFilter, setLinkFilter] = useState("all");
  const [selectedClient, setSelectedClient] = useState(null); // v2.8 Round 9
  const [panelTab, setPanelTab] = useState(null); // tab da aprire nel pannello
  const [overlay, overlayDispatch] = useReducer(overlayClientiReducer, OVERLAY_CHIUSO);
  const chiudiOverlay = () => overlayDispatch({ type: "CHIUDI" });
  // { [clientId]: { attive, totali } } — vuoto finché la query non risponde,
  // e vuoto per sempre se fallisce: i badge spariscono, l'anagrafica resta
  // usabile. Non è un dato di cui bloccare la vista.
  const [listeByClient, setListeByClient] = useState(null);

  // Il contesto normalizza già a `[]` e mantiene l'identità stabile finché il
  // reducer non sostituisce l'array: l'useMemo che serviva a non ricreare
  // `state.clients || []` a ogni render non serve più.
  const clients = useClients();
  // M-1 (passo 2) · L'anagrafica È questa vista: elenco, ricerca, conteggi.
  // Dal 19 agosto l'idratazione non la scarica più all'avvio — la chiede chi
  // la guarda, e qui la si guarda. Senza questa riga la vista mostrerebbe le
  // sole schede finite in stato per altre vie (una creazione ottimistica, un
  // evento realtime) chiamandole anagrafica.
  useClientiCompleti();

  // Accesso al modulo Liste viaggio: senza il gate il tab comparirebbe e
  // mostrerebbe solo una lista vuota filtrata dalle policy. Era scritto qui
  // come `getRoleType(...) !== "driver"` — la sesta formulazione della stessa
  // regola, e l'unica che canAccessListe non aveva ancora assorbito perché non
  // passava da isDriver.
  const showListe = canAccessListe(currentUserId);

  // Quante liste viaggio ha ciascun cliente. Serve PRIMA di modificare o
  // eliminare, non dopo: è la differenza tra sapere che cosa si sta toccando
  // e scoprirlo da un errore di foreign key.
  useEffect(() => {
    if (!showListe) { setListeByClient(null); return; }
    let annullato = false;
    (async () => {
      try {
        const { data, error } = await conteggioListePerCliente();
        if (annullato) return;
        if (error) { console.error("[clienti] conteggio liste", error); return; }
        setListeByClient(data);
      } catch (ex) {
        // L'anagrafica deve restare usabile anche se il modulo Liste non
        // risponde: si perdono i badge, non la vista.
        console.error("[clienti] conteggio liste", ex);
      }
    })();
    return () => { annullato = true; };
  }, [showListe]);

  const listeDi = (c) => (c ? listeByClient?.[c.id] || null : null);

  const conteggi = useMemo(() => {
    if (!listeByClient) return null;
    const conListe = clients.filter(c => listeByClient[c.id]).length;
    return { all: clients.length, conListe, soloCrm: clients.length - conListe };
  }, [clients, listeByClient]);

  // M-3 · L'indice di ricerca dell'anagrafica. Si ricostruisce solo quando
  // cambia l'anagrafica (import, realtime, creazione), NON a ogni battuta: la
  // normalizzazione dipende dalla riga e non dalla query, e rifarla per 835
  // righe a ogni carattere digitato costava 6,32 ms contro 0,19 (su un
  // telefono di fascia media, 3-5×, sono 20-30 ms PRIMA del render React).
  const indice = useMemo(
    () => clients.map(c => ({ c, idx: indicizza(c.name, c.email, c.city, c.phone, c.notes) })),
    [clients]);

  const filtered = useMemo(() => {
    // Stessa normalizzazione dell'elenco liste viaggio (lib/searchUtils.js):
    // le due ricerche lavorano sugli stessi nomi e devono trovare le stesse
    // cose, altrimenti un cliente visibile qui sembra non avere liste là.
    const termini = terminiRicerca(search);
    let base = indice.filter(r => matchIndice(termini, r.idx)).map(r => r.c);
    if (listeByClient && linkFilter !== "all") {
      base = base.filter(c => (linkFilter === "conListe" ? !!listeByClient[c.id] : !listeByClient[c.id]));
    }
    return [...base].sort((a, b) => {
      if (sortBy === "name")   return (a.name || "").localeCompare(b.name || "", "it");
      if (sortBy === "name_z") return (b.name || "").localeCompare(a.name || "", "it");
      if (sortBy === "city")   return (a.city || "").localeCompare(b.city || "", "it");
      // date: più recenti prima (createdAt desc)
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [indice, search, sortBy, linkFilter, listeByClient]);

  // ST-9 · La finestra visibile. ✅ 818 clienti in anagrafica: senza limite si
  // montavano 818 ClienteCard, ognuna con il proprio useMemo sulle note e il
  // chip del conteggio liste. La meccanica (finestra + riazzeramento a ogni
  // restringimento) vive in `hooks/useFinestra.js` dal rilievo M-2: era scritta
  // qui e, identica, in ListeViaggio — e le altre cinque viste con elenchi
  // lunghi non l'avevano affatto.
  const finestra = useFinestra(filtered, PAGINA, [search, linkFilter, sortBy]);
  const visibili = finestra.visibili;

  // M-1 · Attende l'esito e lo RIPORTA; chi chiude è la modale (che è anche
  // l'unica a sapere se ha ancora dati da proteggere). Prima questa funzione
  // dispatchava senza `await` e terminava con `setModal(null)`: la modale
  // spariva nello stesso turno, quindi il suo «Salvataggio...» era un ramo
  // irraggiungibile e su una scrittura rifiutata (RLS, rete) l'anagrafica
  // digitata se ne andava con lei.
  const handleSave = async (form, { renameTasks = [] } = {}) => {
    const res = overlay.cliente
      ? await dispatch({ type: "UPDATE_CLIENT", payload: { ...overlay.cliente, ...form } })
      : await dispatch({ type: "ADD_CLIENT", payload: { id: crypto.randomUUID(), ...form, createdAt: new Date().toISOString() } });

    if (res?.error) return res;

    // Il campo Cliente dei task è una copia testuale del nome, non un
    // collegamento: se non lo si porta dietro, il rename lo lascia indietro
    // in silenzio. L'utente ha spuntato la casella, quindi lo aggiorniamo —
    // ma solo se il cliente è stato scritto DAVVERO: rinominare i task dopo
    // una scrittura fallita li allontanerebbe da un'anagrafica rimasta com'era.
    if (renameTasks.length && overlay.cliente) {
      await dispatch({
        type: "RENAME_CLIENT_IN_TASKS",
        payload: { from: overlay.cliente.name, to: form.name },
      });
    }
    return { error: null };
  };

  const handleDelete = (cliente) => {
    dispatch({ type: "DELETE_CLIENT", payload: cliente.id });
    chiudiOverlay();
  };

  return (
    <div className="vd-pad" style={maxW1100}>
      {/* Header */}
      <div style={rowCenterBetween}>
        <div>
          <h1 className="playfair" style={{ fontSize: isMobile ? 22 : 26, color: "var(--heading)", marginBottom: 4 }}>
            Clienti
          </h1>
          <div style={txtF13Muted}>
            {loading && clients.length === 0
              ? "Caricamento…"
              : `${clients.length} ${clients.length === 1 ? "cliente" : "clienti"} in anagrafica`}
          </div>
        </div>
        {/* Import e "Nuovo cliente" scrivono entrambi via un insert su
            clients (ADD_CLIENT/ADD_CLIENTS_BULK), governato dalla stessa
            policy RLS di canEditClient — nasconderli a chi non ha il
            permesso evita di offrire un'azione che il database respingerebbe. */}
        {puoModificare && (
        <div style={rowGap8}>
          <button
            onClick={() => overlayDispatch({ type: "IMPORTA" })}
            style={rowCenterGap6}
          >
            📥 Importa da Excel
          </button>
          <button
            onClick={() => overlayDispatch({ type: "NUOVO" })}
            style={rowCenterGap62}
          >
            + Nuovo cliente
          </button>
        </div>
        )}
      </div>

      {/* Search + Sort */}
      <div style={mb20}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome, email, città, telefono…"
          style={{ ...fieldStyle, maxWidth: 360 }}
        />
        <div style={rowGap6Mt10}>
          {CLIENT_SORT_OPTS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortBy(opt.key)}
              style={{
                padding: "4px 12px", borderRadius: 999, cursor: "pointer",
                fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                border: `1px solid ${sortBy === opt.key ? "var(--navy)" : "var(--border)"}`,
                background: sortBy === opt.key ? "var(--navy)" : "var(--card)",
                color: sortBy === opt.key ? "#fff" : "var(--text-muted)",
                transition: "all 0.15s",
              }}
            >{opt.label}</button>
          ))}
        </div>
        {conteggi && conteggi.conListe > 0 && (
          <div style={rowCenterGap63}>
            {LINK_FILTERS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setLinkFilter(opt.key)}
                style={{
                  padding: "4px 12px", borderRadius: 999, cursor: "pointer",
                  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${linkFilter === opt.key ? "var(--gold-dark)" : "var(--border)"}`,
                  background: linkFilter === opt.key ? "rgba(212,168,67,0.16)" : "var(--card)",
                  color: linkFilter === opt.key ? "var(--gold-dark)" : "var(--text-muted)",
                  transition: "all 0.15s",
                }}
              >{opt.label} ({conteggi[opt.key]})</button>
            ))}
          </div>
        )}
      </div>

      {/* Lista */}
      {loading && clients.length === 0 ? (
        <SkeletonCards />
      ) : filtered.length === 0 ? (
        <div style={txtMutedTxtCenter}>
          {search ? "Nessun cliente trovato" : (
            <div>
              <div style={txtF40Mb12}>👤</div>
              <div style={txtBoldMb6}>Nessun cliente ancora</div>
              <div style={txtF13}>Aggiungi il primo cliente per iniziare</div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
            {visibili.map(c => (
              <ClienteCard
                key={c.id}
                cliente={c}
                onEdit={puoModificare ? (c => overlayDispatch({ type: "MODIFICA", cliente: c })) : null}
                onDelete={puoEliminare ? (c => overlayDispatch({ type: "ELIMINA", cliente: c })) : null}
                onSelect={c => { setPanelTab(null); setSelectedClient(sc => sc?.id === c.id ? null : c); }}
                selected={selectedClient?.id === c.id}
                liste={listeDi(c)}
              />
            ))}
          </div>
          {/* Il totale resta VERO anche a finestra ridotta: "24 di 818" e "24"
              sono due affermazioni diverse su dati operativi, e questa vista
              serve a rispondere alla domanda "quanti clienti ho". */}
          <MostraAltri
            finestra={finestra}
            azione={`Mostra altri ${Math.min(PAGINA, finestra.restanti)} di ${finestra.restanti}`}
            conteggio={`${visibili.length} di ${finestra.totale} clienti`}
          />
        </>
      )}

      {/* Pannello del cliente selezionato (v2.8 Round 9): task + liste viaggio */}
      {selectedClient && (
        <ClienteDetailPanel
          cliente={selectedClient}
          tasks={tasks}
          dispatch={dispatch}
          onClose={() => { setSelectedClient(null); setPanelTab(null); }}
          showListe={showListe}
          liste={listeDi(selectedClient)}
          initialTab={panelTab}
        />
      )}

      {/* Modal add/edit */}
      {overlay.tipo === "modale" && (
        <ClienteModal
          cliente={overlay.cliente}
          onSave={handleSave}
          onClose={chiudiOverlay}
          liste={listeDi(overlay.cliente)}
          tasksCollegati={overlay.cliente ? tasksDelCliente(tasks, overlay.cliente.name) : []}
        />
      )}

      {/* Import anagrafica da Excel/CSV */}
      {overlay.tipo === "import" && (
        <LazyPanel resetKey="import-clienti" onReset={chiudiOverlay} overlay>
          <ClientImportModal
            existingClients={clients}
            onImport={(newClients) => dispatch({ type: "ADD_CLIENTS_BULK", payload: newClients })}
            onClose={chiudiOverlay}
          />
        </LazyPanel>
      )}

      {/* Conferma eliminazione — o spiegazione del perché non si può */}
      {overlay.tipo === "elimina" && (() => {
        const confirmDelete = overlay.cliente;
        const l = listeDi(confirmDelete);
        // Le liste viaggio puntano al cliente con una foreign key: finché ne
        // esiste una (anche solo nel cestino, che è un soft delete) il
        // database rifiuta l'eliminazione. Meglio dirlo qui, con il numero,
        // che far premere "Rimuovi" e restituire un errore.
        const bloccato = (l?.totali || 0) > 0;
        return (
          <Modal
            open
            onClose={chiudiOverlay}
            labelledBy="vd-cliente-del-title"
            width="min(420px, 92vw)"
            cardStyle={{ borderRadius: 12, padding: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}
          >
            <div id="vd-cliente-del-title" style={txtF16Bold}>
              {bloccato ? "Non si può rimuovere" : "Rimuovi cliente"}
            </div>
            {bloccato ? (
              <div style={txtF14Muted}>
                <strong>{confirmDelete.name}</strong> è collegato a{" "}
                {l.totali === 1 ? "una lista viaggio" : `${l.totali} liste viaggio`}{" "}
                (come titolare o cointestatario)
                {l.totali > l.attive && `, di cui ${l.totali - l.attive} nel cestino: restano collegate anche lì`}.
                <div style={mt8}>
                  Le liste sono agganciate a questa scheda: per rimuoverla vanno prima
                  eliminate definitivamente dal cestino del modulo Liste viaggio, o questo
                  cliente va rimosso come cointestatario dalle liste dove non è titolare.
                </div>
              </div>
            ) : (
              <div style={txtF14Muted2}>
                Rimuovere <strong>{confirmDelete.name}</strong> dall'anagrafica?
              </div>
            )}
            <div style={rowGap10}>
              <button onClick={chiudiOverlay} style={boxF14Muted}>{bloccato ? "Chiudi" : "Annulla"}</button>
              {bloccato ? (
                showListe && (
                  <button onClick={() => {
                    setSelectedClient(confirmDelete);
                    setPanelTab("liste");
                    chiudiOverlay();
                  }} style={boxF14Bold}>Vedi le liste</button>
                )
              ) : (
                <button onClick={() => handleDelete(confirmDelete)} style={boxF14Bold2}>Rimuovi</button>
              )}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
});
