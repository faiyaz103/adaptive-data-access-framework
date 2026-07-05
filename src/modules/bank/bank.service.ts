import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@core/database/entities/user.entity';
import { BankInfoEntity } from '@core/database/entities/bank-details.entity';
import { AccessContextBuilderService } from '@core/security/adaptive-access/access-context-builder.service';
import { AdaptiveAleService } from '@core/security/adaptive-access/adaptive-ale.service';
import { AuthenticatedUser } from '@shared/interfaces/authenticated-user.interface';

@Injectable()
export class BankService {
    private readonly logger = new Logger(BankService.name);

    constructor(
        @InjectRepository(User) private readonly userRepo: Repository<User>,
        @InjectRepository(BankInfoEntity) private readonly bankRepo: Repository<BankInfoEntity>,
        private readonly contextBuilder: AccessContextBuilderService,
        private readonly adaptiveAle: AdaptiveAleService,
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
            userId: user.id,
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

    /**
     * Adaptive data access pipeline (thesis core):
     * 1. Fetch entity — arrives as CIPHERTEXT (late-binding EncryptionTransformer).
     * 2. Build runtime access context (behavioral features).
     * 3. Score risk with the transpiled Random Forest.
     * 4. Full decrypt / partial mask / deny based on risk level.
     */
    async findOne(user: AuthenticatedUser) {

        // 1. Fetch ciphertext entity — no plaintext in RAM yet
        const bankAccountInfo = await this.bankRepo.findOne({
            where: { userId: user.id }
        });
        if(!bankAccountInfo) throw new NotFoundException('Account information does not exist');

        // 2. Extract features for this request
        const context = await this.contextBuilder.buildContext({
            userId: user.id,
            userRole: user.role,
            recordOwnerId: bankAccountInfo.userId,
            resourceSensitivity: 'HIGH', // bank details are HIGH by definition (static classification)
        });

        // 3 + 4. Risk scoring and adaptive decryption control
        return this.adaptiveAle.executeAdaptiveAccess(context, bankAccountInfo);
    }
}
