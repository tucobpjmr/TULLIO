// src/auth/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabaseAuth } from '../lib/supabaseAuth.js';
import { toDbRole } from '../lib/taskConstants.js';
import { messaggioCambioPassword } from '../lib/erroriCambioPassword.js';

const AuthContext = createContext(null);

// Timeout per l'init auth (getSession + profilo). Su mobile una richiesta può
// restare appesa per sempre (lock del refresh token, socket morto): senza,
// lo spinner «Caricamento…» non si chiuderebbe mai. withTimeout la fa
// rigettare e rientrare nella gestione errori (authError + retry).
const AUTH_TIMEOUT_MS = 15000;

// A-1 · Tetto alla revoca delle push al logout: oltre, si esce comunque.
export const REVOCA_PUSH_TIMEOUT_MS = 5000;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[auth] ${label} in timeout dopo ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Ritenta in silenzio l'init prima di arrendersi: al primo avvio a freddo la
// PRIMA richiesta può fallire e la seconda riuscire.
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

// Il tipo di link Auth dal frammento URL. ⚠️ I link di INVITO non emettono
// PASSWORD_RECOVERY (arrivano come SIGNED_IN con `type=invite`): senza questo
// l'invitato non vedrebbe mai «imposta password». Letto prima che
// detectSessionInUrl ripulisca l'hash.
//
// M-2 · `type` vale solo accanto a un token: un `?type=recovery` scritto a
// mano (o in un link malevolo) non deve aprire «imposta password».
const CHIAVI_TOKEN = ['access_token', 'token_hash', 'token', 'code'];
export function detectAuthLinkType(posizione = typeof window === 'undefined' ? null : window.location) {
  if (!posizione) return null;
  const fromStr = (s) => {
    const p = new URLSearchParams((s || '').replace(/^[#?]/, ''));
    return CHIAVI_TOKEN.some((k) => p.get(k)) ? p.get('type') : null;
  };
  const t = fromStr(posizione.hash) || fromStr(posizione.search);
  return t === 'invite' || t === 'recovery' ? t : null;
}

// Catturato una volta al caricamento del modulo, prima del primo render.
const INITIAL_AUTH_LINK_TYPE = detectAuthLinkType();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [team, setTeam] = useState([]);
  const [caricando, impostaCaricando] = useState(true);
  // recovery=true: link che chiede di impostare la password (recupero o invito).
  // Si mostra quella schermata anche con una session valida; recoveryKind
  // adatta i testi.
  const [recovery, setRecovery] = useState(!!INITIAL_AUTH_LINK_TYPE);
  const [recoveryKind, setRecoveryKind] = useState(INITIAL_AUTH_LINK_TYPE);
  // Errore dell'init: si mostra un retry esplicito invece di uno spinner eterno.
  const [authError, setAuthError] = useState(null);
  // La funzione di init corrente, per rieseguirla da retryInit.
  const initAuthRef = useRef(null);
  // M-1 · L'utente il cui profilo è già caricato (null: nessuno, o da rileggere).
  const profiloCaricatoRef = useRef(null);
  // Un solo caricamento profilo in volo per utente: all'avvio initAuth e
  // INITIAL_SESSION lo chiedevano insieme, e uno dei due poteva fallire.
  const caricamentoInVoloRef = useRef(null);

  const caricaProfilo = useCallback((userId) => {
    const key = userId ?? null;
    const inflight = caricamentoInVoloRef.current;
    if (inflight && inflight.key === key) return inflight.promise;

    const promise = (async () => {
      if (!userId) { profiloCaricatoRef.current = null; setProfile(null); setTeam([]); setAuthError(null); return; }
      try {
        // B-2 · Import dinamico: è l'unica riga che tocca il client pieno. Chi resta
        // sul login non scarica mai postgrest/realtime/storage.
        const { getSupabase } = await import('../lib/supabase.js');
        const supabase = await getSupabase();
        const { me, all, contacts } = await withRetry(async () => {
          const [{ data: me, error: meError }, { data: all, error: allError }, { data: contacts }] = await withTimeout(
            Promise.all([
              supabase.from('users').select('*').eq('id', userId).single(),
              // Nessun filtro su active: l'admin vede anche pending e disattivati.
              // getAssignableTeam() filtra per le viste task.
              supabase.from('users').select('*').order('name'),
              // email/phone stanno in public.user_contacts: si caricano per l'utente
              // loggato e si rimettono nel profilo e nella sua entry di team.
              // Non è una restrizione di sicurezza. La policy di SELECT oggi è
              // `user_id = auth.uid() or private.can_liste()` (il driver ne è fuori);
              // INSERT/UPDATE restano own+admin. ⚠️ Questo commento è già stato sbagliato
              // due volte: a tenerlo onesto è il caso in src/test/integration/rls.test.js.
              supabase.from('user_contacts').select('email, phone').eq('user_id', userId).maybeSingle(),
            ]),
            AUTH_TIMEOUT_MS,
            'caricaProfilo',
          );
          // Errori o righe mancanti rientrano nel retry: a freddo il token può non
          // essere ancora rinfrescato.
          if (meError || !me) throw meError || new Error('Profilo non trovato');
          if (allError) throw allError;
          // B-1 · La propria riga di `users` è sempre leggibile: un team senza chi ha
          // fatto login è una risposta incoerente. Retry; se persiste, AuthGate
          // mostra l'errore.
          if (!all?.some((u) => u.id === userId)) throw new Error('Team vuoto o incompleto');
          return { me, all, contacts };
        }, 'caricaProfilo');
        const myContacts = { email: contacts?.email ?? null, phone: contacts?.phone ?? null };
        // photo_url → photoUrl, atteso da Avatar/ProfileEditor.
        const normalize = (u) => ({ ...u, photoUrl: u.photo_url ?? null });
        setProfile({ ...normalize(me), ...myContacts });
        // M-1 · Un invitato in attesa resta fuori: per lui il ritorno sulla
        // scheda deve continuare a rileggere il profilo (l'approvazione).
        profiloCaricatoRef.current = me.pending ? null : userId;
        setTeam((all ?? []).map(u => u.id === userId ? { ...normalize(u), ...myContacts } : normalize(u)));
        setAuthError(null);
      } catch (err) {
        console.error('[auth] caricaProfilo fallito dopo i retry', err);
        profiloCaricatoRef.current = null;
        setAuthError(err);
      }
    })();

    caricamentoInVoloRef.current = { key, promise };
    // Libera lo slot: la richiesta successiva riparte da capo.
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
        // Sempre eseguito: altrimenti un errore lascerebbe `caricando` a true.
        if (mounted) impostaCaricando(false);
      }
    };
    // retryInit riesegue l'intera sequenza (anche getSession), non solo il profilo.
    initAuthRef.current = initAuth;
    initAuth();

    // ⚠️ Questo callback DEVE restare SINCRONO: gotrue lo chiama tenendo il lock
    // auth (navigator.locks) e aspetta che finisca. Una query awaited qui chiede
    // lo stesso lock per il token → deadlock («Caricamento…» bloccato a ogni
    // avvio). setTimeout(0) rimanda il lavoro a dopo il ritorno del callback.
    const { data: sub } = supabaseAuth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        setRecoveryKind(prev => prev ?? 'recovery');
      }
      // B-2 · TOKEN_REFRESHED arriva a ogni rinnovo del token. La session si
      // sostituisce solo quando cambia CHI è collegato: nessun consumatore legge il
      // token da qui (le richieste lo prendono dal client).
      setSession(prev => ((prev?.user?.id ?? null) === (s?.user?.id ?? null) ? prev : s));
      // Il rinnovo del token non cambia né il profilo né il team.
      if (evento === 'TOKEN_REFRESHED') return;
      // M-1 · gotrue emette SIGNED_IN a OGNI ritorno sulla scheda. Con lo stesso
      // utente e il profilo già caricato non c'è niente da rileggere: tre query
      // e un `team` nuovo a ogni cambio di finestra. Il team lo tiene fresco la
      // sottoscrizione `users` di useAppHydration.
      if (evento === 'SIGNED_IN' && s?.user?.id && s.user.id === profiloCaricatoRef.current) return;
      setTimeout(() => {
        if (!mounted) return;
        caricaProfilo(s?.user?.id).finally(() => {
          // Sblocca lo spinner anche da qui: a freddo getSession() può restare appesa,
          // e session e profilo arrivano da INITIAL_SESSION.
          if (mounted) impostaCaricando(false);
        });
      }, 0);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [caricaProfilo]);

  // useCallback per tutte: sono dipendenze del useMemo di `value`.
  const signIn = useCallback((email, password) =>
    supabaseAuth.signInWithPassword({ email, password }), []);

  // La registrazione self-service non esiste (S-13): si entra solo per invito.
  // Il trigger handle_new_auth_user crea comunque il profilo con pending=true.

  // B-4 · `signOut()` non ricarica la pagina: si svuotano le cache di signed
  // URL, o le vedrebbe chi entra dopo nella stessa scheda. Import dinamico come
  // deleteAccount.
  const svuotaCache = useCallback(async () => {
    const { svuotaCacheUrl } = await import('../lib/api.js');
    svuotaCacheUrl();
  }, []);

  // A-1 · All'uscita si revocano le push di questo dispositivo (PC condivisi).
  // PRIMA del signOut (la DELETE passa dalla RLS) e con un tetto di tempo.
  const uidSessione = session?.user?.id ?? null;
  const revocaPush = useCallback(async (opzioni) => {
    try {
      const { revocaPushAlLogout } = await import('../lib/push.js');
      await withTimeout(revocaPushAlLogout(uidSessione, opzioni), REVOCA_PUSH_TIMEOUT_MS, 'revocaPush');
    } catch (err) {
      console.warn('[auth] revoca push al logout non completata', err);
    }
  }, [uidSessione]);

  // M-4 · All'uscita si tolgono le scritture offline di chi esce (su IndexedDB
  // c'è l'azione intera). L'avviso a chi le perderebbe lo dà il guscio
  // (shell/confermaUscita.js).
  const svuotaCoda = useCallback(async () => {
    try {
      const { svuotaScrittureDi } = await import('../state/codaDispositivo.js');
      await svuotaScrittureDi(uidSessione);
    } catch (err) {
      console.warn('[auth] coda offline non svuotata al logout', err);
    }
  }, [uidSessione]);

  // scope:'local': esce solo da questa scheda/dispositivo. Il default 'global'
  // revocherebbe le sessioni delle altre schede aperte.
  const signOut = useCallback(async () => {
    await revocaPush({ ovunque: false });
    const res = await supabaseAuth.signOut({ scope: 'local' });
    // M-3 · Senza rete gotrue torna errore e la sessione resta aperta: la coda
    // offline si svuota solo a uscita avvenuta, o si perde lavoro restando dentro.
    if (res?.error) return res;
    await svuotaCoda();
    await svuotaCache();
    return res;
  }, [revocaPush, svuotaCoda, svuotaCache]);

  // Uscita da OGNI dispositivo (dispositivo perso): revoca i refresh token e le
  // push ovunque. Qui la sessione morta nelle altre schede è voluta.
  const signOutOvunque = useCallback(async () => {
    await revocaPush({ ovunque: true });
    const res = await supabaseAuth.signOut({ scope: 'global' });
    if (res?.error) return res; // M-3, come signOut
    await svuotaCoda();
    await svuotaCache();
    return res;
  }, [revocaPush, svuotaCoda, svuotaCache]);

  // Email con il link per reimpostare la password (evento PASSWORD_RECOVERY).
  const resetPassword = useCallback((email) =>
    supabaseAuth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    }), []);

  // Reinvia l'email di conferma (login fallito con email_not_confirmed).
  const resendConfirmation = useCallback((email) =>
    supabaseAuth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin },
    }), []);

  // Password nella sessione di recovery, poi si esce dalla modalità recovery.
  // ⛔ Solo recupero e primo accesso da invito: lì non c'è una password
  // attuale. Dal profilo si usa `cambiaPassword`.
  const updatePassword = useCallback(async (password) => {
    const res = await supabaseAuth.updateUser({ password });
    if (!res.error) { setRecovery(false); setRecoveryKind(null); }
    return res;
  }, []);

  // A-3 · Dal profilo serve la password ATTUALE. La verifica la fa GoTrue
  // («Require current password when changing password»), non questo file.
  // `current_password` con l'underscore: va così com'è nel corpo della PUT.
  const cambiaPassword = useCallback(async (attuale, nuova) => {
    const res = await supabaseAuth.updateUser({ password: nuova, current_password: attuale });
    if (res.error) return { ...res, error: { ...res.error, message: messaggioCambioPassword(res.error) } };
    return res;
  }, []);

  // M-2 · Uscita da «imposta password» senza cambiarla: prima la schermata non
  // aveva una via d'uscita. Toglie anche `type` dall'URL, o un ricarico la riapre.
  const annullaRecovery = useCallback(() => {
    setRecovery(false);
    setRecoveryKind(null);
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (!p.has('type')) return;
    p.delete('type');
    const qs = p.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);

  const refreshTeam = useCallback(() => caricaProfilo(session?.user?.id), [session, caricaProfilo]);

  // Retry quando la session stessa non è mai arrivata: tutta la sequenza init.
  const retryInit = useCallback(() => initAuthRef.current?.(), []);

  // Elimina account: Edge Function delete-account, poi sign out. A-3 · Senza la
  // password la funzione non elimina niente (la verifica è sua). Import
  // dinamico di lib/api.js come in caricaProfilo.
  const deleteAccount = useCallback(async (password) => {
    const { Users: UsersAPI } = await import('../lib/api.js');
    const result = await UsersAPI.deleteAccount(password);
    if (!result.error) {
      // Le righe di push_subscriptions le cancella la Edge Function; qui si revoca
      // la sottoscrizione del browser e l'intenzione.
      await revocaPush({ ovunque: false });
      await svuotaCoda();
      await supabaseAuth.signOut();
      await svuotaCache();
    }
    return result;
  }, [revocaPush, svuotaCoda, svuotaCache]);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    team,
    caricando,
    authError,
    recovery,
    recoveryKind,
    // Il ruolo passa da toDbRole come ovunque: un ruolo fuori enum non accende
    // nessun flag, il verdetto più restrittivo.
    isAdmin: toDbRole(profile?.role) === 'admin',
    isManager: toDbRole(profile?.role) === 'manager',
    isAgent: toDbRole(profile?.role) === 'agent',
    isDriver: toDbRole(profile?.role) === 'driver',
    signIn,
    resetPassword,
    resendConfirmation,
    updatePassword,
    annullaRecovery,
    cambiaPassword,
    deleteAccount,
    signOut,
    signOutOvunque,
    refreshTeam,
    retryInit,
  }), [
    session, profile, team, caricando, authError, recovery, recoveryKind,
    signIn, resetPassword, resendConfirmation, updatePassword, annullaRecovery, cambiaPassword, deleteAccount, signOut, signOutOvunque, refreshTeam, retryInit,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro <AuthProvider>');
  return ctx;
}
