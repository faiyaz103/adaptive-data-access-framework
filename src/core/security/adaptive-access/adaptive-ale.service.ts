import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { score } from '@core/security/models/randomForestModel';
import { decryptData } from '@core/security/ale/utils/encryption.util';
import { BankInfoEntity } from '@core/database/entities/bank-details.entity';
import {
  AccessContext,
  AccessDecision,
  RiskAssessment,
  RiskLevel,
} from './interfaces/access-context.interface';

const RISK_LABELS = ['LOW', 'MEDIUM', 'HIGH'] as const;

const RISK_TO_DECISION: Record<RiskLevel, AccessDecision> = {
  [RiskLevel.LOW]: AccessDecision.FULL_DECRYPT,
  [RiskLevel.MEDIUM]: AccessDecision.PARTIAL_MASK,
  [RiskLevel.HIGH]: AccessDecision.ACCESS_DENIED,
};

/**
 * Adaptive ML-Based Decryption Control Layer — the core thesis contribution.
 *
 * Receives a ciphertext entity (late-binding EncryptionTransformer returns
 * raw encrypted strings) plus the request context, scores the runtime risk
 * with the transpiled Random Forest, and applies one of three policies:
 *   LOW    → full AES-256-GCM decryption
 *   MEDIUM → partial decryption + masking
 *   HIGH   → ForbiddenException, zero plaintext ever materialized in RAM
 */
@Injectable()
export class AdaptiveAleService {
  private readonly logger = new Logger(AdaptiveAleService.name);

  /**
   * Builds the 8-element numeric feature vector.
   * STRICT INDEX MAPPING — must match Python training preprocessing
   * (pipeline.md §7). Do not reorder.
   */
  buildFeatureVector(context: AccessContext): number[] {
    return [
      context.userRole === 'customer' ? 1 : 0, // [0] role_customer
      context.userRole === 'moderator' ? 1 : 0, // [1] role_moderator
      context.userRole === 'admin' ? 1 : 0, // [2] role_admin
      context.resourceSensitivity === 'LOW'
        ? 0
        : context.resourceSensitivity === 'MEDIUM'
          ? 1
          : 2, // [3] resource_sensitivity
      context.isOfficeHours, // [4] is_office_hours
      context.recordOwnerMatch, // [5] record_owner_match
      context.recentRequestCount, // [6] recent_request_count
      context.failedAttemptCount, // [7] failed_attempt_count
    ];
  }

  /** Runs the transpiled Random Forest (~0.1 ms, in-process V8). */
  assessRisk(context: AccessContext): RiskAssessment {
    const featureVector = this.buildFeatureVector(context);

    const started = process.hrtime.bigint();
    const probabilities = score(featureVector);
    const inferenceMicros = Number(process.hrtime.bigint() - started) / 1000;

    // Risk level = argmax of the class-probability vector
    let riskLevel: RiskLevel = RiskLevel.LOW;
    for (let i = 1; i < probabilities.length; i++) {
      if (probabilities[i] > probabilities[riskLevel]) riskLevel = i;
    }

    const assessment: RiskAssessment = {
      riskLevel,
      riskLabel: RISK_LABELS[riskLevel],
      decision: RISK_TO_DECISION[riskLevel],
      probabilities: probabilities.map((p) => Number(p.toFixed(4))),
      confidence: Number(probabilities[riskLevel].toFixed(4)),
      featureVector,
    };

    // Audit trail: every scoring decision is logged with its evidence.
    this.logger.log(
      `Risk assessment | user=${context.userId} | features=[${featureVector.join(
        ',',
      )}] | probs=[${assessment.probabilities.join(',')}] | risk=${
        assessment.riskLabel
      } | decision=${assessment.decision} | inference=${inferenceMicros.toFixed(1)}µs`,
    );

    return assessment;
  }

  /**
   * Full pipeline: score risk, then decrypt / mask / deny.
   * The entity arrives holding CIPHERTEXT — nothing has been decrypted yet.
   */
  executeAdaptiveAccess(context: AccessContext, entity: BankInfoEntity) {
    const assessment = this.assessRisk(context);

    switch (assessment.decision) {
      case AccessDecision.ACCESS_DENIED:
        // Zero decryptData() calls on this path: no plaintext in RAM.
        this.logger.warn(
          `ACCESS DENIED for user=${context.userId} (risk=${assessment.riskLabel}, confidence=${assessment.confidence})`,
        );
        throw new ForbiddenException(
          'Access denied by adaptive security policy. This incident has been recorded.',
        );

      case AccessDecision.PARTIAL_MASK:
        return {
          data: this.applyPartialMasking(entity),
          security: this.toSecurityMeta(assessment),
        };

      case AccessDecision.FULL_DECRYPT:
      default:
        return {
          data: this.applyFullDecryption(entity),
          security: this.toSecurityMeta(assessment),
        };
    }
  }

  /** LOW risk: legitimate access — decrypt every protected field. */
  private applyFullDecryption(entity: BankInfoEntity) {
    return {
      id: entity.id,
      userId: entity.userId,
      branchName: decryptData(entity.branchName),
      accountType: entity.accountType,
      accountHolderName: decryptData(entity.accountHolderNameEnc),
      accountNumber: decryptData(entity.accountNumberEnc),
      routingNumber: decryptData(entity.routingNumberEnc),
      swiftCode: decryptData(entity.swiftCodeEnc),
      iban: decryptData(entity.ibanEnc),
      identityNumber: decryptData(entity.identityNumberEnc),
      status: entity.status,
    };
  }

  /**
   * MEDIUM risk: expose only what a suspicious-but-plausible session needs.
   * The account number is masked using the stored accountLastFour WITHOUT
   * decrypting the ciphertext at all; high-value identifiers stay hidden.
   */
  private applyPartialMasking(entity: BankInfoEntity) {
    return {
      id: entity.id,
      userId: entity.userId,
      branchName: decryptData(entity.branchName),
      accountType: entity.accountType,
      accountHolderName: this.maskName(decryptData(entity.accountHolderNameEnc)),
      accountNumber: `****${entity.accountLastFour}`, // zero decryption needed
      routingNumber: entity.routingNumberEnc ? '***HIDDEN***' : null,
      swiftCode: entity.swiftCodeEnc ? '***HIDDEN***' : null,
      iban: entity.ibanEnc ? '***HIDDEN***' : null,
      identityNumber: '***HIDDEN***',
      status: entity.status,
    };
  }

  /** "Rahim Ahmed" -> "R**** A****" */
  private maskName(name: string | null): string | null {
    if (!name) return null;
    return name
      .split(/\s+/)
      .map((part) => (part.length > 0 ? `${part[0]}****` : part))
      .join(' ');
  }

  private toSecurityMeta(assessment: RiskAssessment) {
    return {
      riskLevel: assessment.riskLabel,
      decision: assessment.decision,
      confidence: assessment.confidence,
      probabilities: {
        LOW: assessment.probabilities[0],
        MEDIUM: assessment.probabilities[1],
        HIGH: assessment.probabilities[2],
      },
    };
  }
}
