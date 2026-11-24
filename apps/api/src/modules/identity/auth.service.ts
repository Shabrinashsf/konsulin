import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../../config/env.schema';
import type { UserRole } from '../../generated/prisma/client';
import { withDegree } from './degree';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenRepository } from './refresh-token.repository';
import { StudyProgramRepository } from './study-program.repository';
import { type ProfileRow, UserRepository } from './user.repository';
import { apiError } from '../../shared/http/errors';
import type { ProfileResponseDto } from './dto/identity-response.dto';

// change raw database response to a response form that can be send to client
const toProfile = ({ studyProgram, ...u }: ProfileRow): ProfileResponseDto => ({
    ...u,
    studyProgram: withDegree(studyProgram),
});

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export interface IssuedTokens {
    accessToken: string;
    refreshToken: string;
    refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly users: UserRepository,
        private readonly refreshTokens: RefreshTokenRepository,
        private readonly studyPrograms: StudyProgramRepository,
        private readonly jwt: JwtService,
        private readonly config: ConfigService<Env, true>,
    ) {}

    async register(dto: RegisterDto) {
        if (!(await this.studyPrograms.exists(dto.studyProgramId))) {
            throw apiError('STUDY_PROGRAM_NOT_FOUND');
        }

        const taken = await this.users.findByEmailOrNrp(dto.email, dto.nrp);
        if (taken) {
            throw apiError(
                taken.email === dto.email ? 'EMAIL_TAKEN' : 'NRP_TAKEN',
            );
        }

        const user = await this.users.createStudent({
            ...dto,
            password: await argon2.hash(dto.password),
        });
        return toProfile(user);
    }

    async login(dto: LoginDto): Promise<IssuedTokens> {
        const user = await this.users.findByEmailForLogin(dto.email);
        const valid =
            user !== null && (await argon2.verify(user.password, dto.password));
        if (!valid)
            throw new UnauthorizedException('Email atau password salah');
        return this.issueTokens(user);
    }

    async refresh(token: string | undefined): Promise<IssuedTokens> {
        if (!token) throw new UnauthorizedException();
        const row = await this.refreshTokens.findByHash(sha256(token));
        if (!row) throw new UnauthorizedException();
        if (row.revokedAt) return this.revokeAllAndReject(row.userId);
        if (row.expiresAt <= new Date() || row.user.deletedAt) {
            throw new UnauthorizedException();
        }

        if (!(await this.refreshTokens.claim(row.id))) {
            return this.revokeAllAndReject(row.userId);
        }
        return this.issueTokens(row.user);
    }

    async logout(token: string | undefined) {
        if (!token) return;
        await this.refreshTokens.revokeByHash(sha256(token));
    }

    async me(userId: string) {
        const user = await this.users.findProfile(userId);
        if (!user) throw new UnauthorizedException();
        return toProfile(user);
    }

    private async issueTokens(user: {
        id: string;
        role: UserRole;
    }): Promise<IssuedTokens> {
        const refreshToken = randomBytes(32).toString('base64url');
        const days = this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
        const refreshExpiresAt = new Date(Date.now() + days * 86_400_000);
        await this.refreshTokens.create(
            user.id,
            sha256(refreshToken),
            refreshExpiresAt,
        );
        const accessToken = await this.jwt.signAsync({
            sub: user.id,
            role: user.role,
        });
        return { accessToken, refreshToken, refreshExpiresAt };
    }

    private async revokeAllAndReject(userId: string): Promise<never> {
        await this.refreshTokens.revokeAllForUser(userId);
        throw new UnauthorizedException();
    }
}
