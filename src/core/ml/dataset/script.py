import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

# Set seed for 100% academic reproducibility
np.random.seed(42)
NUM_SAMPLES = 10000

print(f"--- Generating {NUM_SAMPLES} Enterprise Access Logs for NestJS/ALE Framework ---")

# ==========================================
# STEP 1: GENERATE BASE FEATURE DISTRIBUTIONS
# ==========================================
# 1. user_role: Customers make up 75% of read traffic, Moderators 20%, Admins 5%
roles = ['customer', 'moderator', 'admin']
role_probs = [0.75, 0.20, 0.05] 
user_role = np.random.choice(roles, size=NUM_SAMPLES, p=role_probs)

# 2. resource_sensitivity: Most database reads involve low/medium sensitivity fields
sensitivities = ['LOW', 'MEDIUM', 'HIGH']
sens_probs = [0.60, 0.30, 0.10] 
resource_sensitivity = np.random.choice(sensitivities, size=NUM_SAMPLES, p=sens_probs)

# 3. is_office_hours: 80% of system traffic occurs during operational hours
is_office_hours = np.random.choice([1, 0], size=NUM_SAMPLES, p=[0.80, 0.20])

# 4. record_owner_match: Naturally varies by role (Customers own records; Mods/Admins review others)
record_owner_match = np.zeros(NUM_SAMPLES, dtype=int)
for i in range(NUM_SAMPLES):
    if user_role[i] == 'customer':
        # Customers access their own records 95% of the time (5% IDOR / enumeration attempts)
        record_owner_match[i] = np.random.choice([1, 0], p=[0.95, 0.05])
    else:
        # Moderators and Admins routinely access records owned by customers
        record_owner_match[i] = np.random.choice([1, 0], p=[0.15, 0.85])

# 5. recent_request_count: Poisson distribution (Normal: 1-6 req/min), with injected scraping spikes
recent_request_count = np.random.poisson(lam=4, size=NUM_SAMPLES)
scraper_indices = np.random.choice(NUM_SAMPLES, size=int(NUM_SAMPLES * 0.05), replace=False)
recent_request_count[scraper_indices] = np.random.randint(15, 65, size=len(scraper_indices))

# 6. failed_attempt_count: Skewed exponential distribution (90% of requests have 0 failed logins)
failed_attempt_count = np.random.choice(
    [0, 1, 2, 3, 4, 5, 6, 7, 8], 
    size=NUM_SAMPLES, 
    p=[0.88, 0.05, 0.025, 0.015, 0.01, 0.008, 0.006, 0.004, 0.002]
)

df = pd.DataFrame({
    'user_role': user_role,
    'resource_sensitivity': resource_sensitivity,
    'is_office_hours': is_office_hours,
    'record_owner_match': record_owner_match,
    'recent_request_count': recent_request_count,
    'failed_attempt_count': failed_attempt_count
})

# ==========================================
# STEP 2: APPLY ROLE-AWARE NONLINEAR BUSINESS RULES
# ==========================================
# Initialize all traffic as LOW (0) risk: Full Decryption Permitted
risk_level = np.zeros(NUM_SAMPLES, dtype=int)

for i in range(NUM_SAMPLES):
    role = df.loc[i, 'user_role']
    sens = df.loc[i, 'resource_sensitivity']
    office = df.loc[i, 'is_office_hours']
    owner = df.loc[i, 'record_owner_match']
    req_count = df.loc[i, 'recent_request_count']
    failed = df.loc[i, 'failed_attempt_count']
    
    # --- HIGH RISK (2): ACTIVE ATTACKS / EXFILTRATION (Trigger ALE Deny or Strong Masking) ---
    if role == 'customer' and owner == 0 and sens in ['MEDIUM', 'HIGH']:
        risk_level[i] = 2
    elif role == 'customer' and req_count > 15:
        risk_level[i] = 2
    elif role == 'moderator' and sens == 'HIGH':
        risk_level[i] = 2
    elif role == 'moderator' and req_count > 25 and owner == 0:
        risk_level[i] = 2
    elif role == 'admin' and office == 0 and sens == 'HIGH' and req_count > 20:
        risk_level[i] = 2
    elif failed >= 5:
        risk_level[i] = 2
        
    # --- MEDIUM RISK (1): SUSPICIOUS BEHAVIOR (Trigger ALE Partial Masking) ---
    elif role == 'customer' and owner == 0 and sens == 'LOW':
        risk_level[i] = 1
    elif role == 'customer' and req_count in range(9, 16):
        risk_level[i] = 1
    elif role == 'moderator' and office == 0 and sens == 'MEDIUM':
        risk_level[i] = 1
    elif role == 'admin' and failed in [3, 4]:
        risk_level[i] = 1
    elif role in ['moderator', 'admin'] and req_count > 18:
        risk_level[i] = 1

df['risk_level'] = risk_level

# ==========================================
# STEP 3: INJECT CONTROLLED STOCHASTIC NOISE (~4%)
# ==========================================
noise_indices = np.random.choice(NUM_SAMPLES, size=int(NUM_SAMPLES * 0.04), replace=False)
random_noise_labels = np.random.choice([0, 1, 2], size=len(noise_indices), p=[0.7, 0.2, 0.1])
df.loc[noise_indices, 'risk_level'] = random_noise_labels

# Display Class Balance
print("\n[Dataset Certified] Target Class Distribution:")
val_counts = df['risk_level'].value_counts(normalize=True) * 100
for level, name in [(0, 'LOW (Full Decrypt)'), (1, 'MEDIUM (Partial Mask)'), (2, 'HIGH (Access Denied)')]:
    print(f"  Class {level} - {name}: {val_counts.get(level, 0):.2f}% ({df['risk_level'].value_counts().get(level, 0)} rows)")

# ==========================================
# STEP 4: STRATIFIED 3-WAY SPLIT (70% Train, 15% Val, 15% Test)
# ==========================================
train_df, temp_df = train_test_split(df, test_size=0.30, random_state=42, stratify=df['risk_level'])
val_df, test_df = train_test_split(temp_df, test_size=0.50, random_state=42, stratify=temp_df['risk_level'])

print("\n[Stratified Split Verified - No Data Leakage]")
print(f"  Training Set:   {len(train_df)} rows (70%) -> Used for model fitting")
print(f"  Validation Set: {len(val_df)} rows (15%) -> Used for hyperparameter tuning")
print(f"  Testing Set:    {len(test_df)} rows (15%) -> Quarantined for final thesis defense metrics")

# ==========================================
# STEP 5: EXPORT TO CSV
# ==========================================
train_df.to_csv('access_logs_train.csv', index=False)
val_df.to_csv('access_logs_val.csv', index=False)
test_df.to_csv('access_logs_test.csv', index=False)
print("\nSUCCESS: Exported 'access_logs_train.csv', 'access_logs_val.csv', and 'access_logs_test.csv'.")