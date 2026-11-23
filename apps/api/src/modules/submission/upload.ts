import {
    CallHandler,
    CanActivate,
    ExecutionContext,
    Injectable,
    NestInterceptor,
    ParseUUIDPipe,
} from '@nestjs/common';
import { rmSync } from 'node:fs';
import { finalize } from 'rxjs';
import type { AuthRequest } from '../../shared/auth/auth.decorators';
import { FolderService } from './folder.service';

// runs before multer, so nobody without access gets to send a file
@Injectable()
export class UploadAccessGuard implements CanActivate {
    constructor(private readonly folders: FolderService) {}

    async canActivate(ctx: ExecutionContext) {
        const req = ctx.switchToHttp().getRequest<AuthRequest>();
        const id = await new ParseUUIDPipe().transform(
            req.params.folderId as string,
            { type: 'param' },
        );
        await this.folders.readable(id, req.user!);
        return true;
    }
}

// the multer tmp file is gone after the request (moved away on success)
@Injectable()
export class RemoveTmpFile implements NestInterceptor {
    intercept(ctx: ExecutionContext, next: CallHandler) {
        const req = ctx.switchToHttp().getRequest<AuthRequest>();
        return next.handle().pipe(
            finalize(() => {
                if (req.file) rmSync(req.file.path, { force: true });
            }),
        );
    }
}
