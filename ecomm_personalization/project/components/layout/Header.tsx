'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { BadgePercent, BarChart3, ChevronDown, Gift, Heart, LogOut, Menu, Package, Search, Settings2, ShoppingBag, Sparkles, User as UserIcon, X } from 'lucide-react';
import { initials, useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { DEPARTMENTS, byDepartment, coverImage, subcategoriesOf } from '@/lib/catalog';
import { STOREFRONT, topBrands } from '@/lib/storefront';
import { cn } from '@/lib/utils';
import SearchBox from './SearchBox';

type NavItem = { href: string; label: string; dep: string; menu?: 'brands' | 'collections' };

const NAV: NavItem[] = [
  ...DEPARTMENTS.map((d) => ({ href: `/shop/${d.id}`, label: d.label, dep: d.id as string })),
  { href: '/brands', label: 'Brands', dep: '', menu: 'brands' },
  { href: '/collections', label: 'Collections', dep: '', menu: 'collections' },
  { href: '/sale', label: 'Sale', dep: '' },
  { href: '/new', label: 'New', dep: '' },
];

type Sub = { name: string; count: number; image: string };

/** subcategories per department with a representative image (built once from catalog.json) */
const SUBS: Record<string, Sub[]> = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, subcategoriesOf(d.id)]));
const DEP_META: Record<string, { image: string; count: number; tagline: string }> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, { image: coverImage(d.id), count: byDepartment(d.id).length, tagline: d.tagline }]),
);
const TOP_BRANDS = topBrands(8);
const COLLECTIONS = STOREFRONT.collections;

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="AURA home" className={cn('flex shrink-0 select-none items-center', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/aura.svg" alt="AURA" className="h-7 w-auto" />
    </Link>
  );
}

const MENU_CLS =
  'invisible absolute top-full z-50 translate-y-1 rounded-b-xl border border-gray-100 bg-white opacity-0 shadow-lift transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100';

/** Desktop hover mega-menu for one department: subcategory list with tiny images + department cover. */
function MegaMenu({ dep, label, href, align }: { dep: string; label: string; href: string; align: 'left' | 'right' }) {
  const subs = SUBS[dep] || [];
  const meta = DEP_META[dep];
  const cols = subs.length > 6 ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <div className={cn(MENU_CLS, 'w-[540px]', align === 'left' ? 'left-0' : 'right-0')} role="region" aria-label={`${label} categories`}>
      <div className="grid grid-cols-[1fr_180px] gap-5 p-5">
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="label-xs text-brand-600">{label}</p>
            <Link href={href} className="text-[11px] font-semibold text-gray-500 hover:text-ink">
              View all {meta?.count ? `(${meta.count})` : ''}
            </Link>
          </div>
          <ul className={cn('grid gap-x-5 gap-y-1', cols)}>
            {subs.map((s) => (
              <li key={s.name}>
                <Link href={`${href}?sub=${encodeURIComponent(s.name)}`} className="group/item flex items-center gap-2.5 rounded-md px-1.5 py-1 text-sm text-gray-600 transition hover:bg-gray-50 hover:text-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.image} alt="" loading="lazy" className="h-9 w-7 shrink-0 rounded object-cover ring-1 ring-black/5" />
                  <span className="min-w-0 flex-1 truncate group-hover/item:font-semibold">{s.name}</span>
                  <span className="text-[10px] text-gray-400">{s.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <Link href={href} className="group/cover relative block overflow-hidden rounded-lg bg-gray-100">
          <div className="aspect-[3/4]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {meta?.image && <img src={meta.image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover/cover:scale-105" />}
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8 text-white">
            <p className="text-sm font-bold">Shop {label}</p>
            <p className="text-[10px] opacity-85">{meta?.tagline}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

function BrandsMenu() {
  return (
    <div className={cn(MENU_CLS, 'right-0 w-[520px]')} role="region" aria-label="Top brands">
      <div className="p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="label-xs text-brand-600">Top brands</p>
          <Link href="/brands" className="text-[11px] font-semibold text-gray-500 hover:text-ink">
            All brands ({STOREFRONT.brands.length})
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-x-5 gap-y-1">
          {TOP_BRANDS.map((b) => (
            <li key={b.id}>
              <Link href={`/brands/${b.id}`} className="group/item flex items-center gap-2.5 rounded-md px-1.5 py-1 text-sm text-gray-600 transition hover:bg-gray-50 hover:text-ink">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image} alt="" loading="lazy" className="h-9 w-7 shrink-0 rounded object-cover ring-1 ring-black/5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate group-hover/item:font-semibold">{b.name}</span>
                  <span className="block text-[10px] text-gray-400">
                    {b.items} styles{b.maxDiscount ? ` · up to ${b.maxDiscount}% off` : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CollectionsMenu() {
  return (
    <div className={cn(MENU_CLS, 'right-0 w-[560px]')} role="region" aria-label="Collections">
      <div className="p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="label-xs text-brand-600">Curated collections</p>
          <Link href="/collections" className="text-[11px] font-semibold text-gray-500 hover:text-ink">
            All collections
          </Link>
        </div>
        <ul className="grid grid-cols-3 gap-3">
          {COLLECTIONS.slice(0, 6).map((c) => (
            <li key={c.id}>
              <Link href={c.href} className="group/c block overflow-hidden rounded-lg bg-gray-100">
                <div className="aspect-[4/3]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover/c:scale-105" />
                </div>
                <div className="bg-white px-2 py-1.5">
                  <p className="truncate text-xs font-bold text-ink">{c.title}</p>
                  <p className="truncate text-[10px] text-gray-500">{c.items} styles</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Mobile drawer accordion row for one department. */
function DrawerDepartment({ n, active }: { n: NavItem; active: boolean }) {
  const [open, setOpen] = useState(active);
  const subs = SUBS[n.dep] || [];
  return (
    <div className="border-b border-gray-50">
      <div className="flex items-center">
        <Link href={n.href} className={cn('flex flex-1 items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold uppercase tracking-wider', active ? 'text-brand-700' : 'text-ink')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={DEP_META[n.dep]?.image} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-black/5" />
          {n.label}
        </Link>
        <button type="button" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${n.label} categories`} onClick={() => setOpen((v) => !v)} className="rounded-md p-3 text-gray-500">
          <ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <ul className="grid grid-cols-2 gap-x-2 pb-3 pl-3 pr-2">
          {subs.map((s) => (
            <li key={s.name}>
              <Link href={`${n.href}?sub=${encodeURIComponent(s.name)}`} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image} alt="" loading="lazy" className="h-7 w-6 shrink-0 rounded object-cover" />
                <span className="truncate">{s.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DrawerAccordion({ label, items }: { label: string; items: { href: string; label: string; sub?: string; image?: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-50">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between rounded-md px-3 py-3 text-sm font-semibold uppercase tracking-wider text-ink">
        {label}
        <ChevronDown className={cn('h-4 w-4 text-gray-500 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="grid grid-cols-2 gap-x-2 pb-3 pl-3 pr-2">
          {items.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50">
                {s.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image} alt="" loading="lazy" className="h-7 w-6 shrink-0 rounded object-cover" />
                )}
                <span className="min-w-0">
                  <span className="block truncate">{s.label}</span>
                  {s.sub && <span className="block truncate text-[10px] text-gray-400">{s.sub}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ACCOUNT_LINKS = [
  { href: '/account', label: 'Account', icon: UserIcon },
  { href: '/account?tab=orders', label: 'Orders', icon: Package },
  { href: '/account?tab=wishlist', label: 'Wishlist', icon: Heart },
  { href: '/account?tab=points', label: 'Points', icon: Gift },
  { href: '/account?tab=offers', label: 'Offers & coupons', icon: BadgePercent },
  { href: '/account?tab=settings', label: 'Settings', icon: Settings2 },
] as const;

const linkLabel = (label: string, points?: number) => (label === 'Points' && points != null ? `Points · ${points}` : label);

/**
 * Header account control. Signed out → Clerk sign-in (redirects to /sign-in, back afterwards).
 * Signed in → Clerk's <UserButton/> avatar whose menu carries our account links, then Clerk's
 * "Manage account" and "Sign out" actions.
 */
function UserMenu() {
  const auth = useAuth();

  if (!auth.enabled)
    return (
      <Link href="/sign-in" className="flex flex-col items-center rounded-md p-2 text-ink" aria-label="Sign in" title="Sign-in isn't configured yet">
        <UserIcon className="h-5 w-5" />
        <span className="hidden text-[10px] font-semibold xl:block">Sign in</span>
      </Link>
    );

  if (!auth.ready) return <span className="mx-1.5 h-7 w-7 rounded-full bg-gray-100" aria-hidden />;

  if (!auth.signedIn)
    return (
      <SignInButton mode="redirect">
        <button type="button" className="flex flex-col items-center rounded-md p-2 text-ink" aria-label="Sign in">
          <UserIcon className="h-5 w-5" />
          <span className="hidden text-[10px] font-semibold xl:block">Sign in</span>
        </button>
      </SignInButton>
    );

  const u = auth.user!;
  return (
    <div className="flex flex-col items-center rounded-md px-1.5 py-1" data-testid="user-menu">
      <UserButton appearance={{ elements: { avatarBox: 'h-7 w-7 ring-2 ring-brand-100' } }}>
        <UserButton.MenuItems>
          {ACCOUNT_LINKS.map((it) => (
            <UserButton.Link key={it.href} label={linkLabel(it.label, u.points)} labelIcon={<it.icon className="h-4 w-4" aria-hidden />} href={it.href} />
          ))}
          <UserButton.Action label="manageAccount" />
          <UserButton.Action label="signOut" />
        </UserButton.MenuItems>
      </UserButton>
      <span className="hidden max-w-[64px] truncate text-[10px] font-semibold xl:block">{u.name.split(' ')[0] || 'Account'}</span>
    </div>
  );
}

/** Account block at the top of the mobile drawer. */
function DrawerAccount() {
  const auth = useAuth();
  if (!auth.enabled)
    return (
      <p className="text-xs text-gray-500">
        Sign-in isn&apos;t configured yet — you can still shop and check out as a guest.
      </p>
    );
  if (!auth.ready) return <div className="skeleton h-9" />;
  if (!auth.signedIn)
    return (
      <div className="flex gap-2">
        <SignInButton mode="redirect">
          <button type="button" className="btn-primary flex-1 py-2 text-xs">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="redirect">
          <button type="button" className="btn-outline flex-1 py-2 text-xs">
            Sign up
          </button>
        </SignUpButton>
      </div>
    );
  const u = auth.user!;
  const avatar = u.avatar || auth.contact?.imageUrl;
  return (
    <div>
      <Link href="/account" className="flex items-center gap-3">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-black text-white">{initials(u.name, u.email)}</span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-ink">{u.name}</span>
          <span className="block text-xs text-gray-500">{u.points} points · My account</span>
        </span>
      </Link>
      <div className="mt-3 grid grid-cols-3 gap-1">
        {ACCOUNT_LINKS.slice(1).map((it) => (
          <Link key={it.href} href={it.href} className="flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] font-semibold text-gray-600 hover:bg-gray-50">
            <it.icon className="h-4 w-4" aria-hidden /> {it.label === 'Offers & coupons' ? 'Offers' : it.label}
          </Link>
        ))}
      </div>
      <button type="button" onClick={() => auth.signOut()} className="mt-1 flex w-full items-center gap-2 rounded-md px-1 py-2 text-xs font-semibold text-gray-600 hover:text-brand-600">
        <LogOut className="h-4 w-4" aria-hidden /> Sign out
      </button>
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  const { count } = useCart();
  const { ids } = useWishlist();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onSearch = () => setSearchOpen(true);
    window.addEventListener('aura:open-menu', onOpen);
    window.addEventListener('aura:open-search', onSearch);
    return () => {
      window.removeEventListener('aura:open-menu', onOpen);
      window.removeEventListener('aura:open-search', onSearch);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="container flex h-16 items-center gap-2 lg:gap-4">
        <button type="button" className="-ml-2 rounded-md p-2 text-ink lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </button>
        <Logo />

        <nav aria-label="Primary" className="hidden h-full items-stretch lg:flex">
          {NAV.map((n, i) => (
            <div key={n.href} className="group relative flex">
              <Link
                href={n.href}
                className={cn(
                  'flex items-center border-b-[3px] px-2 text-[11px] font-bold uppercase tracking-wider transition xl:px-2.5 xl:text-[12px] 2xl:px-3',
                  isActive(n.href) ? 'border-brand-600 text-ink' : 'border-transparent text-gray-700 hover:border-brand-400',
                  n.label === 'Sale' && 'text-brand-600',
                )}
              >
                {n.label}
              </Link>
              {n.dep && SUBS[n.dep]?.length > 0 && <MegaMenu dep={n.dep} label={n.label} href={n.href} align={i < 4 ? 'left' : 'right'} />}
              {n.menu === 'brands' && <BrandsMenu />}
              {n.menu === 'collections' && <CollectionsMenu />}
            </div>
          ))}
        </nav>

        <SearchBox className="ml-auto hidden min-w-0 flex-1 md:block lg:hidden xl:block xl:max-w-sm" />

        <div className="ml-auto flex shrink-0 items-center gap-0.5 md:ml-0">
          <Link
            href="/lab"
            title="Personalization Lab"
            className={cn(
              'hidden items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition sm:inline-flex',
              isActive('/lab') ? 'border-brand-600 bg-brand-600 text-white' : 'border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-400',
            )}
          >
            <Sparkles className="h-3 w-3" aria-hidden /> <span className="lg:hidden 2xl:inline">Lab</span>
          </Link>
          <Link
            href="/insights"
            title="Data & Model Insights"
            className={cn(
              'hidden items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition sm:inline-flex',
              isActive('/insights') ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400',
            )}
          >
            <BarChart3 className="h-3 w-3" aria-hidden /> <span className="lg:hidden 2xl:inline">Insights</span>
          </Link>
          <button type="button" className="rounded-md p-2 md:hidden lg:block xl:hidden" aria-label="Search" onClick={() => setSearchOpen((v) => !v)}>
            <Search className="h-5 w-5" />
          </button>
          <UserMenu />
          <Link href="/wishlist" className="relative flex flex-col items-center rounded-md p-2 text-ink" aria-label={`Wishlist (${ids.length})`}>
            <Heart className="h-5 w-5" />
            <span className="hidden text-[10px] font-semibold xl:block">Wishlist</span>
            {ids.length > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-800 px-1 text-[10px] font-bold text-white">{ids.length}</span>
            )}
          </Link>
          <Link href="/cart" className="relative flex flex-col items-center rounded-md p-2 text-ink" aria-label={`Bag (${count} items)`}>
            <ShoppingBag className="h-5 w-5" />
            <span className="hidden text-[10px] font-semibold xl:block">Bag</span>
            {count > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{count}</span>
            )}
          </Link>
        </div>
      </div>

      {searchOpen && (
        <div className="border-t border-gray-100 px-4 py-2 md:hidden lg:block xl:hidden">
          <SearchBox autoFocus onDone={() => setSearchOpen(false)} />
        </div>
      )}

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-white shadow-xl animate-in slide-in-from-left">
            <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
              <Logo />
              <button className="rounded-md p-2" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b px-4 py-3">
              <DrawerAccount />
            </div>
            <nav className="flex-1 p-2" aria-label="Mobile">
              {NAV.filter((n) => n.dep).map((n) => (
                <DrawerDepartment key={n.href} n={n} active={isActive(n.href)} />
              ))}
              <DrawerAccordion label="Brands" items={TOP_BRANDS.map((b) => ({ href: `/brands/${b.id}`, label: b.name, sub: `${b.items} styles`, image: b.image }))} />
              <DrawerAccordion label="Collections" items={COLLECTIONS.map((c) => ({ href: c.href, label: c.title, sub: `${c.items} styles`, image: c.image }))} />
              <div className="mt-1 grid grid-cols-2 gap-1">
                {NAV.filter((n) => !n.dep && !n.menu).map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={cn(
                      'block rounded-md px-3 py-3 text-sm font-semibold uppercase tracking-wider',
                      isActive(n.href) ? 'bg-brand-50 text-brand-700' : n.label === 'Sale' ? 'text-brand-600 hover:bg-gray-50' : 'text-ink hover:bg-gray-50',
                    )}
                  >
                    {n.label}
                  </Link>
                ))}
              </div>
              <div className="my-3 border-t" />
              <p className="label-xs px-3 pb-2">Experience</p>
              <Link href="/lab" className="flex items-center gap-2 rounded-md px-3 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                <Sparkles className="h-4 w-4" /> Personalization Lab
              </Link>
              <Link href="/insights" className="flex items-center gap-2 rounded-md px-3 py-3 text-sm font-semibold hover:bg-gray-50">
                <BarChart3 className="h-4 w-4" /> Data &amp; Model Insights
              </Link>
              <Link href="/about" className="block rounded-md px-3 py-3 text-sm font-semibold hover:bg-gray-50">
                About the project
              </Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
