import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '@modules/auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilitiesModule } from '@modules/utilities/utilities.module';
import { SecurityModule } from '@core/security/security.module';
import { User } from '@core/database/entities/user.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            User
        ]),
        AuthModule,
        UtilitiesModule,
        SecurityModule
    ],
    controllers: [UserController],
    providers: [UserService],
})
export class UserModule {}
