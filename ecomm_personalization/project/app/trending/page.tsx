import React from 'react';
import ProductGrid from '../../components/ProductGrid';
import { getMenProductsFromImages, getWomenProductsFromImages, getAccessoriesProductsFromImages } from '@/lib/products';

export default async function TrendingPage() {
  const men = await getMenProductsFromImages();
  const women = await getWomenProductsFromImages();
  const accessories = await getAccessoriesProductsFromImages();
  // Shuffle and pick random trending products
  const all = [...men, ...women, ...accessories].filter(p => p.isTrending);
  const trendingProducts = all.sort(() => 0.5 - Math.random()).slice(0, 48);
  return <ProductGrid products={trendingProducts} title="Trending Now" showFilters={true} itemsPerPage={12} />;
} 