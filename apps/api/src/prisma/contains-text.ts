// for text filter, uppercas == lowercase
export const containsText = (q: string) => ({
    contains: q.replace(/[\\%_]/g, '\\$&'),
    mode: 'insensitive' as const,
});
