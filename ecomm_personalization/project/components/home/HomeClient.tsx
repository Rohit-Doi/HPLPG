'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, WifiOff } from 'lucide-react';
import { fetchLandingPage } from '@/lib/api';
import { buildFallbackPage } from '@/lib/fallback';
import type { LandingPage, LandingPageRequest, RequestContext } from '@/lib/types';
import { buildBrowserContext, cleanContext } from '@/lib/visitor';
import { titleCase } from '@/lib/utils';
import { type DeclaredPrefs, useSession } from '@/contexts/SessionContext';
import { useAuth } from '@/contexts/AuthContext';
import ModuleRenderer, { PageSkeleton } from '@/components/modules/ModuleRenderer';
import WhyDrawer from '@/components/agent/WhyDrawer';
import HomeExtras from './HomeExtras';
import StyleQuiz from './StyleQuiz';

const HERO_TYPES = new Set(['hero', 'hero_carousel', 'offer_strip']);

/** Split modules so the style quiz can sit right below the hero block (hero / carousel + offer strip). */
function splitAfterHero(modules: LandingPage['modules']) {
  let idx = -1;
  modules.forEach((m, i) => {
    if (HERO_TYPES.has(m.type) && i <= 3) idx = i;
  });
  // announcements are hoisted to the top by ModuleRenderer, so they always belong to the head
  const head = modules.filter((m, i) => i <= idx || m.type === 'announcement');
  const tail = modules.filter((m, i) => i > idx && m.type !== 'announcement');
  return { head, tail };
}

export default function HomeClient() {
  const session = useSession();
  const auth = useAuth();
  const [page, setPage] = useState<LandingPage | null>(null);
  const [overrides, setOverrides] = useState<string[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const started = useRef(false);
  const seq = useRef(0);
  const lastUserId = useRef<number | null | undefined>(undefined);

  const generate = useCallback(
    async (declared: DeclaredPrefs, fresh?: { visitorId: string; viewed: string[]; carted: string[] }) => {
      const params = new URLSearchParams(window.location.search);
      const { context, overrides: ov } = buildBrowserContext(params);
      setOverrides(ov);
      // declared preferences (style quiz / onboarding) fill in what the URL did not override
      const profile = auth.user?.profile;
      const profileDep = profile?.preferredDepartments?.[0] as RequestContext['preferredDepartment'] | undefined;
      const ctx: RequestContext = {
        ...context,
        preferredDepartment: context.preferredDepartment || declared.preferredDepartment || profileDep,
        gender: context.gender || declared.gender || profile?.gender,
        ageGroup: context.ageGroup || declared.ageGroup || profile?.ageGroup,
        country: context.country || profile?.country,
        region: context.region || profile?.region,
        city: context.city || profile?.city,
      };
      const req: LandingPageRequest = {
        visitorId: fresh?.visitorId ?? session.visitorId,
        context: cleanContext(ctx),
        session: { viewedItems: fresh?.viewed ?? session.viewedItems, cartedItems: fresh?.carted ?? session.cartedItems },
        options: { maxModules: 12, bandit: true },
      };
      const my = ++seq.current;
      try {
        const res = await fetchLandingPage(req);
        if (!res?.modules) throw new Error('bad response');
        if (my === seq.current) setPage(res);
      } catch {
        if (my === seq.current)
          setPage(
            buildFallbackPage(
              req.context,
              req.session || {},
              auth.user
                ? {
                    signedIn: true,
                    name: auth.user.name,
                    points: auth.user.points,
                    preferredDepartments: auth.user.profile?.preferredDepartments,
                    gender: auth.user.profile?.gender,
                    ageGroup: auth.user.profile?.ageGroup,
                  }
                : null,
            ),
          );
      } finally {
        if (my === seq.current) setRegenerating(false);
      }
    },
    [session.visitorId, session.viewedItems, session.cartedItems, auth.user],
  );

  useEffect(() => {
    if (!session.ready || !auth.ready || started.current) return;
    started.current = true;
    lastUserId.current = auth.user?.id ?? null;
    generate(session.declared);
  }, [session.ready, auth.ready, session.declared, generate, auth.user?.id]);

  // regenerate when the visitor signs in / out (Level 4 uses the Bearer token)
  useEffect(() => {
    if (!started.current) return;
    const id = auth.user?.id ?? null;
    if (lastUserId.current === undefined || lastUserId.current === id) return;
    lastUserId.current = id;
    setRegenerating(true);
    generate(session.declared);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id]);

  const onQuizChange = (patch: DeclaredPrefs) => {
    const next = { ...session.declared, ...patch };
    session.setDeclared(patch);
    setRegenerating(true);
    generate(next);
  };

  const reset = () => {
    session.resetVisitor();
    window.location.href = '/';
  };

  const ctx = page?.visitor.resolvedContext;
  const strip = page
    ? [
        ctx?.device,
        ctx?.channel,
        ctx?.geo && !/unknown/i.test(ctx.geo) ? ctx.geo : null,
        ctx?.season,
        ctx?.daypart,
        ctx?.preferredDepartment ? `${titleCase(ctx.preferredDepartment)} edit` : null,
      ]
        .filter(Boolean)
        .map((s) => titleCase(String(s)))
    : [];

  const hasDeclaredDep = !!(session.declared.preferredDepartment || ctx?.preferredDepartment);
  const partiallyAnswered = !!(session.declared.gender || session.declared.ageGroup);
  // Level-2 elicitation: only for cold visitors (L0/L1) who have not yet declared a department or dismissed the card
  const showQuiz = !!page && !auth.signedIn && !session.quizDismissed && !hasDeclaredDep && (page.visitor.coldStartLevel <= 1 || partiallyAnswered);
  const tracking = page && !page.offline ? { visitorId: session.visitorId, pageId: page.pageId } : null;
  const split = page ? splitAfterHero(page.modules) : null;
  const returning = page?.user?.returning || page?.visitor.coldStartLevel === 4;

  return (
    <div className="pb-8">
      {!page || !split ? (
        <PageSkeleton />
      ) : (
        <>
          <div className={regenerating ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {showQuiz ? (
              <>
                <ModuleRenderer modules={split.head} accent={page.theme?.accent} explain={session.explainMode} tracking={tracking} />
                <div className="container -mt-4 md:-mt-8">
                  <StyleQuiz value={session.declared} busy={regenerating} onChange={onQuizChange} onDismiss={session.dismissQuiz} />
                </div>
                <ModuleRenderer modules={split.tail} accent={page.theme?.accent} explain={session.explainMode} tracking={tracking} />
              </>
            ) : (
              <ModuleRenderer modules={page.modules} accent={page.theme?.accent} explain={session.explainMode} tracking={tracking} />
            )}
            {!page.offline && <HomeExtras />}
          </div>
          <div className="container mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            {page.offline ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                <WifiOff className="h-3 w-3" aria-hidden /> Offline mode — personalization agent unreachable, showing popular picks
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1">
                <Sparkles className="h-3 w-3 text-brand-600" aria-hidden />
                Curated for <b className="text-gray-700">{page.inference.persona.name}</b>
                {strip.length > 0 && <> · {strip.join(' · ')}</>}
              </span>
            )}
            {returning && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                Level 4 · returning customer{page.user?.name ? ` · ${page.user.name}` : ''}
                {typeof page.user?.points === 'number' ? ` · ${page.user.points} pts` : ''}
              </span>
            )}
            {page.experiment && !page.offline && (
              <span
                className={
                  page.experiment.variant === 'control'
                    ? 'rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600'
                    : 'rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700'
                }
                title={page.experiment.description}
              >
                {page.experiment.variant === 'control' ? 'Control group (popularity-only)' : 'Agent group'}
                {page.experiment.banditReordered ? ' · bandit-ordered' : ''}
              </span>
            )}
            {overrides.length > 0 && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700">Demo overrides: {overrides.map(titleCase).join(', ')}</span>
            )}
            {hasDeclaredDep && session.declared.preferredDepartment && (
              <button
                type="button"
                onClick={() => {
                  session.clearDeclared();
                  setRegenerating(true);
                  generate({});
                }}
                className="rounded-full border border-gray-200 px-2.5 py-1 font-medium text-gray-600 hover:border-ink hover:text-ink"
              >
                Clear style quiz answers
              </button>
            )}
            {auth.signedIn && (
              <Link href="/account?tab=personalization" className="rounded-full border border-gray-200 px-2.5 py-1 font-medium text-gray-600 hover:border-ink hover:text-ink">
                What the agent knows about you
              </Link>
            )}
          </div>
        </>
      )}
      <WhyDrawer page={page} explain={session.explainMode} onExplainChange={session.setExplainMode} onReset={reset} />
    </div>
  );
}
