import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessRequestEntity } from '@core/database/entities/access-request.entity';
import { FailedAttemptEntity } from '@core/database/entities/failed-attempt.entity';
import { AccessContextBuilderService } from './adaptive-access/access-context-builder.service';
import { AdaptiveAleService } from './adaptive-access/adaptive-ale.service';

/**
 * Adaptive Security Module — hosts the ML-driven decryption control layer.
 * Import this module in any domain module that serves encrypted resources.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AccessRequestEntity, FailedAttemptEntity]),
  ],
  providers: [AccessContextBuilderService, AdaptiveAleService],
  exports: [AccessContextBuilderService, AdaptiveAleService],
})
export class SecurityModule {}
