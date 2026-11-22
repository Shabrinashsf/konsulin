import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// stores only the token hash, never the raw token
@Injectable()
export class RefreshTokenRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(userId: string, tokenHash: string, expiresAt: Date) {
        await this.prisma.refreshToken.create({
            data: { userId, tokenHash, expiresAt },
        });
    }

    findByHash(tokenHash: string) {
        return this.prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: {
                user: { select: { id: true, role: true, deletedAt: true } },
            },
        });
    }

    // atomic claim for rotation; false if another request revoked it first
    async claim(id: string) {
        const { count } = await this.prisma.refreshToken.updateMany({
            where: { id, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        return count > 0;
    }

    async revokeByHash(tokenHash: string) {
        await this.prisma.refreshToken.updateMany({
            where: { tokenHash, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    async revokeAllForUser(userId: string) {
        await this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }
}
