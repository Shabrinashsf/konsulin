import { Injectable } from '@nestjs/common';
import { Prisma, type ProjectType } from '../../generated/prisma/client';
import { escapeLike } from '../../prisma/contains-text';
import { PrismaService } from '../../prisma/prisma.service';
import type { Page } from '../../shared/http/pagination-query.dto';
import type { Degree } from '../identity/degree';
import { isIndividual, PROJECT_TYPES } from '../project/project-type-rules';
import type { MonitoringSort } from './dto/monitoring-query.dto';

export interface MonitoringFilter {
    lecturerId: string;
    projectId?: string;
    projectType?: ProjectType;
    q?: string;
    studyProgramId?: string;
    degree?: Degree;
    cohortYear?: number;
    hasOpenRevisions?: boolean;
    overdue?: boolean;
    noConsultationBefore?: Date;
    now: Date;
}

export interface MonitoringRow {
    id: string;
    name: string;
    nrp: string;
    email: string;
    cohortYear: number;
    studyProgramId: string;
    studyProgramName: string;
    projects: { id: string; title: string; type: ProjectType }[];
    lastConsultationAt: Date | null;
    completedConsultations: number;
    openRevisions: number;
    overdueFolders: number;
    nearestFolderId: string | null;
    nearestTitle: string | null;
    nearestProjectId: string | null;
    nearestDeadlineAt: Date | null;
}

const SHARED_TYPES = PROJECT_TYPES.filter((t) => !isIndividual(t));

// whitelisted, so safe to splice into ORDER BY
const SORT_COLUMNS: Record<MonitoringSort, string> = {
    name: '"name"',
    nrp: '"nrp"',
    lastConsultationAt: '"lastConsultationAt"',
    completedConsultations: '"completedConsultations"',
    openRevisions: '"openRevisions"',
    nearestDeadline: '"nearestDeadlineAt"',
};

const when = (on: unknown, sql: Prisma.Sql) => (on ? sql : Prisma.empty);

@Injectable()
export class MonitoringRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findPage(
        f: MonitoringFilter,
        page: Page & { sort: MonitoringSort },
    ): Promise<[MonitoringRow[], number]> {
        const base = monitoredSql(f);
        const order = Prisma.raw(
            `${SORT_COLUMNS[page.sort]} ${page.order === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, "id"`,
        );
        const [rows, [{ total }]] = await this.prisma.$transaction([
            this.prisma.$queryRaw<MonitoringRow[]>`
                ${base} ORDER BY ${order} LIMIT ${page.limit} OFFSET ${page.skip}`,
            this.prisma.$queryRaw<{ total: number }[]>`
                SELECT count(*)::int AS total FROM (${base}) t`,
        ]);
        return [rows, total];
    }
}

// one row per current member of the lecturer's projects
function monitoredSql(f: MonitoringFilter) {
    const like = `%${escapeLike(f.q ?? '')}%`;
    return Prisma.sql`
WITH scope AS (
    -- (student, project) pairs that are counted
    SELECT pm.student_id, pm.project_id, pm.joined_at, p.title, p.type
    FROM project_members pm
    JOIN projects p ON p.id = pm.project_id AND p.deleted_at IS NULL
    JOIN users u ON u.id = pm.student_id AND u.deleted_at IS NULL
    WHERE p.lecturer_id = ${f.lecturerId}::uuid
    ${when(f.projectId, Prisma.sql`AND p.id = ${f.projectId}::uuid`)}
    ${when(f.projectType, Prisma.sql`AND p.type::text = ${f.projectType}`)}
),
meetings AS (
    -- completed consultations: the requester, plus team members of a
    -- shared project for meetings after they joined
    SELECT s.student_id, max(c.start_at) AS last_at, count(*)::int AS completed
    FROM scope s
    JOIN consultations c ON c.project_id = s.project_id AND c.status = 'completed'
    WHERE c.student_id = s.student_id
       OR (s.type::text = ANY(${SHARED_TYPES}::text[]) AND c.start_at >= s.joined_at)
    GROUP BY s.student_id
),
folders AS (
    -- the student's own track folders plus the shared folders of the project
    SELECT s.student_id, f.id, f.title, f.project_id, f.deadline_at,
           EXISTS (SELECT 1 FROM submission_versions v WHERE v.folder_id = f.id) AS submitted
    FROM scope s
    JOIN submission_folders f ON f.project_id = s.project_id AND f.deleted_at IS NULL
     AND (f.student_id = s.student_id OR f.student_id IS NULL)
),
revisions AS (
    SELECT fo.student_id, count(*)::int AS open
    FROM folders fo
    JOIN submission_versions v ON v.folder_id = fo.id
    JOIN feedbacks fb ON fb.version_id = v.id
    JOIN revision_items ri ON ri.feedback_id = fb.id
    WHERE ri.status IN ('open', 'reopened')
    GROUP BY fo.student_id
),
monitored AS (
    SELECT u.id, u.name, u.nrp, u.email, u.cohort_year::int AS "cohortYear",
        sp.id AS "studyProgramId", sp.name AS "studyProgramName",
        (SELECT json_agg(json_build_object('id', s.project_id, 'title', s.title, 'type', s.type)
                         ORDER BY s.title, s.project_id)
         FROM scope s WHERE s.student_id = u.id) AS projects,
        m.last_at AS "lastConsultationAt",
        coalesce(m.completed, 0) AS "completedConsultations",
        coalesce(r.open, 0) AS "openRevisions",
        (SELECT count(*)::int FROM folders fo
         WHERE fo.student_id = u.id AND NOT fo.submitted AND fo.deadline_at < ${f.now}
        ) AS "overdueFolders",
        nd.id AS "nearestFolderId", nd.title AS "nearestTitle",
        nd.project_id AS "nearestProjectId", nd.deadline_at AS "nearestDeadlineAt"
    FROM (SELECT DISTINCT student_id FROM scope) x
    JOIN users u ON u.id = x.student_id
    JOIN study_programs sp ON sp.id = u.study_program_id
    LEFT JOIN meetings m ON m.student_id = u.id
    LEFT JOIN revisions r ON r.student_id = u.id
    LEFT JOIN LATERAL (
        SELECT fo.id, fo.title, fo.project_id, fo.deadline_at FROM folders fo
        WHERE fo.student_id = u.id AND NOT fo.submitted AND fo.deadline_at >= ${f.now}
        ORDER BY fo.deadline_at, fo.id LIMIT 1
    ) nd ON true
    WHERE TRUE
    ${when(f.q, Prisma.sql`AND (u.name ILIKE ${like} OR u.nrp ILIKE ${like})`)}
    ${when(f.studyProgramId, Prisma.sql`AND u.study_program_id = ${f.studyProgramId}::uuid`)}
    ${when(f.degree, Prisma.sql`AND sp.name LIKE ${`${f.degree} %`}`)}
    ${when(f.cohortYear !== undefined, Prisma.sql`AND u.cohort_year = ${f.cohortYear}`)}
)
SELECT * FROM monitored
WHERE TRUE
${when(f.hasOpenRevisions !== undefined, f.hasOpenRevisions ? Prisma.sql`AND "openRevisions" > 0` : Prisma.sql`AND "openRevisions" = 0`)}
${when(f.overdue !== undefined, f.overdue ? Prisma.sql`AND "overdueFolders" > 0` : Prisma.sql`AND "overdueFolders" = 0`)}
${when(f.noConsultationBefore, Prisma.sql`AND ("lastConsultationAt" IS NULL OR "lastConsultationAt" < ${f.noConsultationBefore})`)}`;
}
