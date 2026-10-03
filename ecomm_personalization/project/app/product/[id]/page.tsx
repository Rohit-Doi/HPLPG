import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductDetail from '@/components/product/ProductDetail';
import { API_URL } from '@/lib/api';
import { CATALOG, fixImagePath, getProduct } from '@/lib/catalog';
import type { Product } from '@/lib/types';

type Params = { id: string };

// catalog.json ids are pre-rendered; anything else is resolved on demand from the API
export const dynamicParams = true;

export function generateStaticParams() {
  return CATALOG.map((p) => ({ id: p.id }));
}

/** Server-side lookup: catalog.json first, then GET /api/v1/products/{id} (short timeout). */
async function resolveProduct(id: string): Promise<Product | null> {
  const local = getProduct(id);
  if (local) return local;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${API_URL}/api/v1/products/${encodeURIComponent(id)}`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) return null;
    const body = (await res.json()) as { product?: Product };
    if (!body?.product?.id) return null;
    return { ...body.product, image: fixImagePath(body.product.image) };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const p = await resolveProduct(id);
  return { title: p ? `${p.brand} ${p.name}` : 'Product', description: p?.description };
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const product = await resolveProduct(id);
  if (!product) notFound();
  return <ProductDetail product={product} />;
}
