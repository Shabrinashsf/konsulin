import {
    BadRequestException,
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../../config/env.schema';
import type { Prisma, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { withDegree } from './degree';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const PROFILE_SELECT = {
    id: true,
    name: true,
    email: true,
    role: true,
    nrp: true,
    cohortYear: true,
    studyProgram: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

const toProfile = ({ studyProgram, ...u }: ProfileRow) => ({
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
        private readonly prisma: PrismaService,
        private readonly jwt: JwtService,
        private readonly config: ConfigService<Env, true>,
    ) {}

    async register(dto: RegisterDto) {
        const program = await this.prisma.studyProgram.findUnique({
            where: { id: dto.studyProgramId },
        });
        if (!program) {
            throw new BadRequestException({
                message: 'Program studi tidak ditemukan',
                code: 'STUDY_PROGRAM_NOT_FOUND',
            });
        }

        const taken = await this.prisma.user.findFirst({
            where: {
                deletedAt: null,
                OR: [{ email: dto.email }, { nrp: dto.nrp }],
            },
            select: { email: true },
        });
        if (taken) {
            throw new ConflictException(
                taken.email === dto.email
                    ? { message: 'Email sudah terdaftar', code: 'EMAIL_TAKEN' }
                    : { message: 'NRP sudah terdaftar', code: 'NRP_TAKEN' },
            );
        }

        const user = await this.prisma.user.create({
            data: {
                ...dto,
                role: 'student',
                password: await argon2.hash(dto.password),
            },
            select: PROFILE_SELECT,
        });
        return toProfile(user);
    }

    async login(dto: LoginDto): Promise<IssuedTokens> {
        const user = await this.prisma.user.findFirst({
            where: { email: dto.email, deletedAt: null },
            select: { id: true, role: true, password: true },
        });
        const valid =
            user !== null && (await argon2.verify(user.password, dto.password));
        if (!valid)
            throw new UnauthorizedException('Email atau password salah');
        return this.issueTokens(user);
    }

    async refresh(token: string | undefined): Promise<IssuedTokens> {
        if (!token) throw new UnauthorizedException();
        const row = await this.prisma.refreshToken.findUnique({
            where: { tokenHash: sha256(token) },
            include: {
                user: { select: { id: true, role: true, deletedAt: true } },
            },
        });
        if (!row) throw new UnauthorizedException();
        if (row.revokedAt) return this.revokeAllAndReject(row.userId);
        if (row.expiresAt <= new Date() || row.user.deletedAt) {
            throw new UnauthorizedException();
        }

        const { count } = await this.prisma.refreshToken.updateMany({
            where: { id: row.id, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        if (count === 0) return this.revokeAllAndReject(row.userId);
        return this.issueTokens(row.user);
    }

    async logout(token: string | undefined) {
        if (!token) return;
        await this.prisma.refreshToken.updateMany({
            where: { tokenHash: sha256(token), revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    async me(userId: string) {
        const user = await this.prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: PROFILE_SELECT,
        });
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
        await this.prisma.refreshToken.create({
            data: {
                userId: user.id,
                tokenHash: sha256(refreshToken),
                expiresAt: refreshExpiresAt,
            },
        });
        const accessToken = await this.jwt.signAsync({
            sub: user.id,
            role: user.role,
        });
        return { accessToken, refreshToken, refreshExpiresAt };
    }

    private async revokeAllAndReject(userId: string): Promise<never> {
        await this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        throw new UnauthorizedException();
    }
}
