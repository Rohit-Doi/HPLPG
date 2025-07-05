'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import ProductGrid from '@/components/ProductGrid';
import { getMenProductsFromImages, Product } from '@/lib/products';

const MenPage = () => {
  const [menProducts, setMenProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsPerPage] = useState(12);

  useEffect(() => {
    getMenProductsFromImages()
      .then((products) => setMenProducts(products))
      .catch(() => setMenProducts([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading men's products...</div>;
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Men's Collection
          </h1>
          <p className="text-xl text-gray-600">
            Discover the latest in men's fashion with our curated collection
          </p>
        </motion.div>

        {/* Hero Banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative h-64 md:h-96 rounded-2xl overflow-hidden mb-12"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-pastel-mint to-pastel-skyblue opacity-80"></div>
          <img
            src="https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg?auto=compress&cs=tinysrgb&w=1200"
            alt="Men's Fashion"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-white">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Express Your Style
              </h2>
              <p className="text-lg md:text-xl opacity-90">
                From casual to formal, find the perfect pieces for every occasion
              </p>
            </div>
          </div>
        </motion.div>

        {/* Products */}
        <ProductGrid 
          products={menProducts} 
          title="Men's Products"
          showFilters={true}
          itemsPerPage={itemsPerPage}
        />
      </div>
    </div>
  );
};

export default MenPage;