'use client';

import { useEffect, useState } from 'react';
import { Trash2, Pencil, Star, Home, Briefcase } from 'lucide-react';
import { fetchIndiaStates } from '@/lib/api';
import { addressErrors, formatMobile, isIndia, normalizeMobile } from '@/lib/address';
import { COUNTRIES, INDIA_STATES } from '@/lib/storefront';
import type { Address, AddressType } from '@/lib/types';
import { cn } from '@/lib/utils';

export const EMPTY_ADDRESS: Address = {
  name: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'India',
  phone: '',
  addressType: 'Home',
  isDefault: false,
};

/* ------------------------------ India states (API + fallback) ------------------------------ */

let statesCache: string[] | null = null;
let statesPromise: Promise<string[]> | null = null;

/** GET /meta/india-states once per page load; the static list of 36 states/UTs until (or unless) it answers. */
export function useIndiaStates(): string[] {
  const [states, setStates] = useState<string[]>(statesCache || INDIA_STATES);
  useEffect(() => {
    if (statesCache) return;
    let alive = true;
    statesPromise =
      statesPromise ||
      fetchIndiaStates()
        .then((r) => (Array.isArray(r?.states) && r.states.length ? r.states : INDIA_STATES))
        .catch(() => INDIA_STATES);
    statesPromise.then((s) => {
      statesCache = s;
      if (alive) setStates(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return states;
}

/* ------------------------------------------ form ------------------------------------------ */

function Field({ id, label, optional, error, className, children }: { id: string; label: string; optional?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-gray-600">
        {label} {optional && <span className="font-normal text-gray-400">(optional)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-err`} className="mt-1 text-[11px] text-brand-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * India-first address form: full name, +91 mobile, PIN code, house/flat, area/street, landmark,
 * city, state (from /meta/india-states), Home/Work. Other countries stay selectable.
 * Errors show per field once it was touched, or for every field when `showErrors` is set.
 */
export function AddressForm({ value, onChange, idPrefix = 'addr', showErrors = false }: { value: Address; onChange: (a: Address) => void; idPrefix?: string; showErrors?: boolean }) {
  const states = useIndiaStates();
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const india = isIndia(value.country);
  const errs = addressErrors(value);
  const err = (k: keyof typeof errs) => ((showErrors || touched[k]) && errs[k]) || undefined;
  const f = (k: keyof Address) => ({
    id: `${idPrefix}-${k}`,
    value: (value[k] as string) || '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value }),
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
    'aria-invalid': !!err(k as keyof typeof errs) || undefined,
    'aria-describedby': err(k as keyof typeof errs) ? `${idPrefix}-${k}-err` : undefined,
    className: cn('input', err(k as keyof typeof errs) && 'border-brand-400'),
  });
  const type = value.addressType || 'Home';

  return (
    <div className="grid grid-cols-2 gap-4">
      <Field id={`${idPrefix}-country`} label="Country" className="col-span-2 sm:col-span-1" error={err('country')}>
        <select {...f('country')} onChange={(e) => onChange({ ...value, country: e.target.value, region: '' })} required autoComplete="country-name">
          {COUNTRIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field id={`${idPrefix}-name`} label="Full name" className="col-span-2 sm:col-span-1" error={err('name')}>
        <input {...f('name')} required autoComplete="name" />
      </Field>

      <Field id={`${idPrefix}-phone`} label={india ? 'Mobile number' : 'Phone'} optional={!india} className="col-span-2 sm:col-span-1" error={err('phone')}>
        {india ? (
          <div className={cn('flex items-stretch overflow-hidden rounded-md border', err('phone') ? 'border-brand-400' : 'border-gray-300')}>
            <span className="flex items-center border-r border-gray-200 bg-gray-50 px-2.5 text-sm font-semibold text-gray-600" aria-hidden>
              +91
            </span>
            <input
              {...f('phone')}
              value={normalizeMobile(value.phone)}
              onChange={(e) => onChange({ ...value, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              type="tel"
              inputMode="numeric"
              maxLength={10}
              pattern="[6-9][0-9]{9}"
              autoComplete="tel-national"
              placeholder="10-digit mobile number"
              aria-label="Mobile number (+91)"
              className="min-w-0 flex-1 border-0 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-0"
            />
          </div>
        ) : (
          <input {...f('phone')} type="tel" autoComplete="tel" />
        )}
      </Field>
      <Field id={`${idPrefix}-postalCode`} label={india ? 'PIN code' : 'Postal code'} className="col-span-2 sm:col-span-1" error={err('postalCode')}>
        <input
          {...f('postalCode')}
          onChange={(e) => onChange({ ...value, postalCode: india ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value })}
          required
          autoComplete="postal-code"
          inputMode={india ? 'numeric' : undefined}
          maxLength={india ? 6 : undefined}
          placeholder={india ? '6-digit PIN code' : undefined}
        />
      </Field>

      <Field id={`${idPrefix}-line1`} label={india ? 'House / flat no., building' : 'Address line 1'} className="col-span-2" error={err('line1')}>
        <input {...f('line1')} required autoComplete="address-line1" placeholder={india ? 'Flat 12B, Prestige Towers' : 'House no, street'} />
      </Field>
      <Field id={`${idPrefix}-line2`} label={india ? 'Area, street, sector' : 'Address line 2'} optional={!india} className="col-span-2" error={err('line2')}>
        <input {...f('line2')} required={india} autoComplete="address-line2" placeholder={india ? 'MG Road, Ashok Nagar' : 'Apartment, suite'} />
      </Field>
      <Field id={`${idPrefix}-landmark`} label="Landmark" optional className="col-span-2">
        <input {...f('landmark')} placeholder={india ? 'Near metro station' : ''} />
      </Field>

      <Field id={`${idPrefix}-city`} label={india ? 'City / town' : 'City'} className="col-span-2 sm:col-span-1" error={err('city')}>
        <input {...f('city')} required autoComplete="address-level2" />
      </Field>
      <Field id={`${idPrefix}-region`} label={india ? 'State' : 'Region'} className="col-span-2 sm:col-span-1" error={err('region')}>
        {india ? (
          <select {...f('region')} required autoComplete="address-level1">
            <option value="">Select a state</option>
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        ) : (
          <input {...f('region')} required autoComplete="address-level1" />
        )}
      </Field>

      <fieldset className="col-span-2">
        <legend className="mb-1 block text-xs font-semibold text-gray-600">Address type</legend>
        <div className="flex gap-2">
          {(['Home', 'Work'] as AddressType[]).map((t) => {
            const Icon = t === 'Home' ? Home : Briefcase;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => onChange({ ...value, addressType: t })}
                className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition', type === t ? 'border-ink bg-ink text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400')}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden /> {t}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export function addressValid(a: Address) {
  return Object.keys(addressErrors(a)).length === 0;
}

export function AddressCard({
  a,
  onDelete,
  onEdit,
  onDefault,
  selected,
  onSelect,
}: {
  a: Address;
  onDelete?: () => void;
  onEdit?: () => void;
  onDefault?: () => void;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-ink">
          {a.name}
          {a.addressType && <span className="ml-1.5 rounded-sm bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-600">{a.addressType}</span>}
          {a.isDefault && <span className="ml-1 rounded-sm bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Default</span>}
        </p>
        {(onDelete || onEdit) && (
          <span className="flex shrink-0 items-center gap-0.5">
            {onEdit && (
              <button type="button" onClick={onEdit} aria-label="Edit address" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-ink">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={onDelete} aria-label="Delete address" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-brand-600">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </span>
        )}
      </div>
      <p className="mt-1 break-words text-sm text-gray-600">
        {a.line1}
        {a.line2 ? `, ${a.line2}` : ''}
        {a.landmark ? ` (near ${a.landmark.replace(/^near\s+/i, '')})` : ''}
        <br />
        {a.city}, {a.region} {isIndia(a.country) ? '– ' : ''}
        {a.postalCode}
        <br />
        {a.country}
        {a.phone ? ` · ${isIndia(a.country) ? formatMobile(a.phone) : a.phone}` : ''}
      </p>
      {onDefault && !a.isDefault && (
        <button type="button" onClick={onDefault} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
          <Star className="h-3.5 w-3.5" aria-hidden /> Make default
        </button>
      )}
    </>
  );
  if (onSelect)
    return (
      <button type="button" onClick={onSelect} aria-pressed={selected} className={cn('card w-full p-4 text-left transition', selected ? 'border-brand-600 ring-2 ring-brand-200' : 'hover:border-gray-300')}>
        {body}
      </button>
    );
  return <div className="card p-4">{body}</div>;
}
