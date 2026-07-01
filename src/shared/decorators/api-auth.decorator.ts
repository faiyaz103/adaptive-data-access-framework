import { AuthGuard } from "@core/guards/auth.guard";
import { RolesGuard } from "@core/guards/roles.guard";
import { applyDecorators, UseGuards } from "@nestjs/common";

export function ApiAuth(){
    return applyDecorators(
        UseGuards(AuthGuard, RolesGuard)
    )
}