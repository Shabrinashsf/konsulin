import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/client';
import { StudyProgramDto } from '../../../shared/http/common-response.dto';

export class TokenResponseDto {
    /**
     * JWT for `Authorization: Bearer`, valid for JWT_ACCESS_TTL (15 minutes).
     * The refresh token is set as the httpOnly cookie `refresh_token`.
     * @example 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZjJhIn0.sig'
     */
    accessToken: string;
}

export class ProfileResponseDto {
    /** @example '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c' */
    id: string;
    /** @example 'Andi Pratama' */
    name: string;
    /** @example 'andi@student.example.ac.id' */
    email: string;
    @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: 'student' })
    role: UserRole;
    /**
     * Students only; null for lecturers.
     * @example '5025241001'
     */
    nrp: string | null;
    /**
     * Students only; null for lecturers.
     * @example 2024
     */
    cohortYear: number | null;
    /** Students only; null for lecturers. */
    studyProgram: StudyProgramDto | null;
}

export class StudentResponseDto {
    /** @example '3f2a8c1e-5b7d-4e9a-8c6f-1d2e3f4a5b6c' */
    id: string;
    /** @example 'Andi Pratama' */
    name: string;
    /** @example '5025241001' */
    nrp: string | null;
    /** @example 2024 */
    cohortYear: number | null;
    studyProgram: StudyProgramDto | null;
}
