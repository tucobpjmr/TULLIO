// src/components/search/AdvancedSearchPanel.jsx
// Ricerca unificata: la keyword è controllata dall'input lente della Topbar
// (props keyword / onKeyword), i filtri avanzati restano locali al pannello.
// Cerca su due domini distinti — task e liste viaggio — perché per l'utente
// "cerca Bianchi" è una domanda sola, anche se sotto sono due tabelle.
import { useState, useEffect, useMemo } from "react";
import { useViewport } from "../Viewport.jsx";
import { SwipeActions } from "../SwipeActions.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PRIORITIES, STATUSES, STATUS_LABELS } from "../../lib/taskConstants.js";
import { formatDate, isOverdue, startOfLocalDay, endOfLocalDay } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useStoricoTaskCompleto } from "../../state/StoricoTaskContext.jsx";
// La ricerca chiede al modulo Liste "quali liste sono indicizzabili", non
// quali query fare: vedi components/liste/listeModuleApi.js.
import { listeRicercabili, beneficiariNomi, intestazioneLista } from "../liste/listeModuleApi.js";
import { matchTermini, terminiRicerca } from "../../lib/searchUtils.js";
import { Z } from "../../styles/tokens.js";
import { FilterDropdown } from "./FilterDropdown.jsx";
import { flex1, mb14, rowGap8 } from "../../styles/common.js";
import {
  box2, boxF12Muted, boxF12WFull, boxF18Muted, boxFlex1, boxStickyF11, padding2, row,
  rowCenterBetween, rowCenterGap10, rowCenterGap8, rowCenterMiddle, rowGap10F11,
  txtBoldNavyLight, txtDanger, txtF11Muted, txtF13Bold, txtF13Muted, txtF15Bold,
} from "./advancedSearchPanelStyles.js";

// Esportato per i test: la ricerca globale è l'unico punto che cerca insieme
// task e liste viaggio, ed è quello dove le due ricerche devono coincidere.
export const AdvancedSearchPanel = ({ tasks, dispatch, onClose, keyword = "", onKeyword, currentUserId }) => {
  const { isMobile } = useViewport();
  const { team, categories, canAccessListe } = useAppData();
  // A-3. Questo pannello ha una casella «includi nel cestino» e un filtro per
  // stato che comprende «completato»: entrambi PROMETTONO di cercare in ciò
  // che la finestra dell'idratazione non carica. Una ricerca che non trova non
  // dice "non ho cercato lì" — dice "non c'è", ed è la risposta su cui si
  // decide di ricreare una task che esiste già.
  const caricandoStorico = useStoricoTaskCompleto();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cats, setCats] = useState([]);
  const [stats, setStats] = useState([]);
  const [agents, setAgents] = useState([]);
  const [includeTrashed, setIncludeTrashed] = useState(false);

  // Liste viaggio: chi non ha accesso al modulo non ha motivo di vederle qui
  // (stessa RLS del modulo stesso), quindi niente fetch e niente filtri.
  const listeAllowed = canAccessListe(currentUserId);
  const [liste, setListe] = useState([]);
  const [listeStati, setListeStati] = useState([]);
  const [listeClienti, setListeClienti] = useState([]);

  // Caricate una sola volta all'apertura del pannello (non vivono nello state
  // globale come i task: il modulo Liste le fetcha on-demand da sempre).
  // Prendiamo sia attive che cestinate cosí "Includi... nel cestino" può
  // valere anche per le liste, con la stessa semantica dei task.
  useEffect(() => {
    if (!listeAllowed) return;
    let alive = true;
    (async () => {
      const { data, error } = await listeRicercabili();
      if (!alive) return;
      if (error) {
        console.error("[liste] ricerca", error);
        return;
      }
      setListe(data);
    })();
    return () => { alive = false; };
  }, [listeAllowed]);

  // La chiusura su click esterno è gestita dal wrapper di ricerca nella Topbar
  // (l'input keyword vive lì). Qui resta solo la chiusura con Escape.
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const toggle = (arr, setArr, val) => {
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const resetAll = () => {
    onKeyword?.(""); setDateFrom(""); setDateTo("");
    setCats([]); setStats([]); setAgents([]); setIncludeTrashed(false);
    setListeStati([]); setListeClienti([]);
  };

  const hasFilters = keyword.trim() || dateFrom || dateTo || cats.length || stats.length || agents.length || includeTrashed || listeStati.length || listeClienti.length;

  const results = useMemo(() => {
    if (!hasFilters) return [];
    const termini = terminiRicerca(keyword);
    const from = startOfLocalDay(dateFrom);
    const to = endOfLocalDay(dateTo);

    return tasks.filter(t => {
      if (!includeTrashed && t.deletedAt) return false;
      if (cats.length && !cats.includes(t.category)) return false;
      if (stats.length && !stats.includes(t.status)) return false;
      if (agents.length && !(t.assignees || []).some(a => agents.includes(a))) return false;
      if (from) {
        if (!t.dueDate) return false;
        if (new Date(t.dueDate) < from) return false;
      }
      if (to) {
        if (!t.dueDate) return false;
        if (new Date(t.dueDate) > to) return false;
      }
      // Normalizzazione condivisa con anagrafica e liste (lib/searchUtils.js):
      // il campo `client` del task è il nome dell'anagrafica, e deve trovarsi
      // digitandolo come lo si digita là.
      if (!matchTermini(termini, t.title, t.description, t.client, t.praticaRef,
        (t.comments || []).map(c => c.text || ""))) return false;
      return true;
    }).sort((a,b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }, [tasks, keyword, dateFrom, dateTo, cats, stats, agents, includeTrashed, hasFilters]);

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

  // Liste: filtro con keyword + filtri per stato/cliente — categoria/agente/
  // scadenza non hanno un equivalente sulle liste, stessa logica di ricerca
  // già usata dentro il modulo Liste (ListeViaggio.jsx).
  const listaResults = useMemo(() => {
    if (!listeAllowed) return [];
    const termini = terminiRicerca(keyword);
    return liste.filter(l => {
      if (!includeTrashed && l.deleted_at) return false;
      if (listeStati.length && !listeStati.includes(l.stato)) return false;
      if (listeClienti.length && !listeClienti.includes(l.clients?.name)) return false;
      // I COINTESTATARI contano: una lista intestata a ROSSI con BIANCHI
      // cointestataria è anche di BIANCHI, e nel modulo Liste cercando
      // "BIANCHI" si trova. Qui non si trovava — stessa ricerca, due esiti
      // diversi, e il posto dove l'utente si aspetta di trovare tutto è
      // proprio questo.
      return matchTermini(termini, l.clients?.name, l.titolo, l.note, beneficiariNomi(l));
    }).sort((a, b) => (a.clients?.name || "").localeCompare(b.clients?.name || "", "it"));
  }, [liste, keyword, includeTrashed, listeAllowed, listeStati, listeClienti]);

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
        <div style={rowGap8}>
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
        <div style={mb14}>
          <div style={sectionTitle}>Scadenza</div>
          <div style={rowCenterGap10}>
            <div style={flex1}>
              <label style={txtF11Muted}>Da</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={boxF12WFull} />
            </div>
            <div style={flex1}>
              <label style={txtF11Muted}>A</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={boxF12WFull} />
            </div>
          </div>
        </div>

        <div style={mb14}>
          <div style={sectionTitle}>Categoria</div>
          <FilterDropdown
            options={Object.entries(categories).map(([key, c]) => ({
              value: key, label: c.label, icon: <span>{c.icon}</span>,
            }))}
            selected={cats}
            onToggle={val => toggle(cats, setCats, val)}
          />
        </div>

        <div style={mb14}>
          <div style={sectionTitle}>Status</div>
          <FilterDropdown
            options={STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))}
            selected={stats}
            onToggle={val => toggle(stats, setStats, val)}
          />
        </div>

        <div style={mb14}>
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
            onToggle={val => toggle(agents, setAgents, val)}
          />
        </div>

        {listeAllowed && (
          <>
            <div style={mb14}>
              <div style={sectionTitle}>✈️ Stato Lista</div>
              <FilterDropdown
                options={availableListeStati.map(s => ({
                  value: s, label: s.charAt(0).toUpperCase() + s.slice(1),
                }))}
                selected={listeStati}
                onToggle={val => toggle(listeStati, setListeStati, val)}
              />
            </div>

            <div style={mb14}>
              <div style={sectionTitle}>✈️ Cliente Lista</div>
              <FilterDropdown
                options={availableListeClienti.map(c => ({
                  value: c, label: c,
                }))}
                selected={listeClienti}
                onToggle={val => toggle(listeClienti, setListeClienti, val)}
              />
            </div>
          </>
        )}

        <label style={rowCenterGap8}>
          <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
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
                <SwipeActions key={t.id} task={t} dispatch={dispatch} disabled={!!t.deletedAt}>
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
