import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { type Env, validateEnv } from './config/env.schema';
import { HealthController } from './health/health.controller';
import { IdentityModule } from './modules/identity/identity.module';
import { ProjectModule } from './modules/project/project.module';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './shared/auth/jwt-auth.guard';
import { RolesGuard } from './shared/auth/roles.guard';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            cache: true,
            validate: validateEnv,
        }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
        EventEmitterModule.forRoot(),
        JwtModule.registerAsync({
            global: true,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
                secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
                signOptions: {
                    expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
                },
            }),
        }),
        PrismaModule,
        IdentityModule,
        ProjectModule,
    ],
    controllers: [HealthController],
    providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
    ],
})
export class AppModule {}
