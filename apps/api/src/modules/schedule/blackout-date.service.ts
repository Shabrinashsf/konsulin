import { ConflictException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { paginate } from '../../shared/http/pagination-query.dto';
import {
    formatDateOnly,
    parseDateOnly,
    toJakartaDate,
} from '../../shared/time/time';
import {
    BlackoutDateRepository,
    type BlackoutRow,
} from './blackout-date.repository';
import {
    CANCEL_REASON,
    type CancelledRow,
    toCancelledEvent,
} from '../../shared/consultation/cancellation';
import { CONSULTATION_CANCELLED } from '../../shared/consultation/consultation-cancelled.event';
import { assertDateRange, datesBetween } from './date-range';
import { BlackoutQueryDto } from './dto/blackout-query.dto';
import { BlackoutRangeQueryDto } from './dto/blackout-range-query.dto';
import { CreateBlackoutDateDto } from './dto/create-blackout-date.dto';
import { badRequest, notFound } from '../../shared/http/http-exception.filter';

export const MAX_BLACKOUT_DAYS = 90;

// change raw database response to a response form that can be send to client
const toBlackoutView = (r: BlackoutRow) => ({
    ...r,
    date: formatDateOnly(r.date),
});

// affected consultation as shown to the lecturer (no student email)
const toAffectedView = (c: CancelledRow) => ({
    id: c.id,
    status: c.status,
    topic: c.topic,
    requestedDate: formatDateOnly(c.requestedDate),
    startAt: c.startAt,
    endAt: c.endAt,
    project: { id: c.project.id, title: c.project.title },
    student: { id: c.student.id, name: c.student.name },
});

@Injectable()
export class BlackoutDateService {
    constructor(
        private readonly blackouts: BlackoutDateRepository,
        private readonly events: EventEmitter2,
    ) {}

    async list(lecturerId: string, q: BlackoutQueryDto) {
        const [rows, total] = await this.blackouts.findPage(
            lecturerId,
            {
                from: q.from ? parseDateOnly(q.from) : undefined,
                to: q.to ? parseDateOnly(q.to) : undefined,
            },
            q,
        );
        return paginate(rows.map(toBlackoutView), total, q);
    }

    async create(lecturerId: string, dto: CreateBlackoutDateDto) {
        assertDateRange(dto.from, dto.to, MAX_BLACKOUT_DAYS);
        const now = new Date();
        if (dto.from < toJakartaDate(now)) {
            throw badRequest(
                'DATE_IN_PAST',
                'Tanggal blacklist tidak boleh di masa lalu',
            );
        }

        const result = await this.blackouts.createRange({
            lecturerId,
            from: dto.from,
            to: dto.to,
            dates: datesBetween(dto.from, dto.to),
            reason: dto.reason || null,
            cancelConsultations: dto.cancelConsultations ?? false,
            now,
        });

        // show what would be cancelled
        if ('conflict' in result) {
            throw new ConflictException({
                message:
                    'Rentang ini mengenai bimbingan aktif. Kirim ulang dengan cancelConsultations: true untuk membatalkannya.',
                code: 'BLACKOUT_HAS_CONSULTATION',
                details: { consultations: result.conflict.map(toAffectedView) },
            });
        }

        for (const c of result.cancelled) {
            this.events.emit(
                CONSULTATION_CANCELLED,
                toCancelledEvent(c, CANCEL_REASON.blackout, 'lecturer'),
            );
        }
        return {
            created: result.created,
            skipped: result.skipped,
            cancelledConsultations: result.cancelled.map(toAffectedView),
        };
    }

    async removeRange(lecturerId: string, q: BlackoutRangeQueryDto) {
        assertDateRange(q.from, q.to, MAX_BLACKOUT_DAYS);
        const deleted = await this.blackouts.deleteRange(
            lecturerId,
            parseDateOnly(q.from),
            parseDateOnly(q.to),
        );
        return { deleted };
    }

    async remove(lecturerId: string, id: string) {
        const row = await this.blackouts.delete(id, lecturerId);
        if (!row) {
            throw notFound(
                'BLACKOUT_NOT_FOUND',
                'Tanggal blacklist tidak ditemukan',
            );
        }
        return toBlackoutView(row);
    }
}
