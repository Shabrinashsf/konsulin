// Smoke test of the mock API's business rules on the seed data.
import { expect, test } from 'vitest';
import { handle, HttpError } from './server';
import { DEMO_PASSWORD, resetDb } from './db';
import { addDays, todayWIB } from '../lib/time';

const call = async (method: string, url: string, body?: unknown) => ((await handle(method, url, body)) as { data: any }).data;
const code = (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof HttpError ? e.body.code : String(e)));
const login = (email: string) => call('POST', '/auth/login', { email, password: DEMO_PASSWORD });

test('demo flows follow the API rules', { timeout: 30_000 }, async () => {
  resetDb();
  expect(await code(login('andi@konsulin.test').then(() => call('POST', '/auth/login', { email: 'andi@konsulin.test', password: 'x' })))).toBe('INVALID_CREDENTIALS');
  await login('andi@konsulin.test');

  // BR-19: Andi already has a live request on p-ta (c-3)
  expect(await code(call('POST', '/projects/p-ta/consultations', { requestedDate: addDays(todayWIB(), 1), topic: 't', agenda: 'a', mode: 'offline' }))).toBe('CONSULTATION_PENDING_EXISTS');
  // individual track: Andi cannot see Dewi's request
  expect(await code(call('GET', '/consultations/c-4'))).toBe('CONSULTATION_NOT_FOUND');
  // c-3: lecturer proposed → student's turn → accept
  expect((await call('POST', '/consultations/c-3/accept', {})).status).toBe('approved');

  // BR-14: fix must be a newer version of the same folder
  expect(await code(call('POST', '/revision-items/it-3/address', { versionId: 'v-1' }))).toBe('VERSION_NOT_NEWER');
  expect((await call('POST', '/revision-items/it-3/address', { versionId: 'v-2' })).status).toBe('addressed');

  await login('budi@konsulin.test');
  // BR-17
  expect(await code(call('POST', '/projects/p-ta/invitations', { studentId: 's-rizky' }))).toBe('DEGREE_MISMATCH');
  // BR-10: blacking out the approved c-3 needs confirmation, then cancels it
  const day = addDays(todayWIB(), 3);
  const conflict = await handle('POST', '/me/blackout-dates', { from: day, to: day }).catch((e: HttpError) => e.body);
  expect((conflict as any).code).toBe('BLACKOUT_HAS_CONSULTATION');
  const done = await call('POST', '/me/blackout-dates', { from: day, to: day, cancelConsultations: true });
  expect(done.cancelledConsultations.map((c: any) => c.id)).toEqual(['c-3']);
  expect((await call('GET', '/consultations/c-3')).status).toBe('cancelled');
  // BR-13: review the addressed item
  expect((await call('POST', '/revision-items/it-3/review', { decision: 'reopen' })).status).toBe('reopened');

  const rows = ((await handle('GET', '/monitoring/students?sort=name')) as any).data;
  const andi = rows.find((r: any) => r.id === 's-andi');
  expect(andi.completedConsultations).toBe(3); // c-1, c-2 + Rizky's c-10 on shared p-fl (BR-26)
  expect(andi.openRevisions).toBe(3); // it-3 reopened + shared draft paper it-4, it-5
});
