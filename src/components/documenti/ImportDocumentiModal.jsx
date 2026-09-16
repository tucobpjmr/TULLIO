// src/components/documenti/ImportDocumentiModal.jsx
// Import massivo: si sceglie una cartella, si controlla l'anteprima, si carica.
//
// ─── L'ANTEPRIMA NON È UNA CORTESIA ─────────────────────────────────────────
// `nomeDaFile` DEDUCE il nome del passeggero da come il file è chiamato, e la
// deduzione sbaglia sui file che una fotocamera ha nominato da sé. Su mille
// file, scoprirlo dopo il caricamento significa correggere mille righe una per
// una nell'archivio; scoprirlo prima significa correggerne dieci in una
// tabella. Per questo il passaggio dall'anteprima non è saltabile, e le righe
// senza nome riconosciuto sono evidenziate e bloccano il pulsante finché non
// vengono completate.
import { useState, useMemo, useRef } from "react";
import { Modal } from "../ui/Modal.jsx";
import { analizzaFile } from "./nomeDaFile.js";
import { importaDocumenti } from "./importaDocumenti.js";
import { comprimiSePossibile } from "../../lib/comprimiImmagine.js";
import { TIPI_DOCUMENTO, TIPO_PREDEFINITO } from "./documentiModello.js";
import { formatFileSize } from "../../lib/fileUtils.js";
import { btn } from "../../styles/tokens.js";
import * as stiliComuni from "../../styles/common.js";
import {
  zonaFile, tabellaImport, corpoScorrevole, cellaNome, campoNomeRiga,
  rigaDaCompletare, riepilogo, barraAvanzamento, riquadroAvviso, campo, etichetta,
} from "./documentiStyles.js";

// Oltre questa soglia l'import avvisa invece di partire in silenzio. Non è un
// divieto: è il numero oltre il quale «ho selezionato la cartella sbagliata» è
// più probabile di «ho davvero questi file da caricare».
const SOGLIA_AVVISO = 1200;

export function ImportDocumentiModal({ onChiudi, onCarica, onFatto }) {
  const [righe, setRighe] = useState(/** @type {object[]} */ ([]));
  const [tipo, setTipo] = useState(TIPO_PREDEFINITO);
  const [avanzamento, setAvanzamento] = useState(/** @type {{fatti: number, totale: number}|null} */ (null));
  const [esito, setEsito] = useState(/** @type {object|null} */ (null));
  // Ref e non stato: l'annullamento viene letto da `importaDocumenti` fra un
  // blocco e l'altro, cioè fuori dal ciclo di render — uno `useState` qui
  // darebbe al ciclo in corso il valore catturato alla partenza.
  const annullaRef = useRef(false);
  // Input nascosti pilotati da due pulsanti veri, come TaskAttachments e
  // MessageComposer: un `<label>` attorno a un input `display:none` si clicca
  // col mouse ma non si raggiunge con il Tab, e nessuno dei due elementi
  // resta focalizzabile.
  const cartellaRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null));

  const scegli = (e) => {
    setRighe(analizzaFile(e.target.files));
    setEsito(null);
    // Azzerare il valore permette di riselezionare la STESSA cartella dopo
    // aver chiuso e riaperto: senza, il secondo `change` non scatta.
    e.target.value = "";
  };

  const rinomina = (indice) => (e) => {
    const passeggero = e.target.value;
    setRighe((prec) => prec.map((r, i) => (i === indice ? { ...r, passeggero, riconosciuto: true } : r)));
  };

  const daCompletare = useMemo(
    () => righe.filter((r) => !String(r.passeggero || "").trim()).length,
    [righe],
  );
  const pesoTotale = useMemo(
    () => righe.reduce((s, r) => s + (r.file?.size || 0), 0),
    [righe],
  );

  const avvia = async () => {
    annullaRef.current = false;
    setAvanzamento({ fatti: 0, totale: righe.length });
    const risultato = await importaDocumenti(righe, {
      comprimi: comprimiSePossibile,
      carica: onCarica,
      metaComuni: { tipo },
      onProgresso: (fatti, totale) => setAvanzamento({ fatti, totale }),
      annullato: () => annullaRef.current,
    });
    setAvanzamento(null);
    setEsito(risultato);
    onFatto?.(risultato);
  };

  const inCorso = avanzamento !== null;
  const percentuale = inCorso && avanzamento.totale
    ? Math.round((avanzamento.fatti / avanzamento.totale) * 100) : 0;
  const stileAvanzamento = { width: `${percentuale}%`, height: "100%", background: "var(--navy)" };

  return (
    <Modal open onClose={inCorso ? () => {} : onChiudi} labelledBy="vd-import-doc-titolo" width={720}>
      <div style={stiliComuni.testataModale}>
        <h2 id="vd-import-doc-titolo" style={stiliComuni.txtHeadingMb16}>Importa documenti</h2>
        {!inCorso && (
          <button type="button" style={stiliComuni.btnChiudi} onClick={onChiudi} aria-label="Chiudi">✕</button>
        )}
      </div>

      {righe.length === 0 && (
        <div style={zonaFile}>
          <p>Seleziona la cartella con i documenti, oppure i singoli file.</p>
          <p style={stiliComuni.txtF12Muted}>
            I file nominati <strong>COGNOME_NOME.jpg</strong> vengono riconosciuti da soli.
          </p>
          <div style={stiliComuni.rowGap8Mt20}>
            {/* `webkitdirectory` non è standard ma è implementato da tutti i
                browser desktop; l'input per i singoli file resta accanto,
                perché su iOS e Android la scelta di una cartella non esiste. */}
            <input ref={cartellaRef} type="file" webkitdirectory="" directory=""
                   multiple onChange={scegli} style={stiliComuni.hidden} tabIndex={-1} />
            <input ref={fileRef} type="file" multiple accept="image/*,application/pdf"
                   onChange={scegli} style={stiliComuni.hidden} tabIndex={-1} />
            <button type="button" style={btn.primary} onClick={() => cartellaRef.current?.click()}>
              Scegli la cartella
            </button>
            <button type="button" style={btn.ghost} onClick={() => fileRef.current?.click()}>
              Scegli i file
            </button>
          </div>
        </div>
      )}

      {righe.length > 0 && !esito && (
        <>
          <div style={stiliComuni.rowCenterGap12}>
            <div>
              <label htmlFor="vd-import-tipo" style={etichetta}>Tipo per tutti i documenti</label>
              <select id="vd-import-tipo" style={campo} value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={inCorso}>
                {TIPI_DOCUMENTO.map((t) => <option key={t.valore} value={t.valore}>{t.etichetta}</option>)}
              </select>
            </div>
            <div style={stiliComuni.txtF12Muted}>
              {righe.length} file · {formatFileSize(pesoTotale)} da comprimere
            </div>
          </div>

          {righe.length > SOGLIA_AVVISO && (
            <div style={riquadroAvviso}>
              Hai selezionato {righe.length} file: più del previsto per questo archivio.
              Controlla di aver scelto la cartella giusta prima di procedere.
            </div>
          )}
          {daCompletare > 0 && (
            <div style={riquadroAvviso}>
              {daCompletare} file su {righe.length} non hanno un nome riconoscibile: nell&apos;elenco
              qui sotto sono le righe con lo sfondo grigio. Completale prima di caricare.
            </div>
          )}

          <div style={corpoScorrevole}>
            <table style={tabellaImport}>
              <thead>
                <tr style={stiliComuni.rigaIntestazione}>
                  <th style={cellaNome}>File</th>
                  <th style={cellaNome}>Passeggero</th>
                  <th style={cellaNome}>Peso</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r, i) => (
                  <tr key={`${r.file.name}-${i}`} style={r.riconosciuto ? undefined : rigaDaCompletare}>
                    <td style={cellaNome}>{r.file.name}</td>
                    <td style={cellaNome}>
                      <input
                        style={campoNomeRiga}
                        value={r.passeggero}
                        onChange={rinomina(i)}
                        disabled={inCorso}
                        aria-label={`Passeggero per ${r.file.name}`}
                      />
                    </td>
                    <td style={cellaNome}>{formatFileSize(r.file.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {inCorso && (
            <>
              <div style={barraAvanzamento}><div style={stileAvanzamento} /></div>
              <div style={riepilogo}>
                Caricati {avanzamento.fatti} di {avanzamento.totale}. Non chiudere la finestra.
              </div>
            </>
          )}

          <div style={stiliComuni.rowGap8Mt20}>
            {inCorso
              ? <button type="button" style={btn.ghost} onClick={() => { annullaRef.current = true; }}>Interrompi</button>
              : <button type="button" style={btn.ghost} onClick={onChiudi}>Annulla</button>}
            <button type="button" style={btn.primary} onClick={avvia} disabled={inCorso || daCompletare > 0}>
              {inCorso ? "Caricamento…" : `Carica ${righe.length} documenti`}
            </button>
          </div>
        </>
      )}

      {esito && (
        <div style={riepilogo}>
          <p><strong>{esito.caricati}</strong> documenti caricati{esito.interrotto ? " (import interrotto)" : ""}.</p>
          {esito.byteRisparmiati > 0 && (
            <p>Spazio risparmiato dalla compressione: {formatFileSize(esito.byteRisparmiati)}.</p>
          )}
          {esito.falliti.length > 0 && (
            <>
              <p><strong>{esito.falliti.length} non caricati:</strong></p>
              <ul>
                {esito.falliti.slice(0, 20).map((f) => (
                  <li key={f.nomeFile}>{f.nomeFile} — {f.motivo}</li>
                ))}
              </ul>
              {esito.falliti.length > 20 && <p>…e altri {esito.falliti.length - 20}.</p>}
            </>
          )}
          <div style={stiliComuni.rowGap8Mt20}>
            <button type="button" style={btn.primary} onClick={onChiudi}>Chiudi</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
