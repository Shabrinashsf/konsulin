import {
    ArgumentsHost,
    BadRequestException,
    Catch,
    ExceptionFilter,
    HttpException,
    Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';

interface ErrorBody {
    message?: unknown;
    code?: unknown;
    details?: unknown;
}

// 400 with a machine-readable code
export const badRequest = (code: string, message: string) =>
    new BadRequestException({ message, code });

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(e: unknown, host: ArgumentsHost) {
        const res = host.switchToHttp().getResponse<Response>();
        if (e instanceof HttpException) {
            const status = e.getStatus();
            const raw = e.getResponse();
            const body: ErrorBody = typeof raw === 'object' ? raw : {};
            return void res.status(status).json({
                statusCode: status,
                error: STATUS_CODES[status] ?? 'Error',
                message: body.message ?? e.message,
                ...(body.code ? { code: body.code } : {}),
                ...(body.details ? { details: body.details } : {}),
            });
        }
        this.logger.error(e instanceof Error ? e.stack : String(e));
        res.status(500).json({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'There was an error on the server',
        });
    }
}
