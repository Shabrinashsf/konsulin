type TransformArg = { value: unknown };

export const trim = ({ value }: TransformArg) =>
    typeof value === 'string' ? value.trim() : value;

// query strings 'true'/'false' -> boolean (anything else is left for @IsBoolean to reject)
export const toBoolean = ({ value }: TransformArg) =>
    value === 'true' ? true : value === 'false' ? false : value;

export const normalizeEmail = ({ value }: TransformArg) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;
