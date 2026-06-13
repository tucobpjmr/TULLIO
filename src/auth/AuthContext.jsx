// src/auth/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); setTeam([]); return; }
    const [{ data: me }, { data: all }, { data: contacts }] = await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      supabase.from('users').select('*').eq('active', true).order('name'),
      // email/phone vivono in public.user_contacts (RLS own+admin). Le carico
      // solo per l'utente loggato e le rimergio nel profilo e nella sua entry
      // di team, così ProfileEditor le mostra (gli altri membri non le hanno,
      // by-design privacy hardening). Vedi migrazione 20260613100833.
      supabase.from('user_contacts').select('email, phone').eq('user_id', userId).maybeSingle(),
    ]);
    const myContacts = { email: contacts?.email ?? null, phone: contacts?.phone ?? null };
    setProfile(me ? { ...me, ...myContacts } : null);
    setTeam((all ?? []).map(u => u.id === userId ? { ...u, ...myContacts } : u));
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

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    team,
    loading,
    isAdmin: profile?.role === 'admin',
    isManager: profile?.role === 'manager',
    isAgent: profile?.role === 'agent',
    isDriver: profile?.role === 'driver',
    signIn,
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
