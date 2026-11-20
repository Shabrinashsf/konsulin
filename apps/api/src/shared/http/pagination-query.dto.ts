import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Paginated } from './response.interceptor';

export class PaginationQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number =
        10;
    @IsOptional() @IsString() sort?: string;
    @IsOptional() @IsIn(['asc', 'desc']) order: 'asc' | 'desc' = 'desc';
    get skip() {
        return (this.page - 1) * this.limit;
    }
}

export function paginate<T>(
    items: T[],
    total: number,
    q: { page: number; limit: number },
): Paginated<T> {
    return {
        items,
        meta: {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / q.limit)),
        },
    };
}
