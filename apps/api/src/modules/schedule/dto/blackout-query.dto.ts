import { IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';
import { IsDateOnly } from '../../../shared/http/validators';

export class BlackoutQueryDto extends PaginationQueryDto {
    // date >= from (YYYY-MM-DD)
    @IsOptional()
    @IsDateOnly()
    from?: string;

    // date <= to (YYYY-MM-DD)
    @IsOptional()
    @IsDateOnly()
    to?: string;
}
