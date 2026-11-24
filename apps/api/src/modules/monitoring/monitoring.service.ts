import { Injectable } from '@nestjs/common';
import { paginate } from '../../shared/http/pagination-query.dto';
import { jakartaDateTime } from '../../shared/time/time';
import { degreeOf } from '../identity/degree';
import { ProjectAccessService } from '../project/project-access.service';
import { MonitoringQueryDto } from './dto/monitoring-query.dto';
import {
    MonitoringRepository,
    type MonitoringRow,
} from './monitoring.repository';
import type { MonitoredStudentResponseDto } from './dto/monitoring-response.dto';

// change raw database rows to the response form sent to the client
const toView = ({
    studyProgramId,
    studyProgramName,
    nearestFolderId,
    nearestTitle,
    nearestProjectId,
    nearestDeadlineAt,
    ...r
}: MonitoringRow): MonitoredStudentResponseDto => ({
    ...r,
    studyProgram: {
        id: studyProgramId,
        name: studyProgramName,
        degree: degreeOf(studyProgramName),
    },
    // one LEFT JOIN row: the four columns are null together
    nearestDeadline:
        nearestFolderId === null
            ? null
            : {
                  folderId: nearestFolderId,
                  title: nearestTitle!,
                  projectId: nearestProjectId!,
                  deadlineAt: nearestDeadlineAt!,
              },
});

@Injectable()
export class MonitoringService {
    constructor(
        private readonly monitoring: MonitoringRepository,
        private readonly access: ProjectAccessService,
    ) {}

    async students(lecturerId: string, q: MonitoringQueryDto) {
        // another lecturer's or a deleted project -> 404
        if (q.projectId)
            await this.access.getOwnedProject(q.projectId, lecturerId);
        const [rows, total] = await this.monitoring.findPage(
            {
                ...q,
                lecturerId,
                now: new Date(),
                noConsultationBefore: q.noConsultationSince
                    ? jakartaDateTime(q.noConsultationSince, '00:00')
                    : undefined,
            },
            q,
        );
        return paginate(rows.map(toView), total, q);
    }
}
