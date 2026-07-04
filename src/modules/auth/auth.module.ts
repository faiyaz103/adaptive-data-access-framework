import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@core/database/entities/user.entity';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            User
        ]),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_ACCESS_SECRET') || 'your-secret-key',
                signOptions: { expiresIn: configService.get<number>('JWT_ACCESS_EXPIRES_IN')}
            })
        }) 
    ],
    controllers: [AuthController],
    providers: [AuthService],
    exports: [
        AuthService,
        JwtModule
    ]
})
export class AuthModule {}
