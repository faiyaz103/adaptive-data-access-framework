import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '@core/database/entities/user.entity';
import { Repository } from 'typeorm';
import { UserRole } from '@core/database/common/enums';
import { JwtService } from '@nestjs/jwt';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @InjectRepository(User) private readonly userRepo: Repository<User>,
        private readonly jwtService: JwtService
    ){}

    // sign up
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

    // generate tokens
    async generateTokens(id: string, email: string, role: UserRole){
        // 3. Generate Tokens
        const payload = { sub: id, email, role, jti: crypto.randomUUID() };
        
        const [accessToken, refreshToken] = await Promise.all([
            // Access Token: Short lived (e.g., 15 minutes)
            this.jwtService.signAsync(payload, {
                secret: process.env.JWT_ACCESS_SECRET,
                expiresIn: process.env.JWT_ACCESS_EXPIRES_IN as any,
            }),
            // Refresh Token: Long lived (e.g., 7 days)
            this.jwtService.signAsync(payload, {
                secret: process.env.JWT_REFRESH_SECRET,
                expiresIn: process.env.JWT_REFRESH_EXPIRES_IN as any,
            }),
        ]);

        // 4. Hash the refresh token before saving (CRITICAL BEST PRACTICE)
        // We use a lower salt round (e.g., 10) for refresh tokens since they are highly random strings 
        // and not vulnerable to dictionary attacks like passwords are.
        const tokenToHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const hashedRefreshToken = await bcrypt.hash(tokenToHash, 10);
        // 5. Update user record with the hashed refresh token
        await this.userRepo.update(id, {
            refresh_token: hashedRefreshToken,
        });
        // 6. Return tokens
        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            // You can also return non-sensitive user data here if your frontend needs it
        };
    }

    // rotate tokens
    async rotatetokens(dto: RefreshTokenDto){

        const payload = await this.jwtService.verifyAsync(dto.refresh_token, {
            secret: process.env.JWT_REFRESH_SECRET,
        });

        this.logger.debug(payload);

        const user = await this.userRepo.findOne({
            where: { id: payload.sub },
            select: ['id', 'email', 'role', 'refresh_token'], 
        });

        if (!user || !user.refresh_token) {
            throw new UnauthorizedException('Access denied');
        }

        const tokenToCompare = crypto.createHash('sha256').update(dto.refresh_token).digest('hex');
        const isTokenValid = await bcrypt.compare(tokenToCompare, user.refresh_token);

        if (!isTokenValid) {
            // TOKEN REUSE / THEFT DETECTED
            // The token is cryptographically valid (signed by us), but it DOES NOT match the DB.
            // This usually means a hacker stole an old refresh token and is trying to use it.
            // Industry Standard Response: Nuke the session immediately to protect the user.
            await this.userRepo.update(user.id, { refresh_token: null });
            throw new UnauthorizedException('Security alert: Invalid token reuse. Session revoked.');
        }

        return await this.generateTokens(user.id, user.email, user.role);
    }

    async signIn(dto: SignInDto) {
        this.logger.log(`Received Sign In Request for ${dto.email}`);
        // 1. Find user by email (ensure password is included for verification)
        const user = await this.userRepo.findOne({
            where: { email: dto.email },
            select: ['id', 'email', 'password', 'role'], // Explicitly select password since it's { select: false }
        });
        if (!user) {
            // Use generic error messages to prevent email enumeration attacks
            throw new ForbiddenException('User not found');
        }

        // 2. Verify password
        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            throw new ForbiddenException('Invalid credentials');
        }

        return await this.generateTokens(user.id, user.email, user.role);
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
