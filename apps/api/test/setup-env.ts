import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/konsulin_test';

// uploads never touch the real UPLOAD_DIR; 1 MB keeps the 413 test fast
const uploads = join(tmpdir(), 'konsulin-test-uploads');
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOAD_DIR = uploads;
process.env.UPLOAD_TMP_DIR = join(uploads, 'tmp');
process.env.MAX_UPLOAD_MB = '1';

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-chars!!';
