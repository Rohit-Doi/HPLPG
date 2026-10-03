import Link from 'next/link';
import { DEPARTMENTS } from '@/lib/catalog';
import { STOREFRONT } from '@/lib/storefront';
import { formatPrice } from '@/lib/utils';
import CurrencySelect from './CurrencySelect';

const COLS = [
  {
    title: 'Shop',
    links: [
      ...DEPARTMENTS.map((d) => ({ href: `/shop/${d.id}`, label: d.label })),
      { href: '/brands', label: 'Brands' },
      { href: '/collections', label: 'Collections' },
      { href: '/sale', label: 'Sale' },
      { href: '/new', label: 'New arrivals' },
    ],
  },
  {
    title: 'Help',
    links: [
      { href: '/account?tab=orders', label: 'Orders & tracking' },
      { href: '/about#returns', label: 'Returns (30 days)' },
      { href: '/about#shipping', label: `Delivery (free over ${formatPrice(STOREFRONT.freeShippingOver)})` },
      { href: '/about#contact', label: 'Contact us' },
      { href: '/cart', label: 'Your bag' },
      { href: '/wishlist', label: 'Wishlist' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About AURA' },
      { href: '/lab', label: 'Personalization Lab' },
      { href: '/insights', label: 'Data & Model Insights' },
      { href: '/welcome', label: 'Style onboarding' },
    ],
  },
];

const PAYMENTS = ['UPI', 'RuPay', 'VISA', 'Mastercard', 'Net banking', 'COD'];

function AppBadge({ store }: { store: 'apple' | 'google' }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-ink px-3 py-1.5 text-white" aria-label={store === 'apple' ? 'Download on the App Store (coming soon)' : 'Get it on Google Play (coming soon)'}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        {store === 'apple' ? (
          <path d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9C5.9 6.9 4.2 7.9 3.3 9.5c-1.9 3.3-.5 8.1 1.4 10.8.9 1.3 2 2.8 3.4 2.7 1.4-.1 1.9-.9 3.5-.9s2.1.9 3.5.9c1.5 0 2.4-1.3 3.3-2.6 1-1.5 1.5-3 1.5-3.1-.1 0-2.5-1-2.5-4.6zM13.9 5.1c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.1.1 2.3-.6 3-1.5z" />
        ) : (
          <path d="M3.6 2.4 13 12l-9.4 9.6c-.3-.2-.5-.6-.5-1V3.4c0-.4.2-.8.5-1zm11.5 11.7 2.9 2.9-9.9 5.7c-.5.3-1 .3-1.4.1l8.4-8.7zm0-4.2L6.7 1.2c.4-.2.9-.2 1.4.1l9.9 5.7-2.9 2.9zm4.2 1.1 2.5 1.4c.9.5.9 1.7 0 2.2l-2.5 1.4L15.9 12l3.4-1z" />
        )}
      </svg>
      <span className="text-left leading-none">
        <span className="block text-[9px] uppercase opacity-80">{store === 'apple' ? 'Download on the' : 'Get it on'}</span>
        <span className="block text-xs font-bold">{store === 'apple' ? 'App Store' : 'Google Play'}</span>
      </span>
    </span>
  );
}

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-100 bg-gray-50 pb-16 lg:pb-0">
      <div className="container grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/aura.svg" alt="AURA" className="h-7 w-auto" />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-gray-600">
            A fashion store that personalizes itself for brand-new visitors — using only context like device, traffic source, region and time of day, then learning
            from every click, and from your own history once you sign in.
          </p>
          <div className="mt-5">
            <p className="label-xs mb-2">Get the app</p>
            <div className="flex flex-wrap gap-2">
              <AppBadge store="apple" />
              <AppBadge store="google" />
            </div>
          </div>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <p className="label-xs mb-3 text-ink">{c.title}</p>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="text-sm text-gray-600 hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-200">
        <div className="container flex flex-col gap-4 py-5 text-xs text-gray-500 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex flex-wrap items-center gap-2" aria-label="Accepted payment methods">
              <span className="label-xs mr-1">We accept</span>
              {PAYMENTS.map((p) => (
                <span key={p} className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-wide text-gray-700">
                  {p}
                </span>
              ))}
            </span>
            <CurrencySelect className="ml-0 md:ml-2" />
          </div>
          <p className="max-w-lg">
            Prices, popularity, discounts and recommendations are derived from the NetElixir AIgnition 2.0 datasets; product imagery is illustrative. Demo store — no
            payment is taken and nothing ships.
          </p>
          <p className="shrink-0">© {new Date().getFullYear()} AURA · Hackathon prototype</p>
        </div>
      </div>
    </footer>
  );
}
