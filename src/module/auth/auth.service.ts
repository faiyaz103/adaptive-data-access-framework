import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '@core/database/entities/user.entity';
import { Repository } from 'typeorm';
import { UserRole } from '@core/database/common/enums';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @InjectRepository(User) private readonly userRepo: Repository<User>
    ){}

    async create(dto: CreateAuthDto) {
        this.logger.log(`Received Sign Up Request for ${dto.email}`);

        // Validate password and confirm password
        if(dto.password !== dto.confirm_password){
            throw new BadRequestException(`Password do not match`);
        }

        // Hash Password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

        // Create and save user
        const createdUser = this.userRepo.create({
            email: dto.email,
            role: dto.role ?? UserRole.CUSTOMER,
            password: hashedPassword
        });

        await this.userRepo.save(createdUser);

        return {message: "Sign up successful"};
    }

    findAll() {
        return `This action returns all auth`;
    }

    findOne(id: number) {
        return `This action returns a #${id} auth`;
    }

    update(id: number, updateAuthDto: UpdateAuthDto) {
        return `This action updates a #${id} auth`;
    }

    remove(id: number) {
        return `This action removes a #${id} auth`;
    }
}
