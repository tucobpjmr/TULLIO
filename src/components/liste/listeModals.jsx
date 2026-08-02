// src/components/liste/listeModals.jsx
// Modali del modulo Liste Viaggio. Nella SPA sorgente erano stringhe HTML
// iniettate in un div #modal e pilotate da funzioni su `window`; qui sono
// componenti controllati, con lo stato dei campi in useState.
//
// Il guard anti doppio-click della SPA (`let creatingLista=false`) diventa lo
// stato `saving`: il bottone si disabilita finché la RPC non risponde.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  METODI, eur, fmtDate, parseImporto, riepilogoTesto, saldoClass, todayISO,
} from "../../lib/listeApi.js";

// Chiude con Escape e blocca la propagazione del click interno, come faceva
// l'overlay della SPA. Il focus va al primo campo all'apertura.
//
// Portale su document.body: ListeViaggio.jsx monta questi overlay dentro il
// proprio wrapper ".fade-in" (animazione d'ingresso della vista), che ha un
// transform (translateY) nel keyframe finale — per spec CSS un transform
// diverso da "none" rende l'elemento containing block per i discendenti
// position:fixed. L'overlay finiva quindi centrato rispetto all'altezza
// dell'intera vista (spesso più alta del viewport, essendo scrollabile)
// invece che rispetto allo schermo, comparendo troppo in basso su mobile
// (segnalato dall'utente su "Strumenti dati" e "+ Nuova lista"). Il portale
// lo sgancia da quella gerarchia e lo posiziona sempre rispetto al viewport
// reale, com'è già per gli altri modali dell'app.
//
// Il wrapper .lv-root qui sotto è necessario quanto il portale stesso: TUTTO
// il CSS del modulo (bottoni, select/input, font Inter, variabili colore
// --lv-*) è scopato come discendente di .lv-root (vedi listeStyles.jsx) —
// senza di lui il portale porta il modale fuori dalla sua stessa gerarchia
// di stile, e bottoni/select tornano al default del browser (overflow del
// <select> Cliente compreso). .lv-root non ha transform/filter, quindi non
// reintroduce il bug della positioning: contribuisce zero altezza al layout
// perché il suo unico figlio è position:fixed.
export function LvOverlay({ children, onClose, wide = false }) {
  const boxRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    boxRef.current?.querySelector("input, select")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="lv-root">
      <div className="lv-overlay" onClick={onClose}>
        <div
          ref={boxRef}
          className={`lv-modal${wide ? " wide" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

const MetodoSelect = ({ value, onChange, id }) => (
  <select id={id} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
    {METODI.map((v) => (
      <option key={v || "none"} value={v}>{v ? v.toUpperCase() : "—"}</option>
    ))}
  </select>
);

// Segmento Versamento (+) / Utilizzo (−). Il segno è separato dall'importo:
// l'utente digita sempre un numero positivo.
const SegnoSeg = ({ segno, onChange, labels = true }) => (
  <div className="lv-seg">
    <button type="button" className={segno > 0 ? "on-pos" : ""} onClick={() => onChange(1)}>
      {labels ? "Versamento +" : "+"}
    </button>
    <button type="button" className={segno < 0 ? "on-neg" : ""} onClick={() => onChange(-1)}>
      {labels ? "Utilizzo −" : "−"}
    </button>
  </div>
);

// ─── Nuova lista ───────────────────────────────────────────────────────────
// Il cliente si sceglie dall'anagrafica condivisa; "+ Nuovo cliente…" lo crea
// contestualmente (la RPC crea_lista fa INSERT su clients nella stessa
// transazione, così non restano clienti orfani se la creazione lista fallisce).
export function NuovaListaModal({ clients, onCreate, onClose, presetClientId = null }) {
  const [clientId, setClientId] = useState(presetClientId || "");
  const [newName, setNewName] = useState("");
  const [titolo, setTitolo] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (!clientId) return onCreate.onError("Scegli un cliente");
    if (clientId === "__new__" && !newName.trim()) return onCreate.onError("Inserisci il nome del cliente");
    setSaving(true);
    const ok = await onCreate.run({
      clientId: clientId === "__new__" ? null : clientId,
      titolo: titolo.trim() || null,
      newClientName: clientId === "__new__" ? newName.trim() : null,
    });
    if (!ok) setSaving(false); // consenti un nuovo tentativo
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Nuova lista</h2>
      <div className="row lv-field">
        <label htmlFor="nl-client">Cliente</label>
        <select id="nl-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">— scegli cliente —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new__">+ Nuovo cliente…</option>
        </select>
      </div>
      {clientId === "__new__" && (
        <div className="row lv-field">
          <label htmlFor="nl-newname">Nome nuovo cliente</label>
          <input id="nl-newname" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Es. ROSSI MARIO" />
        </div>
      )}
      <div className="row lv-field">
        <label htmlFor="nl-title">Titolo (facoltativo)</label>
        <input id="nl-title" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Buono viaggio 2026" />
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Creo…" : "Crea lista"}
        </button>
      </div>
    </LvOverlay>
  );
}

// ─── Modifica dati lista (titolo +, volendo, nome cliente) ─────────────────
// Il titolo appartiene alla lista; il nome cliente NO: è la riga
// dell'anagrafica condivisa (`clients`), la stessa che usano le altre liste
// dello stesso intestatario, la scheda cliente e i task che lo citano.
// `modifica_lista` con p_client_name valorizzato fa una UPDATE su `clients`.
//
// Per questo il campo nasce in sola lettura e serve una spunta esplicita per
// sbloccarlo: chi voleva correggere il titolo di una lista non deve poter
// rinominare per sbaglio un cliente di tutta l'agenzia. A spunta spenta il
// nome non viene nemmeno inviato (clientName: null → la RPC lo lascia com'è).
export function EditListaModal({ lista, onSave, onClose }) {
  const nomeOriginale = lista.clients?.name || "";
  const [name, setName] = useState(nomeOriginale);
  const [titolo, setTitolo] = useState(lista.titolo || "");
  const [rinomina, setRinomina] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (rinomina && !name.trim()) return onSave.onError("Il nome del cliente è obbligatorio");
    setSaving(true);
    const ok = await onSave.run({
      id: lista.id,
      titolo: titolo.trim() || null,
      clientName: rinomina ? name.trim() : null,
    });
    if (!ok) setSaving(false);
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Modifica dati lista</h2>
      <div className="row lv-field">
        <label htmlFor="el-title">Titolo della lista (facoltativo)</label>
        <input id="el-title" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Buono viaggio 2026" />
      </div>
      <div className="row lv-field">
        <label htmlFor="el-client">Nome cliente (anagrafica condivisa)</label>
        <input
          id="el-client"
          value={name}
          disabled={!rinomina}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. ROSSI MARIO"
          style={rinomina ? undefined : { opacity: 0.6 }}
        />
      </div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginTop: 2, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={rinomina}
          onChange={(e) => { setRinomina(e.target.checked); if (!e.target.checked) setName(nomeOriginale); }}
          style={{ marginTop: 3, cursor: "pointer" }}
        />
        <span>Rinomina il cliente in anagrafica</span>
      </label>
      <p style={{ fontSize: 12, color: "var(--lv-muted)", marginTop: 6 }}>
        {rinomina
          ? "Il nome è quello dell'anagrafica: cambiarlo cambia l'intestazione di tutte le liste di questo cliente, della sua scheda e dei riepiloghi generati da qui in avanti."
          : "Per correggere solo questa lista basta il titolo: il nome cliente resta com'è."}
      </p>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Salvo…" : "Salva modifiche"}
        </button>
      </div>
    </LvOverlay>
  );
}

// ─── Modifica di un movimento già registrato ───────────────────────────────
// Form completo in modale: i campi in riga (modifica in linea) su schermo
// stretto non ci stanno tutti, questa è la via utilizzabile anche da telefono.
export function EditMovimentoModal({ movimento, onSave, onClose }) {
  const [data, setData] = useState(movimento.data_movimento);
  const [desc, setDesc] = useState(movimento.descrizione);
  const [segno, setSegno] = useState(Number(movimento.importo) < 0 ? -1 : 1);
  const [imp, setImp] = useState(Math.abs(Number(movimento.importo)).toFixed(2).replace(".", ","));
  const [metodo, setMetodo] = useState(movimento.metodo || null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    const importo = parseImporto(imp, segno);
    if (!data || !desc.trim() || importo === null) {
      return onSave.onError("Compila data, descrizione e importo");
    }
    setSaving(true);
    const ok = await onSave.run({ id: movimento.id, data, descrizione: desc.trim(), importo, metodo });
    if (!ok) setSaving(false);
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Modifica movimento</h2>
      <div className="row lv-field">
        <label htmlFor="ed-data">Data</label>
        <input id="ed-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </div>
      <div className="row lv-field">
        <label htmlFor="ed-desc">Descrizione</label>
        <input id="ed-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="row lv-field">
        <label>Tipo</label>
        <SegnoSeg segno={segno} onChange={setSegno} />
      </div>
      <div className="row lv-field">
        <label htmlFor="ed-imp">Importo €</label>
        <input id="ed-imp" inputMode="decimal" value={imp} onChange={(e) => setImp(e.target.value)} />
      </div>
      <div className="row lv-field">
        <label htmlFor="ed-met">Metodo</label>
        <MetodoSelect id="ed-met" value={metodo} onChange={setMetodo} />
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Salvo…" : "Salva modifiche"}
        </button>
      </div>
    </LvOverlay>
  );
}

// ─── Inserimento multiplo ──────────────────────────────────────────────────
// Data e metodo valgono per tutte le righe, il segno è per riga. Una sola RPC
// (registra_movimenti_lista) scrive tutte le righe in un'unica transazione.
let bulkRowSeq = 0;
const emptyBulkRow = () => ({ key: ++bulkRowSeq, desc: "", imp: "", segno: 1 });

export function BulkMovimentiModal({ onSave, onClose }) {
  const [data, setData] = useState(todayISO());
  const [metodo, setMetodo] = useState(null);
  const [rows, setRows] = useState(() => [emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
  const [saving, setSaving] = useState(false);

  const setRow = (key, patch) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key) => {
    if (rows.length <= 1) return onSave.onError("Serve almeno una riga");
    setRows((rs) => rs.filter((r) => r.key !== key));
  };

  const totale = rows.reduce((s, r) => s + (parseImporto(r.imp, r.segno) || 0), 0);
  const totCls = totale > 0.004 ? "pos" : totale < -0.004 ? "neg" : "";

  const submit = async () => {
    if (saving) return;
    if (!data) return onSave.onError("Inserisci la data comune");
    const movimenti = [];
    let incomplete = 0;
    for (const r of rows) {
      const desc = r.desc.trim();
      const grezzo = r.imp.trim();
      if (!desc && !grezzo) continue; // riga lasciata vuota: si ignora
      const importo = parseImporto(grezzo, r.segno);
      if (!desc || importo === null) { incomplete++; continue; }
      movimenti.push({ descrizione: desc, importo });
    }
    if (incomplete) return onSave.onError(`${incomplete} righe hanno descrizione o importo mancante`);
    if (!movimenti.length) return onSave.onError("Compila almeno una riga");
    setSaving(true);
    const ok = await onSave.run({ data, movimenti, metodo });
    if (!ok) setSaving(false);
  };

  return (
    <LvOverlay onClose={onClose} wide>
      <h2>Aggiungi più movimenti</h2>
      <p className="lv-bulk-hint">
        Data e metodo valgono per tutte le righe. Per ogni riga scegli se è un
        versamento (+) o un utilizzo (−).
      </p>
      <div className="lv-form-grid" style={{ marginBottom: 14 }}>
        <div className="lv-field">
          <label htmlFor="bulk-data">Data (comune)</label>
          <input id="bulk-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="lv-field">
          <label htmlFor="bulk-met">Metodo (comune)</label>
          <MetodoSelect id="bulk-met" value={metodo} onChange={setMetodo} />
        </div>
      </div>
      <div>
        {rows.map((r) => (
          <div key={r.key} className="lv-bulk-row">
            <input
              value={r.desc}
              onChange={(e) => setRow(r.key, { desc: e.target.value })}
              placeholder="Descrizione (es. ROSSI MARIO)"
              aria-label="Descrizione del movimento"
            />
            <div className="lv-bulk-bottom">
              <div className="lv-bulk-seg">
                <SegnoSeg segno={r.segno} onChange={(s) => setRow(r.key, { segno: s })} labels={false} />
              </div>
              <input
                className="lv-bulk-imp"
                inputMode="decimal"
                value={r.imp}
                onChange={(e) => setRow(r.key, { imp: e.target.value })}
                placeholder="0,00"
                aria-label="Importo del movimento"
              />
              <button type="button" className="lv-icon-btn" title="Togli riga" aria-label="Togli riga" onClick={() => removeRow(r.key)}>✕</button>
            </div>
          </div>
        ))}
      </div>
      <button className="lv-btn sm" style={{ marginTop: 6 }} onClick={() => setRows((rs) => [...rs, emptyBulkRow()])}>
        + Aggiungi riga
      </button>
      <div className="lv-bulk-tot">
        <span>Totale</span>
        <b className={`lv-num ${totCls}`}>{eur(totale)}</b>
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Registro…" : "Registra tutti"}
        </button>
      </div>
    </LvOverlay>
  );
}

// ─── Conferma generica (distruttiva o meno) ────────────────────────────────
// Estratta dal dettaglio lista (chiusura/cestinazione/eliminazione movimento)
// per essere riusata anche dall'eliminazione definitiva dal cestino e dal
// reset totale: stessa impalcatura, tre proprietà diverse.
export function ConfirmModal({ title, body, cta = "Conferma", danger = false, onCancel, onConfirm }) {
  return (
    <div className="lv-overlay" onClick={onCancel}>
      <div className="lv-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p style={{ fontSize: 14, color: "var(--lv-muted)" }}>{body}</p>
        <div className="actions">
          <button className="lv-btn" onClick={onCancel}>Annulla</button>
          <button className={`lv-btn ${danger ? "danger" : "primary"}`} onClick={onConfirm}>{cta}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Riepilogo cliente: anteprima stampabile/condivisibile ─────────────────
// Copia destinata al cliente: niente metodi di pagamento, niente storico
// (quella è la copia agente, vedi copiaAgente in ListaDetail). La stampa
// isola questo blocco dal resto dell'app via @media print in listeStyles.jsx;
// "Invia" usa la Web Share API se disponibile, altrimenti copia negli appunti.
export function RiepilogoClienteModal({ lista, movimenti, dispatch, onClose }) {
  const saldo = movimenti.reduce((s, m) => s + Number(m.importo), 0);
  const cls = saldoClass(saldo);

  const invia = async () => {
    const testo = riepilogoTesto(lista, movimenti);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Riepilogo buono viaggio", text: testo });
      } catch (ex) {
        if (ex.name !== "AbortError") {
          dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Invio non riuscito" } });
        }
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(testo);
      dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: "Riepilogo copiato: incollalo in WhatsApp o in una email" } });
    } catch {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Condivisione non disponibile su questo browser" } });
    }
  };

  return (
    <LvOverlay onClose={onClose} wide>
      <div className="lv-riepilogo">
        <div className="rp-brand">Liste Viaggio · Gestione buoni</div>
        <h2>Riepilogo buono viaggio</h2>
        <div className="rp-cliente">{lista.clients?.name || "—"}</div>
        {lista.titolo && <div className="rp-tit">{lista.titolo}</div>}
        {movimenti.length > 0 ? (
          <table className="lv-mov">
            <thead>
              <tr><th>Data</th><th>Descrizione</th><th style={{ textAlign: "right" }}>Importo</th></tr>
            </thead>
            <tbody>
              {movimenti.map((m) => (
                <tr key={m.id}>
                  <td className="dt lv-num">{fmtDate(m.data_movimento)}</td>
                  <td>{m.descrizione}</td>
                  <td className={`imp lv-num ${Number(m.importo) < 0 ? "neg" : "pos"}`}>{eur(m.importo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rp-vuoto">Nessun movimento registrato.</p>
        )}
        <div className="rp-saldo"><span>Saldo</span><b className={`lv-num ${cls}`}>{eur(saldo)}</b></div>
        {lista.stato === "esaurita" && <div className="rp-esaurita">LISTA ESAURITA</div>}
        <div className="rp-foot">Documento generato il {new Date().toLocaleDateString("it-IT")}</div>
      </div>
      <div className="actions no-print">
        <button className="lv-btn" onClick={onClose}>Chiudi</button>
        <button className="lv-btn" onClick={invia}>Invia</button>
        <button className="lv-btn primary" onClick={() => window.print()}>Stampa</button>
      </div>
    </LvOverlay>
  );
}

// ─── Strumenti dati: backup JSON e reset totale ────────────────────────────
// Raccoglie in un'unica modale le operazioni sui dati, come faceva la SPA.
// "Reset totale…" compare solo per l'admin: la RPC lo rifiuta comunque agli
// altri ruoli (insufficient_privilege), ma non ha senso offrire nella UI un
// bottone che fallirebbe sempre per manager/agent.
export function StrumentiDatiModal({ isAdminUser, onClose, onScaricaBackup, onCaricaBackup, onReset }) {
  return (
    <LvOverlay onClose={onClose}>
      <h2>Strumenti dati</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button className="lv-btn" style={{ justifyContent: "center" }} onClick={onScaricaBackup}>
          ⬇ Scarica backup (JSON)
        </button>
        <button className="lv-btn" style={{ justifyContent: "center" }} onClick={onCaricaBackup}>
          ⬆ Carica backup
        </button>
        {isAdminUser && (
          <button className="lv-btn danger" style={{ justifyContent: "center" }} onClick={onReset}>
            Reset totale…
          </button>
        )}
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Chiudi</button>
      </div>
    </LvOverlay>
  );
}

// ─── Conferma caricamento backup ────────────────────────────────────────────
// Il merge (importa_backup) somma ai dati esistenti e salta i duplicati per
// id: non cancella nulla, ma un file sbagliato può comunque aggiungere righe
// indesiderate, quindi resta una conferma esplicita prima della RPC.
export function ImportaBackupConfirmModal({ nL, nM, progress = null, onClose, onSave }) {
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onSave.run();
    if (!ok) setSaving(false);
  };

  // Il ripristino viaggia a blocchi: su un backup grande sono molte chiamate
  // in fila, e senza avanzamento il bottone fermo su "Carico…" sembrerebbe
  // piantato. La percentuale compare solo quando c'è davvero qualcosa da
  // scrivere (total > 0), così i backup piccoli non lampeggiano.
  const perc = progress?.total ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <LvOverlay onClose={onClose}>
      <h2>Caricare il backup?</h2>
      <p style={{ fontSize: 14, color: "var(--lv-muted)" }}>
        Il file contiene {nL} liste e {nM} movimenti. I dati verranno AGGIUNTI a
        quelli esistenti; i duplicati (stesso identificativo) vengono saltati.
        Nulla viene cancellato.
      </p>
      {perc !== null && (
        <p style={{ fontSize: 13, color: "var(--lv-muted)" }} role="status">
          Caricamento: {progress.done} di {progress.total} righe ({perc}%)
        </p>
      )}
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Carico…" : "Carica backup"}
        </button>
      </div>
    </LvOverlay>
  );
}

// ─── Reset totale ────────────────────────────────────────────────────────
// Hard delete di tutte le liste/movimenti/storico. Riservato all'admin sia
// nella RPC (private.is_admin()) sia qui: la conferma testuale esatta è la
// stessa barriera anti-click-accidentale della SPA sorgente.
export function ResetTotaleModal({ onClose, onSave }) {
  const [testo, setTesto] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (testo.trim() !== "RESET TOTALE") return onSave.onError("Digita esattamente: RESET TOTALE");
    setSaving(true);
    const ok = await onSave.run();
    if (!ok) setSaving(false);
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Reset totale dell&rsquo;applicazione</h2>
      <p style={{ color: "var(--lv-neg)", fontWeight: 600 }}>Attenzione: operazione irreversibile.</p>
      <p style={{ fontSize: 14, color: "var(--lv-muted)" }}>
        Verranno eliminati <b>definitivamente tutte le liste, tutti i movimenti e
        tutto lo storico</b> (compreso il cestino). L&rsquo;anagrafica clienti e gli
        account restano. Si consiglia di <b>scaricare prima un backup</b>.
      </p>
      <div className="row lv-field" style={{ marginTop: 12 }}>
        <label htmlFor="reset-conf">Per confermare digita esattamente: RESET TOTALE</label>
        <input
          id="reset-conf"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder="RESET TOTALE"
          autoComplete="off"
          autoCapitalize="characters"
        />
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn danger" disabled={saving} onClick={submit}>
          {saving ? "Elimino…" : "Elimina tutto"}
        </button>
      </div>
    </LvOverlay>
  );
}

export { SegnoSeg, MetodoSelect };
