import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { SIGN_IN_URL, SIGN_UP_URL, clerkEnabled, safeNext } from '@/lib/clerk';

/**
 * Account pages need a Clerk session; everything else (browsing, cart, guest checkout, and
 * /orders/[id] — guest confirmations are looked up by visitorId, the API enforces ownership) stays public.
 */
const isProtectedRoute = createRouteMatcher(['/account(.*)', '/welcome(.*)']);

/** Pre-Clerk auth routes → Clerk pages (password resets live inside Clerk's sign-in flow), keeping `?next=`. */
const LEGACY: Record<string, string> = {
  '/login': SIGN_IN_URL,
  '/signup': SIGN_UP_URL,
  '/forgot-password': SIGN_IN_URL,
  '/reset-password': SIGN_IN_URL,
};

function legacyRedirect(req: NextRequest) {
  const target = LEGACY[req.nextUrl.pathname.replace(/\/$/, '')];
  if (!target) return null;
  const url = new URL(target, req.url);
  const next = safeNext(req.nextUrl.searchParams.get('next'), '');
  if (next) url.searchParams.set('next', next);
  return NextResponse.redirect(url, 307);
}

const withClerk = clerkEnabled
  ? clerkMiddleware(
      async (auth, req) => {
        const legacy = legacyRedirect(req);
        if (legacy) return legacy;
        if (isProtectedRoute(req)) await auth.protect();
      },
      { signInUrl: SIGN_IN_URL, signUpUrl: SIGN_UP_URL },
    )
  : null;

/** Without a publishable key the store runs guest-only: no Clerk, only the legacy redirects. */
export default withClerk ?? ((req: NextRequest) => legacyRedirect(req) ?? NextResponse.next());

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
