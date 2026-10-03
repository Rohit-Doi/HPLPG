'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth as useClerkAuth, useClerk, useUser } from '@clerk/nextjs';
import { toast } from 'sonner';
import { fetchMe, setAuthTokenGetter, updateProfile as apiUpdateProfile } from '@/lib/api';
import { clerkEnabled } from '@/lib/clerk';
import { KEYS, readJSON, removeKey, writeJSON } from '@/lib/storage';
import type { Profile, User } from '@/lib/types';

/** Contact details from the Clerk user, used to prefill checkout / onboarding. */
export type Contact = { name: string; email: string; phone: string; imageUrl: string };

type AuthState = {
  /** false until Clerk has loaded (and, when signed in, until the account record is known) */
  ready: boolean;
  /** false when Clerk is not configured (no publishable key): the store is guest-only */
  enabled: boolean;
  /** our backend account (GET /auth/me): points, profile, onboarded … */
  user: User | null;
  /**
   * Stable id of the signed-in account (the Clerk user id) once /auth/me answered — null for guests.
   * Contexts key their guest→account merges on it. It is NOT a token.
   */
  accountKey: string | null;
  signedIn: boolean;
  /** true when the API could not be reached / rejected the session (account data is cached or minimal) */
  offline: boolean;
  /** name / email / phone from Clerk (null when signed out) */
  contact: Contact | null;
  /** re-fetch /auth/me (points, profile) */
  refresh: () => Promise<User | null>;
  updateProfile: (p: Profile & { onboarded?: boolean }) => Promise<User>;
  /** merge a user object returned by another endpoint (e.g. order → pointsBalance) */
  patchUser: (patch: Partial<User>) => void;
  /** Clerk signOut() + clear local account state. `quiet` skips the "Signed out" toast. */
  signOut: (opts?: { redirectUrl?: string; quiet?: boolean }) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type CachedUser = { clerkId: string; user: User };

function readCache(clerkId: string): User | null {
  const c = readJSON<CachedUser | null>(KEYS.user, null);
  return c && c.clerkId === clerkId && c.user && typeof c.user === 'object' ? c.user : null;
}

function writeCache(clerkId: string, user: User) {
  writeJSON(KEYS.user, { clerkId, user } satisfies CachedUser);
}

/** Paths where an automatic jump to /welcome would interrupt the visitor. */
const NO_WELCOME = [/^\/welcome/, /^\/checkout/, /^\/orders\//, /^\/sign-(in|up)/];

/* --------------------------------- Clerk-backed --------------------------------- */

function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const clerk = useClerk();
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  /** Clerk id whose /auth/me answered successfully */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const current = useRef<string | null | undefined>(undefined);
  const quietSignOut = useRef(false);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // Every API call asks Clerk for the session token (Clerk caches + refreshes it). Registered during
  // render so it is in place before children's effects fire their first requests.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const registered = useRef(false);
  if (!registered.current) {
    registered.current = true;
    setAuthTokenGetter(async () => {
      try {
        return (await getTokenRef.current()) ?? null;
      } catch {
        return null;
      }
    });
  }
  useEffect(() => () => setAuthTokenGetter(null), []);

  const contact = useMemo<Contact | null>(() => {
    if (!isSignedIn || !clerkUser) return null;
    return {
      name: clerkUser.fullName || [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || '',
      email: clerkUser.primaryEmailAddress?.emailAddress || '',
      phone: clerkUser.primaryPhoneNumber?.phoneNumber || '',
      imageUrl: clerkUser.hasImage ? clerkUser.imageUrl : '',
    };
  }, [isSignedIn, clerkUser]);

  const contactRef = useRef(contact);
  contactRef.current = contact;

  /** Minimal stand-in when /auth/me is unreachable, so signed-in UI still renders. */
  const fallbackUser = useCallback((): User => {
    const c = contactRef.current;
    return {
      id: 0,
      email: c?.email || '',
      name: c?.name || c?.email?.split('@')[0] || 'Member',
      provider: 'clerk',
      avatar: '',
      points: 0,
      onboarded: true,
      memberSince: '',
      profile: {},
    };
  }, []);

  const maybeWelcome = useCallback(
    (id: string, u: User) => {
      if (u.onboarded !== false) return;
      const seen = readJSON<string[]>(KEYS.welcomed, []);
      if (seen.includes(id)) return;
      writeJSON(KEYS.welcomed, [...seen, id].slice(-20));
      if (NO_WELCOME.some((r) => r.test(pathRef.current || ''))) return;
      router.push('/welcome');
    },
    [router],
  );

  const loadMe = useCallback(
    async (id: string): Promise<User | null> => {
      try {
        const u = await fetchMe();
        if (current.current !== id) return null;
        setUser(u);
        writeCache(id, u);
        setOffline(false);
        setLoadedFor(id);
        maybeWelcome(id, u);
        return u;
      } catch {
        if (current.current !== id) return null;
        // API down or the session was rejected: keep Clerk's sign-in, show cached / minimal data
        setOffline(true);
        setUser((prev) => prev ?? readCache(id) ?? fallbackUser());
        return null;
      }
    },
    [fallbackUser, maybeWelcome],
  );

  // react to Clerk sign-in / sign-out (also when it happens via <UserButton/> or another tab)
  useEffect(() => {
    if (!isLoaded) return;
    const id = isSignedIn && userId ? userId : null;
    if (current.current === id) return;
    const prev = current.current;
    current.current = id;
    if (!id) {
      setUser(null);
      setLoadedFor(null);
      setOffline(false);
      removeKey(KEYS.user);
      if (prev) {
        removeKey(KEYS.checkout);
        if (!quietSignOut.current) toast.success('Signed out');
      }
      quietSignOut.current = false;
      return;
    }
    const cached = readCache(id);
    setUser(cached);
    setLoadedFor(null);
    loadMe(id);
  }, [isLoaded, isSignedIn, userId, loadMe]);

  const refresh = useCallback(async () => (current.current ? loadMe(current.current) : null), [loadMe]);

  const updateProfile = useCallback(async (p: Profile & { onboarded?: boolean }) => {
    const u = await apiUpdateProfile(p);
    setUser(u);
    if (current.current) writeCache(current.current, u);
    return u;
  }, []);

  const patchUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (current.current) writeCache(current.current, next);
      return next;
    });
  }, []);

  const signOut = useCallback(
    async (opts: { redirectUrl?: string; quiet?: boolean } = {}) => {
      quietSignOut.current = !!opts.quiet;
      removeKey(KEYS.user);
      removeKey(KEYS.checkout);
      await clerk.signOut({ redirectUrl: opts.redirectUrl ?? '/' });
    },
    [clerk],
  );

  const signedIn = isLoaded && !!isSignedIn && !!user;
  const ready = isLoaded && (!isSignedIn || !!user);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      enabled: true,
      user: signedIn ? user : null,
      accountKey: signedIn && loadedFor && loadedFor === userId ? loadedFor : null,
      signedIn,
      offline,
      contact,
      refresh,
      updateProfile,
      patchUser,
      signOut,
    }),
    [ready, signedIn, user, loadedFor, userId, offline, contact, refresh, updateProfile, patchUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ----------------------------- guest-only (no Clerk) ----------------------------- */

const notConfigured = () => Promise.reject(new Error("Sign-in isn't configured yet"));

const GUEST: AuthState = {
  ready: true,
  enabled: false,
  user: null,
  accountKey: null,
  signedIn: false,
  offline: false,
  contact: null,
  refresh: async () => null,
  updateProfile: notConfigured,
  patchUser: () => undefined,
  signOut: async () => undefined,
};

function GuestAuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContext.Provider value={GUEST}>{children}</AuthContext.Provider>;
}

/** Clerk when a publishable key is configured, otherwise a guest-only stub (the flag is fixed at build time). */
export const AuthProvider = clerkEnabled ? ClerkAuthProvider : GuestAuthProvider;

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Initials for the avatar bubble. */
export function initials(name?: string | null, email?: string | null) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  const a = parts[0]?.[0] || '?';
  const b = parts.length > 1 ? parts[1][0] : '';
  return (a + b).toUpperCase();
}
