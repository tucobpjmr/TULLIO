// ─── TOPBAR ──────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f). Topbar + AdvancedSearchPanel,
// UserSwitcher, NotificationsPanel e i loro helper (module-local). Esporta Topbar.
import { useState, useRef, useEffect, useMemo } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { Users as UsersAPI } from "../../lib/api.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { PRIORITIES, STATUSES, STATUS_LABELS, STATUS_COLORS } from "../../lib/taskConstants.js";
import { formatDate, isOverdue, startOfLocalDay, endOfLocalDay } from "../../lib/taskUtils.js";
import { MOCK_NOTIFICATIONS } from "../../state/mockData.js";
import { TEAM, CATEGORIES, getMember, isJuniorAgent } from "../../state/appGlobals.js";
import { ProfileEditor } from "../modals/ProfileEditor.jsx";
import { SwipeActions } from "../SwipeActions.jsx";
import { getPushSupport, getPushState, enablePush, disablePush } from "../../lib/push.js";
import { NOTIF_ICONS, NOTIF_CATEGORIES, notifTitle, notifSubtitle, notifTime, notifTarget } from "../../lib/notifUtils.js";

const AdvancedSearchPanel = ({ tasks, dispatch, onClose, keyword = "", onKeyword }) => {
  const { isMobile } = useViewport();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cats, setCats] = useState([]);
  const [stats, setStats] = useState([]);
  const [agents, setAgents] = useState([]);
  const [includeTrashed, setIncludeTrashed] = useState(false);

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
  };

  const hasFilters = keyword.trim() || dateFrom || dateTo || cats.length || stats.length || agents.length || includeTrashed;

  const results = useMemo(() => {
    if (!hasFilters) return [];
    const k = keyword.trim().toLowerCase();
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
      if (k) {
        const hay = [
          t.title || "",
          t.description || "",
          t.client || "",
          t.praticaRef || "",
          ...(t.comments || []).map(c => c.text || ""),
        ].join(" ").toLowerCase();
        if (!hay.includes(k)) return false;
      }
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

  const chipBase = (active, color) => ({
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
    cursor: "pointer", border: `1px solid ${active ? color : "var(--border)"}`,
    background: active ? color : "#fff",
    color: active ? "#fff" : "var(--text)",
    transition: "all 0.15s", userSelect: "none",
  });

  const sectionTitle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 };

  return (
    <div
      className="fade-in"
      style={{
        position: isMobile ? "fixed" : "absolute",
        top: isMobile ? 64 : "calc(100% + 8px)",
        left: isMobile ? 8 : 0,
        right: isMobile ? 8 : "auto",
        width: isMobile ? "auto" : 680,
        // iOS Safari: dvh = viewport visibile. Su mobile il pannello parte a
        // top:64 e ha zIndex sotto la bottom-nav → riservo ~140px (offset top +
        // nav) così l'ultimo risultato non finisce nascosto sotto la nav.
        maxHeight: isMobile ? "calc(100dvh - 140px)" : "calc(100dvh - 80px)",
        overflow: "hidden",
        background: "var(--surface)", borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        border: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        zIndex: 200,
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(CATEGORIES).map(([key, c]) => {
              const active = cats.includes(key);
              return (
                <div key={key} onClick={() => toggle(cats, setCats, key)} style={chipBase(active, c.color)}>
                  <span>{c.icon}</span>{c.label}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Status</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {STATUSES.map(s => {
              const active = stats.includes(s);
              return (
                <div key={s} onClick={() => toggle(stats, setStats, s)} style={chipBase(active, STATUS_COLORS[s])}>
                  {STATUS_LABELS[s]}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Agente</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TEAM.filter(m => !m.pending).map(m => {
              const active = agents.includes(m.id);
              return (
                <div key={m.id} onClick={() => toggle(agents, setAgents, m.id)} style={chipBase(active, m.color)}>
                  <span style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: active ? "rgba(255,255,255,0.25)" : m.color,
                    color: "#fff", fontSize: 9, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>{m.avatar}</span>
                  {m.name.split(" ")[0]}
                </div>
              );
            })}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text)" }}>
          <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
          🗑️ Includi task nel cestino
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
              const cat = CATEGORIES[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
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
      </div>
      </div>
    </div>
  );
};

// ─── TOPBAR ────────────────────────────────────────────────────────────────
export const Topbar = ({ state, dispatch, notifications: notificationsProp, onMarkRead, onMarkAllRead, onRemoveNotification, onClearAllNotifications, onOpenTask, onOpenChat }) => {
  const { isMobile } = useViewport();
  // Fix #11: notifiche mock gate-ate dietro env var (default off in prod)
  const SHOW_MOCK_NOTIFS = import.meta.env.DEV && import.meta.env.VITE_SHOW_MOCK_NOTIFICATIONS === 'true';
  const realNotifs = Array.isArray(notificationsProp) ? notificationsProp : [];
  const notifList = SHOW_MOCK_NOTIFS ? [...realNotifs, ...MOCK_NOTIFICATIONS] : realNotifs;
  const unread = notifList.filter(n => !n.read).length;
  const [searchOpen, setSearchOpen] = useState(false);
  const searchWrapRef = useRef(null);

  // Il logo aeroplano funge da pulsante Dashboard (la voce dedicata è stata
  // rimossa da sidebar/bottom-nav).
  const dashActive = state.activeView === "dashboard";
  const goDashboard = () => dispatch({ type: "SET_VIEW", payload: "dashboard" });

  // Chiude il pannello di ricerca al click fuori dal wrapper (input + pannello)
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);
  return (
    <div style={{
      height: 58, background: "var(--sky)", display: "flex", alignItems: "center",
      padding: isMobile ? "0 12px" : "0 20px", gap: isMobile ? 8 : 16, position: "sticky", top: 0, zIndex: 100,
      borderBottom: "1px solid rgba(212,168,67,0.3)", flexShrink: 0,
    }}>
      {/* Logo — funge da pulsante Dashboard */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: isMobile ? 0 : 12 }}>
        <button
          onClick={goDashboard}
          title="Dashboard"
          aria-label="Dashboard"
          aria-current={dashActive ? "page" : undefined}
          style={{
            width: 32, height: 32, background: "#fff", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, cursor: "pointer", padding: 0, position: "relative",
            border: dashActive ? "2px solid var(--navy)" : "2px solid transparent",
            boxShadow: dashActive ? "0 0 0 2px rgba(15,32,68,0.15)" : "none",
            transition: "all 0.2s", overflow: "hidden",
          }}
        >
          {/* Variante del logo per le dimensioni piccole: ritaglio pieno e tratto
              ispessito, altrimenti a 28px le linee del disegno spariscono. */}
          <img src="/logo-mark-64.png" alt="" width={28} height={28} style={{ display: "block" }} />
        </button>
        <button
          onClick={goDashboard}
          className="vd-hide-mobile"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
        >
          <div className="playfair" style={{ color: "var(--navy)", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>VoyageDesk</div>
          <div style={{ color: "rgba(15,32,68,0.75)", fontSize: 10, letterSpacing: 1.5 }}>TRAVEL MANAGEMENT</div>
        </button>
      </div>

      {/* Ricerca unificata (testuale + filtri avanzati) */}
      <div ref={searchWrapRef} style={{ flex: 1, maxWidth: 520, position: "relative" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(15,32,68,0.7)", fontSize: 14 }}>🔍</div>
          <input
            value={state.searchQuery}
            onChange={e => { dispatch({ type: "SET_SEARCH", payload: e.target.value }); setSearchOpen(true); }}
            onFocus={e => { setSearchOpen(true); e.target.style.background = "rgba(255,255,255,0.65)"; e.target.style.borderColor = "var(--gold)"; }}
            onBlur={e => { e.target.style.background = "rgba(255,255,255,0.45)"; e.target.style.borderColor = "rgba(15,32,68,0.15)"; }}
            placeholder={isMobile ? "Cerca..." : "Cerca task, clienti, categorie... (Ctrl+K)"}
            aria-label="Cerca"
            style={{
              width: "100%", background: "rgba(255,255,255,0.45)", border: "1px solid rgba(15,32,68,0.15)",
              borderRadius: 8, padding: "7px 12px 7px 36px", color: "var(--navy)", fontSize: 13,
              outline: "none", transition: "all 0.2s", boxSizing: "border-box",
            }}
          />
        </div>
        {searchOpen && (
          <AdvancedSearchPanel
            tasks={state.tasks}
            dispatch={dispatch}
            keyword={state.searchQuery}
            onKeyword={v => dispatch({ type: "SET_SEARCH", payload: v })}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </div>

      <div className="vd-hide-mobile" style={{ flex: 1 }} />

      {/* Notifications */}
      <div style={{ position: "relative" }}>
        <button onClick={() => dispatch({ type: "TOGGLE_NOTIF" })} style={{
          background: "rgba(255,255,255,0.45)", border: "1px solid rgba(15,32,68,0.15)",
          borderRadius: 8, width: 36, height: 36, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative"
        }}>
          🔔
          {unread > 0 && <span style={{
            position: "absolute", top: -4, right: -4, background: "var(--gold)",
            borderRadius: "50%", width: 16, height: 16, fontSize: 10, fontWeight: 700,
            color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center"
          }}>{unread}</span>}
        </button>
        {state.showNotif && <NotificationsPanel
          dispatch={dispatch}
          notifications={notifList}
          isReal={!SHOW_MOCK_NOTIFS}
          onMarkRead={onMarkRead}
          onMarkAllRead={onMarkAllRead}
          onRemoveNotification={onRemoveNotification}
          onClearAllNotifications={onClearAllNotifications}
          onOpenTask={onOpenTask}
          onOpenChat={onOpenChat}
        />}
      </div>

      {/* User switcher (v0.8) */}
      <UserSwitcher state={state} dispatch={dispatch} />
    </div>
  );
};

// ─── USER SWITCHER (v0.8) ──────────────────────────────────────────────────
// Dropdown nella Topbar per cambiare l'utente loggato (mock multi-utente).
// ProfileEditor (+ AVATAR_EMOJIS/AVATAR_COLORS) → src/components/modals/ProfileEditor.jsx (Step P Phase 2f)

const UserSwitcher = ({ state, dispatch }) => {
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { signOut } = useAuth();
  const ref = useRef(null);

  // Step O (caveat #16): logout reale. Prima marca l'utente offline (best
  // effort: dopo signOut le RLS bloccherebbero l'update), poi chiude la
  // sessione — l'AuthGate in main.jsx ri-renderizza LoginScreen da solo.
  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await UsersAPI.setPresence(state.currentUserId, "offline"); } catch { /* best effort */ }
    const { error } = await signOut();
    if (error) {
      setSigningOut(false);
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Logout fallito: ${error.message}` } });
    }
  };
  const curr = getMember(state.currentUserId) || { name: "—", role: "—", avatar: "??", color: "#999" };
  // Fix #14: demo switch gate-ato dietro env var (default off in prod e in dev)
  // Cambia solo currentUser lato UI; auth.uid() server-side resta l'utente reale → confonde RLS.
  // Attivare con VITE_DEMO_SWITCH=true in .env.local solo per test multi-ruolo.
  const SHOW_DEMO_SWITCH = import.meta.env.DEV && import.meta.env.VITE_DEMO_SWITCH === 'true';

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h, { passive: true });
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [open]);

  // Tutti i membri non-pending, ordinati per ruolo (Admin, Manager, Senior, Junior, Driver)
  const order = { admin: 0, manager: 1, "senior agent": 2, "junior agent": 3, driver: 4 };
  const candidates = TEAM
    .filter(m => !m.pending)
    .slice()
    .sort((a, b) => (order[(a.role || "").toLowerCase()] ?? 99) - (order[(b.role || "").toLowerCase()] ?? 99));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Cambia utente"
        aria-label="Cambia utente loggato"
        style={{
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          background: "rgba(255,255,255,0.45)", border: "1px solid rgba(15,32,68,0.15)",
          borderRadius: 8, padding: "3px 8px 3px 4px", fontFamily: "inherit",
        }}
      >
        {curr.photoUrl ? (
          <img src={curr.photoUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: curr.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#fff",
          }}>{curr.avatar}</div>
        )}
        <div className="vd-hide-mobile" style={{ textAlign: "left" }}>
          <div style={{ color: "var(--navy)", fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{curr.name}</div>
          <div style={{ color: "rgba(15,32,68,0.75)", fontSize: 10 }}>{curr.role}</div>
        </div>
        <span style={{ color: "rgba(15,32,68,0.7)", fontSize: 10, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 12px 30px rgba(0,0,0,0.2)", zIndex: 200,
          minWidth: 240, padding: 6,
        }}>
          {/* Profilo personale */}
          <button
            onClick={() => { setShowProfile(true); setOpen(false); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 10px", background: "transparent",
              border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              color: "var(--navy)", textAlign: "left", borderBottom: "1px solid var(--border)", marginBottom: 4,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 16 }}>👤</span>
            <span style={{ fontWeight: 600 }}>Modifica profilo</span>
          </button>

          {SHOW_DEMO_SWITCH && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", padding: "8px 10px 4px", letterSpacing: 1 }}>
                ACCEDI COME (DEMO MULTI-RUOLO)
              </div>
              {candidates.map(m => {
                const active = m.id === state.currentUserId;
                return (
                  <button
                    key={m.id}
                    onClick={() => { dispatch({ type: "SET_CURRENT_USER", payload: m.id }); setOpen(false); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", background: active ? "var(--surface2)" : "transparent",
                      border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                      color: "var(--text)", textAlign: "left",
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface2)"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    {m.photoUrl ? (
                      <img src={m.photoUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", background: m.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
                      }}>{m.avatar}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                        {m.role}
                        {isJuniorAgent(m.id) && (
                          <span style={{
                            background: "#FFF3CD", color: "#856404", fontSize: 9, fontWeight: 700,
                            padding: "1px 5px", borderRadius: 4, letterSpacing: 0.3,
                          }}>JUNIOR</span>
                        )}
                      </div>
                    </div>
                    {active && <span style={{ color: "var(--success)", fontSize: 14 }}>✓</span>}
                  </button>
                );
              })}
            </>
          )}

          {/* Step O: logout reale (caveat #16) */}
          <button
            onClick={handleLogout}
            disabled={signingOut}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 10px", background: "transparent",
              border: "none", borderRadius: 6, cursor: signingOut ? "wait" : "pointer",
              fontFamily: "inherit", fontSize: 13,
              color: "var(--danger)", textAlign: "left",
              borderTop: "1px solid var(--border)", marginTop: 4,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 16 }}>🚪</span>
            <span style={{ fontWeight: 600 }}>{signingOut ? "Uscita…" : "Esci"}</span>
          </button>
        </div>
      )}

      {/* Profile Editor Modal */}
      {showProfile && <ProfileEditor member={curr} dispatch={dispatch} onClose={() => setShowProfile(false)} />}
    </div>
  );
};

// ─── NOTIFICATIONS PANEL ───────────────────────────────────────────────────
// Helpers per il rendering delle notifiche reali (Step F): icona, titolo,
// sottotitolo, tempo e destinazione del tap vivono in lib/notifUtils.js
// (funzioni pure, testate in src/test/notifUtils.test.js).

// computePresence + PRESENCE_COLORS (usati solo dalla chat) → src/components/chat/ChatPanel.jsx (Step P Phase 2f)

// ─── PUSH TOGGLE ───────────────────────────────────────────────────────────
// Opt-in Web Push per dispositivo (handoff v44): footer del NotificationsPanel.
// Stati: loading | unsupported | needs-install (iOS Safari fuori PWA) |
// denied (permesso negato a livello browser/OS) | off | on | busy.
const PUSH_HINTS = {
  "needs-install": "Su iPhone: apri da Safari → Condividi → \"Aggiungi alla schermata Home\" (richiede iOS 16.4+), poi riapri l'app installata.",
  unsupported: "Questo browser non supporta le notifiche push.",
  denied: "Permesso negato: riattivalo dalle impostazioni del browser o del sistema.",
  off: "Ricevi le notifiche anche ad app chiusa.",
  on: "Attive su questo dispositivo.",
};

const PushToggle = ({ dispatch }) => {
  const { profile } = useAuth();
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      const support = getPushSupport();
      if (!support.supported) {
        if (alive) setStatus(support.needsInstall ? "needs-install" : "unsupported");
        return;
      }
      const s = await getPushState();
      if (!alive) return;
      setStatus(s.enabled ? "on" : (s.permission === "denied" ? "denied" : "off"));
    })();
    return () => { alive = false; };
  }, []);

  const toggle = async () => {
    if (status === "off") {
      setStatus("busy");
      const { error } = await enablePush(profile?.id);
      if (!error) { setStatus("on"); return; }
      if (error === "denied") { setStatus("denied"); return; }
      setStatus("off");
      if (error !== "dismissed") {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche push: ${error}` } });
      }
    } else if (status === "on") {
      setStatus("busy");
      const { error } = await disablePush();
      setStatus(error ? "on" : "off");
      if (error) {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche push: ${error}` } });
      }
    }
  };

  if (status === "loading") return null;
  const enabled = status === "on";
  const interactive = status === "on" || status === "off";

  return (
    <div style={{
      padding: "12px 16px", borderTop: "1px solid var(--border)",
      background: "var(--surface2)", display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>📲</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Notifiche push</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
          {status === "busy" ? "Attendere…" : PUSH_HINTS[status]}
        </div>
      </div>
      {(interactive || status === "busy") && (
        <button
          onClick={toggle}
          disabled={status === "busy"}
          role="switch"
          aria-checked={enabled}
          aria-label="Attiva notifiche push su questo dispositivo"
          style={{
            width: 40, height: 22, borderRadius: 99, border: "none", padding: 2,
            background: enabled ? "var(--success)" : "var(--border)",
            cursor: status === "busy" ? "default" : "pointer",
            display: "flex", justifyContent: enabled ? "flex-end" : "flex-start",
            alignItems: "center", transition: "background 0.2s", flexShrink: 0, marginTop: 2,
            opacity: status === "busy" ? 0.6 : 1,
          }}
        >
          <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
        </button>
      )}
    </div>
  );
};

const NotificationsPanel = ({ dispatch, notifications, isReal, onMarkRead, onMarkAllRead, onRemoveNotification, onClearAllNotifications, onOpenTask, onOpenChat }) => {
  const { isMobile } = useViewport();
  const [filter, setFilter] = useState("all"); // all | unread | task | mention | chat
  const list = Array.isArray(notifications) ? notifications : MOCK_NOTIFICATIONS;
  const hasUnread = list.some(n => !n.read);
  // Filtri (Fase 2 notifiche): conteggi e applicazione filtro.
  const counts = useMemo(() => {
    const c = { all: list.length, unread: 0, task: 0, mention: 0, chat: 0 };
    for (const n of list) {
      if (!n.read) c.unread++;
      if (NOTIF_CATEGORIES.task.includes(n.type)) c.task++;
      else if (NOTIF_CATEGORIES.mention.includes(n.type)) c.mention++;
      else if (NOTIF_CATEGORIES.chat.includes(n.type)) c.chat++;
    }
    return c;
  }, [list]);
  const filteredList = useMemo(() => {
    if (filter === "all") return list;
    if (filter === "unread") return list.filter(n => !n.read);
    const types = NOTIF_CATEGORIES[filter] || [];
    return list.filter(n => types.includes(n.type));
  }, [list, filter]);
  // Navigabile se il payload porta a un task, a una conversazione o a una vista
  // (digest coda globale → Dashboard, tab "Coda Globale").
  const isNavigable = (n) => isReal && !!notifTarget(n);
  const handleClick = (n) => {
    const target = isReal ? notifTarget(n) : null;
    if (target) {
      if (target.kind === "task") onOpenTask?.(target.taskId);
      else if (target.kind === "chat") onOpenChat?.(target.conversationId);
      else if (target.kind === "view") dispatch({ type: "SET_VIEW", payload: target.view, queue: target.queue });
      dispatch({ type: "TOGGLE_NOTIF" });
    }
    if (isReal && !n.read) onMarkRead?.(n.id);
  };
  const filterBtn = (key, label) => {
    const cnt = counts[key];
    const active = filter === key;
    return (
      <button
        key={key}
        onClick={() => setFilter(key)}
        style={{
          background: active ? "var(--navy)" : "transparent",
          color: active ? "#fff" : "var(--text-muted)",
          border: `1px solid ${active ? "var(--navy)" : "var(--border)"}`,
          borderRadius: 99, padding: "3px 9px", fontSize: 11, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >{label}{cnt > 0 && ` (${cnt})`}</button>
    );
  };
  return (
    <div className="slide-right" style={{
      position: isMobile ? "fixed" : "absolute",
      top: isMobile ? 56 : "calc(100% + 8px)",
      right: isMobile ? 12 : 0,
      left: isMobile ? 12 : "auto",
      width: isMobile ? "auto" : "min(360px, calc(100vw - 24px))",
      background: "#fff", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
      border: "1px solid var(--border)", overflow: "hidden", zIndex: 200,
    }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div className="playfair" style={{ fontWeight: 600, fontSize: 15 }}>Notifiche</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isReal && hasUnread && (
            <button onClick={() => onMarkAllRead?.()} style={{
              background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
              padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "var(--text-muted)",
            }}>Segna tutte lette</button>
          )}
          {isReal && list.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm(`Cancellare tutte le notifiche?\n\n${list.length} ${list.length === 1 ? "notifica verrà eliminata" : "notifiche verranno eliminate"}. Azione irreversibile.`)) {
                  onClearAllNotifications?.();
                }
              }}
              title="Cancella tutte le notifiche"
              aria-label="Cancella tutte le notifiche"
              style={{
                background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
                padding: "4px 8px", cursor: "pointer", fontSize: 13, color: "var(--text-muted)",
              }}
            >🗑️</button>
          )}
          <button onClick={() => dispatch({ type: "TOGGLE_NOTIF" })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-muted)" }}>✕</button>
        </div>
      </div>
      {isReal && list.length > 0 && (
        <div style={{
          padding: "8px 12px", borderBottom: "1px solid var(--border)",
          display: "flex", gap: 5, flexWrap: "wrap", background: "var(--surface2)",
        }}>
          {filterBtn("all", "Tutte")}
          {filterBtn("unread", "Non lette")}
          {counts.task > 0 && filterBtn("task", "📋 Task")}
          {counts.mention > 0 && filterBtn("mention", "@ Menzioni")}
          {counts.chat > 0 && filterBtn("chat", "✉️ Chat")}
        </div>
      )}
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {filteredList.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
            {list.length === 0 ? "Nessuna notifica" : "Nessuna notifica per questo filtro"}
          </div>
        )}
        {filteredList.map(n => (
          <div
            key={n.id}
            onClick={() => handleClick(n)}
            style={{
              padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start",
              background: n.read ? "transparent" : "rgba(212,168,67,0.07)",
              borderBottom: "1px solid var(--border)",
              transition: "background 0.2s",
              cursor: isNavigable(n) || (isReal && !n.read) ? "pointer" : "default",
            }}
            onMouseEnter={e => { if (isNavigable(n)) e.currentTarget.style.background = "rgba(212,168,67,0.12)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = n.read ? "transparent" : "rgba(212,168,67,0.07)"; }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>{NOTIF_ICONS[n.type] || "🔔"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{notifTitle(n)}</div>
              {notifSubtitle(n) && (
                <div style={{
                  fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{notifSubtitle(n)}</div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{notifTime(n)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 2 }}>
              {!n.read && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)" }} />}
              {isReal && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveNotification?.(n.id); }}
                  title="Elimina notifica"
                  aria-label="Elimina notifica"
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 2,
                    fontSize: 13, lineHeight: 1, color: "var(--text-muted)", opacity: 0.6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = 0.6; }}
                >✕</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {isReal && <PushToggle dispatch={dispatch} />}
    </div>
  );
};

// ─── SIDEBAR ───────────────────────────────────────────────────────────────
