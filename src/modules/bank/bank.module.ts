import { Module } from '@nestjs/common';
import { BankService } from './bank.service';
import { BankController } from './bank.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@core/database/entities/user.entity';
import { Bank } from './entities/bank.entity';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            User,
            Bank
        ]),
        AuthModule
    ],
    controllers: [BankController],
    providers: [BankService],
})
export class BankModule {}
