'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, Home, LayoutGrid, Search, ShoppingBag } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { cn } from '@/lib/utils';

/** Mobile bottom tab bar (Home, Categories, Search, Wishlist, Bag). Hidden on lg+. */
export default function BottomTabs() {
  const pathname = usePathname();
  const { count } = useCart();
  const { ids } = useWishlist();
  if (pathname.startsWith('/lab') || pathname.startsWith('/checkout')) return null;
  const active = (h: string) => (h === '/' ? pathname === '/' : pathname.startsWith(h));
  const cls = (on: boolean) => cn('relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold', on ? 'text-brand-600' : 'text-gray-500');
  return (
    <nav aria-label="Bottom navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="flex">
        <Link href="/" className={cls(active('/'))}>
          <Home className="h-5 w-5" aria-hidden /> Home
        </Link>
        <button type="button" onClick={() => window.dispatchEvent(new Event('aura:open-menu'))} className={cls(active('/shop'))}>
          <LayoutGrid className="h-5 w-5" aria-hidden /> Categories
        </button>
        <Link href="/search" className={cls(active('/search'))}>
          <Search className="h-5 w-5" aria-hidden /> Search
        </Link>
        <Link href="/wishlist" className={cls(active('/wishlist'))}>
          <Heart className="h-5 w-5" aria-hidden /> Wishlist
          {ids.length > 0 && <span className="absolute right-[22%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-800 px-1 text-[10px] font-bold text-white">{ids.length}</span>}
        </Link>
        <Link href="/cart" className={cls(active('/cart'))}>
          <ShoppingBag className="h-5 w-5" aria-hidden /> Bag
          {count > 0 && <span className="absolute right-[22%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{count}</span>}
        </Link>
      </div>
    </nav>
  );
}
