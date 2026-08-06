// ─── IMPORT ANAGRAFICA CLIENTI DA EXCEL/CSV ────────────────────────────────
// Permette all'admin di importare in blocco clienti già presenti su un altro
// gestionale (es. export "Anagrafica" di un CRM legacy per agenzie viaggi).
// Riusa l'infrastruttura hardened di lettura file (limite dimensione + guard
// anti prototype-pollution) già usata dall'import task in BulkTaskCreator,
// ma con auto-detect della riga di intestazione: questi export spesso hanno
// righe di titolo/metadati (es. "Esportazione del : ...") prima della vera
// intestazione, che romperebbero l'assunzione "riga 0 = header".
import { useState, useRef, useMemo, useEffect } from "react";
import { useViewport } from "../Viewport.jsx";
import { readFirstSheetRowsAutoHeader, MAX_IMPORT_BYTES } from "../../lib/xlsx.js";
import { formatFileSize } from "../../lib/fileUtils.js";
import { Modal } from "../ui/Modal.jsx";

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

const DIACRITICS_RE = /[̀-ͯ]/g;
const normName = (s) => String(s || "")
  .toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "")
  .replace(/\s+/g, " ").trim();

export const ClientImportModal = ({ existingClients = [], onImport, onClose }) => {
  const { isMobile } = useViewport();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [autoDetected, setAutoDetected] = useState({});
  const [foldExtras, setFoldExtras] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState({}); // { rowKey: true }
  const fileInputRef = useRef(null);

  const existingNames = useMemo(
    () => new Set(existingClients.map(c => normName(c.name))),
    [existingClients]
  );

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Come in ImportTab: il limite dentro readFirstSheetRowsAutoHeader scatta
    // solo dopo che FileReader ha già caricato l'intero file in memoria.
    // file.size è sincrono, quindi il rifiuto arriva prima di qualunque lettura.
    if (file.size > MAX_IMPORT_BYTES) {
      setError(`File troppo grande (${formatFileSize(file.size)}, max ${formatFileSize(MAX_IMPORT_BYTES)}).`);
      e.target.value = "";
      return;
    }
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const { rows: json, columns: cols } = await readFirstSheetRowsAutoHeader(evt.target.result, HEADER_HINTS);
        if (!json.length) { setError("Il file è vuoto o non contiene righe leggibili."); return; }
        setRows(json); setColumns(cols);
        const auto = {
          name: pickBestColumn(cols, json, FIELD_KEYWORDS.name),
          email: pickBestColumn(cols, json, FIELD_KEYWORDS.email),
          phone: pickBestColumn(cols, json, FIELD_KEYWORDS.phone),
          address: pickBestColumn(cols, json, FIELD_KEYWORDS.address),
          city: pickBestColumn(cols, json, FIELD_KEYWORDS.city),
          notes: pickBestColumn(cols, json, FIELD_KEYWORDS.notes),
        };
        setMapping(auto);
        setAutoDetected(Object.fromEntries(Object.entries(auto).filter(([, v]) => v).map(([k]) => [k, true])));
      } catch (err) {
        setError("Impossibile leggere il file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const reset = () => {
    setRows([]); setColumns([]); setMapping({}); setAutoDetected({});
    setFileName(""); setError(null); setSelected({}); setSearch("");
  };

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
        isDuplicate: existingNames.has(normName(name)),
      };
    }).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mapping, existingNames, foldExtras, extraColumns]);

  // Selezione di default: tutte le righe valide tranne i probabili duplicati
  // (già in anagrafica con lo stesso nome) — l'admin può comunque spuntarli.
  useEffect(() => {
    setSelected(Object.fromEntries(candidates.map(c => [c.key, !c.isDuplicate])));
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

  const toggle = (key) => setSelected(s => ({ ...s, [key]: !s[key] }));
  const selectAll = () => setSelected(Object.fromEntries(candidates.map(c => [c.key, true])));
  const selectNone = () => setSelected({});

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
  const requestClose = () => {
    if (isDirty && !window.confirm("Il file caricato non è ancora stato importato. Vuoi chiudere e perderlo?")) return;
    onClose();
  };

  return (
    <Modal
      open onClose={requestClose} labelledBy="import-clienti-title"
      width={820} padding={20} layer="modalFull"
      cardStyle={{ borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <>
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📥</div>
            <div>
              <div id="import-clienti-title" className="playfair" style={{ color: "#fff", fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>Importa anagrafica clienti</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 1.2, marginTop: 2 }}>DA CSV, EXCEL O EXPORT DI UN ALTRO GESTIONALE</div>
            </div>
          </div>
          <button onClick={requestClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {!rows.length && (
            <div onClick={() => fileInputRef.current?.click()} style={{
              border: "2px dashed var(--border)", borderRadius: 12,
              padding: "40px 20px", textAlign: "center", cursor: "pointer", background: "var(--surface)",
              transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.background = "rgba(212,168,67,0.04)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
            >
              <div style={{ fontSize: 40, marginBottom: 10 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Clicca per caricare il file dell'anagrafica</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Formati supportati: .csv, .xlsx, .xls — anche export di altri gestionali con righe di intestazione non in prima posizione
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
            </div>
          )}

          {error && (
            <div style={{ background: "#FEE2E2", border: "1px solid rgba(192,57,43,0.3)", color: "var(--danger)", padding: "12px 14px", borderRadius: 10, fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 13 }}>📄 <strong>{fileName}</strong> — {rows.length} righe, {columns.length} colonne</div>
                <button onClick={reset} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>Cambia file</button>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>MAPPATURA COLONNE</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--success)", display: "inline-block" }} />
                    rilevato automaticamente — verifica
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8 }}>
                  {fields.map(f => {
                    const isAuto = autoDetected[f.key] && mapping[f.key];
                    return (
                      <div key={f.key}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 }}>
                          {f.label}{isAuto && <span style={{ color: "var(--success)", marginLeft: 4 }}>✓</span>}
                        </div>
                        <select
                          value={mapping[f.key] || ""}
                          onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
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
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--text-muted)", background: "var(--surface2)", borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}>
                  <input type="checkbox" checked={foldExtras} onChange={e => setFoldExtras(e.target.checked)} style={{ marginTop: 2, cursor: "pointer" }} />
                  <span>
                    <strong style={{ color: "var(--text)" }}>Aggiungi alle Note le altre {extraColumns.length} colonne riconosciute</strong> (codice fiscale, data di nascita, documenti, CAP/provincia…): {extraColumns.slice(0, 6).map(prettifyHeader).join(", ")}{extraColumns.length > 6 ? "…" : ""}
                  </span>
                </label>
              )}

              {!mapping.name && (
                <div style={{ background: "#FEF3C7", border: "1px solid rgba(200,131,42,0.35)", color: "var(--warning)", padding: "10px 14px", borderRadius: 10, fontSize: 12.5 }}>
                  ⚠️ Mappa la colonna del <strong>Nome</strong> per generare l'anteprima dei clienti da importare.
                </div>
              )}

              {mapping.name && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>
                      ANTEPRIMA — {selectedCount} DI {candidates.length} SELEZIONATI PER L'IMPORT
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={selectAll} style={{ ...btnGhost, padding: "4px 10px", fontSize: 11 }}>Seleziona tutti</button>
                      <button onClick={selectNone} style={{ ...btnGhost, padding: "4px 10px", fontSize: 11 }}>Deseleziona tutti</button>
                    </div>
                  </div>
                  {duplicateCount > 0 && (
                    <div style={{ fontSize: 11.5, color: "var(--warning)", fontWeight: 600, marginBottom: 8 }}>
                      ⚠ {duplicateCount} client{duplicateCount === 1 ? "e" : "i"} risult{duplicateCount === 1 ? "a" : "ano"} già in anagrafica (stesso nome) e {duplicateCount === 1 ? "non è" : "non sono"} selezionat{duplicateCount === 1 ? "o" : "i"} di default.
                    </div>
                  )}
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="🔍 Filtra per nome o città…"
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                    {filtered.length === 0 ? (
                      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 12.5 }}>Nessun risultato</div>
                    ) : filtered.map(c => (
                      <div key={c.key} onClick={() => toggle(c.key)} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        borderBottom: "1px solid var(--border)", cursor: "pointer",
                        background: selected[c.key] ? "rgba(212,168,67,0.06)" : "transparent",
                      }}>
                        <input type="checkbox" checked={!!selected[c.key]} readOnly style={{ cursor: "pointer" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                            {c.name}
                            {c.isDuplicate && (
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--warning)", background: "rgba(200,131,42,0.12)", borderRadius: 999, padding: "1px 6px" }}>già presente</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                            {[c.city, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 22px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{selectedCount} client{selectedCount === 1 ? "e" : "i"} da importare</div>
          <div style={{ display: "flex", gap: 8 }}>
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
