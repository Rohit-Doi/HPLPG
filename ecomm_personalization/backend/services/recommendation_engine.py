from typing import List, Dict, Any, Optional, Union
import numpy as np
import pandas as pd
from datetime import datetime
import json
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from surprise import SVD, Dataset, Reader
from surprise.model_selection import train_test_split, GridSearchCV
from collections import Counter

class MatrixFactorizationRecommender:
    """Matrix Factorization using Surprise SVD with hyperparameter tuning."""
    def __init__(self):
        self.model = SVD()
        self.trained = False
        self.user_map = {}
        self.item_map = {}
        self.reverse_user_map = {}
        self.reverse_item_map = {}

    def fit(self, interactions):
        """
        interactions: list of dicts with keys 'user_id', 'item_id', 'rating'
        """
        if not interactions:
            return
        df = pd.DataFrame(interactions)
        reader = Reader(rating_scale=(df['rating'].min(), df['rating'].max()))
        data = Dataset.load_from_df(df[['user_id', 'item_id', 'rating']], reader)
        trainset = data.build_full_trainset()
        # Hyperparameter tuning if enough data
        if len(df) > 100:
            param_grid = {
                'n_factors': [50, 100],
                'reg_all': [0.02, 0.05],
                'lr_all': [0.002, 0.005]
            }
            gs = GridSearchCV(SVD, param_grid, measures=['rmse'], cv=2, n_jobs=-1)
            gs.fit(data)
            print('Best RMSE:', gs.best_score['rmse'])
            print('Best params:', gs.best_params['rmse'])
            self.model = gs.best_estimator['rmse']
        else:
            self.model = SVD()
        self.model.fit(trainset)
        self.trained = True
        # Build user/item maps for fast lookup
        self.user_map = {uid: i for i, uid in enumerate(df['user_id'].unique())}
        self.item_map = {iid: i for i, iid in enumerate(df['item_id'].unique())}
        self.reverse_user_map = {i: uid for uid, i in self.user_map.items()}
        self.reverse_item_map = {i: iid for iid, i in self.item_map.items()}

    def recommend(self, user_id, item_ids, n=10):
        """Recommend top-N items for a user from a list of item_ids."""
        if not self.trained:
            return []
        predictions = []
        for item_id in item_ids:
            pred = self.model.predict(user_id, item_id)
            predictions.append((item_id, pred.est))
        predictions.sort(key=lambda x: x[1], reverse=True)
        return [iid for iid, _ in predictions[:n]]

class RecommendationEngine:
    def __init__(self):
        self.user_profiles = {}
        self.product_features = {}
        self.user_similarity_model = None
        self.scaler = StandardScaler()
        self.is_trained = False
        # --- Enhancement: Bandit and Advanced Model Stubs ---
        self.bandit_strategy = None  # Placeholder for multi-armed bandit
        self.advanced_model = None   # Placeholder for advanced ML model (e.g., matrix factorization)
        # --- Matrix Factorization Model ---
        self.mf_model = MatrixFactorizationRecommender()
        # --- Feature Engineering Stub ---
        # Add more user/product/context features here as needed
        
    def train(self, user_profiles: List[Dict], products: List[Dict]):
        """Train the recommendation models."""
        if not user_profiles or not products:
            return False
            
        # Process user profiles
        self.user_profiles = {profile['user_id']: profile for profile in user_profiles}
        
        # Process product features
        self.product_features = {product['id']: product for product in products}
        
        # Prepare data for user similarity model
        df_users = self._prepare_user_features(user_profiles)
        
        # Train user similarity model
        if not df_users.empty:
            self._train_user_similarity(df_users)
            self.is_trained = True
            # --- Train Matrix Factorization Model ---
            # For demo, use products_viewed as implicit feedback (rating=1)
            interactions = []
            for profile in user_profiles:
                for pid in profile.get('products_viewed', []):
                    interactions.append({'user_id': profile['user_id'], 'item_id': pid, 'rating': 1})
            self.mf_model.fit(interactions)
            return True
            
        return False
    
    def _prepare_user_features(self, user_profiles: List[Dict]) -> pd.DataFrame:
        """Prepare user features for similarity modeling."""
        if not user_profiles:
            return pd.DataFrame()
            
        # Convert to DataFrame
        df = pd.DataFrame(user_profiles)
        
        # Select and preprocess features
        features = [
            'total_sessions',
            'total_duration_seconds',
            'avg_session_duration',
            'total_page_views',
            'total_product_views',
            'total_add_to_cart',
            'total_purchases',
            'conversion_rate',
            'unique_products_viewed',
            'unique_categories_viewed'
        ]
        
        # Ensure all features exist
        existing_features = [f for f in features if f in df.columns]
        
        # Fill missing values
        df[existing_features] = df[existing_features].fillna(0)
        
        # Scale numeric features
        if not df.empty and existing_features:
            df[existing_features] = self.scaler.fit_transform(df[existing_features])
            
        return df[['user_id'] + existing_features] if 'user_id' in df.columns else pd.DataFrame()
    
    def _train_user_similarity(self, user_features: pd.DataFrame):
        """Train KNN model for user similarity."""
        if user_features.empty or len(user_features) < 2:
            return
            
        # Get feature columns (exclude user_id)
        feature_cols = [col for col in user_features.columns if col != 'user_id']
        
        if not feature_cols:
            return
            
        # Train KNN model
        self.user_similarity_model = NearestNeighbors(
            n_neighbors=min(5, len(user_features)),
            metric='cosine',
            algorithm='auto'
        )
        
        self.user_similarity_model.fit(user_features[feature_cols])
    
    def get_recommendations(
        self,
        user_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        n_recommendations: int = 10,
        strategy: Optional[str] = None  # Enhancement: allow explicit strategy
    ) -> Dict[str, Any]:
        """Get personalized recommendations for a user."""
        # --- Enhancement: Strategy selection logic ---
        if strategy == "bandit" and self.bandit_strategy:
            # Placeholder: call bandit strategy here
            return self.bandit_strategy(user_id, context, n_recommendations)
        if strategy == "advanced" or strategy == "matrix_factorization":
            # Use matrix factorization recommender
            if user_id and self.mf_model.trained:
                all_items = list(self.product_features.keys())
                recommended_ids = self.mf_model.recommend(user_id, all_items, n=n_recommendations)
                recommended_products = [self.product_features[iid] for iid in recommended_ids if iid in self.product_features]
                return {
                    'recommendation_type': 'matrix_factorization',
                    'user_id': user_id,
                    'recommended_products': recommended_products,
                    'explanation': 'Matrix factorization-based recommendations'
                }
        # Default collaborative filtering
        if user_id and user_id in self.user_profiles and self.is_trained:
            return self._get_personalized_recommendations(user_id, n_recommendations)
        return self._get_cold_start_recommendations(context, n_recommendations)
    
    def _get_personalized_recommendations(
        self,
        user_id: str,
        n_recommendations: int
    ) -> Dict[str, Any]:
        """Get recommendations for an existing user."""
        # Get similar users
        similar_users = self._find_similar_users(user_id)
        
        # Get products viewed/purchased by similar users
        recommended_products = self._get_products_from_similar_users(user_id, similar_users)
        
        # If not enough products, add popular products
        if len(recommended_products) < n_recommendations:
            popular_products = self._get_popular_products(
                n=n_recommendations - len(recommended_products),
                exclude_ids=[p['id'] for p in recommended_products]
            )
            recommended_products.extend(popular_products)
        
        # Re-rank for precision
        recommended_products = self._rerank_for_precision(recommended_products, self.user_profiles.get(user_id))
        # Diversify
        recommended_products = self._diversify(recommended_products, max_per_category=2)
        # Truncate
        recommended_products = recommended_products[:n_recommendations]
        # Add diversity score
        rec = {
            'recommendation_type': 'personalized',
            'user_id': user_id,
            'recommended_products': recommended_products,
            'explanation': 'Based on your activity and similar users',
            'diversity_score': self._diversity_score(recommended_products)
        }
        return rec
    
    def _get_cold_start_recommendations(
        self,
        context: Optional[Dict[str, Any]],
        n_recommendations: int
    ) -> Dict[str, Any]:
        """Get recommendations for a new/unknown user."""
        # Recommend top items from the most popular categories
        popular_products = []
        recommended_categories = []
        try:
            from data_processor import DataProcessor
            import os
            data_dir = os.environ.get('DATA_DIR', 'E:/HPLPGA/ecomm_personalization/data')
            dp = DataProcessor(data_dir=data_dir)
            dp.load_data()
            if hasattr(dp, 'activity_df') and dp.activity_df is not None and not dp.activity_df.empty:
                # Find the most common categories
                cat_counts = dp.activity_df['category'].value_counts()
                top_cats = cat_counts.index[:3]
                recommended_categories = list(top_cats)
                # Recommend the most popular items from these categories
                products = [p for p in self.product_features.values() if p.get('category') in top_cats]
                # Sort by frequency in activity_df
                freq = dp.activity_df['transaction_id'].value_counts()
                products = sorted(products, key=lambda p: freq.get(p['id'], 0), reverse=True)
                popular_products = products[:n_recommendations]
        except Exception as e:
            # Fallback to default popular products
            popular_products = self._get_popular_products(n=n_recommendations)
        if not popular_products:
            popular_products = self._get_popular_products(n=n_recommendations)
        return {
            'recommendation_type': 'cold_start',
            'context_used': context or {},
            'recommended_products': popular_products,
            'recommended_categories': recommended_categories,
            'explanation': 'Top items from most popular categories for cold start users'
        }
    
    def _find_similar_users(self, user_id: str, n_similar: int = 5) -> List[Dict]:
        """Find users similar to the given user."""
        if not self.user_similarity_model or user_id not in self.user_profiles:
            return []
            
        # Get user features
        user_features = self._prepare_user_features([self.user_profiles[user_id]])
        
        if user_features.empty:
            return []
            
        # Get feature columns
        feature_cols = [col for col in user_features.columns if col != 'user_id']
        
        # Find similar users
        distances, indices = self.user_similarity_model.kneighbors(
            user_features[feature_cols],
            n_neighbors=min(n_similar + 1, len(self.user_profiles))
        )
        
        # Get similar users (excluding the user themselves)
        similar_users = []
        for i in range(1, len(indices[0])):  # Skip the first one (the user themselves)
            similar_user_id = user_features.iloc[indices[0][i]]['user_id']
            similarity = 1 - distances[0][i]  # Convert distance to similarity
            similar_users.append({
                'user_id': similar_user_id,
                'similarity_score': similarity
            })
            
        return similar_users
    
    def _get_products_from_similar_users(
        self,
        user_id: str,
        similar_users: List[Dict],
        max_products: int = 20
    ) -> List[Dict]:
        """Get products viewed/purchased by similar users."""
        if not similar_users or not self.user_profiles:
            return []
            
        # Get products from similar users
        recommended_products = {}
        
        for similar_user in similar_users:
            similar_user_id = similar_user['user_id']
            similarity_score = similar_user['similarity_score']
            
            if similar_user_id in self.user_profiles:
                user_profile = self.user_profiles[similar_user_id]
                
                # Get products viewed by similar user (if available)
                if 'products_viewed' in user_profile and user_profile['products_viewed']:
                    for product_id in user_profile['products_viewed']:
                        if product_id in self.product_features:
                            if product_id not in recommended_products:
                                recommended_products[product_id] = {
                                    'product': self.product_features[product_id],
                                    'score': similarity_score,
                                    'recommendation_reason': f'Viewed by similar user (similarity: {similarity_score:.2f})'
                                }
                            else:
                                # Increase score if product is recommended by multiple similar users
                                recommended_products[product_id]['score'] += similarity_score
        
        # Sort by score and return top products
        sorted_products = sorted(
            recommended_products.values(),
            key=lambda x: x['score'],
            reverse=True
        )
        
        return [p['product'] for p in sorted_products[:max_products]]
    
    def _get_popular_products(
        self,
        n: int = 10,
        exclude_ids: Optional[List[str]] = None
    ) -> List[Dict]:
        """Get popular products (fallback)."""
        if not self.product_features:
            return []
            
        exclude_ids = exclude_ids or []
        
        # Sort products by popularity (or any other metric)
        sorted_products = sorted(
            [p for p in self.product_features.values() if p['id'] not in exclude_ids],
            key=lambda x: x.get('popularity', 0),
            reverse=True
        )
        
        return sorted_products[:n]

def _rerank_for_precision(self, products, user_profile=None):
    # Boost products from user's most frequent categories and most recent transactions
    if user_profile:
        # Most frequent categories
        categories = user_profile.get('category', [])
        cat_counts = {cat: categories.count(cat) for cat in set(categories)}
        top_cats = set(sorted(cat_counts, key=cat_counts.get, reverse=True)[:2])
        # Most recent transactions
        recent_transactions = user_profile.get('transaction_id', [])[-5:]
        def score(p):
            score = 0
            if p.get('category') in top_cats:
                score += 3
            if p['id'] in recent_transactions:
                score += 4
            score += 1  # base score to keep all items
            return score
        products = sorted(products, key=score, reverse=True)
    else:
        # For cold start, shuffle after sorting by popularity for diversity
        import random
        products = sorted(products, key=lambda p: p.get('popularity', 0), reverse=True)
        # Shuffle the top 10 to add diversity
        top_n = 10
        top_products = products[:top_n]
        random.shuffle(top_products)
        products = top_products + products[top_n:]
    return products

def _diversify(self, products, max_per_category=2):
    # Limit the number of products per category to increase diversity
    category_counts = Counter()
    diversified = []
    for p in products:
        cat = p.get('category', 'other')
        if category_counts[cat] < max_per_category:
            diversified.append(p)
            category_counts[cat] += 1
    return diversified

def _diversity_score(self, products):
    # Diversity = number of unique categories / total products
    categories = [p.get('category', 'other') for p in products]
    return len(set(categories)) / max(1, len(products))

# Patch into RecommendationEngine
RecommendationEngine._rerank_for_precision = _rerank_for_precision
RecommendationEngine._diversify = _diversify
RecommendationEngine._diversity_score = _diversity_score

# --- Patch _get_personalized_recommendations ---
old_get_personalized = RecommendationEngine._get_personalized_recommendations

def new_get_personalized(self, user_id, n_recommendations):
    user_profile = self.user_profiles.get(user_id)
    # Original recommendations
    rec = old_get_personalized(self, user_id, n_recommendations * 2)  # get more for diversity
    products = rec['recommended_products']
    # Re-rank for precision
    products = self._rerank_for_precision(products, user_profile)
    # Diversify
    products = self._diversify(products, max_per_category=2)
    # Truncate
    products = products[:n_recommendations]
    # Add diversity score
    rec['recommended_products'] = products
    rec['diversity_score'] = self._diversity_score(products)
    return rec

RecommendationEngine._get_personalized_recommendations = new_get_personalized

# --- Patch _get_cold_start_recommendations ---
old_get_cold_start = RecommendationEngine._get_cold_start_recommendations

def new_get_cold_start(self, context, n_recommendations):
    rec = old_get_cold_start(self, context, n_recommendations * 2)
    products = rec['recommended_products']
    # Re-rank for precision (popularity)
    products = self._rerank_for_precision(products)
    # Diversify
    products = self._diversify(products, max_per_category=2)
    # Truncate
    products = products[:n_recommendations]
    # Add diversity score
    rec['recommended_products'] = products
    rec['diversity_score'] = self._diversity_score(products)
    return rec

RecommendationEngine._get_cold_start_recommendations = new_get_cold_start
