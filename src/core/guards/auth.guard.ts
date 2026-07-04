
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
    private readonly logger = new Logger(AuthGuard.name);

  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // console.debug(`context:`, inspect(context, { depth: 1, colors: true }));
    const request = context.switchToHttp().getRequest();

    // console.debug(`request:`, inspect(request, { depth: 1, colors: true }));
    const token = this.extractTokenFromHeader(request);

    // this.logger.debug(`token: ${JSON.stringify(token)}`);

    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      // 💡 Here the JWT secret key that's used for verifying the payload 
      // is the key that was passsed in the JwtModule
    //   const payload = await this.jwtService.verifyAsync(token, {secret: process.env.JWT_ACCESS_SECRET});
      const payload = await this.jwtService.verifyAsync(token);
    //   this.logger.debug(`payload: ${JSON.stringify(payload)}`);
      // 💡 We're assigning the payload to the request object here
      // so that we can access it in our route handlers
      request['user'] = payload;

    //   console.debug(`request after verifyAsync:`, inspect(request, { depth: 1, colors: true }));
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
