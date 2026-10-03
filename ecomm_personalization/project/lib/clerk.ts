// Clerk configuration shared by the server layout, middleware and client components.
// NEXT_PUBLIC_* values are inlined at build time, so this flag is identical on the server and in the browser.
import type { ComponentProps } from 'react';
import type { SignIn } from '@clerk/nextjs';

export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

/** false when no publishable key is configured: the store then runs guest-only (no ClerkProvider, pass-through middleware). */
export const clerkEnabled = CLERK_PUBLISHABLE_KEY.length > 0;

export const SIGN_IN_URL = '/sign-in';
export const SIGN_UP_URL = '/sign-up';

/** Only same-origin paths are accepted as post-auth destinations (no `//evil.com`, no absolute URLs). */
export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  let v = raw;
  // Clerk passes an absolute `redirect_url`; keep it when it points back at this site
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (typeof window === 'undefined' || u.origin !== window.location.origin) return fallback;
      v = u.pathname + u.search + u.hash;
    } catch {
      return fallback;
    }
  }
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : fallback;
}

type Appearance = NonNullable<ComponentProps<typeof SignIn>['appearance']>;

/** Copy overrides so Clerk's forms speak as AURA (instead of the dashboard's application name). */
export const clerkLocalization = {
  signIn: { start: { title: 'Sign in to AURA', subtitle: 'Welcome back! Your points and picks are waiting.' } },
  signUp: { start: { title: 'Create your AURA account', subtitle: 'Get 250 welcome points and a home page built around your taste.' } },
};

/** AURA look for every Clerk component: brand rose (#e11d48), Inter, 6px radius like `.btn` / `.input`. */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: '#e11d48',
    colorPrimaryForeground: '#ffffff',
    colorDanger: '#be123c',
    colorForeground: '#282c3f',
    colorMutedForeground: '#6b7280',
    colorInputForeground: '#282c3f',
    colorBackground: '#ffffff',
    colorInput: '#ffffff',
    colorRing: '#fecdd3',
    colorBorder: '#d1d5db',
    fontFamily: 'var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif',
    fontFamilyButtons: 'var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif',
    borderRadius: '0.375rem',
  },
  options: {
    logoPlacement: 'none',
    socialButtonsVariant: 'blockButton',
    socialButtonsPlacement: 'top',
  } as Appearance['options'],
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full max-w-full shadow-card border border-gray-100 rounded-xl',
    card: 'shadow-none',
    headerTitle: 'text-xl font-extrabold tracking-tight text-ink',
    headerSubtitle: 'text-sm text-gray-500',
    formButtonPrimary: 'bg-brand-600 hover:bg-brand-700 text-sm font-semibold normal-case shadow-none',
    socialButtonsBlockButton: 'border-gray-300 hover:border-ink text-ink font-semibold',
    socialButtonsRoot: 'mb-3',
    dividerRow: 'hidden', // no "or" divider between the social buttons and the email form
    formFieldInput: 'text-sm focus:border-brand-500',
    footerActionLink: 'text-brand-600 font-bold hover:text-brand-700',
    identityPreviewEditButton: 'text-brand-600',
  },
};
