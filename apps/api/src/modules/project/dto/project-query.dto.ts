import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { ProjectType } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';
import { DEGREES, type Degree } from '../../identity/degree';
import { IsDateOnly } from '../../../shared/http/validators';

export const PROJECT_SORTS = ['createdAt', 'title', 'startDate'] as const;

export class ProjectQueryDto extends PaginationQueryDto {
    // title
    @IsOptional()
    @IsString()
    q?: string;

    // project type
    @IsOptional()
    @IsEnum(ProjectType)
    type?: ProjectType;

    // degree
    @IsOptional()
    @IsIn(DEGREES)
    degree?: Degree;

    // project start date
    @IsOptional()
    @IsDateOnly()
    startFrom?: string;

    // project end date
    @IsOptional()
    @IsDateOnly()
    startTo?: string;

    // sort by
    @IsOptional()
    @IsIn(PROJECT_SORTS)
    sort?: (typeof PROJECT_SORTS)[number];
}
