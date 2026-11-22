import { Injectable } from '@nestjs/common';
import { paginate } from '../../shared/http/pagination-query.dto';
import { ProjectAccessService } from '../project/project-access.service';
import { PROJECT_TYPE_RULES } from '../project/project-type-rules';
import { type Degree, withDegree } from './degree';
import { StudentQueryDto } from './dto/student-query.dto';
import { type StudentRow, UserRepository } from './user.repository';

// change raw database response to a response form that can be send to client
const toStudentView = ({ studyProgram, ...s }: StudentRow) => ({
    ...s,
    studyProgram: withDegree(studyProgram),
});

@Injectable()
export class StudentService {
    constructor(
        private readonly users: UserRepository,
        private readonly projects: ProjectAccessService,
    ) {}

    async search(q: StudentQueryDto, lecturerId: string) {
        const degrees: Degree[] = q.degree ? [q.degree] : [];

        if (q.eligibleForProjectId) {
            const project = await this.projects.getOwnedProject(
                q.eligibleForProjectId,
                lecturerId,
            );
            const required = PROJECT_TYPE_RULES[project.type].requiredDegree;
            if (required) degrees.push(required);
        }

        const [rows, total] = await this.users.findStudentsPage(
            {
                q: q.q,
                studyProgramId: q.studyProgramId,
                cohortYear: q.cohortYear,
                degrees,
                notMemberOf: q.eligibleForProjectId,
            },
            q,
        );
        return paginate(rows.map(toStudentView), total, q);
    }
}
