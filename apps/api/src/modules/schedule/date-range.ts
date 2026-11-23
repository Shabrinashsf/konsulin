import { addDays } from '../../shared/time/time';
import { badRequest } from '../../shared/http/http-exception.filter';

// every 'YYYY-MM-DD' from `from` to `to`, inclusive
export function datesBetween(from: string, to: string) {
    const dates: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
    return dates;
}

// 400 unless from <= to and the inclusive range spans at most `maxDays`
export function assertDateRange(from: string, to: string, maxDays: number) {
    if (to < from || addDays(from, maxDays - 1) < to) {
        throw badRequest(
            'INVALID_DATE_RANGE',
            `Rentang tanggal tidak valid (from ≤ to, maksimal ${maxDays} hari)`,
        );
    }
}
