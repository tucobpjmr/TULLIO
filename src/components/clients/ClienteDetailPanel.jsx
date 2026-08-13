// src/components/clients/ClienteDetailPanel.jsx
// Il pannello contestuale di un cliente: due tab, i suoi task e le sue liste
// viaggio. Il tab Liste è precluso al Driver (stessa RLS del modulo).
import { useState, useEffect, lazy, Suspense } from "react";
import { LazyFallback } from "../ui/LazyFallback.jsx";
import { ListeChip } from "./ListeChip.jsx";
import { ClienteTaskTab } from "./ClienteTaskTab.jsx";
import { DatiAnagrafici } from "./DatiAnagrafici.jsx";
import { btnChiudi } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const boxMb8Mt6 = {
  background: "var(--card)", borderRadius: 12, padding: "20px 22px",
  border: "1px solid var(--border)", boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
  marginTop: 6, marginBottom: 8,
};
const rowStartBetween = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const rowCenterGap10 = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 };
const txtF16Bold = { fontWeight: 700, fontSize: 16 };
const rowGap4Mb14 = { display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--border)" };

// Chunk async: trascina con sé liste.css (16.3 kB) e lib/listeApi.js
// (8.7 kB) — senza import() finiscono nel chunk eager e vanificano il lazy()
// di ListeViaggio.jsx, che di quello stesso CSS/data-layer è l'altro punto
// d'ingresso (già lazy in VoyageDesk.jsx).
const ClienteListePanel = lazy(() =>
  import("../liste/ClienteListePanel.jsx").then(m => ({ default: m.ClienteListePanel }))
);

// Pannello contestuale del cliente selezionato: testata + tab.
// Il tab "Liste viaggio" è il secondo punto d'ingresso al modulo Liste (il
// primo è il bottone nell'header della Dashboard). Il modulo non ha una voce
// di sidebar/bottom-nav: si arriva da qui e da lì.
export function ClienteDetailPanel({ cliente, tasks, dispatch, onClose, showListe, liste = null, initialTab = null }) {
  const [tab, setTab] = useState("task");

  // Cambiando cliente si riparte dal tab Task: il tab Liste rifà comunque la
  // query, ma mostrare il cliente precedente per un frame è peggio.
  // `initialTab` è l'eccezione: chi apre il pannello da "Vedi le liste" della
  // conferma di eliminazione vuole vedere proprio quelle.
  useEffect(() => {
    setTab(initialTab === "liste" && showListe ? "liste" : "task");
  }, [cliente.id, initialTab, showListe]);

  // Se il tab "Liste viaggio" era aperto e nel frattempo l'utente attivo
  // cambia in un Driver (showListe passa a false), la barra dei tab sparisce
  // ma senza questo il contenuto già montato resterebbe quello del tab Liste:
  // il Driver vedrebbe comunque il pannello che non deve poter aprire.
  useEffect(() => { if (!showListe) setTab("task"); }, [showListe]);

  const tabs = [
    { key: "task", label: "Task" },
    ...(showListe ? [{ key: "liste", label: "Liste viaggio" }] : []),
  ];

  return (
    <div className="slide-up" style={boxMb8Mt6}>
      <div style={rowStartBetween}>
        <div style={rowCenterGap10}>
          <span className="playfair" style={txtF16Bold}>{cliente.name}</span>
          <ListeChip liste={liste} />
        </div>
        <button onClick={onClose} aria-label="Chiudi il pannello" style={btnChiudi}>✕</button>
      </div>

      <DatiAnagrafici notes={cliente.notes} />

      {tabs.length > 1 && (
        <div style={rowGap4Mb14}>
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 14px", border: "none", background: "none",
                cursor: "pointer", fontSize: 13, fontFamily: "inherit",
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? "var(--navy)" : "var(--text-muted)",
                borderBottom: `2px solid ${tab === t.key ? "var(--gold)" : "transparent"}`,
                marginBottom: -1,
              }}
            >{t.label}</button>
          ))}
        </div>
      )}

      {tab === "liste"
        ? (
          <Suspense fallback={<LazyFallback />}>
            <ClienteListePanel cliente={cliente} dispatch={dispatch} />
          </Suspense>
        )
        : <ClienteTaskTab cliente={cliente} tasks={tasks} dispatch={dispatch} />}
    </div>
  );
}

// Opzioni di ordinamento per la lista clienti (v2.8 Round 8)
