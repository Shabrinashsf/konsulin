import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PROJECT_TYPE_RULES } from '../project/project-type-rules';
import type { ConsultationInfo } from './templates';

const PERSON = { id: true, name: true, email: true } as const;

const CONSULTATION_INFO_SELECT = {
    id: true,
    topic: true,
    requestedDate: true,
    startAt: true,
    endAt: true,
    location: true,
    icsSequence: true,
    project: { select: { id: true, title: true, type: true } },
    lecturer: { select: PERSON },
    student: { select: PERSON },
} satisfies Prisma.ConsultationSelect;

@Injectable()
export class NotificationRepository {
    constructor(private readonly prisma: PrismaService) {}

    // lecturer + requester (even if no longer a member), plus every active member on a shared project; deleted accounts never get mail
    participants(c: {
        project: { id: string; trackMode: string };
        lecturer: { id: string };
        student: { id: string };
    }) {
        const or: Prisma.UserWhereInput[] = [
            { id: { in: [c.lecturer.id, c.student.id] } },
        ];
        if (c.project.trackMode === 'shared') {
            or.push({ memberships: { some: { projectId: c.project.id } } });
        }
        return this.prisma.user.findMany({
            where: { deletedAt: null, OR: or },
            select: PERSON,
            orderBy: { name: 'asc' },
        });
    }

    // active members; on individual projects only the track owner
    members(projectId: string, onlyStudentId?: string | null) {
        return this.prisma.user.findMany({
            where: {
                deletedAt: null,
                id: onlyStudentId ?? undefined,
                memberships: { some: { projectId } },
            },
            select: PERSON,
            orderBy: { name: 'asc' },
        });
    }

    // claims the rows atomically, so a second run sends nothing
    async claimReminders(from: Date, to: Date): Promise<ConsultationInfo[]> {
        const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
            UPDATE consultations SET reminder_sent_at = now()
            WHERE status = 'approved'
              AND reminder_sent_at IS NULL
              AND start_at >= ${from} AND start_at < ${to}
              AND project_id IN (SELECT id FROM projects WHERE deleted_at IS NULL)
            RETURNING id`;
        const rows = await this.prisma.consultation.findMany({
            where: { id: { in: claimed.map((r) => r.id) } },
            select: CONSULTATION_INFO_SELECT,
            orderBy: { startAt: 'asc' },
        });
        return rows.map(({ project, requestedDate, ...c }) => ({
            ...c,
            requestedDate: requestedDate.toISOString().slice(0, 10),
            project: {
                id: project.id,
                title: project.title,
                trackMode: PROJECT_TYPE_RULES[project.type].trackMode,
            },
        }));
    }
}
