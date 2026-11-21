import { defineConfig } from 'prisma/config';

// Prisma 7 tidak lagi memuat .env otomatis; pakai loader bawaan Node.
try {
    process.loadEnvFile();
} catch {
    // .env opsional (mis. di CI variabel sudah di-set langsung)
}

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
        seed: 'tsx prisma/seed.ts',
    },
    datasource: {
        url: process.env.DATABASE_URL,
    },
});
