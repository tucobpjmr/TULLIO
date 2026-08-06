// src/components/search/AdvancedSearchPanel.jsx
// Ricerca unificata: la keyword è controllata dall'input lente della Topbar
// (props keyword / onKeyword), i filtri avanzati restano locali al pannello.
// Cerca su due domini distinti — task e liste viaggio — perché per l'utente
// "cerca Bianchi" è una domanda sola, anche se sotto sono due tabelle.
import { useState, useRef, useEffect, useMemo } from "react";
import { useViewport } from "../Viewport.jsx";
import { SwipeActions } from "../SwipeActions.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PRIORITIES, STATUSES, STATUS_LABELS } from "../../lib/taskConstants.js";
import { formatDate, isOverdue, startOfLocalDay, endOfLocalDay } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
// La ricerca chiede al modulo Liste "quali liste sono indicizzabili", non
// quali query fare: vedi components/liste/listeModuleApi.js.
import { listeRicercabili, beneficiariNomi, intestazioneLista } from "../liste/listeModuleApi.js";
import { matchTermini, terminiRicerca } from "../../lib/searchUtils.js";
import { Z } from "../../styles/tokens.js";

// Menù a tendina multi-selezione (Categoria/Status/Agente nel pannello Ricerca).
// Sostituisce i chip toggle: trigger compatto + pannello a scomparsa con checkbox.
const FilterDropdown = ({ options, selected, onToggle }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const count = selected.length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          width: "100%", padding: "7px 10px", borderRadius: 6,
          border: `1px solid ${count ? "var(--gold)" : "var(--border)"}`,
          background: "#fff", fontSize: 12, fontWeight: 600, color: "var(--text)",
          cursor: "pointer", fontFamily: "inherit", boxSizing: "border-box",
        }}
      >
        <span>{count ? `${count} selezionat${count === 1 ? "a" : "e"}` : "Tutte"}</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, minWidth: 200,
          maxHeight: 240, overflowY: "auto", background: "#fff",
          border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 12px 30px rgba(0,0,0,0.15)", zIndex: Z.panelRaised, padding: 6,
        }}>
          {options.map(opt => {
            const active = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                  borderRadius: 6, cursor: "pointer", fontSize: 12,
                  background: active ? "var(--surface2)" : "transparent",
                }}
              >
                <input type="checkbox" checked={active} onChange={() => onToggle(opt.value)} />
                {opt.icon}
                {opt.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Esportato per i test: la ricerca globale è l'unico punto che cerca insieme
// task e liste viaggio, ed è quello dove le due ricerche devono coincidere.
export const AdvancedSearchPanel = ({ tasks, dispatch, onClose, keyword = "", onKeyword, currentUserId }) => {
  const { isMobile } = useViewport();
  const { team, categories, isDriver } = useAppData();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cats, setCats] = useState([]);
  const [stats, setStats] = useState([]);
  const [agents, setAgents] = useState([]);
  const [includeTrashed, setIncludeTrashed] = useState(false);

  // Liste viaggio: il modulo è precluso ai Driver (stessa RLS del modulo
  // stesso), quindi per loro non ha senso caricarle né mostrarle qui.
  const listeAllowed = !isDriver(currentUserId);
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
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#fff",
      }}>
        <div className="playfair" style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
          🔍 Ricerca
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {hasFilters && (
            <button onClick={resetAll} style={{
              background: "transparent", border: "1px solid var(--border)",
              borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "var(--text-muted)",
              cursor: "pointer", fontWeight: 500,
            }}>Reset</button>
          )}
          <button onClick={onClose} style={{
            background: "transparent", border: "none", fontSize: 18,
            cursor: "pointer", color: "var(--text-muted)", lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {/* Scroll unico: filtri + risultati scorrono insieme. Prima erano due aree
          di scroll annidate con altezze fisse (380 + 320 px) → su mobile lo
          scroll era a scatti e poco agevole. Ora un solo contenitore scrollabile. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", background: "var(--surface)" }}>
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Scadenza</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Da</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{
                width: "100%", padding: "7px 10px", borderRadius: 6,
                border: "1px solid var(--border)", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>A</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{
                width: "100%", padding: "7px 10px", borderRadius: 6,
                border: "1px solid var(--border)", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }} />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Categoria</div>
          <FilterDropdown
            options={Object.entries(categories).map(([key, c]) => ({
              value: key, label: c.label, icon: <span>{c.icon}</span>,
            }))}
            selected={cats}
            onToggle={val => toggle(cats, setCats, val)}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Status</div>
          <FilterDropdown
            options={STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))}
            selected={stats}
            onToggle={val => toggle(stats, setStats, val)}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
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
            <div style={{ marginBottom: 14 }}>
              <div style={sectionTitle}>✈️ Stato Lista</div>
              <FilterDropdown
                options={availableListeStati.map(s => ({
                  value: s, label: s.charAt(0).toUpperCase() + s.slice(1),
                }))}
                selected={listeStati}
                onToggle={val => toggle(listeStati, setListeStati, val)}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
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

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text)" }}>
          <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
          🗑️ Includi {listeAllowed ? "task e liste" : "task"} nel cestino
        </label>
      </div>

      <div style={{ background: "#fff" }}>

        {hasFilters && results.length === 0 && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Nessun task corrisponde ai filtri
          </div>
        )}
        {hasFilters && results.length > 0 && (
          <>
            <div style={{
              padding: "8px 18px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: 1, background: "var(--surface2)",
              borderBottom: "1px solid var(--border)", position: "sticky", top: 0,
            }}>
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: "var(--text)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {t.deletedAt && <span style={{ color: "var(--danger)", marginRight: 6 }}>🗑️</span>}
                      {t.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 10 }}>
                      <span>{STATUS_LABELS[t.status]}</span>
                      {t.praticaRef && (
                        <span style={{ color: "var(--navy-light)", fontWeight: 600 }}>• {t.praticaRef}</span>
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
                  <div style={{ display: "flex", marginLeft: 4 }}>
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
            <div style={{
              padding: "8px 18px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: 1, background: "var(--surface2)",
              borderBottom: "1px solid var(--border)", position: "sticky", top: 0,
            }}>
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
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: "#F9FAFB", color: "#6B7280",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, flexShrink: 0,
                }}>🧾</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: "var(--text)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {l.deleted_at && <span style={{ color: "var(--danger)", marginRight: 6 }}>🗑️</span>}
                    {/* Titolare E cointestatari, come nell'elenco del modulo:
                        una lista trovata cercando il cointestatario deve
                        mostrare il nome che l'ha fatta trovare, altrimenti la
                        riga sembra un risultato sbagliato. */}
                    {intestazioneLista(l) || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 10 }}>
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
