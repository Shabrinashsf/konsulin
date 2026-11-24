import { Injectable } from '@nestjs/common';
import { degreeOf } from './degree';
import { StudyProgramQueryDto } from './dto/study-program-query.dto';
import { StudyProgramRepository } from './study-program.repository';
import type { StudyProgramDto } from '../../shared/http/common-response.dto';

@Injectable()
export class StudyProgramService {
    constructor(private readonly studyPrograms: StudyProgramRepository) {}

    async list(q: StudyProgramQueryDto): Promise<StudyProgramDto[]> {
        const rows = await this.studyPrograms.findAll(q.degree);
        return rows.map((p) => ({ ...p, degree: degreeOf(p.name) }));
    }
}
