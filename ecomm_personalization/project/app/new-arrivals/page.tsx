import React from 'react';
import ProductGrid from '../../components/ProductGrid';
import { getMenProductsFromImages, getWomenProductsFromImages, getAccessoriesProductsFromImages } from '@/lib/products';

export default async function NewArrivalsPage() {
  const men = await getMenProductsFromImages();
  const women = await getWomenProductsFromImages();
  const accessories = await getAccessoriesProductsFromImages();
  // Shuffle and pick random new products
  const all = [...men, ...women, ...accessories].filter(p => p.isNew);
  const newProducts = all.sort(() => 0.5 - Math.random()).slice(0, 48);
  return <ProductGrid products={newProducts} title="New Arrivals" showFilters={true} itemsPerPage={12} />;
} 