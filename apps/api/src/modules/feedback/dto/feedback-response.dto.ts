import { ApiProperty } from '@nestjs/swagger';
import { RevisionItemStatus } from '../../../generated/prisma/client';

export class VersionRefDto {
    /** @example 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b9c' */
    id: string;
    /** @example 2 */
    versionNumber: number;
}

export class RevisionItemResponseDto {
    /** @example 'a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c0d' */
    id: string;
    /** @example '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e' */
    feedbackId: string;
    /**
     * Order within the feedback, from 0.
     * @example 0
     */
    position: number;
    /** @example 'Perjelas batasan masalah' */
    description: string;
    @ApiProperty({
        enum: RevisionItemStatus,
        enumName: 'RevisionItemStatus',
        example: 'addressed',
    })
    status: RevisionItemStatus;
    /**
     * The student's note on the last address.
     * @example 'Sudah diperbaiki di subbab 1.3'
     */
    addressedNote: string | null;
    /** Version that fixes the item (last address); kept while `reopened`. */
    addressedInVersion: VersionRefDto | null;
    createdAt: Date;
    updatedAt: Date;
}

export class FeedbackResponseDto {
    /** @example '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e' */
    id: string;
    /** @example 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b9c' */
    versionId: string;
    /** @example 'Secara umum sudah baik, perbaiki poin berikut.' */
    content: string;
    createdAt: Date;
    updatedAt: Date;
    /** In `position` order. */
    @ApiProperty({ type: () => [RevisionItemResponseDto] })
    revisionItems: RevisionItemResponseDto[];
}

export class ItemFolderDto {
    /** @example 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b' */
    id: string;
    /** @example 'Bab 1 Pendahuluan' */
    title: string;
    /**
     * Track owner; null on shared projects.
     * @example '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c'
     */
    studentId: string | null;
}

export class RevisionItemContextResponseDto extends RevisionItemResponseDto {
    version: VersionRefDto;
    folder: ItemFolderDto;
}
