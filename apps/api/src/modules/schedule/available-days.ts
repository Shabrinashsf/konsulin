import { addDays, toJakartaDate } from '../../shared/time/time';
import { datesBetween } from './date-range';

// a student may request a date from today up to 60 days ahead (WIB)
export const MAX_AHEAD_DAYS = 60;
// a calendar month grid shows up to 6 weeks
export const MAX_RANGE_DAYS = 42;

export interface AvailableDaysInput {
    from: string; // 'YYYY-MM-DD' WIB, inclusive
    to: string;
    blackoutDates: string[];
    now: Date;
}

export interface DayStatus {
    date: string;
    // unavailable = past, beyond 60 days, or blacklisted (reason not exposed)
    status: 'available' | 'unavailable';
}

// status of every date in the range for a student's request
export function calculateAvailableDays(input: AvailableDaysInput): DayStatus[] {
    const today = toJakartaDate(input.now);
    const last = addDays(today, MAX_AHEAD_DAYS);
    const blackout = new Set(input.blackoutDates);
    return datesBetween(input.from, input.to).map((date) => ({
        date,
        status:
            date >= today && date <= last && !blackout.has(date)
                ? 'available'
                : 'unavailable',
    }));
}
