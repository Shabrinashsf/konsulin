import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { ERRORS } from '../src/shared/http/errors';
import { createApiDocument, setupApp } from '../src/setup-app';

// every endpoint documents its success response (inside the
// { data } envelope), its errors with example bodies.
// Built like `nest build` (swagger plugin via test/swagger-plugin.js); no DB.

type Schema = {
    $ref?: string;
    type?: string;
    properties?: Record<string, Schema>;
    items?: Schema;
    enum?: unknown[];
    example?: unknown;
    allOf?: Schema[];
};
type Media = { schema?: Schema; examples?: Record<string, { value: object }> };
type Res = { description?: string; content?: Record<string, Media> };
type Op = {
    security?: Record<string, string[]>[];
    responses: Record<string, Res>;
};

const PUBLIC = [
    'GET /api/v1/health',
    'GET /api/v1/study-programs',
    'POST /api/v1/auth/register',
    'POST /api/v1/auth/login',
    'POST /api/v1/auth/refresh',
];

describe('OpenAPI document (e2e)', () => {
    let app: INestApplication;
    let doc: OpenAPIObject;
    let ops: [string, Op][];

    const schema = (ref: string) =>
        doc.components!.schemas![ref.split('/').pop()!] as Schema;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleRef.createNestApplication();
        setupApp(app);
        doc = createApiDocument(app);
        ops = Object.entries(doc.paths).flatMap(([path, item]) =>
            Object.entries(item as Record<string, Op>).map(
                ([method, op]) =>
                    [`${method.toUpperCase()} ${path}`, op] as [string, Op],
            ),
        );
    });

    afterAll(async () => {
        await app.close();
    });

    it('lists the 52 endpoints plus the health check', () => {
        expect(ops).toHaveLength(53);
    });

    it('documents one success response per endpoint, wrapped in { data }', () => {
        for (const [key, op] of ops) {
            const ok = Object.keys(op.responses).filter((s) => +s < 400);
            expect([key, ok.length]).toEqual([key, 1]);
            const [status] = ok;
            const res = op.responses[status];
            if (status === '204') continue;
            if (key === 'GET /api/v1/versions/{versionId}/download') {
                expect(Object.keys(res.content!)).toContain('application/pdf');
                continue;
            }
            const body = res.content!['application/json'].schema!;
            expect([key, Object.keys(body.properties ?? {})]).toEqual([
                key,
                expect.arrayContaining(['data']),
            ]);
        }
    });

    it('references response models that exist and carry examples', () => {
        const refs = new Set<string>();
        const walk = (s: Schema | undefined) => {
            if (!s) return;
            if (s.$ref) refs.add(s.$ref);
            Object.values(s.properties ?? {}).forEach(walk);
            walk(s.items);
            s.allOf?.forEach(walk);
        };
        for (const [, op] of ops)
            for (const res of Object.values(op.responses))
                walk(res.content?.['application/json']?.schema);

        expect(refs.size).toBeGreaterThan(15);
        for (const ref of refs) {
            const model = schema(ref);
            expect([ref, model]).toEqual([ref, expect.anything()]);
        }
        // the plugin read the JSDoc examples and the explicit enums
        const consultation = schema('ConsultationResponseDto');
        expect(consultation.properties!.topic.example).toBe(
            'Bab 1 Pendahuluan',
        );
        expect(consultation.properties!.status.enum).toContain('expired');
        expect(consultation.properties!.project.$ref).toMatch(
            /ConsultationProjectDto$/,
        );
    });

    it('marks every non-public endpoint as needing a bearer token, with a 401', () => {
        for (const [key, op] of ops) {
            if (PUBLIC.includes(key)) continue;
            expect([key, op.security]).toEqual([
                key,
                expect.arrayContaining([{ bearer: [] }]),
            ]);
            expect([key, op.responses['401']]).toEqual([
                key,
                expect.anything(),
            ]);
        }
    });

    it('gives every error response an example body with the real message', () => {
        const codes = new Set<string>();
        for (const [key, op] of ops) {
            const errors = Object.entries(op.responses).filter(
                ([s]) => +s >= 400,
            );
            // the health check cannot fail with a client error
            if (key !== 'GET /api/v1/health')
                expect([key, errors.length > 0]).toEqual([key, true]);
            for (const [status, res] of errors) {
                const media = res.content!['application/json'];
                expect(media.schema!.$ref).toMatch(/ErrorResponseDto$/);
                for (const [name, { value }] of Object.entries(
                    media.examples!,
                )) {
                    expect(value).toMatchObject({ statusCode: +status });
                    if (name in ERRORS) {
                        codes.add(name);
                        expect(value).toMatchObject({ code: name });
                    }
                }
            }
        }
        // every registered code is documented on at least one endpoint
        expect([...codes].sort()).toEqual(Object.keys(ERRORS).sort());
    });

    it('documents the refresh cookie', () => {
        expect(doc.components!.securitySchemes).toMatchObject({
            bearer: { type: 'http', scheme: 'bearer' },
            refresh_token: { type: 'apiKey', in: 'cookie' },
        });
    });
});
