export class HealthLocalTimeDto {
    /** @example '2026-11-24' */
    date: string;
    /** @example '09:30' */
    time: string;
}

export class HealthResponseDto {
    /** @example 'ok' */
    status: string;
    /** @example 'Asia/Jakarta' */
    timezone: string;
    /** @example '2026-11-24T02:30:00.000Z' */
    time: string;
    /** Server time in WIB. */
    local: HealthLocalTimeDto;
}
