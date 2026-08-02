// src/components/liste/ListaDetail.jsx
// Dettaglio di una lista: testata con saldo, barra comandi, "foglio" dei
// movimenti e storico delle modifiche. Porting di `listaView()` della SPA
// vanilla, con lo stato dei campi in useState invece che in variabili globali.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ListeAPI, METODI, actionLabel, docHtml, downloadBlob, eur, fmtDate,
  parseImporto, runListeCall, saldoClass, todayISO,
} from "../../lib/listeApi.js";
import {
  AggiungiBeneficiarioModal, BulkMovimentiModal, ConfirmModal, EditListaModal,
  EditMovimentoModal, RiepilogoClienteModal, SegnoSeg,
} from "./listeModals.jsx";

// Riquadro "Nuovo movimento": sta in cima al foglio e si apre col tasto ＋
// della barra. In fondo alla pagina, su liste lunghe, richiedeva di scorrere
// tutti i movimenti prima di poterne registrare uno nuovo.
function AddMovBox({ listaId, dispatch, onSaved, onClose, onBulk }) {
  const [data, setData] = useState(todayISO());
  const [desc, setDesc] = useState("");
  const [segno, setSegno] = useState(1);
  const [imp, setImp] = useState("");
  const [metodo, setMetodo] = useState("");
  const [saving, setSaving] = useState(false);
  const descRef = useRef(null);

  useEffect(() => { descRef.current?.focus(); }, []);

  const submit = async () => {
    if (saving) return;
    const importo = parseImporto(imp, segno);
    if (!data || !desc.trim() || importo === null) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Compila data, descrizione e importo" } });
      return;
    }
    setSaving(true);
    const { ok } = await runListeCall(
      dispatch,
      ListeAPI.addMovimento({ listaId, data, descrizione: desc.trim(), importo, metodo: metodo || null }),
      "Movimento registrato",
    );
    setSaving(false);
    if (!ok) return;
    // Il riquadro resta aperto e pronto per il movimento successivo: azzeriamo
    // solo descrizione e importo, data e metodo si ripetono quasi sempre.
    setDesc("");
    setImp("");
    await onSaved();
    descRef.current?.focus();
  };

  return (
    <div className="lv-add-box">
      <div className="lv-add-head">
        <h3>Nuovo movimento</h3>
        <button className="lv-icon-btn" title="Chiudi" aria-label="Chiudi il riquadro" onClick={onClose}>✕</button>
      </div>
      <div className="lv-form-grid">
        <div className="lv-field">
          <label htmlFor="mv-data">Data</label>
          <input id="mv-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="lv-field">
          <label htmlFor="mv-desc">Descrizione</label>
          <input id="mv-desc" ref={descRef} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Es. BONIFICO DA ROSSI MARIO" />
        </div>
        <div className="lv-field">
          <label>Tipo</label>
          <SegnoSeg segno={segno} onChange={setSegno} />
        </div>
        <div className="lv-field">
          <label htmlFor="mv-imp">Importo €</label>
          <input id="mv-imp" inputMode="decimal" value={imp} onChange={(e) => setImp(e.target.value)} placeholder="0,00" />
        </div>
        <div className="lv-field">
          <label htmlFor="mv-met">Metodo</label>
          <select id="mv-met" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {METODI.map((v) => <option key={v || "none"} value={v}>{v ? v.toUpperCase() : "—"}</option>)}
          </select>
        </div>
        <div className="lv-field" style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="lv-btn primary" style={{ width: "100%" }} disabled={saving} onClick={submit}>
            {saving ? "Registro…" : "Registra"}
          </button>
        </div>
      </div>
      <button className="lv-btn sm" style={{ marginTop: 12 }} onClick={onBulk}>
        + Inserisci più movimenti insieme
      </button>
    </div>
  );
}

// Modifica in linea: un campo per volta. La riga toccata viene sostituita da
// un editor a tutta larghezza — su schermo stretto un input dentro la cella
// sarebbe troppo piccolo da centrare col dito. Il salvataggio è esplicito e
// non a perdita di fuoco, che sul telefono scatta anche scorrendo la pagina.
const CAMPO_LABELS = { data: "Data", descrizione: "Descrizione", importo: "Importo €", metodo: "Metodo di pagamento" };

function CellEditor({ movimento, campo, dispatch, onSaved, onCancel }) {
  const [segno, setSegno] = useState(Number(movimento.importo) < 0 ? -1 : 1);
  const [value, setValue] = useState(() => {
    if (campo === "data") return movimento.data_movimento;
    if (campo === "descrizione") return movimento.descrizione;
    if (campo === "importo") return Math.abs(Number(movimento.importo)).toFixed(2).replace(".", ",");
    return movimento.metodo || "";
  });
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (el.type === "text") el.select();
  }, []);

  const err = (message) => dispatch({ type: "SHOW_TOAST", payload: { type: "error", message } });

  const save = async () => {
    if (saving) return;
    // Si modifica un campo per volta: gli altri tre restano quelli del record.
    let data = movimento.data_movimento;
    let descrizione = movimento.descrizione;
    let importo = Number(movimento.importo);
    let metodo = movimento.metodo || null;

    if (campo === "data") {
      if (!value) return err("Inserisci una data");
      data = value;
    } else if (campo === "descrizione") {
      if (!value.trim()) return err("La descrizione non può essere vuota");
      descrizione = value.trim();
    } else if (campo === "importo") {
      const n = parseImporto(value, segno);
      if (n === null) return err("Importo non valido");
      importo = n;
    } else {
      metodo = value || null;
    }

    setSaving(true);
    const { ok } = await runListeCall(
      dispatch,
      ListeAPI.modificaMovimento({ id: movimento.id, data, descrizione, importo, metodo }),
      "Movimento aggiornato",
    );
    setSaving(false);
    if (ok) await onSaved();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    else if (e.key === "Escape") onCancel();
  };

  return (
    <tr className="lv-edit-row">
      <td colSpan={5}>
        <div className="lv-cell-edit">
          <label htmlFor="lv-cell-input">{CAMPO_LABELS[campo]}</label>
          {campo === "importo" && (
            <div style={{ marginBottom: 8 }}>
              <SegnoSeg segno={segno} onChange={setSegno} />
            </div>
          )}
          {campo === "metodo" ? (
            <select id="lv-cell-input" ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown}>
              {METODI.map((v) => <option key={v || "none"} value={v}>{v ? v.toUpperCase() : "—"}</option>)}
            </select>
          ) : (
            <input
              id="lv-cell-input"
              ref={inputRef}
              type={campo === "data" ? "date" : "text"}
              inputMode={campo === "importo" ? "decimal" : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
            />
          )}
          <div className="lv-cell-edit-actions">
            <button className="lv-btn sm" onClick={onCancel}>Annulla</button>
            <button className="lv-btn primary sm" disabled={saving} onClick={save}>
              {saving ? "Salvo…" : "Salva"}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// Titolo in testata: modificabile con un tocco, come le celle dei movimenti.
// Quando il titolo manca (caso più frequente: le liste importate non ne hanno
// uno) mostra comunque un invito esplicito, altrimenti la possibilità di
// darne uno resterebbe nascosta dentro "Modifica dati".
function TitoloTestata({ lista, dispatch, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(lista.titolo || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const open = () => { setValue(lista.titolo || ""); setEditing(true); };

  const save = async () => {
    if (saving) return;
    const titolo = value.trim() || null; // vuoto = lista senza titolo
    if (titolo === (lista.titolo || null)) { setEditing(false); return; } // niente da salvare
    setSaving(true);
    // clientName null: la RPC lascia il nome cliente invariato.
    const { ok } = await runListeCall(
      dispatch,
      ListeAPI.modifica({ id: lista.id, titolo, clientName: null }),
      titolo ? "Titolo aggiornato" : "Titolo rimosso",
    );
    setSaving(false);
    if (!ok) return;
    setEditing(false);
    await onSaved();
  };

  if (editing) {
    return (
      <span className="lv-tit-edit">
        <input
          ref={inputRef}
          type="text"
          maxLength={80}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); save(); }
            else if (e.key === "Escape") setEditing(false);
          }}
          placeholder="Es. Buono viaggio 2026"
          aria-label="Titolo della lista"
        />
        <button className="lv-btn sm" onClick={() => setEditing(false)}>Annulla</button>
        <button className="lv-btn primary sm" disabled={saving} onClick={save}>
          {saving ? "Salvo…" : "Salva"}
        </button>
      </span>
    );
  }

  return lista.titolo
    ? <button className="lv-tit-btn" title="Modifica il titolo" onClick={open}>{lista.titolo} <span className="pen">✎</span></button>
    : <button className="lv-tit-btn add" title="Aggiungi un titolo" onClick={open}>+ Aggiungi titolo</button>;
}

// Note interne: sezione a uso del team, separata dal "foglio" dei movimenti.
// Non finisce mai nel riepilogo cliente: riepilogoTesto/RiepilogoClienteModal
// leggono solo `movimenti`, mai `lista.note` (vedi listeApi.js/listeModals.jsx).
function NoteInterne({ lista, dispatch, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(lista.note || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const open = () => { setValue(lista.note || ""); setEditing(true); };

  const save = async () => {
    if (saving) return;
    const note = value.trim() || null;
    if (note === (lista.note || null)) { setEditing(false); return; }
    setSaving(true);
    const { ok } = await runListeCall(
      dispatch,
      ListeAPI.modificaNote({ id: lista.id, note }),
      note ? "Note interne aggiornate" : "Note interne rimosse",
    );
    setSaving(false);
    if (!ok) return;
    setEditing(false);
    await onSaved();
  };

  return (
    <div className="lv-card lv-note-card" style={{ marginTop: 16 }}>
      <div className="lv-note-head">
        <h3>Note interne</h3>
        <span className="lv-note-hint">Solo per il team — escluse dal riepilogo cliente</span>
      </div>
      {editing ? (
        <>
          <textarea
            ref={inputRef}
            className="lv-note-text"
            rows={4}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Es. accordi presi, promemoria per l'agenzia…"
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
          />
          <div className="lv-cell-edit-actions">
            <button className="lv-btn sm" onClick={() => setEditing(false)}>Annulla</button>
            <button className="lv-btn primary sm" disabled={saving} onClick={save}>
              {saving ? "Salvo…" : "Salva"}
            </button>
          </div>
        </>
      ) : lista.note ? (
        <p className="lv-note-body" onClick={open} title="Tocca per modificare">{lista.note}</p>
      ) : (
        <button className="lv-btn sm" onClick={open}>+ Aggiungi nota interna</button>
      )}
    </div>
  );
}

// ─── Dettaglio ─────────────────────────────────────────────────────────────
export function ListaDetail({ lista, movimenti, history, usersById, dispatch, onReload, onArchived, clients = [] }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editCell, setEditCell] = useState(null); // { id, campo }
  const [modal, setModal] = useState(null);       // null | "editLista" | "bulk" | "addBeneficiario" | { mov }
  const [confirm, setConfirm] = useState(null);   // conferme distruttive / saldo non a zero
  const [riepilogoOpen, setRiepilogoOpen] = useState(false);

  // Cointestatari già presenti (client_id + nome, dalla LISTA_SELECT). Chi
  // sceglie "+ cointestatario" non deve poter riscegliere il titolare o uno
  // già in lista: idsEsclusi è lo stesso set usato per filtrare `clients`
  // prima di passarlo alla modale. Memoizzato perché `|| []` altrimenti
  // crea un array nuovo a ogni render quando la lista non ne ha ancora.
  const beneficiari = useMemo(() => lista.lista_beneficiari || [], [lista.lista_beneficiari]);
  const idsEsclusi = useMemo(
    () => new Set([lista.client_id, ...beneficiari.map((b) => b.client_id)]),
    [lista.client_id, beneficiari],
  );
  const clientiDisponibili = useMemo(
    () => clients.filter((c) => !idsEsclusi.has(c.id)),
    [clients, idsEsclusi],
  );

  // Cambiando lista si richiude tutto: gli editor aperti si riferivano a
  // movimenti di un'altra lista.
  useEffect(() => {
    setAddOpen(false); setEditCell(null); setModal(null); setConfirm(null); setRiepilogoOpen(false);
  }, [lista.id]);

  const saldo = useMemo(
    () => movimenti.reduce((s, m) => s + Number(m.importo), 0),
    [movimenti],
  );
  const attiva = lista.stato === "attiva";

  const err = (message) => dispatch({ type: "SHOW_TOAST", payload: { type: "error", message } });
  const helper = { run: null, onError: err };

  const toggleStato = async () => {
    if (attiva && Math.abs(saldo) > 0.004) {
      setConfirm({
        title: "Chiudere la lista?",
        body: `Il saldo è ${eur(saldo)}, non zero. Chiudere comunque la lista?`,
        cta: "Segna ESAURITA",
        onOk: () => chiudi(),
      });
      return;
    }
    if (attiva) return chiudi();
    const { ok } = await runListeCall(dispatch, ListeAPI.cambiaStato(lista.id, "attiva"), "Lista riaperta");
    if (ok) await onReload();
  };

  const chiudi = async () => {
    setConfirm(null);
    const { ok } = await runListeCall(dispatch, ListeAPI.cambiaStato(lista.id, "esaurita"), "Lista segnata come ESAURITA");
    if (ok) await onReload();
  };

  const cestina = () => setConfirm({
    title: "Spostare nel cestino?",
    body: "Potrai ripristinarla o eliminarla definitivamente dalla sezione Cestino.",
    cta: "Sposta nel cestino",
    danger: true,
    onOk: async () => {
      setConfirm(null);
      const { ok } = await runListeCall(dispatch, ListeAPI.archivia(lista.id), "Lista spostata nel cestino");
      if (ok) await onArchived();
    },
  });

  const aggiungiBenef = async (payload) => {
    const { ok } = await runListeCall(
      dispatch,
      ListeAPI.aggiungiBeneficiario({ listaId: lista.id, ...payload }),
      "Cointestatario aggiunto",
    );
    if (ok) { setModal(null); await onReload(); }
    return ok;
  };

  const rimuoviBenef = (b) => setConfirm({
    title: "Rimuovere il cointestatario?",
    body: `"${b.clients?.name}" non sarà più cointestatario di questa lista. Resta tracciato nello storico delle modifiche.`,
    cta: "Rimuovi",
    danger: true,
    onOk: async () => {
      setConfirm(null);
      const { ok } = await runListeCall(dispatch, ListeAPI.rimuoviBeneficiario(lista.id, b.client_id), "Cointestatario rimosso");
      if (ok) await onReload();
    },
  });

  // Export Word "copia agente": documento a uso interno (metodo di pagamento
  // e storico inclusi), da distinguere dal riepilogo per il cliente qui sotto.
  const copiaAgente = () => {
    const name = `LISTA_${(lista.clients?.name || "CLIENTE").replace(/\s+/g, "_")}_COPIA_AGENTE.doc`;
    const html = docHtml(lista, movimenti, history, usersById);
    downloadBlob(new Blob(["\ufeff" + html], { type: "application/msword" }), name);
    dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: "Copia agente scaricata (Word)" } });
  };

  const eliminaMov = (m) => setConfirm({
    title: "Eliminare il movimento?",
    body: `"${m.descrizione}" del ${fmtDate(m.data_movimento)} verrà eliminato. L'operazione resta tracciata nello storico.`,
    cta: "Elimina",
    danger: true,
    onOk: async () => {
      setConfirm(null);
      const { ok } = await runListeCall(dispatch, ListeAPI.annullaMovimento(m.id), "Movimento eliminato (tracciato nello storico)");
      if (ok) await onReload();
    },
  });

  const cell = (m, campo, className, content) => (
    <td
      className={`${className} editable`}
      onClick={() => setEditCell({ id: m.id, campo })}
      title="Tocca per modificare"
    >
      {content}
    </td>
  );

  return (
    <>
      <div className="lv-detail-head">
        <div className="grow">
          <div className="lv-name-row">
            <h1>{lista.clients?.name || "—"}</h1>
            <button className="lv-icon-btn" title="Modifica dati lista" aria-label="Modifica dati lista" onClick={() => setModal("editLista")}>✎</button>
          </div>
          <div className="lv-benef-row">
            {beneficiari.map((b) => (
              <span key={b.client_id} className="lv-benef-chip">
                {b.clients?.name}
                <button
                  type="button"
                  className="rm"
                  title="Rimuovi cointestatario"
                  aria-label={`Rimuovi ${b.clients?.name} come cointestatario`}
                  onClick={() => rimuoviBenef(b)}
                >✕</button>
              </span>
            ))}
            <button type="button" className="lv-tit-btn add" onClick={() => setModal("addBeneficiario")}>
              + cointestatario
            </button>
          </div>
          <div className="sub">
            <TitoloTestata lista={lista} dispatch={dispatch} onSaved={onReload} />
            <span className={`lv-badge ${lista.stato}`}>{lista.stato}</span>
          </div>
        </div>
        <div className="lv-saldo-box">
          <div className="lbl">Saldo</div>
          <div className={`val lv-num lv-saldo ${saldoClass(saldo)}`}>{eur(saldo)}</div>
        </div>
      </div>

      <div className="lv-toolbar">
        {attiva && (
          <button className="lv-btn primary" aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)}>
            <span className="plus">＋</span> Nuovo movimento
          </button>
        )}
        <button className="lv-btn" onClick={() => setRiepilogoOpen(true)}>Riepilogo cliente</button>
        <button className="lv-btn" onClick={copiaAgente}>Copia agente</button>
        <button className="lv-btn" onClick={toggleStato}>{attiva ? "Segna ESAURITA" : "Riapri lista"}</button>
        <div style={{ flex: 1 }} />
        <button className="lv-btn danger sm" onClick={cestina}>🗑 Cestina</button>
      </div>

      <div className="lv-card lv-foglio">
        {!attiva && <div className="lv-stamp">LISTA ESAURITA</div>}
        {attiva && addOpen && (
          <AddMovBox
            listaId={lista.id}
            dispatch={dispatch}
            onSaved={onReload}
            onClose={() => setAddOpen(false)}
            onBulk={() => setModal("bulk")}
          />
        )}
        {movimenti.length > 0 ? (
          <>
            <div className="lv-tab-wrap">
              <table className="lv-mov">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrizione</th>
                    <th style={{ textAlign: "right" }}>Importo</th>
                    <th className="met">Metodo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {movimenti.map((m) => (
                    editCell?.id === m.id ? (
                      <CellEditor
                        key={m.id}
                        movimento={m}
                        campo={editCell.campo}
                        dispatch={dispatch}
                        onSaved={async () => { setEditCell(null); await onReload(); }}
                        onCancel={() => setEditCell(null)}
                      />
                    ) : (
                      <tr key={m.id}>
                        {cell(m, "data", "dt lv-num", fmtDate(m.data_movimento))}
                        <td className="desc editable" onClick={() => setEditCell({ id: m.id, campo: "descrizione" })}>
                          {m.descrizione}
                          {/* Sotto i 560px la colonna Metodo sparisce: qui resta
                              raggiungibile come pillola sotto la descrizione. */}
                          <span
                            className="lv-met-inline"
                            onClick={(e) => { e.stopPropagation(); setEditCell({ id: m.id, campo: "metodo" }); }}
                          >
                            {m.metodo ? m.metodo.toUpperCase() : "+ metodo"}
                          </span>
                        </td>
                        {cell(m, "importo", `imp lv-num ${Number(m.importo) > 0 ? "pos" : "neg"}`, eur(m.importo))}
                        {cell(m, "metodo", "met", m.metodo || "")}
                        <td className="act">
                          <button className="lv-icon-btn" title="Modifica tutti i campi" aria-label="Modifica movimento" onClick={() => setModal({ mov: m })}>✎</button>
                          <button className="lv-icon-btn" title="Elimina" aria-label="Elimina movimento" onClick={() => eliminaMov(m)}>✕</button>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lv-hint">Tocca un campo per modificarlo.</div>
          </>
        ) : (
          <div className="lv-empty">
            Nessun movimento.
            {attiva && (
              <>
                <br />
                <button className="lv-btn primary" style={{ marginTop: 12 }} onClick={() => setAddOpen(true)}>
                  <span className="plus">＋</span> Registra il primo
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <NoteInterne lista={lista} dispatch={dispatch} onSaved={onReload} />

      <div className="lv-card" style={{ marginTop: 16 }}>
        <details>
          <summary>Storico modifiche ({history.length})</summary>
          <ul className="lv-hist">
            {history.length === 0 ? (
              <li>Nessuna modifica registrata.</li>
            ) : history.map((h) => (
              <li key={h.id}>
                <b>{usersById[h.actor_id] || "—"}</b> · {actionLabel(h.action)}
                {h.old_value && <><br /><s>{h.old_value}</s></>}
                {h.new_value && <><br />{h.new_value}</>}
                <br />
                <span style={{ fontSize: 11 }}>{new Date(h.created_at).toLocaleString("it-IT")}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      {modal === "editLista" && (
        <EditListaModal
          lista={lista}
          onClose={() => setModal(null)}
          onSave={{
            ...helper,
            run: async (payload) => {
              const { ok } = await runListeCall(dispatch, ListeAPI.modifica(payload), "Dati lista aggiornati");
              if (ok) { setModal(null); await onReload(); }
              return ok;
            },
          }}
        />
      )}

      {modal === "addBeneficiario" && (
        <AggiungiBeneficiarioModal
          clients={clientiDisponibili}
          onClose={() => setModal(null)}
          onCreate={{ ...helper, run: aggiungiBenef }}
        />
      )}

      {modal === "bulk" && (
        <BulkMovimentiModal
          onClose={() => setModal(null)}
          onSave={{
            ...helper,
            run: async ({ data, movimenti: righe, metodo }) => {
              const { ok, data: n } = await runListeCall(
                dispatch,
                ListeAPI.addMovimenti({ listaId: lista.id, data, movimenti: righe, metodo }),
                null,
              );
              if (!ok) return false;
              dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: `${n} movimenti registrati` } });
              setModal(null);
              await onReload();
              return true;
            },
          }}
        />
      )}

      {modal?.mov && (
        <EditMovimentoModal
          movimento={modal.mov}
          onClose={() => setModal(null)}
          onSave={{
            ...helper,
            run: async (payload) => {
              const { ok } = await runListeCall(dispatch, ListeAPI.modificaMovimento(payload), "Movimento aggiornato");
              if (ok) { setModal(null); await onReload(); }
              return ok;
            },
          }}
        />
      )}

      {riepilogoOpen && (
        <RiepilogoClienteModal
          lista={lista}
          movimenti={movimenti}
          dispatch={dispatch}
          onClose={() => setRiepilogoOpen(false)}
        />
      )}

      {/* Conferme: la SPA usava confirm() nativo, qui una modale coerente col
          resto del modulo (e non bloccante per il thread). */}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          body={confirm.body}
          cta={confirm.cta}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onOk}
        />
      )}
    </>
  );
}

export default ListaDetail;
