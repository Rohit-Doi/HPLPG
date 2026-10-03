'use client';

import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { KEYS, readJSON } from '@/lib/storage';
import { AuthProvider } from '@/contexts/AuthContext';
import { SessionProvider } from '@/contexts/SessionContext';
import { CartProvider } from '@/contexts/CartContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { WishlistProvider } from '@/contexts/WishlistContext';

/** Applies the saved theme (mirrors /me/settings.theme) before the account settings load. */
function ThemeBoot() {
  useEffect(() => {
    const t = readJSON<string>(KEYS.theme, 'light');
    document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light';
  }, []);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <SessionProvider>
          <CartProvider>
            <WishlistProvider>
              <ThemeBoot />
              {children}
              <Toaster position="bottom-center" richColors closeButton toastOptions={{ duration: 2500 }} />
            </WishlistProvider>
          </CartProvider>
        </SessionProvider>
      </CurrencyProvider>
    </AuthProvider>
  );
}
