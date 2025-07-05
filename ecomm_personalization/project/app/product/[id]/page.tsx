import { getProductById, getAllProductIds, initializeProductCaches, sampleProducts, getMenProductsFromImages, getWomenProductsFromImages, getAccessoriesProductsFromImages } from '../../../lib/products';
import { getSaleProductsFromImages } from '../../../lib/server/saleProducts';
import ProductDetailsClient from '../../../components/products/ProductDetailsClient';
import { notFound } from 'next/navigation';

interface ProductDetailsPageProps {
  params: { id: string };
}

export async function generateStaticParams() {
  await initializeProductCaches();
  const men = await getMenProductsFromImages();
  const women = await getWomenProductsFromImages();
  const accessories = await getAccessoriesProductsFromImages();
  const sale = await getSaleProductsFromImages();
  const sample = sampleProducts.map(p => p.id);
  return [
    ...sample,
    ...men.map(p => p.id),
    ...women.map(p => p.id),
    ...accessories.map(p => p.id),
    ...sale.map(p => p.id),
  ].map(id => ({ id }));
}

export default async function ProductDetailsPage({ params }: ProductDetailsPageProps) {
  await initializeProductCaches();
  let product = getProductById(params.id);
  if (!product) {
    const saleProducts = await getSaleProductsFromImages();
    product = saleProducts.find((p: any) => p.id === params.id);
    // TEMP DEBUG LOG
    console.log('Sale products IDs:', saleProducts.map(p => p.id));
    console.log('Looking for ID:', params.id, 'Found:', !!product);
  }
  if (!product) return notFound();
  return <ProductDetailsClient product={product} />;
} 