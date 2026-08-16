// S-1 — il contratto realtime di `origin_client` deve essere garantito dallo
// SCHEMA, non dalle intenzioni di chi ha scritto `subscribeToTable`.
//
// L'invariante: ogni tabella pubblicata su `supabase_realtime` ha la colonna
// `origin_client`. Chi non ce l'ha manda a ogni subscriber un evento che
// nessuno può riconoscere come proprio, e il subscriber ricarica — anche
// quello che quella scrittura l'ha appena fatta e ha già lo stato aggiornato
// in ottimistico.
//
// Quando è stato scritto questo file l'invariante era violata da quattro
// tabelle su dodici (clients, task_history, liste_viaggio, movimenti_lista),
// e nessuno se n'era accorto per un motivo strutturale: il difetto non produce
// un errore, produce traffico. Non c'è niente che diventi rosso.
//
// ── PERCHÉ UN CONTROLLO STATICO SUI FILE E NON UNA SONDA SUL DATABASE ──────
// Il precedente in casa per un test che tocca il database è
// src/test/integration/rls.test.js, che senza credenziali si auto-salta
// (`describe.skip`). Qui quella forma non serve, e non sarebbe nemmeno la
// migliore:
//
//   1. il momento in cui il difetto va intercettato è quando la migrazione
//      ENTRA NEL REPOSITORY, cioè prima che qualcuno la applichi a mano. Una
//      sonda sul database può accorgersene solo DOPO il deploy, quando la
//      tabella è già live e già muta;
//   2. `pg_publication_tables` e `pg_class.relreplident` non sono raggiungibili
//      da PostgREST. Servirebbe una nuova funzione SECURITY DEFINER esposta ad
//      anon per leggere il catalogo — nuova superficie, esattamente ciò che
//      questo progetto ha passato le ultime sessioni a restringere
//      (20260806170000_revoke_anon_table_grants, la serie advisor_definer_*);
//   3. lo scarto fra file e database ha già il suo controllo dedicato
//      (`npm run verifica:migrazioni`, src/test/verificaMigrazioni.test.js).
//      Questo test verifica il CONTRATTO; quello verifica che sia applicato.
//      Sono due domande diverse e nessuna delle due sostituisce l'altra.
//
// Il prezzo è che il controllo legge SQL con delle espressioni regolari, cioè
// vede quello che i file dichiarano, non quello che il database ha. È il
// motivo per cui la parte 3 di questo file verifica anche il comportamento
// vero del data layer, dove invece si può eseguire.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');

// I file in ordine cronologico: il nome comincia col timestamp, quindi
// l'ordine alfabetico È l'ordine di applicazione. Conta per le funzioni, che
// vengono ridefinite più volte: l'ultima definizione è quella che vale.
const fileMigrazioni = () =>
  readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

// Via i commenti di riga prima di qualunque analisi: questi file sono per
// tre quarti prosa, e discutono a lungo proprio le istruzioni che cerchiamo
// ("non aggiunge origin_client a…", "alter publication … sarebbe sbagliato").
// Senza questo passaggio il controllo leggerebbe le spiegazioni come codice.
const senzaCommenti = (sql) => sql.replace(/--[^\n]*/g, '');

const sorgente = (f) => senzaCommenti(readFileSync(join(DIR, f), 'utf8'));

// ─── Lettura dello schema dai file ────────────────────────────────────────

// `alter publication supabase_realtime add table public.x[, public.y]`, anche
// dentro un `execute '…'` (la forma idempotente usata dalle migrazioni recenti).
function tabellePubblicate(sql) {
  const out = [];
  const re = /alter\s+publication\s+supabase_realtime\s+add\s+table\s+([^;']+)/gi;
  let m;
  while ((m = re.exec(sql))) {
    for (const t of m[1].split(',')) {
      const nome = t.trim().replace(/^public\./i, '').replace(/["\s]/g, '');
      if (nome) out.push(nome);
    }
  }
  return out;
}

// Corpo fra parentesi bilanciate a partire dalla prima `(` dopo `da`.
// Un `create table` non si può delimitare con una regex non-greedy: le
// definizioni di colonna contengono a loro volta parentesi (default, check,
// references), e la prima `)` incontrata non è quasi mai quella giusta.
function bloccoParentesi(sql, da) {
  const start = sql.indexOf('(', da);
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < sql.length; i += 1) {
    if (sql[i] === '(') depth += 1;
    else if (sql[i] === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(start + 1, i);
    }
  }
  return sql.slice(start + 1);
}

// Tabelle che acquistano la colonna: `create table … (… origin_client …)`
// oppure `alter table … add column [if not exists] origin_client`.
function tabelleConOriginClient(sql) {
  const out = [];

  const creaRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi;
  let m;
  while ((m = creaRe.exec(sql))) {
    if (/\borigin_client\b/i.test(bloccoParentesi(sql, creaRe.lastIndex))) out.push(m[1]);
  }

  const alterRe =
    /alter\s+table\s+(?:public\.)?(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?origin_client/gi;
  while ((m = alterRe.exec(sql))) out.push(m[1]);

  return out;
}

function schemaDaiFile() {
  const pubblicate = new Set();
  const conOrigin = new Set();
  for (const f of fileMigrazioni()) {
    const sql = sorgente(f);
    tabellePubblicate(sql).forEach((t) => pubblicate.add(t));
    tabelleConOriginClient(sql).forEach((t) => conOrigin.add(t));
  }
  return { pubblicate, conOrigin };
}

// ── Nessuna eccezione dichiarata ────────────────────────────────────────────
// Fino al 16 agosto qui c'erano tre eccezioni — liste_viaggio, movimenti_lista,
// lista_beneficiari — perché tutte le scritture del modulo Liste sono RPC
// (src/components/liste/listeApi.js) e nessuna trasportava l'origine. Chiuse
// dal suggerimento strategico n.3 dello stesso audit (migrazione
// 20260816110000_p_origin_modulo_liste): tredici delle sedici RPC del modulo
// hanno guadagnato `p_origin uuid DEFAULT NULL` (drop+create, non create or
// replace — un parametro in più cambia la signature) e il client lo passa da
// `listeApi.js`. Le tre RPC rimaste fuori (rimuovi_beneficiario_lista,
// elimina_lista_definitivamente, reset_completo) scrivono solo con
// DELETE/TRUNCATE: non serviva un'eccezione qui per loro, perché non toccano
// la domanda di questo blocco — sono le TABELLE a dover avere la colonna, non
// ogni singola RPC a dover taggare ogni riga.
const ECCEZIONI = new Map();

// ─── 1. L'invariante ──────────────────────────────────────────────────────

describe('contratto realtime: pubblicata su supabase_realtime ⇒ ha origin_client', () => {
  it('legge davvero la publication dai file (rete di sicurezza sul parser)', () => {
    // Se un cambio di forma nei file rendesse il parser cieco, l'invariante
    // qui sotto passerebbe su un insieme vuoto: verde e inutile.
    const { pubblicate, conOrigin } = schemaDaiFile();
    expect(pubblicate.size).toBeGreaterThanOrEqual(12);
    expect(conOrigin.size).toBeGreaterThanOrEqual(8);
    for (const attesa of ['tasks', 'messages', 'clients', 'task_history', 'liste_viaggio']) {
      expect(pubblicate.has(attesa), `${attesa} dovrebbe risultare pubblicata`).toBe(true);
    }
  });

  it('nessuna tabella pubblicata è priva di origin_client, salvo le eccezioni dichiarate', () => {
    const { pubblicate, conOrigin } = schemaDaiFile();
    const scoperte = [...pubblicate].filter((t) => !conOrigin.has(t) && !ECCEZIONI.has(t)).sort();
    expect(
      scoperte,
      `Tabelle in realtime senza origin_client: ${scoperte.join(', ')}.\n`
      + 'Ogni evento di queste tabelle torna indietro a chi ha fatto la scrittura e gli fa\n'
      + 'ricaricare tutto. O si aggiunge la colonna (e si tagga la scrittura con withOrigin),\n'
      + 'oppure si dichiara qui l\'eccezione con il motivo.',
    ).toEqual([]);
  });

  it('l\'elenco delle eccezioni non invecchia', () => {
    // Un\'eccezione per una tabella che nel frattempo la colonna ce l'ha (o
    // che non è più pubblicata) è una riga che mente: la prossima persona la
    // legge come una lacuna aperta e non la tocca.
    const { pubblicate, conOrigin } = schemaDaiFile();
    for (const [tabella, motivo] of ECCEZIONI) {
      expect(pubblicate.has(tabella), `${tabella} non è più in realtime: togliere l'eccezione`).toBe(true);
      expect(conOrigin.has(tabella), `${tabella} ha ora origin_client: togliere l'eccezione`).toBe(false);
      expect(motivo.length).toBeGreaterThan(20);
    }
  });
});

// ─── 2. La porta di servizio: il trigger che scrive nella tabella figlia ──

describe('log_task_history propaga origin_client in tutte le sue insert', () => {
  // Il caso peggiore del rilievo, perché `tasks` è taggata correttamente e il
  // difetto passava comunque: ogni UPDATE su un task inserisce righe in
  // `task_history`, anch'essa in realtime, e quelle righe non portavano
  // nessuna origine. Chi spostava un task in kanban si riscaricava la
  // cronologia intera e si ricostruiva tutti i task.
  //
  // Il test guarda l'ULTIMA definizione della funzione presente nei file: è
  // quella che il database avrà dopo l'applicazione. Un domani chi aggiunge
  // un settimo ramo al trigger (un nuovo campo monitorato) e dimentica la
  // colonna riapre il difetto in silenzio — qui invece diventa rosso.
  const ultimaDefinizione = () => {
    const file = fileMigrazioni().filter((f) =>
      /create\s+or\s+replace\s+function\s+public\.log_task_history/i.test(sorgente(f)));
    expect(file.length, 'nessuna migrazione definisce log_task_history').toBeGreaterThan(0);
    const sql = sorgente(file[file.length - 1]);
    const da = sql.search(/create\s+or\s+replace\s+function\s+public\.log_task_history/i);
    const fine = sql.indexOf('$$;', da);
    return sql.slice(da, fine < 0 ? undefined : fine);
  };

  it('ogni insert in task_history porta con sé NEW.origin_client', () => {
    const corpo = ultimaDefinizione();
    // Una insert va da "insert into public.task_history" fino al ";" che
    // chiude la sua clausola values.
    const inserts = corpo.match(/insert\s+into\s+public\.task_history[\s\S]*?;/gi) || [];
    expect(inserts.length, 'i rami attesi sono sei: created, status, priority, due_date, assignees, trashed/restored')
      .toBe(6);
    for (const ins of inserts) {
      expect(/origin_client/i.test(ins), `insert senza origin_client:\n${ins}`).toBe(true);
      expect(/NEW\.origin_client/i.test(ins), `insert che non propaga NEW.origin_client:\n${ins}`).toBe(true);
    }
  });
});

// ─── 3. Il lato client: le scritture taggano davvero ──────────────────────
// Qui non si legge un file, si esegue il data layer con un client Supabase
// finto (stesso schema di api.test.js). Serve perché la colonna sul database
// non basta: se `Clients.create` non passa da `withOrigin`, la colonna resta
// NULL e l'invariante di schema è verde su un comportamento sbagliato.

const scritture = [];

const builderScrittura = (tabella, op) => ({
  select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
  eq: () => ({
    select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
  }),
  then: undefined,
  _tabella: tabella,
  _op: op,
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabella) => ({
      insert: (payload) => {
        scritture.push({ tabella, op: 'insert', payload });
        return builderScrittura(tabella, 'insert');
      },
      update: (payload) => {
        scritture.push({ tabella, op: 'update', payload });
        return builderScrittura(tabella, 'update');
      },
      delete: () => {
        scritture.push({ tabella, op: 'delete', payload: null });
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
    }),
  },
}));

const { Clients } = await import('../lib/api.js');
const { getClientId } = await import('../lib/clientId.js');

describe('ClientsAPI tagga le proprie scritture', () => {
  beforeEach(() => { scritture.length = 0; });

  it('create allega origin_client', async () => {
    await Clients.create({ name: 'Famiglia Rossi' });
    expect(scritture[0].payload.origin_client).toBe(getClientId());
    // Il payload originale non deve essere alterato negli altri campi.
    expect(scritture[0].payload.name).toBe('Famiglia Rossi');
  });

  it('update allega origin_client al patch', async () => {
    await Clients.update('id-1', { city: 'Milano' });
    expect(scritture[0].payload).toEqual({ city: 'Milano', origin_client: getClientId() });
  });

  it('remove non può taggare: .delete() non trasporta un payload', () => {
    // Non è una dimenticanza ed è documentato in api.js: l'unico modo per
    // rendere leggibile un'origine su una DELETE sarebbe REPLICA IDENTITY
    // FULL, che esporrebbe però l'origine dell'ULTIMA SCRITTURA — chi ha
    // modificato la riga per ultimo scarterebbe la cancellazione fatta da un
    // altro e si terrebbe in lista un cliente che non esiste più.
    Clients.remove('id-1');
    expect(scritture[0]).toEqual({ tabella: 'clients', op: 'delete', payload: null });
  });
});
