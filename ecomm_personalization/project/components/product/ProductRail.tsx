'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from './ProductCard';
import type { Product } from '@/lib/types';
import { cn } from '@/lib/utils';

type Props = { products: Product[]; compact?: boolean; showWhy?: boolean };

/** Horizontal scroll-snap rail with desktop arrow buttons. */
export default function ProductRail({ products, compact, showWhy }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update, products.length]);

  const scroll = (dir: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        className={cn('no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2', compact ? 'gap-3' : 'md:gap-4')}
      >
        {products.map((p, i) => (
          <div
            key={p.id}
            className={cn(
              'shrink-0 snap-start',
              compact ? 'w-[42%]' : 'w-[44%] sm:w-[30%] md:w-[23%] lg:w-[18.5%]',
            )}
          >
            <ProductCard product={p} showWhy={showWhy} priority={i < 2} />
          </div>
        ))}
      </div>
      {!compact && (
        <>
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scroll(-1)}
            className={cn(
              'absolute -left-4 top-[38%] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white shadow-card transition hover:scale-105 md:flex',
              edges.start && 'pointer-events-none opacity-0',
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scroll(1)}
            className={cn(
              'absolute -right-4 top-[38%] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white shadow-card transition hover:scale-105 md:flex',
              edges.end && 'pointer-events-none opacity-0',
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
