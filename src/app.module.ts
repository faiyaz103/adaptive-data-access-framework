import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './core/core.module';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { BankModule } from './modules/bank/bank.module';

@Module({
  imports: [CoreModule, SharedModule, AuthModule, UserModule, BankModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
