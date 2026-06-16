// src/auth/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Rileva se la sessione corrente proviene da un link invito/recovery nell'URL hash
// (letto in modo sincrono prima che Supabase lo cancelli).
function detectPasswordSetupNeeded() {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  return hash.includes('type=invite') || hash.includes('type=recovery');
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(detectPasswordSetupNeeded);

  const normalize = (u) => ({ ...u, photoUrl: u.photo_url ?? null });

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); setTeam([]); return; }
    const [{ data: me }, { data: all }, { data: contacts }] = await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      // Carica tutti gli utenti (inclusi pending) per AdminView.
      // getAssignableTeam() in appGlobals filtra già i pending per i task.
      supabase.from('users').select('*').order('name'),
      supabase.from('user_contacts').select('email, phone').eq('user_id', userId).maybeSingle(),
    ]);
    const myContacts = { email: contacts?.email ?? null, phone: contacts?.phone ?? null };
    setProfile(me ? { ...normalize(me), ...myContacts } : null);
    setTeam((all ?? []).map(u => u.id === userId ? { ...normalize(u), ...myContacts } : normalize(u)));
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      await loadProfile(data.session?.user?.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      await loadProfile(s?.user?.id);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = () => supabase.auth.signOut();

  const refreshTeam = () => loadProfile(session?.user?.id);

  // Imposta la password (usato dal SetPasswordScreen dopo click su link invito).
  const updatePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setNeedsPasswordSetup(false);
    return { error };
  };

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    team,
    loading,
    needsPasswordSetup,
    isAdmin: profile?.role === 'admin',
    isManager: profile?.role === 'manager',
    isAgent: profile?.role === 'agent',
    isDriver: profile?.role === 'driver',
    signIn,
    signOut,
    refreshTeam,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro <AuthProvider>');
  return ctx;
}
