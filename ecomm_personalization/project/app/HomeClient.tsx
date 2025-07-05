'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, ShoppingBag, Heart, Star, Sparkles, TrendingUp } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { Product } from '@/lib/products';
import { fetchPersonalizedContent } from '@/lib/personalizeApi';

const categories = [
  {
    name: 'Men',
    href: '/men',
    image: 'https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg?auto=compress&cs=tinysrgb&w=600',
    description: 'Discover the latest in men\'s fashion',
    gradient: 'from-pastel-mint to-pastel-skyblue'
  },
  {
    name: 'Women',
    href: '/women',
    image: '/women/Women%27s Aviator Jacket in Brown.png',
    description: 'Elegant styles for the modern woman',
    gradient: 'from-pastel-lavender to-pastel-pink'
  },
  {
    name: 'Sale',
    href: '/sale',
    image: 'https://images.pexels.com/photos/1124468/pexels-photo-1124468.jpeg?auto=compress&cs=tinysrgb&w=600',
    description: 'Amazing deals and discounts',
    gradient: 'from-pastel-peach to-pastel-yellow'
  },
  {
    name: 'Accessories',
    href: '/accessories',
    image: 'https://images.pexels.com/photos/1040945/pexels-photo-1040945.jpeg?auto=compress&cs=tinysrgb&w=600',
    description: 'Complete your perfect look',
    gradient: 'from-pastel-skyblue to-pastel-mint'
  }
];

export default function HomeClient({ trendingProducts, newProducts, recommendedProducts, saleProducts }: {
  trendingProducts: Product[];
  newProducts: Product[];
  recommendedProducts: Product[];
  saleProducts: Product[];
}) {
  const [personalized, setPersonalized] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchPersonalizedContent({})
      .then(setPersonalized)
      .catch(() => setPersonalized(null))
      .finally(() => setLoading(false));
  }, []);

  // Use personalized content if available
  const heroBanner = personalized?.content?.heroBanner;
  const featuredCategories = personalized?.content?.featuredCategories;
  const recommended = personalized?.content?.recommendedProducts;

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 pastel-bg"></div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-8"
          >
            <motion.h1
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-5xl md:text-7xl font-bold text-gray-900 leading-tight"
            >
              {heroBanner ? (
                <>
                  {heroBanner.title}
                  <br />
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    {heroBanner.subtitle}
                  </span>
                </>
              ) : (
                <>
                  Discover Your
                  <br />
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    Perfect Style
                  </span>
                </>
              )}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto"
            >
              {heroBanner?.subtitle || 'Curated collection of fashion-forward pieces in beautiful pastel colors, tailored to your unique taste and style preferences.'}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6"
            >
              <Link href="/women">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center space-x-2"
                >
                  <ShoppingBag className="w-5 h-5" />
                  <span>Shop Now</span>
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
              </Link>
              <Link href="/learnmore">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 bg-white/20 backdrop-blur-sm border border-white/30 text-gray-700 font-semibold rounded-full hover:bg-white/30 transition-all duration-300"
                >
                  Learn More
                </motion.button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
        {/* Floating Elements */}
        <motion.div
          animate={{ y: [-10, 10, -10] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-20 h-20 bg-pastel-mint rounded-full opacity-30 blur-xl"
        />
        <motion.div
          animate={{ y: [10, -10, 10] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-3/4 right-1/4 w-16 h-16 bg-pastel-lavender rounded-full opacity-40 blur-xl"
        />
        <motion.div
          animate={{ y: [-15, 15, -15] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-1/4 left-1/3 w-12 h-12 bg-pastel-peach rounded-full opacity-35 blur-xl"
        />
      </section>
      {/* Categories Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Shop by Category</h2>
            <p className="text-xl text-gray-600">Find exactly what you're looking for</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {(featuredCategories || categories).map((category: any, index: number) => (
              <motion.div
                key={category.name || category.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                whileHover={{ y: -10 }}
                className="group cursor-pointer"
              >
                <Link href={category.href || `/category/${category.slug}` }>
                  <div className="relative overflow-hidden rounded-2xl aspect-square mb-4">
                    <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient || ''} opacity-20 group-hover:opacity-30 transition-opacity duration-300`} />
                    <img
                      src={category.image || category.imageUrl}
                      alt={category.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors duration-300" />
                    <div className="absolute bottom-4 left-4 text-white">
                      <h3 className="text-2xl font-bold mb-1">{category.name}</h3>
                      <p className="text-sm opacity-90">{category.description}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      {/* Trending/Recommended Products Section */}
      <section className="py-20 bg-gradient-to-br from-pastel-mint/10 to-pastel-lavender/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex items-center justify-between mb-12"
          >
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-4 flex items-center">
                <TrendingUp className="w-8 h-8 mr-3 text-purple-600" />
                Trending Now
              </h2>
              <p className="text-xl text-gray-600">What everyone's talking about</p>
            </div>
            <Link href="/trending">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 bg-white rounded-full shadow-md hover:shadow-lg transition-all duration-300 flex items-center space-x-2"
              >
                <span>View All</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </Link>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {(recommended || trendingProducts).map((product: Product, index: number) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        </div>
      </section>
      {/* New Arrivals */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex items-center justify-between mb-12"
          >
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-4 flex items-center">
                <Sparkles className="w-8 h-8 mr-3 text-purple-600" />
                New Arrivals
              </h2>
              <p className="text-xl text-gray-600">Fresh styles just for you</p>
            </div>
            <Link href="/new">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 bg-white rounded-full shadow-md hover:shadow-lg transition-all duration-300 flex items-center space-x-2"
              >
                <span>View All</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </Link>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {newProducts.map((product: Product, index: number) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        </div>
      </section>
      {/* Personalized Recommendations */}
      <section className="py-20 bg-gradient-to-br from-pastel-peach/10 to-pastel-skyblue/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4 flex items-center justify-center">
              <Heart className="w-8 h-8 mr-3 text-purple-600" />
              Picked Just for You
            </h2>
            <p className="text-xl text-gray-600">Personalized recommendations based on your style</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recommendedProducts.map((product: Product, index: number) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        </div>
      </section>
      {/* Sale Products */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex items-center justify-between mb-12"
          >
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-4 flex items-center">
                <Star className="w-8 h-8 mr-3 text-purple-600" />
                Sale Picks
              </h2>
              <p className="text-xl text-gray-600">Best deals from our sale collection</p>
            </div>
            <Link href="/sale">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 bg-white rounded-full shadow-md hover:shadow-lg transition-all duration-300 flex items-center space-x-2"
              >
                <span>View All</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </Link>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {saleProducts.map((product: Product, index: number) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        </div>
      </section>
      {/* Call to Action Section */}
      <section className="w-full py-24 bg-gradient-to-r from-purple-600 to-pink-500 flex flex-col items-center justify-center text-center">
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Ready to Find Your Style?</h2>
        <p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl mx-auto">
          Join thousands of fashion lovers who've discovered their perfect look with PastelShop
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Link href="/signup">
            <button className="px-8 py-4 bg-white text-purple-600 font-semibold rounded-full shadow-lg hover:bg-purple-100 transition-all duration-300 text-lg">
              Create Account
            </button>
          </Link>
        </div>
      </section>
    </div>
  );
} 