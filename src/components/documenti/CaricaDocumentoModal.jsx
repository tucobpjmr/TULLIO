// src/components/documenti/CaricaDocumentoModal.jsx
// Caricamento di UN documento, con i suoi dati compilati sul momento.
//
// Esiste accanto all'import massivo perché sono due gesti diversi: l'import
// porta dentro un archivio già esistente e si accontenta del nome dedotto dal
// file, questo è il gesto quotidiano — «è arrivato il passaporto di Rossi» — e
// lì numero e scadenza si hanno sotto gli occhi. Farli compilare dopo, dalla
// scheda, significherebbe che nessuno li compila.
import { useState, useRef } from "react";
import { Modal } from "../ui/Modal.jsx";
import { nomeDaFile } from "./nomeDaFile.js";
import { comprimiSePossibile } from "../../lib/comprimiImmagine.js";
import { TIPI_DOCUMENTO, TIPO_PREDEFINITO } from "./documentiModello.js";
import { formatFileSize } from "../../lib/fileUtils.js";
import { btn } from "../../styles/tokens.js";
import * as stiliComuni from "../../styles/common.js";
import { zonaFile, grigliaCampi, campo, etichetta, campoLargo, riepilogo } from "./documentiStyles.js";

export function CaricaDocumentoModal({ onChiudi, onCarica }) {
  const [file, setFile] = useState(/** @type {File|null} */ (null));
  const [dati, setDati] = useState({ passeggero: "", tipo: TIPO_PREDEFINITO, numero: "", scadenza: "", note: "" });
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState(/** @type {string|null} */ (null));
  // Input nascosto + pulsante vero: un `<label>` attorno a un input
  // `display:none` non si raggiunge con il Tab (vedi TaskAttachments.jsx).
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null));

  const scegli = (e) => {
    const scelto = e.target.files?.[0] || null;
    setFile(scelto);
    setErrore(null);
    if (scelto) {
      // Il nome dedotto è un SUGGERIMENTO e riempie il campo solo se è vuoto:
      // chi ha già scritto il nome a mano non deve vederselo sovrascrivere
      // scegliendo il file per secondo.
      const { passeggero } = nomeDaFile(scelto.name);
      setDati((p) => (p.passeggero.trim() ? p : { ...p, passeggero }));
    }
    e.target.value = "";
  };

  const modifica = (nome) => (e) => setDati((p) => ({ ...p, [nome]: e.target.value }));

  const carica = async () => {
    if (!file) return;
    setInCorso(true);
    setErrore(null);
    // La compressione può fallire (formato non decodificabile dal browser):
    // `comprimiSePossibile` in quel caso restituisce l'originale invece di
    // sollevare, quindi qui non c'è un ramo d'errore da gestire — il tetto del
    // bucket resta l'ultima parola.
    const { blob } = await comprimiSePossibile(file);
    const { error } = await onCarica(blob, file.name, {
      passeggero: dati.passeggero.trim(),
      tipo: dati.tipo,
      numero: dati.numero.trim() || null,
      scadenza: dati.scadenza || null,
      note: dati.note.trim() || null,
    });
    setInCorso(false);
    if (error) { setErrore(error.message || "Caricamento non riuscito"); return; }
    onChiudi();
  };

  const pronto = !!file && dati.passeggero.trim().length > 0;

  return (
    <Modal open onClose={inCorso ? () => {} : onChiudi} labelledBy="vd-carica-doc-titolo" width={560}>
      <div style={stiliComuni.testataModale}>
        <h2 id="vd-carica-doc-titolo" style={stiliComuni.txtHeadingMb16}>Nuovo documento</h2>
        {!inCorso && (
          <button type="button" style={stiliComuni.btnChiudi} onClick={onChiudi} aria-label="Chiudi">✕</button>
        )}
      </div>

      <div style={zonaFile}>
        {file
          ? <p><strong>{file.name}</strong> — {formatFileSize(file.size)}</p>
          : <p>Nessun file scelto. Foto o scansione del documento, oppure un PDF.</p>}
        <div style={stiliComuni.rowGap8Mt20}>
          <input ref={fileRef} type="file" accept="image/*,application/pdf"
                 onChange={scegli} style={stiliComuni.hidden} tabIndex={-1} />
          <button type="button" style={btn.ghost} onClick={() => fileRef.current?.click()}>
            {file ? "Cambia file" : "Scegli il file"}
          </button>
        </div>
      </div>

      <div style={grigliaCampi}>
        <div style={campoLargo}>
          <label htmlFor="vd-nuovo-passeggero" style={etichetta}>Passeggero</label>
          <input id="vd-nuovo-passeggero" style={campo} value={dati.passeggero} onChange={modifica("passeggero")} placeholder="COGNOME NOME" />
        </div>
        <div>
          <label htmlFor="vd-nuovo-tipo" style={etichetta}>Tipo</label>
          <select id="vd-nuovo-tipo" style={campo} value={dati.tipo} onChange={modifica("tipo")}>
            {TIPI_DOCUMENTO.map((t) => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="vd-nuovo-numero" style={etichetta}>Numero</label>
          <input id="vd-nuovo-numero" style={campo} value={dati.numero} onChange={modifica("numero")} />
        </div>
        <div>
          <label htmlFor="vd-nuovo-scadenza" style={etichetta}>Scadenza</label>
          <input id="vd-nuovo-scadenza" type="date" style={campo} value={dati.scadenza} onChange={modifica("scadenza")} />
        </div>
        <div>
          <label htmlFor="vd-nuovo-note" style={etichetta}>Note</label>
          <input id="vd-nuovo-note" style={campo} value={dati.note} onChange={modifica("note")} />
        </div>
      </div>

      {errore && <div style={riepilogo}>{errore}</div>}

      <div style={stiliComuni.rowGap8Mt20}>
        <button type="button" style={btn.ghost} onClick={onChiudi} disabled={inCorso}>Annulla</button>
        <button type="button" style={btn.primary} onClick={carica} disabled={!pronto || inCorso}>
          {inCorso ? "Caricamento…" : "Carica"}
        </button>
      </div>
    </Modal>
  );
}
