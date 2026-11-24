import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env.schema';
import { HttpExceptionFilter } from './shared/http/http-exception.filter';
import { ResponseInterceptor } from './shared/http/response.interceptor';

export function setupApp(app: INestApplication) {
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    app.setGlobalPrefix('api/v1');
    app.use(helmet());
    app.use(cookieParser());
    app.enableCors({
        origin: config.get('FRONTEND_ORIGIN', { infer: true }),
        credentials: true,
    });
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
}

export function setupSwagger(app: INestApplication) {
    SwaggerModule.setup('api/docs', app, createApiDocument(app), {
        useGlobalPrefix: false,
    });
}

export function createApiDocument(app: INestApplication) {
    return SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
            .setTitle('Konsulin API')
            .setVersion('1.0')
            .addBearerAuth()
            .addCookieAuth(
                'refresh_token',
                { type: 'apiKey', in: 'cookie' },
                'refresh_token',
            )
            .build(),
    );
}
