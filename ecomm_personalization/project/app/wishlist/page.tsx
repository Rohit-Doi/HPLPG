'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Heart, ShoppingBag, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { useSession } from '@/contexts/SessionContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { defaultSize, sizesFor } from '@/lib/catalog';
import type { Product } from '@/lib/types';
import ProductCard from '@/components/product/ProductCard';

function WishItem({ p }: { p: Product }) {
  const { remove } = useWishlist();
  const cart = useCart();
  const auth = useAuth();
  const { recordCart } = useSession();
  const sizes = sizesFor(p);
  const preferred = auth.user?.profile?.sizes?.[p.department === 'footwear' ? 'shoe' : 'top'];
  const [size, setSize] = useState<string>(preferred && sizes.includes(preferred) ? preferred : defaultSize(p) || '');
  return (
    <div className="relative flex flex-col">
      <ProductCard product={p} />
      <button type="button" onClick={() => remove(p.id)} aria-label={`Remove ${p.name} from wishlist`} className="absolute right-2.5 top-12 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm">
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="mt-1 flex gap-1.5">
        {sizes.length > 0 && (
          <select aria-label={`Size for ${p.name}`} value={size} onChange={(e) => setSize(e.target.value)} className="w-20 rounded-md border border-gray-300 bg-white px-2 text-xs font-bold focus:border-brand-500 focus:outline-none">
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="btn-outline min-w-0 flex-1 px-2 py-2 text-xs font-bold uppercase text-brand-600"
          onClick={() => {
            cart.add(p.id, sizes.length ? size : null);
            recordCart(p.id);
            remove(p.id);
            toast.success(`Moved to bag${sizes.length ? ` (size ${size})` : ''}`);
          }}
        >
          <ShoppingBag className="h-4 w-4" aria-hidden /> Move to bag
        </button>
      </div>
    </div>
  );
}

export default function WishlistPage() {
  const { products } = useWishlist();

  if (!products.length) {
    return (
      <div className="container flex flex-col items-center py-24 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <Heart className="h-9 w-9 text-brand-600" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-extrabold">Your wishlist is empty</h1>
        <p className="mt-1 text-sm text-gray-500">Tap the heart on any product to save it for later.</p>
        <Link href="/" className="btn-primary mt-6">
          Discover styles
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-2xl font-extrabold">
        My wishlist <span className="text-base font-medium text-gray-500">({products.length} items)</span>
      </h1>
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">
        {products.map((p) => (
          <WishItem key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}
