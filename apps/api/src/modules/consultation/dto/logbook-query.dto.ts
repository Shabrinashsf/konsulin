import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';
import { IsDateOnly } from '../../../shared/http/validators';

export class LogbookQueryDto extends PaginationQueryDto {
    @IsOptional()
    @IsUUID()
    studentId?: string;

    @IsOptional()
    @IsDateOnly()
    from?: string;

    @IsOptional()
    @IsDateOnly()
    to?: string;

    // topic and summary
    @IsOptional()
    @IsString()
    q?: string;
}
