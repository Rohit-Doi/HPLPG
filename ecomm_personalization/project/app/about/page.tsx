import type { Metadata } from 'next';
import Link from 'next/link';
import { COD_FEE, FREE_SHIPPING_OVER, SHIPPING } from '@/lib/storefront';
import { formatPrice } from '@/lib/utils';
import { BarChart3, Brain, Compass, FlaskConical, Layers, Mail, RefreshCw, Sparkles, Truck } from 'lucide-react';

export const metadata: Metadata = { title: 'About' };

const TEAM = [
  { name: 'K. Rohit', img: '/us/rohit.jpg', role: 'Co-creator' },
  { name: 'C. Namish', img: '/us/namish.jpg', role: 'Co-creator' },
];

const POINTS = [
  { icon: Compass, title: 'Built for the cold start', text: 'Most visitors arrive anonymous. The agent personalizes from the first request using device, traffic source, region and time of day.' },
  { icon: Layers, title: 'Graceful back-off', text: 'Context priors are learned per segment and blended from specific to broad, so sparse segments still get sensible pages.' },
  { icon: Brain, title: 'Learns in-session', text: 'Every product view or add-to-bag updates the visitor’s affinity, and the next landing page warms up instantly.' },
  { icon: Sparkles, title: 'Explainable by design', text: 'Each module carries a reason and a strategy, and the full decision trace is one click away.' },
];

export default function AboutPage() {
  return (
    <div>
      <section className="border-b border-gray-100 bg-gradient-to-br from-rose-50 via-white to-white">
        <div className="container py-14 md:py-20">
          <p className="label-xs text-brand-600">Hackathon project</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-black tracking-tight text-ink md:text-5xl">Hyper-Personalized Landing Page Generator Agent</h1>
          <p className="mt-4 max-w-2xl text-gray-600 md:text-lg">
            AURA is a demo fashion store whose homepage is written, module by module, by an AI agent — for visitors it has never seen before.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/lab" className="btn-primary">
              <FlaskConical className="h-4 w-4" aria-hidden /> Try the Personalization Lab
            </Link>
            <Link href="/insights" className="btn-outline">
              <BarChart3 className="h-4 w-4" aria-hidden /> See data &amp; model insights
            </Link>
          </div>
        </div>
      </section>

      <section className="container grid gap-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map((p) => (
          <div key={p.title} className="card p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <p.icon className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-bold text-ink">{p.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">{p.text}</p>
          </div>
        ))}
      </section>

      <section className="container pb-12" aria-labelledby="help">
        <h2 id="help" className="text-xl font-extrabold uppercase tracking-wide text-ink">
          Help
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div id="shipping" className="card scroll-mt-24 p-5">
            <Truck className="h-5 w-5 text-brand-600" aria-hidden />
            <h3 className="mt-3 font-bold text-ink">Delivery</h3>
            <p className="mt-1 text-sm text-gray-600">Standard (3-6 days) is {formatPrice(SHIPPING.standard.price)} and free over {formatPrice(FREE_SHIPPING_OVER)}. Express (1-2 days) is {formatPrice(SHIPPING.express.price)}. Cash on delivery adds {formatPrice(COD_FEE)}. We deliver across India — metro PIN codes are fastest.</p>
          </div>
          <div id="returns" className="card scroll-mt-24 p-5">
            <RefreshCw className="h-5 w-5 text-brand-600" aria-hidden />
            <h3 className="mt-3 font-bold text-ink">Returns</h3>
            <p className="mt-1 text-sm text-gray-600">30-day returns with free pick-up. Refunds go back to the original payment method or to your points balance.</p>
          </div>
          <div id="contact" className="card scroll-mt-24 p-5">
            <Mail className="h-5 w-5 text-brand-600" aria-hidden />
            <h3 className="mt-3 font-bold text-ink">Contact</h3>
            <p className="mt-1 text-sm text-gray-600">This is a hackathon prototype: there is no support desk. Questions about the agent? Open the Lab or the Insights page.</p>
          </div>
        </div>
      </section>

      <section className="container pb-8">
        <h2 className="text-xl font-extrabold uppercase tracking-wide text-ink">The team</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:max-w-3xl">
          {TEAM.map((t) => (
            <div key={t.name} className="card flex items-center gap-4 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.img} alt={`Portrait of ${t.name}`} className="h-20 w-20 rounded-full object-cover ring-4 ring-brand-50" />
              <div>
                <p className="text-lg font-bold text-ink">{t.name}</p>
                <p className="text-sm text-gray-500">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-2xl text-xs text-gray-500">
          Prices, popularity and recommendations are derived from the NetElixir AIgnition 2.0 datasets; product imagery is illustrative.
        </p>
      </section>
    </div>
  );
}
