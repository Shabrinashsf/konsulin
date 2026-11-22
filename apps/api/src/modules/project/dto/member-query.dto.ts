import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';

export class MemberQueryDto extends PaginationQueryDto {
    // name or nrp
    @IsOptional()
    @IsString()
    q?: string;
}
