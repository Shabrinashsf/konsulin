import {
    acceptError,
    cancelError,
    completeError,
    type ConsultationState,
    isExpired,
    proposeError,
    rejectError,
    rescheduleError,
    timeError,
    turnOf,
    viewStatus,
} from './consultation-state';

// 2026-11-23 10:00 WIB
const NOW = new Date('2026-11-23T03:00:00Z');
const at = (iso: string) => new Date(iso);
const date = (d: string) => new Date(`${d}T00:00:00.000Z`);
const req = (over: Partial<ConsultationState> = {}): ConsultationState => ({
    status: 'requested',
    requestedDate: date('2026-11-25'),
    proposedBy: null,
    startAt: null,
    ...over,
});

describe('consultation state (BR-08, BR-21)', () => {
    it('expired: tanggal ajuan lewat dan belum ada usulan / usulan sudah lewat', () => {
        const past = date('2026-11-22');
        expect(isExpired(req({ requestedDate: past }), NOW)).toBe(true);
        expect(
            isExpired(
                req({
                    requestedDate: past,
                    startAt: at('2026-11-22T03:00:00Z'),
                }),
                NOW,
            ),
        ).toBe(true);
        // usulan masih di masa depan → masih aktif
        expect(
            isExpired(
                req({
                    requestedDate: past,
                    startAt: at('2026-11-24T03:00:00Z'),
                }),
                NOW,
            ),
        ).toBe(false);
        // tanggal ajuan hari ini (WIB) → belum expired
        expect(isExpired(req({ requestedDate: date('2026-11-23') }), NOW)).toBe(
            false,
        );
        expect(
            isExpired(req({ status: 'approved', requestedDate: past }), NOW),
        ).toBe(false);
        expect(viewStatus(req({ requestedDate: past }), NOW)).toBe('expired');
    });

    it('giliran: belum ada usulan / usulan mahasiswa → dosen; usulan dosen → mahasiswa', () => {
        expect(turnOf(req(), NOW)).toBe('lecturer');
        expect(turnOf(req({ proposedBy: 'student' }), NOW)).toBe('lecturer');
        expect(turnOf(req({ proposedBy: 'lecturer' }), NOW)).toBe('student');
        expect(turnOf(req({ status: 'approved' }), NOW)).toBeNull();
        expect(
            turnOf(req({ requestedDate: date('2026-11-01') }), NOW),
        ).toBeNull();
    });

    it('propose / reject hanya oleh pihak yang mendapat giliran', () => {
        expect(proposeError(req(), 'lecturer', NOW)).toBeNull();
        expect(proposeError(req(), 'student', NOW)).toBe('NOT_YOUR_TURN');
        expect(
            proposeError(req({ proposedBy: 'lecturer' }), 'student', NOW),
        ).toBeNull();
        expect(rejectError(req({ proposedBy: 'lecturer' }), NOW)).toBe(
            'NOT_YOUR_TURN',
        );
        expect(rejectError(req({ proposedBy: 'student' }), NOW)).toBeNull();
        expect(proposeError(req({ status: 'approved' }), 'lecturer', NOW)).toBe(
            'INVALID_TRANSITION',
        );
        expect(
            proposeError(
                req({ requestedDate: date('2026-11-01') }),
                'lecturer',
                NOW,
            ),
        ).toBe('CONSULTATION_EXPIRED');
    });

    it('accept: butuh usulan dari pihak lain yang belum lewat', () => {
        const future = at('2026-11-25T03:00:00Z');
        expect(acceptError(req(), 'lecturer', NOW)).toBe('NO_PROPOSAL');
        expect(
            acceptError(
                req({ proposedBy: 'lecturer', startAt: future }),
                'student',
                NOW,
            ),
        ).toBeNull();
        expect(
            acceptError(
                req({ proposedBy: 'lecturer', startAt: future }),
                'lecturer',
                NOW,
            ),
        ).toBe('NOT_YOUR_TURN');
        expect(
            acceptError(
                req({
                    proposedBy: 'student',
                    startAt: at('2026-11-23T02:00:00Z'),
                }),
                'lecturer',
                NOW,
            ),
        ).toBe('PROPOSAL_EXPIRED');
    });

    it('cancel: requested aktif & approved belum mulai saja', () => {
        expect(cancelError(req(), NOW)).toBeNull();
        expect(
            cancelError(req({ requestedDate: date('2026-11-01') }), NOW),
        ).toBe('CONSULTATION_EXPIRED');
        const approved = req({
            status: 'approved',
            startAt: at('2026-11-25T03:00:00Z'),
        });
        expect(cancelError(approved, NOW)).toBeNull();
        expect(cancelError({ ...approved, startAt: NOW }, NOW)).toBe(
            'CONSULTATION_STARTED',
        );
        for (const status of ['rejected', 'completed', 'cancelled'] as const) {
            expect(cancelError(req({ status }), NOW)).toBe(
                'INVALID_TRANSITION',
            );
        }
    });

    it('reschedule hanya approved; complete hanya approved yang sudah mulai (BR-09)', () => {
        expect(rescheduleError(req({ status: 'approved' }))).toBeNull();
        expect(rescheduleError(req())).toBe('INVALID_TRANSITION');
        const approved = req({
            status: 'approved',
            startAt: at('2026-11-23T02:00:00Z'),
        });
        expect(completeError(approved, NOW)).toBeNull();
        expect(
            completeError(
                { ...approved, startAt: at('2026-11-23T04:00:00Z') },
                NOW,
            ),
        ).toBe('CONSULTATION_NOT_STARTED');
        expect(completeError(req(), NOW)).toBe('INVALID_TRANSITION');
    });
});

describe('timeError (BR-06, BR-20)', () => {
    const wib = (d: string, t: string) => new Date(`${d}T${t}:00+07:00`);
    it('durasi 15 menit – 4 jam', () => {
        expect(
            timeError(
                wib('2026-11-25', '09:00'),
                wib('2026-11-25', '09:15'),
                NOW,
            ),
        ).toBeNull();
        expect(
            timeError(
                wib('2026-11-25', '09:00'),
                wib('2026-11-25', '13:00'),
                NOW,
            ),
        ).toBeNull();
        expect(
            timeError(
                wib('2026-11-25', '09:00'),
                wib('2026-11-25', '09:14'),
                NOW,
            ),
        ).toBe('INVALID_TIME_RANGE');
        expect(
            timeError(
                wib('2026-11-25', '09:00'),
                wib('2026-11-25', '13:01'),
                NOW,
            ),
        ).toBe('INVALID_TIME_RANGE');
        expect(
            timeError(
                wib('2026-11-25', '10:00'),
                wib('2026-11-25', '09:00'),
                NOW,
            ),
        ).toBe('INVALID_TIME_RANGE');
    });

    it('mulai & selesai di tanggal WIB yang sama', () => {
        expect(
            timeError(
                wib('2026-11-25', '23:00'),
                wib('2026-11-26', '00:30'),
                NOW,
            ),
        ).toBe('INVALID_TIME_RANGE');
    });

    it('minimal 1 jam dari sekarang, maksimal 60 hari', () => {
        expect(
            timeError(
                wib('2026-11-23', '10:30'),
                wib('2026-11-23', '11:00'),
                NOW,
            ),
        ).toBe('OUTSIDE_BOOKING_WINDOW');
        expect(
            timeError(
                wib('2026-11-23', '11:00'),
                wib('2026-11-23', '11:30'),
                NOW,
            ),
        ).toBeNull();
        expect(
            timeError(
                wib('2027-01-23', '09:00'),
                wib('2027-01-23', '10:00'),
                NOW,
            ),
        ).toBe('OUTSIDE_BOOKING_WINDOW');
    });
});
