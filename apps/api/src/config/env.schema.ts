// src/config/env.schema.ts
import { z } from 'zod';

export const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3000),
    APP_ORIGIN: z.string().url(),                // URL frontend, untuk CORS & link di email
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
    SMTP_HOST: z.string(),
    SMTP_PORT: z.coerce.number(),
    SMTP_SECURE: z.coerce.boolean().default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string(),
    UPLOAD_DIR: z.string().default('uploads'),
    UPLOAD_TMP_DIR: z.string().default('uploads/tmp'),
    MAX_UPLOAD_MB: z.coerce.number().default(50),
    TZ_APP: z.string().default('Asia/Jakarta'),
});

export type Env = z.infer<typeof envSchema>;