// ─── AI DAY PLANNER ──────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useEffect } from "react";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { CategoryChip } from "../ui/CategoryChip.jsx";
import { formatDate, isOverdue } from "../../lib/taskUtils.js";
import { CURRENT_USER, getMember } from "../../state/appGlobals.js";
import { AI } from "../../lib/api.js";

export const AIDayPlanner = ({ tasks, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const today = new Date();

    // I task attivi assegnati a Marco
    const myTasks = tasks.filter(t =>
      t.assignees?.includes(CURRENT_USER) && t.status !== "done"
    );

    // Task di altri operatori: scaduti, oppure urgenti e ancora in "todo"
    // (proxy ragionevole per "non visti / non presi in carico")
    const othersNeglected = tasks.filter(t => {
      if (!t.assignees || t.assignees.includes(CURRENT_USER)) return false;
      if (t.status === "done") return false;
      const urgent = t.priority === "critical" || t.priority === "high";
      const overdue = isOverdue(t);
      const untouched = t.status === "todo";
      return overdue || (urgent && untouched);
    });

    const compact = (t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      client: t.client,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
      assignees: t.assignees?.map(a => getMember(a)?.name).filter(Boolean),
      overdue: isOverdue(t),
      category: t.category,
    });

    const prompt = `Sei un assistente operativo per un'agenzia viaggi. Pianifica oggi (${today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}) per Marco Ferretti (Manager).

MIEI TASK ATTIVI:
${JSON.stringify(myTasks.map(compact))}

TASK URGENTI/SCADUTI DI ALTRI OPERATORI CHE SEMBRANO NEGLETTI (potrebbero non averli visti):
${JSON.stringify(othersNeglected.map(compact))}

Rispondi SOLO con JSON valido, senza markdown e senza testo prima o dopo. Schema:
{
  "summary": "1-2 frasi che inquadrano la giornata",
  "schedule": [{ "time": "HH:MM", "duration": "30min", "taskId": "tX", "action": "cosa fare in concreto", "why": "perché ora" }],
  "alerts": [{ "taskId": "tX", "owner": "Nome", "severity": "alta|media", "suggestion": "azione consigliata (sollecito, escalation, presa in carico)" }],
  "tips": ["consiglio breve e concreto"]
}

Regole:
- Orario: 09:00-18:00, pausa pranzo 13:00-14:00.
- Pianifica solo i MIEI task nel campo "schedule"; ordina per priorità (critical/overdue prima).
- I task di ALTRI operatori vanno SOLO in "alerts" (massimo 3, i più urgenti).
- Per i campi "taskId" usa esattamente gli id forniti.
- Massimo 2 "tips", brevi.`;

    // Il planning passa per la Edge Function 'plan-day' (chiave AI lato server).
    AI.planDay(prompt)
      .then(({ text, error }) => {
        if (cancelled) return;
        if (error) { setError(error.message || "Errore servizio AI"); return; }
        const clean = (text || "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(clean);
        setPlan(parsed);
      })
      .catch(e => { if (!cancelled) setError(e.message || String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [tasks]);

  const findTask = (id) => tasks.find(t => t.id === id);
  const sevColor = { alta: "var(--danger)", media: "var(--warning)" };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20,
    }}>
      <div className="slide-up" style={{
        background: "var(--card)", borderRadius: 16, width: 640, maxWidth: "100%",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 30px 80px rgba(0,0,0,0.25)", border: "1px solid var(--border)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: "var(--gold)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}>✨</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>
                Pianifica la mia giornata
              </div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, letterSpacing: 1.2, marginTop: 2 }}>
                ASSISTENTE AI
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
            width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🤔</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Sto analizzando i tuoi task...</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                Carico, priorità e scadenze del team
              </div>
              <div style={{ marginTop: 16, height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                <div className="skeleton" style={{ height: "100%", width: "60%" }} />
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: "#FEE2E2", border: "1px solid rgba(192,57,43,0.3)", color: "var(--danger)",
              padding: "14px 16px", borderRadius: 10, fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Impossibile generare il piano</div>
              <div style={{ fontSize: 12 }}>{error}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                L'assistente AI funziona solo in ambiente Claude.ai (l'API key è iniettata dalla piattaforma).
              </div>
            </div>
          )}

          {plan && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Summary */}
              {plan.summary && (
                <div style={{
                  background: "var(--surface2)", borderLeft: "3px solid var(--gold)",
                  padding: "12px 14px", borderRadius: 8, fontSize: 13, lineHeight: 1.5,
                }}>{plan.summary}</div>
              )}

              {/* Schedule */}
              {plan.schedule?.length > 0 && (
                <div>
                  <div className="playfair" style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
                    🗓️ Programma della giornata
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {plan.schedule.map((s, i) => {
                      const t = findTask(s.taskId);
                      return (
                        <div key={i} style={{
                          display: "flex", gap: 12, padding: "10px 12px",
                          border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)",
                        }}>
                          <div style={{
                            display: "flex", flexDirection: "column", alignItems: "center",
                            minWidth: 54, paddingTop: 2,
                          }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--heading)" }}>{s.time}</div>
                            {s.duration && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.duration}</div>}
                          </div>
                          <div style={{ width: 1, background: "var(--border)" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                              {t && <CategoryChip category={t.category} small />}
                              {t && <PriorityBadge priority={t.priority} />}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                              {t?.title || s.action}
                            </div>
                            {s.action && t && (
                              <div style={{ fontSize: 12, color: "var(--text)", marginTop: 4 }}>{s.action}</div>
                            )}
                            {s.why && (
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
                                💡 {s.why}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Alerts */}
              {plan.alerts?.length > 0 && (
                <div>
                  <div className="playfair" style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
                    🚨 Task di altri operatori da monitorare
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {plan.alerts.map((a, i) => {
                      const t = findTask(a.taskId);
                      const color = sevColor[a.severity] || "var(--warning)";
                      return (
                        <div key={i} style={{
                          background: color + "12", border: `1px solid ${color}40`,
                          borderRadius: 10, padding: "10px 12px",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{t?.title || a.taskId}</div>
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                Resp. {a.owner}{t?.dueDate && ` • scadenza ${formatDate(t.dueDate)}`}
                              </div>
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 700, color, textTransform: "uppercase",
                              padding: "2px 8px", borderRadius: 99, background: "var(--card)", flexShrink: 0,
                            }}>{a.severity}</span>
                          </div>
                          <div style={{ fontSize: 12, marginTop: 6, color: "var(--text)" }}>
                            👉 {a.suggestion}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tips */}
              {plan.tips?.length > 0 && (
                <div style={{
                  background: "linear-gradient(135deg, rgba(212,168,67,0.08), rgba(212,168,67,0.02))",
                  border: "1px dashed rgba(212,168,67,0.4)",
                  borderRadius: 10, padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-dark)", letterSpacing: 1, marginBottom: 6 }}>
                    ✨ CONSIGLI
                  </div>
                  <ul style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: "var(--text)" }}>
                    {plan.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 24px", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0, background: "var(--surface)",
        }}>
          <button onClick={onClose} style={{
            padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)",
            background: "var(--card)", cursor: "pointer", fontSize: 13, fontWeight: 500,
          }}>Chiudi</button>
        </div>
      </div>
    </div>
  );
};
