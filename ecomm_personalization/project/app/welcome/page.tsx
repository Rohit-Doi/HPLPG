import type { Metadata } from 'next';
import Onboarding from '@/components/account/Onboarding';
import RequireAuth from '@/components/auth/RequireAuth';

export const metadata: Metadata = { title: 'Welcome' };

export default function WelcomePage() {
  return (
    <div className="container max-w-3xl py-8 md:py-12">
      <p className="label-xs text-brand-600">Welcome to AURA</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-ink md:text-3xl">Tell the agent what you like</h1>
      <p className="mb-6 mt-1 text-sm text-gray-500">Three quick steps. Everything here feeds the cold-start model that builds your home page — you can change it any time in your account.</p>
      <RequireAuth next="/welcome">
        <Onboarding />
      </RequireAuth>
    </div>
  );
}
