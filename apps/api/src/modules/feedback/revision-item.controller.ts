import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
    type AuthUser,
    CurrentUser,
    Roles,
} from '../../shared/auth/auth.decorators';
import { AddressItemDto } from './dto/address-item.dto';
import { ReviewItemDto } from './dto/review-item.dto';
import { RevisionItemQueryDto } from './dto/revision-item-query.dto';
import { RevisionItemService } from './revision-item.service';
import {
    ApiDataResponse,
    ApiErrors,
    ApiPageResponse,
} from '../../shared/http/api-docs';
import { RevisionItemContextResponseDto } from './dto/feedback-response.dto';

@ApiTags('Feedback')
@ApiBearerAuth()
@ApiErrors('UNAUTHORIZED')
@Controller()
export class RevisionItemController {
    constructor(private readonly items: RevisionItemService) {}

    // -- GET /projects/:projectId/revision-items -> checklist across the project
    @Get('projects/:projectId/revision-items')
    @ApiPageResponse(RevisionItemContextResponseDto)
    @ApiErrors('VALIDATION', 'PROJECT_NOT_FOUND')
    list(
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @CurrentUser() user: AuthUser,
        @Query() q: RevisionItemQueryDto,
    ) {
        return this.items.list(projectId, user, q);
    }

    // -- POST /revision-items/:itemId/address -> the student marks it fixed
    @Post('revision-items/:itemId/address')
    @Roles('student')
    @HttpCode(200)
    @ApiDataResponse(RevisionItemContextResponseDto)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'REVISION_ITEM_NOT_FOUND',
        'INVALID_REVISION_TRANSITION',
        'VERSION_NOT_IN_FOLDER',
        'VERSION_NOT_NEWER',
    )
    address(
        @Param('itemId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: AddressItemDto,
    ) {
        return this.items.address(id, user, dto);
    }

    // -- POST /revision-items/:itemId/review -> verify or reopen
    @Post('revision-items/:itemId/review')
    @Roles('lecturer')
    @HttpCode(200)
    @ApiDataResponse(RevisionItemContextResponseDto)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'REVISION_ITEM_NOT_FOUND',
        'INVALID_REVISION_TRANSITION',
    )
    review(
        @Param('itemId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: ReviewItemDto,
    ) {
        return this.items.review(id, user, dto);
    }
}
