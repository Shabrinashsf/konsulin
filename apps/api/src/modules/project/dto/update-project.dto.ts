import { Transform } from 'class-transformer';
import {
    IsEnum,
    IsISO8601,
    IsOptional,
    IsString,
    Length,
    Matches,
    MaxLength,
    ValidateIf,
} from 'class-validator';
import { ProjectType } from '../../../generated/prisma/client';
import { trim } from '../../../shared/http/transforms';
import { DATE_ONLY, DATE_ONLY_MESSAGE } from './create-project.dto';

const isPresent = (_: unknown, v: unknown) => v !== undefined;

export class UpdateProjectDto {
    // project title
    @ValidateIf(isPresent)
    @Transform(trim)
    @IsString()
    @Length(3, 200)
    title?: string;

    // project description
    @IsOptional()
    @IsString()
    @MaxLength(5000)
    description?: string | null;

    // project type
    @ValidateIf(isPresent)
    @IsEnum(ProjectType)
    type?: ProjectType;

    // project start date YYYY-MM-DD
    @ValidateIf(isPresent)
    @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE })
    @IsISO8601({ strict: true })
    startDate?: string;

    // project end date YYYY-MM-DD
    @IsOptional()
    @Matches(DATE_ONLY, { message: DATE_ONLY_MESSAGE })
    @IsISO8601({ strict: true })
    endDate?: string | null;
}
