import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@core/database/entities/user.entity';
import { BankInfoEntity } from '@core/database/entities/bank-details.entity';

@Injectable()
export class BankService {
    private readonly logger = new Logger(BankService.name);

    constructor(
        @InjectRepository(User) private readonly userRepo: Repository<User>,
        @InjectRepository(BankInfoEntity) private readonly bankRepo: Repository<BankInfoEntity>,
    ){}

    private getAccountLastFour(accountNumber: string): string {
        if (!accountNumber || accountNumber.length < 4) {
            throw new BadRequestException(
                'Account number must contain at least 4 characters',
            );
        }
    
        return accountNumber.slice(-4);
    }

    async create(id: string, dto: CreateBankDto) {

        const user = await this.userRepo.findOne({
            where: { id},
        });
    
        if (!user) {
            throw new NotFoundException('User not found');
        }
    
        const accountLastFour = this.getAccountLastFour(dto.accountNumberEnc);
    
        const bankInfo = this.bankRepo.create({
            user: {id},
            branchName: dto.branchName,
            accountType: dto.accountType,
            accountHolderNameEnc: dto.accountHolderNameEnc,
            accountNumberEnc: dto.accountNumberEnc,
            accountLastFour,
            routingNumberEnc: dto.routingNumberEnc,
            swiftCodeEnc: dto.swiftCodeEnc,
            ibanEnc: dto.ibanEnc,
            identityNumberEnc: dto.identityNumberEnc,
            status: dto.status,
        });
    
        await this.bankRepo.save(bankInfo);

        return {message: "Account Information successfully Added"}; 
    }

    async findOne(id: string) {

        const bankAccountInfo = await this.bankRepo.findOne({
            where: {user: {id}}
        });
        if(!bankAccountInfo) throw new NotFoundException('Account information does not exist');

        return bankAccountInfo;
    }
}
