import type { Prisma } from '../generated/prisma/client';

// Lock a lecturer's users row for the rest of the transaction. Every change
// to a lecturer's consultations or blackout dates takes it first, so they
// run one at a time per lecturer
export const lockLecturer = (
    tx: Prisma.TransactionClient,
    lecturerId: string,
) =>
    tx.$queryRaw`SELECT id FROM users WHERE id = ${lecturerId}::uuid FOR UPDATE`;
