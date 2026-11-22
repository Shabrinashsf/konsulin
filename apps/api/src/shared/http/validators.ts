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
