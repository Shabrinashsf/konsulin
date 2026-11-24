import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiOkResponse,
    ApiTags,
} from '@nestjs/swagger';
import {
    type AuthUser,
    CurrentUser,
    Roles,
} from '../../shared/auth/auth.decorators';
import { PaginationQueryDto } from '../../shared/http/pagination-query.dto';
import { UploadVersionDto } from './dto/upload-version.dto';
import { RemoveTmpFile, UploadAccessGuard } from './upload';
import { VersionService } from './version.service';
import {
    ApiDataResponse,
    ApiErrors,
    ApiPageResponse,
} from '../../shared/http/api-docs';
import { VersionResponseDto } from './dto/submission-response.dto';
import { FILE_TYPES } from './file-signature';

@ApiTags('Submissions')
@ApiBearerAuth()
@ApiErrors('UNAUTHORIZED')
@Controller()
export class VersionController {
    constructor(private readonly versions: VersionService) {}

    // -- GET /folders/:folderId/versions -> versions, newest first
    @Get('folders/:folderId/versions')
    @ApiPageResponse(VersionResponseDto)
    @ApiErrors('VALIDATION', 'FOLDER_NOT_FOUND')
    list(
        @Param('folderId', ParseUUIDPipe) folderId: string,
        @CurrentUser() user: AuthUser,
        @Query() q: PaginationQueryDto,
    ) {
        return this.versions.list(folderId, user, q);
    }

    // -- POST /folders/:folderId/versions -> upload a new version (multipart)
    @Post('folders/:folderId/versions')
    @Roles('student')
    @UseGuards(UploadAccessGuard)
    @UseInterceptors(FileInterceptor('file'), RemoveTmpFile)
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['file'],
            properties: {
                file: { type: 'string', format: 'binary' },
                note: { type: 'string' },
            },
        },
    })
    @ApiDataResponse(VersionResponseDto, 201)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'FOLDER_NOT_FOUND',
        'TOO_LARGE',
        'FILE_REQUIRED',
        'INVALID_FILE_TYPE',
        'STORAGE_UNAVAILABLE',
    )
    upload(
        @Param('folderId', ParseUUIDPipe) folderId: string,
        @CurrentUser() user: AuthUser,
        @UploadedFile() file: Express.Multer.File | undefined,
        @Body() dto: UploadVersionDto,
    ) {
        return this.versions.upload(folderId, user, file, dto);
    }

    // -- GET /versions/:versionId/download -> the file, streamed
    @Get('versions/:versionId/download')
    @ApiOkResponse({
        description:
            "The file, with `Content-Disposition: attachment; filename*=UTF-8''…`.",
        content: Object.fromEntries(
            FILE_TYPES.map((type) => [
                type,
                { schema: { type: 'string', format: 'binary' } },
            ]),
        ),
    })
    @ApiErrors('VALIDATION', 'VERSION_NOT_FOUND', 'STORAGE_UNAVAILABLE')
    download(
        @Param('versionId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.versions.download(id, user);
    }
}
