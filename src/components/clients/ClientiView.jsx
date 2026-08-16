// src/components/clients/ClientiView.jsx
// Anagrafica Clienti: elenco, ricerca, ordinamento e apertura del pannello di
// dettaglio. Modale, card e pannello vivono in moduli propri — erano sei
// componenti in questo file, di cui uno (la modale) da 120 righe.
import { memo, useState, useMemo, useEffect, lazy } from "react";
import { ClienteModal } from "./ClienteModal.jsx";
import { ClienteCard } from "./ClienteCard.jsx";
import { ClienteDetailPanel } from "./ClienteDetailPanel.jsx";
import { useViewport } from "../Viewport.jsx";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";
import { LazyPanel } from "../ui/LazyPanel.jsx";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useTasks } from "../../state/TasksContext.jsx";
import { useClients } from "../../state/ClientsContext.jsx";
// L'anagrafica chiede al modulo Liste un conteggio per cliente, non le sue
// query: vedi components/liste/listeModuleApi.js.
import { conteggioListePerCliente } from "../liste/listeModuleApi.js";
import { tasksDelCliente } from "../../lib/clientNotes.js";
import { matchTermini, terminiRicerca } from "../../lib/searchUtils.js";
import { fieldStyle } from "./clientStyles.js";
import { Modal } from "../ui/Modal.jsx";
import { rowGap8, txtF13, txtF13Muted, txtF40Mb12 } from "../../styles/common.js";
import {
  boxF13Bold, boxF14Bold, boxF14Bold2, boxF14Muted, colCenterGap6, maxW1100, mb20, mt8,
  rowCenterBetween, rowCenterGap6, rowCenterGap62, rowCenterGap63, rowGap10, rowGap6Mt10,
  txtBoldMb6, txtF115Muted, txtF14Muted, txtF14Muted2, txtF16Bold, txtMutedTxtCenter,
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
  const [modal, setModal] = useState(null); // null | { mode: "add" | "edit", cliente?: {} }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  // { [clientId]: { attive, totali } } — vuoto finché la query non risponde,
  // e vuoto per sempre se fallisce: i badge spariscono, l'anagrafica resta
  // usabile. Non è un dato di cui bloccare la vista.
  const [listeByClient, setListeByClient] = useState(null);

  // Il contesto normalizza già a `[]` e mantiene l'identità stabile finché il
  // reducer non sostituisce l'array: l'useMemo che serviva a non ricreare
  // `state.clients || []` a ogni render non serve più.
  const clients = useClients();

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

  const filtered = useMemo(() => {
    // Stessa normalizzazione dell'elenco liste viaggio (lib/searchUtils.js):
    // le due ricerche lavorano sugli stessi nomi e devono trovare le stesse
    // cose, altrimenti un cliente visibile qui sembra non avere liste là.
    const termini = terminiRicerca(search);
    let base = clients.filter(c =>
      matchTermini(termini, c.name, c.email, c.city, c.phone, c.notes));
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
  }, [clients, search, sortBy, linkFilter, listeByClient]);

  // ST-9 · La finestra visibile. ✅ 818 clienti in anagrafica: senza limite si
  // montavano 818 ClienteCard, ognuna con il proprio useMemo sulle note e il
  // chip del conteggio liste. Non è una libreria di virtualizzazione — sarebbe
  // la risposta giusta a 10.000 righe, non a 818, e porterebbe una dipendenza
  // in un progetto che ne ha volutamente una sola. È lo STESSO pattern che il
  // modulo Liste applica già a 616 liste (`HOME_PAGE_SIZE` in ListeViaggio):
  // la differenza fra le due viste non era una decisione, era che sono state
  // scritte in momenti diversi.
  const [limite, setLimite] = useState(PAGINA);
  // Ogni restringimento riazzera la finestra: chi cerca "Rossi" si aspetta di
  // vedere i Rossi, non i primi 24 di una finestra aperta su un'altra ricerca.
  // L'ordinamento è nell'elenco per la stessa ragione — cambiarlo ridefinisce
  // *quali* sono i primi 24.
  useEffect(() => { setLimite(PAGINA); }, [search, linkFilter, sortBy]);
  const visibili = useMemo(() => filtered.slice(0, limite), [filtered, limite]);
  const restanti = filtered.length - visibili.length;

  const handleSave = async (form, { renameTasks = [] } = {}) => {
    if (modal?.mode === "edit" && modal.cliente) {
      dispatch({ type: "UPDATE_CLIENT", payload: { ...modal.cliente, ...form } });
      // Il campo Cliente dei task è una copia testuale del nome, non un
      // collegamento: se non lo si porta dietro, il rename lo lascia indietro
      // in silenzio. L'utente ha spuntato la casella, quindi lo aggiorniamo.
      if (renameTasks.length) {
        dispatch({
          type: "RENAME_CLIENT_IN_TASKS",
          payload: { from: modal.cliente.name, to: form.name },
        });
      }
    } else {
      dispatch({ type: "ADD_CLIENT", payload: { id: crypto.randomUUID(), ...form, createdAt: new Date().toISOString() } });
    }
    setModal(null);
  };

  const handleDelete = (cliente) => {
    dispatch({ type: "DELETE_CLIENT", payload: cliente.id });
    setConfirmDelete(null);
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
            onClick={() => setImportOpen(true)}
            style={rowCenterGap6}
          >
            📥 Importa da Excel
          </button>
          <button
            onClick={() => setModal({ mode: "add" })}
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
                onEdit={puoModificare ? (c => setModal({ mode: "edit", cliente: c })) : null}
                onDelete={puoEliminare ? (c => setConfirmDelete(c)) : null}
                onSelect={c => { setPanelTab(null); setSelectedClient(sc => sc?.id === c.id ? null : c); }}
                selected={selectedClient?.id === c.id}
                liste={listeDi(c)}
              />
            ))}
          </div>
          {/* Il totale resta VERO anche a finestra ridotta: "24 di 818" e "24"
              sono due affermazioni diverse su dati operativi, e questa vista
              serve a rispondere alla domanda "quanti clienti ho". */}
          {restanti > 0 && (
            <div style={colCenterGap6}>
              <button
                onClick={() => setLimite(l => l + PAGINA)}
                style={boxF13Bold}
              >Mostra altri {Math.min(PAGINA, restanti)} di {restanti}</button>
              <div style={txtF115Muted}>
                {visibili.length} di {filtered.length} clienti
              </div>
            </div>
          )}
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
      {modal && (
        <ClienteModal
          cliente={modal.cliente}
          onSave={handleSave}
          onClose={() => setModal(null)}
          liste={listeDi(modal.cliente)}
          tasksCollegati={modal.cliente ? tasksDelCliente(tasks, modal.cliente.name) : []}
        />
      )}

      {/* Import anagrafica da Excel/CSV */}
      {importOpen && (
        <LazyPanel resetKey="import-clienti" onReset={() => setImportOpen(false)} overlay>
          <ClientImportModal
            existingClients={clients}
            onImport={(newClients) => dispatch({ type: "ADD_CLIENTS_BULK", payload: newClients })}
            onClose={() => setImportOpen(false)}
          />
        </LazyPanel>
      )}

      {/* Conferma eliminazione — o spiegazione del perché non si può */}
      {confirmDelete && (() => {
        const l = listeDi(confirmDelete);
        // Le liste viaggio puntano al cliente con una foreign key: finché ne
        // esiste una (anche solo nel cestino, che è un soft delete) il
        // database rifiuta l'eliminazione. Meglio dirlo qui, con il numero,
        // che far premere "Rimuovi" e restituire un errore.
        const bloccato = (l?.totali || 0) > 0;
        return (
          <Modal
            open
            onClose={() => setConfirmDelete(null)}
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
              <button onClick={() => setConfirmDelete(null)} style={boxF14Muted}>{bloccato ? "Chiudi" : "Annulla"}</button>
              {bloccato ? (
                showListe && (
                  <button onClick={() => {
                    setSelectedClient(confirmDelete);
                    setPanelTab("liste");
                    setConfirmDelete(null);
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
