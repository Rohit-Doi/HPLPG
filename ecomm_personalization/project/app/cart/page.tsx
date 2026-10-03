import type { Metadata } from 'next';
import CartClient from '@/components/checkout/CartClient';

export const metadata: Metadata = { title: 'Your bag' };

export default function CartPage() {
  return <CartClient />;
}
