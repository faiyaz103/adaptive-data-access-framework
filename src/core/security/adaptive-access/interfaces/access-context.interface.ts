/**
 * Types for the Adaptive ML-Based Decryption Control Layer.
 * Feature semantics MUST stay aligned with the Python training pipeline
 * (generate_dataset.py / train_and_transpile.py — see pipeline.md §4–§7).
 */

export type ResourceSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';

export enum RiskLevel {
  LOW = 0, // Full decryption
  MEDIUM = 1, // Partial masking
  HIGH = 2, // Access denied
}

export enum AccessDecision {
  FULL_DECRYPT = 'FULL_DECRYPT',
  PARTIAL_MASK = 'PARTIAL_MASK',
  ACCESS_DENIED = 'ACCESS_DENIED',
}

/** Runtime request context — input to the risk engine. */
export interface AccessContext {
  userId: string;
  userRole: string; // 'customer' | 'moderator' | 'admin'
  resourceSensitivity: ResourceSensitivity;
  isOfficeHours: 0 | 1; // Mon–Fri 09:00–17:00 server time
  recordOwnerMatch: 0 | 1; // requester id === entity owner id
  recentRequestCount: number; // requests in the last 60 seconds
  failedAttemptCount: number; // failed logins in the last 24 hours
}

/** Result of a risk evaluation. */
export interface RiskAssessment {
  riskLevel: RiskLevel;
  riskLabel: 'LOW' | 'MEDIUM' | 'HIGH';
  decision: AccessDecision;
  /** Class probabilities [P(LOW), P(MEDIUM), P(HIGH)] from the Random Forest. */
  probabilities: number[];
  /** Confidence of the winning class (max probability). */
  confidence: number;
  /** The exact 8-element feature vector fed to the model (for audit logs). */
  featureVector: number[];
}
