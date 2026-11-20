process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/konsulin_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-chars!!';
