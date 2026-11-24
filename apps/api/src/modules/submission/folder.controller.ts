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
import {
    ApiDataResponse,
    ApiErrors,
    ApiPageResponse,
} from '../../shared/http/api-docs';
import {
    FolderDetailResponseDto,
    FolderResponseDto,
} from './dto/submission-response.dto';

@ApiTags('Submissions')
@ApiBearerAuth()
@ApiErrors('UNAUTHORIZED')
@Controller()
export class FolderController {
    constructor(private readonly folders: FolderService) {}

    // -- GET /projects/:projectId/folders -> folders of a project
    @Get('projects/:projectId/folders')
    @ApiPageResponse(FolderResponseDto)
    @ApiErrors('VALIDATION', 'PROJECT_NOT_FOUND')
    list(
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @CurrentUser() user: AuthUser,
        @Query() q: FolderQueryDto,
    ) {
        return this.folders.list(projectId, user, q);
    }

    // -- POST /projects/:projectId/folders -> create a folder
    @Post('projects/:projectId/folders')
    @ApiDataResponse(FolderResponseDto, 201)
    @ApiErrors(
        'VALIDATION',
        'PROJECT_NOT_FOUND',
        'LECTURER_ONLY',
        'DEADLINE_IN_PAST',
        'STUDENT_NOT_ALLOWED',
        'STUDENT_REQUIRED',
        'STUDENT_NOT_MEMBER',
    )
    create(
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: CreateFolderDto,
    ) {
        return this.folders.create(projectId, user, dto);
    }

    // -- GET /folders/:folderId -> folder + latest version
    @Get('folders/:folderId')
    @ApiDataResponse(FolderDetailResponseDto)
    @ApiErrors('VALIDATION', 'FOLDER_NOT_FOUND')
    get(
        @Param('folderId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.folders.get(id, user);
    }

    // -- PATCH /folders/:folderId -> update title, description, deadline (lecturer)
    @Patch('folders/:folderId')
    @ApiDataResponse(FolderResponseDto)
    @ApiErrors(
        'VALIDATION',
        'FOLDER_NOT_FOUND',
        'NOT_FOLDER_CREATOR',
        'LECTURER_ONLY',
        'DEADLINE_IN_PAST',
    )
    update(
        @Param('folderId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: UpdateFolderDto,
    ) {
        return this.folders.update(id, user, dto);
    }

    // -- DELETE /folders/:folderId -> soft delete
    @Delete('folders/:folderId')
    @ApiDataResponse(null)
    @ApiErrors(
        'VALIDATION',
        'FOLDER_NOT_FOUND',
        'NOT_FOLDER_CREATOR',
        'FOLDER_HAS_VERSIONS',
    )
    remove(
        @Param('folderId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.folders.remove(id, user);
    }
}
