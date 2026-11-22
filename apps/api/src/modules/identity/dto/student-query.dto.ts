import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';
import { DEGREES, type Degree } from '../degree';

export class StudentQueryDto extends PaginationQueryDto {
    // name or nrp
    @IsOptional()
    @IsString()
    q?: string;

    // study program
    @IsOptional()
    @IsUUID()
    studyProgramId?: string;

    // degree
    @IsOptional()
    @IsIn(DEGREES)
    degree?: Degree;

    // cohort
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    cohortYear?: number;

    // degree must match the project and the student is not a member yet
    @IsOptional()
    @IsUUID()
    eligibleForProjectId?: string;
}
