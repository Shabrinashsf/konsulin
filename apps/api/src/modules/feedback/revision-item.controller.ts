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

@ApiTags('Feedback')
@ApiBearerAuth()
@Controller()
export class RevisionItemController {
    constructor(private readonly items: RevisionItemService) {}

    // -- GET /projects/:projectId/revision-items -> checklist across the project
    @Get('projects/:projectId/revision-items')
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
    review(
        @Param('itemId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: ReviewItemDto,
    ) {
        return this.items.review(id, user, dto);
    }
}
