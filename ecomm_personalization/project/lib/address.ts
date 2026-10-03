import type { Address, AddressType } from './types';

/** v6 India-first address helpers (no imports besides types, so lib/api.ts can use them). */

export const PIN_RE = /^[1-9][0-9]{5}$/;
export const MOBILE_RE = /^[6-9][0-9]{9}$/;

/** "+91 98765 43210" / "09876543210" / "9876543210" -> "9876543210" (other formats returned trimmed). */
export function normalizeMobile(v: string | null | undefined): string {
  const d = (v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d.length ? d : (v || '').trim();
}

/** "9876543210" -> "+91 98765 43210" */
export function formatMobile(v: string | null | undefined): string {
  const m = normalizeMobile(v);
  return MOBILE_RE.test(m) ? `+91 ${m.slice(0, 5)} ${m.slice(5)}` : v || '';
}

export const isIndia = (country?: string | null) => !country || country === 'India';

/*
 * The API's address has no landmark / address-type columns, so they travel inside line2:
 *   line2 = "<area, street> · Landmark: <landmark> · <Home|Work>"
 * packAddress() before POST/PUT, unpackAddress() after GET — round-trips losslessly.
 */
const SEP = ' · ';
const LANDMARK = 'Landmark: ';
const TYPES: AddressType[] = ['Home', 'Work'];

export function packAddress(a: Address): Address {
  const { landmark, addressType, ...rest } = a;
  const parts = [(a.line2 || '').trim(), landmark?.trim() ? `${LANDMARK}${landmark.trim()}` : '', addressType && TYPES.includes(addressType) ? addressType : ''].filter(Boolean);
  const phone = isIndia(a.country) ? normalizeMobile(a.phone) : (a.phone || '').trim();
  return { ...rest, line2: parts.join(SEP), phone, postalCode: (a.postalCode || '').trim() };
}

export function unpackAddress(a: Address): Address {
  if (!a || typeof a !== 'object') return a;
  const bits = (a.line2 || '').split(SEP);
  let landmark = a.landmark || '';
  let addressType: AddressType | undefined = a.addressType;
  const area: string[] = [];
  for (const b of bits) {
    const t = b.trim();
    if (t.startsWith(LANDMARK)) landmark = t.slice(LANDMARK.length);
    else if ((TYPES as string[]).includes(t)) addressType = t as AddressType;
    else if (t) area.push(t);
  }
  return { ...a, line2: area.join(SEP), landmark, addressType: addressType || 'Home' };
}

export type AddressErrors = Partial<Record<'name' | 'phone' | 'postalCode' | 'line1' | 'line2' | 'city' | 'region' | 'country', string>>;

export function addressErrors(a: Address): AddressErrors {
  const e: AddressErrors = {};
  const india = isIndia(a.country);
  if (!a.name?.trim()) e.name = 'Enter the full name';
  if (india) {
    if (!MOBILE_RE.test(normalizeMobile(a.phone))) e.phone = 'Enter a valid 10-digit mobile number';
    if (!PIN_RE.test((a.postalCode || '').trim())) e.postalCode = 'Enter a valid 6-digit PIN code';
    if (!a.line2?.trim()) e.line2 = 'Enter the area / street';
  } else if (!a.postalCode?.trim()) e.postalCode = 'Enter the postal code';
  if (!a.line1?.trim()) e.line1 = india ? 'Enter the house / flat number' : 'Enter the address';
  if (!a.city?.trim()) e.city = 'Enter the city';
  if (!a.region?.trim()) e.region = india ? 'Select a state' : 'Enter the region';
  if (!a.country?.trim()) e.country = 'Select a country';
  return e;
}
