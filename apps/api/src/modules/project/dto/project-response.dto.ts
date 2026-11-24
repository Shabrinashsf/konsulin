import { ApiProperty } from '@nestjs/swagger';
import { ProjectType } from '../../../generated/prisma/client';
import {
    PersonRefDto,
    StudyProgramDto,
} from '../../../shared/http/common-response.dto';
import { DEGREES, type Degree } from '../../identity/degree';
import { StudentResponseDto } from '../../identity/dto/identity-response.dto';
import { INVITATION_VIEWS, type InvitationView } from '../invitation-state';
import type { TrackMode } from '../project-type-rules';

const TRACK_MODES = ['individual', 'shared'];

export class ProjectResponseDto {
    /** @example '9c4e2a7b-1d3f-4b6a-8e5c-2f1a0b9d8c7e' */
    id: string;
    /** @example 'Bimbingan Tugas Akhir 2026' */
    title: string;
    /** @example 'Kelompok bimbingan TA semester genap' */
    description: string | null;
    @ApiProperty({
        enum: ProjectType,
        enumName: 'ProjectType',
        example: 's1_thesis',
    })
    type: ProjectType;
    /**
     * Derived from the type.
     * @example 'Tugas Akhir'
     */
    label: string;
    /** Degree a student needs to join; null for general types. */
    @ApiProperty({ enum: DEGREES, nullable: true, example: 'S1' })
    requiredDegree: Degree | null;
    /**
     * `individual`: each student's work is private; `shared`: the team sees everything.
     */
    @ApiProperty({ enum: TRACK_MODES, example: 'individual' })
    trackMode: TrackMode;
    /**
     * WIB date; always set for projects created through the API.
     * @example '2026-02-01'
     */
    @ApiProperty({ format: 'date', nullable: true })
    startDate: string | null;
    /** @example '2026-07-31' */
    @ApiProperty({ format: 'date', nullable: true })
    endDate: string | null;
    createdAt: Date;
    updatedAt: Date;
    lecturer: PersonRefDto;
    /**
     * Active members.
     * @example 3
     */
    memberCount: number;
}

export class ProjectSummaryDto {
    /** @example 3 */
    memberCount: number;
    /**
     * Live pending invitations; null for students.
     * @example 1
     */
    pendingInvitationCount: number | null;
}

export class ProjectDetailResponseDto extends ProjectResponseDto {
    summary: ProjectSummaryDto;
}

export class MemberResponseDto {
    /** @example '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c' */
    id: string;
    /** @example 'Andi Pratama' */
    name: string;
    /** @example '5025241001' */
    nrp: string | null;
    /** @example 2024 */
    cohortYear: number | null;
    studyProgram: StudyProgramDto | null;
    joinedAt: Date;
}

export class InvitationProjectDto {
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
    /** @example 'Tugas Akhir' */
    typeLabel: string;
    lecturer: PersonRefDto;
}

export class InvitationResponseDto {
    /** @example 'b7e1c2d3-4f5a-4b6c-9d8e-7f6a5b4c3d2e' */
    id: string;
    /** `expired` is derived: a pending invitation past `expiresAt`. */
    @ApiProperty({ enum: INVITATION_VIEWS, example: 'pending' })
    status: InvitationView;
    expiresAt: Date;
    respondedAt: Date | null;
    createdAt: Date;
    student: StudentResponseDto;
    project: InvitationProjectDto;
}
