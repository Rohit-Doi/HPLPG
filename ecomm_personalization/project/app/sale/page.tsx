import React from 'react';
import ProductGrid from '../../components/ProductGrid';
import { getSaleProductsFromImages } from '@/lib/server/saleProducts';
import SaleClient from './SaleClient';

export default async function SalePage() {
  const saleProducts = await getSaleProductsFromImages();
  return <SaleClient saleProducts={saleProducts} />;
}