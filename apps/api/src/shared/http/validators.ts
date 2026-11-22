import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';

// 'YYYY-MM-DD' that is also a real calendar date
export const IsDateOnly = () =>
    applyDecorators(
        Matches(/^\d{4}-\d{2}-\d{2}$/, {
            message: 'format tanggal harus YYYY-MM-DD',
        }),
        IsISO8601({ strict: true }),
    );

// ISO 8601 date-time with an explicit offset or Z, e.g. 2026-12-01T09:00:00+07:00
export const IsDateTime = () =>
    applyDecorators(
        Matches(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/,
            {
                message: 'format waktu harus ISO 8601 dengan zona waktu',
            },
        ),
        IsISO8601({ strict: true }),
    );
