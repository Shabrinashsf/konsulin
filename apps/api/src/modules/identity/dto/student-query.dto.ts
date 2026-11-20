import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';
import { DEGREES, type Degree } from '../degree';

export class StudentQueryDto extends PaginationQueryDto {
    @IsOptional() @IsString() q?: string;
    @IsOptional() @IsUUID() studyProgramId?: string;
    @IsOptional() @IsIn(DEGREES) degree?: Degree;
    @IsOptional() @Type(() => Number) @IsInt() cohortYear?: number;
}
