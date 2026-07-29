// src/components/liste/ListaDetail.jsx
// Dettaglio di una lista: testata con saldo, barra comandi, "foglio" dei
// movimenti e storico delle modifiche. Porting di `listaView()` della SPA
// vanilla, con lo stato dei campi in useState invece che in variabili globali.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ListeAPI, METODI, actionLabel, eur, fmtDate, parseImporto, runListeCall,
  saldoClass, todayISO,
} from "../../lib/listeApi.js";
import {
  BulkMovimentiModal, EditListaModal, EditMovimentoModal, SegnoSeg,
} from "./listeModals.jsx";
import { RiepilogoClienteModal } from "./listeDocModals.jsx";
import { docHtml, downloadDoc, nomeFileDoc } from "../../lib/listeExport.js";

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

// ─── Dettaglio ─────────────────────────────────────────────────────────────
export function ListaDetail({ lista, movimenti, history, usersById, dispatch, onReload, onBack, onArchived }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editCell, setEditCell] = useState(null); // { id, campo }
  const [modal, setModal] = useState(null);       // null | "editLista" | "bulk" | { mov }
  const [confirm, setConfirm] = useState(null);   // conferme distruttive / saldo non a zero

  // Cambiando lista si richiude tutto: gli editor aperti si riferivano a
  // movimenti di un'altra lista.
  useEffect(() => { setAddOpen(false); setEditCell(null); setModal(null); setConfirm(null); }, [lista.id]);

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

  // Copia a uso interno: porta con sé i metodi di pagamento e lo storico di
  // chi ha modificato cosa. Da non consegnare al cliente — per quello c'è il
  // riepilogo, che entrambi omette.
  const copiaAgente = () => {
    downloadDoc(
      nomeFileDoc(lista, "_COPIA_AGENTE"),
      docHtml(lista, movimenti, history, usersById),
    );
    dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: "Copia agente scaricata (Word)" } });
  };

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
      <button className="lv-btn sm" style={{ marginBottom: 12 }} onClick={onBack}>← Tutte le liste</button>

      <div className="lv-detail-head">
        <div className="grow">
          <h1>{lista.clients?.name || "—"}</h1>
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
        <button className="lv-btn" onClick={() => setModal("editLista")}>✎ Modifica dati</button>
        <button className="lv-btn" onClick={toggleStato}>{attiva ? "Segna ESAURITA" : "Riapri lista"}</button>
        <button className="lv-btn" onClick={() => setModal("riepilogo")}>Riepilogo cliente</button>
        <button className="lv-btn" onClick={copiaAgente}>Copia agente</button>
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

      {modal === "riepilogo" && (
        <RiepilogoClienteModal
          lista={lista}
          movimenti={movimenti}
          onClose={() => setModal(null)}
          onToast={(type, message) => dispatch({ type: "SHOW_TOAST", payload: { type, message } })}
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

      {/* Conferme: la SPA usava confirm() nativo, qui una modale coerente col
          resto del modulo (e non bloccante per il thread). */}
      {confirm && (
        <div className="lv-overlay" onClick={() => setConfirm(null)}>
          <div className="lv-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{confirm.title}</h2>
            <p style={{ fontSize: 14, color: "var(--lv-muted)" }}>{confirm.body}</p>
            <div className="actions">
              <button className="lv-btn" onClick={() => setConfirm(null)}>Annulla</button>
              <button className={`lv-btn ${confirm.danger ? "danger" : "primary"}`} onClick={confirm.onOk}>
                {confirm.cta}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ListaDetail;
