import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../../shared/auth/auth.decorators';
import { CreateFolderDto } from './dto/create-folder.dto';
import { FolderQueryDto } from './dto/folder-query.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { FolderService } from './folder.service';

@ApiTags('Submissions')
@ApiBearerAuth()
@Controller()
export class FolderController {
    constructor(private readonly folders: FolderService) {}

    // -- GET /projects/:projectId/folders -> folders of a project
    @Get('projects/:projectId/folders')
    list(
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @CurrentUser() user: AuthUser,
        @Query() q: FolderQueryDto,
    ) {
        return this.folders.list(projectId, user, q);
    }

    // -- POST /projects/:projectId/folders -> create a folder
    @Post('projects/:projectId/folders')
    create(
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: CreateFolderDto,
    ) {
        return this.folders.create(projectId, user, dto);
    }

    // -- GET /folders/:folderId -> folder + latest version
    @Get('folders/:folderId')
    get(
        @Param('folderId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.folders.get(id, user);
    }

    // -- PATCH /folders/:folderId -> update title, description, deadline (lecturer)
    @Patch('folders/:folderId')
    update(
        @Param('folderId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: UpdateFolderDto,
    ) {
        return this.folders.update(id, user, dto);
    }

    // -- DELETE /folders/:folderId -> soft delete
    @Delete('folders/:folderId')
    remove(
        @Param('folderId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.folders.remove(id, user);
    }
}
