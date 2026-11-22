import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Env } from '../../config/env.schema';
import { AuthService } from './auth.service';
import type { RefreshTokenRepository } from './refresh-token.repository';
import type { StudyProgramRepository } from './study-program.repository';
import type { UserRepository } from './user.repository';

describe('AuthService.refresh', () => {
    it('kalah balapan klaim token → semua sesi dicabut & 401', async () => {
        const refreshTokens = {
            findByHash: jest.fn().mockResolvedValue({
                id: 'rt-1',
                userId: 'u-1',
                revokedAt: null,
                expiresAt: new Date(Date.now() + 60_000),
                user: { id: 'u-1', role: 'student', deletedAt: null },
            }),
            claim: jest.fn().mockResolvedValue(false),
            revokeAllForUser: jest.fn().mockResolvedValue(undefined),
        };
        const auth = new AuthService(
            {} as UserRepository,
            refreshTokens as unknown as RefreshTokenRepository,
            {} as StudyProgramRepository,
            {} as JwtService,
            {} as ConfigService<Env, true>,
        );

        await expect(auth.refresh('token')).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
        expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u-1');
    });
});
