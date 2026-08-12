// ─── DASHBOARD ───────────────────────────────────────────────────────────────
// La vista d'ingresso: quattro code a tab, scadenze imminenti, carico del team.
// Le code vivono in ./queues/ — erano quattro componenti da ~200 righe l'uno
// dentro questo file, per un totale di oltre mille righe in cui la logica della
// vista era indistinguibile da quella delle singole liste.
import { memo, useState, useEffect, useMemo } from "react";
import { PersonalQueue } from "./queues/PersonalQueue.jsx";
import { UrgentQueue } from "./queues/UrgentQueue.jsx";
import { UnassignedQueue } from "./queues/UnassignedQueue.jsx";
import { OverdueQueue } from "./queues/OverdueQueue.jsx";
import { WaitingQueue } from "./queues/WaitingQueue.jsx";
import { QueueTab } from "./queues/QueueTab.jsx";
import { useOpenTask } from "./queues/queueShared.js";
import { useViewport } from "../Viewport.jsx";
import { SwipeActions } from "../SwipeActions.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { TaskRow } from "../tasks/TaskCard.jsx";
import { SkeletonRows } from "../ui/SkeletonRows.jsx";
import { formatDate, isOverdue, isUrgent, isMyTask, isInGlobalQueue, getActiveTasks } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useTasks } from "../../state/TasksContext.jsx";
import { NoticeBoard } from "./NoticeBoard.jsx";
import { roleLabel } from "../../lib/taskConstants.js";
import { giornoLungo } from "../../lib/dates.js";

// P2-4: comparatori a livello di modulo — erano funzioni anonime ricreate
// dentro ogni `sort`, quindi un array nuovo (a parità di contenuto) a ogni
// singolo render, mentre solo il cambio di tab della coda dovrebbe invalidarli.
const byDueDate = (a, b) => {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return new Date(a.dueDate) - new Date(b.dueDate);
};
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const byPriorityThenDueDate = (a, b) => {
  const dp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  return dp !== 0 ? dp : byDueDate(a, b);
};
// Una task in attesa di cliente/fornitore è bloccata da un fattore esterno,
// non in ritardo per conto di chi la possiede: appartiene solo alla coda "In
// attesa", anche a scadenza superata — non deve raddoppiare nella coda Scadute.
const isWaitingStatus = status => status === "awaiting_client" || status === "awaiting_supplier";
const WINDOW_72H = 72 * 60 * 60 * 1000;

// ─── PERSONAL QUEUE (le mie task — v0.8) ───────────────────────────────────
// enableDateFilter (v22): per il Driver (vista transfer-oriented) abilita un
// filtro data/ora — i transfer sono time-sensitive, Giulia filtra la coda per
// giornata (Tutte / Oggi / Domani / data specifica).
// ─── DASHBOARD ─────────────────────────────────────────────────────────────
// `memo` + lettura dal contesto: vedi state/TasksContext.jsx. Le due fette
// rimaste come prop — gli avvisi della bacheca e la tab coda richiesta da una
// notifica — sono piccole e con identità stabile: cambiano quando cambia il
// loro dato, non a ogni azione come faceva `state`.
//
// `tasksLoading` / `noticesLoading` (criticità #6) arrivano da useAppHydration
// e sono BOOLEANI e non un oggetto `loading`: una prop primitiva non ha
// identità da preservare, quindi non c'è modo che questa scelta rompa il
// bail-out del `memo` (vedi src/test/domainProviders.test.jsx).
export const Dashboard = memo(function Dashboard({
  dispatch, onOpenChat, notices = [], dashboardQueue = null,
  tasksLoading = false, noticesLoading = false,
}) {
  const { isMobile } = useViewport();
  const {
    currentUserId, getMember, getRoleType, getAssignableTeam,
    canViewTask, getVisibleTasks, isJuniorAgent,
  } = useAppData();
  const tasks = useTasks();
  const [activeQueue, setActiveQueue] = useState("personal");
  const openTask = useOpenTask(dispatch);
  const uid = currentUserId;
  const role = getRoleType(uid);
  // Apertura da notifica: il digest della coda globale chiede la tab "global"
  // (SET_VIEW con action.queue → state.dashboardQueue). Il seq cambia a ogni
  // richiesta, così il tap funziona anche a tab già visitata. Il Driver non ha
  // la coda globale: per lui la richiesta viene ignorata (tab inesistente).
  const queueReq = dashboardQueue;
  useEffect(() => {
    if (!queueReq?.tab) return;
    if (queueReq.tab === "global" && role === "driver") return;
    setActiveQueue(queueReq.tab);
  }, [queueReq?.tab, queueReq?.seq, role]);
  const me = getMember(uid);
  // P2-4: sei passate filter+sort su 248 task a ogni render di Dashboard —
  // ricalcolate anche per un cambio estraneo (toast, un carattere in ricerca
  // altrove). `useMemo` con le dipendenze reali le limita al cambio di ciò da
  // cui dipendono davvero (tasks, team, tab attiva).
  const allTasks = useMemo(() => getActiveTasks(tasks), [tasks]);
  // Filtro permessi: solo task visibili all'utente
  const visibleTasks = useMemo(() => getVisibleTasks(allTasks, uid), [allTasks, getVisibleTasks, uid]);

  const agentWorkload = useMemo(() => getAssignableTeam().map(m => ({
    ...m,
    count: allTasks.filter(t => t.assignees?.includes(m.id) && t.status !== "done").length
  })), [allTasks, getAssignableTeam]);

  const next7 = useMemo(() => visibleTasks
    .filter(t => t.status !== "done" && t.dueDate)
    .sort(byDueDate)
    .slice(0, 6), [visibleTasks]);

  // ─── 3 code distinte (v0.8) ───
  // Coda globale: task non assegnati (Driver non la vede)
  const showGlobalQueue = role !== "driver";
  const unassigned = useMemo(() => showGlobalQueue
    ? allTasks.filter(t => t.status !== "done" && isInGlobalQueue(t) && canViewTask(t, uid)).sort(byPriorityThenDueDate)
    : [], [showGlobalQueue, allTasks, canViewTask, uid]);

  // Coda personale: task dove sono assegnatario, non completati
  const personalQueue = useMemo(() => allTasks
    .filter(t => isMyTask(t, uid) && t.status !== "done")
    .sort(byDueDate), [allTasks, uid]);

  // Urgenti: task visibili con scadenza imminente (Driver non le vede).
  // Visibile a tutti gli altri ruoli, admin inclusi. La tab Urgenti permette
  // di allargare la finestra (24/48/72h); qui prepariamo i candidati entro 72h
  // e lasciamo il filtro temporale al componente. Il badge della tab usa la
  // finestra di default (24h) via isUrgent.
  const showUrgent = role !== "driver";
  const urgentCandidates = useMemo(() => showUrgent
    ? visibleTasks
      .filter(t => {
        if (!t.dueDate || t.status === "done") return false;
        const diff = new Date(t.dueDate).getTime() - Date.now();
        return diff >= 0 && diff <= WINDOW_72H;
      })
      .sort(byDueDate)
    : [], [showUrgent, visibleTasks]);
  const urgentTasks = useMemo(() => urgentCandidates.filter(t => isUrgent(t)), [urgentCandidates]);

  // Scadute: tutti i task visibili scaduti, non completati. Le task in attesa
  // di cliente/fornitore restano escluse anche se la scadenza è passata: sono
  // bloccate dall'esterno, non in ritardo, e vivono solo nella coda "In attesa".
  const overdueTasks = useMemo(() => visibleTasks
    .filter(t => t.status !== "done" && !isWaitingStatus(t.status) && isOverdue(t))
    .sort(byDueDate), [visibleTasks]);

  // In attesa: task visibili ferme su un riscontro esterno (Driver non le vede,
  // stesso gating di Coda globale/Urgenti — non gestisce rapporti con
  // cliente/fornitore).
  const showWaiting = role !== "driver";
  const waitingTasks = useMemo(() => showWaiting
    ? visibleTasks
      .filter(t => isWaitingStatus(t.status))
      .sort(byDueDate)
    : [], [showWaiting, visibleTasks]);

  // "Sto ancora caricando E non ho ancora niente da mostrare": è la sola
  // condizione in cui i conteggi a schermo non descrivono la realtà. Un reload
  // realtime a dati già presenti non passa di qui — i vecchi valori restano
  // visibili finché non arrivano i nuovi, che è il comportamento giusto.
  const caricando = tasksLoading && allTasks.length === 0;
  // Conteggio della linguetta: "…" e non 0 mentre il dato non c'è. Zero è una
  // risposta; i puntini sono l'assenza di risposta, ed è quella la verità.
  const conteggio = (n) => (caricando ? "…" : n);

  const takeOwnership = (task) => {
    // Step I: auto-assegna + auto-move "In Corso" se la task è in todo,
    // più toast personalizzato che cita il titolo.
    const patch = { id: task.id, assignees: [uid] };
    if (task.status === "todo") patch.status = "inprogress";
    dispatch({
      type: "UPDATE_TASK",
      payload: patch,
      swipe: true,
      toastMessage: `Hai preso in carico: ${task.title}`,
    });
  };

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: isMobile ? 18 : 24, minWidth: 0, overflow: "hidden" }}>
      {/* Header */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="playfair" style={{ fontSize: 35, fontWeight: 700, color: "var(--navy)" }}>
            {giornoLungo(new Date())}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {role !== "admin" && (
              <>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", background: "var(--surface3)", borderRadius: 99, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.3 }}>{me ? roleLabel(me) : ""}</span>
                  {isJuniorAgent(uid) && (
                    <span style={{ fontSize: 10, padding: "1px 6px", background: "#FFF3CD", color: "#856404", borderRadius: 99, fontWeight: 700, letterSpacing: 0.3 }}>JUNIOR</span>
                  )}
                </span>
                {overdueTasks.length > 0 && (
                  <span style={{
                    fontSize: 11, padding: "2px 9px", borderRadius: 99, fontWeight: 700,
                    background: "rgba(192,57,43,0.08)", color: "var(--danger)",
                    border: "1px solid rgba(192,57,43,0.2)",
                  }}>⚠ {overdueTasks.length} scadut{overdueTasks.length === 1 ? "a" : "e"}</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Accesso al modulo Liste viaggio. Vive qui, nello slot destro
            dell'header, e non in sidebar/bottom-nav: la bottom bar mobile ha
            già 7-8 voci a seconda del ruolo e una in più scenderebbe sotto i
            44px di touch target. Gating come showGlobalQueue/showUrgent. */}
        {role !== "driver" && (
          <button
            onClick={() => dispatch({ type: "SET_VIEW", payload: "liste" })}
            className="hover-lift"
            style={{
              padding: isMobile ? "8px 14px" : "10px 18px", borderRadius: 9,
              border: "none", background: "var(--navy)",
              color: "#fff", cursor: "pointer", fontFamily: "inherit",
              fontSize: isMobile ? 13 : 14, fontWeight: 600,
              display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0,
              boxShadow: "0 2px 8px rgba(15,32,68,0.3)",
            }}
          >
            🧾 Liste viaggio
          </button>
        )}
      </div>

      {/* ─── BACHECA AVVISI ─── */}
      <NoticeBoard notices={notices} dispatch={dispatch} loading={noticesLoading} />

      {/* ─── TAB CODE ─── */}
      <div style={{
        background: "var(--card)", borderRadius: 12, padding: isMobile ? 8 : 10,
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: `repeat(${(showGlobalQueue ? 1 : 0) + 1 + 1 + (showUrgent ? 1 : 0) + (showWaiting ? 1 : 0)}, 1fr)`,
        gap: isMobile ? 6 : 8,
      }}>
        {showGlobalQueue && (
          <QueueTab
            active={activeQueue === "global"}
            onClick={() => setActiveQueue("global")}
            icon="🌐" label="Coda Globale" count={conteggio(unassigned.length)}
            isMobile={isMobile}
          />
        )}
        <QueueTab
          active={activeQueue === "personal"}
          onClick={() => setActiveQueue("personal")}
          icon="👤" label="Coda Personale" count={conteggio(personalQueue.length)}
          isMobile={isMobile}
        />
        <QueueTab
          active={activeQueue === "overdue"}
          onClick={() => setActiveQueue("overdue")}
          icon="📅" label="Scadute" count={conteggio(overdueTasks.length)}
          isMobile={isMobile} dangerCount
        />
        {showUrgent && (
          <QueueTab
            active={activeQueue === "urgent"}
            onClick={() => setActiveQueue("urgent")}
            icon="⚠️" label="Urgenti" count={conteggio(urgentTasks.length)}
            isMobile={isMobile} dangerCount
          />
        )}
        {showWaiting && (
          <QueueTab
            active={activeQueue === "waiting"}
            onClick={() => setActiveQueue("waiting")}
            icon="⏳" label="In Attesa" count={conteggio(waitingTasks.length)}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* ─── SEZIONE CODA FILTRATA ─── */}
      {activeQueue === "personal" && (
        <PersonalQueue tasks={personalQueue} dispatch={dispatch} me={me} enableDateFilter={role === "driver"} loading={caricando} />
      )}
      {activeQueue === "global" && showGlobalQueue && (
        <UnassignedQueue tasks={unassigned} dispatch={dispatch} onTake={takeOwnership} uid={uid} loading={caricando} />
      )}
      {activeQueue === "overdue" && (
        <OverdueQueue tasks={overdueTasks} dispatch={dispatch} loading={caricando} />
      )}
      {activeQueue === "urgent" && showUrgent && (
        <UrgentQueue tasks={urgentCandidates} dispatch={dispatch} onOpenChat={onOpenChat} uid={uid} loading={caricando} />
      )}
      {activeQueue === "waiting" && showWaiting && (
        <WaitingQueue tasks={waitingTasks} dispatch={dispatch} loading={caricando} />
      )}

      <div className="vd-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Upcoming deadlines */}
        <div style={{ background: "var(--card)", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
          <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Scadenze Prossime</div>
          {/* Il riquadro non aveva alcuno stato vuoto: a lista vuota restava un
              box con solo il titolo, che si legge come "non c'è nulla in
              scadenza" tanto durante il caricamento quanto dopo. Ora i due casi
              si distinguono, ed entrambi lo dicono. */}
          {caricando ? (
            <SkeletonRows count={4} avatar={false} label="Caricamento delle scadenze" />
          ) : next7.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Nessuna scadenza in programma.
            </div>
          ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {next7.map(t => (
              <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                <TaskRow
                  task={t}
                  onOpen={openTask}
                  background={isOverdue(t) ? "rgba(192,57,43,0.05)" : "transparent"}
                  border={`1px solid ${isOverdue(t) ? "rgba(192,57,43,0.15)" : "var(--border)"}`}
                  subtitle={
                    <span style={{ color: isOverdue(t) ? "var(--danger)" : "var(--text-muted)" }}>
                      {isOverdue(t) ? "⚠️ Scaduto • " : ""}{formatDate(t.dueDate)}
                    </span>
                  }
                  trailing={<PriorityBadge priority={t.priority} />}
                />
              </SwipeActions>
            ))}
          </div>
          )}
        </div>

        {/* Agent workload */}
        <div style={{ background: "var(--card)", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
          <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Carico di Lavoro Team</div>
          {/* Il team c'è già (arriva da AuthContext), i TASK no: senza questo
              ramo il pannello mostrerebbe l'organico al completo con "0 task"
              a testa — un carico di lavoro inventato, non un carico vuoto. */}
          {caricando ? (
            <SkeletonRows count={4} label="Caricamento del carico di lavoro" />
          ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {agentWorkload.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar memberId={m.id} size={30} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{roleLabel(m)}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                  {m.count} task
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>
    </div>
  );
});
