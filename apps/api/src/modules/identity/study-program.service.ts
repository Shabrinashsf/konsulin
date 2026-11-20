import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { degreeNameFilter, degreeOf } from './degree';
import { StudyProgramQueryDto } from './dto/study-program-query.dto';

@Injectable()
export class StudyProgramService {
    constructor(private readonly prisma: PrismaService) {}

    async list(q: StudyProgramQueryDto) {
        const rows = await this.prisma.studyProgram.findMany({
            where: q.degree ? { name: degreeNameFilter(q.degree) } : {},
            orderBy: { name: 'asc' },
        });
        return rows.map((p) => ({ ...p, degree: degreeOf(p.name) }));
    }
}
