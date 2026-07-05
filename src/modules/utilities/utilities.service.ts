import { Injectable, Logger } from '@nestjs/common';
import { CreateUtilityDto } from './dto/create-utility.dto';
import { UpdateUtilityDto } from './dto/update-utility.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessRequestEntity } from '@core/database/entities/access-request.entity';

@Injectable()
export class UtilitiesService {
    private readonly logger = new Logger(UtilitiesService.name);

    constructor(
        @InjectRepository(AccessRequestEntity) private readonly accessRepo: Repository<AccessRequestEntity>
    ){}

    async createAccessLog(id: string) {
        try {
            const accessLog = this.accessRepo.create({userId: id});
            await this.accessRepo.save(accessLog);
        } catch (error) {
            // An audit-log failure must never take down the actual data request.
            this.logger.error(
                `Failed to log access request for user ${id}: ${(error as Error).message}`,
            );
        }
    }

    findAll() {
        return `This action returns all utilities`;
    }

    findOne(id: number) {
        return `This action returns a #${id} utility`;
    }

    update(id: number, updateUtilityDto: UpdateUtilityDto) {
        return `This action updates a #${id} utility`;
    }

    remove(id: number) {
        return `This action removes a #${id} utility`;
    }
}
