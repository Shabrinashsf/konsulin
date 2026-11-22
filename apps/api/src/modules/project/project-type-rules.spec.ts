import {
    PROJECT_TYPE_RULES,
    PROJECT_TYPES,
    canJoin,
    typesForDegree,
} from './project-type-rules';

describe('PROJECT_TYPE_RULES', () => {
    it('tipe tugas akhir → individual, tipe umum → shared', () => {
        for (const t of PROJECT_TYPES) {
            const rule = PROJECT_TYPE_RULES[t];
            expect(rule.trackMode).toBe(
                rule.requiredDegree ? 'individual' : 'shared',
            );
        }
    });

    it('typesForDegree hanya mengembalikan tipe berjenjang itu', () => {
        expect(typesForDegree('S2')).toEqual([
            's2_thesis_proposal',
            's2_thesis',
        ]);
    });

    it('canJoin (BR-17)', () => {
        expect(canJoin('s2_thesis', 'S2')).toBe(true);
        expect(canJoin('s2_thesis', 'S1')).toBe(false);
        expect(canJoin('competition', 'S1')).toBe(true);
        expect(canJoin('competition', 'S3')).toBe(true);
    });
});
