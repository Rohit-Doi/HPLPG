'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Product, getProductsWithPagination } from '@/lib/products';
import ProductCard from './ProductCard';
import { SlidersHorizontal, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductGridProps {
  products: Product[];
  title?: string;
  showFilters?: boolean;
  itemsPerPage?: number;
}

interface FilterBy {
  priceRange: number[];
  colors: string[];
  sizes: string[];
  categories: string[];
}

const ProductGrid: React.FC<ProductGridProps> = ({ 
  products, 
  title, 
  showFilters = false, 
  itemsPerPage = 8 
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('featured');
  const [filterBy, setFilterBy] = useState<FilterBy>({
    priceRange: [0, 5000],
    colors: [],
    sizes: [],
    categories: [],
  });
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const sortProducts = (products: Product[], sortBy: string) => {
    switch (sortBy) {
      case 'price-low':
        return [...products].sort((a, b) => a.price - b.price);
      case 'price-high':
        return [...products].sort((a, b) => b.price - a.price);
      case 'rating':
        return [...products].sort((a, b) => b.rating - a.rating);
      case 'newest':
        return [...products].sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
      default:
        return products;
    }
  };

  const getFilteredProducts = () => {
    let filtered = products;
    
    // Apply price filter
    filtered = filtered.filter(
      product => product.price >= filterBy.priceRange[0] && product.price <= filterBy.priceRange[1]
    );

    // Apply color filter
    if (filterBy.colors.length > 0) {
      filtered = filtered.filter(product =>
        product.colors.some(color => filterBy.colors.includes(color))
      );
    }

    // Apply size filter
    if (filterBy.sizes.length > 0) {
      filtered = filtered.filter(product =>
        product.sizes.some(size => filterBy.sizes.includes(size))
      );
    }

    // Apply category filter
    if (filterBy.categories.length > 0) {
      filtered = filtered.filter(product =>
        filterBy.categories.includes(product.category)
      );
    }

    // Sort products
    return sortProducts(filtered, sortBy);
  };

  const filteredProducts = getFilteredProducts();
  const paginationData = getProductsWithPagination(filteredProducts, currentPage, itemsPerPage);

  const availableColors = [...new Set(products.flatMap(p => p.colors))];
  const availableSizes = [...new Set(products.flatMap(p => p.sizes))];
  const availableCategories = [...new Set(products.map(p => p.category))];

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [sortBy, filterBy]);

  return (
    <div className="w-full">
      {title && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <h2 className="text-3xl font-bold text-gray-900">{title}</h2>
          <div className="text-sm text-gray-500">
            {paginationData.totalItems} {paginationData.totalItems === 1 ? 'product' : 'products'}
          </div>
        </motion.div>
      )}

      {showFilters && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 space-y-4 sm:space-y-0"
        >
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </button>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="featured">Featured</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Best Rating</option>
              <option value="newest">Newest First</option>
            </select>
          </div>
        </motion.div>
      )}

      {/* Filter Panel */}
      <AnimatePresence>
        {showFilterPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white border border-gray-200 rounded-lg p-6 mb-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Price Range */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Price Range</h3>
                <div className="space-y-2">
                  <input
                    type="range"
                    min="0"
                    max="5000"
                    value={filterBy.priceRange[1]}
                    onChange={(e) => setFilterBy(prev => ({
                      ...prev,
                      priceRange: [0, parseInt(e.target.value)]
                    }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>₹0</span>
                    <span>₹{filterBy.priceRange[1]}</span>
                  </div>
                </div>
              </div>

              {/* Colors */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Colors</h3>
                <div className="flex flex-wrap gap-2">
                  {availableColors.map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        setFilterBy(prev => ({
                          ...prev,
                          colors: prev.colors.includes(color)
                            ? prev.colors.filter(c => c !== color)
                            : [...prev.colors, color]
                        }));
                      }}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        filterBy.colors.includes(color)
                          ? 'bg-purple-100 border-purple-300 text-purple-800'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sizes */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Sizes</h3>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.map(size => (
                    <button
                      key={size}
                      onClick={() => {
                        setFilterBy(prev => ({
                          ...prev,
                          sizes: prev.sizes.includes(size)
                            ? prev.sizes.filter(s => s !== size)
                            : [...prev.sizes, size]
                        }));
                      }}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        filterBy.sizes.includes(size)
                          ? 'bg-purple-100 border-purple-300 text-purple-800'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Categories</h3>
                <div className="space-y-2">
                  {availableCategories.map(category => (
                    <label key={category} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={filterBy.categories.includes(category)}
                        onChange={(e) => {
                          setFilterBy(prev => ({
                            ...prev,
                            categories: e.target.checked
                              ? [...prev.categories, category]
                              : prev.categories.filter(c => c !== category)
                          }));
                        }}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-700">{category}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Products Grid */}
      <motion.div
        layout
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8 overflow-visible"
      >
        <AnimatePresence>
          {paginationData.products.map((product, index) => (
            <motion.div
              key={product.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            >
              <ProductCard product={product} index={index} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Pagination */}
      {paginationData.totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center space-x-8 mt-8"
        >
          <button
            onClick={() => handlePageChange(1)}
            disabled={!paginationData.hasPrevPage}
            className="px-4 py-2 border rounded disabled:opacity-50"
        >
            &laquo; Page 1
          </button>
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={!paginationData.hasPrevPage}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            &lt; Previous
          </button>
          <span className="text-lg font-medium text-gray-700">
            Page {currentPage} of {paginationData.totalPages}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={!paginationData.hasNextPage}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Next &gt;
          </button>
        </motion.div>
      )}

      {paginationData.products.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <div className="text-gray-400 mb-4">
            <SlidersHorizontal className="w-16 h-16 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500">Try adjusting your filters to see more results.</p>
        </motion.div>
      )}
    </div>
  );
};

export default ProductGrid;