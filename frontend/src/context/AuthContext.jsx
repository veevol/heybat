import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiUrl } from '../api/baseUrl';
import { supabase } from '../lib/supabase';
import { hasAccess as checkAccess } from '../lib/permissions';

const AuthContext = createContext(null);

async function fetchProfile(accessToken) {
  const res = await fetch(apiUrl('/api/me'), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Gagal memuat profil');
  }
  return data;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback(async (nextSession) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.access_token) {
      setProfile(null);
      return;
    }

    try {
      const me = await fetchProfile(nextSession.access_token);
      setProfile(me);
    } catch (err) {
      console.error('[AuthContext] /api/me', err);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      await applySession(data.session);
      if (active) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Avoid blocking the auth callback; profile fetch is async.
      (async () => {
        await applySession(nextSession);
        if (active) setLoading(false);
      })();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const refreshProfile = useCallback(async () => {
    const {
      data: { session: current },
    } = await supabase.auth.getSession();
    if (!current?.access_token) {
      setProfile(null);
      return null;
    }
    const me = await fetchProfile(current.access_token);
    setProfile(me);
    return me;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw error;
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email || '').trim(),
      password: String(password || ''),
    });
    if (error) throw error;
    await applySession(data.session);
    return data;
  }, [applySession]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  const hasAccess = useCallback(
    (menuKode, aksiKode) => checkAccess(profile, menuKode, aksiKode),
    [profile]
  );

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      hasAccess,
      signInWithGoogle,
      signInWithEmail,
      signOut,
      refreshProfile,
    }),
    [
      session,
      user,
      profile,
      loading,
      hasAccess,
      signInWithGoogle,
      signInWithEmail,
      signOut,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus dipakai di dalam AuthProvider');
  }
  return ctx;
}
