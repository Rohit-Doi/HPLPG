'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZES = {
  mobile: { w: 390, h: 780 },
  tablet: { w: 820, h: 900 },
  desktop: { w: 1280, h: 820 },
} as const;

/**
 * Renders children inside a phone / tablet / browser frame at a realistic width,
 * scaled down to fit the available space.
 */
export default function DeviceFrame({ device, url, children }: { device: string; url?: string; children: React.ReactNode }) {
  const kind = device === 'mobile' || device === 'tablet' ? device : 'desktop';
  const size = SIZES[kind];
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const chrome = kind === 'desktop' ? { x: 2, y: 42 } : kind === 'mobile' ? { x: 24, y: 24 } : { x: 32, y: 32 };
  const totalW = size.w + chrome.x;
  const totalH = size.h + chrome.y;

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => {
      const byWidth = el.clientWidth / totalW;
      // keep phones / tablets fully visible on screen; desktop frames scroll internally
      const byHeight = kind === 'desktop' ? 1 : Math.max(0.55, (window.innerHeight - 140) / totalH);
      setScale(Math.min(1, byWidth, byHeight));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [totalW, totalH, kind]);

  return (
    <div ref={outer} className="w-full">
      <div className="mx-auto" style={{ width: totalW * scale, height: totalH * scale }}>
        <div style={{ width: totalW, height: totalH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {kind === 'desktop' ? (
            <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-300 bg-white shadow-lift">
              <div className="flex h-10 shrink-0 items-center gap-3 border-b border-gray-200 bg-gray-100 px-4">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex h-6 flex-1 items-center gap-1.5 truncate rounded-md bg-white px-3 text-xs text-gray-500">
                  <Lock className="h-3 w-3 shrink-0" aria-hidden /> aura.store{url || '/'}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
            </div>
          ) : (
            <div
              className={cn(
                'relative h-full bg-gray-900 shadow-lift',
                kind === 'mobile' ? 'rounded-[48px] p-3' : 'rounded-[36px] p-4',
              )}
            >
              {kind === 'mobile' && <div className="absolute left-1/2 top-3 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-gray-900" />}
              <div className={cn('h-full overflow-y-auto overflow-x-hidden bg-white', kind === 'mobile' ? 'rounded-[36px]' : 'rounded-[20px]')}>
                <div className={kind === 'mobile' ? 'pt-6' : ''}>{children}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
