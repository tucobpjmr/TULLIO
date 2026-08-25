// ─── QUICK ADD TASK ──────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useRef } from "react";
import { PRIORITIES } from "../../lib/taskConstants.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { clientContact } from "../../lib/taskUtils.js";
import { nuovoTask } from "../../lib/tasks/nuovoTask.js";
import { TaskFiles } from "../../lib/api.js";
import { MAX_TASK_FILE_SIZE, formatFileSize, fileIcon, isWithinSizeLimit } from "../../lib/fileUtils.js";
import { DateTimePicker } from "../ui/DateTimePicker.jsx";
import { Modal } from "../ui/Modal.jsx";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { validaCampi, obbligatorio, primoCampoInvalido } from "../../lib/validators.js";
import { useSalvataggio } from "../../hooks/useSalvataggio.js";
import { useClientSuggestions, ClientSuggestions } from "../ui/ClientAutocomplete.jsx";
import { useClients } from "../../state/ClientsContext.jsx";
import * as stiliComuni from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF20Bold = { fontSize: 20, fontWeight: 700 };
const boxF18Muted = { background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" };
const boxF10Bold = {
  marginLeft: 8, fontSize: 10, fontWeight: 700,
  background: "#E0F2FE", color: "#0369A1",
  padding: "1px 6px", borderRadius: 4,
};
const boxF11Mt5 = {
  marginTop: 5, fontSize: 11, color: "#0369A1", background: "none",
  border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
};
const colGap6Mb8 = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 };
const rowCenterGap10 = {
  display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
  background: "var(--surface2)", borderRadius: 8,
};
const txtF13Bold = { fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "stiliComuni.hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const txtF11Light = { fontSize: 11, color: "var(--text-light)", marginTop: 4 };
const txtF12Danger = { fontSize: 12, color: "var(--danger)", marginTop: 6 };
// L'avviso di riuscita parziale non è rosso: la task è stata creata, e un
// messaggio d'errore direbbe il contrario di quello che è successo.
const txtF12Avviso = {
  marginTop: 10, padding: "8px 10px", borderRadius: 8,
  background: "#FEF3C7", border: "1px solid rgba(200,131,42,0.35)",
  fontSize: 12, lineHeight: 1.4, color: "var(--text)",
};
const rowGap10Mt20 = { display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" };

// v2.8 Round 6: auto-suggerisci la categoria in base a keyword nel titolo.
// Regole: primo match vince (ordine top-down). Solo per categorie disponibili all'utente.
const CATEGORY_KEYWORDS = [
  { cat: "transfer",  words: ["transfer", "navetta", "shuttle", "ncc "] },
  { cat: "visa",      words: ["visto", "passaporto", "visa", "documenti sanitar", "document"] },
  { cat: "booking",     words: ["volo", "voli", "aereo", "aerei", "bigliett", "compagnia aerea", "flight"] },
  { cat: "itinerary",   words: ["itinerario", "programma viaggio", "tappe", "tour ", "percorso", "preventivo", "hotel", "albergo", "resort", "villa", "bed ", "bungalow", "ryokan", "appartament", "ospitalit"] },
  { cat: "payment",     words: ["pagament", "acconto", "saldo", "fattura", "bonifico", "invoice", "polizza", "tariffa", "fornitore", "contratto", "accordo", "autobus", "bus "] },
  { cat: "client",      words: ["cliente", "followup", "follow-up", "chiamata", "contatto", "scadenza opt", "opzione"] },
  { cat: "appointment", words: ["appuntamento", "appointment", "meeting", "incontro"] },
  { cat: "marketing",   words: ["newsletter", "social", "post ", "campagna", "promo", "pubblicità", "instagram", "facebook"] },
  { cat: "admin",       words: ["check-in", "checkin", "check in", "riunione", "agenda", "report", "log ", "amministrazion"] },
];
// A-2 · L'etichetta dice `TITOLO *`, e l'asterisco è una promessa: prima
// `if (!form.title.trim()) return;` la mancava in silenzio — nessun messaggio,
// nessun focus, e per chi usa uno screen reader nemmeno l'indizio visivo del
// nulla che succede. È lo stesso rimedio di ClienteModal e ProfileEditor, su
// quello che è il percorso di creazione task più battuto dell'app (FAB su ogni
// vista, scorciatoia `K`).
const REGOLE = {
  title: obbligatorio("Il titolo è obbligatorio: è con questo che il task compare in elenco, nelle code e nelle notifiche."),
};
const ORDINE = ["title"];

const suggestCategory = (title, availableCats) => {
  const lower = (title || "").toLowerCase();
  if (lower.length < 4) return null;
  for (const { cat, words } of CATEGORY_KEYWORDS) {
    if (!availableCats[cat]) continue;
    if (words.some(w => lower.includes(w))) return cat;
  }
  return null;
};

export const QuickAddTask = ({ onAdd, onClose }) => {
  const { currentUserId, getAssignableTeam, getAvailableCategories } = useAppData();
  // ST-11 · L'anagrafica dal contesto, non come prop: sul call site era
  // `clients={state.clients || []}`, cioè un array NUOVO a ogni render quando
  // l'anagrafica è vuota. Il default vive nel provider, in un punto solo.
  const clients = useClients();
  // Categorie filtrate per il ruolo dell'utente loggato (v0.8)
  const availableCats = getAvailableCategories(currentUserId);
  const firstCatKey = Object.keys(availableCats)[0] || "booking";

  const [form, setForm] = useState({
    title: "", category: firstCatKey, priority: "medium",
    status: "todo", assignees: [], dueDate: "",
    client: "", praticaRef: "", contact: "", description: ""
  });
  // true se l'utente ha cambiato manualmente la categoria → non sovrascrivere
  const [catManual, setCatManual] = useState(false);
  // Allegati selezionati in fase di creazione: tenuti in memoria e caricati
  // subito DOPO che la task è stata persistita (l'upload via RLS richiede la
  // riga task già esistente, e serve il suo UUID definitivo).
  const [pendingFiles, setPendingFiles] = useState([]);
  // Solo il limite di dimensione, che è una regola sull'input e si valuta
  // subito: l'esito della scrittura ha ora il proprio canale (vedi sotto).
  const [fileError, setFileError] = useState("");
  const [errori, setErrori] = useState({});
  const fileInputRef = useRef(null);
  const titleRef = useRef(null);
  const rifCampo = { title: titleRef };

  // Autocomplete cliente: mostra la tendina dei clienti in anagrafica mentre si
  // digita. Il campo resta testo libero (task.client è una stringa), così si può
  // anche inserire un cliente non ancora presente in anagrafica.
  const cli = useClientSuggestions(clients, form.client);
  const pickClient = (c) => {
    // Eredita i contatti dall'anagrafica solo se il campo è ancora vuoto: non
    // sovrascrive un contatto già digitato a mano.
    setForm(p => ({ ...p, client: c.name, contact: p.contact.trim() ? p.contact : clientContact(c) }));
    cli.close();
  };

  const addFiles = (fileList) => {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    setFileError("");
    const ok = [];
    for (const f of arr) {
      if (!isWithinSizeLimit(f.size)) {
        setFileError(`"${f.name}" supera il limite di ${formatFileSize(MAX_TASK_FILE_SIZE)}`);
        continue;
      }
      ok.push(f);
    }
    if (ok.length) setPendingFiles(prev => [...prev, ...ok]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  // A-2 · La scrittura per intero — la task e i suoi allegati — dietro il
  // contratto condiviso (hooks/useSalvataggio.js). Prima `onClose()` era
  // incondizionato: su una creazione rifiutata la modale si chiudeva lo stesso,
  // il registry faceva rollback (la task appariva e spariva) e titolo,
  // descrizione, cliente, contatti, numero di pratica e la lista degli allegati
  // scelti non esistevano più. Le quattro tab del BulkTaskCreator facevano già
  // il contrario, con il commento che spiega perché.
  const {
    salva, inVolo: busy, errore: erroreSalvataggio, avviso, bloccato,
  } = useSalvataggio(
    async () => {
      // L'uuid lo genera `nuovoTask` e il dispatch lo conserva (è già valido),
      // così conosciamo l'id definitivo della task per caricarci gli allegati.
      // Normalizzazione (trim, vuoto → null, data → ISO) e default vivono lì:
      // qui si passa il form così com'è.
      const task = nuovoTask(form);
      const id = task.id;
      const res = await onAdd(task);
      if (res?.error) return res;

      // Gli allegati dopo, in sequenza: l'upload passa dalla RLS del bucket,
      // che parte dal task_id — senza la riga già scritta rifiuterebbe.
      for (const f of pendingFiles) {
        const { error } = await TaskFiles.upload(f, id, { uploadedBy: currentUserId });
        // `avviso` e non `error`: la task ESISTE. Riprovare ne creerebbe una
        // seconda, quindi il pannello resta aperto per dire dov'è finito
        // l'allegato mancante, ma il bottone «Crea» non riparte.
        if (error) {
          return { avviso: `Task creata, ma l'allegato "${f.name}" non è stato caricato. Riprova dal dettaglio della task: la task è salva.` };
        }
      }
      return { error: null };
    },
    { alSuccesso: onClose },
  );

  const handleSubmit = async () => {
    const trovati = validaCampi(form, REGOLE);
    const primo = primoCampoInvalido(trovati, ORDINE);
    if (primo) {
      setErrori(trovati);
      rifCampo[primo]?.current?.focus();   // metà del rimedio è il focus
      return;
    }
    setErrori({});
    await salva();
  };

  // Auto-suggerisci categoria al cambio titolo (se l'utente non ha impostato manualmente)
  const suggested = !catManual ? suggestCategory(form.title, availableCats) : null;

  const inp = (field) => ({
    value: form[field],
    onChange: e => {
      const val = e.target.value;
      // L'errore di un campo si spegne appena lo si tocca (vedi AddMovBox e
      // ClienteModal): il verdetto è sull'ultimo tentativo, non sul campo.
      setErrori(prec => (prec[field] ? { ...prec, [field]: undefined } : prec));
      setForm(p => {
        const next = { ...p, [field]: val };
        // Auto-applica la categoria suggerita se non è stata modificata manualmente
        if (field === "title" && !catManual) {
          const s = suggestCategory(val, availableCats);
          if (s) next.category = s;
        }
        return next;
      });
    },
    style: {
      width: "100%", border: "1px solid var(--border)", borderRadius: 8,
      padding: "8px 10px", fontSize: 13, background: "var(--surface)",
      outline: "none", fontFamily: "inherit",
    }
  });

  return (
    <Modal open onClose={onClose} labelledBy="quick-add-title" width={500} cardStyle={{ padding: 28 }}>
      <>
        <div style={stiliComuni.testataModale}>
          <div id="quick-add-title" className="playfair" style={txtF20Bold}>Nuovo Task</div>
          <button onClick={onClose} style={boxF18Muted}>✕</button>
        </div>

        <div style={stiliComuni.colGap14}>
          <div>
            <label className="vd-field-label-lg" htmlFor="qat-title">TITOLO *</label>
            <input
              id="qat-title" ref={titleRef} {...inp("title")}
              placeholder="Descrivi brevemente il task..."
              {...ariaCampo("qat-title-err", errori.title)}
            />
            <FieldError id="qat-title-err">{errori.title}</FieldError>
          </div>

          <div style={stiliComuni.grid2ColGap12}>
            <div>
              <label className="vd-field-label-lg">
                CATEGORIA
                {suggested && (
                  <span style={boxF10Bold}>💡 auto</span>
                )}
              </label>
              <select
                value={form.category}
                onChange={e => { setCatManual(true); setForm(p => ({ ...p, category: e.target.value })); }}
                style={{ ...inp("category").style, cursor: "pointer",
                  borderColor: suggested ? "#0369A1" : "var(--border)",
                }}
              >
                {Object.entries(availableCats).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
              {catManual && form.title.length >= 4 && suggestCategory(form.title, availableCats) && suggestCategory(form.title, availableCats) !== form.category && (
                <button
                  type="button"
                  onClick={() => { setCatManual(false); const s = suggestCategory(form.title, availableCats); if (s) setForm(p => ({ ...p, category: s })); }}
                  style={boxF11Mt5}
                >
                  💡 Usa categoria suggerita: {availableCats[suggestCategory(form.title, availableCats)]?.label}
                </button>
              )}
            </div>
            <div>
              <label className="vd-field-label-lg">PRIORITÀ</label>
              <select {...inp("priority")} style={{ ...inp("priority").style, cursor: "pointer" }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div style={stiliComuni.grid2ColGap12}>
            <div>
              <label className="vd-field-label-lg">ASSEGNA A</label>
              <select
                value={form.assignees[0] || ""}
                onChange={e => setForm(p => ({ ...p, assignees: e.target.value ? [e.target.value] : [] }))}
                style={{ ...inp("category").style, cursor: "pointer" }}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="vd-field-label-lg">SCADENZA</label>
              <DateTimePicker
                value={form.dueDate || null}
                onChange={iso => setForm(p => ({ ...p, dueDate: iso || "" }))}
              />
            </div>
          </div>

          <div style={stiliComuni.relative}>
            <label className="vd-field-label-lg">CLIENTE</label>
            <input
              {...inp("client")}
              placeholder={clients.length ? "Cerca in anagrafica o scrivi un nome…" : "Es. Famiglia Rossi…"}
              {...cli.inputProps}
            />
            <ClientSuggestions matches={cli.matches} visible={cli.visible} onPick={pickClient} />
          </div>

          <div style={stiliComuni.grid2ColGap12}>
            <div>
              <label className="vd-field-label-lg">N° PRATICA</label>
              <input {...inp("praticaRef")} placeholder="es. PR-2026-001" />
            </div>
            <div>
              <label className="vd-field-label-lg">CONTATTI</label>
              <input {...inp("contact")} placeholder="Telefono, email…" />
            </div>
          </div>

          <div>
            <label className="vd-field-label-lg">DESCRIZIONE</label>
            <textarea {...inp("description")} rows={3} placeholder="Dettagli del task..." style={{ ...inp("description").style, resize: "vertical" }} />
          </div>

          {/* Allegati (immagini, video, audio, documenti) */}
          <div>
            <label className="vd-field-label-lg">ALLEGATI</label>
            {pendingFiles.length > 0 && (
              <div style={colGap6Mb8}>
                {pendingFiles.map((f, i) => (
                  <div key={i} style={rowCenterGap10}>
                    <span style={stiliComuni.txtF16}>{fileIcon(f.type || f.name)}</span>
                    <div className="vd-flex-1-min0">
                      <div style={txtF13Bold}>{f.name}</div>
                      <div style={stiliComuni.txtF11Muted}>{formatFileSize(f.size)}</div>
                    </div>
                    <button type="button" onClick={() => removeFile(i)} disabled={busy} title="Rimuovi" style={{
                      background: "none", border: "none", cursor: busy ? "default" : "pointer", fontSize: 13, padding: 4, color: "var(--text-muted)",
                    }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={stiliComuni.hidden}
              onChange={e => addFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => !busy && fileInputRef.current?.click()}
              style={{
                width: "100%", border: "2px dashed var(--border)", borderRadius: 8,
                padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13,
                cursor: busy ? "default" : "pointer", background: "transparent", fontFamily: "inherit",
              }}
            >📎 Aggiungi file</button>
            <div style={txtF11Light}>
              Immagini, video, audio e documenti · max {formatFileSize(MAX_TASK_FILE_SIZE)} per file.
            </div>
            {fileError && <div style={txtF12Danger}>{fileError}</div>}
          </div>
        </div>

        {/* L'esito accanto al bottone che l'ha avviato. Due canali distinti
            perché le azioni giuste sono opposte: con `erroreSalvataggio` non è
            stato scritto niente e riprovare è la cosa da fare; con `avviso` la
            task c'è già e riprovare la duplicherebbe. */}
        <FieldError id="qat-save-err">{erroreSalvataggio}</FieldError>
        {avviso && <div role="alert" style={txtF12Avviso}>{avviso}</div>}
        <div style={rowGap10Mt20}>
          <button onClick={onClose} disabled={busy} style={{
            padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)",
            background: "transparent", cursor: busy ? "default" : "pointer", fontSize: 13, fontWeight: 500,
            opacity: busy ? 0.6 : 1,
          }}>{bloccato ? "Chiudi" : "Annulla"}</button>
          {!bloccato && (
            <button onClick={handleSubmit} disabled={busy} style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: "var(--navy)", color: "#fff", cursor: busy ? "default" : "pointer", fontSize: 13, fontWeight: 600,
              opacity: busy ? 0.7 : 1,
            }}>{busy ? "⏳ Creazione…" : "✓ Crea Task"}</button>
          )}
        </div>
      </>
    </Modal>
  );
};
