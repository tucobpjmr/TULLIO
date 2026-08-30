// src/auth/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabaseAuth } from '../lib/supabaseAuth.js';
import { toDbRole } from '../lib/taskConstants.js';

const AuthContext = createContext(null);

// Timeout per le chiamate di init auth (getSession + query profilo). Su
// mobile (WebView Android, PWA riportata in foreground dopo essere rimasta
// a lungo in background) una richiesta di rete può restare "appesa" senza
// mai risolversi né rigettarsi (lock del refresh token bloccato, socket
// morto non ancora rilevato dal sistema operativo). In quel caso la Promise
// chain getSession()→caricaProfilo()→impostaCaricando(false) non arriva mai al
// finally: niente errore da intercettare, solo uno spinner "Caricamento…"
// bloccato a tempo indeterminato, risolvibile solo da un refresh manuale
// (che ricrea la connessione di rete da zero). withTimeout forza quella
// Promise appesa a rigettare, così rientra nella gestione errori esistente
// (authError + retry) invece di restare bloccata per sempre.
const AUTH_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[auth] ${label} in timeout dopo ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Ritenta automaticamente e in silenzio una chiamata di init prima di
// arrendersi. Il primo avvio "a freddo" (progetto Supabase in pausa dopo
// inattività, mobile che ristabilisce la connessione al ritorno in foreground)
// può far fallire la PRIMA richiesta con un errore transitorio (o un cold
// start lentissimo), mentre il tentativo successivo su connessione ormai
// "calda" va a buon fine. Ritentando qui, l'utente resta sullo spinner
// "Caricamento…" ancora un attimo invece di vedere lampeggiare una schermata
// d'errore che si risolve da sola dopo un secondo.
const AUTH_RETRIES = 2;
const AUTH_RETRY_DELAY_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 0; attempt <= AUTH_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < AUTH_RETRIES) {
        console.warn(`[auth] ${label} tentativo ${attempt + 1} fallito, ritento…`, err);
        await sleep(AUTH_RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

// Rileva dal frammento URL con quale tipo di link Auth è arrivato l'utente.
// I link di RECUPERO password emettono anche l'evento PASSWORD_RECOVERY, ma i
// link di INVITO (inviteUserByEmail) NO: arrivano come SIGNED_IN con
// '#...&type=invite'. Senza questo controllo l'invitato entrerebbe in app senza
// mai vedere la schermata "imposta password", restando di fatto costretto al
// recupero password. Letto in modo sincrono al primo render, prima che
// detectSessionInUrl ripulisca l'hash.
function detectAuthLinkType() {
  if (typeof window === 'undefined') return null;
  const fromStr = (s) => new URLSearchParams((s || '').replace(/^[#?]/, '')).get('type');
  const t = fromStr(window.location.hash) || fromStr(window.location.search);
  return t === 'invite' || t === 'recovery' ? t : null;
}

// Catturato UNA volta al caricamento del modulo: detectSessionInUrl ripulisce
// l'hash in modo asincrono, quindi leggerlo qui (prima del primo render React)
// è più robusto che leggerlo dentro il componente, che potrebbe rimontare.
const INITIAL_AUTH_LINK_TYPE = detectAuthLinkType();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [team, setTeam] = useState([]);
  const [caricando, impostaCaricando] = useState(true);
  // recovery=true quando l'utente arriva da un link che richiede di impostare
  // la password: "reimposta password" (evento PASSWORD_RECOVERY) oppure "invito"
  // (type=invite nell'URL). In quel caso mostriamo la schermata di impostazione
  // password invece dell'app, anche se la session è valida. recoveryKind
  // distingue i due casi per adattare i testi (primo accesso vs recupero).
  const [recovery, setRecovery] = useState(!!INITIAL_AUTH_LINK_TYPE);
  const [recoveryKind, setRecoveryKind] = useState(INITIAL_AUTH_LINK_TYPE);
  // Errore del caricamento profilo/sessione iniziale: senza, un blip di rete
  // (es. connessione DB "a freddo" dopo inattività) lasciava l'app bloccata
  // sulla schermata "Caricamento…" per sempre, recuperabile solo con un
  // refresh manuale della pagina. Con authError mostriamo un retry esplicito.
  const [authError, setAuthError] = useState(null);
  // Ref alla funzione di init corrente, così retryInit può rieseguirla senza
  // ricreare l'effetto (vedi commento sopra all'useEffect).
  const initAuthRef = useRef(null);
  // Deduplica i caricamenti profilo concorrenti sullo stesso utente. All'avvio
  // caricaProfilo veniva chiamata DUE volte quasi in contemporanea: una da
  // initAuth (dopo getSession) e una dall'evento INITIAL_SESSION che
  // onAuthStateChange emette subito alla sottoscrizione. Due query concorrenti
  // sul DB "a freddo": se una falliva e l'altra riusciva, la prima faceva
  // lampeggiare la schermata d'errore prima che la seconda montasse l'app
  // ("errore, poi si connette"). Con un'unica richiesta in volo per utente il
  // race sparisce.
  const caricamentoInVoloRef = useRef(null);

  const caricaProfilo = useCallback((userId) => {
    const key = userId ?? null;
    const inflight = caricamentoInVoloRef.current;
    if (inflight && inflight.key === key) return inflight.promise;

    const promise = (async () => {
      if (!userId) { setProfile(null); setTeam([]); setAuthError(null); return; }
      try {
        // Import dinamico e non statico in cima al file (B-2 dell'audit del
        // 30 agosto): questa è l'UNICA riga di AuthContext.jsx che tocca il
        // client pieno (postgrest). Fino a qui — getSession, login, sign out
        // — è passato tutto da lib/supabaseAuth.js, che non porta con sé
        // @supabase/supabase-js. Chi resta sulla schermata di login non
        // arriva mai qui, quindi non scarica mai il chunk che contiene
        // postgrest/realtime/storage. Chi invece HA una sessione lo scarica
        // ora, in parallelo al chunk di VoyageDesk (anch'esso lazy) che ne ha
        // comunque bisogno un attimo dopo. `getSupabase()` è a sua volta lazy
        // (vedi lib/supabase.js): questo import statico del MODULO non porta
        // ancora con sé @supabase/supabase-js, solo la funzione che lo importa.
        const { getSupabase } = await import('../lib/supabase.js');
        const supabase = await getSupabase();
        const { me, all, contacts } = await withRetry(async () => {
          const [{ data: me, error: meError }, { data: all, error: allError }, { data: contacts }] = await withTimeout(
            Promise.all([
              supabase.from('users').select('*').eq('id', userId).single(),
              // Nessun filtro su active: gli admin devono vedere anche utenti pending
              // (per approvarli) e disabilitati. Le viste task usano getAssignableTeam()
              // che filtra a sua volta active=true + pending=false (lib/permissions.js).
              supabase.from('users').select('*').order('name'),
              // email/phone vivono in public.user_contacts. Le carico solo per
              // l'utente loggato e le rimergio nel profilo e nella sua entry di
              // team, così ProfileEditor le mostra.
              //
              // ATTENZIONE a cosa NON dice questo: caricarne una sola non è una
              // restrizione di sicurezza, è solo ciò che serve qui. La policy di
              // SELECT è `using (true)` per ogni utente autenticato — la rubrica
              // interna è una scelta di prodotto esplicita (migrazione
              // 20260629222802_user_contacts_select_team, che ha sostituito il
              // precedente own+admin della 20260613100833). Questo commento
              // affermava ancora il contrario ("gli altri membri non le hanno,
              // by-design privacy hardening") molto dopo che la policy era
              // cambiata: chi lo leggeva credeva di avere una garanzia che il
              // database non dà. INSERT/UPDATE restano own+admin, quindi
              // nessuno può modificare i contatti altrui.
              supabase.from('user_contacts').select('email, phone').eq('user_id', userId).maybeSingle(),
            ]),
            AUTH_TIMEOUT_MS,
            'caricaProfilo',
          );
          // Errori/righe mancanti rientrano nel retry: al primo avvio a freddo
          // il token può non essere ancora rinfrescato e le RLS restituiscono
          // vuoto, cosa che si risolve al tentativo successivo.
          if (meError || !me) throw meError || new Error('Profilo non trovato');
          if (allError) throw allError;
          return { me, all, contacts };
        }, 'caricaProfilo');
        const myContacts = { email: contacts?.email ?? null, phone: contacts?.phone ?? null };
        // Normalizza la colonna DB photo_url → photoUrl (camelCase) atteso da
        // Avatar/ProfileEditor (caveat #25): senza, la foto persistita non si
        // ri-mostrerebbe dopo il reload.
        const normalize = (u) => ({ ...u, photoUrl: u.photo_url ?? null });
        setProfile({ ...normalize(me), ...myContacts });
        setTeam((all ?? []).map(u => u.id === userId ? { ...normalize(u), ...myContacts } : normalize(u)));
        setAuthError(null);
      } catch (err) {
        console.error('[auth] caricaProfilo fallito dopo i retry', err);
        setAuthError(err);
      }
    })();

    caricamentoInVoloRef.current = { key, promise };
    // Libera lo slot a fine caricamento così una richiesta successiva (es.
    // TOKEN_REFRESHED, o un retry esplicito dell'utente) riparte da capo.
    promise.finally(() => {
      if (caricamentoInVoloRef.current?.promise === promise) caricamentoInVoloRef.current = null;
    });
    return promise;
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data } = await withRetry(
          () => withTimeout(supabaseAuth.getSession(), AUTH_TIMEOUT_MS, 'getSession'),
          'getSession',
        );
        if (!mounted) return;
        setSession(data.session ?? null);
        await caricaProfilo(data.session?.user?.id);
      } catch (err) {
        console.error('[auth] init failed', err);
        if (mounted) setAuthError(err);
      } finally {
        // Sempre eseguito: senza questo, un errore/rifiuto in getSession() o
        // caricaProfilo() lasciava `caricando` bloccato a true per sempre (nessun
        // catch a monte → la Promise chain non arrivava mai a impostaCaricando(false)).
        if (mounted) impostaCaricando(false);
      }
    };
    // Esposta via retryInit: se getSession() stessa va in errore/timeout
    // (session mai ottenuta), il retry deve rieseguire l'intera sequenza,
    // non solo caricaProfilo (a differenza di refreshTeam, usato quando la
    // session c'è già ma il profilo no).
    initAuthRef.current = initAuth;
    initAuth();

    // ATTENZIONE: questo callback DEVE restare SINCRONO, senza await di
    // chiamate supabase al suo interno. gotrue-js emette gli eventi (compreso
    // INITIAL_SESSION, sparato subito alla sottoscrizione) TENENDO il lock
    // auth (navigator.locks) e ASPETTANDO che il callback finisca. Qualsiasi
    // query awaited qui dentro deve prima ottenere l'access token →
    // getSession() → lo STESSO lock: attesa circolare. In pratica all'avvio:
    // initAuth faceva partire caricaProfilo, le cui query restavano in coda sul
    // lock; il callback INITIAL_SESSION (che il lock lo deteneva) faceva
    // await della STESSA promise deduplicata da caricamentoInVoloRef → deadlock.
    // Risultato: schermata "Caricamento…" bloccata a ogni avvio (desktop e
    // mobile) finché non scadevano timeout+retry (~45s), risolvibile in
    // pratica solo con un refresh manuale — che a volte vinceva il race sul
    // lock e quindi "funzionava". setTimeout(0) rimanda il lavoro a dopo il
    // ritorno del callback: il lock si libera subito e caricaProfilo procede.
    const { data: sub } = supabaseAuth.onAuthStateChange((_event, s) => {
      if (_event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        setRecoveryKind(prev => prev ?? 'recovery');
      }
      setSession(s);
      setTimeout(() => {
        if (!mounted) return;
        caricaProfilo(s?.user?.id).finally(() => {
          // Sblocca lo spinner anche da qui, non solo dal finally di initAuth.
          // INITIAL_SESSION è un segnale indipendente da getSession() che lo
          // stato auth iniziale è determinato: su avvio a freddo getSession()
          // può restare appesa (socket morto su mobile/PWA) e in quel caso
          // session e profilo arrivano da QUI. Chiudendo `caricando` in entrambi
          // i percorsi l'app monta appena i dati sono pronti, da qualunque dei
          // due arrivi per primo.
          if (mounted) impostaCaricando(false);
        });
      }, 0);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [caricaProfilo]);

  // Tutte le funzioni qui sotto sono useCallback: sono nelle dipendenze del
  // useMemo di `value` più sotto, e senza identità stabile lo vanificherebbero
  // — un value "memoizzato" le cui dipendenze cambiano a ogni render è di
  // nuovo un oggetto nuovo a ogni render (VIETATO_CONTEXT_VALUE_LETTERALE
  // in eslint.config.js, suggerimento strategico n.2 dell'audit del 16
  // agosto — nato proprio per impedire che questo file tornasse qui).
  const signIn = useCallback((email, password) =>
    supabaseAuth.signInWithPassword({ email, password }), []);

  // La registrazione self-service è stata rimossa (S-13): l'unico modo di
  // entrare nel gestionale è l'invito (Edge Function invite-user). Il trigger
  // handle_new_auth_user resta al suo posto e continua a creare il profilo con
  // pending=true — è la rete di sicurezza se un account nascesse comunque, per
  // esempio da una chiamata diretta a /auth/v1/signup finché il signup non è
  // disattivato anche nella dashboard Supabase.

  // scope:'local' → esce SOLO dalla scheda/dispositivo corrente. Senza scope,
  // supabase-js usa di default 'global' e revoca TUTTE le sessioni dell'utente
  // su ogni scheda e dispositivo: un logout in un punto invalidava lato server
  // anche le altre schede ancora aperte, che restavano con una sessione "morta"
  // in memoria → la successiva azione privilegiata (es. invito via Edge
  // Function) falliva con "Token non valido" (session_not_found).
  const signOut = useCallback(() => supabaseAuth.signOut({ scope: 'local' }), []);

  // Uscita da OGNI dispositivo: revoca i refresh token lato server. È il
  // rimedio per un dispositivo perso, e non ha il difetto che ha portato a
  // 'local' sopra — qui la sessione morta nelle altre schede è ESATTAMENTE
  // ciò che si vuole, quindi il toast "Sessione scaduta" di api.js è la
  // risposta giusta e non un effetto collaterale da nascondere.
  const signOutOvunque = useCallback(() => supabaseAuth.signOut({ scope: 'global' }), []);

  // Invia l'email con il link per reimpostare la password. redirectTo riporta
  // l'utente sull'app, dove detectSessionInUrl genera l'evento PASSWORD_RECOVERY.
  const resetPassword = useCallback((email) =>
    supabaseAuth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    }), []);

  // Reinvia l'email di conferma signup (utile quando l'utente ha registrato un
  // account ma non ha cliccato il link in tempo, o lo ha perso). Supabase
  // emette lo stesso link OTP del signup. Usata dal LoginScreen quando il
  // tentativo di login fallisce con email_not_confirmed.
  const resendConfirmation = useCallback((email) =>
    supabaseAuth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin },
    }), []);

  // Aggiorna la password dell'utente nella sessione di recovery, poi esce
  // dalla modalità recovery così l'app monta normalmente.
  const updatePassword = useCallback(async (password) => {
    const res = await supabaseAuth.updateUser({ password });
    if (!res.error) { setRecovery(false); setRecoveryKind(null); }
    return res;
  }, []);

  const refreshTeam = useCallback(() => caricaProfilo(session?.user?.id), [session, caricaProfilo]);

  // Retry per quando è la sessione stessa a non essere mai stata ottenuta
  // (getSession() fallita o rimasta appesa in timeout): rieseguono tutta la
  // sequenza init, non solo il caricamento profilo.
  const retryInit = useCallback(() => initAuthRef.current?.(), []);

  // Self-service account deletion: delegates to delete-account Edge Function,
  // then signs out so the banned user is immediately logged out.
  //
  // Import dinamico di lib/api.js per lo stesso motivo di caricaProfilo: è la
  // "porta" dell'intero data layer applicativo, e importarla in cima al file
  // riporterebbe nel grafo eager tutto ciò che B-2 sposta fuori. Nella pratica
  // questa funzione è comunque raggiungibile solo da ProfileEditor, dentro
  // VoyageDesk già autenticato — qui l'import dinamico costa un `await` in
  // più, non un secondo download: il chunk è già in cache a quel punto.
  const deleteAccount = useCallback(async () => {
    const { Users: UsersAPI } = await import('../lib/api.js');
    const result = await UsersAPI.deleteAccount();
    if (!result.error) await supabaseAuth.signOut();
    return result;
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    team,
    caricando,
    authError,
    recovery,
    recoveryKind,
    // Il ruolo passa da toDbRole come ovunque altrove (permissions.js,
    // reducer, persistenza): erano due definizioni diverse di "admin" sulla
    // stessa domanda — qui il confronto era sul valore grezzo della colonna,
    // là normalizzato. Su un profilo con un ruolo storico ("Senior Agent") o
    // con maiuscole diverse i due moduli rispondevano in modo diverso, e
    // quello che decide cosa mostrare non era quello che decide cosa è
    // permesso. toDbRole ritorna null fuori enum: nessuno dei quattro flag si
    // accende, che è il verdetto più restrittivo.
    isAdmin: toDbRole(profile?.role) === 'admin',
    isManager: toDbRole(profile?.role) === 'manager',
    isAgent: toDbRole(profile?.role) === 'agent',
    isDriver: toDbRole(profile?.role) === 'driver',
    signIn,
    resetPassword,
    resendConfirmation,
    updatePassword,
    deleteAccount,
    signOut,
    signOutOvunque,
    refreshTeam,
    retryInit,
  }), [
    session, profile, team, caricando, authError, recovery, recoveryKind,
    signIn, resetPassword, resendConfirmation, updatePassword, deleteAccount, signOut, signOutOvunque, refreshTeam, retryInit,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro <AuthProvider>');
  return ctx;
}
