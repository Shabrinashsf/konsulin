import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthUser } from '../../shared/auth/auth.decorators';
import { FolderService } from '../submission/folder.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { FEEDBACK_CREATED, FeedbackCreatedEvent } from './feedback-events';
import { FeedbackRepository } from './feedback.repository';
import { conflict, notFound } from '../../shared/http/http-exception.filter';

@Injectable()
export class FeedbackService {
    constructor(
        private readonly feedbacks: FeedbackRepository,
        private readonly folders: FolderService,
        private readonly events: EventEmitter2,
    ) {}

    async list(versionId: string, user: AuthUser) {
        await this.readableVersion(versionId, user);
        return this.feedbacks.findByVersion(versionId);
    }

    // any version the lecturer can see, old ones included
    async create(versionId: string, user: AuthUser, dto: CreateFeedbackDto) {
        const version = await this.readableVersion(versionId, user);
        const items = (dto.revisionItems ?? []).map((i) => i.description);
        const feedback = await this.feedbacks.create(
            versionId,
            dto.content,
            items,
        );

        const { folder } = version;
        const { lecturer, title, type } = folder.project;
        this.events.emit(
            FEEDBACK_CREATED,
            new FeedbackCreatedEvent(
                feedback.id,
                feedback.content,
                items,
                { id: version.id, versionNumber: version.versionNumber },
                {
                    id: folder.id,
                    title: folder.title,
                    studentId: folder.studentId,
                },
                { id: folder.projectId, title, type },
                { id: lecturer.id, name: lecturer.name },
            ),
        );
        return feedback;
    }

    // only the content; revision items stay as created
    async update(id: string, user: AuthUser, dto: UpdateFeedbackDto) {
        await this.readableFeedback(id, user);
        return this.feedbacks.updateContent(id, dto.content);
    }

    async remove(id: string, user: AuthUser) {
        await this.readableFeedback(id, user);
        const result = await this.feedbacks.delete(id);
        if (result === 'GONE') throw this.feedbackNotFound();
        if (result === 'STALE') {
            throw conflict(
                'FEEDBACK_HAS_PROGRESS',
                'Feedback tidak dapat dihapus karena item revisinya sudah dikerjakan',
            );
        }
    }

    // ---- access follows the folder: not visible -> 404 ----

    private async readableVersion(id: string, user: AuthUser) {
        const version = await this.feedbacks.findVersion(id);
        if (!version || !(await this.folders.canRead(version.folder, user))) {
            throw notFound('VERSION_NOT_FOUND', 'Versi tidak ditemukan');
        }
        return version;
    }

    private async readableFeedback(id: string, user: AuthUser) {
        const feedback = await this.feedbacks.findFeedback(id);
        if (
            !feedback ||
            !(await this.folders.canRead(feedback.version.folder, user))
        ) {
            throw this.feedbackNotFound();
        }
        return feedback;
    }

    private feedbackNotFound() {
        return notFound('FEEDBACK_NOT_FOUND', 'Feedback tidak ditemukan');
    }
}
