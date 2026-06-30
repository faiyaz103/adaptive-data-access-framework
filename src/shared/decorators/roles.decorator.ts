import { SetMetadata } from "@nestjs/common";
import { UserRole } from "@core/database/common/enums";

export const ROLES_KEY = 'roles';

// This decorator takes in a list of roles and attaches them as metadata to the route
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);