import pandas as pd
import numpy as np
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union, Tuple, Any

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('data_processing.log')
    ]
)
logger = logging.getLogger(__name__)

try:
    from sklearn.preprocessing import StandardScaler
    from sklearn.cluster import KMeans
    from sklearn.neighbors import NearestNeighbors
    from sklearn.exceptions import NotFittedError
    SKLEARN_AVAILABLE = True
except ImportError:
    logger.warning("scikit-learn not available. Some features will be disabled.")
    SKLEARN_AVAILABLE = False

class DataProcessor:
    """
    A class for processing e-commerce user activity and transaction data
    to create user segments and provide personalized recommendations.
    """
    
    def __init__(self, data_dir: Optional[Union[str, Path]] = None):
        """
        Initialize the DataProcessor.
        
        Args:
            data_dir: Directory containing input data files. If None, uses 'data' subdirectory.
        """
        self.base_dir = Path(__file__).parent
        self.data_dir = Path(data_dir) if data_dir else self.base_dir / 'data'
        
        # Ensure data directory exists
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize data attributes
        self.user_sessions: Optional[pd.DataFrame] = None
        self.user_segments: Optional[pd.DataFrame] = None
        self.transaction_df: Optional[pd.DataFrame] = None
        self.knn_model: Optional[Any] = None
        self.cluster_stats: Optional[pd.DataFrame] = None
        
        logger.info(f"DataProcessor initialized with data directory: {self.data_dir}")
        self.transaction_df = None
        self.user_sessions = None
        self.user_segments = None
        
    def load_data(self) -> 'DataProcessor':
        """
        Load and preprocess the raw datasets.
        
        Returns:
            DataProcessor: The current instance for method chaining
            
        Raises:
            FileNotFoundError: If required data files are not found
            pd.errors.EmptyDataError: If a data file is empty
        """
        logger.info("Starting data loading process...")
        
        # Define expected data files
        activity_file = self.data_dir / 'dataset1_final.csv'
        transaction_file = self.data_dir / 'dataset2_final.csv'
        
        # Load activity data
        if not activity_file.exists():
            raise FileNotFoundError(f"Activity data file not found: {activity_file}")
            
        logger.info(f"Loading activity data from {activity_file}")
        self.activity_df = pd.read_csv(
            activity_file,
            low_memory=False,
            dtype={
                'user_pseudo_id': str,
                'event_name': str,
                'page_title': str,
                'page_location': str,
                'device_category': str,
                'country': str,
                'region': str,
                'city': str,
                'source': str,
                'medium': str,
                'campaign': str,
            },
            parse_dates=['eventTimestamp'],
            infer_datetime_format=True
        )
        
        if self.activity_df.empty:
            raise pd.errors.EmptyDataError("Activity data file is empty")
            
        logger.info(f"Successfully loaded {len(self.activity_df):,} activity records")
        
        # Load transaction data if available
        if transaction_file.exists():
            logger.info(f"Loading transaction data from {transaction_file}")
            self.transaction_df = pd.read_csv(
                transaction_file,
                low_memory=False,
                dtype={
                    'Transaction_ID': str,
                    'ItemName': str,
                    'ItemCategory': str,
                    'Item_brand': str,
                    'Item_variant': str,
                    'Item_revenue': float,
                    'Item_quantity': int,
                    'Item_purchase_quantity': int
                },
                parse_dates=['Date'],
                infer_datetime_format=True
            )
            
            if not self.transaction_df.empty:
                logger.info(f"Successfully loaded {len(self.transaction_df):,} transaction records")
            else:
                logger.warning("Transaction data file is empty")
        else:
            logger.warning(f"No transaction data found at {transaction_file}")
            
        # Extract date and time features
        self.activity_df['date'] = self.activity_df['eventTimestamp'].dt.date
        self.activity_df['hour'] = self.activity_df['eventTimestamp'].dt.hour
        
        # Categorize time of day
        def get_time_of_day(hour):
            if 5 <= hour < 12:
                return 'morning'
            elif 12 <= hour < 17:
                return 'afternoon'
            elif 17 <= hour < 22:
                return 'evening'
            else:
                return 'night'
                
        self.activity_df['time_of_day'] = self.activity_df['hour'].apply(get_time_of_day)
        
        # Assign user_profiles
        if hasattr(self, 'activity_df') and not self.activity_df.empty:
            user_profiles = self.activity_df[self.activity_df['transaction_id'].notna() & (self.activity_df['transaction_id'] != '(not set)')]
            user_profiles = user_profiles.groupby('user_pseudo_id').agg({
                'category': lambda x: list(x.dropna().unique()),
                'transaction_id': lambda x: list(x.dropna().unique()),
            }).reset_index()
            user_profiles = user_profiles.rename(columns={'user_pseudo_id': 'user_id'})
            self.user_profiles = user_profiles.to_dict(orient='records')
        else:
            self.user_profiles = []
        # Assign product_features
        if hasattr(self, 'activity_df') and not self.activity_df.empty:
            products_df = self.activity_df[self.activity_df['transaction_id'].notna() & (self.activity_df['transaction_id'] != '(not set)')].drop_duplicates(subset=['transaction_id'])
            self.product_features = [
                {
                    'id': row['transaction_id'],
                    'category': row.get('category', ''),
                }
                for _, row in products_df.iterrows()
            ]
        else:
            self.product_features = []
        return self
    
    def create_user_sessions(self, session_timeout=30):
        """Create user sessions by grouping events"""
        print("\nCreating user sessions...")
        
        # Sort by user and timestamp
        self.activity_df = self.activity_df.sort_values(['user_pseudo_id', 'eventTimestamp'])
        
        # Calculate time difference between consecutive events
        self.activity_df['time_diff'] = self.activity_df.groupby('user_pseudo_id')['eventTimestamp'].diff().dt.total_seconds().fillna(0)
        
        # Identify new sessions (when time difference > session_timeout minutes)
        self.activity_df['new_session'] = (self.activity_df['time_diff'] > session_timeout * 60).astype(int)
        
        # Create session IDs
        self.activity_df['session_id'] = self.activity_df.groupby('user_pseudo_id')['new_session'].cumsum()
        
        # Create session-level data
        session_data = self.activity_df.groupby(['user_pseudo_id', 'session_id']).agg({
            'eventTimestamp': ['min', 'max', 'count'],
            'event_name': lambda x: x.tolist(),
            'hour': 'first',
            'region': 'first',
            'country': 'first',
            'source': 'first',
            'page_type': 'first',
            'category': 'first'
        }).reset_index()
        
        # Flatten column names
        session_data.columns = ['_'.join(col).strip('_') for col in session_data.columns.values]
        session_data = session_data.rename(columns={
            'eventTimestamp_min': 'session_start',
            'eventTimestamp_max': 'session_end',
            'eventTimestamp_count': 'events_count',
            'event_name_<lambda>': 'events_sequence',
            'hour_first': 'hour',
            'region_first': 'region',
            'country_first': 'country',
            'source_first': 'source',
            'page_type_first': 'page_type',
            'category_first': 'category'
        })
        
        # Calculate session duration in minutes
        session_data['session_duration'] = (session_data['session_end'] - session_data['session_start']).dt.total_seconds() / 60
        
        # Categorize sessions based on available event names
        def categorize_session(events):
            events = [str(e).lower() for e in events if pd.notna(e)]
            if any('purchase' in e for e in events):
                return 'purchase'
            elif any('add_to_cart' in e for e in events) and any('remove_from_cart' in e for e in events):
                return 'cart_abandoned'
            elif any('add_to_cart' in e for e in events):
                return 'cart_added'
            elif any('view' in e for e in events):
                return 'browsing'
            else:
                return 'other'
        
        session_data['session_type'] = session_data['events_sequence'].apply(categorize_session)
        
        self.user_sessions = session_data
        return self
    
    def create_user_segments(self):
        """Create user segments based on behavior and demographics"""
        print("\nCreating user segments...")
        
        # Create user segments from activity data first
        user_behavior = self.user_sessions.groupby('user_pseudo_id').agg({
            'session_id': 'count',
            'session_duration': 'mean',
            'session_type': lambda x: x.value_counts().index[0] if not x.empty else 'unknown',
            'region': 'first',
            'country': 'first',
            'source': lambda x: x.value_counts().index[0] if not x.empty else 'direct',
            'category': lambda x: x.value_counts().index[0] if not x.empty else 'unknown',
            'page_type': lambda x: x.value_counts().index[0] if not x.empty else 'unknown'
        }).reset_index()
        
        user_behavior = user_behavior.rename(columns={
            'session_id': 'total_sessions',
            'session_duration': 'avg_session_duration',
            'session_type_<lambda>': 'common_session_type',
            'region_first': 'region',
            'country_first': 'country',
            'source_<lambda>': 'primary_source',
            'category_<lambda>': 'primary_category',
            'page_type_<lambda>': 'primary_page_type'
        })
        
        # Merge with transaction data if available
        if self.transaction_df is not None and not self.transaction_df.empty:
            # Aggregate transaction data per user
            # Process transaction data
            # Since we don't have a direct user ID in the transaction data,
            # we'll create user segments based on transaction patterns
            user_transactions = self.transaction_df.groupby('Transaction_ID').agg({
                'Item_purchase_quantity': 'sum',
                'Item_revenue': 'sum',
                'ItemCategory': lambda x: x.mode()[0] if not x.mode().empty else 'unknown',
                'ItemName': 'count'  # Count of items per transaction
            }).reset_index()
            
            # Rename columns for clarity
            user_transactions = user_transactions.rename(columns={
                'Item_purchase_quantity': 'total_items_purchased',
                'Item_revenue': 'total_spent',
                'ItemCategory_<lambda>': 'fav_category',
                'ItemName': 'unique_items_count'
            })
            
            # Add transaction-level metrics to user behavior
            # Note: In a real scenario, we would link transactions to users
            # For now, we'll add aggregate metrics to all users
            if not user_behavior.empty:
                user_behavior['avg_transaction_value'] = user_transactions['total_spent'].mean()
                user_behavior['avg_items_per_transaction'] = user_transactions['total_items_purchased'].mean()
                user_behavior['total_transactions'] = len(user_transactions)
                user_behavior['total_revenue'] = user_transactions['total_spent'].sum()
                
                # Calculate RFM metrics (Recency, Frequency, Monetary)
                # Using session data as a proxy since we don't have transaction dates
                user_behavior['recency'] = (pd.Timestamp.now() - user_behavior['session_start'].max()).days
                user_behavior['frequency'] = user_behavior['total_sessions']
                user_behavior['monetary'] = user_behavior['total_revenue'] / user_behavior['total_sessions'].replace(0, 1)  # Avoid division by zero
            
            # Create RFM segments
            # Calculate RFM scores (1-5, with 5 being best)
            if 'recency' in user_behavior.columns and 'frequency' in user_behavior.columns and 'monetary' in user_behavior.columns:
                # Calculate quintiles for each RFM metric
                rfm = user_behavior[['recency', 'frequency', 'monetary']]
                
                # Smaller recency is better (more recent)
                rfm['r_quartile'] = pd.qcut(rfm['recency'], q=5, labels=False, duplicates='drop') + 1
                rfm['r_quartile'] = 6 - rfm['r_quartile']  # Invert so higher is better
                
                # Higher frequency is better
                rfm['f_quartile'] = pd.qcut(rfm['frequency'], q=5, labels=[1, 2, 3, 4, 5], duplicates='drop')
                
                # Higher monetary is better
                rfm['m_quartile'] = pd.qcut(rfm['monetary'], q=5, labels=[1, 2, 3, 4, 5], duplicates='drop')
                
                # Calculate RFM Score (average of quartiles)
                rfm['RFM_Score'] = rfm[['r_quartile', 'f_quartile', 'm_quartile']].mean(axis=1).round(2)
                
                # Assign segments based on RFM score
                def get_segment(score):
                    if score >= 4.5:
                        return 'Champions'
                    elif score >= 4.0:
                        return 'Loyal Customers'
                    elif score >= 3.0:
                        return 'Potential Loyalists'
                    elif score >= 2.0:
                        return 'At Risk Customers'
                    else:
                        return 'Need Attention'
                
                user_behavior['rfm_segment'] = rfm['RFM_Score'].apply(get_segment)
                user_behavior = pd.concat([user_behavior, rfm[['RFM_Score']]], axis=1)
            
            # Add behavioral segments based on session data
            def get_behavioral_segment(row):
                if row['total_sessions'] == 0:
                    return 'New Visitor'
                elif row['common_session_type'] == 'purchase':
                    return 'Buyer'
                elif row['common_session_type'] == 'cart_added':
                    return 'Consideration'
                elif row['common_session_type'] == 'browsing':
                    return 'Explorer'
                else:
                    return 'Other'
            
            user_behavior['behavioral_segment'] = user_behavior.apply(get_behavioral_segment, axis=1)
            
            # Final user segments
            self.user_segments = user_behavior
            
            # Add engagement level based on session count
            self.user_segments['engagement_level'] = pd.cut(
                self.user_segments['total_sessions'],
                bins=[-1, 0, 3, 10, float('inf')],
                labels=['new', 'light', 'medium', 'heavy']
            )
            
            # Add value segment based on RFM score if available
            if 'RFM_Score' in self.user_segments.columns:
                self.user_segments['value_segment'] = pd.cut(
                    self.user_segments['RFM_Score'],
                    bins=[0, 1.5, 3, 4.5, 5],
                    labels=['low', 'medium', 'high', 'very_high']
                )
            else:
                # Fallback to session-based value if no RFM
                self.user_segments['value_segment'] = pd.cut(
                    self.user_segments['total_sessions'],
                    bins=[-1, 1, 5, 20, float('inf')],
                    labels=['low', 'medium', 'high', 'very_high']
                )
            
        return self
    
    def build_recommendation_model(self):
        """Build recommendation models for cold start"""
        print("\nBuilding recommendation models...")
        
        if self.user_segments is None or self.user_segments.empty:
            print("No user segments available. Run create_user_segments() first.")
            return
            
        # Prepare features for clustering
        # Select features that represent user behavior
        feature_columns = [
            'total_sessions', 
            'avg_session_duration',
            'total_transactions' if 'total_transactions' in self.user_segments.columns else 'total_sessions',
            'avg_transaction_value' if 'avg_transaction_value' in self.user_segments.columns else 0
        ]
        
        # Fill any remaining NA values
        features = self.user_segments[feature_columns].fillna(0)
        
        # Standardize features
        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features)
        
        # Determine optimal number of clusters using elbow method
        # For now, we'll use a fixed number of clusters
        n_clusters = min(5, len(features_scaled) - 1)  # Ensure we don't have more clusters than samples
        
        if n_clusters > 1:
            # K-means clustering
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            self.user_segments['cluster'] = kmeans.fit_predict(features_scaled)
            
            # KNN for finding similar users
            self.knn_model = NearestNeighbors(n_neighbors=min(5, len(features_scaled) - 1), 
                                            metric='euclidean')
            self.knn_model.fit(features_scaled)
            
            # Save the models and scaler
            import joblib
            models_dir = self.base_dir / 'models'
            models_dir.mkdir(exist_ok=True)
            
            joblib.dump(kmeans, models_dir / 'kmeans_model.pkl')
            joblib.dump(scaler, models_dir / 'scaler.pkl')
            joblib.dump(self.knn_model, models_dir / 'knn_model.pkl')
            
            # Calculate cluster statistics
            self.cluster_stats = self.user_segments.groupby('cluster').agg({
                'total_sessions': 'mean',
                'avg_session_duration': 'mean',
                'total_transactions': 'mean' if 'total_transactions' in self.user_segments.columns else None,
                'avg_transaction_value': 'mean' if 'avg_transaction_value' in self.user_segments.columns else None
            }).reset_index()
            
            # Save cluster statistics for cold start
            self.cluster_stats.to_csv(models_dir / 'cluster_stats.csv', index=False)
            
            print(f"Created {n_clusters} user clusters")
        else:
            print("Not enough data points for clustering. Using default recommendations.")
            self.knn_model = None
        
        return self
    
    def get_cold_start_recommendations(self, user_features=None, user_context=None):
        """
        Get recommendations for cold start users
        
        Args:
            user_features: Optional list of user features [sessions, avg_duration, transactions, avg_value]
            user_context: Optional dict with user context (device, location, etc.)
            
        Returns:
            dict: Dictionary with recommendations and segment information
        """
        try:
            import joblib
            import os
            
            models_dir = self.base_dir / 'models'
            
            # Default recommendations if no model is available
            default_recommendations = {
                'top_categories': {'electronics': 1.0, 'clothing': 0.8, 'home': 0.6},
                'recommended_products': [],
                'segment': 'new_visitor',
                'confidence': 0.0,
                'message': 'Default recommendations based on popular items',
                'strategy': 'popularity_based'
            }
            
            # If we have user features and a trained model
            if user_features is not None and hasattr(self, 'knn_model') and self.knn_model is not None:
                try:
                    # Scale the features
                    scaler = joblib.load(models_dir / 'scaler.pkl')
                    user_features_scaled = scaler.transform([user_features])
                    
                    # Find similar users
                    _, indices = self.knn_model.kneighbors(user_features_scaled)
                    similar_users = self.user_segments.iloc[indices[0]]
                    
                    # Get top categories from similar users
                    if 'primary_category' in similar_users.columns:
                        top_categories = similar_users['primary_category'].value_counts().head(3).to_dict()
                    else:
                        top_categories = default_recommendations['top_categories']
                    
                    # Get average metrics
                    avg_metrics = {
                        'sessions': similar_users['total_sessions'].mean(),
                        'avg_duration': similar_users['avg_session_duration'].mean(),
                        'transactions': similar_users.get('total_transactions', 0).mean(),
                        'avg_value': similar_users.get('avg_transaction_value', 0).mean()
                    }
                    
                    # Determine user segment
                    if 'rfm_segment' in similar_users.columns:
                        segment = similar_users['rfm_segment'].mode()[0]
                        confidence = 0.8
                    else:
                        segment = 'similar_visitor'
                        confidence = 0.6
                    
                    return {
                        'top_categories': top_categories,
                        'recommended_products': [],  # Can be populated with actual product recommendations
                        'segment': segment,
                        'confidence': confidence,
                        'similar_users': len(similar_users),
                        'avg_metrics': avg_metrics,
                        'strategy': 'collaborative_filtering'
                    }
                    
                except Exception as e:
                    print(f"Error in collaborative filtering: {str(e)}")
            
            # Fall back to context-based recommendations if available
            if user_context is not None:
                try:
                    # Simple context-based recommendations
                    # This can be enhanced with more sophisticated logic
                    if 'device' in user_context and 'mobile' in user_context['device'].lower():
                        return {
                            'top_categories': {'mobile_accessories': 1.0, 'electronics': 0.9, 'fashion': 0.7},
                            'recommended_products': [],
                            'segment': 'mobile_visitor',
                            'confidence': 0.7,
                            'message': 'Recommendations based on mobile device',
                            'strategy': 'context_aware'
                        }
                    elif 'location' in user_context:
                        # Add location-based recommendations
                        return {
                            'top_categories': {'local_products': 1.0, 'popular': 0.8, 'trending': 0.6},
                            'recommended_products': [],
                            'segment': 'local_visitor',
                            'confidence': 0.6,
                            'message': f'Recommendations based on location: {user_context["location"]}',
                            'strategy': 'location_based'
                        }
                except Exception as e:
                    print(f"Error in context-based recommendations: {str(e)}")
            
            # Fall back to cluster-based recommendations if available
            if hasattr(self, 'cluster_stats') and not self.cluster_stats.empty:
                try:
                    # Find the most common cluster
                    most_common_cluster = self.user_segments['cluster'].mode()[0]
                    cluster_stats = self.cluster_stats[self.cluster_stats['cluster'] == most_common_cluster].iloc[0]
                    
                    return {
                        'top_categories': {'popular': 1.0, 'trending': 0.8, 'recommended': 0.7},
                        'recommended_products': [],
                        'segment': f'cluster_{most_common_cluster}',
                        'confidence': 0.7,
                        'cluster_stats': cluster_stats.to_dict(),
                        'strategy': 'cluster_based'
                    }
                except Exception as e:
                    print(f"Error in cluster-based recommendations: {str(e)}")
            
            # Final fallback to default recommendations
            return default_recommendations
            
        except Exception as e:
            print(f"Error in get_cold_start_recommendations: {str(e)}")
            return default_recommendations
    
    def save_processed_data(self):
        """Save processed data to files"""
        print("\nSaving processed data...")
        
        if self.user_sessions is not None:
            self.user_sessions.to_csv(self.data_dir / 'user_sessions.csv', index=False)
            
        if self.user_segments is not None:
            self.user_segments.to_csv(self.data_dir / 'user_segments.csv', index=False)
            
        print(f"Data saved to {self.data_dir}")
        return self

if __name__ == "__main__":
    # Example usage
    processor = DataProcessor()\
        .load_data()\
        .preprocess_data()\
        .create_user_sessions()\
        .create_user_segments()\
        .build_recommendation_model()\
        .save_processed_data()
    
    # Example cold start recommendation
    if processor.user_segments is not None and not processor.user_segments.empty:
        # Get features for a new user (example values)
        new_user_features = [
            3,  # total_sessions
            5.5,  # avg_session_duration
            0    # purchase_count
        ]
        
        recommendations = processor.get_cold_start_recommendations(new_user_features)
        print("\nCold Start Recommendations:", json.dumps(recommendations, indent=2))
