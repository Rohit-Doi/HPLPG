import { cn } from '@/lib/utils';
import { ArrowDown, ArrowRight, Bot, Boxes, Database, FlaskConical, GitMerge, Radio, Sparkles, Users } from 'lucide-react';

const STEPS = [
  { icon: Database, title: 'Ingest & clean', text: 'Load raw events, drop duplicates & bot traffic, normalise noisy demographics.' },
  { icon: GitMerge, title: 'Sessionize & join', text: 'Stitch events into sessions and join users, traffic sources and transactions.' },
  { icon: Boxes, title: 'Catalog & categories', text: 'Build the product catalog and infer departments / subcategories for anonymised items.' },
  { icon: Users, title: 'Segments & personas', text: 'Rule-based engagement segments plus clustered shopper personas.' },
  {
    icon: Sparkles,
    title: 'Cold-start models',
    text: 'Cold-start models (7 back-off chains, kNN, LightGBM; an LTR reranker was tested and rejected) · propensity classifiers · item co-view graph.',
  },
  { icon: Bot, title: 'Landing Page Agent', text: 'Resolves context, infers persona & intent, picks and ranks modules, explains every choice.' },
  { icon: FlaskConical, title: 'Evaluation', text: 'Time-split offline test on unseen users: NDCG, hit-rate, recall vs. popularity baselines.' },
  { icon: Radio, title: 'Online learning (A/B + bandit)', text: 'Agent vs. popularity control holdout; a Thompson-sampling bandit re-orders modules from live impressions and clicks.' },
];

export default function Pipeline() {
  return (
    <ol className="grid gap-2 md:grid-cols-4 md:gap-y-4 xl:grid-cols-8 xl:gap-y-0">
      {STEPS.map((s, i) => (
        <li key={s.title} className="relative flex md:flex-col">
          <div className="flex flex-1 flex-col rounded-xl border border-gray-100 bg-white p-3 shadow-card md:mx-1.5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <s.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-[10px] font-bold text-gray-400">STEP {i + 1}</span>
            </div>
            <p className="mt-2 text-sm font-bold leading-tight text-ink">{s.title}</p>
            <p className="mt-1 text-[11px] leading-snug text-gray-500">{s.text}</p>
          </div>
          {i < STEPS.length - 1 && (
            <>
              <ArrowRight className={cn('absolute -right-2 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-brand-400 md:block', i === 3 && 'md:hidden xl:block')} aria-hidden />
              <ArrowDown className="absolute -bottom-2.5 left-1/2 z-10 h-4 w-4 -translate-x-1/2 text-brand-400 md:hidden" aria-hidden />
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
