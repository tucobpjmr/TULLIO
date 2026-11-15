// ─── QUICK ADD TASK ──────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useRef, useId } from "react";
import { PRIORITIES } from "../../lib/taskConstants.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { clientContact } from "../../lib/taskUtils.js";
import { nuovoTask } from "../../lib/tasks/nuovoTask.js";
// B-2 (25 agosto): la tassonomia keyword→categoria è una regola di dominio
// dell'agenzia, non una scelta di questo form. Vive in lib/tasks/.
import { categoriaDaTitolo } from "../../lib/tasks/categoriaDaTitolo.js";
import { MAX_TASK_FILE_SIZE, formatFileSize, fileIcon } from "../../lib/fileUtils.js";
// M-2 del 14 novembre: filtro per dimensione e upload dopo la creazione sono
// condivisi con la tab «Manuale» del BulkTaskCreator.
import { separaPerDimensione, testoScartati, caricaAllegati } from "../../lib/tasks/allegatiInCreazione.js";
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
const titoloModale = { fontSize: 20, fontWeight: 700 };
const bottoneChiudi = { background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" };
const badgeAuto = {
  marginLeft: 8, fontSize: 10, fontWeight: 700,
  background: "#E0F2FE", color: "#0369A1",
  padding: "1px 6px", borderRadius: 4,
};
const linkSuggerimento = {
  marginTop: 5, fontSize: 11, color: "#0369A1", background: "none",
  border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
};
const elencoAllegati = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 };
const rigaAllegato = {
  display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
  background: "var(--surface2)", borderRadius: 8,
};
const notaAllegati = { fontSize: 11, color: "var(--text-light)", marginTop: 4 };
const erroreAllegati = { fontSize: 12, color: "var(--danger)", marginTop: 6 };
// L'avviso di riuscita parziale non è rosso: la task è stata creata, e un
// messaggio d'errore direbbe il contrario di quello che è successo.
const avvisoParziale = {
  marginTop: 10, padding: "8px 10px", borderRadius: 8,
  background: "var(--avviso-bg)", border: "1px solid var(--avviso-bordo)",
  fontSize: 12, lineHeight: 1.4, color: "var(--text)",
};
const barraAzioni = { display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" };

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

export const QuickAddTask = ({ onAdd, onClose }) => {
  const { currentUserId, getAssignableTeam, io } = useAppData();
  // ST-11 · L'anagrafica dal contesto, non come prop: sul call site era
  // `clients={state.clients || []}`, cioè un array NUOVO a ogni render quando
  // l'anagrafica è vuota. Il default vive nel provider, in un punto solo.
  const clients = useClients();
  // Categorie filtrate per il ruolo dell'utente loggato (v0.8)
  const availableCats = io.categorieDisponibili();
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
  const [erroreFile, impostaErroreFile] = useState("");
  const [errori, setErrori] = useState({});
  const fileInputRef = useRef(null);
  const titleRef = useRef(null);
  const rifCampo = { title: titleRef };

  // A-3 · un `useId()` per campo, per associare ogni `<label>` al proprio
  // controllo — vedi src/lib/a11y.js per l'equivalente da tastiera dei
  // click (A-2), qui è la stessa correzione ma per gli screen reader.
  const idCategoria = useId();
  const idPriorita = useId();
  const idAssegna = useId();
  const idCliente = useId();
  const idPratica = useId();
  const idContatti = useId();
  const idDescrizione = useId();
  const idAllegati = useId();

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
    const { validi, scartati } = separaPerDimensione(fileList);
    if (!validi.length && !scartati.length) return;
    impostaErroreFile(testoScartati(scartati));
    if (validi.length) setPendingFiles(prev => [...prev, ...validi]);
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
      const res = await onAdd(task);
      if (res?.error) return res;
      // Perché `avviso` e non `error` su un upload fallito: vedi caricaAllegati.
      return caricaAllegati([{ task, files: pendingFiles }], currentUserId, (f) =>
        `Task creata, ma l'allegato "${f.name}" non è stato caricato. Riprova dal dettaglio della task: la task è salva.`);
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
  const suggested = !catManual ? categoriaDaTitolo(form.title, availableCats) : null;

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
          const s = categoriaDaTitolo(val, availableCats);
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
          <div id="quick-add-title" className="playfair" style={titoloModale}>Nuovo Task</div>
          <button onClick={onClose} style={bottoneChiudi}>✕</button>
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
              <label className="vd-field-label-lg" htmlFor={idCategoria}>
                CATEGORIA
                {suggested && (
                  <span style={badgeAuto}>💡 auto</span>
                )}
              </label>
              <select
                id={idCategoria}
                value={form.category}
                onChange={e => { setCatManual(true); setForm(p => ({ ...p, category: e.target.value })); }}
                style={{ ...inp("category").style, cursor: "pointer",
                  borderColor: suggested ? "#0369A1" : "var(--border)",
                }}
              >
                {Object.entries(availableCats).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
              {catManual && form.title.length >= 4 && categoriaDaTitolo(form.title, availableCats) && categoriaDaTitolo(form.title, availableCats) !== form.category && (
                <button
                  type="button"
                  onClick={() => { setCatManual(false); const s = categoriaDaTitolo(form.title, availableCats); if (s) setForm(p => ({ ...p, category: s })); }}
                  style={linkSuggerimento}
                >
                  💡 Usa categoria suggerita: {availableCats[categoriaDaTitolo(form.title, availableCats)]?.label}
                </button>
              )}
            </div>
            <div>
              <label className="vd-field-label-lg" htmlFor={idPriorita}>PRIORITÀ</label>
              <select id={idPriorita} {...inp("priority")} style={{ ...inp("priority").style, cursor: "pointer" }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div style={stiliComuni.grid2ColGap12}>
            <div>
              <label className="vd-field-label-lg" htmlFor={idAssegna}>ASSEGNA A</label>
              <select
                id={idAssegna}
                value={form.assignees[0] || ""}
                onChange={e => setForm(p => ({ ...p, assignees: e.target.value ? [e.target.value] : [] }))}
                style={{ ...inp("category").style, cursor: "pointer" }}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              {/* A-3 · non `<label>`: DateTimePicker espone un solo
                  `<button>` il cui testo visibile è la data scelta, non il
                  nome del campo — non c'è un `id` da agganciare con
                  `htmlFor`. Il nome del campo arriva allo screen reader via
                  `ariaLabel` sotto (stesso pattern già in uso per questo
                  controllo in ManualTab/TemplateTab/TaskSlideOver). */}
              <div className="vd-field-label-lg">SCADENZA</div>
              <DateTimePicker
                value={form.dueDate || null}
                onChange={iso => setForm(p => ({ ...p, dueDate: iso || "" }))}
                ariaLabel="Scadenza"
              />
            </div>
          </div>

          <div style={stiliComuni.relative}>
            <label className="vd-field-label-lg" htmlFor={idCliente}>CLIENTE</label>
            <input
              id={idCliente}
              {...inp("client")}
              placeholder={clients.length ? "Cerca in anagrafica o scrivi un nome…" : "Es. Famiglia Rossi…"}
              {...cli.inputProps}
            />
            <ClientSuggestions matches={cli.matches} visible={cli.visible} onPick={pickClient} />
          </div>

          <div style={stiliComuni.grid2ColGap12}>
            <div>
              <label className="vd-field-label-lg" htmlFor={idPratica}>N° PRATICA</label>
              <input id={idPratica} {...inp("praticaRef")} placeholder="es. PR-2026-001" />
            </div>
            <div>
              <label className="vd-field-label-lg" htmlFor={idContatti}>CONTATTI</label>
              <input id={idContatti} {...inp("contact")} placeholder="Telefono, email…" />
            </div>
          </div>

          <div>
            <label className="vd-field-label-lg" htmlFor={idDescrizione}>DESCRIZIONE</label>
            <textarea id={idDescrizione} {...inp("description")} rows={3} placeholder="Dettagli del task..." style={{ ...inp("description").style, resize: "vertical" }} />
          </div>

          {/* Allegati (immagini, video, audio, documenti) */}
          <div>
            <label className="vd-field-label-lg" htmlFor={idAllegati}>ALLEGATI</label>
            {pendingFiles.length > 0 && (
              <div style={elencoAllegati}>
                {pendingFiles.map((f, i) => (
                  <div key={i} style={rigaAllegato}>
                    <span style={stiliComuni.txtF16}>{fileIcon(f.type || f.name)}</span>
                    <div className="vd-flex-1-min0">
                      <div style={stiliComuni.nomeTroncatoF13}>{f.name}</div>
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
              id={idAllegati}
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
            <div style={notaAllegati}>
              Immagini, video, audio e documenti · max {formatFileSize(MAX_TASK_FILE_SIZE)} per file.
            </div>
            {erroreFile && <div style={erroreAllegati}>{erroreFile}</div>}
          </div>
        </div>

        {/* L'esito accanto al bottone che l'ha avviato. Due canali distinti
            perché le azioni giuste sono opposte: con `erroreSalvataggio` non è
            stato scritto niente e riprovare è la cosa da fare; con `avviso` la
            task c'è già e riprovare la duplicherebbe. */}
        <FieldError id="qat-save-err">{erroreSalvataggio}</FieldError>
        {avviso && <div role="alert" style={avvisoParziale}>{avviso}</div>}
        <div style={barraAzioni}>
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
