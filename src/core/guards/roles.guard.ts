// This is the bouncer for your routes. It looks at the route's
//  required roles (from the decorator) and compares them to the 
// user's role (from the JWT payload).
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { UserRole } from "@core/database/common/enums";
import { ROLES_KEY } from "@shared/decorators/roles.decorator";


@Injectable()
export class RolesGuard implements CanActivate{

    constructor(
        private reflector: Reflector
    ){};

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {

        // 1. Get the required roles for this specific route
        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass()
        ]);
        // 2. If the route doesn't have the @Roles() decorator, allow access
        if(!requiredRoles) return true;

        // 3. Get the user object that our AuthGuard attached to the request
        const {user} = context.switchToHttp().getRequest();

        // 4. Check if the user's role exists in the list of required roles
        // (We use user.role here based on our single-role database column)
        return requiredRoles.includes(user.role);
    }
}

