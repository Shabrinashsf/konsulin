export const APP_TIMEZONE = 'Asia/Jakarta';
export const toJakartaDate = (d: Date) =>
    d.toLocaleDateString('sv-SE', { timeZone: APP_TIMEZONE });
export const toJakartaTime = (d: Date) =>
    d.toLocaleTimeString('sv-SE', {
        timeZone: APP_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
    });
