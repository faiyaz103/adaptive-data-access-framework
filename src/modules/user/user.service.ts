import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthenticatedUser } from '@shared/interfaces/authenticated-user.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessContextBuilderService } from '@core/security/adaptive-access/access-context-builder.service';
import { AdaptiveAleService } from '@core/security/adaptive-access/adaptive-ale.service';
import { User } from '@core/database/entities/user.entity';

@Injectable()
export class UserService {
    constructor(
            @InjectRepository(User) private readonly userRepo: Repository<User>,
            private readonly contextBuilder: AccessContextBuilderService,
            private readonly adaptiveAle: AdaptiveAleService,
        ){}

  create(createUserDto: CreateUserDto) {
    return 'This action adds a new user';
  }

  findAll() {
    return `This action returns all user`;
  }

  async findOne(user: AuthenticatedUser) {
  
          // 1. Fetch ciphertext entity — no plaintext in RAM yet
          const userInfo = await this.userRepo.findOne({
              where: { id: user.id }
          });
          if(!userInfo) throw new NotFoundException('Account information does not exist');
  
          // 2. Extract features for this request
        //   const context = await this.contextBuilder.buildContext({
        //       userId: user.id,
        //       userRole: user.role,
        //       recordOwnerId: user.id,
        //       resourceSensitivity: 'LOW', // bank details are HIGH by definition (static classification)
        //   });
  
          // 3 + 4. Risk scoring and adaptive decryption control
        //   return this.adaptiveAle.executeAdaptiveAccess(context, userInfo);
        return {email: user.email};
      }

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
