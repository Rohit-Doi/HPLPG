import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import AuthNotConfigured from '@/components/auth/AuthNotConfigured';
import { AuraSignUp } from '@/components/auth/ClerkForms';
import { clerkEnabled } from '@/lib/clerk';

export const metadata: Metadata = { title: 'Create account' };

/** Clerk sign-up in the AURA frame; new members always continue to the /welcome onboarding. */
export default function SignUpPage() {
  return <AuthShell mode="sign-up">{clerkEnabled ? <AuraSignUp /> : <AuthNotConfigured />}</AuthShell>;
}
