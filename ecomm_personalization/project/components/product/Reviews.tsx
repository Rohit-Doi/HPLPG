'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Loader2, MessageSquarePlus, Star, ThumbsUp, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useSession } from '@/contexts/SessionContext';
import { fetchReviews, isOffline, markReviewHelpful, postReview, sendRichEvent } from '@/lib/api';
import { formatDate } from '@/lib/orders';
import type { Product, Review, ReviewsResponse, SizeFit } from '@/lib/types';
import { cn, compactNumber, pct } from '@/lib/utils';

const FIT: { id: SizeFit; label: string }[] = [
  { id: 'small', label: 'Runs small' },
  { id: 'true', label: 'True to size' },
  { id: 'large', label: 'Runs large' },
];

export function Stars({ value, size = 'sm', className }: { value: number; size?: 'sm' | 'lg'; className?: string }) {
  const s = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className={cn('relative inline-block', s)} aria-hidden>
            <Star className={cn('absolute inset-0 text-gray-300', s)} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={cn('fill-amber-400 text-amber-400', s)} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
          className="rounded p-0.5"
        >
          <Star className={cn('h-7 w-7 transition', (hover || value) >= i ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
        </button>
      ))}
      <span className="ml-2 text-xs text-gray-500">{value ? ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][value] : 'Tap a star'}</span>
    </div>
  );
}

function ReviewCard({ r, onHelpful }: { r: Review; onHelpful: (r: Review) => void }) {
  const [voted, setVoted] = useState(false);
  const fit = FIT.find((f) => f.id === r.sizeFit)?.label;
  return (
    <li className="border-b border-gray-100 py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Stars value={r.rating} />
        {r.title && <p className="text-sm font-bold text-ink">{r.title}</p>}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">{r.author || 'Anonymous'}</span>
        <span>· {formatDate(r.ts)}</span>
        {r.verified && (
          <span className="inline-flex items-center gap-0.5 text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified purchase
          </span>
        )}
        {r.source === 'demo' && <span className="rounded-sm bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Demo review</span>}
        {fit && <span className="rounded-sm bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{fit}</span>}
      </p>
      {r.body && <p className="mt-2 text-sm leading-relaxed text-gray-700">{r.body}</p>}
      <button
        type="button"
        disabled={voted}
        onClick={() => {
          setVoted(true);
          onHelpful(r);
        }}
        className={cn('mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition', voted ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-ink hover:text-ink')}
      >
        <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> Helpful{r.helpful ? ` (${r.helpful})` : ''}
      </button>
    </li>
  );
}

export default function Reviews({ product: p }: { product: Product }) {
  const auth = useAuth();
  const { visitorId } = useSession();
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [sort, setSort] = useState<'recent' | 'helpful'>('recent');
  const [state, setState] = useState<'loading' | 'ok' | 'offline'>('loading');
  const [writing, setWriting] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [fit, setFit] = useState<SizeFit | ''>('');
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    (s: 'recent' | 'helpful') => {
      let alive = true;
      fetchReviews(p.id, { sort: s, limit: 50 })
        .then((r) => {
          if (!alive) return;
          setData(r);
          setState('ok');
        })
        .catch((e) => {
          if (!alive) return;
          setState(isOffline(e) ? 'offline' : 'ok');
          setData((d) => d || { summary: { average: 0, count: 0, distribution: {} }, reviews: [] });
        });
      return () => {
        alive = false;
      };
    },
    [p.id],
  );

  useEffect(() => load(sort), [load, sort]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!rating) return setErr('Please pick a star rating.');
    if (!auth.signedIn && author.trim().length < 2) return setErr('Please tell us your name.');
    setBusy(true);
    try {
      const r = await postReview(p.id, {
        rating,
        title: title.trim() || undefined,
        body: body.trim() || undefined,
        sizeFit: fit || undefined,
        author: auth.signedIn ? undefined : author.trim(),
      });
      setData(r);
      setState('ok');
      setWriting(false);
      setRating(0);
      setTitle('');
      setBody('');
      setFit('');
      toast.success('Thanks — your review is live');
      sendRichEvent({ visitorId: visitorId || undefined, type: 'review', itemId: p.id, meta: { rating } });
      if (sort !== 'recent') setSort('recent');
    } catch (e2) {
      setErr(isOffline(e2) ? 'The reviews API is unreachable right now — please try again later.' : e2 instanceof Error ? e2.message : 'Could not post your review');
    } finally {
      setBusy(false);
    }
  };

  const helpful = async (r: Review) => {
    try {
      const res = await markReviewHelpful(r.id);
      setData((d) => (d ? { ...d, reviews: d.reviews.map((x) => (x.id === r.id ? { ...x, helpful: res.helpful ?? x.helpful + 1 } : x)) } : d));
    } catch {
      setData((d) => (d ? { ...d, reviews: d.reviews.map((x) => (x.id === r.id ? { ...x, helpful: x.helpful + 1 } : x)) } : d));
    }
  };

  const sum = data?.summary;
  const total = sum?.count || 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: Number(sum?.distribution?.[String(n)] || 0) }));

  const form = writing && (
    <form onSubmit={submit} className="card mt-4 p-4 sm:p-5">
      <p className="label-xs mb-3 text-ink">Write a review</p>
      <StarPicker value={rating} onChange={setRating} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {!auth.signedIn && (
          <label className="text-xs font-semibold text-gray-600">
            Your name
            <input value={author} onChange={(e) => setAuthor(e.target.value)} className="input mt-1" placeholder="e.g. Sam" maxLength={60} />
          </label>
        )}
        <label className="text-xs font-semibold text-gray-600">
          Title <span className="font-normal text-gray-400">(optional)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input mt-1" placeholder="Sum it up" maxLength={80} />
        </label>
        <label className="text-xs font-semibold text-gray-600 sm:col-span-2">
          Review <span className="font-normal text-gray-400">(optional)</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} className="input mt-1 min-h-24" placeholder="Fit, quality, how it looks…" maxLength={1000} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Size fit">
        <span className="mr-1 text-xs font-semibold text-gray-600">Fit</span>
        {FIT.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={fit === f.id}
            onClick={() => setFit(fit === f.id ? '' : f.id)}
            className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition', fit === f.id ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400')}
          >
            {f.label}
          </button>
        ))}
      </div>
      {auth.signedIn && <p className="mt-3 text-xs text-gray-500">Posting as {auth.user?.name}.</p>}
      {err && (
        <p role="alert" className="mt-3 text-xs font-medium text-brand-600">
          {err}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Post review
        </button>
        <button type="button" onClick={() => setWriting(false)} className="btn-outline">
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <section id="reviews" className="mt-10" aria-labelledby="reviews-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reviews-h" className="text-lg font-extrabold uppercase tracking-wide text-ink">
            Ratings & reviews
          </h2>
          <p className="text-sm text-gray-500">
            {total ? `${total} ${total === 1 ? 'review' : 'reviews'}` : 'No reviews yet'} · {compactNumber(p.stats.orders)} orders, {pct(p.stats.cartRate, 0)} add-to-bag rate from the dataset
          </p>
        </div>
        <button type="button" onClick={() => setWriting((v) => !v)} className="btn-outline">
          <MessageSquarePlus className="h-4 w-4" aria-hidden /> Write a review
        </button>
      </div>

      {state === 'loading' && !data ? (
        <div className="mt-4 skeleton h-32" />
      ) : (
        <>
          {state === 'offline' && (
            <p className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <WifiOff className="h-3.5 w-3.5" aria-hidden /> Reviews are unavailable while the API is offline.
            </p>
          )}
          {form}
          {total > 0 && sum && (
            <div className="mt-4 grid gap-5 rounded-xl border border-gray-100 p-4 sm:grid-cols-[auto_1fr] sm:gap-8">
              <div className="flex flex-col items-start">
                <p className="text-4xl font-black text-ink">
                  {sum.average.toFixed(1)}
                  <span className="text-base font-semibold text-gray-400">/5</span>
                </p>
                <Stars value={sum.average} size="lg" className="mt-1" />
                <p className="mt-1 text-xs text-gray-500">{total} ratings</p>
              </div>
              <ul className="space-y-1.5" aria-label="Rating distribution">
                {dist.map((d) => (
                  <li key={d.n} className="flex items-center gap-2 text-xs">
                    <span className="w-8 shrink-0 font-semibold text-gray-600">{d.n}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${total ? (d.c / total) * 100 : 0}%` }} />
                    </span>
                    <span className="w-6 shrink-0 text-right text-gray-500">{d.c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {total > 0 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">Reviews marked “Demo review” are seeded placeholders.</p>
              <label className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'helpful')} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold focus:border-brand-500 focus:outline-none" aria-label="Sort reviews">
                  <option value="recent">Most recent</option>
                  <option value="helpful">Most helpful</option>
                </select>
              </label>
            </div>
          )}
          {data && data.reviews.length > 0 ? (
            <ul className="mt-2">
              {data.reviews.map((r) => (
                <ReviewCard key={r.id} r={r} onHelpful={helpful} />
              ))}
            </ul>
          ) : (
            !writing && (
              <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-6 text-center">
                <p className="font-semibold text-ink">No reviews yet — be the first to review</p>
                <button type="button" onClick={() => setWriting(true)} className="btn-primary mt-4">
                  Write a review
                </button>
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
