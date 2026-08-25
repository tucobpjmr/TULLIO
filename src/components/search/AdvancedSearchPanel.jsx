// src/components/search/AdvancedSearchPanel.jsx
// Ricerca unificata: la keyword è controllata dall'input lente della Topbar
// (props keyword / onKeyword), i filtri avanzati restano locali al pannello.
// Cerca su due domini distinti — task e liste viaggio — perché per l'utente
// "cerca Bianchi" è una domanda sola, anche se sotto sono due tabelle.
import { useReducer, useEffect, useMemo } from "react";
import { useViewport } from "../ui/Viewport.jsx";
import { SwipeActions } from "../tasks/SwipeActions.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PRIORITIES, STATUSES, STATUS_LABELS } from "../../lib/taskConstants.js";
import { formatDate, isOverdue } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useStoricoTaskCompleto } from "../../state/StoricoTaskContext.jsx";
// La ricerca chiede al modulo Liste "quali liste sono indicizzabili", non
// quali query fare: vedi components/liste/listeModuleApi.js.
import { listeRicercabili, beneficiariNomi, intestazioneLista } from "../liste/listeModuleApi.js";
import { indicizzaTask, filtraTask } from "../../lib/searchTask.js";
import { indicizzaListe, filtraListe } from "../../lib/searchListe.js";
import { Z } from "../../styles/tokens.js";
import { FilterDropdown } from "./FilterDropdown.jsx";
import * as stiliComuni from "../../styles/common.js";
import {
  box2, boxF12Muted, boxF12WFull, boxF18Muted, boxFlex1, boxStickyF11, padding2, row,
  rowCenterBetween, rowCenterGap10, rowCenterGap8, rowCenterMiddle, rowGap10F11,
  txtBoldNavyLight, txtDanger, txtF11Muted, txtF13Bold, txtF13Muted, txtF15Bold,
} from "./advancedSearchPanelStyles.js";
import { useDispatch } from "../../state/DispatchContext.jsx";
import { useCaricamento } from "../../hooks/useCaricamento.js";

// Esportato per i test: la ricerca globale è l'unico punto che cerca insieme
// task e liste viaggio, ed è quello dove le due ricerche devono coincidere.
// ─── B-3 (audit di architettura del 15 agosto) · i filtri sono UNO stato ───
// Erano otto `useState` indipendenti, e la conseguenza si vedeva in
// `resetAll`: otto `setX` che qualcuno deve ricordarsi di chiamare INSIEME,
// più `onKeyword("")` che non è nemmeno di questo componente. Un filtro
// aggiunto domani e dimenticato lì dentro non produce un errore — produce un
// "Reset" che non azzera, cioè risultati filtrati da un criterio che a schermo
// non risulta più attivo. In un pannello di ricerca è il difetto peggiore
// possibile: la lista è corta e sembra una risposta.
//
// `liste` (le liste viaggio caricate all'apertura) resta fuori: sono DATI su
// cui si filtra, non un filtro — azzerarle con il Reset svuoterebbe la sezione
// invece di togliere un criterio.
const FILTRI_VUOTI = {
  dateFrom: "", dateTo: "", cats: [], stats: [], agents: [],
  includeTrashed: false, listeStati: [], listeClienti: [],
};

function filtriReducer(s, a) {
  switch (a.type) {
    case "IMPOSTA": return { ...s, [a.campo]: a.valore };
    // Aggiunge o toglie un valore da un filtro a scelta multipla: era la
    // funzione `toggle(arr, setArr, val)`, che per funzionare doveva ricevere
    // insieme il valore corrente e il proprio setter — cioè ricostruire a mano,
    // a ogni call site, il legame che il reducer ha per costruzione.
    case "ALTERNA": {
      const corrente = s[a.campo];
      return {
        ...s,
        [a.campo]: corrente.includes(a.valore)
          ? corrente.filter(x => x !== a.valore)
          : [...corrente, a.valore],
      };
    }
    case "AZZERA":  return FILTRI_VUOTI;
    default:        return s;
  }
}

export const AdvancedSearchPanel = ({ tasks, onClose, keyword = "", onKeyword, currentUserId }) => {
  const dispatch = useDispatch();
  const { isMobile } = useViewport();
  const { team, categories, per } = useAppData();
  // A-3. Questo pannello ha una casella «includi nel cestino» e un filtro per
  // stato che comprende «completato»: entrambi PROMETTONO di cercare in ciò
  // che la finestra dell'idratazione non carica. Una ricerca che non trova non
  // dice "non ho cercato lì" — dice "non c'è", ed è la risposta su cui si
  // decide di ricreare una task che esiste già.
  const caricandoStorico = useStoricoTaskCompleto();
  const [filtri, filtriDispatch] = useReducer(filtriReducer, FILTRI_VUOTI);
  const { dateFrom, dateTo, cats, stats, agents, includeTrashed, listeStati, listeClienti } = filtri;
  const imposta = (campo, valore) => filtriDispatch({ type: "IMPOSTA", campo, valore });
  const alterna = (campo, valore) => filtriDispatch({ type: "ALTERNA", campo, valore });

  // Liste viaggio: chi non ha accesso al modulo non ha motivo di vederle qui
  // (stessa RLS del modulo stesso), quindi niente fetch e niente filtri.
  const listeAllowed = per(currentUserId).accedeListe();
  // Caricate una sola volta all'apertura del pannello (non vivono nello state
  // globale come i task: il modulo Liste le fetcha on-demand da sempre).
  // Prendiamo sia attive che cestinate cosí "Includi... nel cestino" può
  // valere anche per le liste, con la stessa semantica dei task.
  const { dato: liste } = useCaricamento(
    () => (listeAllowed ? listeRicercabili() : { data: [], error: null }),
    [listeAllowed],
    { iniziale: [], suErrore: (e) => console.error("[liste] ricerca", e) },
  );

  // La chiusura su click esterno è gestita dal wrapper di ricerca nella Topbar
  // (l'input keyword vive lì). Qui resta solo la chiusura con Escape.
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Il Reset è ora DUE cose e si vedono entrambe: azzerare i filtri di questo
  // pannello (una transizione sola) e svuotare la parola chiave, che appartiene
  // al chiamante e per questo resta una chiamata separata.
  const resetAll = () => {
    onKeyword?.("");
    filtriDispatch({ type: "AZZERA" });
  };

  const hasFilters = keyword.trim() || dateFrom || dateTo || cats.length || stats.length || agents.length || includeTrashed || listeStati.length || listeClienti.length;

  // M-5 · Indice e filtro vivono in `lib/searchTask.js`: sono puri, e qui
  // dentro erano ~110 righe che nessun test unitario poteva raggiungere senza
  // montare il pannello con sei provider. Restano i due `useMemo`, cioè
  // l'unica parte che dipende da React — e le loro dipendenze, che sono la
  // ragione per cui l'indice si ricostruisce sul CORPUS e non sulla battuta.
  const indiceTask = useMemo(() => indicizzaTask(tasks), [tasks]);

  // `filtri` intero come dipendenza, e non le sei fette che questo filtro
  // legge davvero: il reducer produce un oggetto nuovo solo quando un filtro
  // cambia, quindi il costo è un ricalcolo in più quando si tocca un filtro
  // delle LISTE. È un passaggio sull'indice (0,18 ms su 292 task, 1,47 su
  // 2500) su un click di dropdown — non su una battuta, che è la corsa che
  // A-2 aveva misurato e che resta invariata.
  const results = useMemo(
    () => (hasFilters ? filtraTask(indiceTask, filtri, keyword) : []),
    [indiceTask, filtri, keyword, hasFilters]);

  const openTask = (t) => {
    dispatch({ type: "SET_SELECTED_TASK", payload: t });
    onClose();
  };

  // Clienti e stati disponibili dalle liste caricate (per i dropdown dei filtri).
  const availableListeClienti = useMemo(() => {
    const seen = new Set();
    liste.forEach(l => {
      if (l.clients?.name) seen.add(l.clients.name);
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b, "it"));
  }, [liste]);

  const availableListeStati = useMemo(() => {
    const seen = new Set();
    liste.forEach(l => {
      if (l.stato) seen.add(l.stato);
    });
    return Array.from(seen).sort();
  }, [liste]);

  // M-5 · Stessa divisione dei task: l'indice e il filtro sono in
  // `lib/searchListe.js`, qui restano i memo. `beneficiariNomi` arriva come
  // ARGOMENTO perché è la facciata del modulo Liste a esporlo, e `lib/` non la
  // conosce — vedi il preambolo di quel file.
  const indiceListe = useMemo(() => indicizzaListe(liste, beneficiariNomi), [liste]);

  const listaResults = useMemo(
    () => (listeAllowed ? filtraListe(indiceListe, filtri, keyword) : []),
    [indiceListe, filtri, keyword, listeAllowed]);

  const openLista = (l) => {
    dispatch({ type: "SET_VIEW", payload: "liste", lista: l.id });
    onClose();
  };

  const sectionTitle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 };

  return (
    <div
      className="fade-in"
      style={{
        position: isMobile ? "fixed" : "absolute",
        // Su mobile è position:fixed → l'offset è dal bordo dello schermo, non
        // dalla topbar: senza --safe-top il pannello finirebbe sotto la topbar
        // (che su iPhone è alta 58px + inset).
        top: isMobile ? "calc(64px + var(--safe-top))" : "calc(100% + 8px)",
        left: isMobile ? 8 : 0,
        right: isMobile ? 8 : "auto",
        width: isMobile ? "auto" : 680,
        // iOS Safari: dvh = viewport visibile. Su mobile il pannello parte a
        // top:64 e ha zIndex sotto la bottom-nav → riservo ~140px (offset top +
        // nav) così l'ultimo risultato non finisce nascosto sotto la nav.
        maxHeight: isMobile
          ? "calc(100dvh - 140px - var(--safe-top) - var(--safe-bottom))"
          : "calc(100dvh - 80px)",
        overflow: "hidden",
        background: "var(--surface)", borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        border: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        zIndex: Z.panel,
      }}
    >
      <div style={rowCenterBetween}>
        <div className="playfair" style={txtF15Bold}>
          🔍 Ricerca
        </div>
        <div style={stiliComuni.rowGap8}>
          {hasFilters && (
            <button onClick={resetAll} style={boxF12Muted}>Reset</button>
          )}
          <button onClick={onClose} style={boxF18Muted}>✕</button>
        </div>
      </div>

      {/* Scroll unico: filtri + risultati scorrono insieme. Prima erano due aree
          di scroll annidate con altezze fisse (380 + 320 px) → su mobile lo
          scroll era a scatti e poco agevole. Ora un solo contenitore scrollabile. */}
      <div style={boxFlex1}>
      <div style={padding2}>
        <div style={stiliComuni.mb14}>
          <div style={sectionTitle}>Scadenza</div>
          <div style={rowCenterGap10}>
            <div style={stiliComuni.flex1}>
              <label style={txtF11Muted}>Da</label>
              <input type="date" value={dateFrom} onChange={e => imposta("dateFrom", e.target.value)} style={boxF12WFull} />
            </div>
            <div style={stiliComuni.flex1}>
              <label style={txtF11Muted}>A</label>
              <input type="date" value={dateTo} onChange={e => imposta("dateTo", e.target.value)} style={boxF12WFull} />
            </div>
          </div>
        </div>

        <div style={stiliComuni.mb14}>
          <div style={sectionTitle}>Categoria</div>
          <FilterDropdown
            options={Object.entries(categories).map(([key, c]) => ({
              value: key, label: c.label, icon: <span>{c.icon}</span>,
            }))}
            selected={cats}
            onToggle={val => alterna("cats", val)}
          />
        </div>

        <div style={stiliComuni.mb14}>
          <div style={sectionTitle}>Status</div>
          <FilterDropdown
            options={STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))}
            selected={stats}
            onToggle={val => alterna("stats", val)}
          />
        </div>

        <div style={stiliComuni.mb14}>
          <div style={sectionTitle}>Agente</div>
          <FilterDropdown
            options={team.filter(m => !m.pending).map(m => ({
              value: m.id, label: m.name.split(" ")[0],
              icon: (
                <span style={{
                  width: 16, height: 16, borderRadius: "50%", background: m.color,
                  color: "#fff", fontSize: 9, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>{m.avatar}</span>
              ),
            }))}
            selected={agents}
            onToggle={val => alterna("agents", val)}
          />
        </div>

        {listeAllowed && (
          <>
            <div style={stiliComuni.mb14}>
              <div style={sectionTitle}>✈️ Stato Lista</div>
              <FilterDropdown
                options={availableListeStati.map(s => ({
                  value: s, label: s.charAt(0).toUpperCase() + s.slice(1),
                }))}
                selected={listeStati}
                onToggle={val => alterna("listeStati", val)}
              />
            </div>

            <div style={stiliComuni.mb14}>
              <div style={sectionTitle}>✈️ Cliente Lista</div>
              <FilterDropdown
                options={availableListeClienti.map(c => ({
                  value: c, label: c,
                }))}
                selected={listeClienti}
                onToggle={val => alterna("listeClienti", val)}
              />
            </div>
          </>
        )}

        <label style={rowCenterGap8}>
          <input type="checkbox" checked={includeTrashed} onChange={e => imposta("includeTrashed", e.target.checked)} />
          🗑️ Includi {listeAllowed ? "task e liste" : "task"} nel cestino
        </label>
      </div>

      <div style={box2}>

        {/* Finché lo storico non è arrivato non si dice "nessun task": la
            ricerca sta ancora guardando la sola finestra dell'idratazione, e
            un vuoto dichiarato qui è un vuoto sui dati, non sui filtri. */}
        {hasFilters && results.length === 0 && (
          <div style={txtF13Muted}>
            {caricandoStorico
              ? "Ricerca nello storico in corso…"
              : "Nessun task corrisponde ai filtri"}
          </div>
        )}
        {hasFilters && results.length > 0 && (
          <>
            <div style={boxStickyF11}>
              {results.length} {results.length === 1 ? "risultato" : "risultati"}
            </div>
            {results.map(t => {
              const cat = categories[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
              const prio = PRIORITIES[t.priority] || { color: "#6B7280", bg: "#F9FAFB", label: t.priority };
              const overdue = isOverdue(t);
              return (
                <SwipeActions key={t.id} task={t} disabled={!!t.deletedAt}>
                <div
                  onClick={() => openTask(t)}
                  style={{
                    padding: "10px 18px", borderBottom: "1px solid var(--border)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                    transition: "background 0.15s", background: "#fff",
                    opacity: t.deletedAt ? 0.6 : 1,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: cat.bg, color: cat.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, flexShrink: 0,
                  }}>{cat.icon}</div>
                  <div className="vd-flex-1-min0">
                    <div style={txtF13Bold}>
                      {t.deletedAt && <span style={txtDanger}>🗑️</span>}
                      {t.title}
                    </div>
                    <div style={rowGap10F11}>
                      <span>{STATUS_LABELS[t.status]}</span>
                      {t.praticaRef && (
                        <span style={txtBoldNavyLight}>• {t.praticaRef}</span>
                      )}
                      {t.client && <span>• {t.client}</span>}
                      {t.dueDate && (
                        <span style={{ color: overdue ? "var(--danger)" : "var(--text-muted)" }}>
                          • {formatDate(t.dueDate)}{overdue ? " (scaduto)" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                    background: prio.bg, color: prio.color, flexShrink: 0,
                  }}>{prio.label}</div>
                  <div style={row}>
                    {(t.assignees || []).slice(0, 3).map((aid, i) => (
                      <div key={aid} style={{ marginLeft: i ? -6 : 0 }}>
                        <Avatar memberId={aid} size={22} />
                      </div>
                    ))}
                  </div>
                </div>
                </SwipeActions>
              );
            })}
          </>
        )}

        {listeAllowed && (keyword.trim() || listeStati.length || listeClienti.length) && listaResults.length > 0 && (
          <>
            <div style={boxStickyF11}>
              {listaResults.length} {listaResults.length === 1 ? "lista" : "liste"} viaggio ✈️
            </div>
            {listaResults.map(l => (
              <div
                key={l.id}
                onClick={() => openLista(l)}
                style={{
                  padding: "10px 18px", borderBottom: "1px solid var(--border)",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                  transition: "background 0.15s", background: "#fff",
                  opacity: l.deleted_at ? 0.6 : 1,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}
              >
                <div style={rowCenterMiddle}>🧾</div>
                <div className="vd-flex-1-min0">
                  <div style={txtF13Bold}>
                    {l.deleted_at && <span style={txtDanger}>🗑️</span>}
                    {/* Titolare E cointestatari, come nell'elenco del modulo:
                        una lista trovata cercando il cointestatario deve
                        mostrare il nome che l'ha fatta trovare, altrimenti la
                        riga sembra un risultato sbagliato. */}
                    {intestazioneLista(l) || "—"}
                  </div>
                  <div style={rowGap10F11}>
                    <span>Lista viaggio</span>
                    {l.titolo && <span>• {l.titolo}</span>}
                  </div>
                </div>
                {!l.deleted_at && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                    background: l.stato === "esaurita" ? "#F9FAFB" : "#E8F5E9",
                    color: l.stato === "esaurita" ? "#6B7280" : "#2E7D32", flexShrink: 0,
                  }}>{l.stato}</div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
      </div>
    </div>
  );
};
