'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import type { DeclaredPrefs } from '@/contexts/SessionContext';
import { DEPARTMENTS, coverImage } from '@/lib/catalog';
import type { Department } from '@/lib/types';
import { cn } from '@/lib/utils';

const AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55+'];
const GENDERS: { id: string; label: string }[] = [
  { id: 'female', label: 'Women' },
  { id: 'male', label: 'Men' },
];

const DEP_IMAGES: Record<string, string> = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, coverImage(d.id)]));

type Props = {
  value: DeclaredPrefs;
  busy?: boolean;
  onChange: (patch: DeclaredPrefs) => void;
  onDismiss: () => void;
};

/**
 * Level-2 elicitation: a compact, dismissible card that lets a cold visitor declare what they are
 * shopping for. Every selection is stored as a "declared" preference and the page is regenerated.
 */
export default function StyleQuiz({ value, busy, onChange, onDismiss }: Props) {
  const [showMore, setShowMore] = useState(!!(value.gender || value.ageGroup));
  const pickDep = (id: Department) => onChange({ preferredDepartment: value.preferredDepartment === id ? undefined : id });
  const pickGender = (id: string) => onChange({ gender: value.gender === id ? undefined : id });

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      aria-label="Tell us what you're shopping for"
      className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/70 via-white to-white p-4 shadow-card sm:p-5"
    >
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="absolute right-2 top-2 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink">
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
        <div>
          <p className="label-xs flex items-center gap-1.5 text-brand-600">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> 10-second style quiz
          </p>
          <h2 className="mt-0.5 text-base font-extrabold text-ink sm:text-lg">Tell us what you&apos;re shopping for</h2>
          <p className="text-xs text-gray-500">Pick a department and the agent rebuilds this page around it — nothing is stored beyond this browser.</p>
        </div>
        {busy && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-700 shadow-sm">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Re-personalizing…
          </span>
        )}
      </div>

      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        {DEPARTMENTS.map((d) => {
          const on = value.preferredDepartment === d.id;
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={on}
              onClick={() => pickDep(d.id)}
              className={cn(
                'group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border bg-white p-1.5 pr-3 text-left transition',
                on ? 'border-brand-600 ring-2 ring-brand-200' : 'border-gray-200 hover:border-gray-400',
              )}
            >
              <span className="relative h-10 w-8 shrink-0 overflow-hidden rounded-md bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={DEP_IMAGES[d.id]} alt="" className="h-full w-full object-cover" />
                {on && (
                  <span className="absolute inset-0 flex items-center justify-center bg-brand-600/70 text-white">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </span>
              <span className={cn('text-xs font-bold', on ? 'text-brand-700' : 'text-ink')}>{d.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Shopping for:</span>
        {GENDERS.map((g) => {
          const on = value.gender === g.id;
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => pickGender(g.id)}
              className={cn('rounded-full border px-3 py-1 font-semibold transition', on ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400')}
            >
              {g.label}
            </button>
          );
        })}
        {showMore ? (
          <label className="ml-auto flex items-center gap-1.5 text-gray-500">
            Age group
            <select
              aria-label="Age group"
              value={value.ageGroup || ''}
              onChange={(e) => onChange({ ageGroup: e.target.value || undefined })}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-ink focus:border-brand-500 focus:outline-none"
            >
              <option value="">Prefer not to say</option>
              {AGE_GROUPS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <button type="button" onClick={() => setShowMore(true)} className="ml-auto font-semibold text-gray-500 underline hover:text-ink">
            + age group (optional)
          </button>
        )}
      </div>
    </motion.section>
  );
}
