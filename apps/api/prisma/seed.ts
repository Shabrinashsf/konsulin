import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { degreeOf } from '../src/modules/identity/degree';

const STUDY_PROGRAMS = [
    'S1 Teknik Informatika',
    'S1 Rekayasa Perangkat Lunak',
    'S1 Rekayasa Kecerdasan Artifisial',
    'S2 Magister Teknik Informatika',
    'S3 Doktor Ilmu Komputer',
];

async function main() {
    process.loadEnvFile();
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL belum di-set');

    STUDY_PROGRAMS.forEach(degreeOf);

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });
    try {
        for (const name of STUDY_PROGRAMS) {
            await prisma.studyProgram.upsert({
                where: { name },
                update: {},
                create: { name },
            });
        }
        console.log(`Seed: ${STUDY_PROGRAMS.length} program studi`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
