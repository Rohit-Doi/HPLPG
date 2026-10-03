'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useSession } from '@/contexts/SessionContext';
import { isOffline } from '@/lib/api';
import { APPAREL_SIZES, DEPARTMENTS, SHOE_SIZES, coverImage, isDepartment } from '@/lib/catalog';
import { AGE_GROUPS, BUDGETS, COUNTRIES, STYLES } from '@/lib/storefront';
import { useIndiaStates } from './AddressBits';
import type { Department, Profile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/agent/WhyDrawer';

const DEP_IMAGES: Record<string, string> = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, coverImage(d.id)]));
const STEPS = ['About you', 'Your style', 'Sizes & updates'];

type Draft = Required<Pick<Profile, 'preferredDepartments' | 'styles' | 'sizes'>> & Omit<Profile, 'preferredDepartments' | 'styles' | 'sizes'> & { shoppingFor: 'women' | 'men' | 'both' | '' };

function fromProfile(p?: Profile | null): Draft {
  return {
    shoppingFor: p?.gender === 'female' ? 'women' : p?.gender === 'male' ? 'men' : '',
    ageGroup: p?.ageGroup || '',
    country: p?.country || 'India',
    region: p?.region || '',
    city: p?.city || '',
    preferredDepartments: p?.preferredDepartments || [],
    styles: p?.styles || [],
    budget: p?.budget || '',
    sizes: p?.sizes || {},
    newsletter: p?.newsletter ?? true,
  };
}

function Pill({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('rounded-full border px-3.5 py-1.5 text-sm font-semibold transition', on ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400', className)}
    >
      {children}
    </button>
  );
}

/**
 * 3-step onboarding wizard that collects what the cold-start agent needs. Saves to PUT /me/profile
 * (signed in) and mirrors gender / ageGroup / preferredDepartment into the session's declared
 * preferences so the home page regenerates immediately (Level 2 even when the API is down).
 */
export default function Onboarding({ embedded, onDone }: { embedded?: boolean; onDone?: () => void }) {
  const auth = useAuth();
  const session = useSession();
  const router = useRouter();
  const indiaStates = useIndiaStates();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => fromProfile(auth.user?.profile));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (auth.user?.profile) setDraft(fromProfile(auth.user.profile));
  }, [auth.user?.id, auth.user?.profile]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggleIn = (k: 'preferredDepartments' | 'styles', v: string) => set(k, draft[k].includes(v) ? draft[k].filter((x) => x !== v) : [...draft[k], v]);

  const mirrorToSession = () => {
    const dep = draft.preferredDepartments.find((d) => isDepartment(d)) as Department | undefined;
    session.setDeclared({
      preferredDepartment: dep,
      gender: draft.shoppingFor === 'women' ? 'female' : draft.shoppingFor === 'men' ? 'male' : undefined,
      ageGroup: draft.ageGroup || undefined,
    });
  };

  const finish = async () => {
    setBusy(true);
    setNote(null);
    const profile: Profile & { onboarded: boolean } = {
      gender: draft.shoppingFor === 'women' ? 'female' : draft.shoppingFor === 'men' ? 'male' : undefined,
      ageGroup: draft.ageGroup || undefined,
      country: draft.country || undefined,
      region: draft.region || undefined,
      city: draft.city || undefined,
      preferredDepartments: draft.preferredDepartments,
      styles: draft.styles,
      sizes: draft.sizes,
      budget: draft.budget || undefined,
      newsletter: !!draft.newsletter,
      onboarded: true,
    };
    mirrorToSession();
    try {
      if (auth.signedIn) {
        await auth.updateProfile(profile);
        toast.success('Preferences saved — your home page has been re-personalized');
      } else {
        toast.success('Preferences saved to this browser — sign in to keep them across devices');
      }
      if (onDone) onDone();
      else router.push('/');
    } catch (e) {
      if (isOffline(e)) {
        setNote('The API is unreachable, so your answers were saved to this browser only. They still personalize the home page at Level 2.');
        toast.message('Saved locally (API offline)');
        setTimeout(() => (onDone ? onDone() : router.push('/')), 1200);
      } else setNote(e instanceof Error ? e.message : 'Could not save your preferences');
    } finally {
      setBusy(false);
    }
  };

  const canNext = step === 0 ? !!draft.shoppingFor : step === 1 ? draft.preferredDepartments.length > 0 : true;

  return (
    <div className={cn(!embedded && 'card p-5 sm:p-8')}>
      {/* progress */}
      <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500',
              )}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn('hidden text-xs font-semibold sm:block', i === step ? 'text-ink' : 'text-gray-400')}>{s}</span>
            {i < STEPS.length - 1 && <span className={cn('h-px flex-1', i < step ? 'bg-emerald-400' : 'bg-gray-200')} />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-extrabold text-ink">Who are you shopping for?</h2>
            <p className="text-sm text-gray-500">This sets the audience rule the agent uses when ranking items.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['women', 'men', 'both'] as const).map((g) => (
                <Pill key={g} on={draft.shoppingFor === g} onClick={() => set('shoppingFor', g)} className="px-5 py-2">
                  {g === 'both' ? 'Both' : g === 'women' ? 'Women' : 'Men'}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-ink">Age group</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {AGE_GROUPS.map((a) => (
                <Pill key={a} on={draft.ageGroup === a} onClick={() => set('ageGroup', draft.ageGroup === a ? '' : a)}>
                  {a}
                </Pill>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-xs font-semibold text-gray-600">
              Country
              <select value={draft.country} onChange={(e) => set('country', e.target.value)} className="input mt-1">
                {COUNTRIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              {draft.country === 'India' ? 'State / UT' : 'Region'}
              {draft.country === 'India' ? (
                <select value={draft.region} onChange={(e) => set('region', e.target.value)} className="input mt-1">
                  <option value="">Select a state</option>
                  {indiaStates.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input value={draft.region} onChange={(e) => set('region', e.target.value)} className="input mt-1" placeholder="Region" />
              )}
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              City <span className="font-normal text-gray-400">(optional)</span>
              <input value={draft.city} onChange={(e) => set('city', e.target.value)} className="input mt-1" placeholder="Bengaluru" autoComplete="address-level2" />
            </label>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-extrabold text-ink">Favourite departments</h2>
            <p className="text-sm text-gray-500">Pick as many as you like — the first becomes your home page&apos;s lead department.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {DEPARTMENTS.map((d) => {
                const on = draft.preferredDepartments.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleIn('preferredDepartments', d.id)}
                    className={cn('group relative overflow-hidden rounded-xl border text-left transition', on ? 'border-brand-600 ring-2 ring-brand-200' : 'border-gray-200 hover:border-gray-400')}
                  >
                    <div className="aspect-[4/3] bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={DEP_IMAGES[d.id]} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-2">
                      <span className={cn('text-sm font-bold', on ? 'text-brand-700' : 'text-ink')}>{d.label}</span>
                      {on && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    {on && draft.preferredDepartments[0] === d.id && (
                      <span className="absolute left-2 top-2 rounded-sm bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Lead</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-ink">Styles you like</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <Pill key={s} on={draft.styles.includes(s)} onClick={() => toggleIn('styles', s)}>
                  {s}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-ink">Budget</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BUDGETS.map((b) => {
                const on = draft.budget === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('budget', on ? '' : b.id)}
                    className={cn('rounded-xl border p-3 text-left transition', on ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white hover:border-gray-400')}
                  >
                    <p className="text-sm font-bold">{b.label}</p>
                    <p className={cn('text-xs', on ? 'text-white/80' : 'text-gray-500')}>{b.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-extrabold text-ink">Your sizes</h2>
            <p className="text-sm text-gray-500">Used to pre-select sizes on product pages and in your bag.</p>
          </div>
          {(
            [
              { id: 'top', label: 'Tops', options: APPAREL_SIZES },
              { id: 'bottom', label: 'Bottoms', options: APPAREL_SIZES },
              { id: 'shoe', label: 'Shoes (EU)', options: SHOE_SIZES },
            ] as const
          ).map((g) => (
            <div key={g.id}>
              <p className="text-sm font-bold text-ink">{g.label}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {g.options.map((s) => (
                  <Pill key={s} on={draft.sizes[g.id] === s} onClick={() => set('sizes', { ...draft.sizes, [g.id]: draft.sizes[g.id] === s ? '' : s })} className="min-w-11 px-3">
                    {s}
                  </Pill>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
            <div>
              <p className="text-sm font-bold text-ink">Style newsletter</p>
              <p className="text-xs text-gray-500">Occasional edits and offers. Demo — nothing is sent.</p>
            </div>
            <Switch checked={!!draft.newsletter} onChange={(v) => set('newsletter', v)} label="Newsletter" />
          </div>
          {!auth.signedIn && (
            <p className="flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-xs text-brand-800">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                You are not signed in: answers are kept in this browser and personalize the home page at Level 2.{' '}
                <Link href="/sign-up" className="font-bold underline">
                  Create an account
                </Link>{' '}
                to keep them everywhere.
              </span>
            </p>
          )}
        </div>
      )}

      {note && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {note}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="btn-outline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </button>
        <div className="flex items-center gap-3">
          {step < STEPS.length - 1 ? (
            <>
              <button type="button" onClick={() => setStep((s) => s + 1)} className="text-xs font-semibold text-gray-500 underline hover:text-ink">
                Skip
              </button>
              <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="btn-primary">
                Next <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </>
          ) : (
            <button type="button" onClick={finish} disabled={busy} className="btn-primary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} Build my home page
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
