export const APP_TIMEZONE = 'Asia/Jakarta';
export const toJakartaDate = (d: Date) =>
    d.toLocaleDateString('sv-SE', { timeZone: APP_TIMEZONE });
export const toJakartaTime = (d: Date) =>
    d.toLocaleTimeString('sv-SE', {
        timeZone: APP_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
    });

// helper to parse string 'YYYY-MM-DD' to date object
export const parseDateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`);

// helper to parse date object to string 'YYYY-MM-DD'
// optional ISO/date-only input: undefined = unchanged, null = cleared
export const toDate = (v: string | null | undefined) =>
    v === undefined ? undefined : v === null ? null : new Date(v);

export const formatDateOnly = (d: Date) => d.toISOString().slice(0, 10);

// a WIB wall-clock moment as a real instant; Asia/Jakarta has no DST, so +07:00 is fixed
export const jakartaDateTime = (date: string, time: string) =>
    new Date(`${date}T${time}:00+07:00`);

// 'YYYY-MM-DD' plus n days
export const addDays = (date: string, n: number) =>
    formatDateOnly(new Date(parseDateOnly(date).getTime() + n * 86_400_000));
