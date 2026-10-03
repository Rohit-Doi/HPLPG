import { redirect } from 'next/navigation';

// Legacy route from the old prototype — kept as a redirect.
export default function LegacyRedirect() {
  redirect('/');
}
