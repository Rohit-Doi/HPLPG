import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';
import { Product } from '@/lib/products';

interface ProductCardProps {
  product: Product;
  index?: number;
}

const POPUP_WIDTH = 288; // 18rem (w-72)
const POPUP_MARGIN = 16; // px above/below the card
const ARROW_SIZE = 8; // px

const ProductCard: React.FC<ProductCardProps> = ({ product, index = 0 }) => {
  // Remove all popup-related state, refs, useLayoutEffect, and rendering
  // Remove: useState for isHovered and popupPos, useRef for cardRef and popupRef, useLayoutEffect for popup positioning, and all popup rendering logic

  return (
    <div
      className="relative z-10"
      // Remove: onMouseEnter and onMouseLeave for hover popup
    >
      {/* Product Card Content Here (not shown for brevity) */}
      {/* Hover Popup rendered via portal */}
      {/* Product Card Content Here (rest of the card) */}
    </div>
  );
};

export default ProductCard; 