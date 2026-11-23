import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RevisionItemStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';

export class RevisionItemQueryDto extends PaginationQueryDto {
    @IsOptional()
    @IsEnum(RevisionItemStatus)
    status?: RevisionItemStatus;

    // track owner
    @IsOptional()
    @IsUUID()
    studentId?: string;

    @IsOptional()
    @IsUUID()
    folderId?: string;
}
