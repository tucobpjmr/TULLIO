// src/components/liste/ListaDetail.jsx
// Dettaglio di una lista: testata con saldo, barra comandi, "foglio" dei
// movimenti e storico delle modifiche. Porting di `listaView()` della SPA
// vanilla, con lo stato dei campi in useState invece che in variabili globali.
import { useEffect, useMemo, useState } from "react";
import { actionLabel, eur, fmtDate, saldoClass } from "./listeFormato.js";
import { docHtml, downloadBlob } from "./listeDocumenti.js";
import { useListeWrite } from "./listePersistence.js";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import { AggiungiBeneficiarioModal } from "./modals/AggiungiBeneficiarioModal.jsx";
import { BulkMovimentiModal } from "./modals/BulkMovimentiModal.jsx";
import { EditListaModal } from "./modals/EditListaModal.jsx";
import { EditMovimentoModal } from "./modals/EditMovimentoModal.jsx";
import { RiepilogoClienteModal } from "./modals/RiepilogoClienteModal.jsx";
import { SpostaTitolareModal } from "./modals/SpostaTitolareModal.jsx";
import { AddMovBox } from "./AddMovBox.jsx";
import { CellEditor } from "./CellEditor.jsx";
import { NoteInterne } from "./NoteInterne.jsx";
import { TitoloTestata } from "./TitoloTestata.jsx";
import * as stiliComuni from "../../styles/common.js";
import { useDispatch } from "../../state/DispatchContext.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtRight = { textAlign: "right" };
const mt16 = { marginTop: 16 };
const txtF11 = { fontSize: 11 };

// `onReload` (== `reloadAll` di ListeViaggio) ricarica la home in modo
// selettivo secondo `tabelle` (vedi useListeData — soloSaldi). Qui, dopo ogni
// scrittura, sappiamo con certezza cosa può essere stato invalidato: un
// movimento tocca i saldi e non l'elenco, una modifica alla lista (titolo,
// note, stato, titolare, cointestatari) tocca l'elenco. Dichiararlo qui
// invece di chiamare `onReload()` a vuoto è ciò che rende selettivo anche il
// reload manuale, non solo quello realtime — altrimenti la correzione A-1
// (vedi useListeData) vale solo per metà dei chiamanti.
const TABELLE_MOVIMENTO = new Set(["movimenti_lista"]);
const TABELLE_LISTA = new Set(["liste_viaggio"]);

// ─── Dettaglio ─────────────────────────────────────────────────────────────
export function ListaDetail({ lista, movimenti, history, usersById, onReload, onArchived, clients = [], saldi = {} }) {
  const dispatch = useDispatch();
  const [aggiuntaAperta, impostaAggiuntaAperta] = useState(false);
  const [editCell, setEditCell] = useState(null); // { id, campo }
  const [modal, setModal] = useState(null);       // null | "editLista" | "bulk" | "addBeneficiario" | { mov }
  const [riepilogoOpen, setRiepilogoOpen] = useState(false);
  const conferma = useConfirm();

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

  // Per "Sposta su un altro cliente" l'esclusione è diversa: solo il
  // titolare attuale (spostare "su se stesso" non ha senso). I cointestatari
  // restano scelte valide — sceglierne uno è la promozione gestita dalla RPC.
  const cointestatariIds = useMemo(() => new Set(beneficiari.map((b) => b.client_id)), [beneficiari]);
  const clientiPerSpostamento = useMemo(
    () => clients.filter((c) => c.id !== lista.client_id),
    [clients, lista.client_id],
  );

  // Cambiando lista si richiude tutto: gli editor aperti si riferivano a
  // movimenti di un'altra lista.
  useEffect(() => {
    impostaAggiuntaAperta(false); setEditCell(null); setModal(null); setRiepilogoOpen(false);
  }, [lista.id]);

  // B-1 dell'audit del 23 agosto. `liste_saldi.saldo` è calcolato dal database
  // in numeric(12,2); sommare qui in float64 è una SECONDA definizione della
  // stessa grandezza, e ricalcolare ciò che è già arrivato esatto non fa
  // guadagnare nulla. Lo scarto misurato è 9e-11 € su 2000 movimenti — non è
  // un difetto di correttezza, è una definizione di troppo, sull'unica
  // grandezza monetaria dell'app e proprio sulla copia che finisce nel
  // documento Word consegnato all'agente.
  // Il fallback locale resta per il solo caso in cui la riga di `saldi` non sia
  // ancora arrivata (primo render dopo una scrittura, prima del reload).
  const saldo = useMemo(
    () => (saldi[lista.id]?.saldo !== undefined
      ? Number(saldi[lista.id].saldo)
      : movimenti.reduce((s, m) => s + Number(m.importo), 0)),
    [saldi, lista.id, movimenti],
  );
  const attiva = lista.stato === "attiva";

  const err = (message) => dispatch({ type: "SHOW_TOAST", payload: { type: "error", message } });
  const helper = { run: null, onError: err };
  const esegui = useListeWrite();

  const toggleStato = async () => {
    if (attiva && Math.abs(saldo) > 0.004) {
      if (!(await conferma({
        title: "Chiudere la lista?",
        body: `Il saldo è ${eur(saldo)}, non zero. Chiudere comunque la lista?`,
        cta: "Segna ESAURITA",
      }))) return;
      return chiudi();
    }
    if (attiva) return chiudi();
    const { ok } = await esegui("riapriLista", lista.id);
    if (ok) await onReload(TABELLE_LISTA);
  };

  const chiudi = async () => {
    const { ok } = await esegui("esaurisciLista", lista.id);
    if (ok) await onReload(TABELLE_LISTA);
  };

  const cestina = async () => {
    if (!(await conferma({
      title: "Spostare nel cestino?",
      body: "Potrai ripristinarla o eliminarla definitivamente dalla sezione Cestino.",
      cta: "Sposta nel cestino",
      danger: true,
    }))) return;
    const { ok } = await esegui("cestinaLista", lista.id);
    if (ok) await onArchived();
  };

  const spostaTitolare = async (nuovoClientId) => {
    const { ok } = await esegui("spostaTitolare", lista.id, nuovoClientId);
    if (ok) { setModal(null); await onReload(TABELLE_LISTA); }
    return ok;
  };

  const aggiungiBenef = async (payload) => {
    const { ok } = await esegui("aggiungiCointestatario", { listaId: lista.id, ...payload });
    if (ok) { setModal(null); await onReload(TABELLE_LISTA); }
    return ok;
  };

  const rimuoviBenef = async (b) => {
    if (!(await conferma({
      title: "Rimuovere il cointestatario?",
      body: `"${b.clients?.name}" non sarà più cointestatario di questa lista. Resta tracciato nello storico delle modifiche.`,
      cta: "Rimuovi",
      danger: true,
    }))) return;
    const { ok } = await esegui("rimuoviCointestatario", lista.id, b.client_id);
    if (ok) await onReload(TABELLE_LISTA);
  };

  // Export Word "copia agente": documento a uso interno (metodo di pagamento
  // e storico inclusi), da distinguere dal riepilogo per il cliente qui sotto.
  const copiaAgente = () => {
    const name = `LISTA_${(lista.clients?.name || "CLIENTE").replace(/\s+/g, "_")}_COPIA_AGENTE.doc`;
    const html = docHtml(lista, movimenti, history, usersById, saldo);
    downloadBlob(new Blob(["\ufeff" + html], { type: "application/msword" }), name);
    dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: "Copia agente scaricata (Word)" } });
  };

  const eliminaMov = async (m) => {
    if (!(await conferma({
      title: "Eliminare il movimento?",
      body: `"${m.descrizione}" del ${fmtDate(m.data_movimento)} verrà eliminato. L'operazione resta tracciata nello storico.`,
      cta: "Elimina",
      danger: true,
    }))) return;
    const { ok } = await esegui("annullaMovimento", m.id);
    if (ok) await onReload(TABELLE_MOVIMENTO);
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
      <div className="lv-detail-head">
        <div className="grow">
          <div className="lv-name-row">
            <h1>{lista.clients?.name || "—"}</h1>
            <button className="lv-icon-btn" title="Modifica dati lista" aria-label="Modifica dati lista" onClick={() => setModal("editLista")}>✎</button>
            <button className="lv-icon-btn" title="Sposta su un altro cliente" aria-label="Sposta la lista su un altro cliente" onClick={() => setModal("spostaTitolare")}>⇄</button>
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
            <TitoloTestata lista={lista} onSaved={() => onReload(TABELLE_LISTA)} />
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
          <button className="lv-btn primary" aria-expanded={aggiuntaAperta} onClick={() => impostaAggiuntaAperta((v) => !v)}>
            <span className="plus">＋</span> Nuovo movimento
          </button>
        )}
        <button className="lv-btn" onClick={() => setRiepilogoOpen(true)}>Riepilogo cliente</button>
        <button className="lv-btn" onClick={copiaAgente}>Copia agente</button>
        <button className="lv-btn" onClick={toggleStato}>{attiva ? "Segna ESAURITA" : "Riapri lista"}</button>
        <div style={stiliComuni.flex1} />
        <button className="lv-btn danger sm" onClick={cestina}>🗑 Cestina</button>
      </div>

      <div className="lv-card lv-foglio">
        {!attiva && <div className="lv-stamp">LISTA ESAURITA</div>}
        {attiva && aggiuntaAperta && (
          <AddMovBox
            listaId={lista.id}
            onSaved={() => onReload(TABELLE_MOVIMENTO)}
            onClose={() => impostaAggiuntaAperta(false)}
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
                    <th style={txtRight}>Importo</th>
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
                        onSaved={async () => { setEditCell(null); await onReload(TABELLE_MOVIMENTO); }}
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
                <button className="lv-btn primary" style={stiliComuni.mt12} onClick={() => impostaAggiuntaAperta(true)}>
                  <span className="plus">＋</span> Registra il primo
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <NoteInterne lista={lista} onSaved={() => onReload(TABELLE_LISTA)} />

      <div className="lv-card" style={mt16}>
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
                <span style={txtF11}>{new Date(h.created_at).toLocaleString("it-IT")}</span>
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
              const { ok } = await esegui("modificaLista", payload);
              if (ok) { setModal(null); await onReload(TABELLE_LISTA); }
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

      {modal === "spostaTitolare" && (
        <SpostaTitolareModal
          clients={clientiPerSpostamento}
          cointestatariIds={cointestatariIds}
          titolareAttuale={lista.clients?.name || "—"}
          onClose={() => setModal(null)}
          onMove={{ ...helper, run: spostaTitolare }}
        />
      )}

      {modal === "bulk" && (
        <BulkMovimentiModal
          onClose={() => setModal(null)}
          onSave={{
            ...helper,
            run: async ({ data, movimenti: righe, metodo }) => {
              const { ok, data: n } = await esegui("registraMovimenti", {
                listaId: lista.id, data, movimenti: righe, metodo,
              });
              if (!ok) return false;
              dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: `${n} movimenti registrati` } });
              setModal(null);
              await onReload(TABELLE_MOVIMENTO);
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
              const { ok } = await esegui("modificaMovimento", payload);
              if (ok) { setModal(null); await onReload(TABELLE_MOVIMENTO); }
              return ok;
            },
          }}
        />
      )}

      {riepilogoOpen && (
        <RiepilogoClienteModal
          lista={lista}
          movimenti={movimenti}
          saldo={saldo}
          onClose={() => setRiepilogoOpen(false)}
        />
      )}
    </>
  );
}

export default ListaDetail;
