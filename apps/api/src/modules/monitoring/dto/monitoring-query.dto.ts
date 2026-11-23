import { Transform, Type } from 'class-transformer';
import {
    IsBoolean,
    IsEnum,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';
import { ProjectType } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';
import { toBoolean } from '../../../shared/http/transforms';
import { IsDateOnly } from '../../../shared/http/validators';
import { DEGREES, type Degree } from '../../identity/degree';

export const MONITORING_SORTS = [
    'name',
    'nrp',
    'lastConsultationAt',
    'completedConsultations',
    'openRevisions',
    'nearestDeadline',
] as const;
export type MonitoringSort = (typeof MONITORING_SORTS)[number];

export class MonitoringQueryDto extends PaginationQueryDto {
    // name or nrp
    @IsOptional()
    @IsString()
    q?: string;

    // only these projects are counted
    @IsOptional()
    @IsUUID()
    projectId?: string;

    @IsOptional()
    @IsEnum(ProjectType)
    projectType?: ProjectType;

    @IsOptional()
    @IsUUID()
    studyProgramId?: string;

    @IsOptional()
    @IsIn(DEGREES)
    degree?: Degree;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    cohortYear?: number;

    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    hasOpenRevisions?: boolean;

    // at least one overdue folder (BR-24)
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    overdue?: boolean;

    // last completed consultation before this WIB date, or none
    @IsOptional()
    @IsDateOnly()
    noConsultationSince?: string;

    @IsOptional()
    @IsIn(MONITORING_SORTS)
    sort: MonitoringSort = 'name';

    // names read best A→Z
    @IsOptional()
    @IsIn(['asc', 'desc'])
    override order: 'asc' | 'desc' = 'asc';
}
