// src/components/ui/ClientAutocomplete.jsx
// La tendina di suggerimento cliente, condivisa da TaskSlideOver, QuickAddTask,
// ManualTab e TemplateTab.
//
// PERCHÉ ESISTE. La stessa logica non banale era scritta QUATTRO volte (M-2
// dell'audit ne contava tre: TemplateTab era sfuggito, ed è esattamente il
// modo in cui questa classe di duplicazione cresce). Ogni copia aveva:
//   - il filtro per sottostringa sul nome e il taglio a 6 risultati;
//   - la regola "nascondi la tendina se l'unico match coincide esattamente con
//     quanto digitato", con tre nomi di variabile diversi;
//   - il `setTimeout(…, 150)` sul blur, che serve a non chiudere la tendina
//     prima che il click sulla voce venga registrato;
//   - il markup della tendina, con gli stessi valori di stile ricopiati.
//
// Il costo non era estetico: una modifica al comportamento della ricerca
// cliente aveva quattro punti di applicazione e nulla che li legasse. È lo
// stesso problema che `lib/searchUtils.js` ha già risolto per la ricerca
// dell'anagrafica e delle liste, quindi lo strumento culturale c'era già.
//
// COSA NON FA. Non decide cosa succede quando si sceglie un cliente:
// l'ereditarietà del contatto dall'anagrafica (`clientContact`) resta di chi
// usa il componente, perché ogni chiamante la scrive nel proprio stato in modo
// diverso. Il campo cliente resta testo libero — `task.client` è una stringa,
// non una FK — quindi questo componente suggerisce e non vincola.

import { useState } from "react";
// La query vive in `src/hooks/`: `eslint.config.js` vieta ai componenti di
// importare il data layer, e le letture stanno lì (vedi il file per il
// debounce, la guardia di staleness e la degradazione senza rete).
import { useRicercaClienti } from "../../hooks/useRicercaClienti.js";
import { Z } from "../../styles/tokens.js";
import { conTastiera } from "../../lib/a11y.js";

const MAX_SUGGERIMENTI = 6;

/**
 * Logica della tendina: ricerca, visibilità e handler da spalmare sull'input.
 *
 * ─── M-1 (passo 2) · la ricerca è sul SERVER ───────────────────────────────
 * (audit performance/UX del 19 agosto)
 *
 * Questo hook filtrava un array in memoria, e quell'array era l'anagrafica
 * INTERA: finché è stato così, `useAppHydration` DOVEVA scaricarla a ogni
 * sessione, perché questa tendina si apre da `QuickAddTask` — il FAB su ogni
 * vista, la scorciatoia `K`. Era il consumatore che rendeva inutile qualunque
 * finestra sull'idratazione.
 *
 * Ora interroga `Clients.cerca` (debounce di ATTESA_MS), che è comunque la
 * forma giusta per un autocomplete: si guardano le prime righe che
 * corrispondono, non tutte.
 *
 * ⚠️ `locali` NON è l'anagrafica: è ciò che si trova già nello stato — le
 * schede create in questa sessione, quelle arrivate dal realtime, e in
 * modalità demo (senza login) i mock. Serve a due cose che la sola ricerca
 * server non copre: un cliente appena creato è suggeribile PRIMA che la
 * scrittura sia confermata, e in dev senza Supabase la tendina continua a
 * funzionare. I risultati locali vanno per primi e i duplicati si tolgono per
 * `id` — se una scheda arriva da entrambe le parti, è la stessa scheda.
 *
 * @param {Array}   locali   i clienti già in stato (da `useClients()`)
 * @param {string}  valore   il testo attualmente nel campo
 * @param {object}  [opts]
 * @param {boolean} [opts.enabled]  false → la tendina non si apre mai
 *                                  (TaskSlideOver in sola lettura)
 */
export function useClientSuggestions(locali, valore, { enabled = true } = {}) {
  const [focus, setFocus] = useState(false);

  const query = (valore || "").trim().toLowerCase();
  // I termini in AND, come fa il server: senza, digitando «rossi mario» i
  // risultati locali sparirebbero mentre quelli remoti restano — due
  // semantiche nella stessa tendina.
  const termini = query ? query.split(/\s+/).filter(Boolean) : [];
  const daiLocali = (locali || []).filter(c => {
    const n = c.name?.toLowerCase() || "";
    return termini.every(t => n.includes(t));
  });

  // La richiesta al server, col suo debounce e la sua guardia di staleness.
  const remoti = useRicercaClienti(query, { enabled, limit: MAX_SUGGERIMENTI * 2 });

  const visti = new Set();
  const matches = [];
  for (const c of [...daiLocali, ...remoti]) {
    if (!c?.id || visti.has(c.id)) continue;
    visti.add(c.id);
    matches.push(c);
    if (matches.length === MAX_SUGGERIMENTI) break;
  }

  // Un solo risultato identico a ciò che è già scritto non è un suggerimento:
  // è la ripetizione di quanto l'utente ha appena selezionato.
  const visible = enabled && focus && matches.length > 0 &&
    !(matches.length === 1 && matches[0].name?.toLowerCase() === query);

  return {
    matches,
    visible,
    // Da spalmare sull'input. Chi ha già un proprio onBlur (TaskSlideOver, che
    // lì persiste il campo) deve chiamare ANCHE questo, non sostituirlo.
    inputProps: {
      autoComplete: "off",
      onFocus: () => setFocus(true),
      // 150ms: il blur arriva prima del mousedown sulla voce, e chiudere
      // subito smonterebbe il bottone prima che il click sia registrato.
      onBlur: () => setTimeout(() => setFocus(false), 150),
    },
    // Da chiamare in onPick: la scelta è fatta, la tendina non serve più.
    close: () => setFocus(false),
  };
}

// Le due varianti sono quelle già in uso, non una scelta nuova. `compact` è
// quella dentro il modale bulk (ManualTab, TemplateTab): campi più fitti e
// soprattutto uno z-index più alto, perché lì la tendina deve scavalcare il
// pannello del modale e non solo la card che la contiene.
const VARIANTI = {
  normale: { z: Z.localRaised, marginTop: 4, maxHeight: 200, padding: "8px 10px", nome: 13, dettaglio: 11 },
  compatta: { z: Z.swipePanel, marginTop: 3, maxHeight: 180, padding: "7px 10px", nome: 12.5, dettaglio: 10.5 },
};

/**
 * Il markup della tendina. Va dentro un contenitore con
 * `position: "relative"` — si posiziona sotto l'input che lo precede.
 *
 * @param {object}   props
 * @param {Array}    props.matches  da useClientSuggestions
 * @param {boolean}  props.visible  da useClientSuggestions
 * @param {Function} props.onPick   riceve il cliente scelto
 * @param {boolean}  [props.compact] variante fitta per i modali bulk
 */
export function ClientSuggestions({ matches, visible, onPick, compact = false }) {
  if (!visible) return null;
  const v = compact ? VARIANTI.compatta : VARIANTI.normale;

  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, right: 0, zIndex: v.z,
      marginTop: v.marginTop, background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
      maxHeight: v.maxHeight, overflowY: "auto",
    }}>
      {matches.map(c => (
        <button
          key={c.id}
          type="button"
          // onMouseDown e non onClick: il mousedown precede il blur dell'input,
          // quindi la selezione parte prima che il timer di chiusura scatti.
          onMouseDown={() => onPick(c)}
          style={{
            display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
            width: "100%", textAlign: "left", padding: v.padding, border: "none",
            borderBottom: "1px solid var(--border)", background: "transparent",
            cursor: "pointer", fontFamily: "inherit",
          }}
          {...conTastiera(
            e => e.currentTarget.style.background = "var(--surface2)",
            e => e.currentTarget.style.background = "transparent",
          )}
        >
          <span style={{ fontSize: v.nome, fontWeight: 600, color: "var(--text)" }}>{c.name}</span>
          {(c.phone || c.city || c.email) && (
            <span style={{ fontSize: v.dettaglio, color: "var(--text-muted)" }}>
              {[c.phone, c.city, c.email].filter(Boolean).join(" · ")}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
