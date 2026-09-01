// ─── IMPORT ANAGRAFICA CLIENTI DA EXCEL/CSV ────────────────────────────────
// Permette all'admin di importare in blocco clienti già presenti su un altro
// gestionale (es. export "Anagrafica" di un CRM legacy per agenzie viaggi).
// Riusa l'infrastruttura hardened di lettura file (limite dimensione + guard
// anti prototype-pollution) già usata dall'import task in BulkTaskCreator,
// ma con auto-detect della riga di intestazione: questi export spesso hanno
// righe di titolo/metadati (es. "Esportazione del : ...") prima della vera
// intestazione, che romperebbero l'assunzione "riga 0 = header".
import { useState, useReducer, useRef, useMemo, useEffect } from "react";
import { useViewport } from "../ui/Viewport.jsx";
import { readFirstSheetRowsAutoHeader, MAX_IMPORT_BYTES } from "../../lib/xlsx.js";
import { formatFileSize } from "../../lib/fileUtils.js";
// M-4 (25 agosto): la deduplica dell'import usa LA chiave d'identità cliente,
// non una `normName` locale che la punteggiatura faceva divergere dalle altre.
import { chiaveCliente } from "../../lib/chiaveCliente.js";
import { Modal } from "../ui/Modal.jsx";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import { attivaConTastiera } from "../../lib/a11y.js";
import * as stiliComuni from "../../styles/common.js";
import {
  boxF125Warning, boxF13Danger, boxF14White, boxF95Bold, boxR8, boxTxtCenterR12, boxW8H8,
  colFlex1Gap14, cursor2, mt2, rowCenterBetween, rowCenterBetween2, rowCenterBetween3,
  rowCenterBetween4, rowCenterBetween5, rowCenterGap5, rowCenterGap6, rowCenterMiddle, rowGap6,
  rowStartGap8, txtF105Muted, txtF10Bold, txtF10Bold2, txtF10Mt2, txtF115Bold, txtF125Muted,
  txtF14Bold, txtF17Bold, txtF40Mb10, txtSuccess, txtText,
} from "./clientImportModalStyles.js";

const inputStyle = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 6,
  padding: "7px 9px", fontSize: 12.5, fontFamily: "inherit",
  background: "var(--card)", outline: "none", minWidth: 0, boxSizing: "border-box",
};
const btnPrimary = {
  background: "var(--navy)", color: "#fff", border: "none",
  padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const btnGhost = {
  background: "transparent", border: "1px solid var(--border)",
  padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500,
};

// Parole chiave cercate nell'intestazione per individuare la riga header
// (vedi detectHeaderRowIndex in lib/xlsx.js) — servono anche gli export
// italiani tipici di gestionali per agenzie viaggi.
const HEADER_HINTS = [
  "nome", "ragionesociale", "ragione sociale", "nominativo", "titolo",
  "email", "mail", "telefono", "cellulare", "citta", "città", "indirizzo",
  "codicefiscale", "codice fiscale", "cap", "name", "phone", "city", "address",
];

// Valori "booleani" tipici delle colonne-flag (Si/No, 0/1...) di questi
// export: una colonna i cui valori campionati sono tutti così NON è un buon
// candidato per il nome/altri campi testuali, anche se il suo header contiene
// una parola chiave (es. la colonna "Cliente" con Si/No, distinta dal vero
// nome che sta in "RagioneSociale").
const BOOLEAN_LIKE = new Set(["si", "sì", "no", "yes", "y", "n", "0", "1", "true", "false", "x"]);
const looksBoolean = (col, rows) => {
  const samples = rows.slice(0, 30).map(r => String(r[col] ?? "").trim().toLowerCase()).filter(Boolean);
  return samples.length > 0 && samples.every(v => BOOLEAN_LIKE.has(v));
};
const normKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// Sceglie la colonna migliore per un campo dato un elenco di parole chiave in
// ordine di priorità: prima match esatti (evitando le colonne-flag), poi
// substring (evitando le colonne-flag), infine substring senza esclusioni.
const pickBestColumn = (columns, rows, keywords) => {
  const normKeywords = keywords.map(normKey);
  for (const kw of normKeywords) {
    const exact = columns.find(c => normKey(c) === kw && !looksBoolean(c, rows));
    if (exact) return exact;
  }
  for (const kw of normKeywords) {
    const sub = columns.find(c => normKey(c).includes(kw) && !looksBoolean(c, rows));
    if (sub) return sub;
  }
  for (const kw of normKeywords) {
    const any = columns.find(c => normKey(c).includes(kw));
    if (any) return any;
  }
  return "";
};

const FIELD_KEYWORDS = {
  name: ["ragionesociale", "nominativo", "nomeecognome", "denominazione", "nome", "name", "cliente"],
  email: ["email", "mail", "pec"],
  phone: ["cellulare", "cell", "telefono1", "telefono", "phone"],
  address: ["indirizzo", "address", "via"],
  city: ["citta", "città", "city", "comune"],
  notes: ["note", "annotazioni", "notes"],
};

// Colonne "extra" da ripiegare automaticamente nelle Note (se non già usate
// come campo primario): dati identificativi/fiscali comuni ai gestionali di
// agenzie viaggi, utili da conservare ma senza un campo dedicato in anagrafica.
const EXTRA_FIELD_KEYWORDS = [
  "codicefiscale", "partitaiva", "cap", "provincia", "regione", "nazione",
  "nascita", "cartaidentit", "documento", "passaporto", "patente",
  "familiari", "fax", "pec", "telefono", "cellulare", "email",
];

const prettifyHeader = (h) => String(h).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();

// ─── B-3 (audit di architettura del 15 agosto) · un solo stato, transizioni
// nominate ────────────────────────────────────────────────────────────────
// Questo componente coordinava NOVE `useState` indipendenti, e le transizioni
// valide non erano descritte da nessuna parte: erano l'intersezione implicita
// di nove `setX` sparsi negli handler. Il difetto non è teorico ed era già
// visibile — `handleFile` scriveva il nome del file nuovo senza azzerare
// righe, colonne, mappatura e selezione del precedente, quindi un secondo file
// illeggibile lasciava a schermo i dati del PRIMO sotto il nome del SECONDO,
// pronti per essere importati. Nessuno dei nove setter era sbagliato; mancava
// il posto in cui dire che "scegliere un file" è UNA transizione.
//
// `foldExtras` resta fuori di proposito: non è uno stato di questo flusso, è
// una preferenza dell'utente sulla composizione delle note, e deve
// sopravvivere al cambio di file esattamente come sopravvive a un ordinamento.
const IMPORT_INIZIALE = {
  fileName: "", rows: [], columns: [], mapping: {}, autoDetected: {},
  error: null, search: "", selected: {},
};

function importReducer(s, a) {
  switch (a.type) {
    // La transizione che mancava: un file nuovo azzera TUTTO ciò che
    // descriveva il precedente, e lascia in piedi solo il proprio nome.
    case "FILE_SCELTO":  return { ...IMPORT_INIZIALE, fileName: a.fileName };
    case "FILE_RIFIUTATO": return { ...IMPORT_INIZIALE, error: a.messaggio };
    case "FILE_LETTO":   return { ...s, rows: a.rows, columns: a.columns, mapping: a.mapping, autoDetected: a.autoDetected, error: null };
    case "ERRORE":       return { ...s, error: a.messaggio };
    // Mappare a mano una colonna toglie il marcatore "riconosciuta
    // automaticamente" da QUEL campo: erano due setState che andavano insieme.
    case "MAPPA":        return { ...s, mapping: { ...s.mapping, [a.campo]: a.colonna },
                                  autoDetected: { ...s.autoDetected, [a.campo]: false } };
    case "CERCA":        return { ...s, search: a.testo };
    case "SELEZIONE":    return { ...s, selected: a.selected };
    case "AZZERA":       return IMPORT_INIZIALE;
    default:             return s;
  }
}

export const ClientImportModal = ({ existingClients = [], onImport, onClose }) => {
  const conferma = useConfirm();
  const { isMobile } = useViewport();
  const [imp, impDispatch] = useReducer(importReducer, IMPORT_INIZIALE);
  const { fileName, rows, columns, mapping, autoDetected, error, search, selected } = imp;
  const [foldExtras, setFoldExtras] = useState(true);
  const fileInputRef = useRef(null);

  const existingNames = useMemo(
    () => new Set(existingClients.map(c => chiaveCliente(c.name))),
    [existingClients]
  );

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Come in ImportTab: il limite dentro readFirstSheetRowsAutoHeader scatta
    // solo dopo che FileReader ha già caricato l'intero file in memoria.
    // file.size è sincrono, quindi il rifiuto arriva prima di qualunque lettura.
    if (file.size > MAX_IMPORT_BYTES) {
      impDispatch({ type: "FILE_RIFIUTATO", messaggio: `File troppo grande (${formatFileSize(file.size)}, max ${formatFileSize(MAX_IMPORT_BYTES)}).` });
      e.target.value = "";
      return;
    }
    // Azzera e nomina in un colpo solo: se la lettura fallisce (file vuoto,
    // formato illeggibile) a schermo non resta l'anteprima del file di prima.
    impDispatch({ type: "FILE_SCELTO", fileName: file.name });
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const { rows: json, columns: cols } = await readFirstSheetRowsAutoHeader(evt.target.result, HEADER_HINTS);
        if (!json.length) { impDispatch({ type: "ERRORE", messaggio: "Il file è vuoto o non contiene righe leggibili." }); return; }
        const auto = {
          name: pickBestColumn(cols, json, FIELD_KEYWORDS.name),
          email: pickBestColumn(cols, json, FIELD_KEYWORDS.email),
          phone: pickBestColumn(cols, json, FIELD_KEYWORDS.phone),
          address: pickBestColumn(cols, json, FIELD_KEYWORDS.address),
          city: pickBestColumn(cols, json, FIELD_KEYWORDS.city),
          notes: pickBestColumn(cols, json, FIELD_KEYWORDS.notes),
        };
        impDispatch({
          type: "FILE_LETTO",
          rows: json,
          columns: cols,
          mapping: auto,
          autoDetected: Object.fromEntries(Object.entries(auto).filter(([, v]) => v).map(([k]) => [k, true])),
        });
      } catch (err) {
        impDispatch({ type: "ERRORE", messaggio: "Impossibile leggere il file: " + err.message });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const reset = () => impDispatch({ type: "AZZERA" });

  // Colonne non mappate come campo primario, riconosciute come dati
  // identificativi utili: ripiegate nelle Note se foldExtras è attivo.
  const extraColumns = useMemo(() => {
    const used = new Set(Object.values(mapping).filter(Boolean));
    return columns.filter(c => !used.has(c) && EXTRA_FIELD_KEYWORDS.some(kw => normKey(c).includes(kw)));
  }, [columns, mapping]);

  const buildNotes = (r) => {
    const parts = [];
    if (mapping.notes) {
      const v = String(r[mapping.notes] || "").trim();
      if (v) parts.push(v);
    }
    if (foldExtras) {
      for (const c of extraColumns) {
        const v = String(r[c] ?? "").trim();
        if (v) parts.push(`${prettifyHeader(c)}: ${v}`);
      }
    }
    return parts.join("\n") || null;
  };

  // Righe con un nome valorizzato, arricchite con chiave stabile, duplicato
  // rilevato (stesso nome normalizzato già in anagrafica) e note "come
  // verranno create" — usate sia per l'anteprima che per l'import vero.
  const candidates = useMemo(() => {
    if (!mapping.name) return [];
    return rows.map((r, idx) => {
      const name = String(r[mapping.name] || "").trim();
      if (!name) return null;
      return {
        key: String(idx),
        name,
        email: mapping.email ? (String(r[mapping.email] || "").trim() || null) : null,
        phone: mapping.phone ? (String(r[mapping.phone] || "").trim() || null) : null,
        address: mapping.address ? (String(r[mapping.address] || "").trim() || null) : null,
        city: mapping.city ? (String(r[mapping.city] || "").trim() || null) : null,
        notes: buildNotes(r),
        isDuplicate: existingNames.has(chiaveCliente(name)),
      };
    }).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mapping, existingNames, foldExtras, extraColumns]);

  // Selezione di default: tutte le righe valide tranne i probabili duplicati
  // (già in anagrafica con lo stesso nome) — l'admin può comunque spuntarli.
  useEffect(() => {
    impDispatch({ type: "SELEZIONE", selected: Object.fromEntries(candidates.map(c => [c.key, !c.isDuplicate])) });
  }, [candidates.length, mapping.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const duplicateCount = candidates.filter(c => c.isDuplicate).length;
  const selectedCount = candidates.filter(c => selected[c.key]).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(c =>
      c.name.toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q)
    );
  }, [candidates, search]);

  const apriSelezioneFile = () => fileInputRef.current?.click();

  const toggle = (key) => impDispatch({ type: "SELEZIONE", selected: { ...selected, [key]: !selected[key] } });
  const selectAll = () => impDispatch({ type: "SELEZIONE", selected: Object.fromEntries(candidates.map(c => [c.key, true])) });
  const selectNone = () => impDispatch({ type: "SELEZIONE", selected: {} });

  const handleImport = () => {
    const toImport = candidates.filter(c => selected[c.key]);
    if (!toImport.length) return;
    const now = new Date().toISOString();
    onImport(toImport.map(c => ({
      id: crypto.randomUUID(),
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      notes: c.notes,
      createdAt: now,
    })));
    onClose();
  };

  const fields = [
    { key: "name", label: "Nome *" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Telefono" },
    { key: "address", label: "Indirizzo" },
    { key: "city", label: "Città" },
    { key: "notes", label: "Note" },
  ];

  const isDirty = rows.length > 0;
  const requestClose = async () => {
    if (isDirty) {
      const ok = await conferma({
        title: "Chiudere senza importare?",
        body: "Il file caricato non è ancora stato importato: chiudendo va perso.",
        cta: "Chiudi e perdi", danger: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal
      open onClose={requestClose} labelledBy="import-clienti-title"
      width={820} padding={20} layer="modalFull"
      cardStyle={{ borderRadius: 16, display: "flex", flexDirection: "column", overflow: "stiliComuni.hidden" }}
    >
      <>
        <div style={rowCenterBetween}>
          <div style={stiliComuni.rowCenterGap12}>
            <div style={rowCenterMiddle}>📥</div>
            <div>
              <div id="import-clienti-title" className="playfair" style={txtF17Bold}>Importa anagrafica clienti</div>
              <div style={txtF10Mt2}>DA CSV, EXCEL O EXPORT DI UN ALTRO GESTIONALE</div>
            </div>
          </div>
          <button onClick={requestClose} style={boxF14White}>✕</button>
        </div>

        <div style={colFlex1Gap14}>
          {!rows.length && (
            <div
              role="button" tabIndex={0}
              onClick={apriSelezioneFile} onKeyDown={attivaConTastiera(apriSelezioneFile)}
              style={boxTxtCenterR12}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.background = "rgba(212,168,67,0.04)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
            >
              <div style={txtF40Mb10}>📄</div>
              <div style={txtF14Bold}>Clicca per caricare il file dell'anagrafica</div>
              <div style={stiliComuni.txtF12Muted}>
                Formati supportati: .csv, .xlsx, .xls — anche export di altri gestionali con righe di intestazione non in prima posizione
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={stiliComuni.hidden} />
            </div>
          )}

          {error && (
            <div style={boxF13Danger}>
              ⚠️ {error}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div style={rowCenterBetween2}>
                <div style={stiliComuni.txtF13}>📄 <strong>{fileName}</strong> — {rows.length} righe, {columns.length} colonne</div>
                <button onClick={reset} style={stiliComuni.btnOutlineMini}>Cambia file</button>
              </div>

              <div>
                <div style={rowCenterBetween3}>
                  <div style={txtF10Bold}>MAPPATURA COLONNE</div>
                  <div style={rowCenterGap5}>
                    <span style={boxW8H8} />
                    rilevato automaticamente — verifica
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8 }}>
                  {fields.map(f => {
                    const isAuto = autoDetected[f.key] && mapping[f.key];
                    return (
                      <div key={f.key}>
                        <div style={txtF10Bold2}>
                          {f.label}{isAuto && <span style={txtSuccess}>✓</span>}
                        </div>
                        <select
                          value={mapping[f.key] || ""}
                          onChange={e => impDispatch({ type: "MAPPA", campo: f.key, colonna: e.target.value })}
                          style={{
                            ...inputStyle,
                            borderColor: isAuto ? "var(--success)" : "var(--border)",
                            background: isAuto ? "rgba(45,122,79,0.05)" : "var(--card)",
                          }}
                        >
                          <option value="">— non mappato —</option>
                          {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {extraColumns.length > 0 && (
                <label style={rowStartGap8}>
                  <input type="checkbox" checked={foldExtras} onChange={e => setFoldExtras(e.target.checked)} style={mt2} />
                  <span>
                    <strong style={txtText}>Aggiungi alle Note le altre {extraColumns.length} colonne riconosciute</strong> (codice fiscale, data di nascita, documenti, CAP/provincia…): {extraColumns.slice(0, 6).map(prettifyHeader).join(", ")}{extraColumns.length > 6 ? "…" : ""}
                  </span>
                </label>
              )}

              {!mapping.name && (
                <div style={boxF125Warning}>
                  ⚠️ Mappa la colonna del <strong>Nome</strong> per generare l'anteprima dei clienti da importare.
                </div>
              )}

              {mapping.name && (
                <div>
                  <div style={rowCenterBetween4}>
                    <div style={txtF10Bold}>
                      ANTEPRIMA — {selectedCount} DI {candidates.length} SELEZIONATI PER L'IMPORT
                    </div>
                    <div style={rowGap6}>
                      <button onClick={selectAll} style={{ ...btnGhost, padding: "4px 10px", fontSize: 11 }}>Seleziona tutti</button>
                      <button onClick={selectNone} style={{ ...btnGhost, padding: "4px 10px", fontSize: 11 }}>Deseleziona tutti</button>
                    </div>
                  </div>
                  {duplicateCount > 0 && (
                    <div style={txtF115Bold}>
                      ⚠ {duplicateCount} client{duplicateCount === 1 ? "e" : "i"} risult{duplicateCount === 1 ? "a" : "ano"} già in anagrafica (stesso nome) e {duplicateCount === 1 ? "non è" : "non sono"} selezionat{duplicateCount === 1 ? "o" : "i"} di default.
                    </div>
                  )}
                  <input
                    value={search}
                    onChange={e => impDispatch({ type: "CERCA", testo: e.target.value })}
                    placeholder="🔍 Filtra per nome o città…"
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  <div style={boxR8}>
                    {filtered.length === 0 ? (
                      <div style={txtF125Muted}>Nessun risultato</div>
                    ) : filtered.map(c => {
                      const toggleQuesto = () => toggle(c.key);
                      return (
                      <div key={c.key}
                        role="button" tabIndex={0}
                        onClick={toggleQuesto} onKeyDown={attivaConTastiera(toggleQuesto)}
                        style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        borderBottom: "1px solid var(--border)", cursor: "pointer",
                        background: selected[c.key] ? "rgba(212,168,67,0.06)" : "transparent",
                      }}>
                        <input type="checkbox" checked={!!selected[c.key]} readOnly style={cursor2} />
                        <div className="vd-flex-1-min0">
                          <div style={rowCenterGap6}>
                            {c.name}
                            {c.isDuplicate && (
                              <span style={boxF95Bold}>già presente</span>
                            )}
                          </div>
                          <div style={txtF105Muted}>
                            {[c.city, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div style={rowCenterBetween5}>
          <div style={stiliComuni.txtF12Muted}>{selectedCount} client{selectedCount === 1 ? "e" : "i"} da importare</div>
          <div style={stiliComuni.rowGap8}>
            <button onClick={requestClose} style={btnGhost}>Annulla</button>
            <button onClick={handleImport} disabled={selectedCount === 0} style={{
              ...btnPrimary, opacity: selectedCount === 0 ? 0.5 : 1, cursor: selectedCount === 0 ? "not-allowed" : "pointer",
            }}>✓ Importa {selectedCount} client{selectedCount === 1 ? "e" : "i"}</button>
          </div>
        </div>
      </>
    </Modal>
  );
};
