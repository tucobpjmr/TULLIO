// src/components/documenti/documentiModello.js
// La forma di un documento di identità dentro l'app, e la traduzione da e
// verso le colonne del database.
//
// Vive qui e non in `lib/mappers.js` per la stessa ragione per cui
// `listeFormato.js` vive dentro il modulo Liste: l'archivio documenti è un
// modulo a sé, e le sue colonne non le conosce nessun'altra vista. Il giorno
// in cui una vista del core dovesse leggerne una, la porta è
// `documentiModuleApi.js` — non questo file.

/**
 * @typedef {object} Documento
 * @property {string} id
 * @property {string} passeggero
 * @property {string|null} clientId
 * @property {'passaporto'|'carta_identita'|'patente'|'altro'} tipo
 * @property {string|null} numero
 * @property {string|null} scadenza    data ISO `YYYY-MM-DD`
 * @property {string} filePath
 * @property {string} fileName
 * @property {number|null} fileSize
 * @property {string|null} fileType
 * @property {string|null} note
 * @property {string|null} uploadedBy
 * @property {string} createdAt
 * @property {string} updatedAt
 */

// I quattro tipi ammessi, con l'etichetta italiana che l'utente legge.
// L'ordine è quello di frequenza attesa in un'agenzia viaggi, non alfabetico:
// è l'ordine in cui compaiono nel menu a tendina, e il primo è il default.
//
// `carta_identita` senza accento: è un valore dell'enum del database (il
// `check` in 20260916120000), non un testo — gli identificatori li detta lo
// schema, vedi «lingua degli identificatori» in docs/CLAUDE.md.
export const TIPI_DOCUMENTO = [
  { valore: 'passaporto',     etichetta: 'Passaporto' },
  { valore: 'carta_identita', etichetta: "Carta d'identità" },
  { valore: 'patente',        etichetta: 'Patente' },
  { valore: 'altro',          etichetta: 'Altro' },
];

export const TIPO_PREDEFINITO = 'passaporto';

/** L'etichetta di un tipo; il valore grezzo se il tipo non è fra quelli noti. */
export const etichettaTipo = (tipo) =>
  TIPI_DOCUMENTO.find((t) => t.valore === tipo)?.etichetta || tipo || '—';

/**
 * Riga del database → oggetto dell'app.
 *
 * @param {object} riga
 * @returns {Documento}
 */
export const fromDbDocumento = (riga) => ({
  id: riga.id,
  passeggero: riga.passeggero,
  clientId: riga.client_id ?? null,
  tipo: riga.tipo || TIPO_PREDEFINITO,
  numero: riga.numero ?? null,
  scadenza: riga.scadenza ?? null,
  filePath: riga.file_path,
  fileName: riga.file_name,
  fileSize: riga.file_size ?? null,
  fileType: riga.file_type ?? null,
  note: riga.note ?? null,
  uploadedBy: riga.uploaded_by ?? null,
  createdAt: riga.created_at,
  updatedAt: riga.updated_at,
});

/**
 * Ordina per nome del passeggero, poi per data di caricamento.
 *
 * Il confronto passa da `localeCompare` con locale italiano: l'ordinamento del
 * database è per byte (`order by passeggero`), quindi «Àngelo» finirebbe dopo
 * «Zurlo». Qui l'elenco è già in memoria e il riordino costa una volta sola
 * per caricamento.
 */
export const ordinaDocumenti = (documenti) =>
  [...(documenti || [])].sort((a, b) => {
    const n = String(a.passeggero || '').localeCompare(String(b.passeggero || ''), 'it', { sensitivity: 'base' });
    return n !== 0 ? n : String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
