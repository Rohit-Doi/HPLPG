from typing import Dict, List, Optional, Tuple
import pandas as pd
import numpy as np
from datetime import datetime, date
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
import holidays
from enum import Enum

class TimeSlot(Enum):
    EARLY_MORNING = (0, 6)
    MORNING = (6, 12)
    AFTERNOON = (12, 18)
    EVENING = (18, 24)
    
    @classmethod
    def get_current_slot(cls):
        current_hour = datetime.now().hour
        for slot in cls:
            if slot.value[0] <= current_hour < slot.value[1]:
                return slot
        return cls.EVENING

class UserSegment(Enum):
    NEW = "new"
    CASUAL = "casual"
    FREQUENT = "frequent"
    LOYAL = "loyal"

class ColdStartStrategy:
    def __init__(self, user_data: pd.DataFrame, product_data: pd.DataFrame):
        self.user_data = user_data
        self.product_data = product_data
        self.country_holidays = holidays.CountryHoliday('US')
        self._preprocess_data()
        self._initialize_models()
        
    def _preprocess_data(self):
        """Preprocess user and product data"""
        # Ensure required columns exist
        if 'timestamp' not in self.user_data.columns:
            self.user_data['timestamp'] = datetime.now()
            
        # Add time-based features
        self.user_data['hour_of_day'] = pd.to_datetime(self.user_data['timestamp']).dt.hour
        self.user_data['day_of_week'] = pd.to_datetime(self.user_data['timestamp']).dt.dayofweek
        self.user_data['is_weekend'] = self.user_data['day_of_week'].isin([5, 6]).astype(int)
        
        # Add holiday information
        self.user_data['date'] = pd.to_datetime(self.user_data['timestamp']).dt.date
        self.user_data['is_holiday'] = self.user_data['date'].apply(lambda x: x in self.country_holidays)
        
        # Drop temporary columns
        self.user_data = self.user_data.drop(columns=['date'])
        
    def _initialize_models(self):
        """Initialize models for different cold start strategies"""
        # Define feature columns
        numeric_features = ['age', 'hour_of_day', 'day_of_week']
        categorical_features = ['gender', 'region', 'device_type', 'is_weekend', 'is_holiday']
        
        # Create preprocessing pipeline
        numeric_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler())
        ])
        
        categorical_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='constant', fill_value='missing')),
            ('onehot', OneHotEncoder(handle_unknown='ignore'))
        ])
        
        self.preprocessor = ColumnTransformer(
            transformers=[
                ('num', numeric_transformer, numeric_features),
                ('cat', categorical_transformer, categorical_features)
            ])
        
        # Initialize KNN model
        self.user_knn = NearestNeighbors(
            n_neighbors=5,
            metric='cosine',
            algorithm='auto'
        )
        
        # Fit the models
        self._fit_models()
        
        # Initialize time-based popularity
        self.time_based_popularity = self._calculate_time_based_popularity()
        
    def _fit_models(self):
        """Fit the KNN model with preprocessed data"""
        # Select features for KNN
        features = ['age', 'gender', 'region', 'device_type', 'hour_of_day', 
                  'day_of_week', 'is_weekend', 'is_holiday']
        
        # Ensure all required columns exist
        available_features = [f for f in features if f in self.user_data.columns]
        X = self.user_data[available_features]
        
        # Preprocess features
        X_processed = self.preprocessor.fit_transform(X)
        
        # Fit KNN model
        self.user_knn.fit(X_processed)
        
    def _calculate_time_based_popularity(self) -> Dict[str, pd.DataFrame]:
        """Calculate product popularity based on various time dimensions"""
        if 'timestamp' not in self.product_data.columns:
            self.product_data['timestamp'] = datetime.now()
            
        # Add time-based features
        self.product_data['hour'] = pd.to_datetime(self.product_data['timestamp']).dt.hour
        self.product_data['day_of_week'] = pd.to_datetime(self.product_data['timestamp']).dt.dayofweek
        self.product_data['is_weekend'] = self.product_data['day_of_week'].isin([5, 6]).astype(int)
        
        # Calculate popularity by different time dimensions
        time_dimensions = {
            'hourly': pd.Grouper(key='hour'),
            'daily': pd.Grouper(key='day_of_week'),
            'weekly': pd.Grouper(key='is_weekend')
        }
        
        popularity = {}
        for dim_name, grouper in time_dimensions.items():
            popularity[dim_name] = self.product_data.groupby(
                ['category', grouper]
            ).agg({
                'views': 'mean',
                'purchases': 'mean',
                'rating': 'mean'
            }).sort_values(['purchases', 'views'], ascending=False)
            
        return popularity
        
    def get_similar_users(self, user_profile: Dict, n_neighbors: int = 5) -> List[Tuple[str, float]]:
        """Find similar users based on profile attributes.
        
        Args:
            user_profile: Dictionary containing user attributes
            n_neighbors: Number of similar users to return
            
        Returns:
            List of tuples containing (user_id, similarity_score)
        """
        try:
            # Prepare user profile for prediction
            profile_df = pd.DataFrame([user_profile])
            
            # Add missing columns with default values
            for col in self.preprocessor.transformers_:
                if col[0] == 'cat':
                    for cat_col in col[2]:
                        if cat_col not in profile_df.columns:
                            profile_df[cat_col] = 'missing'
            
            # Preprocess the input
            X = self.preprocessor.transform(profile_df)
            
            # Find similar users
            distances, indices = self.user_knn.kneighbors(X, n_neighbors=n_neighbors)
            
            # Get similar users with their similarity scores
            similar_users = []
            for i, idx in enumerate(indices[0]):
                user_id = self.user_data.iloc[idx]['user_id']
                similarity = 1 - distances[0][i]  # Convert distance to similarity
                similar_users.append((user_id, similarity))
                
            return similar_users
            
        except Exception as e:
            print(f"Error finding similar users: {str(e)}")
            return []
    
    def get_time_based_recommendations(self, time_slot: Optional[TimeSlot] = None) -> List[Dict]:
        """Get recommendations based on current time of day.
        
        Args:
            time_slot: Optional TimeSlot enum value. If None, uses current time.
            
        Returns:
            List of recommended product dictionaries
        """
        if time_slot is None:
            time_slot = TimeSlot.get_current_slot()
            
        # Get current hour for the time slot
        current_hour = datetime.now().hour
        
        # Get day of week (0=Monday, 6=Sunday)
        day_of_week = datetime.now().weekday()
        is_weekend = day_of_week >= 5
        
        try:
            # Get relevant products based on time slot
            if time_slot == TimeSlot.MORNING:
                products = self.product_data[
                    (self.product_data['hour'] >= 6) & 
                    (self.product_data['hour'] < 12)
                ]
            elif time_slot == TimeSlot.AFTERNOON:
                products = self.product_data[
                    (self.product_data['hour'] >= 12) & 
                    (self.product_data['hour'] < 18)
                ]
            elif time_slot == TimeSlot.EVENING:
                products = self.product_data[
                    (self.product_data['hour'] >= 18) & 
                    (self.product_data['hour'] < 24)
                ]
            else:  # EARLY_MORNING
                products = self.product_data[
                    (self.product_data['hour'] >= 0) & 
                    (self.product_data['hour'] < 6)
                ]
            
            # Add weekend boost if applicable
            if is_weekend:
                products = products[products['is_weekend'] == 1]
            
            # Sort by popularity metrics
            recommended = products.sort_values(
                ['purchases', 'views', 'rating'], 
                ascending=[False, False, False]
            ).head(5)
            
            return recommended.to_dict('records')
            
        except Exception as e:
            print(f"Error in time-based recommendations: {str(e)}")
            return []
    
    def get_device_based_recommendations(self, device_type: str) -> List[Dict]:
        """Get recommendations optimized for specific device type.
        
        Args:
            device_type: Type of device ('mobile', 'desktop', 'tablet')
            
        Returns:
            List of recommended product dictionaries
        """
        try:
            # Get device-optimized products
            if 'device_type' in self.product_data.columns:
                device_products = self.product_data[
                    self.product_data['device_type'].str.lower() == device_type.lower()
                ]
            else:
                device_products = self.product_data
            
            # Sort by device-specific metrics if available
            sort_columns = ['conversion_rate', 'purchases', 'views']
            sort_columns = [col for col in sort_columns if col in device_products.columns]
            
            if sort_columns:
                device_products = device_products.sort_values(
                    sort_columns, 
                    ascending=[False] * len(sort_columns)
                )
            
            return device_products.head(5).to_dict('records')
            
        except Exception as e:
            print(f"Error in device-based recommendations: {str(e)}")
            return []
    
    def get_region_based_recommendations(self, region: str) -> List[Dict]:
        """Get popular products based on user's region.
        
        Args:
            region: User's region
            
        Returns:
            List of recommended product dictionaries
        """
        try:
            if 'region' in self.product_data.columns:
                region_products = self.product_data[
                    self.product_data['region'].str.lower() == region.lower()
                ]
                
                # Sort by regional popularity metrics
                sort_columns = ['purchases', 'views', 'rating']
                sort_columns = [col for col in sort_columns if col in region_products.columns]
                
                if sort_columns:
                    region_products = region_products.sort_values(
                        sort_columns,
                        ascending=[False] * len(sort_columns)
                    )
                
                return region_products.head(5).to_dict('records')
            return []
            
        except Exception as e:
            print(f"Error in region-based recommendations: {str(e)}")
            return []
    
    def get_fallback_recommendations(self, user_profile: Dict) -> Dict:
        """Generate fallback recommendations using multiple strategies.
        
        Args:
            user_profile: Dictionary containing user attributes
            
        Returns:
            Dictionary with different recommendation modules
        """
        try:
            # Get device type with fallback
            device_type = user_profile.get('device_type', 'desktop')
            
            # Get region with fallback
            region = user_profile.get('region', 'global')
            
            # Get time-based recommendations
            time_recs = self.get_time_based_recommendations()
            
            # Get device-based recommendations
            device_recs = self.get_device_based_recommendations(device_type)
            
            # Get region-based recommendations
            region_recs = self.get_region_based_recommendations(region)
            
            # Get trending products (top overall)
            trending = self.product_data.sort_values(
                ['purchases', 'views'], 
                ascending=[False, False]
            ).head(5).to_dict('records')
            
            # Get seasonal/holiday specific content if applicable
            is_holiday = date.today() in self.country_holidays
            seasonal_content = []
            if is_holiday:
                holiday_name = self.country_holidays.get(date.today())
                seasonal_content = self._get_holiday_specific_content(holiday_name)
            
            return {
                'hero_banners': time_recs[:3],
                'product_carousels': {
                    'for_you': device_recs,
                    'trending': trending,
                    'local_favorites': region_recs
                },
                'featured_categories': self._get_featured_categories(),
                'cta_modules': self._get_cta_modules(),
                'seasonal_content': seasonal_content,
                'personalized': False
            }
            
        except Exception as e:
            print(f"Error generating fallback recommendations: {str(e)}")
            return self._get_emergency_fallback()
    
    def _get_holiday_specific_content(self, holiday_name: str) -> List[Dict]:
        """Get holiday-specific content and recommendations."""
        try:
            # This is a simplified example - in practice, you'd have a mapping
            # of holidays to specific content or product categories
            holiday_keywords = {
                'Christmas': ['gifts', 'decorations', 'christmas'],
                'Thanksgiving': ['turkey', 'thanksgiving', 'fall'],
                'Halloween': ['costumes', 'candy', 'halloween'],
                'Valentine\'s Day': ['romance', 'chocolate', 'valentine'],
                'Easter': ['easter', 'candy', 'spring']
            }
            
            # Find matching keywords
            keywords = []
            for holiday, terms in holiday_keywords.items():
                if holiday.lower() in holiday_name.lower():
                    keywords.extend(terms)
                    break
            
            if not keywords:
                return []
            
            # Find products matching holiday keywords
            mask = self.product_data['name'].str.lower().str.contains('|'.join(keywords), na=False)
            holiday_products = self.product_data[mask].sort_values(
                'purchases', 
                ascending=False
            ).head(5)
            
            return holiday_products.to_dict('records')
            
        except Exception as e:
            print(f"Error getting holiday content: {str(e)}")
            return []
    
    def _get_featured_categories(self) -> List[Dict]:
        """Get featured categories based on current trends."""
        try:
            # Get top categories by purchases
            if 'category' in self.product_data.columns:
                top_categories = self.product_data.groupby('category').agg({
                    'purchases': 'sum',
                    'views': 'sum',
                    'rating': 'mean'
                }).sort_values(['purchases', 'views'], ascending=False).head(3)
                
                return [{
                    'name': idx,
                    'purchases': int(row['purchases']),
                    'views': int(row['views']),
                    'rating': float(row['rating'])
                } for idx, row in top_categories.iterrows()]
            return []
            
        except Exception as e:
            print(f"Error getting featured categories: {str(e)}")
            return []
    
    def _get_cta_modules(self) -> List[Dict]:
        """Generate appropriate CTA modules based on context."""
        current_hour = datetime.now().hour
        day_of_week = datetime.now().weekday()
        is_weekend = day_of_week >= 5
        
        # Base CTAs
        if 6 <= current_hour < 12:  # Morning
            ctas = [
                {'type': 'explore', 'text': 'Start Your Day Right', 'priority': 1, 'action': 'browse_new'},
                {'type': 'browse', 'text': 'Morning Deals', 'priority': 2, 'action': 'view_deals'}
            ]
        elif 12 <= current_hour < 18:  # Afternoon
            ctas = [
                {'type': 'browse', 'text': 'Best Sellers', 'priority': 1, 'action': 'view_bestsellers'},
                {'type': 'explore', 'text': 'Trending Now', 'priority': 2, 'action': 'view_trending'}
            ]
        else:  # Evening/Night
            ctas = [
                {'type': 'buy', 'text': 'Limited Time Offers', 'priority': 1, 'action': 'view_offers'},
                {'type': 'explore', 'text': 'Staff Picks', 'priority': 2, 'action': 'view_staff_picks'}
            ]
        
        # Add weekend-specific CTAs
        if is_weekend:
            ctas.append({
                'type': 'special',
                'text': 'Weekend Specials',
                'priority': 3,
                'action': 'view_weekend_specials'
            })
        
        # Add holiday CTAs if applicable
        if date.today() in self.country_holidays:
            holiday_name = self.country_holidays.get(date.today())
            ctas.append({
                'type': 'holiday',
                'text': f'{holiday_name} Specials',
                'priority': 0,  # Highest priority
                'action': 'view_holiday_specials'
            })
        
        return sorted(ctas, key=lambda x: x['priority'])
    
    def _get_emergency_fallback(self) -> Dict:
        """Return a basic fallback when all else fails."""
        return {
            'hero_banners': [],
            'product_carousels': {
                'trending': self.product_data.sort_values('purchases', ascending=False)
                                   .head(5)
                                   .to_dict('records')
            },
            'featured_categories': [],
            'cta_modules': [
                {'type': 'browse', 'text': 'Shop Now', 'priority': 1, 'action': 'browse_all'}
            ],
            'seasonal_content': [],
            'personalized': False,
            'is_fallback': True
        }
