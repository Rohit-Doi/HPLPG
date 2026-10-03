'use client';

import { useEffect, useState } from 'react';
import { SignIn, SignUp } from '@clerk/nextjs';
import { SIGN_IN_URL, SIGN_UP_URL } from '@/lib/clerk';

/**
 * Clerk mounts its forms imperatively once clerk-js has loaded. When the page segment hydrates after that
 * (streaming), the server HTML (empty) and the client tree differ; mounting after hydration avoids the mismatch.
 */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

const Placeholder = () => <div className="skeleton h-[460px] w-full max-w-[400px] rounded-xl" aria-hidden />;

export function AuraSignIn({ next }: { next: string }) {
  if (!useMounted()) return <Placeholder />;
  return <SignIn path={SIGN_IN_URL} routing="path" signUpUrl={SIGN_UP_URL} fallbackRedirectUrl={next} signUpFallbackRedirectUrl="/welcome" />;
}

export function AuraSignUp() {
  if (!useMounted()) return <Placeholder />;
  return <SignUp path={SIGN_UP_URL} routing="path" signInUrl={SIGN_IN_URL} forceRedirectUrl="/welcome" />;
}
