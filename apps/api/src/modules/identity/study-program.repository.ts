import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { type Degree, degreeNameFilter } from './degree';

@Injectable()
export class StudyProgramRepository {
    constructor(private readonly prisma: PrismaService) {}

    findAll(degree?: Degree) {
        return this.prisma.studyProgram.findMany({
            where: degree ? { name: degreeNameFilter(degree) } : {},
            orderBy: { name: 'asc' },
        });
    }

    async exists(id: string) {
        const program = await this.prisma.studyProgram.findUnique({
            where: { id },
            select: { id: true },
        });
        return program !== null;
    }
}
