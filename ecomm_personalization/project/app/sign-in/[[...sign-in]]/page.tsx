import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import AuthNotConfigured from '@/components/auth/AuthNotConfigured';
import { AuraSignIn } from '@/components/auth/ClerkForms';
import { clerkEnabled, safeNext } from '@/lib/clerk';

export const metadata: Metadata = { title: 'Sign in' };

/** Clerk sign-in in the AURA frame. Clerk's own `redirect_url` wins; `?next=` (our links) is the fallback; default `/`. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === 'string' ? sp.next : undefined, '/');
  return <AuthShell mode="sign-in">{clerkEnabled ? <AuraSignIn next={next} /> : <AuthNotConfigured />}</AuthShell>;
}
