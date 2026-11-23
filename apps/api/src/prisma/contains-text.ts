// LIKE wildcards taken literally
export const escapeLike = (q: string) => q.replace(/[\\%_]/g, '\\$&');

// for text filter, uppercas == lowercase
export const containsText = (q: string) => ({
    contains: escapeLike(q),
    mode: 'insensitive' as const,
});
