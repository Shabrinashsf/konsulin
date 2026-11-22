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
export const formatDateOnly = (d: Date) => d.toISOString().slice(0, 10);
