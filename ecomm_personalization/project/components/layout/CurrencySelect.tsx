'use client';

import { Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { CurrencyCode } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Compact currency switcher (footer). Prices are in INR; other currencies are display conversions. */
export default function CurrencySelect({ className }: { className?: string }) {
  const cur = useCurrency();
  return (
    <label className={cn('inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700', className)}>
      <Globe className="h-3.5 w-3.5 text-gray-400" aria-hidden />
      <span className="sr-only">Display currency</span>
      <select
        value={cur.currency}
        aria-label="Display currency"
        onChange={(e) => cur.setCurrency(e.target.value as CurrencyCode).catch(() => toast.error('Could not save the currency to your account'))}
        className="bg-transparent font-bold focus:outline-none"
      >
        {cur.options.map((c) => (
          <option key={c} value={c}>
            {c} {cur.symbols[c]?.trim()}
          </option>
        ))}
      </select>
      {cur.currency !== 'INR' && (
        <span className="hidden text-[10px] font-normal text-gray-400 sm:inline" title="Prices are set in Indian rupees; you are charged in INR">
          · ₹1,000 = {cur.formatPrice(1000)}
        </span>
      )}
    </label>
  );
}
