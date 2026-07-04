import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
    imports: [
        AuthModule
    ],
    controllers: [UserController],
    providers: [UserService],
})
export class UserModule {}
