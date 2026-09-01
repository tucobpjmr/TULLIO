// src/components/tasks/bulk/TemplateTab.jsx
// Generazione da template: una serie di task a partire dalla data di un evento.
import { useEffect, useRef, useState } from "react";
import { useSalvataggio } from "../../../hooks/useSalvataggio.js";
import { PriorityBadge } from "../../ui/PriorityBadge.jsx";
import { TASK_TEMPLATES } from "../../../lib/taskConstants.js";
import { clientContact } from "../../../lib/taskUtils.js";
import { nuovoTask } from "../../../lib/tasks/nuovoTask.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { DateTimePicker } from "../../ui/DateTimePicker.jsx";
import { bulkInputStyle, bulkBtnPrimary, bulkBtnGhost } from "./bulkStyles.js";
import { useClientSuggestions, ClientSuggestions } from "../../ui/ClientAutocomplete.jsx";
import { dataMedia } from "../../../lib/dates.js";
import { FieldError, ariaCampo } from "../../ui/FieldError.jsx";
import { obbligatorio, primoCampoInvalido, validaCampi } from "../../../lib/validators.js";
import * as stiliComuni from "../../../styles/common.js";
import { attivaConTastiera } from "../../../lib/a11y.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const boxR12 = {
  padding: "16px 18px", borderRadius: 12, border: "1px solid var(--border)",
  cursor: "pointer", background: "var(--card)",
};
const rowCenterGap102 = { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 };
const txtF28 = { fontSize: 28 };
const txtF14Bold = { fontSize: 14, fontWeight: 700 };
const txtF12Muted = { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 };
const rowCenterBetween = { display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px" };
const txtF22 = { fontSize: 22 };
const txtF13Bold = { fontSize: 13, fontWeight: 700 };
const gridGap10 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 };
const boxR8 = { maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 };
const txt = { fontWeight: 500 };

// B-3 · Le due cose che devono esserci perché il comando produca qualcosa.
// `busy` NON è fra queste: è lo stato della scrittura in volo, non una
// condizione da compilare. `ORDINE` è quello visivo — la scelta del template
// precede il modulo dei dati, e con entrambi mancanti è lì che serve tornare.
const REGOLE = {
  selectedId: obbligatorio("Scegli prima un template: è lui a decidere quali task creare."),
  eventDate: obbligatorio("Scegli la data dell'evento: le scadenze dei task si contano da lì."),
};
const ORDINE = ["selectedId", "eventDate"];


// ─── BULK: TEMPLATE TAB ────────────────────────────────────────────────────
export const TemplateTab = ({ onCreate, onClose, onCancel, onDirty, clients = [] }) => {
  const { categories, getAssignableTeam } = useAppData();
  const [selectedId, setSelectedId] = useState(null);
  const [client, setClient] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [defaultAssignee, setDefaultAssignee] = useState("");
  const [praticaRef, setPraticaRef] = useState("");
  const [contact, setContact] = useState("");
  const [errori, setErrori] = useState({});
  const rifTemplate = useRef(null);
  const rifData = useRef(null);

  const cli = useClientSuggestions(clients, client);
  const pickClient = (c) => {
    setClient(c.name);
    setContact(prev => prev.trim() ? prev : clientContact(c));
    cli.close();
  };

  useEffect(() => { onDirty?.(!!selectedId); }, [selectedId, onDirty]);

  const tpl = TASK_TEMPLATES.find(t => t.id === selectedId);
  const previewTasks = tpl && eventDate ? tpl.tasks.map(t => {
    const d = new Date(eventDate);
    d.setDate(d.getDate() + t.dayOffset);
    return { ...t, dueDate: d.toISOString() };
  }) : [];

  // Il freno al doppio invio, l'attesa a schermo e il «i dati sono ancora qui»
  // vengono da useSalvataggio (A-2 dell'audit del 23 agosto, secondo
  // passaggio): erano `busyRef` + `busy` + `error` scritti a mano, con il
  // teardown ricopiato in quattro punti di uscita e nessun try — un throw di
  // `onCreate` lasciava `busyRef` a `true` per sempre, cioè la modale viva col
  // bottone spento e nessun messaggio.
  const { salva, inVolo: busy, errore: error } = useSalvataggio(
    (tasks) => onCreate(tasks),
    {
      alSuccesso: onClose,
      messaggioErrore: (e) =>
        `Creazione non riuscita: ${e?.message || "errore sconosciuto"}. I dati sono ancora qui, riprova.`,
    },
  );

  const handleCreate = () => {
    // B-3 · Era `disabled={!tpl || !eventDate || busy}` più un `return` muto:
    // tre condizioni di natura diversa spente insieme in un comando solo. Il
    // freno al doppio invio resta muto (lo applica `salva` da sé), perché non
    // è qualcosa che l'utente possa correggere; ciò che manca da compilare lo
    // dice il messaggio sotto il campo.
    const trovati = validaCampi({ selectedId, eventDate }, REGOLE);
    const primo = primoCampoInvalido(trovati, ORDINE);
    if (primo) {
      setErrori(trovati);
      const contenitore = (primo === "selectedId" ? rifTemplate : rifData).current;
      // Il campo da mettere a fuoco è quello DENTRO il contenitore: la data è
      // un DateTimePicker (un bottone che apre il calendario), il template una
      // griglia di card cliccabili — nessuno dei due è un `<input>` a cui si
      // possa passare un ref e basta.
      (contenitore?.querySelector("button, input") || contenitore)?.focus();
      return;
    }
    setErrori({});
    const tasks = previewTasks.map((t) => nuovoTask({
      title: t.title,
      category: t.category,
      priority: t.priority,
      assignees: [defaultAssignee],
      client, praticaRef, contact,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
    }));
    // Zero task da creare non è né un successo né un errore: resta un no-op
    // silenzioso come prima. Il guard sta QUI e non dentro `esegui` perché per
    // useSalvataggio un ritorno senza errore è un successo, e chiuderebbe la
    // modale senza aver scritto nulla.
    if (!tasks.length) return;
    return salva(tasks);
  };

  return (
    <div style={stiliComuni.colGap14}>
      {!selectedId ? (
        <div ref={rifTemplate} tabIndex={-1}>
          <FieldError id="vd-tpl-scelta-err">{errori.selectedId}</FieldError>
          <div style={stiliComuni.grid2ColGap12}>
          {TASK_TEMPLATES.map(t => {
            const scegli = () => { setSelectedId(t.id); setErrori({}); };
            return (
            <div key={t.id}
              role="button" tabIndex={0}
              onClick={scegli} onKeyDown={attivaConTastiera(scegli)}
              className="hover-lift" style={boxR12}>
              <div style={rowCenterGap102}>
                <div style={txtF28}>{t.icon}</div>
                <div>
                  <div style={txtF14Bold}>{t.name}</div>
                  <div style={stiliComuni.txtF11Muted}>{t.tasks.length} task</div>
                </div>
              </div>
              <div style={txtF12Muted}>{t.description}</div>
            </div>
            );
          })}
          </div>
        </div>
      ) : (
        <>
          <div style={rowCenterBetween}>
            <div style={stiliComuni.rowCenterGap10}>
              <div style={txtF22}>{tpl.icon}</div>
              <div>
                <div style={txtF13Bold}>{tpl.name}</div>
                <div style={stiliComuni.txtF11Muted}>{tpl.tasks.length} task</div>
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} style={stiliComuni.btnOutlineMini}>Cambia</button>
          </div>

          <div style={gridGap10}>
            <div>
              <div style={stiliComuni.txtF10Bold}>CLIENTE</div>
              <div style={stiliComuni.relative}>
                <input
                  value={client}
                  onChange={e => setClient(e.target.value)}
                  placeholder={clients.length ? "Cerca in anagrafica…" : "Es. Famiglia Rossi"}
                  style={bulkInputStyle}
                  {...cli.inputProps}
                />
                <ClientSuggestions matches={cli.matches} visible={cli.visible} onPick={pickClient} compact />
              </div>
            </div>
            <div ref={rifData} {...ariaCampo("vd-tpl-data-err", errori.eventDate)}>
              <div style={stiliComuni.txtF10Bold}>DATA EVENTO *</div>
              <DateTimePicker
                value={eventDate || null}
                onChange={iso => { setEventDate(iso || ""); setErrori({}); }}
                withTime={false}
                placeholder="gg/mm/aaaa"
                ariaLabel="Data evento"
              />
              <FieldError id="vd-tpl-data-err">{errori.eventDate}</FieldError>
            </div>
            <div>
              <div style={stiliComuni.txtF10Bold}>ASSEGNA A</div>
              <select value={defaultAssignee} onChange={e => setDefaultAssignee(e.target.value)} style={bulkInputStyle}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <div style={stiliComuni.txtF10Bold}>N° PRATICA</div>
              <input value={praticaRef} onChange={e => setPraticaRef(e.target.value)} placeholder="es. PR-2026-001" style={bulkInputStyle} />
            </div>
            <div>
              <div style={stiliComuni.txtF10Bold}>CONTATTI</div>
              <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Telefono, email…" style={bulkInputStyle} />
            </div>
          </div>

          {eventDate && (
            <div>
              <div style={stiliComuni.etichettaSezione}>
                ANTEPRIMA — {previewTasks.length} TASK
              </div>
              <div style={boxR8}>
                {previewTasks.map((t, idx) => (
                  <div key={idx} style={{
                    padding: "8px 12px", borderBottom: idx === previewTasks.length - 1 ? "none" : "1px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                  }}>
                    <span style={stiliComuni.txtF14}>{categories[t.category]?.icon}</span>
                    <div className="vd-flex-1-min0">
                      <div style={txt}>{t.title}</div>
                      <div style={stiliComuni.txtF10Muted}>
                        📅 {dataMedia(t.dueDate)}
                      </div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={stiliComuni.piedeSezione}>
        <div style={stiliComuni.colGap2F12}>
          <span>{previewTasks.length} task pronti</span>
          {error && <span style={stiliComuni.txtBoldDanger}>{error}</span>}
        </div>
        <div style={stiliComuni.rowGap8}>
          <button onClick={onCancel || onClose} disabled={busy} style={{ ...bulkBtnGhost, opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}>Annulla</button>
          {/* `disabled` resta solo per `busy`: lì il comando è spento perché
              la scrittura è IN VOLO, non perché manchi qualcosa da compilare —
              è il freno al doppio invio, e la sua ragione è già a schermo
              ("⏳ Creazione…"). */}
          <button onClick={handleCreate} disabled={busy} style={{
            ...bulkBtnPrimary,
            opacity: busy ? 0.5 : 1,
            cursor: busy ? "not-allowed" : "pointer",
          }}>{busy ? "⏳ Creazione…" : `✓ Crea ${previewTasks.length} task`}</button>
        </div>
      </div>
    </div>
  );
};
