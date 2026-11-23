import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
    type AuthUser,
    CurrentUser,
    Roles,
} from '../../shared/auth/auth.decorators';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('Feedback')
@ApiBearerAuth()
@Controller()
export class FeedbackController {
    constructor(private readonly feedbacks: FeedbackService) {}

    // -- GET /versions/:versionId/feedbacks -> feedback + revision items
    @Get('versions/:versionId/feedbacks')
    list(
        @Param('versionId', ParseUUIDPipe) versionId: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.feedbacks.list(versionId, user);
    }

    // -- POST /versions/:versionId/feedbacks -> feedback with its checklist
    @Post('versions/:versionId/feedbacks')
    @Roles('lecturer')
    create(
        @Param('versionId', ParseUUIDPipe) versionId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: CreateFeedbackDto,
    ) {
        return this.feedbacks.create(versionId, user, dto);
    }

    // -- PATCH /feedbacks/:feedbackId -> change the content only
    @Patch('feedbacks/:feedbackId')
    @Roles('lecturer')
    update(
        @Param('feedbackId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: UpdateFeedbackDto,
    ) {
        return this.feedbacks.update(id, user, dto);
    }

    // -- DELETE /feedbacks/:feedbackId -> only while every item is open
    @Delete('feedbacks/:feedbackId')
    @Roles('lecturer')
    remove(
        @Param('feedbackId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.feedbacks.remove(id, user);
    }
}
