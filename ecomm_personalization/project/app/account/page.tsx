import type { Metadata } from 'next';
import AccountClient from '@/components/account/AccountClient';

export const metadata: Metadata = { title: 'My account' };

export default function AccountPage() {
  return <AccountClient />;
}
