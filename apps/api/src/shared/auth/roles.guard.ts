import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../generated/prisma/client';
import { type AuthRequest, ROLES_KEY } from './auth.decorators';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(ctx: ExecutionContext) {
        const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
            ROLES_KEY,
            [ctx.getHandler(), ctx.getClass()],
        );
        if (!roles) return true;
        const { user } = ctx.switchToHttp().getRequest<AuthRequest>();
        return !!user && roles.includes(user.role);
    }
}
