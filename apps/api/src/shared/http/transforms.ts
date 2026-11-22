type TransformArg = { value: unknown };

export const trim = ({ value }: TransformArg) =>
    typeof value === 'string' ? value.trim() : value;

export const normalizeEmail = ({ value }: TransformArg) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;
