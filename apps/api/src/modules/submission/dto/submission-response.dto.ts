import { ApiProperty } from '@nestjs/swagger';
import { ProjectType, UserRole } from '../../../generated/prisma/client';
import { PersonRefDto } from '../../../shared/http/common-response.dto';

const DEADLINE_STATUSES = ['none', 'upcoming', 'submitted', 'late', 'overdue'];

export class FolderLecturerDto extends PersonRefDto {
    /** @example 'budi.santoso@example.ac.id' */
    email: string;
}

export class FolderProjectDto {
    /** @example 'Bimbingan Tugas Akhir 2026' */
    title: string;
    @ApiProperty({
        enum: ProjectType,
        enumName: 'ProjectType',
        example: 's1_thesis',
    })
    type: ProjectType;
    lecturer: FolderLecturerDto;
}

export class FolderStudentDto extends PersonRefDto {
    /** @example '5025241001' */
    nrp: string | null;
}

export class FolderCreatorDto extends PersonRefDto {
    @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: 'student' })
    role: UserRole;
}

export class FolderResponseDto {
    /** @example 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b' */
    id: string;
    /** @example '9c4e2a7b-1d3f-4b6a-8e5c-2f1a0b9d8c7e' */
    projectId: string;
    /**
     * Track owner on individual projects; null on shared ones.
     * @example '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c'
     */
    studentId: string | null;
    /** @example '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c' */
    createdBy: string;
    /** @example 'Bab 1 Pendahuluan' */
    title: string;
    /** @example 'Latar belakang, rumusan masalah, tujuan' */
    description: string | null;
    deadlineAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    project: FolderProjectDto;
    student: FolderStudentDto | null;
    creator: FolderCreatorDto;
    /** @example 2 */
    versionCount: number;
    /** Derived on read (BR-24). */
    @ApiProperty({ enum: DEADLINE_STATUSES, example: 'submitted' })
    deadlineStatus: 'none' | 'upcoming' | 'submitted' | 'late' | 'overdue';
}

export class VersionResponseDto {
    /** @example 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b9c' */
    id: string;
    /** @example 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b' */
    folderId: string;
    /** @example 2 */
    versionNumber: number;
    /** @example 'Revisi sesuai feedback v1' */
    note: string | null;
    /** @example 'Bab 1 - Andi.pdf' */
    originalName: string;
    /**
     * Detected from the content.
     * @example 'application/pdf'
     */
    mimeType: string;
    /** @example 245760 */
    sizeBytes: number;
    createdAt: Date;
    uploader: PersonRefDto;
    /** @example 1 */
    feedbackCount: number;
    /**
     * Uploaded after the folder deadline.
     * @example false
     */
    late: boolean;
    /**
     * Revision items `open` + `reopened` on this version.
     * @example 2
     */
    openRevisions: number;
}

export class FolderDetailResponseDto extends FolderResponseDto {
    latestVersion: VersionResponseDto | null;
}
