// src/state/persistenceAdmin.js
// Le entry del registry dichiarativo (vedi state/persistence.js, che le
// aggrega in `PERSISTENCE`) per il pannello Admin: gestione del team,
// ripristino di un backup, profilo personale. Sono le tre sezioni finali che
// persistence.js portava con sé fin dall'inizio — separate in un file proprio
// perché il file originale ha superato la soglia fisica che
// scripts/verifica-convenzioni/convenzioni.js impone (fileOltreTettoFisico),
// non per un confine di dominio nuovo: è lo stesso spezzare-lungo-un-confine-
// che-esisteva-già già fatto per lib/api.js, qui applicato a state/.
//
// Stessa forma di entry, stesso contratto (guard/normalize/persist/rollback/
// mapError/entityId), stesso orchestratore (hooks/useSyncedDispatch.js): la
// spiegazione di FORMA DI UNA ENTRY ed entityId resta in cima a
// state/persistence.js, non duplicata qui.
import {
  Tasks as TasksAPI, Notices as NoticesAPI, Users as UsersAPI, Categories as CategoriesAPI,
} from "../lib/api.js";
import {
  toDbTask, toDbTaskPatch, toDbNotice, toDbNoticePatch, toDbCategory,
} from "../lib/mappers.js";
import { isAdmin } from "../lib/permissions.js";
import { toDbRole, toSeniority } from "../lib/taskConstants.js";

// Stessa forma di quello in state/persistence.js (risposta supabase-js
// riuscita senza operazione): duplicata qui apposta invece che importata da
// lì, per non creare un giro di import fra i due file.
const NOOP = { error: null };

// Riconosce l'errore "questa colonna non esiste" da PostgREST (PGRST204, schema
// cache) o da Postgres (42703, undefined_column). Serve a distinguere uno schema
// non ancora migrato da un errore vero, che va invece mostrato all'utente.
const isMissingColumn = (err, column) => {
  if (!err) return false;
  const code = err.code ?? '';
  if (code !== 'PGRST204' && code !== '42703') return false;
  return String(err.message ?? '').includes(column);
};

// M-5 dell'audit del 13 agosto (seconda metà, vedi il guard di
// UPDATE_TEAM_MEMBER). Il trigger `fix_users_privilege_escalation`
// (migrazione 20260613080033) ripristina in silenzio role/active/pending/
// capacity/id quando chi scrive non è admin PER IL DATABASE — nessun errore,
// la UPDATE "riesce" e basta. Il guard controlla `isAdmin` sullo state React,
// che può essere disallineato dal verdetto del database (un secondo admin ha
// appena revocato il chiamante in un'altra sessione e l'evento realtime non è
// ancora arrivato, per esempio): in quella finestra la richiesta passa il
// guard locale, il trigger la neutralizza, e senza questo confronto
// `res.error` resterebbe null — nessun rollback, nessun toast d'errore,
// "Agente aggiornato" mostrato su un ruolo che il server non ha cambiato.
// `.select().single()` in UsersAPI.updateProfile ritorna la riga DOPO il
// trigger: confrontare il ruolo tornato con quello richiesto smaschera
// esattamente questo caso. Se `data` non arriva (mock, o un client diverso
// senza `.select()`) non c'è nulla da confrontare: si lascia passare `res`
// invariato invece di far fallire un caso che non può essere verificato.
const rispecchiaRuoloScritto = (res, ruoloRichiesto) => {
  if (res?.error || !res?.data) return res;
  if (res.data.role !== ruoloRichiesto) {
    return { data: res.data, error: { message: 'la modifica è stata rifiutata dal database (permessi insufficienti)' } };
  }
  return res;
};

export const PERSISTENCE_ADMIN = {
  // ─── ADMIN: TEAM ───────────────────────────────────────────────────────────
  // ADD_TEAM_MEMBER resta locale: senza email non esiste una riga auth.users da
  // aggiornare (con email il percorso è l'invito, non questa azione).
  //
  // UPDATE_TEAM_MEMBER invece DEVE essere persistito. Finché non lo era, il
  // reducer aggiornava state.team e mostrava "Agente aggiornato" mentre sul
  // database non cambiava nulla: il cambio di ruolo — cioè il modo con cui un
  // admin REVOCA i privilegi di un account compromesso o di chi cambia
  // mansione — era un no-op che la UI confermava. L'utente declassato
  // conservava is_manager_or_admin() lato DB, e l'unico segnale del problema
  // era il ruolo che tornava indietro al reload successivo.
  //
  // La motivazione storica per lasciarla locale ("richiederebbe il mapping
  // all'enum DB, niente sotto-ruolo Junior/Senior nello schema") è caduta:
  // toDbRole normalizza il valore e seniority ha una colonna sua
  // (migrazione 20260806120000).
  UPDATE_TEAM_MEMBER: {
    // M-5 dell'audit del 13 agosto: questo guard controllava solo
    // l'auto-declassamento, appoggiandosi per l'admin-check SOLO ad
    // ADMIN_ONLY_ACTIONS (state/reducer.js) e al pre-check duplicato in
    // useSyncedDispatch — mai a una verifica propria. Una entry che revoca i
    // privilegi di un account non dovrebbe dipendere per intero da un elenco
    // esterno per la sua unica vera barriera: se UPDATE_TEAM_MEMBER sparisse
    // da quell'elenco (o venisse dispatchata da un percorso che non lo
    // consulta) qui non ci sarebbe più nulla a fermarla, e il trigger DB
    // `fix_users_privilege_escalation` (20260613080033) la ripristinerebbe sì,
    // ma IN SILENZIO — vedi persist() qui sotto per la seconda metà del
    // problema.
    guard: (s, a, uid) => {
      if (!isAdmin(s.team, uid)) return false;
      const next = toDbRole(a.payload?.role);
      if (!next) return false;                 // ruolo fuori enum → non si scrive
      // Un admin non può declassare se stesso: se è l'ultimo rimasto, il
      // progetto resta senza nessuno in grado di riassegnare i ruoli e si
      // recupera solo da SQL.
      return a.payload?.id !== uid || next === 'admin';
    },
    // Normalizza PRIMA del dispatch: così lo state React contiene esattamente
    // il valore che finisce sul DB e i due livelli di permessi non ripartono
    // già disallineati.
    normalize: (a) => ({
      ...a,
      payload: {
        ...a.payload,
        role: toDbRole(a.payload?.role),
        seniority: toSeniority(a.payload),
      },
    }),
    // Solo le colonne che esistono davvero su public.users: il payload arriva
    // dalla card del pannello Team ed è il membro intero, campi derivati
    // (photoUrl, status, email…) compresi.
    //
    // Il ritentativo senza `seniority` copre la finestra in cui il codice è già
    // in produzione ma la migrazione 20260806120000 no — in questo progetto le
    // migrazioni si applicano a mano, quindi non è un caso limite. Il
    // sotto-livello è un dettaglio della matrice permessi; il RUOLO è la revoca
    // dei privilegi, e deve arrivare al database anche su uno schema vecchio
    // invece di fallire in blocco per una colonna accessoria.
    persist: async (s, a) => {
      const { id, name, role, color, capacity, seniority } = a.payload;
      const res = await UsersAPI.updateProfile(id, { name, role, color, capacity, seniority });
      if (!isMissingColumn(res?.error, 'seniority')) return rispecchiaRuoloScritto(res, role);
      console.warn('[VoyageDesk] colonna users.seniority assente: applicare la migrazione 20260806120000. Salvo il ruolo senza sotto-livello.');
      return rispecchiaRuoloScritto(await UsersAPI.updateProfile(id, { name, role, color, capacity }), role);
    },
    // Se la scrittura fallisce (o la RLS la rifiuta perché il chiamante non è
    // admin lato DB) lo stato ottimistico va riportato indietro: senza, la UI
    // continuerebbe a mostrare un ruolo che il database non ha — di nuovo il
    // disallineamento che questa entry esiste per chiudere.
    rollback: (s, a) => {
      const prev = (s.team || []).find(m => m.id === a.payload?.id);
      return prev ? { type: "UPDATE_TEAM_MEMBER", payload: prev } : null;
    },
    mapError: () => "ruolo non aggiornato, la modifica non è stata salvata",
    // A-3 (audit del 28 agosto). Il team è in realtime (`users`, debounce
    // 800 ms) e SET_TEAM lo rilegge in blocco: fra questo dispatch ottimistico
    // e il commit, un evento altrui — un signup, un invito accettato, un ruolo
    // cambiato da un altro admin — fa ripartire `UsersAPI.listAll()`, che per
    // QUESTA riga può ancora servire il pre-immagine. Senza questa riga il
    // ruolo appena revocato torna a schermo da solo, e nulla viene a
    // correggerlo: l'eco della nostra UPDATE è taggata e viene scartata.
    entityId: (a) => a.payload?.id,
  },

  // M-2 dell'audit del 14 agosto (terzo passaggio). Queste due erano le sole
  // mutazioni sul team senza compensazione, mentre UPDATE_TEAM_MEMBER e
  // TOGGLE_TEAM_MEMBER_ACTIVE — le altre due dello stesso pannello — ce
  // l'hanno entrambe. Il difetto è quello di sempre, sull'entità che decide
  // chi può fare cosa: il reducer ha già tolto il `pending` (o la riga
  // intera), la scrittura fallisce, e il pannello Team mostra un utente
  // approvato che il database considera ancora in attesa. Nessun evento
  // realtime lo corregge — una scrittura fallita non ne emette — quindi la
  // divergenza dura fino al prossimo reload del team, e nel frattempo
  // l'admin crede di aver dato un accesso che non ha dato.
  //
  // `UsersAPI.approve` chiede già `count: 'exact'` (CONTA_RIGHE): con il
  // rollback qui, un rifiuto della RLS diventa finalmente osservabile su
  // entrambi i lati — toast rosso E stato riportato indietro.
  APPROVE_TEAM_MEMBER: {
    // C-1 dell'audit del 15 agosto: `payload` è ora `{ id, role }` — il
    // ruolo che l'admin ha scelto in AdminTeamTab al momento dell'approvazione,
    // non quello che la riga si porta dietro dalla creazione dell'account.
    persist: (s, a) => UsersAPI.approve(a.payload.id, a.payload.role),
    // Si rimanda il membro INTERO pre-dispatch: il case di UPDATE_TEAM_MEMBER
    // fa merge sulla riga esistente, quindi rimandare `{ pending: true }` da
    // solo lascerebbe a video l'`active` che l'approvazione ha cambiato — un
    // rollback parziale, che sembra riuscito ed è peggio di nessuno (stessa
    // ragione di UPDATE_NOTICE e UPDATE_CLIENT).
    rollback: (s, a) => {
      const prev = (s.team || []).find(m => m.id === a.payload.id);
      return prev ? { type: "UPDATE_TEAM_MEMBER", payload: prev } : null;
    },
    mapError: (err) => err?.message || "utente non approvato",
    // A-3: `payload` è `{ id, role }` — la riga in volo è `payload.id`.
    entityId: (a) => a.payload?.id,
  },

  // Eliminazione definitiva via Edge Function delete-user: rimuove la riga
  // auth.users (CASCADE → public.users + user_contacts), così l'email torna
  // libera e l'invito può essere rifatto da zero.
  REMOVE_TEAM_MEMBER: {
    persist: (s, a) => UsersAPI.deleteUser(a.payload),
    // La riga tolta in ottimistico non è più rileggibile dal server: si
    // rimanda l'oggetto intero, come RESTORE_CLIENT e RESTORE_NOTICE.
    // ADD_TEAM_MEMBER lo rimette in coda invece che al suo posto
    // nell'ordinamento per nome: è irrilevante, il primo refresh realtime di
    // `users` riporta la lista ordinata dal server.
    rollback: (s, a) => {
      const prev = (s.team || []).find(m => m.id === a.payload);
      return prev ? { type: "ADD_TEAM_MEMBER", payload: prev } : null;
    },
    mapError: (err) => err?.message || "utente non eliminato",
    // A-3: qui la riga in volo è stata TOLTA in ottimistico, e
    // `fondiScrittureInVolo` copre esattamente questo caso — il server la serve
    // ancora finché la Edge Function non ha finito, e rimetterla in lista
    // farebbe riapparire l'utente che l'admin ha appena eliminato.
    entityId: (a) => a.payload,
  },

  // Suggerimento strategico n. 3 dell'audit dell'11 agosto: `UsersAPI.setActive`
  // passa oggi dalla Edge Function 'set-user-active', che oltre al flag
  // applicativo revoca davvero la sessione (ban lato auth.admin) — vedi
  // lib/api.js e supabase/functions/set-user-active. "Disattivare" nel
  // pannello Team ora significa quello che dice, a prescindere da quali
  // percorsi server-side esisteranno domani.
  TOGGLE_TEAM_MEMBER_ACTIVE: {
    // Un admin non disattiva se stesso da qui: la Edge Function bannerebbe la
    // propria sessione nello stesso istante in cui la chiama, tagliandogli
    // l'accesso senza che nessun altro admin l'abbia deciso. Stesso principio
    // del guard su UPDATE_TEAM_MEMBER (self-demote) e del rifiuto in
    // delete-user (self-delete) — lì scritto nel corpo della Edge Function,
    // qui ripetuto perché deve fermare l'azione PRIMA della chiamata di rete,
    // non dopo un 400 che il ban ha già rifiutato.
    guard: (s, a, uid) => a.payload !== uid,
    persist: (s, a) => {
      const curr = (s.team || []).find(m => m.id === a.payload);
      return UsersAPI.setActive(a.payload, !curr?.active);
    },
    // Se la Edge Function fallisce (rete, l'utente target è sparito nel
    // frattempo) lo stato ottimistico va riportato indietro. TOGGLE_TEAM_
    // MEMBER_ACTIVE è la propria inversa — applica sempre `!active` sul valore
    // CORRENTE — quindi ridispatcharla una seconda volta con lo stesso payload
    // torna esattamente al punto di partenza, senza bisogno di uno snapshot.
    // Senza questo rollback la UI direbbe "Agente disattivato" mentre la
    // sessione dell'utente resta valida: la stessa classe di disallineamento
    // (M-1) che il resto di questo registro esiste per chiudere — qui con la
    // posta più alta, perché il dato che si scosta è chi può ancora accedere.
    rollback: (s, a) => ({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: a.payload }),
    mapError: (err) => err?.message || "stato di attivazione non aggiornato",
    // A-3, ed è il caso con la posta più alta di tutto il registry: `active` è
    // ciò da cui dipende chi può ancora accedere, e un refetch concorrente lo
    // riportava a `true` sopra il toast che dava la disattivazione per
    // riuscita.
    entityId: (a) => a.payload,
  },

  // ─── ADMIN: RESTORE BACKUP ─────────────────────────────────────────────────
  // Upsert (update se l'id/chiave esiste già, altrimenti create), coerente col
  // merge non distruttivo del reducer. Il team resta local-only come
  // ADD/UPDATE_TEAM_MEMBER: i membri sono righe auth.users, non ricreabili né
  // cancellabili da un restore client-side.
  //
  // M-1 dell'audit del 14 agosto (secondo passaggio). Prima era un
  // `Promise.all` con UNA richiesta per riga del file — su un backup completo
  // (289 task in produzione) centinaia di richieste concorrenti in un colpo
  // solo, nessun rollback nonostante il reducer avesse già fuso l'intero
  // backup nello stato: un fallimento parziale mostrava "ripristino
  // completo" a schermo con una parte non arrivata sul server. Qui i job
  // (una entry per riga, di ogni tipo) vengono eseguiti a BLOCCHI di
  // `RESTORE_CHUNK`, e ogni fallimento — riga per riga, non a blocco intero:
  // a differenza di ADD_CLIENTS_BULK questi non sono un'unica insert
  // multi-riga, sono chiamate indipendenti — viene tracciato con abbastanza
  // informazione (tipo, chiave, se la riga esisteva già) da poter essere
  // compensato con precisione chirurgica invece che con un rollback totale.
  RESTORE_BACKUP: {
    persist: async (s, a) => {
      const payload = a.payload || {};
      const taskIds = new Set((s.tasks || []).map(t => t.id));
      const categoryKeys = new Set(Object.keys(s.categories || {}));
      const noticeIds = new Set((s.notices || []).map(n => n.id));

      // `esisteva` distingue le due compensazioni possibili per un job
      // fallito: una riga che ESISTEVA va riportata al proprio valore
      // pre-dispatch (recuperabile da `s`); una riga CREATA da questo
      // restore non è mai arrivata sul server, quindi va tolta dalla UI
      // invece di restarci come record fantasma.
      const jobs = [
        ...(Array.isArray(payload.tasks) ? payload.tasks.map(t => ({
          tipo: "tasks", key: t.id, esisteva: taskIds.has(t.id),
          run: () => (taskIds.has(t.id) ? TasksAPI.update(t.id, toDbTaskPatch(t)) : TasksAPI.create(toDbTask(t))),
        })) : []),
        ...(payload.categories && typeof payload.categories === "object"
          ? Object.entries(payload.categories).map(([key, cat]) => ({
            tipo: "categories", key, esisteva: categoryKeys.has(key),
            run: () => (categoryKeys.has(key) ? CategoriesAPI.update(key, cat) : CategoriesAPI.create(toDbCategory({ key, ...cat }))),
          })) : []),
        ...(Array.isArray(payload.notices) ? payload.notices.map(n => ({
          tipo: "notices", key: n.id, esisteva: noticeIds.has(n.id),
          run: () => (noticeIds.has(n.id) ? NoticesAPI.update(n.id, toDbNoticePatch(n)) : NoticesAPI.create(toDbNotice(n))),
        })) : []),
      ];
      if (!jobs.length) return NOOP;

      const RESTORE_CHUNK = 50;
      const falliti = [];
      for (let i = 0; i < jobs.length; i += RESTORE_CHUNK) {
        const blocco = jobs.slice(i, i + RESTORE_CHUNK);
        const esiti = await Promise.allSettled(blocco.map(j => j.run()));
        esiti.forEach((esito, idx) => {
          const errore = esito.status === "rejected" ? esito.reason : esito.value?.error;
          if (errore) falliti.push({ ...blocco[idx], error: errore });
        });
        // Nessuno short-circuit: un job fallito (RLS, vincolo, rete) non
        // implica che i successivi falliranno — ogni riga è una chiamata
        // indipendente, non un'unica insert atomica.
      }
      return falliti.length ? { error: falliti[0].error, falliti } : { error: null };
    },
    // Riporta indietro SOLO le righe che non sono arrivate sul server:
    // `res.falliti` (popolato da `persist`, sopra) porta tipo/chiave/se
    // esisteva già per ciascuna. Le altre — la stragrande maggioranza di un
    // fallimento parziale — restano quelle che il reducer ha già fuso, che è
    // corretto: sul server ci sono arrivate davvero.
    rollback: (s, a, res) => {
      const falliti = res?.falliti || [];
      if (!falliti.length) return null;
      const daRipristinare = { tasks: [], categories: {}, notices: [] };
      const daRimuovere = { tasks: [], categories: [], notices: [] };
      for (const f of falliti) {
        if (f.esisteva) {
          if (f.tipo === "tasks") {
            const prev = (s.tasks || []).find(t => t.id === f.key);
            if (prev) daRipristinare.tasks.push(prev);
          } else if (f.tipo === "categories") {
            const prev = (s.categories || {})[f.key];
            if (prev) daRipristinare.categories[f.key] = prev;
          } else if (f.tipo === "notices") {
            const prev = (s.notices || []).find(n => n.id === f.key);
            if (prev) daRipristinare.notices.push(prev);
          }
        } else {
          daRimuovere[f.tipo].push(f.key);
        }
      }
      return { type: "ROLLBACK_RESTORE_BACKUP", payload: { daRipristinare, daRimuovere } };
    },
    mapError: (err) => err?.message || "ripristino backup incompleto: alcune righe non sono state salvate",
  },

  // ─── PROFILO PERSONALE ─────────────────────────────────────────────────────
  // L'unica azione che l'utente esegue su SE STESSO, e l'unica che tocca due
  // tabelle: public.users (nome, iniziali, colore, foto) e public.user_contacts
  // (email, telefono), separate dalla migrazione 20260613100833.
  //
  // Finché non era qui, ProfileEditor faceva da sé: dispatch ottimistico, poi
  // due await a UsersAPI scritti a mano nel corpo del componente, un toast per
  // ciascuno e NESSUN rollback. Se la scrittura falliva — RLS, rete, trigger
  // anti-escalation — lo state React conservava i valori nuovi e la modale si
  // chiudeva lo stesso: l'utente vedeva il proprio profilo aggiornato mentre il
  // database non aveva ricevuto nulla, e se ne accorgeva solo al reload
  // successivo, quando il nome tornava indietro da solo. È lo stesso
  // disallineamento descritto in UPDATE_TEAM_MEMBER qui sopra, in un altro
  // punto dell'app: la ragione per cui questo registry esiste è che quella
  // classe di bug non si vede in review, si vede in produzione.
  //
  // Nessun guard: la riga scritta è sempre la PROPRIA (uid arriva dal reducer,
  // non dal payload), e le policy own-row lo confermano lato server.
  UPDATE_OWN_PROFILE: {
    persist: async (s, a, uid) => {
      const { name, avatar, color, photoUrl, email, phone } = a.payload || {};
      // Sequenziale e non Promise.all: se public.users rifiuta la scrittura,
      // mandare comunque i contatti lascerebbe il profilo aggiornato a metà sul
      // server — il caso peggiore, perché a quel punto nessun rollback può più
      // riportare indietro l'insieme.
      const prof = await UsersAPI.updateProfile(uid, {
        name, avatar, color, photo_url: photoUrl,
      });
      if (prof?.error) return prof;
      return UsersAPI.updateContact(uid, { email: email || null, phone: phone || null });
    },
    // Lo snapshot elenca i sei campi per esteso invece di passare `prev` intero:
    // il reducer applica solo le chiavi !== undefined, quindi un campo assente
    // dallo snapshot NON verrebbe riportato indietro e resterebbe al valore
    // ottimistico — un rollback parziale, che è peggio di nessun rollback
    // perché sembra riuscito. `?? null` lo rende totale.
    rollback: (s) => {
      const prev = (s.team || []).find(m => m.id === s.currentUserId);
      if (!prev) return null;
      return {
        type: "UPDATE_OWN_PROFILE",
        payload: {
          name: prev.name ?? null,
          avatar: prev.avatar ?? null,
          color: prev.color ?? null,
          photoUrl: prev.photoUrl ?? null,
          email: prev.email ?? null,
          phone: prev.phone ?? null,
        },
      };
    },
    mapError: (err) => err?.message || "profilo non aggiornato",
    // A-3, e l'unica entry per cui la firma di `entityId` è dovuta crescere:
    // il soggetto non è nel payload, è l'utente loggato. La riga scritta è la
    // SUA riga in `public.users`, cioè la stessa che vive in `state.team` — e
    // senza questa marcatura un refetch concorrente riportava indietro nome,
    // avatar, email e telefono appena salvati, con la modale già chiusa.
    entityId: (a, s, uid) => uid,
  },
};
