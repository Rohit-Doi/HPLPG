'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { cn, titleCase } from '@/lib/utils';
import { rc, useModuleEnv } from './ModuleEnv';

export function withAlpha(color: string, alpha: number): string {
  const hex = color?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return `rgba(225,29,72,${alpha})`;
  let h = hex[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function safeAccent(color: string | undefined) {
  return color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim()) ? color.trim() : '#e11d48';
}

export function SectionHeader({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) {
  const { compact } = useModuleEnv();
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className={cn('font-extrabold uppercase tracking-wide text-ink', rc(compact, 'text-base', 'text-lg md:text-xl'))}>{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
          View all <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Tiny "i" affordance that reveals a module's reason + strategy (only in explain mode). */
export function ModuleInfo({ reason, strategy, signals, type, className }: { reason: string; strategy: string; signals?: string[]; type: string; className?: string }) {
  const { explain } = useModuleEnv();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!explain) return null;
  return (
    <div ref={ref} className={cn("absolute z-20", className || "-top-3 right-3")} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`Why this ${titleCase(type)} module?`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full border border-brand-200 bg-white/95 px-2 py-1 text-[11px] font-semibold text-brand-700 shadow-sm backdrop-blur"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
        <span>{titleCase(type)}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 max-w-[80vw] rounded-lg border border-gray-200 bg-white p-3 text-left text-xs shadow-lift">
          <p className="label-xs text-brand-600">Why this module</p>
          <p className="mt-1 leading-relaxed text-gray-700">{reason || '—'}</p>
          <p className="label-xs mt-2">Strategy</p>
          <p className="mt-0.5 font-mono text-[11px] text-ink">{strategy || '—'}</p>
          {signals && signals.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {signals.map((s) => (
                <span key={s} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
