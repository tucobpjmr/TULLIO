// ─── ARCHIVIO ──────────────────────────────────────────────────────────────
// Vista che raccoglie le task completate (status "done", non cestinate) e,
// in una sezione dedicata, le liste buoni viaggio chiuse (stato "esaurita",
// non cestinate). Il sistema convoglia qui gli elementi chiusi: spariscono
// dalle code/home attive e restano consultabili/riapribili in questa sezione.
import { memo, useState, useCallback, useMemo, lazy } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { CategoryChip } from "../ui/CategoryChip.jsx";
import { TaskCard } from "../tasks/TaskCard.jsx";
import { LazyPanel } from "../ui/LazyPanel.jsx";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";
import { formatDate, getArchivedTasks } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useTasks } from "../../state/TasksContext.jsx";
import { useStoricoTaskCompleto } from "../../state/StoricoTaskContext.jsx";
import { PERIOD_OPTIONS, filterByPeriod, thStyle, chipStyle } from "./archiveFilters.js";
import { indicizza, matchIndice, terminiRicerca } from "../../lib/searchUtils.js";
import { useFinestra } from "../../hooks/useFinestra.js";
import { MostraAltri } from "../ui/MostraAltri.jsx";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import * as stiliComuni from "../../styles/common.js";
import {
  borderBottom2, boxF12Bold, boxF12Bold2, boxF13MinW0, mb20, padding2, padding3,
  rowCenterBetween, rowCenterGap10, rowCenterGap6, rowCenterGap62, rowCenterGap8, rowGap3,
  rowGap8Mt12, txtBoldHeading, txtBoldSuccess, txtF11Bold2, txtF13Muted2,
} from "./archiveStyles.js";
// La sezione "liste buoni viaggio" è del modulo Liste e viene montata per
// composizione: questa vista non conosce il suo data layer. Chunk async per lo
// stesso motivo di ClienteDetailPanel.jsx — porta con sé lib/listeApi.js.
const ArchivedListe = lazy(() =>
  import("../liste/ArchivedListe.jsx").then(m => ({ default: m.ArchivedListe }))
);

// M-2 · Quante righe si disegnano alla volta. 24 come l'anagrafica (`PAGINA`
// in ClientiView): su mobile è una schermata piena di stiliComuni.card, su desktop una
// stiliComuni.tabella che si scorre senza diventare la pagina intera.
const PAGINA = 24;

// `memo` + lettura dal contesto: senza il memo il provider non servirebbe a
// nulla, perché il genitore ri-renderizza a ogni azione (vedi
// state/TasksContext.jsx). `dispatch` ha identità stabile, quindi il confronto
// shallow riesce e il render si salta finché non cambiano davvero i task.
// `loading` (criticità #6): "Archivio vuoto" e "archivio non ancora caricato"
// sono due frasi diverse, e finora l'utente vedeva sempre la prima.
export const Archive = memo(function Archive({ dispatch, loading = false }) {
  const conferma = useConfirm();
  const { isMobile } = useViewport();
  const { categories, currentUserId, getVisibleTasks, canEditTask, canAccessListe } = useAppData();
  const tasks = useTasks();
  // A-3: l'archivio SONO le task completate, cioè esattamente la parte che
  // l'idratazione lascia fuori dalla finestra. Chiedendo il corpus intero al
  // mount, «209 task completate» torna a essere il totale e non «quelle degli
  // ultimi sessanta giorni» detto con la stessa faccia.
  const caricandoStorico = useStoricoTaskCompleto();
  const me = currentUserId;
  // Le liste buoni viaggio seguono l'accesso al modulo Liste Viaggio (stessa
  // RLS): niente tab, niente fetch, per chi non può comunque accedervi.
  const listeAllowed = canAccessListe(me);
  const [tab, setTab] = useState("task");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [period, setPeriod] = useState("all");

  // Solo le task completate che l'utente può vedere (rispetta i permessi).
  // Ordinate per data di completamento (completedAt) decrescente; fallback su
  // dueDate per task completate prima dell'introduzione di completed_at.
  //
  // B-4 · `useMemo` e non tre passate a ogni render. Filtro delle archiviate,
  // controllo di permesso PER RIGA e ordinamento giravano su tutte le task a
  // ogni battuta nel campo di ricerca e a ogni chip premuto: è lo stesso
  // rilievo che P2-4 ha corretto sulla Dashboard, sulla vista che quel
  // perimetro non comprendeva.
  const archived = useMemo(
    () => getVisibleTasks(getArchivedTasks(tasks), me)
      .sort((a, b) => new Date(b.completedAt || b.dueDate || 0) - new Date(a.completedAt || a.dueDate || 0)),
    [tasks, me, getVisibleTasks]);

  // M-3 · L'indice di ricerca delle righe archiviate, ricostruito quando
  // cambiano le task e non a ogni carattere digitato. Va insieme al `useMemo`
  // qui sopra: con `archived` di identità nuova a ogni render l'indice si
  // ricostruirebbe comunque e il guadagno si annullerebbe.
  //
  // Il confronto passa da `lib/searchUtils.js` come nell'anagrafica e
  // nell'elenco liste: era una sottostringa secca su `title + client +
  // praticaRef`, quindi qui «d amato» non trovava la task di D'AMATO che la
  // ricerca dei clienti trovava — la stessa domanda con due risposte diverse.
  const indice = useMemo(
    () => archived.map(t => ({ t, idx: indicizza(t.title, t.client, t.praticaRef) })),
    [archived]);

  const visible = useMemo(() => {
    const termini = terminiRicerca(query);
    const perPeriodo = filterByPeriod(indice, period, "completedAt", r => r.t);
    return perPeriodo
      .filter(r => (category === "all" || r.t.category === category) && matchIndice(termini, r.idx))
      .map(r => r.t);
  }, [indice, period, category, query]);

  // M-2 · La finestra sull'elenco: l'Archivio ne montava 209 oggi (+4 al
  // giorno, senza potatura), ognuna con i propri avatar e chip. Ogni
  // restringimento la riazzera — vedi hooks/useFinestra.js.
  const finestra = useFinestra(visible, PAGINA, [query, category, period]);

  // "Sto ancora caricando e non ho ancora nulla": vedi Dashboard.jsx.
  //
  // Il secondo addendo NON ha la condizione `tasks.length === 0`, e la
  // differenza è il punto di A-3: qui i task in stato ci sono già — sono
  // quelli della finestra — e mostrarli mentre lo storico arriva significa
  // scrivere un conteggio parziale che fra un istante cambia. Il caso che la
  // condizione originale protegge (un reload realtime che nasconde sotto uno
  // scheletro ciò che è già a schermo) non si presenta: questa richiesta parte
  // una volta sola, al primo mount della vista.
  const caricando = (loading && tasks.length === 0) || caricandoStorico;
  const hasActiveFilter = category !== "all" || query.trim() || period !== "all";
  const resetFilters = () => { setCategory("all"); setQuery(""); setPeriod("all"); };

  // Stabile per la memoizzazione di TaskCard (vedi components/tasks/TaskCard.jsx).
  const openTask = useCallback(
    (task) => dispatch({ type: "SET_SELECTED_TASK", payload: task }), [dispatch]);

  const handleReopen = (task) => {
    if (!canEditTask(task, me)) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Non puoi riaprire questa task" } });
      return;
    }
    dispatch({ type: "UPDATE_TASK", payload: { id: task.id, status: "inprogress" } });
  };

  const handleTrash = async (task) => {
    const ok = await conferma({
      title: "Spostare nel cestino?",
      body: `"${task.title}" resterà recuperabile dal Cestino.`,
      cta: "Sposta nel cestino", danger: true,
    });
    if (ok) dispatch({ type: "DELETE_TASK", payload: task.id });
  };

  // Categorie effettivamente presenti tra le task archiviate (per il filtro).
  // Anche questo `useMemo` è B-4: il `Set` si ricostruiva su tutte le task
  // archiviate a ogni carattere digitato, per disegnare gli stessi chip.
  const presentCats = useMemo(
    () => Array.from(new Set(archived.map(t => t.category))), [archived]);

  const pad = isMobile ? "16px" : "24px 32px";
  const showTaskTab = !listeAllowed || tab === "task";

  return (
    <div className="vd-pad" style={{ padding: pad, maxWidth: 1200, margin: "0 auto", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={mb20}>
        <div className="playfair" style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: "var(--heading)", marginBottom: 4 }}>
          📦 Archivio
        </div>

        {listeAllowed && (
          <div style={rowGap8Mt12}>
            <button type="button" onClick={() => setTab("task")} style={tabStyle(tab === "task")}>📋 Task</button>
            <button type="button" onClick={() => setTab("liste")} style={tabStyle(tab === "liste")}>🧾 Liste buoni viaggio</button>
          </div>
        )}
      </div>

      {showTaskTab ? (
        <>
          <div style={txtF13Muted2}>
            {caricando
              ? "Caricamento dell'archivio…"
              : archived.length === 0
              ? "Nessuna task completata"
              : hasActiveFilter
                ? `${visible.length} di ${archived.length} task — filtrate`
                : `${archived.length} task ${archived.length === 1 ? "completata" : "completate"}. Riaprile o spostale nel cestino.`
            }
          </div>

          {/* Filtri — solo se ci sono task */}
          {!caricando && archived.length > 0 && (
            <div style={rowCenterGap8}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Cerca per titolo, cliente, pratica…"
                style={boxF13MinW0}
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
              <button type="button" onClick={() => setCategory("all")} style={chipStyle(category === "all")}>Tutte</button>
              {presentCats.map(k => (
                <button key={k} type="button" onClick={() => setCategory(k)} style={chipStyle(category === k)}>
                  {categories[k]?.icon} {categories[k]?.label || k}
                </button>
              ))}
            </div>
          )}

          {/* Filtro periodo (per data di completamento) — solo se ci sono task */}
          {!caricando && archived.length > 0 && (
            <div style={stiliComuni.rowCenterGap82}>
              <span style={stiliComuni.txtF11Bold}>Completate:</span>
              {PERIOD_OPTIONS.map(opt => (
                <button key={opt.key} type="button" onClick={() => setPeriod(opt.key)} style={chipStyle(period === opt.key)}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Empty state */}
          {caricando ? (
            <SkeletonCards count={4} label="Caricamento dell'archivio" />
          ) : archived.length === 0 ? (
            <div style={stiliComuni.cardVuotaAlta}>
              <div style={stiliComuni.txtF48Mb16}>📦</div>
              <div style={stiliComuni.txtF16Bold}>Archivio vuoto</div>
              <div style={stiliComuni.txtF13Muted}>
                Le task completate verranno raccolte qui. Potrai riaprirle o spostarle nel cestino.
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div style={stiliComuni.cardVuota}>
              <div style={stiliComuni.txtF36Mb12}>📭</div>
              <div style={stiliComuni.txtF14Bold}>
                Nessuna task per i filtri selezionati
              </div>
              <button type="button" onClick={resetFilters} style={stiliComuni.btnGhostMini}>Azzera filtri</button>
            </div>
          ) : isMobile ? (
            /* Mobile: stiliComuni.card list — no horizontal overflow */
            <div style={stiliComuni.colGap10}>
              {finestra.visibili.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpen={openTask}
                  radius={12}
                  padding="14px 16px"
                  gap={8}
                  titleColor="var(--heading)"
                  showCategory={false}
                  showClient={false}
                  /* I badge stanno SOTTO il titolo, non sopra: qui la stiliComuni.card è una
                     riga d'archivio, il titolo è l'informazione principale. */
                  subheader={
                    <div style={rowCenterGap6}>
                      <PriorityBadge priority={task.priority} />
                      <CategoryChip category={task.category} />
                      <span style={txtF11Bold2}>✓ Completata</span>
                    </div>
                  }
                  footer={
                    <div style={rowCenterBetween}>
                      <div style={rowCenterGap10}>
                        {task.client && (
                          <span style={stiliComuni.txtF12Muted}>{task.client}</span>
                        )}
                        {task.completedAt && (
                          <span style={stiliComuni.txtF12Muted}>{formatDate(task.completedAt)}</span>
                        )}
                        {task.assignees?.length > 0 && (
                          <div style={rowGap3}>
                            {task.assignees.map(id => <Avatar key={id} memberId={id} size={20} />)}
                          </div>
                        )}
                      </div>
                      <div style={stiliComuni.rowGap6} onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleReopen(task)} style={boxF12Bold}>↩ Riapri</button>
                        <button onClick={() => handleTrash(task)} style={boxF12Bold2}>🗑️</button>
                      </div>
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            /* Desktop: table */
            <div style={stiliComuni.card}>
              <table style={stiliComuni.tabella}>
                <thead>
                  <tr style={stiliComuni.rigaIntestazione}>
                    <th style={thStyle("left", "16px")}>TASK</th>
                    <th style={thStyle("left")}>CATEGORIA</th>
                    <th style={thStyle("left")}>CLIENTE</th>
                    <th style={thStyle("left")}>ASSEGNATI</th>
                    <th style={thStyle("left")}>COMPLETATA</th>
                    <th style={thStyle("right", "16px")}>AZIONI</th>
                  </tr>
                </thead>
                <tbody>
                  {finestra.visibili.map(task => (
                    <tr key={task.id} style={borderBottom2}
                      onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: task })}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={padding2}>
                        <div style={txtBoldHeading}>{task.title}</div>
                        <div style={rowCenterGap62}>
                          <PriorityBadge priority={task.priority} />
                          <span style={txtBoldSuccess}>✓ Completata</span>
                        </div>
                      </td>
                      <td style={padding3}><CategoryChip category={task.category} /></td>
                      <td style={stiliComuni.cella}>
                        {task.client || <span style={stiliComuni.txtMuted}>—</span>}
                      </td>
                      <td style={padding3}>
                        <div style={stiliComuni.rowGap4}>
                          {task.assignees?.length
                            ? task.assignees.map(id => <Avatar key={id} memberId={id} size={22} />)
                            : <span style={stiliComuni.txtF12Muted}>—</span>
                          }
                        </div>
                      </td>
                      <td style={stiliComuni.cellaMuted}>
                        {task.completedAt ? formatDate(task.completedAt) : "—"}
                      </td>
                      <td style={stiliComuni.cellaAzioni} onClick={e => e.stopPropagation()}>
                        <div style={stiliComuni.rowGap62}>
                          <button onClick={() => handleReopen(task)} title="Riapri (rimetti in lavorazione)" style={stiliComuni.btnNavyMini}>↩ Riapri</button>
                          <button onClick={() => handleTrash(task)} title="Sposta nel cestino" style={stiliComuni.btnDangerMini}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Il totale resta VERO anche a finestra ridotta: "24 di 209" e "24"
              sono due affermazioni diverse, e l'archivio serve a rispondere
              alla domanda "quante ne ho chiuse". */}
          <MostraAltri
            finestra={finestra}
            azione={`Mostra altre ${Math.min(PAGINA, finestra.restanti)} di ${finestra.restanti}`}
            conteggio={`${finestra.visibili.length} di ${finestra.totale} task`}
          />
        </>
      ) : (
        <LazyPanel resetKey="archivio-liste" onReset={() => setTab("task")}>
          <ArchivedListe dispatch={dispatch} isMobile={isMobile} />
        </LazyPanel>
      )}
    </div>
  );
});

const tabStyle = (active) => ({
  padding: "7px 14px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
  border: `1px solid ${active ? "var(--navy)" : "var(--border)"}`,
  background: active ? "var(--navy)" : "var(--stiliComuni.card)",
  color: active ? "#fff" : "var(--text)",
  transition: "background 0.15s, color 0.15s",
});
