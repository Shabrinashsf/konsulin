import { Transform } from 'class-transformer';
import {
    IsEnum,
    IsISO8601,
    IsOptional,
    IsString,
    Length,
    Matches,
    MaxLength,
} from 'class-validator';
import { ProjectType } from '../../../generated/prisma/client';
import { trim } from '../../../shared/http/transforms';

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_ONLY_MESSAGE = 'format tanggal harus YYYY-MM-DD';

export class CreateProjectDto {
    // project title
    @Transform(trim)
    @IsString()
    @Length(3, 200)
    title: string;

    // project description
    @IsOptional()
    @IsString()
    @MaxLength(5000)
    description?: string | null;

    // project type
    @IsEnum(ProjectType)
    type: ProjectType;

    // project start date YYYY-MM-DD
    @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE })
    @IsISO8601({ strict: true })
    startDate: string;

    // project end date YYYY-MM-DD
    @IsOptional()
    @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE })
    @IsISO8601({ strict: true })
    endDate?: string | null;
}
