import { Module } from '@nestjs/common';
import { BankService } from './bank.service';
import { BankController } from './bank.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@core/database/entities/user.entity';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '@modules/auth/auth.module';
import { BankInfoEntity } from '@core/database/entities/bank-details.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            User,
            BankInfoEntity
        ]),
        AuthModule
    ],
    controllers: [BankController],
    providers: [BankService],
})
export class BankModule {}
