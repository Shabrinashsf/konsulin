import 'dotenv/config';
import * as argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const PROGRAMS = [
    { code: 'S1-IF', name: 'S1 Teknik Informatika', degree: 'S1' },
    { code: 'S1-RPL', name: 'S1 Rekayasa Perangkat Lunak', degree: 'S1' },
    { code: 'S1-RKA', name: 'S1 Rekayasa Kecerdasan Artifisial', degree: 'S1' },
    { code: 'S2-IF', name: 'S2 Magister Teknik Informatika', degree: 'S2' },
    { code: 'S3-IK', name: 'S3 Doktor Ilmu Komputer', degree: 'S3' },
] as const;

async function main() {
    await db.insert(schema.studyPrograms).values([...PROGRAMS]).onConflictDoNothing();

    const passwordHash = await argon2.hash(process.env.SEED_LECTURER_PASSWORD ?? 'Dosen12345');
    await db
    .insert(schema.users)
    .values([
        { fullName: 'Dr. Dosen Satu', email: 'dosen1@konsulin.test', nip: '198001012005011001', role: 'lecturer', passwordHash },
        { fullName: 'Dr. Dosen Dua', email: 'dosen2@konsulin.test', nip: '198102022006042002', role: 'lecturer', passwordHash },
    ])
    .onConflictDoNothing();

    console.log('Seed selesai');
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());