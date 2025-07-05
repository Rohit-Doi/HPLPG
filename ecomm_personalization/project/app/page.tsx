import { getMenProductsFromImages, getWomenProductsFromImages, getAccessoriesProductsFromImages } from '@/lib/products';
import { getSaleProductsFromImages } from '@/lib/server/saleProducts';
import HomeClient from './HomeClient';

function shuffleArray<T>(array: T[]): T[] {
  return array
    .map((value: T) => ({ value, sort: Math.random() }))
    .sort((a: { value: T; sort: number }, b: { value: T; sort: number }) => a.sort - b.sort)
    .map(({ value }: { value: T; sort: number }) => value);
}

export default async function HomePage() {
  const men = await getMenProductsFromImages();
  const women = await getWomenProductsFromImages();
  const accessories = await getAccessoriesProductsFromImages();
  const sale = await getSaleProductsFromImages();

  const men4 = men.slice(0, 4);
  const women4 = women.slice(0, 4);
  const accessories4 = accessories.slice(0, 4);
  const sale4 = sale.slice(0, 4);

  const allProducts = shuffleArray([
    ...men4,
    ...women4,
    ...accessories4,
    ...sale4,
  ]);

  const trendingProducts = allProducts.slice(0, 4);
  const newProducts = allProducts.slice(4, 8);
  const recommendedProducts = allProducts.slice(8, 12);
  const saleProducts = allProducts.slice(12, 16);

  return (
    <HomeClient
      trendingProducts={trendingProducts}
      newProducts={newProducts}
      recommendedProducts={recommendedProducts}
      saleProducts={saleProducts}
    />
  );
}