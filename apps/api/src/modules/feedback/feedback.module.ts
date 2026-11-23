import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { SubmissionModule } from '../submission/submission.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackRepository } from './feedback.repository';
import { FeedbackService } from './feedback.service';
import { RevisionItemController } from './revision-item.controller';
import { RevisionItemService } from './revision-item.service';

@Module({
    imports: [ProjectModule, SubmissionModule],
    controllers: [FeedbackController, RevisionItemController],
    providers: [FeedbackRepository, FeedbackService, RevisionItemService],
})
export class FeedbackModule {}
