import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { STATUS_CODES } from 'node:http';
import { ErrorResponseDto, PageMetaDto } from './common-response.dto';
import { ERRORS, type ErrorCode } from './errors';

// Swagger decorators for the response envelope and the error catalogue.
// Names end in "Response" so the Swagger CLI plugin treats them as the
// explicit success response instead of guessing one from the return type.

const ref = (model: Type) => ({ $ref: getSchemaPath(model) });

/** `{ data: Model }`, `{ data: Model[] }` with `[Model]`, or `{ data: null }` with `null`. */
export function ApiDataResponse(
    model: Type | [Type] | null,
    status: 200 | 201 = 200,
    description?: string,
) {
    const one = Array.isArray(model) ? model[0] : model;
    const data = !one
        ? { type: 'object', nullable: true, example: null }
        : Array.isArray(model)
          ? { type: 'array', items: ref(one) }
          : ref(one);
    return applyDecorators(
        ...(one ? [ApiExtraModels(one)] : []),
        ApiResponse({
            status,
            description,
            schema: {
                type: 'object',
                required: ['data'],
                properties: { data },
            },
        }),
    );
}

/** `{ data: Model[], meta: PageMeta }` */
export function ApiPageResponse(model: Type, description?: string) {
    return applyDecorators(
        ApiExtraModels(model, PageMetaDto),
        ApiResponse({
            status: 200,
            description,
            schema: {
                type: 'object',
                required: ['data', 'meta'],
                properties: {
                    data: { type: 'array', items: ref(model) },
                    meta: ref(PageMetaDto),
                },
            },
        }),
    );
}

// errors that carry no `code`, with the body the API really sends
const GENERIC = {
    VALIDATION: [
        400,
        'Request validation failed (body, query or path parameter).',
        ['title must be longer than or equal to 3 characters'],
    ],
    UNAUTHORIZED: [
        401,
        'Missing, invalid or expired access token.',
        'Unauthorized',
    ],
    BAD_CREDENTIALS: [
        401,
        'Wrong email or password, or the account was deleted (same message for both).',
        'Email atau password salah',
    ],
    INVALID_REFRESH: [
        401,
        'Missing, unknown, expired or already used refresh-token cookie. Reusing a rotated token revokes every session of the user.',
        'Unauthorized',
    ],
    ROLE: [403, 'The endpoint is not for this role.', 'Forbidden resource'],
    TOO_LARGE: [
        413,
        'The file is larger than MAX_UPLOAD_MB.',
        'File too large',
    ],
    RATE_LIMIT: [
        429,
        'Too many requests from this IP.',
        'ThrottlerException: Too Many Requests',
    ],
} as const;

type GenericError = keyof typeof GENERIC;
type Example = { summary: string; value: object };

const body = (status: number, message: unknown, code?: string) => ({
    statusCode: status,
    error: STATUS_CODES[status],
    message,
    ...(code ? { code } : {}),
});

/**
 * Error responses of an endpoint, grouped by status, each with an example
 * body. Codes come from ERRORS; GENERIC names cover errors without a code.
 * `[code, message]` documents a code sent with a more specific message.
 */
export function ApiErrors(
    ...errors: (ErrorCode | GenericError | [ErrorCode, string])[]
) {
    const byStatus = new Map<
        number,
        { lines: string[]; examples: Record<string, Example> }
    >();
    for (const entry of errors) {
        const [name, override] = Array.isArray(entry) ? entry : [entry];
        const generic = name in GENERIC;
        const [status, text, message] = generic
            ? GENERIC[name as GenericError]
            : [
                  ERRORS[name as ErrorCode][0],
                  override ?? ERRORS[name as ErrorCode][1],
                  undefined,
              ];
        const group = byStatus.get(status) ?? { lines: [], examples: {} };
        byStatus.set(status, group);
        group.lines.push(generic ? text : `\`${name}\` — ${text}`);
        group.examples[name] = {
            summary: generic ? text : name,
            value: generic ? body(status, message) : body(status, text, name),
        };
    }
    return applyDecorators(
        ApiExtraModels(ErrorResponseDto),
        ...[...byStatus].map(([status, g]) =>
            ApiResponse({
                status,
                description: g.lines.join('<br>'),
                content: {
                    'application/json': {
                        schema: ref(ErrorResponseDto),
                        examples: g.examples,
                    },
                },
            }),
        ),
    );
}
