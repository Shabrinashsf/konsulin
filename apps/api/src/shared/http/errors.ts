import { HttpException } from '@nestjs/common';

// Every machine-readable error the API returns: its HTTP status and the
// message users see. Services throw them with apiError(code); Swagger lists
// them with @ApiErrors(...), so the docs always match what is sent.
export const ERRORS = {
    // identity
    STUDY_PROGRAM_NOT_FOUND: [400, 'Program studi tidak ditemukan'],
    EMAIL_TAKEN: [409, 'Email sudah terdaftar'],
    NRP_TAKEN: [409, 'NRP sudah terdaftar'],

    // project
    PROJECT_NOT_FOUND: [404, 'Project tidak ditemukan'],
    INVALID_DATE_RANGE: [
        400,
        'Tanggal selesai tidak boleh sebelum tanggal mulai',
    ],
    PROJECT_TYPE_LOCKED: [
        409,
        'Tipe project tidak dapat diubah karena sudah ada anggota atau undangan pending',
    ],
    MEMBER_NOT_FOUND: [404, 'Mahasiswa bukan anggota project ini'],
    STUDENT_NOT_FOUND: [404, 'Mahasiswa tidak ditemukan'],
    DEGREE_MISMATCH: [
        400,
        'Jenjang mahasiswa tidak sesuai dengan tipe project',
    ],
    ALREADY_MEMBER: [409, 'Mahasiswa sudah menjadi anggota'],
    INVITATION_ALREADY_PENDING: [
        409,
        'Mahasiswa masih punya undangan pending di project ini',
    ],
    INVITATION_NOT_FOUND: [404, 'Undangan tidak ditemukan'],
    INVITATION_EXPIRED: [409, 'Undangan sudah kedaluwarsa'],
    INVITATION_NOT_PENDING: [409, 'Undangan sudah tidak berstatus pending'],

    // schedule
    DATE_IN_PAST: [400, 'Tanggal blacklist tidak boleh di masa lalu'],
    BLACKOUT_HAS_CONSULTATION: [
        409,
        'Rentang ini mengenai bimbingan aktif. Kirim ulang dengan cancelConsultations: true untuk membatalkannya.',
    ],

    // consultation
    CONSULTATION_NOT_FOUND: [404, 'Bimbingan tidak ditemukan'],
    NOT_CONSULTATION_OWNER: [
        403,
        'Hanya mahasiswa pengaju yang dapat melakukan aksi ini',
    ],
    STUDENT_NOT_MEMBER: [400, 'Mahasiswa bukan anggota project ini'],
    DATE_NOT_AVAILABLE: [
        400,
        'Tanggal tidak tersedia (lampau, lebih dari 60 hari, atau dosen berhalangan)',
    ],
    DATE_BLACKLISTED: [400, 'Dosen berhalangan pada tanggal tersebut'],
    INVALID_TIME_RANGE: [
        400,
        'Durasi bimbingan 15 menit–4 jam, mulai dan selesai di tanggal yang sama',
    ],
    OUTSIDE_BOOKING_WINDOW: [
        400,
        'Waktu bimbingan minimal 1 jam dari sekarang dan maksimal 60 hari ke depan',
    ],
    FIELD_NOT_ALLOWED: [400, 'Lokasi dan mode hanya dapat ditentukan dosen'],
    LOCATION_REQUIRED: [400, 'Lokasi bimbingan wajib diisi dosen'],
    CONSULTATION_PENDING_EXISTS: [
        409,
        'Masih ada pengajuan bimbingan yang menunggu di project ini',
    ],
    CONSULTATION_OVERLAP: [409, 'Jadwal bentrok dengan bimbingan lain'],
    INVALID_TRANSITION: [409, 'Status bimbingan tidak mengizinkan aksi ini'],
    CONSULTATION_EXPIRED: [409, 'Pengajuan bimbingan sudah kedaluwarsa'],
    NOT_YOUR_TURN: [409, 'Bukan giliran Anda dalam negosiasi jam'],
    NO_PROPOSAL: [409, 'Belum ada usulan jam untuk diterima'],
    PROPOSAL_EXPIRED: [409, 'Usulan jam sudah lewat; usulkan jam baru'],
    CONSULTATION_STARTED: [409, 'Bimbingan sudah dimulai'],
    CONSULTATION_NOT_STARTED: [409, 'Bimbingan belum dimulai'],

    // submission
    FOLDER_NOT_FOUND: [404, 'Folder tidak ditemukan'],
    VERSION_NOT_FOUND: [404, 'Versi tidak ditemukan'],
    LECTURER_ONLY: [
        403,
        'Hanya dosen yang dapat menentukan pemilik track dan deadline',
    ],
    NOT_FOLDER_CREATOR: [
        403,
        'Hanya pembuat folder yang dapat melakukan aksi ini',
    ],
    DEADLINE_IN_PAST: [400, 'Deadline harus di masa depan'],
    STUDENT_REQUIRED: [400, 'studentId wajib diisi untuk project individual'],
    STUDENT_NOT_ALLOWED: [
        400,
        'Folder project shared tidak dimiliki satu mahasiswa',
    ],
    FOLDER_HAS_VERSIONS: [
        409,
        'Folder yang sudah memiliki versi tidak dapat dihapus oleh mahasiswa',
    ],
    FILE_REQUIRED: [400, 'File wajib diunggah'],
    INVALID_FILE_TYPE: [
        400,
        'File harus PDF, DOCX, atau ZIP dan isinya sesuai ekstensi',
    ],
    STORAGE_UNAVAILABLE: [503, 'Storage R2 belum dikonfigurasi'],

    // feedback
    FEEDBACK_NOT_FOUND: [404, 'Feedback tidak ditemukan'],
    FEEDBACK_HAS_PROGRESS: [
        409,
        'Feedback tidak dapat dihapus karena item revisinya sudah dikerjakan',
    ],
    REVISION_ITEM_NOT_FOUND: [404, 'Item revisi tidak ditemukan'],
    INVALID_REVISION_TRANSITION: [
        409,
        'Status item revisi tidak memungkinkan aksi ini',
    ],
    VERSION_NOT_IN_FOLDER: [
        400,
        'Versi perbaikan harus berasal dari folder yang sama',
    ],
    VERSION_NOT_NEWER: [
        400,
        'Versi perbaikan harus lebih baru dari versi feedback dan perbaikan sebelumnya',
    ],
} as const satisfies Record<string, readonly [number, string]>;

export type ErrorCode = keyof typeof ERRORS;

// `message` overrides the default when the same code has a more specific text
export function apiError(
    code: ErrorCode,
    extra: { message?: string; details?: unknown } = {},
) {
    const [status, message] = ERRORS[code];
    return new HttpException({ message, code, ...extra }, status);
}
