export const DEGREES = ['S1', 'S2', 'S3'] as const;
export type Degree = (typeof DEGREES)[number];

export function degreeOf(programName: string): Degree {
    const m = /^(S[123])\s/.exec(programName);
    if (!m) {
        throw new Error(
            `Nama prodi harus diawali jenjang (S1/S2/S3): "${programName}"`,
        );
    }
    return m[1] as Degree;
}

export const degreeNameFilter = (degree: Degree) => ({
    startsWith: `${degree} `,
});
