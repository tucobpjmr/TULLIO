// src/components/documenti/nomeDaFile.js
// Dal nome di un file al nome del passeggero: `LEPORE_PAOLO.jpg` → `LEPORE PAOLO`.
//
// ─── PERCHÉ ESISTE ──────────────────────────────────────────────────────────
// L'archivio nasce importando ~1000 file già esistenti, nominati
// `COGNOME_NOME.jpg`. Senza questa funzione ogni riga andrebbe compilata a
// mano: mille volte la stessa informazione, già scritta nel nome del file.
//
// ⛔ NON È UNA CERTEZZA, ED È IL PUNTO. La funzione DEDUCE, e la deduzione può
// sbagliare — un `IMG_4821.jpg` non contiene alcun nome. Per questo restituisce
// anche `riconosciuto`: l'import mostra una tabella di anteprima dove ciò che
// non è stato riconosciuto è evidenziato e ogni riga resta modificabile prima
// di confermare. La funzione propone, l'operatore decide.
//
// ⛔ NON riordina cognome e nome, per la stessa ragione per cui non lo fa
// `chiaveCliente` (lib/chiaveCliente.js): in questa anagrafica l'ordine non è
// una regola, e invertirlo d'ufficio produrrebbe "PAOLO LEPORE" da un file che
// diceva l'opposto. Il confronto con l'anagrafica passa comunque da
// `chiaveCliente`, che sull'ordine è l'unico asse in cui identità e ricerca
// differiscono — vedi il commento in cima a quel file.

// Nomi che le fotocamere e le app di messaggistica generano da sole. Un file
// così non contiene il nome di nessuno: riconoscerli evita di proporre
// «IMG 4821» come nome di un passeggero, che è peggio di non proporre nulla —
// un campo vuoto si nota, un nome sbagliato si conferma per distrazione.
//
// Sono DUE famiglie, e la distinzione non è pedanteria:
//
//   • ASSORBENTI — «Screenshot», «WhatsApp Image», «Schermata»: qualunque cosa
//     segua, quel file non è la foto di un documento. Il resto del nome è la
//     data e l'ora che l'app ci ha messo dentro, e contiene parole («alle»,
//     «at») che un controllo sulle sole cifre non assorbirebbe.
//
//   • NUMERICI — «IMG», «DSC», «PXL», «Scan»: sono junk SOLO se ciò che segue
//     sono cifre. `SCANO MARIA` è un cognome, `SCAN 003` no, e la differenza
//     sta tutta in che cosa viene dopo il prefisso.
const PREFISSI_ASSORBENTI = /^(screenshot|schermata|whatsapp)\b/i;
const PREFISSI_NUMERICI =
  /^(img|dsc|dscn|photo|foto|image|immagine|scan|scansione|documento|doc|pxl|mvimg|capture)[\s\d]*$/i;
// Solo cifre e spazi: un timestamp, una data o un contatore.
const SOLO_NUMERI = /^[\s\d]*$/;

/** Separatori → spazio singolo. `LEPORE_PAOLO` → `LEPORE PAOLO`. */
const conSpazi = (nome) => String(nome ?? '')
  .replace(/[_.\-+]+/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();

/** Toglie l'estensione: `LEPORE_PAOLO.jpg` → `LEPORE_PAOLO`. */
const senzaEstensione = (nome) => String(nome ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, '');

/**
 * Toglie i suffissi che i sistemi operativi aggiungono ai duplicati e che gli
 * operatori usano per il fronte/retro: `(1)`, ` - copia`, `_2`, `-bis`.
 *
 * Il suffisso numerico si toglie di proposito: due file
 * `ROSSI_MARIA_1`/`ROSSI_MARIA_2` sono il fronte e il retro dello stesso
 * documento, o due documenti della stessa persona — in entrambi i casi il
 * passeggero è uno, e il modello ammette più righe per lo stesso nome.
 */
const senzaSuffissoDuplicato = (nome) => String(nome)
  .replace(/\s*\(\d+\)\s*$/, '')
  .replace(/[\s_-]*(copia|copy|bis|fronte|retro|front|back)\s*$/i, '')
  .replace(/[\s_-]+\d{1,2}$/, '');

/**
 * Vero se il nome (già normalizzato a spazi) è uno di quelli che genera un
 * dispositivo invece di una persona.
 *
 * ⚠️ Si valuta PRIMA di togliere il suffisso dei duplicati, e l'ordine è la
 * correzione di un difetto vero: su `PXL_20240612_101112` lo strip del
 * suffisso porta via le ultime due cifre e lascia `PXL 20240612 1011`, che al
 * controllo «prefisso più sole cifre» arrivava già spezzato — il file passava
 * per un passeggero di nome «PXL 20240612 1011».
 */
const eNomeAutomatico = (conSpaziGiaFatti) =>
  PREFISSI_ASSORBENTI.test(conSpaziGiaFatti)
  || PREFISSI_NUMERICI.test(conSpaziGiaFatti)
  || SOLO_NUMERI.test(conSpaziGiaFatti);

/**
 * Il nome del passeggero dedotto dal nome del file.
 *
 * @param {string} nomeFile  es. `LEPORE_PAOLO.jpg`
 * @returns {{ passeggero: string, riconosciuto: boolean }}
 *   `riconosciuto: false` quando il nome del file non contiene un nome di
 *   persona plausibile: `passeggero` è allora la stringa vuota, non un
 *   ripiego — chi importa deve vedere un campo da compilare, non un valore da
 *   confermare.
 */
export function nomeDaFile(nomeFile) {
  const intero = conSpazi(senzaEstensione(nomeFile));
  if (!intero) return { passeggero: '', riconosciuto: false };
  if (eNomeAutomatico(intero)) return { passeggero: '', riconosciuto: false };

  const passeggero = conSpazi(senzaSuffissoDuplicato(senzaEstensione(nomeFile)));
  if (!passeggero) return { passeggero: '', riconosciuto: false };

  // Una parola sola non è «cognome e nome». Non la si scarta — può essere un
  // cognome corretto in un archivio dove qualcuno ha nominato i file così —
  // ma non la si dà per riconosciuta: nell'anteprima resta evidenziata, e chi
  // importa decide se completarla.
  const parole = passeggero.split(' ').filter(Boolean);
  // Almeno una lettera: `2024 07`, una volta tolti i separatori, non è un nome.
  const haLettere = /\p{L}/u.test(passeggero);
  return { passeggero, riconosciuto: haLettere && parole.length >= 2 };
}

/**
 * Applica `nomeDaFile` a un elenco di file e numera i doppioni.
 *
 * Il conteggio dei nomi ripetuti serve all'anteprima dell'import: due file per
 * lo stesso passeggero sono normali (fronte/retro, passaporto più carta
 * d'identità) ma VENTI non lo sono — è il segno che la convenzione dei nomi
 * non è quella attesa, e vale la pena accorgersene prima di caricare mille
 * file, non dopo.
 *
 * @param {File[]} files
 * @returns {{ file: File, passeggero: string, riconosciuto: boolean, duplicato: boolean }[]}
 */
export function analizzaFile(files) {
  const righe = Array.from(files || []).map((file) => ({
    file,
    ...nomeDaFile(file?.name),
  }));
  const conteggio = new Map();
  for (const r of righe) {
    if (!r.passeggero) continue;
    conteggio.set(r.passeggero, (conteggio.get(r.passeggero) || 0) + 1);
  }
  return righe.map((r) => ({ ...r, duplicato: (conteggio.get(r.passeggero) || 0) > 1 }));
}
