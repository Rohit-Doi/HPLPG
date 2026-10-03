import Link from 'next/link';
import { KeyRound } from 'lucide-react';

/** Shown instead of Clerk's forms when no publishable key is configured. */
export default function AuthNotConfigured() {
  return (
    <div className="card w-full p-6 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <KeyRound className="h-5 w-5" aria-hidden />
      </span>
      <h2 className="mt-3 text-lg font-extrabold text-ink">Sign-in isn&apos;t configured yet</h2>
      <p className="mt-1 text-sm text-gray-500">
        Accounts need a Clerk publishable key (<code className="font-mono text-xs">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>). You can still browse,
        build a bag and check out as a guest.
      </p>
      <Link href="/" className="btn-primary mt-5">
        Continue shopping
      </Link>
    </div>
  );
}
