import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';
import { toBoolean } from '../../../shared/http/transforms';

export const FOLDER_SORTS = ['createdAt', 'deadline'] as const;

export class FolderQueryDto extends PaginationQueryDto {
    // title
    @IsOptional()
    @IsString()
    q?: string;

    // track owner
    @IsOptional()
    @IsUUID()
    studentId?: string;

    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    hasDeadline?: boolean;

    // deadline passed with nothing uploaded
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    overdue?: boolean;

    @IsOptional()
    @IsIn(FOLDER_SORTS)
    sort?: (typeof FOLDER_SORTS)[number];
}
