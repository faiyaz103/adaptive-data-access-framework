import numpy as np
import pandas as pd
import m2cgen as m2c
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, f1_score
import os
import pandas as pd

print("--- Step 1: Loading Stratified Datasets ---")

# 1. Get the absolute path of the 'model' directory where this script lives
script_dir = os.path.dirname(os.path.abspath(__file__))

# 2. Go UP one level to the repo root, and then DOWN into the 'dataset' folder
repo_root = os.path.dirname(script_dir)
dataset_dir = os.path.join(repo_root, 'dataset')

# 3. Build absolute paths to your target files
train_path = os.path.join(dataset_dir, 'access_logs_train.csv')
val_path = os.path.join(dataset_dir, 'access_logs_val.csv')
test_path = os.path.join(dataset_dir, 'access_logs_test.csv')

try:
    train_df = pd.read_csv(train_path)
    val_df = pd.read_csv(val_path)
    test_df = pd.read_csv(test_path)
    print(f"SUCCESS: Loaded Train ({len(train_df)}), Val ({len(val_df)}), Test ({len(test_df)})")
except FileNotFoundError as e:
    print(f"ERROR: CSV files not found at expected paths!")
    print(f"Looked for:\n  - {train_path}\n  - {val_path}\n  - {test_path}")
    print("Please verify the names of the files inside your 'dataset' folder.")
    exit(1)

# ==========================================
# STEP 2: STATIC NUMERICAL MAPPING (THE SECRET TO ZERO-DEPENDENCY JS)
# ==========================================
def preprocess_to_numeric(df):
    """
    Converts 6 business features into an exact 8-element numerical matrix:
    [role_customer, role_moderator, role_admin, sensitivity_int, office_hours, owner_match, req_count, failed_count]
    """
    X = pd.DataFrame()
    # 1. One-Hot Encode user_role into 3 explicit binary columns
    X['role_customer'] = (df['user_role'] == 'customer').astype(int)
    X['role_moderator'] = (df['user_role'] == 'moderator').astype(int)
    X['role_admin'] = (df['user_role'] == 'admin').astype(int)
    
    # 2. Ordinal Encode resource_sensitivity (LOW=0, MEDIUM=1, HIGH=2)
    sens_map = {'LOW': 0, 'MEDIUM': 1, 'HIGH': 2}
    X['resource_sensitivity'] = df['resource_sensitivity'].map(sens_map).astype(int)
    
    # 3. Pass through integers & booleans
    X['is_office_hours'] = df['is_office_hours'].astype(int)
    X['record_owner_match'] = df['record_owner_match'].astype(int)
    X['recent_request_count'] = df['recent_request_count'].astype(int)
    X['failed_attempt_count'] = df['failed_attempt_count'].astype(int)
    
    return X

X_train = preprocess_to_numeric(train_df)
y_train = train_df['risk_level']

X_val = preprocess_to_numeric(val_df)
y_val = val_df['risk_level']

X_test = preprocess_to_numeric(test_df)
y_test = test_df['risk_level']

# ==========================================
# STEP 3: MODEL TRAINING & HYPERPARAMETER TUNING
# ==========================================
print("\n--- Step 2: Training & Tuning Random Forest ---")
# We use max_depth=12 to ensure high accuracy without growing overly massive JavaScript files
rf_model = RandomForestClassifier(
    n_estimators=75,
    max_depth=12,
    random_state=42,
    class_weight='balanced',
    n_jobs=-1
)

rf_model.fit(X_train, y_train)

# Validation evaluation
val_preds = rf_model.predict(X_val)
val_f1 = f1_score(y_val, val_preds, average='weighted')
print(f">> Validation Weighted F1-Score: {val_f1:.4f}")

# ==========================================
# STEP 4: FINAL THESIS DEFENSE EVALUATION (TEST SET)
# ==========================================
print("\n" + "="*60)
print("--- Step 3: FINAL THESIS DEFENSE METRICS (Quarantined Test Set) ---")
print("="*60)

test_preds = rf_model.predict(X_test)
target_names = ['LOW (0 - Full Decrypt)', 'MEDIUM (1 - Partial Mask)', 'HIGH (2 - Access Denied)']

print("\n1. Per-Class Classification Report:")
print(classification_report(y_test, test_preds, target_names=target_names, digits=4))

print("2. Confusion Matrix:")
cm = confusion_matrix(y_test, test_preds)
print(pd.DataFrame(cm, index=[f"Actual {i}" for i in [0,1,2]], columns=[f"Pred {i}" for i in [0,1,2]]))

# Feature Importances for Chapter 4
importances = pd.DataFrame({
    'Feature': X_train.columns,
    'Importance Weight': rf_model.feature_importances_
}).sort_values(by='Importance Weight', ascending=False)

print("\n3. Feature Importance Rankings:")
print(importances.to_string(index=False))

# ==========================================
# STEP 5: TRANSPILATION TO PURE JAVASCRIPT
# ==========================================
print("\n--- Step 4: Transpiling Random Forest to Pure JavaScript ---")
js_code = m2c.export_to_javascript(rf_model)

# Automatically append CommonJS module export for Node.js/NestJS compatibility
js_code += "\n// Auto-generated export for NestJS Modular Monolith\n"
js_code += "if (typeof module !== 'undefined' && module.exports) {\n"
js_code += "    module.exports = { score };\n"
js_code += "}\n"

# Save to file
output_filename = "randomForestModel.js"
with open(output_filename, "w") as f:
    f.write(js_code)

print(f"SUCCESS: Transpiled model saved as '{output_filename}'!")
print(">> This file is 100% ready to be dropped into your NestJS 'src/modules/security/ml-engine/' folder.")