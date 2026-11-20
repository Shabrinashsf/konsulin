import { z } from 'zod';

const opt = z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const envSchema = z
    .object({
        NODE_ENV: z
            .enum(['development', 'test', 'production'])
            .default('development'),
        PORT: z.coerce.number().int().min(1).max(65535).default(3000),
        FRONTEND_ORIGIN: z.url().default('http://localhost:5173'),
        DATABASE_URL: z.url(),
        JWT_ACCESS_SECRET: opt,
        JWT_REFRESH_SECRET: opt,
        JWT_ACCESS_TTL: z.string().default('15m'),
        JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
        SMTP_HOST: z.string().default('smtp.gmail.com'),
        SMTP_PORT: z.coerce.number().int().default(465),
        SMTP_USER: opt,
        SMTP_PASS: opt,
        MAIL_FROM: opt,
        STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
        UPLOAD_DIR: z.string().default('./uploads'),
        UPLOAD_TMP_DIR: z.string().default('./uploads/tmp'),
        MAX_UPLOAD_MB: z.coerce.number().positive().default(50),
        R2_ACCOUNT_ID: opt,
        R2_ACCESS_KEY_ID: opt,
        R2_SECRET_ACCESS_KEY: opt,
        R2_BUCKET: opt,
        SEED_LECTURER_PASSWORD: opt,
    })
    .superRefine((env, ctx) => {
        if (env.STORAGE_DRIVER === 'r2') {
            for (const k of [
                'R2_ACCOUNT_ID',
                'R2_ACCESS_KEY_ID',
                'R2_SECRET_ACCESS_KEY',
                'R2_BUCKET',
            ] as const) {
                if (!env[k]) {
                    ctx.addIssue({
                        code: 'custom',
                        path: [k],
                        message: `${k} wajib kalau STORAGE_DRIVER=r2`,
                    });
                }
            }
        }
    });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
    const r = envSchema.safeParse(raw);
    if (!r.success) {
        throw new Error(
            'Konfigurasi environment tidak valid:\n' + z.prettifyError(r.error),
        );
    }
    return r.data;
}
