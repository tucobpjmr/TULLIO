// src/components/admin/tabs/AdminStatsTab.jsx
// Stato del sistema: conteggi per status, scaduti, e i template di chat.
import { cardStyle, cardH } from "../adminStyles.js";
import { STATUSES, STATUS_LABELS, STATUS_COLORS } from "../../../lib/taskConstants.js";
import { isOverdue } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { useTasks } from "../../../state/TasksContext.jsx";
import { useStoricoTaskCompleto } from "../../../state/StoricoTaskContext.jsx";
import { MessageTemplatesSection } from "./MessageTemplatesSection.jsx";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF11Bold = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 };
const gridGap20 = { display: "grid", gap: 20 };
const gridGap12 = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 };
const gridGap8 = { display: "grid", gap: 8 };
const txtF13Text = { width: 140, fontSize: 13, color: "var(--text)" };
const boxFlex1H18 = { flex: 1, height: 18, background: "var(--surface2)", borderRadius: 9, overflow: "hidden" };
const txtF13Bold2 = { width: 60, textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text)" };
const txtFlex1F13 = { flex: 1, fontSize: 13 };
const txtF12Bold = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)" };
const gridGap102 = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 };
const rowCenterGap10 = {
  padding: 12, background: "var(--surface2)", borderRadius: 8,
  display: "flex", alignItems: "center", gap: 10,
};
const rowCenterMiddle = {
  width: 32, height: 32, borderRadius: 8, fontSize: 16,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--card)",
};

// ─── ADMIN TAB: SISTEMA / STATS ────────────────────────────────────────────
export const AdminStatsTab = ({ messageTemplates = [] }) => {
  const { team, categories } = useAppData();
  const tasks = useTasks();
  // A-3. Il tasso di completamento è un rapporto fra due conteggi sullo stesso
  // array: la finestra dell'idratazione ne pota UNO SOLO (le completate
  // vecchie), quindi senza il corpus intero questa scheda non mostrerebbe un
  // numero incompleto ma un numero SBAGLIATO, e nulla nel valore lo direbbe.
  const caricandoStorico = useStoricoTaskCompleto();
  // «Zero è una risposta, i puntini sono l'assenza di risposta» (docs/CLAUDE.md,
  // stati di attesa onesti). Restano fuori i conteggi che la finestra copre per
  // costruzione — scaduti, agenti, carico di lavoro: contano solo task NON
  // completate e non cestinate.
  const conta = (n) => (caricandoStorico ? "…" : n);
  const active = tasks.filter(t => !t.deletedAt);
  const trashed = tasks.filter(t => t.deletedAt);
  const overdue = active.filter(t => isOverdue(t));
  const done = active.filter(t => t.status === "done");
  const completionRate = active.length ? Math.round((done.length / active.length) * 100) : 0;

  const byStatus = STATUSES.map(s => ({
    s, label: STATUS_LABELS[s], color: STATUS_COLORS[s],
    count: active.filter(t => t.status === s).length,
  }));

  const byCategory = Object.entries(categories).map(([k, c]) => ({
    k, label: c.label, color: c.color, icon: c.icon,
    count: active.filter(t => t.category === k).length,
  }))
    // L'ordine per frequenza si applica solo a corpus completo: `count` qui
    // include le completate, che la finestra di useStoricoTaskCompleto pota
    // (a differenza di byMember, che filtra status !== "done"). Ordinare i
    // conteggi parziali farebbe riordinare le righe sotto gli occhi di chi
    // legge nel momento in cui lo storico arriva. Durante l'attesa si tiene
    // l'ordine delle categorie, che è stabile.
    .sort((a, b) => (caricandoStorico ? 0 : b.count - a.count));

  const byMember = team.filter(m => !m.pending).map(m => {
    const count = active.filter(t => (t.assignees || []).includes(m.id) && t.status !== "done").length;
    return { m, count };
  });

  const kpiCard = (label, value, sub, color) => (
    <div style={cardStyle}>
      <div style={txtF11Bold}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || "var(--navy)", marginTop: 4 }}>{value}</div>
      {sub && <div style={stiliComuni.txtF12Muted2}>{sub}</div>}
    </div>
  );

  return (
    <div style={gridGap20}>
      {/* KPI */}
      <div className="vd-grid-kpi" style={gridGap12}>
        {kpiCard("Task attivi", conta(active.length), `${conta(trashed.length)} nel cestino`)}
        {kpiCard("Completati", conta(done.length), `${conta(completionRate)}% completion`, "var(--success)")}
        {kpiCard("Scaduti", overdue.length, "task non chiusi oltre data", "var(--danger)")}
        {kpiCard("Agenti", team.filter(m => m.active && !m.pending).length, `${team.filter(m => m.pending).length} in attesa`)}
      </div>

      {/* Distribuzione per status */}
      <div style={cardStyle}>
        <h3 style={cardH}>📊 Distribuzione per status</h3>
        <div style={gridGap8}>
          {byStatus.map(s => {
            // La barra resta a zero finché lo storico non è arrivato: una
            // barra disegnata su un denominatore parziale è un'affermazione
            // grafica falsa, e a differenza di un numero non ha un "…" da
            // mostrare al suo posto.
            const pct = caricandoStorico || !active.length ? 0 : (s.count / active.length) * 100;
            return (
              <div key={s.s} style={stiliComuni.rowCenterGap12}>
                <div style={txtF13Text}>{s.label}</div>
                <div style={boxFlex1H18}>
                  <div style={{ width: `${pct}%`, height: "100%", background: s.color, transition: "width 0.3s" }} />
                </div>
                <div style={txtF13Bold2}>{conta(s.count)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Carico team */}
      <div style={cardStyle}>
        <h3 style={cardH}>👥 Carico di lavoro per agente</h3>
        <div style={stiliComuni.gridGap10}>
          {byMember.map(({ m, count }) => (
            <div key={m.id} style={stiliComuni.rowCenterGap12}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: m.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0,
              }}>{m.avatar}</div>
              <div style={txtFlex1F13}>{m.name}</div>
              <div style={txtF12Bold}>
                {count} task attivi
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categorie */}
      <div style={cardStyle}>
        <h3 style={cardH}>🏷️ Distribuzione per categoria</h3>
        <div className="vd-grid-3col" style={gridGap102}>
          {byCategory.map(c => (
            <div key={c.k} style={rowCenterGap10}>
              <div style={rowCenterMiddle}>{c.icon}</div>
              <div style={stiliComuni.flex1}>
                <div style={stiliComuni.txtF13Bold}>{c.label}</div>
                {/* `count` include le completate, che la finestra di
                    useStoricoTaskCompleto pota: è quindi un conteggio che
                    DIPENDE dallo storico, come byStatus e a differenza di
                    byMember (che filtra status !== "done"). Passa da conta(). */}
                <div style={stiliComuni.txtF11Muted}>{conta(c.count)} task</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Template messaggi chat (v2.8) */}
      <MessageTemplatesSection templates={messageTemplates} />
    </div>
  );
};
