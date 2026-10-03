import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Providers from '@/components/Providers';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import BottomTabs from '@/components/layout/BottomTabs';
import { SIGN_IN_URL, SIGN_UP_URL, clerkAppearance, clerkEnabled, clerkLocalization } from '@/lib/clerk';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'AURA — a store that knows you from the first click', template: '%s · AURA' },
  description:
    'AURA is a fashion store powered by a hyper-personalized landing page agent that adapts to brand-new visitors using context and in-session behaviour.',
  icons: { icon: [{ url: '/brand/favicon.svg', type: 'image/svg+xml' }], shortcut: '/brand/favicon.svg', apple: '/brand/favicon.svg' },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const app = (
    <Providers>
      <div className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lift"
        >
          Skip to content
        </a>
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        <BottomTabs />
      </div>
    </Providers>
  );

  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        {clerkEnabled ? (
          <ClerkProvider
            appearance={clerkAppearance}
            localization={clerkLocalization}
            signInUrl={SIGN_IN_URL}
            signUpUrl={SIGN_UP_URL}
            signInFallbackRedirectUrl="/"
            signUpFallbackRedirectUrl="/welcome"
            afterSignOutUrl="/"
          >
            {app}
          </ClerkProvider>
        ) : (
          app
        )}
      </body>
    </html>
  );
}
