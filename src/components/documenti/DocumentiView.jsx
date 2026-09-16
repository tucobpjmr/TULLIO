// src/components/documenti/DocumentiView.jsx
// L'archivio dei documenti di identità: elenco, ricerca, filtro per scadenza,
// caricamento singolo e import massivo.
//
// ─── PERCHÉ UNA SEZIONE A SÉ E NON UNA TAB DELL'ANAGRAFICA ──────────────────
// Perché un passeggero non è per forza un cliente: chi viaggia insieme al
// titolare della pratica spesso non ha una riga in `clients`, e legare
// l'archivio all'anagrafica avrebbe reso obbligatorio creare una scheda
// cliente per poter archiviare un documento. `documenti_identita.client_id`
// esiste comunque, facoltativo, per quando la scheda c'è.
//
// ─── LA RICERCA È IN MEMORIA, E FINO A QUANDO ───────────────────────────────
// Stesso modello dell'anagrafica prima di A-1 (audit del 30 agosto): l'elenco
// si scarica intero e si filtra qui con `searchUtils`, che è corretto sotto le
// qualche migliaio di righe. L'archivio nasce a ~1000 documenti e cresce
// quanto crescono i passeggeri, quindi il soffitto è lontano — ma è lo stesso
// soffitto, e quando si avvicinerà la risposta è già scritta: una RPC di
// ricerca come `cerca_clienti`, con la stessa normalizzazione lato database.
import { useState, useMemo } from "react";
import { useDocumenti } from "./useDocumenti.js";
import { DocumentoCard } from "./DocumentoCard.jsx";
import { DocumentoModal } from "./DocumentoModal.jsx";
import { CaricaDocumentoModal } from "./CaricaDocumentoModal.jsx";
import { ImportDocumentiModal } from "./ImportDocumentiModal.jsx";
import { FILTRI_SCADENZA, filtraPerScadenza, statoScadenza } from "./scadenze.js";
import { etichettaTipo } from "./documentiModello.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useDispatch } from "../../state/DispatchContext.jsx";
import { useFinestra } from "../../hooks/useFinestra.js";
import { MostraAltri } from "../ui/MostraAltri.jsx";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";
import { terminiRicerca, indicizza, matchIndice } from "../../lib/searchUtils.js";
import { btn } from "../../styles/tokens.js";
import * as stiliComuni from "../../styles/common.js";
import {
  contenitore, testata, titolo, sottotitoloTestata, azioniTestata,
  campoRicerca, chip, chipAttivo, griglia, contatore,
} from "./documentiStyles.js";

// Quante schede per volta, come l'anagrafica: 24 riempie tre file sulla
// griglia desktop e una schermata piena su mobile.
const PAGINA = 24;

// I due overlay sono mutuamente esclusivi per costruzione: uno stato solo
// invece di due booleani indipendenti, che ammetterebbero la combinazione
// "entrambi aperti" che nessun handler produce (B-3 dell'audit del 15 agosto).
const NESSUN_OVERLAY = null;

export function DocumentiView() {
  const { io, currentUserId } = useAppData();
  const dispatch = useDispatch();
  const abilitato = io.accedeDocumenti();
  const { documenti, caricamento, erroreCaricamento, aggiungi, aggiorna, elimina } =
    useDocumenti({ enabled: abilitato });

  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState("tutti");
  const [overlay, setOverlay] = useState(/** @type {'nuovo'|'import'|null} */ (NESSUN_OVERLAY));
  const [aperto, setAperto] = useState(/** @type {object|null} */ (null));

  // `oggi` una volta per render e non dentro ogni confronto: `statoScadenza` è
  // chiamata una volta per documento dal filtro e una dalla scheda, e con
  // ~1000 righe sarebbero duemila `new Date()` per battuta digitata.
  const oggi = useMemo(() => new Date(), []);

  // L'indice si ricalcola quando cambiano i DOCUMENTI, non quando cambia la
  // query: è la correzione di M-3 (audit del 16 agosto, secondo passaggio) —
  // normalizzare i campi a ogni battuta costava il 97% del tempo di filtro.
  const indicizzati = useMemo(
    () => documenti.map((d) => ({ documento: d, idx: indicizza(d.passeggero, d.numero, etichettaTipo(d.tipo)) })),
    [documenti],
  );

  const filtrati = useMemo(() => {
    const termini = terminiRicerca(query);
    const perTesto = termini.length
      ? indicizzati.filter((r) => matchIndice(termini, r.idx)).map((r) => r.documento)
      : documenti;
    return filtraPerScadenza(perTesto, filtro, oggi);
  }, [indicizzati, documenti, query, filtro, oggi]);

  const finestra = useFinestra(filtrati, PAGINA, [query, filtro]);

  // Il conteggio dei documenti da rinnovare vive nella testata perché è la
  // ragione per cui l'archivio si apre senza che nessuno l'abbia chiesto.
  const daRinnovare = useMemo(
    () => documenti.filter((d) => ["scaduto", "inScadenza"].includes(statoScadenza(d, oggi))).length,
    [documenti, oggi],
  );

  const avvisa = (message, type = "error") =>
    dispatch({ type: "SHOW_TOAST", payload: { message, type } });

  const caricaUno = (blob, nomeFile, meta) => aggiungi(blob, nomeFile, meta, currentUserId);

  const salva = async (id, patch) => {
    const { error } = await aggiorna(id, patch);
    if (error) { avvisa(error.message); return; }
    avvisa("Documento aggiornato", "success");
    setAperto(null);
  };

  const rimuovi = async (documento) => {
    const { error } = await elimina(documento);
    if (error) { avvisa(error.message); return; }
    avvisa("Documento eliminato", "success");
    setAperto(null);
  };

  const fineImport = (esito) => {
    if (esito.caricati > 0) {
      avvisa(`${esito.caricati} documenti importati`, "success");
    }
    if (esito.falliti.length > 0) {
      avvisa(`${esito.falliti.length} documenti non caricati`, "warning");
    }
  };

  if (!abilitato) {
    return (
      <div style={contenitore}>
        <div style={stiliComuni.cardVuota}>L&apos;archivio documenti non è disponibile per il tuo ruolo.</div>
      </div>
    );
  }

  return (
    <div style={contenitore}>
      <div style={testata}>
        <div>
          <h1 className="playfair" style={titolo}>Documenti</h1>
          <div style={sottotitoloTestata}>
            {documenti.length} documenti in archivio
            {daRinnovare > 0 && ` · ${daRinnovare} da rinnovare`}
          </div>
        </div>
        <div style={azioniTestata}>
          <button type="button" style={btn.ghost} onClick={() => setOverlay("import")}>Importa</button>
          <button type="button" style={btn.primary} onClick={() => setOverlay("nuovo")}>Nuovo documento</button>
        </div>
      </div>

      <div style={stiliComuni.rowFiltri}>
        <input
          style={campoRicerca}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome o numero documento"
          aria-label="Cerca nei documenti"
        />
        {FILTRI_SCADENZA.map((f) => (
          <button
            key={f.chiave}
            type="button"
            style={filtro === f.chiave ? chipAttivo : chip}
            onClick={() => setFiltro(f.chiave)}
            aria-pressed={filtro === f.chiave}
          >
            {f.etichetta}
          </button>
        ))}
      </div>

      {caricamento && <SkeletonCards count={6} minWidth={300} label="Caricamento dell'archivio documenti" />}

      {!caricamento && erroreCaricamento && (
        <div style={stiliComuni.cardVuota}>{erroreCaricamento}</div>
      )}

      {!caricamento && !erroreCaricamento && filtrati.length === 0 && (
        <div style={stiliComuni.cardVuota}>
          {documenti.length === 0
            ? "Nessun documento in archivio. Usa «Importa» per caricare una cartella intera."
            : "Nessun documento corrisponde alla ricerca."}
        </div>
      )}

      {!caricamento && filtrati.length > 0 && (
        <>
          <div style={griglia}>
            {finestra.visibili.map((d) => (
              <DocumentoCard key={d.id} documento={d} oggi={oggi} onApri={setAperto} />
            ))}
          </div>
          <div style={contatore}>
            <MostraAltri
              finestra={finestra}
              azione={`Mostra altri ${Math.min(finestra.passo, finestra.restanti)}`}
              conteggio={`${finestra.visibili.length} di ${finestra.totale}`}
            />
          </div>
        </>
      )}

      {aperto && (
        <DocumentoModal
          documento={aperto}
          oggi={oggi}
          puoEliminare={io.eliminaDocumento(aperto)}
          onChiudi={() => setAperto(null)}
          onSalva={salva}
          onElimina={rimuovi}
        />
      )}

      {overlay === "nuovo" && (
        <CaricaDocumentoModal onChiudi={() => setOverlay(NESSUN_OVERLAY)} onCarica={caricaUno} />
      )}

      {overlay === "import" && (
        <ImportDocumentiModal
          onChiudi={() => setOverlay(NESSUN_OVERLAY)}
          onCarica={caricaUno}
          onFatto={fineImport}
        />
      )}
    </div>
  );
}
