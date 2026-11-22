import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { containsText } from '../../prisma/contains-text';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../shared/http/pagination-query.dto';
import { ProjectAccessService } from '../project/project-access.service';
import { PROJECT_TYPE_RULES } from '../project/project-type-rules';
import { degreeNameFilter, withDegree } from './degree';
import { StudentQueryDto } from './dto/student-query.dto';

@Injectable()
export class StudentService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly projects: ProjectAccessService,
    ) {}

    async search(q: StudentQueryDto, lecturerId: string) {
        const where: Prisma.UserWhereInput = {
            role: 'student',
            deletedAt: null,
            studyProgramId: q.studyProgramId,
            cohortYear: q.cohortYear,
            ...(q.degree && {
                studyProgram: { name: degreeNameFilter(q.degree) },
            }),
            ...(q.q && {
                OR: [{ name: containsText(q.q) }, { nrp: containsText(q.q) }],
            }),
            AND: q.eligibleForProjectId
                ? await this.eligibleFor(q.eligibleForProjectId, lecturerId)
                : [],
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

    private async eligibleFor(
        projectId: string,
        lecturerId: string,
    ): Promise<Prisma.UserWhereInput[]> {
        const project = await this.projects.getOwnedProject(
            projectId,
            lecturerId,
        );
        const degree = PROJECT_TYPE_RULES[project.type].requiredDegree;
        return [
            degree ? { studyProgram: { name: degreeNameFilter(degree) } } : {},
            { memberships: { none: { projectId } } },
        ];
    }
}
