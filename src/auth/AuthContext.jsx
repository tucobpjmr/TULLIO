// src/auth/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Users as UsersAPI } from '../lib/api.js';

const AuthContext = createContext(null);

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
  const [loading, setLoading] = useState(true);
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

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); setTeam([]); setAuthError(null); return; }
    try {
      const [{ data: me, error: meError }, { data: all }, { data: contacts }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).single(),
        // Nessun filtro su active: gli admin devono vedere anche utenti pending
        // (per approvarli) e disabilitati. Le viste task usano getAssignableTeam()
        // che filtra a sua volta active=true + pending=false (state/appGlobals.js).
        supabase.from('users').select('*').order('name'),
        // email/phone vivono in public.user_contacts (RLS own+admin). Le carico
        // solo per l'utente loggato e le rimergio nel profilo e nella sua entry
        // di team, così ProfileEditor le mostra (gli altri membri non le hanno,
        // by-design privacy hardening). Vedi migrazione 20260613100833.
        supabase.from('user_contacts').select('email, phone').eq('user_id', userId).maybeSingle(),
      ]);
      if (meError || !me) throw meError || new Error('Profilo non trovato');
      const myContacts = { email: contacts?.email ?? null, phone: contacts?.phone ?? null };
      // Normalizza la colonna DB photo_url → photoUrl (camelCase) atteso da
      // Avatar/ProfileEditor (caveat #25): senza, la foto persistita non si
      // ri-mostrerebbe dopo il reload.
      const normalize = (u) => ({ ...u, photoUrl: u.photo_url ?? null });
      setProfile({ ...normalize(me), ...myContacts });
      setTeam((all ?? []).map(u => u.id === userId ? { ...normalize(u), ...myContacts } : normalize(u)));
      setAuthError(null);
    } catch (err) {
      console.error('[auth] loadProfile failed', err);
      setAuthError(err);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session ?? null);
        await loadProfile(data.session?.user?.id);
      } catch (err) {
        console.error('[auth] init failed', err);
        if (mounted) setAuthError(err);
      } finally {
        // Sempre eseguito: senza questo, un errore/rifiuto in getSession() o
        // loadProfile() lasciava `loading` bloccato a true per sempre (nessun
        // catch a monte → la Promise chain non arrivava mai a setLoading(false)).
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (_event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        setRecoveryKind(prev => prev ?? 'recovery');
      }
      setSession(s);
      await loadProfile(s?.user?.id);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  // Registrazione self-service: il trigger handle_new_auth_user crea il profilo
  // applicativo con pending=true (vedi 20260619_security_dedupe_signup_trigger).
  // Il trigger notify_user_pending avvisa gli admin (Block 3). L'admin deve poi
  // approvare l'utente dal pannello Team prima dell'accesso.
  const signUp = (email, password, name) =>
    supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

  // scope:'local' → esce SOLO dalla scheda/dispositivo corrente. Senza scope,
  // supabase-js usa di default 'global' e revoca TUTTE le sessioni dell'utente
  // su ogni scheda e dispositivo: un logout in un punto invalidava lato server
  // anche le altre schede ancora aperte, che restavano con una sessione "morta"
  // in memoria → la successiva azione privilegiata (es. invito via Edge
  // Function) falliva con "Token non valido" (session_not_found).
  const signOut = () => supabase.auth.signOut({ scope: 'local' });

  // Invia l'email con il link per reimpostare la password. redirectTo riporta
  // l'utente sull'app, dove detectSessionInUrl genera l'evento PASSWORD_RECOVERY.
  const resetPassword = (email) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

  // Reinvia l'email di conferma signup (utile quando l'utente ha registrato un
  // account ma non ha cliccato il link in tempo, o lo ha perso). Supabase
  // emette lo stesso link OTP del signup. Usata dal LoginScreen quando il
  // tentativo di login fallisce con email_not_confirmed.
  const resendConfirmation = (email) =>
    supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin },
    });

  // Aggiorna la password dell'utente nella sessione di recovery, poi esce
  // dalla modalità recovery così l'app monta normalmente.
  const updatePassword = async (password) => {
    const res = await supabase.auth.updateUser({ password });
    if (!res.error) { setRecovery(false); setRecoveryKind(null); }
    return res;
  };

  const refreshTeam = () => loadProfile(session?.user?.id);

  // Self-service account deletion: delegates to delete-account Edge Function,
  // then signs out so the banned user is immediately logged out.
  const deleteAccount = async () => {
    const result = await UsersAPI.deleteAccount();
    if (!result.error) await supabase.auth.signOut();
    return result;
  };

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    team,
    loading,
    authError,
    recovery,
    recoveryKind,
    isAdmin: profile?.role === 'admin',
    isManager: profile?.role === 'manager',
    isAgent: profile?.role === 'agent',
    isDriver: profile?.role === 'driver',
    signIn,
    signUp,
    resetPassword,
    resendConfirmation,
    updatePassword,
    deleteAccount,
    signOut,
    refreshTeam,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro <AuthProvider>');
  return ctx;
}
