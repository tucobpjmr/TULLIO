// src/components/clients/ClientiView.jsx
// Anagrafica Clienti: elenco, ricerca, ordinamento e apertura del pannello di
// dettaglio. Modale, card e pannello vivono in moduli propri — erano sei
// componenti in questo file, di cui uno (la modale) da 120 righe.
import { memo, useState, useMemo, useEffect } from "react";
import { ClienteModal } from "./ClienteModal.jsx";
import { ClienteCard } from "./ClienteCard.jsx";
import { ClienteDetailPanel } from "./ClienteDetailPanel.jsx";
import { useViewport } from "../Viewport.jsx";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useTasks } from "../../state/TasksContext.jsx";
import { useClients } from "../../state/ClientsContext.jsx";
import { ClientImportModal } from "./ClientImportModal.jsx";
// L'anagrafica chiede al modulo Liste un conteggio per cliente, non le sue
// query: vedi components/liste/listeModuleApi.js.
import { conteggioListePerCliente } from "../liste/listeModuleApi.js";
import { tasksDelCliente } from "../../lib/clientNotes.js";
import { matchTermini, terminiRicerca } from "../../lib/searchUtils.js";
import { fieldStyle } from "./clientStyles.js";
import { Z } from "../../styles/tokens.js";

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
  const { currentUserId, canAccessListe } = useAppData();
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
    <div className="vd-pad" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="playfair" style={{ fontSize: isMobile ? 22 : 26, color: "var(--heading)", marginBottom: 4 }}>
            Clienti
          </h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {loading && clients.length === 0
              ? "Caricamento…"
              : `${clients.length} ${clients.length === 1 ? "cliente" : "clienti"} in anagrafica`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setImportOpen(true)}
            style={{
              padding: "10px 16px", borderRadius: 9, border: "1px solid var(--border)",
              background: "var(--card)", color: "var(--navy)", cursor: "pointer",
              fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            }}
          >
            📥 Importa da Excel
          </button>
          <button
            onClick={() => setModal({ mode: "add" })}
            style={{
              padding: "10px 18px", borderRadius: 9, border: "none",
              background: "var(--navy)", color: "#fff", cursor: "pointer",
              fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            }}
          >
            + Nuovo cliente
          </button>
        </div>
      </div>

      {/* Search + Sort */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome, email, città, telefono…"
          style={{ ...fieldStyle, maxWidth: 360 }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
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
        <div style={{ textAlign: "center", padding: "64px 24px", color: "var(--text-muted)" }}>
          {search ? "Nessun cliente trovato" : (
            <div>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Nessun cliente ancora</div>
              <div style={{ fontSize: 13 }}>Aggiungi il primo cliente per iniziare</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {filtered.map(c => (
            <ClienteCard
              key={c.id}
              cliente={c}
              onEdit={c => setModal({ mode: "edit", cliente: c })}
              onDelete={c => setConfirmDelete(c)}
              onSelect={c => { setPanelTab(null); setSelectedClient(sc => sc?.id === c.id ? null : c); }}
              selected={selectedClient?.id === c.id}
              liste={listeDi(c)}
            />
          ))}
        </div>
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
        <ClientImportModal
          existingClients={clients}
          onImport={(newClients) => dispatch({ type: "ADD_CLIENTS_BULK", payload: newClients })}
          onClose={() => setImportOpen(false)}
        />
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
          <div style={{
            position: "fixed", inset: 0, zIndex: Z.chatBackdrop,
            background: "rgba(8,21,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
          }} onClick={() => setConfirmDelete(null)}>
            <div style={{
              background: "var(--card)", borderRadius: 12, padding: 24, width: "min(420px, 92vw)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)", animation: "slideUp 0.2s ease",
            }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--heading)", marginBottom: 8 }}>
                {bloccato ? "Non si può rimuovere" : "Rimuovi cliente"}
              </div>
              {bloccato ? (
                <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.5 }}>
                  <strong>{confirmDelete.name}</strong> è collegato a{" "}
                  {l.totali === 1 ? "una lista viaggio" : `${l.totali} liste viaggio`}{" "}
                  (come titolare o cointestatario)
                  {l.totali > l.attive && `, di cui ${l.totali - l.attive} nel cestino: restano collegate anche lì`}.
                  <div style={{ marginTop: 8 }}>
                    Le liste sono agganciate a questa scheda: per rimuoverla vanno prima
                    eliminate definitivamente dal cestino del modulo Liste viaggio, o questo
                    cliente va rimosso come cointestatario dalle liste dove non è titolare.
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
                  Rimuovere <strong>{confirmDelete.name}</strong> dall'anagrafica?
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={() => setConfirmDelete(null)} style={{
                  padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)",
                  cursor: "pointer", fontSize: 14, color: "var(--text-muted)",
                }}>{bloccato ? "Chiudi" : "Annulla"}</button>
                {bloccato ? (
                  showListe && (
                    <button onClick={() => {
                      setSelectedClient(confirmDelete);
                      setPanelTab("liste");
                      setConfirmDelete(null);
                    }} style={{
                      padding: "8px 16px", borderRadius: 8, border: "none",
                      background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
                    }}>Vedi le liste</button>
                  )
                ) : (
                  <button onClick={() => handleDelete(confirmDelete)} style={{
                    padding: "8px 16px", borderRadius: 8, border: "none",
                    background: "var(--danger)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
                  }}>Rimuovi</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
});
