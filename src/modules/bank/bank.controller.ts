import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { BankService } from './bank.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { AuthenticatedUser } from '@shared/interfaces/authenticated-user.interface';
import { ApiAuth } from '@shared/decorators/api-auth.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import { UserRole } from '@core/database/common/enums';

@Controller('bank')
export class BankController {
  constructor(private readonly bankService: BankService) {}
  
  @ApiAuth()
  @Roles(UserRole.CUSTOMER)
  @Post('details')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBankDto) {
    return this.bankService.create(user.id, dto);
  }
  
  @ApiAuth()
  @Roles(UserRole.CUSTOMER)
  @Get('details')
  findOne(@CurrentUser() user: AuthenticatedUser) {
    return this.bankService.findOne(user.id);
  }


}
