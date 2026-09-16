// src/components/documenti/DocumentoModal.jsx
// Dettaglio di un documento: anteprima, correzione dei metadati, eliminazione.
//
// L'ANTEPRIMA SI CARICA QUI E SOLO QUI. La signed URL nasce all'apertura di
// questa modale (una sola, per il documento che si sta guardando) e scade
// dopo un'ora — cioè non esiste un momento in cui l'archivio intero è
// raggiungibile via URL. È la contropartita del bucket privato: senza una
// firma il file non è leggibile nemmeno conoscendone il path.
import { useState, useEffect } from "react";
import { Modal } from "../ui/Modal.jsx";
import { ConfirmDialog } from "../ui/ConfirmDialog.jsx";
import { DocumentiIdentita } from "../../lib/api.js";
import { TIPI_DOCUMENTO } from "./documentiModello.js";
import { statoScadenza, testoScadenza, ETICHETTE_STATO } from "./scadenze.js";
import { formatFileSize } from "../../lib/fileUtils.js";
import { btn } from "../../styles/tokens.js";
import * as stiliComuni from "../../styles/common.js";
import {
  anteprima, anteprimaVuota, grigliaCampi, campo, etichetta, campoLargo, piedeModale,
} from "./documentiStyles.js";

// I PDF non si mostrano in un <img>. Un <iframe> sarebbe possibile ma
// aprirebbe un documento attivo dentro l'app: il bucket accetta i PDF perché
// le scansioni arrivano così, non perché li si voglia renderizzare in linea.
// Si apre in una scheda nuova, dove il visualizzatore del browser è già quello
// giusto e il contesto dell'app resta fuori.
const isImmagine = (tipo) => String(tipo || "").startsWith("image/");

export function DocumentoModal({ documento, oggi, puoEliminare, onChiudi, onSalva, onElimina }) {
  const [bozza, setBozza] = useState(documento);
  const [url, setUrl] = useState(/** @type {string|null} */ (null));
  const [erroreUrl, setErroreUrl] = useState(/** @type {string|null} */ (null));
  const [salvataggio, setSalvataggio] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);

  // La bozza riparte quando cambia il documento mostrato: la modale resta
  // montata fra un documento e l'altro se l'utente ne apre un secondo senza
  // chiuderla.
  useEffect(() => { setBozza(documento); }, [documento]);

  useEffect(() => {
    let vivo = true;
    setUrl(null);
    setErroreUrl(null);
    DocumentiIdentita.getFileUrl(documento.filePath).then(({ url: u, error }) => {
      if (!vivo) return;
      if (error || !u) setErroreUrl("Anteprima non disponibile");
      else setUrl(u);
    });
    return () => { vivo = false; };
  }, [documento.filePath]);

  const modifica = (campoNome) => (e) => setBozza((p) => ({ ...p, [campoNome]: e.target.value }));

  const salva = async () => {
    setSalvataggio(true);
    await onSalva(documento.id, {
      passeggero: bozza.passeggero.trim(),
      tipo: bozza.tipo,
      numero: bozza.numero,
      scadenza: bozza.scadenza,
      note: bozza.note,
    });
    setSalvataggio(false);
  };

  const stato = statoScadenza(bozza, oggi);
  const stileStato = { ...stiliComuni.txtF12Muted, color: ETICHETTE_STATO[stato].colore, fontWeight: 600 };
  const nomeValido = String(bozza.passeggero || "").trim().length > 0;

  return (
    <Modal open onClose={onChiudi} labelledBy="vd-documento-titolo" width={620}>
      <div style={stiliComuni.testataModale}>
        <h2 id="vd-documento-titolo" style={stiliComuni.txtHeadingMb16}>{documento.passeggero}</h2>
        <button type="button" style={stiliComuni.btnChiudi} onClick={onChiudi} aria-label="Chiudi">✕</button>
      </div>

      {url && isImmagine(documento.fileType) && (
        <img src={url} alt={`Documento di ${documento.passeggero}`} style={anteprima} />
      )}
      {url && !isImmagine(documento.fileType) && (
        <div style={anteprimaVuota}>
          {documento.fileName} — {formatFileSize(documento.fileSize)}
        </div>
      )}
      {!url && <div style={anteprimaVuota}>{erroreUrl || "Caricamento dell'anteprima…"}</div>}

      <div style={grigliaCampi}>
        <div style={campoLargo}>
          <label htmlFor="vd-doc-passeggero" style={etichetta}>Passeggero</label>
          <input id="vd-doc-passeggero" style={campo} value={bozza.passeggero || ""} onChange={modifica("passeggero")} />
        </div>
        <div>
          <label htmlFor="vd-doc-tipo" style={etichetta}>Tipo</label>
          <select id="vd-doc-tipo" style={campo} value={bozza.tipo} onChange={modifica("tipo")}>
            {TIPI_DOCUMENTO.map((t) => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="vd-doc-numero" style={etichetta}>Numero</label>
          <input id="vd-doc-numero" style={campo} value={bozza.numero || ""} onChange={modifica("numero")} />
        </div>
        <div>
          <label htmlFor="vd-doc-scadenza" style={etichetta}>Scadenza</label>
          <input id="vd-doc-scadenza" type="date" style={campo} value={bozza.scadenza || ""} onChange={modifica("scadenza")} />
        </div>
        <div>
          <span style={etichetta}>Stato</span>
          <div style={stileStato}>{testoScadenza(bozza, oggi)}</div>
        </div>
        <div style={campoLargo}>
          <label htmlFor="vd-doc-note" style={etichetta}>Note</label>
          <input id="vd-doc-note" style={campo} value={bozza.note || ""} onChange={modifica("note")} />
        </div>
      </div>

      <div style={piedeModale}>
        <div style={stiliComuni.rowGap8}>
          {puoEliminare && (
            <button type="button" style={btn.danger} onClick={() => setConfermaElimina(true)}>Elimina</button>
          )}
          {/* `rel="noreferrer"` con `target="_blank"`: senza, la scheda aperta
              riceve `window.opener` e con esso un riferimento all'app. */}
          {url && <a href={url} target="_blank" rel="noreferrer" style={btn.ghost}>Apri il file</a>}
        </div>
        <div style={stiliComuni.rowGap8}>
          <button type="button" style={btn.ghost} onClick={onChiudi}>Chiudi</button>
          <button type="button" style={btn.primary} onClick={salva} disabled={salvataggio || !nomeValido}>
            {salvataggio ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confermaElimina}
        danger
        title="Eliminare il documento?"
        body={`Il documento di ${documento.passeggero} e il file verranno eliminati definitivamente. L'archivio non ha un cestino.`}
        cta="Elimina"
        onCancel={() => setConfermaElimina(false)}
        onConfirm={() => { setConfermaElimina(false); onElimina(documento); }}
      />
    </Modal>
  );
}
