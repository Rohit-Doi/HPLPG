import pandas as pd
import requests

# Load datasets (for user IDs, etc.)
activity_df = pd.read_csv(r'E:/HPLPGA/ecomm_personalization/Data/dataset1_final.csv', low_memory=False)
transaction_df = pd.read_csv(r'E:/HPLPGA/ecomm_personalization/Data/dataset2_final.csv', low_memory=False)
print('Activity data:', activity_df.shape)
print('Transaction data:', transaction_df.shape)

# Load product data for category mapping
product_df = pd.read_csv(r'E:/HPLPGA/ecomm_personalization/data/dataset2_final.csv', low_memory=False, usecols=['Transaction_ID','ItemCategory','ItemID'])

# Example known user
# Find a user with at least one valid transaction_id
valid_users = activity_df[activity_df['transaction_id'].notna() & (activity_df['transaction_id'] != '(not set)')]['user_pseudo_id'].unique()
if len(valid_users) > 0:
    known_user_id = valid_users[0]
    print(f"Evaluating login user: {known_user_id}")
    user_transactions = activity_df[activity_df['user_pseudo_id'] == known_user_id]['transaction_id'].dropna().unique()
    ground_truth_login = set([tid for tid in user_transactions if tid != '(not set)'])
else:
    known_user_id = None
    ground_truth_login = set()
    print("No users with valid transaction IDs found. Skipping login user evaluation.")

cold_start_user_id = 'cold_start_001'

def get_real_recommendations(user_id):
    url = "http://localhost:8000/api/v1/personalize"
    payload = {
        "userId": user_id,
        "contentType": "homepage",
        "context": {}
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()
    # Adjust the key if your API response structure is different
    return response.json()

rec_login = get_real_recommendations(known_user_id)
rec_cold = get_real_recommendations(cold_start_user_id)

# Always extract product IDs from the API response
rec_login_list = [item['id'] for item in rec_login['content']['recommendedProducts']]
rec_cold_list = [item['id'] for item in rec_cold['content']['recommendedProducts']]

diversity_login = rec_login.get('diversity_score')
diversity_cold = rec_cold.get('diversity_score')

print('\nLogin user recommendations:', rec_login_list)
if diversity_login is not None:
    print('Login user diversity score:', diversity_login)
print('Cold start user recommendations:', rec_cold_list)
if diversity_cold is not None:
    print('Cold start user diversity score:', diversity_cold)

# Use real ground truth matching the mock product IDs
# For demonstration, assume the user actually bought p1 and p2

# Extract ground truth transaction IDs for the known user
# For cold start, use a different user or a random sample
cold_user_transactions = activity_df[activity_df['user_pseudo_id'] != known_user_id]['transaction_id'].dropna().unique()
ground_truth_cold = set([tid for tid in cold_user_transactions if tid != '(not set)'][:5])

def precision_at_k(recommended, ground_truth, k=5):
    recommended_k = recommended[:k]
    return len(set(recommended_k) & ground_truth) / k

def recall_at_k(recommended, ground_truth, k=5):
    recommended_k = recommended[:k]
    return len(set(recommended_k) & ground_truth) / len(ground_truth)

# Use k=1 for precision/recall
k = 1

if len(ground_truth_login) == 0:
    print("No ground truth transactions for login user. Skipping evaluation.")
else:
    prec_login = precision_at_k(rec_login_list, ground_truth_login, k=k)
    recall_login = recall_at_k(rec_login_list, ground_truth_login, k=k)
    print(f'\nLogin User: Precision@5={prec_login:.2f}, Recall@5={recall_login:.2f}')

if len(ground_truth_cold) == 0:
    print("No ground truth transactions for cold start user. Skipping evaluation.")
else:
    prec_cold = precision_at_k(rec_cold_list, ground_truth_cold, k=k)
    recall_cold = recall_at_k(rec_cold_list, ground_truth_cold, k=k)
    print(f'Cold Start User: Precision@{k}={prec_cold:.2f}, Recall@{k}={recall_cold:.2f}')
    # Category-level evaluation (using true product categories)
    if isinstance(rec_cold, dict) and 'recommended_categories' in rec_cold:
        rec_cold_categories = set(rec_cold['recommended_categories'])
        # Map ground truth transaction_ids to product categories
        cold_txn_ids = list(ground_truth_cold)
        # Join with product_df to get categories
        cold_txn_cats = product_df[product_df['Transaction_ID'].isin(cold_txn_ids)]['ItemCategory'].dropna().unique()
        cold_user_categories = set(cold_txn_cats)
        if len(cold_user_categories) > 0:
            cat_prec = len(rec_cold_categories & cold_user_categories) / len(rec_cold_categories)
            cat_recall = len(rec_cold_categories & cold_user_categories) / len(cold_user_categories)
            print(f'Cold Start User (Category): Precision={cat_prec:.2f}, Recall={cat_recall:.2f}')

# Evaluate multiple login users
num_users = 10
print("\nEvaluating multiple login users:")
for i, user_id in enumerate(valid_users[:num_users]):
    user_transactions = activity_df[activity_df['user_pseudo_id'] == user_id]['transaction_id'].dropna().unique()
    ground_truth = set([tid for tid in user_transactions if tid != '(not set)'])
    if len(ground_truth) == 0:
        print(f"User {user_id}: No ground truth transactions. Skipping.")
        continue
    recs = get_real_recommendations(user_id)
    rec_list = [item['id'] for item in recs['content']['recommendedProducts']]
    print(f"\nUser {user_id}")
    print(f"  Ground truth: {list(ground_truth)[:10]}")
    print(f"  Recommendations: {rec_list}")
    prec = precision_at_k(rec_list, ground_truth, k=k)
    recall = recall_at_k(rec_list, ground_truth, k=k)
    print(f"  Precision@5={prec:.2f}, Recall@5={recall:.2f}")

print("\n---\nYou can replace the mock recommendation and ground truth logic with your actual model/API calls and purchase data for a real evaluation.")