import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessRequestEntity } from '@core/database/entities/access-request.entity';
import { FailedAttemptEntity } from '@core/database/entities/failed-attempt.entity';
import {
  AccessContext,
  ResourceSensitivity,
} from './interfaces/access-context.interface';

/**
 * Aggregates the real-time behavioral features required by the
 * Adaptive ML Gatekeeper for a single access request.
 *
 * Feature windows (project invariants):
 *  - recent_request_count : access_requests rows in the last 60 seconds
 *  - failed_attempt_count : failed_attempts rows in the last 24 hours
 */
@Injectable()
export class AccessContextBuilderService {
  private readonly logger = new Logger(AccessContextBuilderService.name);

  private static readonly REQUEST_WINDOW = '60 seconds';
  private static readonly FAILED_ATTEMPT_WINDOW = '24 hours';

  constructor(
    @InjectRepository(AccessRequestEntity)
    private readonly accessRepo: Repository<AccessRequestEntity>,
    @InjectRepository(FailedAttemptEntity)
    private readonly failedAttemptRepo: Repository<FailedAttemptEntity>,
  ) {}

  async buildContext(params: {
    userId: string;
    userRole: string;
    recordOwnerId: string;
    resourceSensitivity: ResourceSensitivity;
  }): Promise<AccessContext> {
    const [recentRequestCount, failedAttemptCount] = await Promise.all([
      this.getRecentRequestCount(params.userId),
      this.getFailedAttemptCount(params.userId),
    ]);

    const context: AccessContext = {
      userId: params.userId,
      userRole: params.userRole,
      resourceSensitivity: params.resourceSensitivity,
      isOfficeHours: this.isOfficeHours(),
      recordOwnerMatch:
        params.userId && params.userId === params.recordOwnerId ? 1 : 0,
      recentRequestCount,
      failedAttemptCount,
    };

    this.logger.debug(`Access context built: ${JSON.stringify(context)}`);
    return context;
  }

  /** Requests made by the user in the last 60 seconds (includes the current one, logged by the controller). */
  async getRecentRequestCount(userId: string): Promise<number> {
    return this.accessRepo
      .createQueryBuilder('r')
      .where('r.user_id = :userId', { userId })
      .andWhere(
        `r.created_at > NOW() - INTERVAL '${AccessContextBuilderService.REQUEST_WINDOW}'`,
      )
      .getCount();
  }

  /** Failed login attempts by the user in the last 24 hours. */
  async getFailedAttemptCount(userId: string): Promise<number> {
    return this.failedAttemptRepo
      .createQueryBuilder('f')
      .where('f.user_id = :userId', { userId })
      .andWhere(
        `f.created_at > NOW() - INTERVAL '${AccessContextBuilderService.FAILED_ATTEMPT_WINDOW}'`,
      )
      .getCount();
  }

  /** 1 if Mon–Fri between 09:00 and 17:00 (server local time), else 0 — matches dataset definition. */
  isOfficeHours(date: Date = new Date()): 0 | 1 {
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = date.getHours();
    const isWeekday = day >= 1 && day <= 5;
    const isWorkHour = hour >= 9 && hour < 17;
    return isWeekday && isWorkHour ? 1 : 0;
  }
}
