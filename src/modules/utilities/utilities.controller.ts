import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { UtilitiesService } from './utilities.service';
import { CreateUtilityDto } from './dto/create-utility.dto';
import { UpdateUtilityDto } from './dto/update-utility.dto';

@Controller('utilities')
export class UtilitiesController {
  constructor(private readonly utilitiesService: UtilitiesService) {}

  @Get()
  findAll() {
    return this.utilitiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.utilitiesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUtilityDto: UpdateUtilityDto) {
    return this.utilitiesService.update(+id, updateUtilityDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.utilitiesService.remove(+id);
  }
}
