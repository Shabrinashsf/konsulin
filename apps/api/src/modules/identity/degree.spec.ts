import { degreeOf } from './degree';

describe('degreeOf', () => {
    it('mengambil jenjang dari awalan nama prodi', () => {
        expect(degreeOf('S1 Teknik Informatika')).toBe('S1');
        expect(degreeOf('S3 Doktor Ilmu Komputer')).toBe('S3');
    });

    it('menolak nama tanpa awalan jenjang yang valid', () => {
        expect(() => degreeOf('Teknik Informatika')).toThrow();
        expect(() => degreeOf('S4 Lainnya')).toThrow();
        expect(() => degreeOf('S1Teknik')).toThrow();
    });
});
