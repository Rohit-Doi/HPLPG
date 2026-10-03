'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FlaskConical, RotateCcw, Sparkles, X } from 'lucide-react';
import type { LandingPage } from '@/lib/types';
import { cn } from '@/lib/utils';
import AgentReasoning from './Reasoning';

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition', checked ? 'bg-brand-600' : 'bg-gray-300')}
    >
      <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}

type Props = {
  page: LandingPage | null;
  explain: boolean;
  onExplainChange: (v: boolean) => void;
  onReset: () => void;
};

export default function WhyDrawer({ page, explain, onExplainChange, onReset }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        onClick={() => setOpen(true)}
        disabled={!page}
        className="fixed bottom-20 right-4 z-30 lg:bottom-6 inline-flex items-center gap-2 rounded-full bg-ink py-3 pl-3.5 pr-4 text-sm font-semibold text-white shadow-lift transition hover:bg-black disabled:opacity-60 md:right-6"
        aria-haspopup="dialog"
      >
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-brand-600">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {page && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-brand-400" />}
        </span>
        Why this page?
      </motion.button>

      <AnimatePresence>
        {open && page && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Why this page">
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              aria-label="Close"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                <div>
                  <p className="label-xs text-brand-600">Landing Page Agent</p>
                  <h2 className="text-lg font-extrabold text-ink">Why you&apos;re seeing this page</h2>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 hover:bg-gray-100" aria-label="Close drawer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 border-b bg-gray-50 px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Explain mode</p>
                  <p className="text-[11px] text-gray-500">Show the reason &amp; strategy on every module</p>
                </div>
                <Switch checked={explain} onChange={onExplainChange} label="Explain mode" />
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                <AgentReasoning page={page} layout="drawer" />
              </div>

              <div className="flex flex-wrap gap-2 border-t px-5 py-3">
                <button type="button" onClick={onReset} className="btn-outline flex-1 px-3 text-xs">
                  <RotateCcw className="h-4 w-4" aria-hidden /> Reset: be a new visitor
                </button>
                <Link href="/lab" className="btn-dark flex-1 px-3 text-xs">
                  <FlaskConical className="h-4 w-4" aria-hidden /> Open the Lab
                </Link>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
