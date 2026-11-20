import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '../../generated/prisma/client';
import { type AuthRequest, IS_PUBLIC_KEY } from './auth.decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwt: JwtService,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(ctx: ExecutionContext) {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [ctx.getHandler(), ctx.getClass()],
        );
        if (isPublic) return true;

        const req = ctx.switchToHttp().getRequest<AuthRequest>();
        const [type, token] = req.headers.authorization?.split(' ') ?? [];
        if (type !== 'Bearer' || !token) throw new UnauthorizedException();
        try {
            const payload = await this.jwt.verifyAsync<{
                sub: string;
                role: UserRole;
            }>(token);
            req.user = { id: payload.sub, role: payload.role };
        } catch {
            throw new UnauthorizedException();
        }
        return true;
    }
}
