'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SIGN_IN_URL } from '@/lib/clerk';
import AuthNotConfigured from './AuthNotConfigured';

/** Set while a page deliberately navigates away after sign-out / account deletion, so the guard stays quiet. */
let leaving = false;
export function markLeaving() {
  leaving = true;
}

/**
 * Client-side guard that mirrors the middleware (`auth.protect()` on /account, /welcome): renders children only
 * when signed in, otherwise sends the visitor to /sign-in?next=. Without Clerk it explains that accounts are off.
 */
export default function RequireAuth({ children, next, fallback }: { children: React.ReactNode; next: string; fallback?: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.signedIn) leaving = false;
    else if (auth.enabled && auth.ready && !leaving) router.replace(`${SIGN_IN_URL}?next=${encodeURIComponent(next)}`);
  }, [auth.enabled, auth.ready, auth.signedIn, next, router]);
  if (!auth.enabled)
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <AuthNotConfigured />
      </div>
    );
  if (!auth.ready || !auth.signedIn) return <>{fallback ?? <div className="skeleton h-64" />}</>;
  return <>{children}</>;
}
