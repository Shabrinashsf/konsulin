import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../shared/http/pagination-query.dto';
import { degreeNameFilter, withDegree } from './degree';
import { StudentQueryDto } from './dto/student-query.dto';

@Injectable()
export class StudentService {
    constructor(private readonly prisma: PrismaService) {}

    async search(q: StudentQueryDto) {
        const where: Prisma.UserWhereInput = {
            role: 'student',
            deletedAt: null,
            studyProgramId: q.studyProgramId,
            cohortYear: q.cohortYear,
            ...(q.degree && {
                studyProgram: { name: degreeNameFilter(q.degree) },
            }),
            ...(q.q && {
                OR: [
                    { name: { contains: q.q, mode: 'insensitive' } },
                    { nrp: { contains: q.q, mode: 'insensitive' } },
                ],
            }),
        };
        const [rows, total] = await this.prisma.$transaction([
            this.prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    nrp: true,
                    cohortYear: true,
                    studyProgram: { select: { id: true, name: true } },
                },
                orderBy: { name: 'asc' },
                skip: q.skip,
                take: q.limit,
            }),
            this.prisma.user.count({ where }),
        ]);
        const items = rows.map(({ studyProgram: sp, ...s }) => ({
            ...s,
            studyProgram: withDegree(sp),
        }));
        return paginate(items, total, q);
    }
}
