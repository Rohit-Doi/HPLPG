import Link from 'next/link';
import { Gift, KeyRound, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { POINTS } from '@/lib/storefront';

const PERKS = [
  { icon: Gift, text: `${POINTS.welcome ?? 250} welcome points — 1 point = ₹1 at checkout` },
  { icon: Sparkles, text: 'A home page built around your taste (Level 4)' },
  { icon: Truck, text: 'Order tracking and saved addresses' },
  { icon: ShieldCheck, text: 'Payments are handled by Razorpay (or simulated in test mode) — we never store card details' },
];

/** Two-column AURA frame around Clerk's <SignIn/> / <SignUp/>: marketing points left, the form right. */
export default function AuthShell({ mode, children }: { mode: 'sign-in' | 'sign-up'; children: React.ReactNode }) {
  return (
    <div className="container grid gap-8 py-8 md:grid-cols-[1fr_420px] md:items-start md:py-16 lg:gap-16">
      <div className="hidden min-w-0 md:block">
        <p className="label-xs text-brand-600">AURA accounts</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-ink lg:text-4xl">
          {mode === 'sign-in' ? 'Shopping that starts where you left off.' : 'A store that learns your taste from day one.'}
        </h1>
        <p className="mt-3 max-w-md text-gray-600">
          Signing in lets the landing page agent use your own history, onboarding answers and orders — the warmest cold-start level there is.
        </p>
        <ul className="mt-8 space-y-4">
          {PERKS.map((p) => (
            <li key={p.text} className="flex items-center gap-3 text-sm text-gray-700">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <p.icon className="h-4 w-4" aria-hidden />
              </span>
              {p.text}
            </li>
          ))}
        </ul>
        <p className="mt-8 flex items-center gap-1.5 text-xs text-gray-400">
          <KeyRound className="h-3.5 w-3.5" aria-hidden /> Sign-in, passwords and verification are handled securely by Clerk.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          Want to see how the agent reasons?{' '}
          <Link href="/lab" className="font-semibold text-brand-600 underline">
            Open the Personalization Lab
          </Link>
        </p>
      </div>
      <div className="min-w-0">
        <div className="mb-4 md:hidden">
          <p className="label-xs text-brand-600">AURA accounts</p>
          <p className="mt-1 text-sm text-gray-600">
            {POINTS.welcome ?? 250} welcome points and a home page built around your taste.
          </p>
        </div>
        <div className="flex justify-center md:justify-stretch">{children}</div>
      </div>
    </div>
  );
}
