import {
    createParamDecorator,
    ExecutionContext,
    SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../../generated/prisma/client';

export interface AuthUser {
    id: string;
    role: UserRole;
}

export type AuthRequest = Request & { user?: AuthUser };

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

// disable JwtAuthGuard (public endpoint)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// limit endpoint to a specific role (check by RolesGuard)
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// retrieve currently logged in user data, so the controller know who is calling the endpoint
export const CurrentUser = createParamDecorator(
    (_: unknown, ctx: ExecutionContext) =>
        ctx.switchToHttp().getRequest<AuthRequest>().user,
);
