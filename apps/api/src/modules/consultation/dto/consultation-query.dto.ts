import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';
import { IsDateOnly } from '../../../shared/http/validators';
import {
    CONSULTATION_VIEWS,
    type ConsultationView,
} from '../consultation-state';

export const CONSULTATION_SORTS = ['createdAt', 'date'] as const;

export class ConsultationQueryDto extends PaginationQueryDto {
    // topic
    @IsOptional()
    @IsString()
    q?: string;

    @IsOptional()
    @IsIn(CONSULTATION_VIEWS)
    status?: ConsultationView;

    @IsOptional()
    @IsUUID()
    studentId?: string;

    // effective date (start, or requested date) from / to, WIB
    @IsOptional()
    @IsDateOnly()
    from?: string;

    @IsOptional()
    @IsDateOnly()
    to?: string;

    @IsOptional()
    @IsIn(CONSULTATION_SORTS)
    sort?: (typeof CONSULTATION_SORTS)[number];
}
