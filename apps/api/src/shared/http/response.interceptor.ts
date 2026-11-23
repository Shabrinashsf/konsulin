import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
    StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
export interface Paginated<T> {
    items: T[];
    meta: PaginationMeta;
}

function isPaginated(v: unknown): v is Paginated<unknown> {
    const p = v as Partial<Paginated<unknown>> | null;
    return Array.isArray(p?.items) && !!p.meta;
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
    intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(
            map((v: unknown) =>
                // file downloads are streamed as-is
                v instanceof StreamableFile
                    ? v
                    : isPaginated(v)
                      ? { data: v.items, meta: v.meta }
                      : { data: v ?? null },
            ),
        );
    }
}
