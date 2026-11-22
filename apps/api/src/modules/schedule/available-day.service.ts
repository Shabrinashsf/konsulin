import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../shared/auth/auth.decorators';
import { formatDateOnly, parseDateOnly } from '../../shared/time/time';
import { ProjectAccessService } from '../project/project-access.service';
import { calculateAvailableDays, MAX_RANGE_DAYS } from './available-days';
import { assertDateRange } from './date-range';
import { BlackoutDateRepository } from './blackout-date.repository';
import { AvailableDaysQueryDto } from './dto/available-days-query.dto';

@Injectable()
export class AvailableDayService {
    constructor(
        private readonly access: ProjectAccessService,
        private readonly blackouts: BlackoutDateRepository,
    ) {}

    // status of each date for requesting the project's lecturer (owner or member only)
    async list(projectId: string, user: AuthUser, q: AvailableDaysQueryDto) {
        assertDateRange(q.from, q.to, MAX_RANGE_DAYS);

        const project = await this.access.getVisibleProject(projectId, user);
        const lecturerId = project.lecturer.id;
        const blackouts = await this.blackouts.findDates(
            lecturerId,
            parseDateOnly(q.from),
            parseDateOnly(q.to),
        );

        return calculateAvailableDays({
            from: q.from,
            to: q.to,
            blackoutDates: blackouts.map((b) => formatDateOnly(b.date)),
            now: new Date(),
        });
    }
}
