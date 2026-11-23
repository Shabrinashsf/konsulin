import { Transform } from 'class-transformer';
import {
    IsEnum,
    IsOptional,
    IsString,
    Length,
    MaxLength,
    ValidateIf,
} from 'class-validator';
import { ProjectType } from '../../../generated/prisma/client';
import { trim } from '../../../shared/http/transforms';
import { IsDateOnly, isPresent } from '../../../shared/http/validators';

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
    @IsDateOnly()
    startDate?: string;

    // project end date YYYY-MM-DD
    @IsOptional()
    @IsDateOnly()
    endDate?: string | null;
}
