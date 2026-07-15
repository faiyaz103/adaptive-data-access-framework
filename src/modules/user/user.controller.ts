import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiAuth } from '@shared/decorators/api-auth.decorator';
import { Roles } from '@shared/decorators/roles.decorator';
import { UserRole } from '@core/database/common/enums';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { AuthenticatedUser } from '@shared/interfaces/authenticated-user.interface';
import { UtilitiesService } from '@modules/utilities/utilities.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService, private readonly utilityService: UtilitiesService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @ApiAuth()
  @Roles(UserRole.CUSTOMER)
  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @ApiAuth()
    @Roles(UserRole.CUSTOMER)
    @Get('details')
    async findOne(@CurrentUser() user: AuthenticatedUser) {
        // Log BEFORE the service call so the current request is included
        // in its own recent_request_count feature.
        // await this.utilityService.createAccessLog(user.id);
        return this.userService.findOne(user);
    }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(+id);
  }
}
