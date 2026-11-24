import { ApiProperty } from '@nestjs/swagger';
import { ConsultationStatus } from '../../../generated/prisma/client';
import { PersonRefDto } from '../../../shared/http/common-response.dto';

export class BlackoutResponseDto {
    /** @example 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f' */
    id: string;
    /**
     * WIB date.
     * @example '2026-12-24'
     */
    @ApiProperty({ format: 'date' })
    date: string;
    /**
     * Only the lecturer sees it.
     * @example 'Konferensi di luar kota'
     */
    reason: string | null;
    createdAt: Date;
}

export class ProjectRefDto {
    /** @example '9c4e2a7b-1d3f-4b6a-8e5c-2f1a0b9d8c7e' */
    id: string;
    /** @example 'Bimbingan Tugas Akhir 2026' */
    title: string;
}

export class AffectedConsultationDto {
    /** @example 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f7a' */
    id: string;
    @ApiProperty({
        enum: ConsultationStatus,
        enumName: 'ConsultationStatus',
        example: 'approved',
    })
    status: ConsultationStatus;
    /** @example 'Bab 2 Tinjauan Pustaka' */
    topic: string;
    /** @example '2026-12-24' */
    @ApiProperty({ format: 'date' })
    requestedDate: string;
    startAt: Date | null;
    endAt: Date | null;
    project: ProjectRefDto;
    student: PersonRefDto;
}

export class BlackoutCreatedResponseDto {
    /** @example ['2026-12-24', '2026-12-26'] */
    @ApiProperty({ type: [String], format: 'date' })
    created: string[];
    /**
     * Dates already blocked, left as they were.
     * @example ['2026-12-25']
     */
    @ApiProperty({ type: [String], format: 'date' })
    skipped: string[];
    /** Cancelled because `cancelConsultations: true` was sent (BR-10). */
    @ApiProperty({ type: () => [AffectedConsultationDto] })
    cancelledConsultations: AffectedConsultationDto[];
}

export class BlackoutDeletedResponseDto {
    /** @example ['2026-12-24', '2026-12-25'] */
    @ApiProperty({ type: [String], format: 'date' })
    deleted: string[];
}

export class DayStatusResponseDto {
    /** @example '2026-12-01' */
    @ApiProperty({ format: 'date' })
    date: string;
    /**
     * `unavailable`: past, beyond 60 days, or blacklisted (the reason is never shown).
     */
    @ApiProperty({ enum: ['available', 'unavailable'], example: 'available' })
    status: 'available' | 'unavailable';
}
