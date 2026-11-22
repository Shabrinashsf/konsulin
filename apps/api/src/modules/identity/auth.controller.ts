import {
    Body,
    Controller,
    Get,
    HttpCode,
    Post,
    Req,
    Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
    type AuthUser,
    CurrentUser,
    Public,
} from '../../shared/auth/auth.decorators';
import { AuthService, type IssuedTokens } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_OPTIONS: CookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/api/v1/auth',
};
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

const refreshCookie = (req: Request) =>
    (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly auth: AuthService) {}

    // -- POST /auth/register
    @Public()
    @Throttle(AUTH_THROTTLE)
    @Post('register')
    register(@Body() dto: RegisterDto) {
        return this.auth.register(dto);
    }

    // -- POST /auth/login
    @Public()
    @Throttle(AUTH_THROTTLE)
    @Post('login')
    @HttpCode(200)
    async login(
        @Body() dto: LoginDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        return this.sendTokens(res, await this.auth.login(dto));
    }

    // -- POST /auth/refresh
    @Public()
    @Post('refresh')
    @HttpCode(200)
    async refresh(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        return this.sendTokens(
            res,
            await this.auth.refresh(refreshCookie(req)),
        );
    }

    // -- POST /auth/logout
    @ApiBearerAuth()
    @Post('logout')
    @HttpCode(204)
    async logout(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        await this.auth.logout(refreshCookie(req));
        res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
    }

    // -- GET /auth/me
    @ApiBearerAuth()
    @Get('me')
    me(@CurrentUser() user: AuthUser) {
        return this.auth.me(user.id);
    }

    private sendTokens(res: Response, tokens: IssuedTokens) {
        res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
            ...REFRESH_COOKIE_OPTIONS,
            expires: tokens.refreshExpiresAt,
        });
        return { accessToken: tokens.accessToken };
    }
}
