import { ApiProperty } from '@nestjs/swagger';
import { DEGREES, type Degree } from '../../modules/identity/degree';

export class PageMetaDto {
    /** @example 1 */
    page: number;
    /** @example 10 */
    limit: number;
    /** @example 42 */
    total: number;
    /** @example 5 */
    totalPages: number;
}

export class ErrorResponseDto {
    /** @example 409 */
    statusCode: number;
    /** @example 'Conflict' */
    error: string;
    /**
     * Indonesian message for the user; a list of messages for validation errors.
     */
    @ApiProperty({
        oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
        ],
        example: 'Jadwal bentrok dengan bimbingan lain',
    })
    message: string | string[];
    /**
     * Machine-readable error code; switch on this, not on the message.
     * @example 'CONSULTATION_OVERLAP'
     */
    code?: string;
    /**
     * Extra data for some errors, e.g. the affected consultations of BLACKOUT_HAS_CONSULTATION.
     */
    @ApiProperty({ type: 'object', additionalProperties: true })
    details?: Record<string, unknown>;
}

export class PersonRefDto {
    /** @example '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c' */
    id: string;
    /** @example 'Dr. Budi Santoso' */
    name: string;
}

export class StudyProgramDto {
    /** @example '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' */
    id: string;
    /** @example 'S1 Teknik Informatika' */
    name: string;
    /** Derived from the name prefix. */
    @ApiProperty({ enum: DEGREES, example: 'S1' })
    degree: Degree;
}
