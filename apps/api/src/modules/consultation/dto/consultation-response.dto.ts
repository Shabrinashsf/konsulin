import { ApiProperty } from '@nestjs/swagger';
import { ConsultationMode } from '../../../generated/prisma/client';
import { PersonRefDto } from '../../../shared/http/common-response.dto';
import type { TrackMode } from '../../project/project-type-rules';
import {
    CONSULTATION_VIEWS,
    type ConsultationView,
    type Party,
} from '../consultation-state';

const PARTIES = ['lecturer', 'student'];

export class ConsultationProjectDto {
    /** @example '9c4e2a7b-1d3f-4b6a-8e5c-2f1a0b9d8c7e' */
    id: string;
    /** @example 'Bimbingan Tugas Akhir 2026' */
    title: string;
    /** `shared`: a team meeting, visible to every member. */
    @ApiProperty({ enum: ['individual', 'shared'], example: 'individual' })
    trackMode: TrackMode;
}

export class ConsultationStudentDto extends PersonRefDto {
    /** @example '5025241001' */
    nrp: string | null;
}

export class ConsultationResponseDto {
    /** @example 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f7a' */
    id: string;
    /** `expired` is derived on read (BR-21), never stored. */
    @ApiProperty({ enum: CONSULTATION_VIEWS, example: 'requested' })
    status: ConsultationView;
    /** Who acts next while `requested`; null otherwise. */
    @ApiProperty({ enum: PARTIES, nullable: true, example: 'student' })
    turn: Party | null;
    /** Author of the current time proposal; null before the first one. */
    @ApiProperty({ enum: PARTIES, nullable: true, example: 'lecturer' })
    proposedBy: Party | null;
    @ApiProperty({
        enum: ConsultationMode,
        enumName: 'ConsultationMode',
        example: 'offline',
    })
    mode: ConsultationMode;
    /** @example 'Bab 1 Pendahuluan' */
    topic: string;
    /** @example 'Membahas rumusan masalah dan batasan' */
    agenda: string | null;
    /**
     * The student's note when requesting.
     * @example 'Saya sudah merevisi latar belakang'
     */
    note: string | null;
    /**
     * WIB date the student asked for.
     * @example '2026-12-01'
     */
    @ApiProperty({ format: 'date' })
    requestedDate: string;
    /** Null until a time is proposed. */
    startAt: Date | null;
    endAt: Date | null;
    /** @example 'Ruang Dosen 101' */
    location: string | null;
    /**
     * Reason for a rejection or cancellation.
     * @example 'Dosen berhalangan pada tanggal tersebut'
     */
    statusReason: string | null;
    /**
     * Logbook summary, set when completed.
     * @example 'Rumusan masalah disetujui; lanjut ke Bab 2'
     */
    summary: string | null;
    project: ConsultationProjectDto;
    lecturer: PersonRefDto;
    student: ConsultationStudentDto;
    createdAt: Date;
    updatedAt: Date;
}
