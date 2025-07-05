from datetime import datetime, timedelta
from typing import List, Dict, Any
import pandas as pd

class DataProcessor:
    def __init__(self, db_connection=None):
        self.db = db_connection
        self.session_timeout = timedelta(minutes=30)
    
    def process_user_activity(self, user_activities: List[Dict]) -> pd.DataFrame:
        """Process raw user activities into structured sessions."""
        if not user_activities:
            return pd.DataFrame()
            
        df = pd.DataFrame(user_activities)
        
        # Convert timestamp to datetime
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values(['user_id', 'timestamp'])
        
        # Calculate time differences between consecutive actions
        df['time_diff'] = df.groupby('user_id')['timestamp'].diff()
        
        # Identify new sessions (when time difference > session_timeout or new user)
        df['new_session'] = (df['time_diff'].isna()) | (df['time_diff'] > self.session_timeout)
        
        # Create session IDs
        df['session_id'] = df['new_session'].cumsum()
        
        return df
    
    def extract_session_features(self, session_data: pd.DataFrame) -> List[Dict]:
        """Extract meaningful features from user sessions."""
        if session_data.empty:
            return []
            
        features = []
        
        for session_id, session in session_data.groupby('session_id'):
            if session.empty:
                continue
                
            session_features = {
                'session_id': session_id,
                'user_id': session['user_id'].iloc[0],
                'start_time': session['timestamp'].min(),
                'end_time': session['timestamp'].max(),
                'duration_seconds': (session['timestamp'].max() - session['timestamp'].min()).total_seconds(),
                'num_actions': len(session),
                'page_views': (session['action_type'] == 'page_view').sum(),
                'product_views': (session['action_type'] == 'product_view').sum(),
                'add_to_cart': (session['action_type'] == 'add_to_cart').sum(),
                'purchase': (session['action_type'] == 'purchase').sum(),
                'devices_used': session['device_type'].nunique(),
                'unique_products_viewed': session[session['product_id'].notna()]['product_id'].nunique(),
                'categories_viewed': session[session['category'].notna()]['category'].nunique()
            }
            
            # Add product and category interactions
            if 'product_id' in session.columns:
                session_features['products_viewed'] = session[session['product_id'].notna()]['product_id'].tolist()
            if 'category' in session.columns:
                session_features['categories'] = session[session['category'].notna()]['category'].tolist()
                
            features.append(session_features)
            
        return pd.DataFrame(features)
    
    def create_user_profiles(self, sessions_df: pd.DataFrame) -> pd.DataFrame:
        """Create user profiles from session data."""
        if sessions_df.empty:
            return pd.DataFrame()
            
        user_profiles = []
        
        for user_id, user_sessions in sessions_df.groupby('user_id'):
            profile = {
                'user_id': user_id,
                'first_seen': user_sessions['start_time'].min(),
                'last_seen': user_sessions['end_time'].max(),
                'total_sessions': len(user_sessions),
                'total_duration_seconds': user_sessions['duration_seconds'].sum(),
                'avg_session_duration': user_sessions['duration_seconds'].mean(),
                'total_page_views': user_sessions['page_views'].sum(),
                'total_product_views': user_sessions['product_views'].sum(),
                'total_add_to_cart': user_sessions['add_to_cart'].sum(),
                'total_purchases': user_sessions['purchase'].sum(),
                'conversion_rate': user_sessions['purchase'].sum() / len(user_sessions) if len(user_sessions) > 0 else 0,
                'unique_products_viewed': len(set([p for sublist in user_sessions['products_viewed'].dropna() for p in sublist])),
                'unique_categories_viewed': len(set([c for sublist in user_sessions['categories'].dropna() for c in sublist]))
            }
            
            # Add most active device
            if 'device_type' in user_sessions.columns:
                profile['primary_device'] = user_sessions['device_type'].mode()[0] if not user_sessions['device_type'].empty else None
                
            # Add favorite categories
            if 'categories' in user_sessions.columns:
                category_counts = {}
                for categories in user_sessions['categories'].dropna():
                    for cat in categories:
                        category_counts[cat] = category_counts.get(cat, 0) + 1
                if category_counts:
                    profile['top_categories'] = sorted(category_counts.items(), key=lambda x: x[1], reverse=True)[:3]
                    
            user_profiles.append(profile)
            
        return pd.DataFrame(user_profiles)
    
    def process(self, user_activities: List[Dict]) -> Dict[str, pd.DataFrame]:
        """Main processing pipeline."""
        # Process raw activities into sessions
        sessions = self.process_user_activity(user_activities)
        
        # Extract session features
        if not sessions.empty:
            session_features = self.extract_session_features(sessions)
            
            # Create user profiles
            user_profiles = self.create_user_profiles(session_features)
            
            return {
                'sessions': sessions,
                'session_features': session_features,
                'user_profiles': user_profiles
            }
        
        return {'sessions': pd.DataFrame(), 'session_features': pd.DataFrame(), 'user_profiles': pd.DataFrame()}
