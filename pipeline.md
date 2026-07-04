# Comprehensive Progress Log & Technical Architecture Documentation
## Adaptive Data Access Framework with ML-Driven Late-Binding Application-Level Encryption (ALE)
**Target Architecture:** NestJS Modular Monolith | PostgreSQL (TypeORM) | AES-256-GCM ALE | scikit-learn / m2cgen  
**Document Purpose:** Complete system state, historical progression, architectural decisions, and integration roadmap designed for high-context onboarding of human developers and AI coding assistants.

---

## 1. Executive Summary & Thesis Statement
This research and engineering project addresses a critical flaw in modern application security: **Data-in-Use vulnerability caused by premature database decryption**. 

In traditional enterprise applications utilizing Object-Relational Mappers (ORMs) such as TypeORM, encrypted database columns (e.g., Bank Account Numbers, SSNs, IBANs) are automatically and blindly decrypted into server RAM during the persistence retrieval phase (`from()` transformer method). This occurs *before* business authorization, anomaly detection, or behavioral risk scoring can take place. If an attacker executes an Insecure Direct Object Reference (IDOR) attack, credential stuffing, or high-velocity data scraping, the sensitive plaintext is already exposed in the server's heap memory before an exception can be thrown.

### The Solution Architecture
We have engineered a **Zero-Trust, Late-Binding Cryptographic Access Framework** integrated into a NestJS modular monolith:
1. **Late-Binding Cryptography:** TypeORM is re-engineered to preserve ciphertext upon retrieval. Decryption is deferred entirely to an application-level AI gatekeeper.
2. **Real-Time Behavioral Risk Scoring:** A 75-tree Random Forest classifier evaluates access context (roles, time, ownership, velocity, failed logins) in **~0.1 milliseconds**.
3. **Zero-Dependency Execution:** To prevent microservice network latency (~500ms+) or Python child-process spawning (~1000ms), the trained scikit-learn model is transpiled via `m2cgen` into pure JavaScript arithmetic, executing natively inside the Node.js V8 engine.
4. **Dynamic Exposure Control:** Based on the AI risk score, the system dynamically executes one of three cryptographic policies:
    * **Policy 0 (`FULL_DECRYPT`):** Legitimate access; full AES-256-GCM decryption.
    * **Policy 1 (`PARTIAL_MASK`):** Suspicious/Medium risk; cryptographic partial masking (e.g., exposing only the last 4 digits of an account number).
    * **Policy 2 (`ACCESS_DENIED`):** High risk/Malicious attack; immediate exception interception with zero memory decryption.

---

## 2. Phase 1: Authentication & Role-Based Access Control (RBAC) Foundation
The foundational access tier was established within the NestJS modular monolith using JSON Web Tokens (JWT) and domain-specific role definitions.

### Key Implementation Details:
* **Authentication Mechanism:** Stateless JWT authentication managed by `JwtAuthGuard` and `JwtStrategy`.
* **User Identity Structure:** Upon successful authentication, the request object is decorated with the user payload (`req.user`), establishing the primary identity assertion:
  ```typescript
  export interface CurrentUserDto {
    id: string;        // UUID v4
    role: 'customer' | 'moderator' | 'admin';
  }
  ```
* **Role Hierarchy & Access Scope:**
  * `customer`: Standard end-user; strictly bounded to self-owned resource access (`record_owner_match = 1`).
  * `moderator`: Support tier; permitted cross-user read access on low-to-medium sensitivity resources, but flagged on high-velocity or out-of-hours queries.
  * `admin`: Complete system access; subject to strict behavioral rate-limiting and failed login monitoring to prevent compromised super-user token exploitation.

---

## 3. Phase 2: The TypeORM Cryptographic Flaw & Late-Binding Redesign
During the implementation of Application-Level Encryption (ALE) using TypeORM for the `BankInfoEntity` (`bank_details` table), a fatal timing vulnerability was identified in standard ORM value transformers.

### The Standard ORM Vulnerability
When configuring TypeORM columns with `ValueTransformer`:
```typescript
// STANDARD FLAWED IMPLEMENTATION:
from(value: string | null | undefined): string | null {
  if (!value) return null;
  return decryptData(value); // <-- BLIND DECRYPTION BEFORE RISK EVALUATION!
}
```
Whenever `bankRepo.findOne({ where: { userId } })` executes, TypeORM automatically runs `from()` on every encrypted column (`accountNumberEnc`, `ibanEnc`, `identityNumberEnc`). Plaintext strings materialize in Node.js RAM before the service layer can evaluate if the user is malicious.

### The Late-Binding Redesign (`EncryptionTransformer.ts`)
To enforce data-in-use protection, we modified the transformer to decouple storage encryption from retrieval decryption:
```typescript
import { ValueTransformer } from 'typeorm';
import { encryptData } from '../utils/encryption.util';

export class EncryptionTransformer implements ValueTransformer {
  /**
   * Called when saving to the database (Data at Rest encryption)
   */
  to(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return encryptData(value);
    } catch (error) {
      throw new Error(`Encryption error: ${(error as Error).message}`);
    }
  }

  /**
   * Called when loading from the database.
   * THESIS DESIGN CHOICE: Decryption is DEFERRED to the Adaptive ML Gatekeeper.
   * We return raw ciphertext to prevent memory-dump exposure.
   */
  from(value: string | null | undefined): string | null {
    return value || null; // Returns ciphertext string (e.g., "aes-256-gcm:iv:authTag:cipher")
  }
}
```

---

## 4. Phase 3: Synthetic Security Dataset Engineering (`generate_dataset.py`)
To train an AI model capable of distinguishing between legitimate workflow variations and sophisticated cyber attacks, a synthetic dataset generator was built utilizing **Poisson** and **Exponential** probability distributions.

### Dataset Schema & Domain Rules
The dataset consists of 6 business features and 1 target risk label across a 70% Train / 15% Validation / 15% Test stratified split:

| Feature Index | Column Name | Data Type | Description / Simulation Domain Logic |
| :---: | :--- | :---: | :--- |
| **0** | `user_role` | Categorical | `customer`, `moderator`, or `admin`. |
| **1** | `resource_sensitivity` | Ordinal | `LOW` (Public profile), `MEDIUM` (Email/Phone), `HIGH` (Banking/SSN/Encryption Keys). |
| **2** | `is_office_hours` | Binary (0/1) | `1` if request occurs Mon–Fri between 09:00 and 17:00; `0` otherwise. |
| **3** | `record_owner_match` | Binary (0/1) | `1` if requesting `userId` matches entity `ownerId`; `0` (cross-record access). |
| **4** | `recent_request_count` | Integer | Number of database queries executed by the user in the last 60 seconds (Poisson distribution). |
| **5** | `failed_attempt_count` | Integer | Number of consecutive failed login attempts prior to request (Exponential distribution). |
| **Target** | `risk_level` | Class (0, 1, 2)| **0:** `LOW` (Full Decrypt) | **1:** `MEDIUM` (Partial Mask) | **2:** `HIGH` (Access Denied). |

### Generated File Artifacts:
* `dataset/access_logs_train.csv` (70% of data - Used for model fitting)
* `dataset/access_logs_val.csv` (15% of data - Used for hyperparameter tuning)
* `dataset/access_logs_test.csv` (15% of data - Quarantined for thesis defense evaluation)

---

## 5. Phase 4: Machine Learning Pipeline & Thesis Defense Metrics (`train_and_transpile.py`)
We implemented a structured ML training pipeline comparing a linear `LogisticRegression` baseline against an ensemble `RandomForestClassifier`.

### Why Random Forest Over Linear Regression?
Security rules are highly conditional and non-linear (e.g., *IF role is customer AND sensitivity is HIGH AND owner_match is 0 THEN risk is HIGH*). A linear hyperplane cannot capture these conditional boundaries effectively. Our validation testing confirmed this:
* **Logistic Regression Baseline Weighted F1-Score:** ~0.7500 – 0.8100
* **Random Forest Classifier Weighted F1-Score:** **0.9777**

### Hyperparameter Selection & Optimization
We evaluated multiple tree depths (`max_depth = 8, 12, 16, None`) on the validation set. 
* **Selected Configuration:** `n_estimators = 75`, `max_depth = 12`, `class_weight = 'balanced'`.
* **Engineering Justification:** An unlimited tree depth with 300+ trees produces a massive 15MB+ JavaScript file upon transpilation, degrading Node.js compilation speed. A 75-tree forest at depth 12 compresses the decision logic into an optimal **~300KB JS artifact** while maintaining publication-grade accuracy.

### Definitive Test Set Evaluation Results (1,500 Quarantined Samples)
The final transpiled model was evaluated against `access_logs_test.csv`, achieving the following defense metrics:

#### 1. Per-Class Classification Report
| Risk Tiers & Policy Mapping | Precision | Recall | F1-Score | Support (Sample Count) |
| :--- | :---: | :---: | :---: | :---: |
| **LOW (0 - Full Decrypt)** | **0.9836** | **0.9914** | **0.9875** | 1,274 |
| **MEDIUM (1 - Partial Mask)** | **0.9259** | **0.8621** | **0.8929** | 87 |
| **HIGH (2 - Access Denied)** | **0.9556** | **0.9281** | **0.9416** | 139 |
| **Overall Accuracy** | — | — | **0.9780** | **1,500** |
| **Macro Average** | 0.9550 | 0.9272 | 0.9407 | 1,500 |
| **Weighted Average** | **0.9777** | **0.9780** | **0.9777** | 1,500 |

#### 2. Confusion Matrix Audit
```text
               Pred LOW (0)   Pred MEDIUM (1)   Pred HIGH (2)
Actual LOW (0)       1263               5                 6       <-- 0.86% False Alarm Rate!
Actual MED (1)         12              75                 0       <-- Zero outright blocks!
Actual HIGH(2)          9               1               129       <-- 92.8% Attack Interception!
```
* **Operational Friction Analysis:** Out of 1,274 legitimate user queries, only 11 were flagged (5 masked, 6 blocked), achieving a **99.14% legitimate user pass rate**.
* **Security Interception Analysis:** Out of 139 malicious attack vectors, **129 were blocked outright** and **1 was partially masked**, leaving only 9 false negatives (low-and-slow scraping outliers).

#### 3. Feature Importance Rankings (Domain Logic Verification)
| Rank | Feature Name | Importance Weight | Cybersecurity Behavioral Interpretation |
| :---: | :--- | :---: | :--- |
| **#1** | `recent_request_count` | **0.418860** | **High-Velocity Scraping:** Primary indicator of automated data exfiltration scripts. |
| **#2** | `resource_sensitivity` | **0.174436** | **Data Classification Tier:** Differentiates between benign UI queries and PII/Banking targets. |
| **#3** | `failed_attempt_count` | **0.137639** | **Brute-Force / Credential Stuffing:** Identifies compromised accounts attempting privilege escalation. |
| **#4** | `record_owner_match` | **0.129231** | **IDOR Interception:** Flags lateral movement where a user requests another user's UUID. |
| **#5** | `role_customer` | **0.042892** | Base role contextual modifier. |
| **#6** | `role_moderator` | **0.037771** | Support tier boundary modifier. |
| **#7** | `is_office_hours` | **0.035834** | Temporal anomaly weighting (after-hours access flag). |
| **#8** | `role_admin` | **0.023337** | Super-user baseline modifier. |

---

## 6. Phase 5: Zero-Dependency Transpilation via `m2cgen`
To achieve sub-millisecond inference inside Node.js without Python runtime dependencies, we implemented **Static Numerical Mapping** followed by JavaScript transpilation via `m2cgen` (Model-to-Code Generator).

### The Static Numerical Mapping Strategy
Stateful scikit-learn preprocessing pipelines (`OneHotEncoder`, `OrdinalEncoder`) cannot be cleanly exported to JS. We solved this by defining an invariant 8-element numerical array mapping used identically during Python training and TypeScript runtime execution:

```python
# PYTHON TRAINING PREPROCESSING (train_and_transpile.py):
def preprocess_to_numeric(df):
    X = pd.DataFrame()
    X['role_customer'] = (df['user_role'] == 'customer').astype(int)      # Index 0
    X['role_moderator'] = (df['user_role'] == 'moderator').astype(int)    # Index 1
    X['role_admin'] = (df['user_role'] == 'admin').astype(int)            # Index 2
    sens_map = {'LOW': 0, 'MEDIUM': 1, 'HIGH': 2}
    X['resource_sensitivity'] = df['resource_sensitivity'].map(sens_map).astype(int) # Index 3
    X['is_office_hours'] = df['is_office_hours'].astype(int)              # Index 4
    X['record_owner_match'] = df['record_owner_match'].astype(int)        # Index 5
    X['recent_request_count'] = df['recent_request_count'].astype(int)    # Index 6
    X['failed_attempt_count'] = df['failed_attempt_count'].astype(int)    # Index 7
    return X
```

### Automated JavaScript Artifact Generation
At the conclusion of `model/train_and_transpile.py`, the Random Forest is exported directly into a standalone module:
```python
import m2cgen as m2c

js_code = m2c.export_to_javascript(rf_model)
js_code += "\n// Auto-generated export for NestJS Modular Monolith\n"
js_code += "if (typeof module !== 'undefined' && module.exports) {\n"
js_code += "    module.exports = { score };\n"
js_code += "}\n"

with open("randomForestModel.js", "w") as f:
    f.write(js_code)
```
* **Generated Artifact:** `randomForestModel.js` (Ready for deployment in `src/modules/security/ml-engine/`).
* **Runtime Latency:** Executes native V8 CPU array branching in **~0.08ms – 0.12ms**, introducing effectively zero latency overhead to database requests.

---

## 7. Phase 6: Runtime Integration Architecture (NestJS Monolith)
With the model transpiled, the runtime integration architecture inside the NestJS modular monolith is structured across three core specialized services:

```text
[ HTTP Controller ] (req.user, targetUserId)
        │
        ▼
[ BankInfoService ] ──(1. Fetch Ciphertext)──▶ [ PostgreSQL / TypeORM ] (Returns Raw Encrypted Strings)
        │
        ├─(2. Build Context)─▶ [ AccessContextBuilderService ] ──▶ [ Redis Cache ] (req_count, failed_logins)
        │
        ▼
[ AdaptiveAleService ] ──(3. Execute JS Model ~0.1ms)──▶ [ randomForestModel.js ] (score([0,1,0,2,...]))
        │
        ├─▶ IF Score == 2 (HIGH)   ──▶ Throw ForbiddenException (Zero RAM Plaintext Exposure!)
        ├─▶ IF Score == 1 (MEDIUM) ──▶ AES Decrypt + Regex Mask (e.g., "****-****-****-1234")
        └─▶ IF Score == 0 (LOW)    ──▶ Full AES-256-GCM Decryption (Legitimate User Access)
```

### Strict TypeScript Feature Index Mapping Table
When wiring `AccessContextBuilderService` into `AdaptiveAleService`, developers/AIs MUST adhere to this exact array indexing:

| Array Index | Feature Name | TypeScript Runtime Construction Logic |
| :---: | :--- | :--- |
| `input[0]` | `role_customer` | `context.user_role === 'customer' ? 1 : 0` |
| `input[1]` | `role_moderator` | `context.user_role === 'moderator' ? 1 : 0` |
| `input[2]` | `role_admin` | `context.user_role === 'admin' ? 1 : 0` |
| `input[3]` | `resource_sensitivity` | `context.resource_sensitivity === 'LOW' ? 0 : (context.resource_sensitivity === 'MEDIUM' ? 1 : 2)` |
| `input[4]` | `is_office_hours` | `context.is_office_hours` *(1 for Mon-Fri 9am-5pm, 0 otherwise)* |
| `input[5]` | `record_owner_match` | `context.record_owner_match` *(1 if `req.user.id === entity.userId`, 0 otherwise)* |
| `input[6]` | `recent_request_count` | `context.recent_request_count` *(Integer pulled from Redis rate-limiter)* |
| `input[7]` | `failed_attempt_count` | `context.failed_attempt_count` *(Integer pulled from Auth failed-login tracker)* |

---

## 8. Quick Reference Roadmap for Next Steps (AI & Developer Onboarding)

If an AI coding assistant or developer is reading this document to continue building the system, exactly four implementation tasks remain:

### Step 1: Place the Transpiled Model
Copy `randomForestModel.js` from the Python `model/` directory into the NestJS project structure:
```bash
cp model/randomForestModel.js src/modules/security/ml-engine/randomForestModel.js
```

### Step 2: Implement `AccessContextBuilderService`
Create `src/modules/security/services/access-context-builder.service.ts` to aggregate real-time features:
* Inject `@Inject(CACHE_MANAGER) private readonly cacheManager: Cache`.
* Pull `rate_limit:req_count:${userId}` from Redis (default to 1).
* Pull `auth:failed_logins:${userId}` from Redis (default to 0).
* Calculate `is_office_hours` using `new Date()`.

### Step 3: Implement `AdaptiveAleService`
Create `src/modules/security/services/adaptive-ale.service.ts`:
* Import `{ score } = require('../ml-engine/randomForestModel')`.
* Implement `executeAdaptiveAccess(context, entity)` using the 8-element numerical array mapping table in Section 7.
* Convert raw voting scores from `score(input)` into normalized softmax/probability percentages.
* Execute `applyFullDecryption`, `applyPartialMasking` (masking strings via Regex/slicing while retaining `accountLastFour`), or throw `new ForbiddenException()`.

### Step 4: Refactor Domain Service (`BankInfoService`)
Modify `src/modules/bank-details/bank-info.service.ts`:
* Fetch the entity using `this.bankRepo.findOne({ where: { userId } })`.
* Verify that entity properties (`accountNumberEnc`, `ibanEnc`, etc.) remain raw ciphertext strings due to the redesigned `EncryptionTransformer`.
* Pass `req.user`, `entity.userId`, and `'HIGH'` (resource sensitivity) into `contextBuilder.buildContext()`.
* Pass the resulting context and ciphertext entity into `adaptiveAleService.executeAdaptiveAccess()`.

---
*End of Documentation — All AI assistants have permission to rely on these architectural boundaries and mapping tables as absolute project invariants.*