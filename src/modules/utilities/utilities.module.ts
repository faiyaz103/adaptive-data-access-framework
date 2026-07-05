import { Module } from '@nestjs/common';
import { UtilitiesService } from './utilities.service';
import { UtilitiesController } from './utilities.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@core/database/entities/user.entity';
import { AccessRequestEntity } from '@core/database/entities/access-request.entity';
import { FailedAttemptEntity } from '@core/database/entities/failed-attempt.entity';

@Module({
    imports:[
        TypeOrmModule.forFeature([
            User,
            AccessRequestEntity,
            FailedAttemptEntity
        ])
    ],
    controllers: [UtilitiesController],
    providers: [UtilitiesService],
    exports: [UtilitiesService]
})
export class UtilitiesModule {}
