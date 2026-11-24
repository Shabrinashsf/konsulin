import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../shared/auth/auth.decorators';
import { paginate } from '../../shared/http/pagination-query.dto';
import { ProjectAccessService } from '../project/project-access.service';
import { isIndividual } from '../project/project-type-rules';
import { FolderService } from '../submission/folder.service';
import { AddressItemDto } from './dto/address-item.dto';
import { ReviewItemDto } from './dto/review-item.dto';
import { RevisionItemQueryDto } from './dto/revision-item-query.dto';
import {
    FeedbackRepository,
    type ItemContextRow,
    type LockedResult,
} from './feedback.repository';
import {
    canAddress,
    canReview,
    isNewerFix,
    reviewedStatus,
} from './revision-state';
import { apiError } from '../../shared/http/errors';
import type { RevisionItemContextResponseDto } from './dto/feedback-response.dto';

// flattens where the item came from
const toItemView = ({
    feedback: {
        version: { folder, ...version },
    },
    ...item
}: ItemContextRow): RevisionItemContextResponseDto => ({
    ...item,
    version,
    folder,
});

const itemNotFound = () => apiError('REVISION_ITEM_NOT_FOUND');

const invalidTransition = () => apiError('INVALID_REVISION_TRANSITION');

@Injectable()
export class RevisionItemService {
    constructor(
        private readonly feedbacks: FeedbackRepository,
        private readonly folders: FolderService,
        private readonly access: ProjectAccessService,
    ) {}

    async list(projectId: string, user: AuthUser, q: RevisionItemQueryDto) {
        const project = await this.access.getVisibleProject(projectId, user);
        // on individual projects a student only sees their own track
        const own = user.role === 'student' && isIndividual(project.type);
        const [rows, total] = await this.feedbacks.findItemPage(
            { ...q, projectId, ownerId: own ? user.id : undefined },
            q,
        );
        return paginate(rows.map(toItemView), total, q);
    }

    // track owner on individual projects, any member on shared ones
    async address(id: string, user: AuthUser, dto: AddressItemDto) {
        const item = await this.readable(id, user);
        if (!canAddress(item.status)) throw invalidTransition();

        const { version } = item.feedback;
        const fix = await this.feedbacks.findFolderVersion(
            version.folder.id,
            dto.versionId,
        );
        if (!fix) {
            throw apiError('VERSION_NOT_IN_FOLDER');
        }
        if (!isNewerFix(item, version.versionNumber, fix.versionNumber)) {
            throw apiError('VERSION_NOT_NEWER');
        }
        return this.written(
            await this.feedbacks.address(item, fix.id, dto.note || null),
        );
    }

    async review(id: string, user: AuthUser, dto: ReviewItemDto) {
        const item = await this.readable(id, user);
        if (!canReview(item.status)) throw invalidTransition();
        return this.written(
            await this.feedbacks.review(id, reviewedStatus(dto.decision)),
        );
    }

    // access follows the folder: not visible -> 404
    private async readable(id: string, user: AuthUser) {
        const item = await this.feedbacks.findItem(id);
        if (
            !item ||
            !(await this.folders.canRead(item.feedback.version.folder, user))
        ) {
            throw itemNotFound();
        }
        return item;
    }

    // lost a race: the feedback was deleted, or the status moved on
    private written(result: LockedResult<ItemContextRow>) {
        if (result === 'GONE') throw itemNotFound();
        if (result === 'STALE') throw invalidTransition();
        return toItemView(result);
    }
}
