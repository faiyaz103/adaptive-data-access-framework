import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { BankService } from './bank.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { AuthenticatedUser } from '@shared/interfaces/authenticated-user.interface';
import { ApiAuth } from '@shared/decorators/api-auth.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import { UserRole } from '@core/database/common/enums';
import { UtilitiesService } from '@modules/utilities/utilities.service';

@Controller('bank')
export class BankController {
  constructor(
    private readonly bankService: BankService,
    private readonly utilityService: UtilitiesService
  ) {}

  @ApiAuth()
  @Roles(UserRole.CUSTOMER)
  @Post('details')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBankDto) {
    await this.utilityService.createAccessLog(user.id);
    return this.bankService.create(user.id, dto);
  }

  @ApiAuth()
  @Roles(UserRole.CUSTOMER)
  @Get('details')
  async findOne(@CurrentUser() user: AuthenticatedUser) {
    await this.utilityService.createAccessLog(user.id);
    return this.bankService.findOne(user.id);
  }


}
