import type { Metadata } from 'next';
import InsightsClient from '@/components/insights/InsightsClient';

export const metadata: Metadata = { title: 'Data & Model Insights' };

export default function InsightsPage() {
  return <InsightsClient />;
}
