import { PaginationQueryDto, paginate } from './pagination-query.dto';

describe('PaginationQueryDto', () => {
    it('menghitung skip dari page & limit', () => {
        const q = Object.assign(new PaginationQueryDto(), {
            page: 3,
            limit: 20,
        });
        expect(q.skip).toBe(40);
    });
});

describe('paginate', () => {
    it('membungkus items dengan meta', () => {
        expect(paginate(['a', 'b'], 45, { page: 2, limit: 10 })).toEqual({
            items: ['a', 'b'],
            meta: { page: 2, limit: 10, total: 45, totalPages: 5 },
        });
    });

    it('totalPages minimal 1 saat data kosong', () => {
        expect(paginate([], 0, { page: 1, limit: 10 }).meta.totalPages).toBe(1);
    });
});
