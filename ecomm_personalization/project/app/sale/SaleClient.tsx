'use client';

import { motion } from 'framer-motion';
import { Tag, Percent } from 'lucide-react';
import ProductGrid from '@/components/ProductGrid';
import { Product } from '@/lib/products';

export default function SaleClient({ saleProducts }: { saleProducts: Product[] }) {
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
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 flex items-center justify-center">
            <Tag className="w-10 h-10 mr-3 text-red-500" />
            Sale Collection
          </h1>
          <p className="text-xl text-gray-600">
            Amazing deals and discounts on your favorite styles
          </p>
        </motion.div>

        {/* Sale Banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative h-64 md:h-96 rounded-2xl overflow-hidden mb-12 bg-gradient-to-r from-red-500 to-pink-600"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-pastel-peach to-pastel-yellow opacity-60"></div>
          <img
            src="https://images.pexels.com/photos/1124468/pexels-photo-1124468.jpeg?auto=compress&cs=tinysrgb&w=1200"
            alt="Sale Items"
            className="w-full h-full object-cover mix-blend-overlay"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-white">
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="inline-block"
              >
                <Percent className="w-16 h-16 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Up to 50% Off
              </h2>
              <p className="text-lg md:text-xl opacity-90">
                Limited time offers on selected items
              </p>
            </div>
          </div>
        </motion.div>

        {/* Sale Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 rounded-lg p-6 mb-8"
        >
          <div className="flex items-center justify-center space-x-8 text-center">
            <div>
              <div className="text-2xl font-bold text-red-600">50%</div>
              <div className="text-sm text-gray-600">Max Discount</div>
            </div>
            <div className="h-8 w-px bg-red-200"></div>
            <div>
              <div className="text-2xl font-bold text-red-600">Free</div>
              <div className="text-sm text-gray-600">Shipping</div>
            </div>
            <div className="h-8 w-px bg-red-200"></div>
            <div>
              <div className="text-2xl font-bold text-red-600">24/7</div>
              <div className="text-sm text-gray-600">Support</div>
            </div>
          </div>
        </motion.div>

        {/* Products */}
        <ProductGrid 
          products={saleProducts} 
          title="Sale Items"
          showFilters={true}
          itemsPerPage={12}
        />
      </div>
    </div>
  );
} 