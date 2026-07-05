# Adaptive Data Access — Complete Request-to-Response Flow

**Scenario documented:** an authenticated customer calls `GET /bank/details` to view their own bank information.
This document traces the request through **every file, method, and layer** it touches — showing the *input*, *what happens inside*, and the *output* of each stage — until the final HTTP response is produced.

All example values (risk probabilities, masked outputs, timings) are real outputs captured from the running system.

---

## 0. Bird's-Eye View

```
Client (Bearer JWT)
   │  GET /bank/details
   ▼
[1] AuthGuard ──────────── verify JWT, normalize identity (sub → id)
   ▼
[2] RolesGuard ─────────── role allowed on this route?
   ▼
[3] BankController.findOne
   │     ├─[3a] UtilitiesService.createAccessLog ──▶ INSERT access_requests row
   ▼
[4] BankService.findOne
   │     ├─[4a] TypeORM fetch ──▶ EncryptionTransformer.from() returns CIPHERTEXT
   │     ├─[4b] AccessContextBuilderService.buildContext ──▶ 6 runtime features
   ▼
[5] AdaptiveAleService.executeAdaptiveAccess
   │     ├─[5a] buildFeatureVector ──▶ 8-element numeric array
   │     ├─[5b] randomForestModel.score() ──▶ [P(LOW), P(MEDIUM), P(HIGH)]
   │     ├─[5c] argmax ──▶ risk level ──▶ policy decision
   │     └─[5d] applyFullDecryption | applyPartialMasking | ForbiddenException
   ▼
[6] HTTP Response (plaintext | masked | 403)
```

Two supporting flows feed this pipeline **before** the request ever happens:

- **Write path (data at rest):** `POST /bank/details` → `EncryptionTransformer.to()` encrypts every sensitive field with AES-256-GCM before it reaches PostgreSQL (§ A.1).
- **Failed-login trail:** every wrong password in `POST /auth/sign-in` inserts a row into `failed_attempts` (§ A.2). The risk engine counts these later.

---

## 1. Entry: `AuthGuard` — identity verification

**File:** `src/core/guards/auth.guard.ts`
**Triggered by:** the `@ApiAuth()` decorator on the route (`src/shared/decorators/api-auth.decorator.ts`), which applies `UseGuards(AuthGuard, RolesGuard)`.

### Input
The raw HTTP request:

```http
GET /bank/details HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### What happens inside
1. `extractTokenFromHeader()` splits the `Authorization` header and takes the token after `Bearer `. No token → `401 Unauthorized`, flow ends.
2. `jwtService.verifyAsync(token)` checks the signature and expiry against `JWT_ACCESS_SECRET`. Invalid/expired → `401 Unauthorized`, flow ends.
3. The verified payload is `{ sub, email, role, jti }` — the user id lives in the standard JWT `sub` claim. Because every downstream consumer reads `user.id`, the guard **normalizes identity in one place**:

```typescript
request['user'] = { ...payload, id: payload.sub };
```

### Output
`req.user` is attached for the rest of the request lifecycle:

```json
{
  "sub": "0d9c7c8e-3f21-4b7a-9d2e-1a2b3c4d5e6f",
  "id":  "0d9c7c8e-3f21-4b7a-9d2e-1a2b3c4d5e6f",
  "email": "rahim@example.com",
  "role": "customer",
  "jti": "f7e6d5c4-..."
}
```

> **Why the normalization matters:** without it, `user.id` is `undefined`, and TypeORM silently drops `undefined` values from `where` clauses — queries would return the *first row of the table* instead of the requester's row. The `sub → id` mapping closes both the crash and that broken-access-control hole.

---

## 2. `RolesGuard` — route-level RBAC

**File:** `src/core/guards/roles.guard.ts`

### Input
- `req.user` from stage 1 (needs `user.role`)
- Route metadata set by `@Roles(UserRole.CUSTOMER)` on the controller method

### What happens inside
1. `Reflector.getAllAndOverride(ROLES_KEY, ...)` reads the required roles from the handler metadata → `['customer']`.
2. Compares: `requiredRoles.includes(user.role)`.

### Output
- `true` → request proceeds to the controller.
- `false` → `403 Forbidden`, flow ends.

This is **traditional static RBAC** — it answers *"may this role call this endpoint at all?"*. It does **not** decide how much data is exposed; that is the adaptive layer's job (stage 5).

---

## 3. `BankController.findOne` — the route handler

**File:** `src/modules/bank/bank.controller.ts`

### Input
- `@CurrentUser() user: AuthenticatedUser` — the param decorator (`src/shared/decorators/current-user.decorator.ts`) simply returns `req.user` built in stage 1.
- Interface: `src/shared/interfaces/authenticated-user.interface.ts` (`{ id, sub, email, role, jti? }`).

### What happens inside

```typescript
@ApiAuth()
@Roles(UserRole.CUSTOMER)
@Get('details')
async findOne(@CurrentUser() user: AuthenticatedUser) {
  // Log BEFORE the service call so the current request is included
  // in its own recent_request_count feature.
  await this.utilityService.createAccessLog(user.id);
  return this.bankService.findOne(user);
}
```

Two calls, in a deliberate order:

#### 3a. `UtilitiesService.createAccessLog(user.id)`
**File:** `src/modules/utilities/utilities.service.ts`

- **Input:** the requester's UUID.
- **Inside:** inserts one row into `access_requests` (`AccessRequestEntity` — `src/core/database/entities/access-request.entity.ts`, columns: `id`, `user_id`, `created_at`, indexed on `(user_id, created_at)`). The insert is wrapped in try/catch: an audit-log failure is logged but **never blocks the data request**.
- **Output:** a new row like

  | id | user_id | created_at |
  |---|---|---|
  | `99e0…` | `0d9c…` | `2026-07-05 22:30:01+06` |

- **Why before the service call:** the request being evaluated must count itself. An attacker's 30th request in a minute must be scored as the 30th, not the 29th.

#### 3b. `bankService.findOne(user)` → stage 4.

### Output
Whatever stage 4–5 return (or throw) is serialized by NestJS as the HTTP response.

---

## 4. `BankService.findOne` — the domain orchestrator

**File:** `src/modules/bank/bank.service.ts`

### Input
The full `AuthenticatedUser` object (the service needs both `id` and `role`).

### What happens inside — the 4-step thesis pipeline

```typescript
async findOne(user: AuthenticatedUser) {
  // 1. Fetch ciphertext entity — no plaintext in RAM yet
  const bankAccountInfo = await this.bankRepo.findOne({ where: { userId: user.id } });
  if (!bankAccountInfo) throw new NotFoundException('Account information does not exist');

  // 2. Extract features for this request
  const context = await this.contextBuilder.buildContext({
    userId: user.id,
    userRole: user.role,
    recordOwnerId: bankAccountInfo.userId,
    resourceSensitivity: 'HIGH', // bank details are HIGH by definition (static classification)
  });

  // 3 + 4. Risk scoring and adaptive decryption control
  return this.adaptiveAle.executeAdaptiveAccess(context, bankAccountInfo);
}
```

#### 4a. The fetch — and why the entity stays encrypted

**Files:** `src/core/database/entities/bank-details.entity.ts`, `src/core/security/ale/transformers/encryption.transformer.ts`

Every sensitive column on `BankInfoEntity` carries `transformer: new EncryptionTransformer()`. When TypeORM loads a row it calls the transformer's `from()` on each column:

```typescript
from(value: string | null | undefined): string | null {
  return value || null; // ciphertext string, e.g. "v1:iv:authTag:cipher"
}
```

**This is the Late-Binding design choice.** A standard transformer would call `decryptData()` here — meaning plaintext would materialize in server RAM *before any risk check could run*. Ours returns the ciphertext untouched; decryption is deferred to the gatekeeper (stage 5).

- **Input:** SQL row from PostgreSQL.
- **Output:** a `BankInfoEntity` where sensitive fields are still ciphertext:

```json
{
  "id": "bank-rec-1",
  "userId": "0d9c7c8e-...",
  "branchName": "v1:9f2ab1...:e410cc...:8a71f3...",
  "accountType": "SAVINGS",
  "accountHolderNameEnc": "v1:aa01...:bc02...:9d4e...",
  "accountNumberEnc": "v1:77fe...:0a1b...:c3d4...",
  "accountLastFour": "6789",
  "routingNumberEnc": "v1:...", "swiftCodeEnc": "v1:...",
  "ibanEnc": "v1:...", "identityNumberEnc": "v1:...",
  "status": "ACTIVE"
}
```

Note `accountLastFour` is stored as plaintext by design — it enables masking later **without any decryption**.

#### 4b. Feature extraction — `AccessContextBuilderService.buildContext`

**File:** `src/core/security/adaptive-access/access-context-builder.service.ts`
**Types:** `src/core/security/adaptive-access/interfaces/access-context.interface.ts`

- **Input:** `{ userId, userRole, recordOwnerId, resourceSensitivity }`.
- **Inside**, the six model features are assembled:

| Feature | Source | Logic |
|---|---|---|
| `userRole` | JWT (stage 1) | passed through |
| `resourceSensitivity` | **static, declared at call site** | `'HIGH'` for bank details — a design-time property of the data, never derived from the request |
| `isOfficeHours` | server clock | `1` if Mon–Fri and `09:00 ≤ hour < 17:00`, else `0` |
| `recordOwnerMatch` | JWT id vs. **the fetched row's** `user_id` | `userId === recordOwnerId ? 1 : 0` — both sides are server-controlled; nothing client-supplied is trusted |
| `recentRequestCount` | `access_requests` table | indexed `COUNT(*)` `WHERE user_id = ? AND created_at > NOW() - INTERVAL '60 seconds'` — includes the row inserted in 3a, so it is always ≥ 1 |
| `failedAttemptCount` | `failed_attempts` table | indexed `COUNT(*)` `WHERE user_id = ? AND created_at > NOW() - INTERVAL '24 hours'` |

  The two counts run in parallel (`Promise.all`).

- **Output:** an `AccessContext`:

```json
{
  "userId": "0d9c7c8e-...",
  "userRole": "customer",
  "resourceSensitivity": "HIGH",
  "isOfficeHours": 1,
  "recordOwnerMatch": 1,
  "recentRequestCount": 1,
  "failedAttemptCount": 0
}
```

---

## 5. `AdaptiveAleService.executeAdaptiveAccess` — the ML gatekeeper (thesis core)

**File:** `src/core/security/adaptive-access/adaptive-ale.service.ts`
**Model:** `src/core/security/models/randomForestModel.js` (75-tree Random Forest, transpiled from scikit-learn by m2cgen; typed by `randomForestModel.d.ts`)

### Input
- The `AccessContext` from 4b
- The **ciphertext** `BankInfoEntity` from 4a

### 5a. `buildFeatureVector(context)` — strict index mapping

The context is converted to the 8-element numeric array. **The index order is a project invariant** — it must match the Python training preprocessing (`train_and_transpile.py`) exactly, or the model silently mispredicts:

| Index | Feature | Construction |
|---|---|---|
| 0 | `role_customer` | `userRole === 'customer' ? 1 : 0` |
| 1 | `role_moderator` | `userRole === 'moderator' ? 1 : 0` |
| 2 | `role_admin` | `userRole === 'admin' ? 1 : 0` |
| 3 | `resource_sensitivity` | `LOW=0, MEDIUM=1, HIGH=2` |
| 4 | `is_office_hours` | 0/1 |
| 5 | `record_owner_match` | 0/1 |
| 6 | `recent_request_count` | integer |
| 7 | `failed_attempt_count` | integer |

- **Output (this scenario):** `[1, 0, 0, 2, 1, 1, 1, 0]`

### 5b. `score(featureVector)` — in-process inference

The transpiled model is pure JavaScript arithmetic (nested if/else over the 8 inputs across 75 trees), executed natively in V8 — **no Python process, no network call, no external service**.

- **Input:** `[1, 0, 0, 2, 1, 1, 1, 0]`
- **Output:** class-probability vector `[P(LOW), P(MEDIUM), P(HIGH)]`:

```
[0.9869, 0.0110, 0.0021]
```

Measured latency: **~50 µs warm** (the very first call after boot pays a one-time ~50 ms V8 parse/JIT cost for the 3 MB model file).

### 5c. Argmax → risk level → policy decision

```
riskLevel = argmax(probabilities)      // 0
RISK_TO_DECISION = { 0: FULL_DECRYPT, 1: PARTIAL_MASK, 2: ACCESS_DENIED }
```

Every assessment is **audit-logged** with its full evidence:

```
[AdaptiveAleService] Risk assessment | user=0d9c... | features=[1,0,0,2,1,1,1,0]
  | probs=[0.9869,0.011,0.0021] | risk=LOW | decision=FULL_DECRYPT | inference=49.1µs
```

### 5d. Policy execution — three mutually exclusive paths

Decryption uses `decryptData()` from `src/core/security/ale/utils/encryption.util.ts` (AES-256-GCM; parses `v1:iv:authTag:cipher`, verifies the auth tag, returns UTF-8 plaintext; key from `DB_ENCRYPTION_KEY`).

#### Path LOW → `applyFullDecryption(entity)`
- **Inside:** calls `decryptData()` on all 7 encrypted fields; renames `*Enc` properties to clean names.
- **Output:**

```json
{
  "data": {
    "id": "bank-rec-1",
    "userId": "0d9c7c8e-...",
    "branchName": "Gulshan Branch",
    "accountType": "SAVINGS",
    "accountHolderName": "Rahim Ahmed",
    "accountNumber": "123456789",
    "routingNumber": "987654",
    "swiftCode": "DBBLBDDH",
    "iban": "BD33BANK000123456789",
    "identityNumber": "1990123456789",
    "status": "ACTIVE"
  },
  "security": {
    "riskLevel": "LOW",
    "decision": "FULL_DECRYPT",
    "confidence": 0.9869,
    "probabilities": { "LOW": 0.9869, "MEDIUM": 0.011, "HIGH": 0.0021 }
  }
}
```

#### Path MEDIUM → `applyPartialMasking(entity)`
Triggered e.g. by `[1,0,0,2,1,1,9,0]` — same user making their **9th request within 60 seconds** during office hours → probs `[0.018, 0.982, 0.0]`.

- **Inside:** exactly **two** `decryptData()` calls happen (branch name; holder name — which is then masked to initials). The account number is reconstructed as `"****" + accountLastFour` — **its ciphertext is never decrypted**. The four high-value identifiers stay hidden.
- **Output (captured from a real run):**

```json
{
  "data": {
    "branchName": "Gulshan Branch",
    "accountType": "SAVINGS",
    "accountHolderName": "R**** A****",
    "accountNumber": "****6789",
    "routingNumber": "***HIDDEN***",
    "swiftCode": "***HIDDEN***",
    "iban": "***HIDDEN***",
    "identityNumber": "***HIDDEN***",
    "status": "ACTIVE"
  },
  "security": {
    "riskLevel": "MEDIUM",
    "decision": "PARTIAL_MASK",
    "confidence": 0.982,
    "probabilities": { "LOW": 0.018, "MEDIUM": 0.982, "HIGH": 0.0 }
  }
}
```

#### Path HIGH → `ForbiddenException`
Triggered e.g. by scraping velocity `[1,0,0,2,0,1,40,0]` → probs `[0.0, 0.0, 1.0]`, or 8 recent failed logins `[1,0,0,2,0,1,2,8]` → `[0.28, 0.0, 0.72]`.

- **Inside:** the exception is thrown **before any `decryptData()` call** — on this path **zero plaintext ever materializes in server RAM**. A warning-level audit entry is emitted.
- **Output:**

```json
HTTP 403
{
  "statusCode": 403,
  "message": "Access denied by adaptive security policy. This incident has been recorded.",
  "error": "Forbidden"
}
```

---

## 6. Response summary — one endpoint, three possible answers

| Runtime behavior (same user, same endpoint) | Risk | Decision | What the client receives |
|---|---|---|---|
| 1–8 requests/min, no failed logins, own record | LOW | `FULL_DECRYPT` | full plaintext + security meta |
| ~9–13 requests/min | MEDIUM | `PARTIAL_MASK` | masked view (`****6789`, `R**** A****`, hidden identifiers) |
| 15+ requests/min, or many failed logins, or cross-record access | HIGH | `ACCESS_DENIED` | `403 Forbidden`, nothing decrypted |

This is the thesis claim made concrete: **access control is no longer a binary yes/no decided once at the gate — the amount of decrypted data adapts per-request to runtime behavioral risk, and denial happens before decryption, not after.**

---

## Appendix A — Supporting flows that feed the pipeline

### A.1 Write path: how the data became ciphertext (`POST /bank/details`)

1. `BankController.create` — logs the access (3a), passes the DTO to `BankService.create`.
2. `BankService.create` — verifies the user exists, computes `accountLastFour = accountNumber.slice(-4)` (stored plaintext to enable decryption-free masking), builds the entity.
3. On `bankRepo.save(...)`, TypeORM invokes `EncryptionTransformer.to(value)` per sensitive column:
   - `encryptData(value)` generates a random 12-byte IV, encrypts with AES-256-GCM, and returns `v1:<iv>:<authTag>:<cipher>` (hex).
4. PostgreSQL stores only ciphertext. **Input:** `"accountNumberEnc": "123456789"` → **stored:** `"v1:77fe…:0a1b…:c3d4…"`.

### A.2 Failed-login trail: how `failed_attempt_count` gets its data

**File:** `src/modules/auth/auth.service.ts`

- `signIn()`: when `bcrypt.compare` fails → `utilityService.createFailedAttemptLog(user.id)` inserts a row into `failed_attempts` (`FailedAttemptEntity`), then throws `403`.
- `rotatetokens()`: refresh-token reuse (theft signal) also records a failed attempt and revokes the session.
- The risk engine later counts these rows over a **24-hour window** (stage 4b).

### A.3 The audit trail produced by every request

Each request leaves two durable artifacts:
1. A row in `access_requests` (who, when) — doubles as the velocity feature source.
2. A structured log line from `AdaptiveAleService` (features, probabilities, decision, inference time) — the evidence base for the thesis evaluation chapter.

---

## Appendix B — File index (in flow order)

| # | File | Role in the flow |
|---|---|---|
| 1 | `src/core/guards/auth.guard.ts` | JWT verification, `sub → id` normalization |
| 2 | `src/core/guards/roles.guard.ts` | Static RBAC gate |
| 3 | `src/shared/decorators/api-auth.decorator.ts` | Applies both guards |
| 4 | `src/shared/decorators/current-user.decorator.ts` | Extracts `req.user` for handlers |
| 5 | `src/shared/interfaces/authenticated-user.interface.ts` | Shape of `req.user` |
| 6 | `src/modules/bank/bank.controller.ts` | Route handler; access logging + delegation |
| 7 | `src/modules/utilities/utilities.service.ts` | `access_requests` / `failed_attempts` inserts |
| 8 | `src/core/database/entities/access-request.entity.ts` | Velocity feature source table |
| 9 | `src/core/database/entities/failed-attempt.entity.ts` | Failed-login feature source table |
| 10 | `src/modules/bank/bank.service.ts` | Orchestrates fetch → context → gatekeeper |
| 11 | `src/core/database/entities/bank-details.entity.ts` | Encrypted entity definition |
| 12 | `src/core/security/ale/transformers/encryption.transformer.ts` | `to()` encrypts on save; `from()` returns ciphertext (late binding) |
| 13 | `src/core/security/adaptive-access/access-context-builder.service.ts` | Feature extraction |
| 14 | `src/core/security/adaptive-access/interfaces/access-context.interface.ts` | Context/risk types |
| 15 | `src/core/security/adaptive-access/adaptive-ale.service.ts` | Feature vector → inference → policy |
| 16 | `src/core/security/models/randomForestModel.js` | Transpiled Random Forest (`score()`) |
| 17 | `src/core/security/ale/utils/encryption.util.ts` | AES-256-GCM encrypt/decrypt |
| 18 | `src/core/security/security.module.ts` | DI wiring of the adaptive layer |
