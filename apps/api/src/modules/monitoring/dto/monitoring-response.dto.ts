import { ApiProperty } from '@nestjs/swagger';
import { ProjectType } from '../../../generated/prisma/client';
import { StudyProgramDto } from '../../../shared/http/common-response.dto';

export class MonitoredProjectDto {
    /** @example '9c4e2a7b-1d3f-4b6a-8e5c-2f1a0b9d8c7e' */
    id: string;
    /** @example 'Bimbingan Tugas Akhir 2026' */
    title: string;
    @ApiProperty({
        enum: ProjectType,
        enumName: 'ProjectType',
        example: 's1_thesis',
    })
    type: ProjectType;
}

export class NearestDeadlineDto {
    /** @example 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b' */
    folderId: string;
    /** @example 'Bab 2 Tinjauan Pustaka' */
    title: string;
    /** @example '9c4e2a7b-1d3f-4b6a-8e5c-2f1a0b9d8c7e' */
    projectId: string;
    deadlineAt: Date;
}

export class MonitoredStudentResponseDto {
    /** @example '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c' */
    id: string;
    /** @example 'Andi Pratama' */
    name: string;
    /** @example '5025241001' */
    nrp: string;
    /** @example 'andi@student.example.ac.id' */
    email: string;
    /** @example 2024 */
    cohortYear: number;
    studyProgram: StudyProgramDto;
    /** Counted projects the student is in. */
    @ApiProperty({ type: () => [MonitoredProjectDto] })
    projects: MonitoredProjectDto[];
    /** Start of the latest completed consultation; null if none. */
    lastConsultationAt: Date | null;
    /** @example 4 */
    completedConsultations: number;
    /**
     * Revision items `open` + `reopened` in the student's folders and the shared folders.
     * @example 2
     */
    openRevisions: number;
    /**
     * Folders past their deadline with nothing uploaded.
     * @example 0
     */
    overdueFolders: number;
    /**
     * Soonest upcoming deadline of a folder without a version; null if none.
     */
    nearestDeadline: NearestDeadlineDto | null;
}
