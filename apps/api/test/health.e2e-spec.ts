import { Controller, Get, INestApplication, Query } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Public } from '../src/shared/auth/auth.decorators';
import { PaginationQueryDto } from '../src/shared/http/pagination-query.dto';
import { createTestApp } from './utils/create-test-app';

// Controller for test to make sure the global ValidationPipe is active.
@Public()
@Controller('test-validation')
class ValidationProbeController {
    @Get()
    list(@Query() q: PaginationQueryDto) {
        return { page: q.page, limit: q.limit };
    }
}

describe('Health & fondasi API (e2e)', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
        app = await createTestApp([ValidationProbeController]);
    });

    afterAll(async () => {
        await app.close();
    });

    it('GET /api/v1/health → 200 dengan format respons standar', async () => {
        const res = await request(app.getHttpServer())
            .get('/api/v1/health')
            .expect(200);

        const body = res.body as {
            data: {
                status: string;
                timezone: string;
                time: string;
                local: { date: string; time: string };
            };
        };
        expect(body.data.status).toBe('ok');
        expect(body.data.timezone).toBe('Asia/Jakarta');
        expect(new Date(body.data.time).toISOString()).toBe(body.data.time);
        expect(body.data.local.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(body.data.local.time).toMatch(/^\d{2}:\d{2}$/);
    });

    it('route tanpa prefix /api/v1 → 404 dengan format error standar', async () => {
        const res = await request(app.getHttpServer())
            .get('/health')
            .expect(404);

        expect(res.body).toMatchObject({
            statusCode: 404,
            error: 'Not Found',
        });
    });

    it('query dengan field tak dikenal → 400', async () => {
        const res = await request(app.getHttpServer())
            .get('/api/v1/test-validation?foo=bar')
            .expect(400);

        expect(res.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });

    it('limit > 100 → 400, query valid ditransformasi ke number', async () => {
        await request(app.getHttpServer())
            .get('/api/v1/test-validation?limit=101')
            .expect(400);

        const res = await request(app.getHttpServer())
            .get('/api/v1/test-validation?page=2&limit=20')
            .expect(200);
        expect(res.body).toEqual({ data: { page: 2, limit: 20 } });
    });

    it('Swagger tersedia di /api/docs', async () => {
        await request(app.getHttpServer()).get('/api/docs').expect(200);
        const res = await request(app.getHttpServer())
            .get('/api/docs-json')
            .expect(200);
        const doc = res.body as {
            paths: Record<string, unknown>;
            components: { securitySchemes: Record<string, unknown> };
        };
        expect(doc.paths).toHaveProperty(['/api/v1/health']);
        expect(doc.components.securitySchemes).toHaveProperty('bearer');
    });

    it('error bodies without a code match the Swagger examples', async () => {
        const docRes = await request(app.getHttpServer()).get('/api/docs-json');
        type Examples = Record<string, { value: Record<string, unknown> }>;
        const paths = (
            docRes.body as {
                paths: Record<
                    string,
                    Record<
                        string,
                        {
                            responses: Record<
                                string,
                                {
                                    content: {
                                        'application/json': {
                                            examples: Examples;
                                        };
                                    };
                                }
                            >;
                        }
                    >
                >;
            }
        ).paths;
        const example = (path: string, method: string, status: number) =>
            paths[path][method].responses[status].content['application/json']
                .examples;

        // 401: no token
        const me = await request(app.getHttpServer()).get('/api/v1/auth/me');
        expect(me.body).toEqual(
            example('/api/v1/auth/me', 'get', 401).UNAUTHORIZED.value,
        );

        // 403: a student on a lecturer endpoint (the role guard needs no DB)
        const token = await app.get(JwtService).signAsync({
            sub: '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c',
            role: 'student',
        });
        const role = await request(app.getHttpServer())
            .get('/api/v1/monitoring/students')
            .auth(token, { type: 'bearer' });
        expect(role.body).toEqual(
            example('/api/v1/monitoring/students', 'get', 403).ROLE.value,
        );

        // 400: validation messages are a list, without a code
        const register = example('/api/v1/auth/register', 'post', 400);
        const bad = await request(app.getHttpServer())
            .post('/api/v1/auth/register')
            .send({});
        expect(Object.keys(bad.body as object).sort()).toEqual(
            Object.keys(register.VALIDATION.value).sort(),
        );
        expect((bad.body as { message: unknown }).message).toEqual(
            expect.any(Array),
        );

        // 429: the 6th register in a minute
        let limited = bad;
        for (let i = 0; i < 5; i++) {
            limited = await request(app.getHttpServer())
                .post('/api/v1/auth/register')
                .send({});
        }
        expect(limited.body).toEqual(
            example('/api/v1/auth/register', 'post', 429).RATE_LIMIT.value,
        );
    });
});
