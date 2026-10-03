import type { Metadata } from 'next';
import LabClient from '@/components/lab/LabClient';

export const metadata: Metadata = { title: 'Personalization Lab' };

export default function LabPage() {
  return <LabClient />;
}
