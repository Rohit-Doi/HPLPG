from typing import Dict, List, Optional
import pandas as pd
from datetime import datetime
import numpy as np
from .cold_start_strategy import ColdStartStrategy

class PersonalizationEngine:
    def __init__(self, user_data: pd.DataFrame, product_data: pd.DataFrame):
        self.user_data = user_data
        self.product_data = product_data
        self.cold_start = ColdStartStrategy(user_data, product_data)
        self._initialize_models()
        
    def _initialize_models(self):
        """Initialize models for personalization"""
        # Initialize RFM analysis
        self.rfm_analysis = self._calculate_rfm()
        # Initialize category popularity model
        self.category_popularity = self._calculate_category_popularity()
        
    def _calculate_rfm(self) -> pd.DataFrame:
        """Calculate RFM scores for users"""
        recency = self.user_data.groupby('user_id')['timestamp'].max()
        frequency = self.user_data.groupby('user_id')['transaction_id'].nunique()
        monetary = self.user_data.groupby('user_id')['amount'].sum()
        
        rfm = pd.DataFrame({
            'recency': recency,
            'frequency': frequency,
            'monetary': monetary
        })
        
        # Calculate quartiles
        rfm['r_quartile'] = pd.qcut(rfm['recency'].rank(method='first'), 4, labels=[4, 3, 2, 1])
        rfm['f_quartile'] = pd.qcut(rfm['frequency'].rank(method='first'), 4, labels=[1, 2, 3, 4])
        rfm['m_quartile'] = pd.qcut(rfm['monetary'].rank(method='first'), 4, labels=[1, 2, 3, 4])
        
        return rfm
    
    def _calculate_category_popularity(self) -> pd.DataFrame:
        """Calculate category popularity based on user demographics"""
        try:
            # Ensure we're working with numeric values
            numeric_data = self.product_data.copy()
            for col in ['views', 'purchases', 'rating']:
                numeric_data[col] = pd.to_numeric(numeric_data[col], errors='coerce')
            
            # Drop any rows with missing values in the numeric columns
            numeric_data = numeric_data.dropna(subset=['views', 'purchases', 'rating'])
            
            if numeric_data.empty:
                return pd.DataFrame(columns=['views', 'purchases', 'rating'])
            
            # Group by the specified columns and calculate means
            result = numeric_data.groupby(['category', 'age_group', 'gender']).agg({
                'views': 'mean',
                'purchases': 'mean',
                'rating': 'mean'
            })
            
            # Sort by purchases and rating if possible
            if not result.empty and all(col in result.columns for col in ['purchases', 'rating']):
                result = result.sort_values(['purchases', 'rating'], ascending=False)
            
            # Convert back to float32 to save memory
            for col in ['views', 'purchases', 'rating']:
                if col in result.columns:
                    result[col] = result[col].astype('float32')
                    
            return result
            
        except Exception as e:
            print(f"Error in _calculate_category_popularity: {str(e)}")
            print(f"Columns in product_data: {self.product_data.columns.tolist()}")
            print(f"Dtypes: {self.product_data.dtypes}")
            raise
    
    def generate_landing_page_layout(self, user_profile: Dict) -> Dict:
        """Generate personalized landing page layout"""
        # Check if we need cold start strategy
        if user_profile.get('new_user', True):
            return self.cold_start.get_fallback_recommendations(user_profile)
            
        # Determine user stage
        stage = self._determine_user_stage(user_profile)
        
        # Generate content modules
        layout = {
            'hero_banner': self._get_hero_banner(stage),
            'product_modules': self._get_product_modules(user_profile),
            'cta_modules': self._get_cta_modules(stage),
            'dynamic_content': self._get_dynamic_content(user_profile)
        }
        
        return layout
    
    def _determine_user_stage(self, user_profile: Dict) -> str:
        """Determine user's stage in the funnel"""
        # Basic stage determination based on demographics and behavior
        if user_profile.get('new_user', True):
            return 'discovery'
        elif user_profile.get('cart_abandoned', False):
            return 'consideration'
        else:
            return 'purchase'
    
    def _get_hero_banner(self, stage: str) -> Dict:
        """Generate personalized hero banner"""
        banners = {
            'discovery': {
                'title': 'Welcome to Our Store',
                'subtitle': 'Discover Amazing Products',
                'image': 'welcome-banner.jpg'
            },
            'consideration': {
                'title': 'Your Cart Awaits',
                'subtitle': 'Complete Your Purchase',
                'image': 'cart-banner.jpg'
            },
            'purchase': {
                'title': 'Thank You for Shopping',
                'subtitle': 'Explore More Deals',
                'image': 'thank-you-banner.jpg'
            }
        }
        return banners.get(stage, banners['discovery'])
    
    def _get_product_modules(self, user_profile: Dict) -> List[Dict]:
        """Generate personalized product modules"""
        modules = []
        
        try:
            # Get the user's age group and gender
            age_group = user_profile.get('age_group', '25-34')  # Default to a common age group if not specified
            gender = user_profile.get('gender', 'M')  # Default to 'M' if not specified
            
            # Check if we have data for this age group and gender
            if (age_group, gender) in self.category_popularity.index:
                # Get top categories for this user's demographics
                top_categories = self.category_popularity.loc[(age_group, gender)].head(3)
                
                # If we have a MultiIndex, get the category names from the first level
                if hasattr(top_categories.index, 'levels'):
                    categories = top_categories.index.get_level_values(0).unique()
                else:
                    categories = top_categories.index.unique()
                
                # Get top products for each category
                for category in categories:
                    products = self.product_data[
                        (self.product_data['category'] == category) & 
                        (self.product_data['age_group'] == age_group) & 
                        (self.product_data['gender'] == gender)
                    ].sort_values('rating', ascending=False).head(5)
                    
                    if not products.empty:
                        modules.append({
                            'title': f"Top {category.capitalize()}",
                            'category': category,
                            'products': products[['product_id', 'name', 'price', 'image']].to_dict('records')
                        })
            
            # If no modules were added, add some default categories
            if not modules:
                default_categories = self.product_data['category'].value_counts().head(3).index
                for category in default_categories:
                    products = self.product_data[
                        (self.product_data['category'] == category)
                    ].sort_values('rating', ascending=False).head(5)
                    
                    if not products.empty:
                        modules.append({
                            'title': f"Top {category.capitalize()}",
                            'category': category,
                            'products': products[['product_id', 'name', 'price', 'image']].to_dict('records')
                        })
                        
        except Exception as e:
            print(f"Error in _get_product_modules: {str(e)}")
            # Return empty list if there's an error
            return []
        
        return modules
    
    def _get_cta_modules(self, stage: str) -> List[Dict]:
        """Generate personalized CTA modules"""
        ctas = {
            'discovery': [
                {'type': 'browse', 'text': 'Explore Categories', 'action': 'browse', 'priority': 1},
                {'type': 'new_arrivals', 'text': 'New Arrivals', 'action': 'new', 'priority': 2}
            ],
            'consideration': [
                {'type': 'cart', 'text': 'View Cart', 'action': 'cart', 'priority': 1},
                {'type': 'coupon', 'text': 'Apply Coupon', 'action': 'coupon', 'priority': 2}
            ],
            'purchase': [
                {'type': 'shop', 'text': 'Shop Again', 'action': 'shop', 'priority': 1},
                {'type': 'recommendations', 'text': 'View Recommendations', 'action': 'recommend', 'priority': 2}
            ]
        }
        return ctas.get(stage, ctas['discovery'])
    
    def _get_dynamic_content(self, user_profile: Dict) -> Dict:
        """Generate dynamic content based on user behavior"""
        return {
            'recent_views': self._get_recent_views(user_profile),
            'popular_now': self._get_popular_products(),
            'personalized_offers': self._get_personalized_offers(user_profile)
        }
    
    def _get_recent_views(self, user_profile: Dict) -> List[Dict]:
        """Get recently viewed products"""
        return self.product_data.sort_values('views', ascending=False).head(5)[
            ['product_id', 'name', 'price', 'image']
        ].to_dict('records')
    
    def _get_popular_products(self) -> List[Dict]:
        """Get currently popular products"""
        return self.product_data.sort_values('purchases', ascending=False).head(5)[
            ['product_id', 'name', 'price', 'image']
        ].to_dict('records')
    
    def _get_personalized_offers(self, user_profile: Dict) -> List[Dict]:
        """Generate personalized offers based on user profile"""
        offers = []
        if user_profile.get('new_user', True):
            offers.append({
                'type': 'welcome',
                'discount': '10%',
                'description': 'Welcome Discount'
            })
        if user_profile.get('cart_abandoned', False):
            offers.append({
                'type': 'cart',
                'discount': '15%',
                'description': 'Cart Recovery Offer'
            })
        return offers
