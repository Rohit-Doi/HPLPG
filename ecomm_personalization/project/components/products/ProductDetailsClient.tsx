"use client";
import React, { useState } from "react";
import type { Product } from "../../lib/products";
import { useCart } from "../../contexts/CartContext";
import { useWishlist } from "../../contexts/WishlistContext";
import { useRouter } from "next/navigation";

interface ProductDetailsClientProps {
  product: Product;
}

const staticOffers = [
  { label: "First Time Buyer", desc: "Get 15% off on your first purchase", badge: "15% OFF" },
  { label: "Free Shipping", desc: "Free delivery on orders above ₹999", badge: "FREE SHIPPING" },
  { label: "Bundle Deal", desc: "Buy 2 get 1 free on selected items", badge: "BUY 2 GET 1" },
];

const staticReviews = [
  {
    user: "Priya S.",
    rating: 5,
    comment: "Absolutely love this product! The quality is amazing and it fits perfectly. The fabric is soft and comfortable. Highly recommend to everyone!",
    date: "15/1/2024",
    helpful: 12,
    verified: true,
  },
  {
    user: "Rahul M.",
    rating: 4,
    comment: "Good quality product. Delivery was fast and packaging was excellent. The size chart was accurate. Worth the price, will order again.",
    date: "10/1/2024",
    helpful: 8,
    verified: true,
  },
  {
    user: "Anita K.",
    rating: 5,
    comment: "Perfect fit and beautiful color. The material feels premium and the stitching is excellent. Exceeded my expectations!",
    date: "5/1/2024",
    helpful: 15,
    verified: false,
  },
  {
    user: "Vikram T.",
    rating: 4,
    comment: "Great product overall. The only minor issue is that it's slightly smaller than expected, but the quality makes up for it. Customer service was helpful.",
    date: "28/12/2023",
    helpful: 6,
    verified: true,
  },
  {
    user: "Sneha P.",
    rating: 5,
    comment: "Amazing quality and fast delivery! The product looks exactly like the pictures. Very satisfied with my purchase.",
    date: "20/12/2023",
    helpful: 9,
    verified: true,
  },
];

const keyFeatures = [
  "Premium quality materials sourced ethically",
  "Comfortable fit designed for all-day wear",
  "Durable construction with reinforced stitching",
  "Available in multiple sizes and colors",
  "Sustainable and eco-friendly production",
  "Wrinkle-resistant and easy to maintain",
];

const materialCare = [
  "100% premium cotton blend",
  "Machine wash cold with like colors",
  "Do not bleach or use harsh chemicals",
  "Tumble dry on low heat setting",
  "Iron on medium temperature if needed",
  "Professional dry cleaning recommended",
];

const sizeGuide = [
  { size: "S", chest: "36-38", length: "26-27", shoulder: "16-17" },
  { size: "M", chest: "38-40", length: "27-28", shoulder: "17-18" },
  { size: "L", chest: "40-42", length: "28-29", shoulder: "18-19" },
  { size: "XL", chest: "42-44", length: "29-30", shoulder: "19-20" },
];

const shippingInfo = [
  { label: "Standard Delivery:", value: "3-5 business days" },
  { label: "Express Delivery:", value: "1-2 business days" },
  { label: "Free Shipping:", value: "Orders above ₹999" },
  { label: "Cash on Delivery:", value: "Available" },
  { label: "Same Day Delivery:", value: "Available in select cities" },
];

const returnPolicy = [
  { label: "Return Window:", value: "30 days" },
  { label: "Return Shipping:", value: "Free" },
  { label: "Refund Processing:", value: "5-7 business days" },
  { label: "Exchange:", value: "Available" },
  { label: "Quality Guarantee:", value: "100%" },
];

const returnConditions = [
  "Items must be in original condition with tags attached",
  "Items should be unworn and unwashed",
  "Original packaging must be included",
  "Certain items like undergarments are not returnable",
];

const qualityAssurance = [
  "All products undergo quality checks",
  "Defective items replaced immediately",
  "Customer satisfaction guaranteed",
  "24/7 customer support available",
];

const ProductDetailsClient: React.FC<ProductDetailsClientProps> = ({ product }) => {
  // Ensure originalPrice is greater than price for sale products
  if (product.onSale && (typeof product.originalPrice !== 'number' || product.originalPrice <= product.price)) {
    product.originalPrice = product.price + 500;
  }
  const [selectedSize, setSelectedSize] = useState(product.sizes[0]);
  const [selectedColor, setSelectedColor] = useState(product.colors[0]);
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState<'description' | 'reviews' | 'shipping'>('description');
  const { addItem } = useCart();
  const { addItem: addWishlist, removeItem: removeWishlist, isInWishlist } = useWishlist();
  const router = useRouter();
  const inWishlist = isInWishlist(product.id);

  const handleAddToCart = () => {
    for (let i = 0; i < quantity; i++) {
      addItem(product, selectedSize, selectedColor);
    }
    router.push("/cart");
  };

  const handleWishlist = () => {
    if (inWishlist) {
      removeWishlist(product.id);
    } else {
      addWishlist(product);
    }
  };

  // Review summary
  const avgRating = 4.6;
  const reviewCounts = [3, 2, 0, 0, 0]; // 5★, 4★, 3★, 2★, 1★
  const totalReviews = 5;

  const standardSizes = ['S', 'M', 'L', 'XL', 'XXL'];
  const uniqueSizes = Array.from(new Set(product.sizes)).filter(size => standardSizes.includes(size));
  const uniqueColors = Array.from(new Set(product.colors)).slice(0, 2);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Images */}
        <div>
          <img
            src={product.images[0]}
            alt={product.name}
            className="w-full h-96 object-cover rounded-lg shadow"
          />
          <div className="flex mt-4 space-x-2">
            {product.images.slice(1).map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt={product.name + " alt " + idx}
                className="w-16 h-16 object-cover rounded border hover:ring-2 hover:ring-blue-400 cursor-pointer"
              />
            ))}
          </div>
        </div>
        {/* Product Info */}
        <div>
          <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
          <div className="flex items-center mb-2">
            <span className="text-yellow-500 text-xl mr-1">{'★'.repeat(Math.round(product.rating))}</span>
            <span className="text-gray-600 text-sm">({avgRating}) • {totalReviews} reviews • {product.category}</span>
          </div>
          <div className="text-2xl font-semibold text-blue-600 mb-2">₹{product.price}</div>
          {product.originalPrice && (
            <div className="text-lg line-through text-gray-400 mb-2">₹{product.originalPrice}</div>
          )}
          <p className="text-gray-600 mb-4">{product.description}</p>
          <div className="mb-4 bg-purple-50 rounded-lg p-4">
            <div className="font-semibold text-purple-700 mb-2 flex items-center">
              <span className="mr-2">🎁</span> Special Offers
            </div>
            <ul className="space-y-2">
              {staticOffers.map((offer, idx) => (
                <li key={idx} className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{offer.label}</span>
                    <span className="block text-xs text-gray-600">{offer.desc}</span>
                  </div>
                  <span className="bg-purple-200 text-purple-800 px-2 py-1 rounded text-xs font-semibold ml-2">{offer.badge}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mb-4">
            <span className="font-semibold">Size:</span>
            <div className="flex space-x-2 mt-1">
              {uniqueSizes.map((size) => (
                <button
                  key={size}
                  className={`px-3 py-1 rounded border ${selectedSize === size ? 'bg-blue-600 text-white' : 'bg-white text-gray-800'}`}
                  onClick={() => setSelectedSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <span className="font-semibold">Color:</span>
            <div className="flex space-x-2 mt-1">
              {uniqueColors.map((color) => (
                <button
                  key={color}
                  className={`px-3 py-1 rounded border ${selectedColor === color ? 'bg-blue-600 text-white' : 'bg-white text-gray-800'}`}
                  onClick={() => setSelectedColor(color)}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <span className="font-semibold">Quantity:</span>
            <div className="flex items-center space-x-2 mt-1">
              <button
                className="w-8 h-8 rounded border flex items-center justify-center text-lg font-bold"
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
              >-</button>
              <span className="w-8 text-center">{quantity}</span>
              <button
                className="w-8 h-8 rounded border flex items-center justify-center text-lg font-bold"
                onClick={() => setQuantity(q => q + 1)}
              >+</button>
            </div>
          </div>
          <div className="flex items-center space-x-4 mb-4">
            <button
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-400 text-white py-3 rounded-lg font-bold hover:from-purple-600 hover:to-pink-500 transition flex items-center justify-center"
              onClick={handleAddToCart}
            >
              <span className="material-icons mr-2">shopping_cart</span> Add to Cart
            </button>
            <button
              className={`w-12 h-12 flex items-center justify-center rounded-lg border ${inWishlist ? "bg-pink-100 border-pink-400" : "bg-white border-gray-300"}`}
              onClick={handleWishlist}
              aria-label="Add to wishlist"
            >
              {inWishlist ? (
                <span className="material-icons text-pink-500 text-2xl">favorite</span>
              ) : (
                <span className="material-icons text-gray-400 text-2xl">favorite_border</span>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between mt-4 text-sm">
            <div className="flex items-center text-green-600 font-semibold">
              <span className="material-icons mr-1">local_shipping</span> Free Shipping
            </div>
            <div className="flex items-center text-blue-600 font-semibold">
              <span className="material-icons mr-1">verified_user</span> Secure Payment
            </div>
            <div className="flex items-center text-purple-600 font-semibold">
              <span className="material-icons mr-1">autorenew</span> Easy Returns
            </div>
          </div>
        </div>
      </div>
      {/* Tabs Section */}
      <div className="mt-10">
        <div className="flex border-b mb-6">
          <button
            className={`px-6 py-2 font-semibold ${tab === 'description' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500'}`}
            onClick={() => setTab('description')}
          >
            Description
          </button>
          <button
            className={`px-6 py-2 font-semibold ${tab === 'reviews' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500'}`}
            onClick={() => setTab('reviews')}
          >
            Reviews
          </button>
          <button
            className={`px-6 py-2 font-semibold ${tab === 'shipping' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500'}`}
            onClick={() => setTab('shipping')}
          >
            Shipping
          </button>
        </div>
        {/* Tab Content */}
        {tab === 'description' && (
          <div>
            <h2 className="text-xl font-bold mb-2">Product Description</h2>
            <p className="mb-4">Elegant silk blouse that adds sophistication to any outfit. Perfect for office wear or special occasions. The smooth silk fabric drapes beautifully and feels luxurious against the skin.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
              <div>
                <h3 className="font-bold mb-2">Key Features:</h3>
                <ul className="list-disc ml-6">
                  {keyFeatures.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="font-bold mb-2">Material & Care:</h3>
                <ul className="list-disc ml-6">
                  {materialCare.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-bold mb-2">Size Guide:</h3>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b">
                    <th className="py-1">Size</th>
                    <th className="py-1">Chest (inches)</th>
                    <th className="py-1">Length (inches)</th>
                    <th className="py-1">Shoulder (inches)</th>
                  </tr>
                </thead>
                <tbody>
                  {sizeGuide.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 font-semibold">{row.size}</td>
                      <td className="py-1">{row.chest}</td>
                      <td className="py-1">{row.length}</td>
                      <td className="py-1">{row.shoulder}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab === 'reviews' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Rating Summary */}
            <div className="md:col-span-1">
              <div className="text-4xl font-bold mb-1">{avgRating}</div>
              <div className="text-lg mb-2">{totalReviews} reviews</div>
              <div className="space-y-1 mb-4">
                {[5,4,3,2,1].map((star, i) => (
                  <div key={star} className="flex items-center">
                    <span className="text-yellow-500">{'★'.repeat(star)}</span>
                    <span className="ml-2 text-gray-600 text-sm">{reviewCounts[5-star]} </span>
                  </div>
                ))}
              </div>
            </div>
            {/* Reviews List */}
            <div className="md:col-span-2 space-y-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold">Customer Reviews</h3>
                <button className="bg-purple-600 text-white px-4 py-1 rounded font-semibold">Write a Review</button>
              </div>
              {staticReviews.map((review, idx) => (
                <div key={idx} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center mb-1">
                    <span className="font-bold mr-2">{review.user}</span>
                    {review.verified && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded mr-2">Verified Purchase</span>}
                    <span className="text-yellow-500">{'★'.repeat(review.rating)}</span>
                    <span className="ml-2 text-gray-400 text-xs">{review.date}</span>
                  </div>
                  <div className="mb-2 text-gray-700">{review.comment}</div>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span>Helpful ({review.helpful})</span>
                    <span className="cursor-pointer hover:underline">Not helpful</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'shipping' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Shipping & Returns</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Shipping Information */}
              <div>
                <div className="flex items-center mb-2">
                  <span className="material-icons text-green-600 mr-2" aria-hidden="true">local_shipping</span>
                  <span className="font-bold text-lg">Shipping Information</span>
                </div>
                <table className="w-full mb-4">
                  <tbody>
                    <tr>
                      <td className="font-semibold text-black py-1 pr-4">Standard Delivery:</td>
                      <td className="py-1 text-gray-700">3-5 business days</td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-black py-1 pr-4">Express Delivery:</td>
                      <td className="py-1 text-gray-700">1-2 business days</td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-black py-1 pr-4">Free Shipping:</td>
                      <td className="py-1 text-gray-700">Orders above ₹999</td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-black py-1 pr-4">Cash on Delivery:</td>
                      <td className="py-1 text-green-600 font-semibold">Available</td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-black py-1 pr-4">Same Day Delivery:</td>
                      <td className="py-1 text-gray-700">Available in select cities</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Return Policy */}
              <div>
                <div className="flex items-center mb-2">
                  <span className="material-icons text-purple-600 mr-2" aria-hidden="true">autorenew</span>
                  <span className="font-bold text-lg">Return Policy</span>
                </div>
                <table className="w-full mb-4">
                  <tbody>
                    <tr>
                      <td className="font-semibold text-black py-1 pr-4">Return Window:</td>
                      <td className="py-1 text-gray-700">30 days</td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-black py-1 pr-4">Return Shipping:</td>
                      <td className="py-1 text-green-600 font-semibold">Free</td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-black py-1 pr-4">Refund Processing:</td>
                      <td className="py-1 text-gray-700">5-7 business days</td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-black py-1 pr-4">Exchange:</td>
                      <td className="py-1 text-green-600 font-semibold">Available</td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-black py-1 pr-4">Quality Guarantee:</td>
                      <td className="py-1 text-green-600 font-semibold">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
              {/* Return Conditions */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <span className="material-icons text-blue-700 mr-2" aria-hidden="true">inventory_2</span>
                  <span className="font-bold text-blue-700 text-lg">Return Conditions:</span>
                </div>
                <ul className="list-disc ml-6 text-blue-800">
                  {returnConditions.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
              {/* Quality Assurance */}
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <span className="material-icons text-green-700 mr-2" aria-hidden="true">verified</span>
                  <span className="font-bold text-green-700 text-lg">Quality Assurance:</span>
                </div>
                <ul className="list-disc ml-6 text-green-800">
                  {qualityAssurance.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetailsClient; 