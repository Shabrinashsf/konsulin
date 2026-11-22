import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';
import { IsDateOnly } from '../../../shared/http/validators';
import {
    CONSULTATION_VIEWS,
    type ConsultationView,
} from '../consultation-state';

// nearest date first by default
export class MyConsultationQueryDto extends PaginationQueryDto {
    @IsOptional()
    @IsIn(['asc', 'desc'])
    override order: 'asc' | 'desc' = 'asc';

    @IsOptional()
    @IsIn(CONSULTATION_VIEWS)
    status?: ConsultationView;

    @IsOptional()
    @IsDateOnly()
    from?: string;

    @IsOptional()
    @IsDateOnly()
    to?: string;

    @IsOptional()
    @IsUUID()
    projectId?: string;
}
