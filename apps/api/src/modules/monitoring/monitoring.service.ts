import { Injectable } from '@nestjs/common';
import { paginate } from '../../shared/http/pagination-query.dto';
import { jakartaDateTime } from '../../shared/time/time';
import { withDegree } from '../identity/degree';
import { ProjectAccessService } from '../project/project-access.service';
import { MonitoringQueryDto } from './dto/monitoring-query.dto';
import {
    MonitoringRepository,
    type MonitoringRow,
} from './monitoring.repository';

// change raw database rows to the response form sent to the client
const toView = ({
    studyProgramId,
    studyProgramName,
    nearestFolderId,
    nearestTitle,
    nearestProjectId,
    nearestDeadlineAt,
    ...r
}: MonitoringRow) => ({
    ...r,
    studyProgram: withDegree({ id: studyProgramId, name: studyProgramName }),
    nearestDeadline: nearestFolderId && {
        folderId: nearestFolderId,
        title: nearestTitle,
        projectId: nearestProjectId,
        deadlineAt: nearestDeadlineAt,
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
