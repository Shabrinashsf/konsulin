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
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
    type AuthUser,
    CurrentUser,
    Roles,
} from '../../shared/auth/auth.decorators';
import { PaginationQueryDto } from '../../shared/http/pagination-query.dto';
import { UploadVersionDto } from './dto/upload-version.dto';
import { RemoveTmpFile, UploadAccessGuard } from './upload';
import { VersionService } from './version.service';

@ApiTags('Submissions')
@ApiBearerAuth()
@Controller()
export class VersionController {
    constructor(private readonly versions: VersionService) {}

    // -- GET /folders/:folderId/versions -> versions, newest first
    @Get('folders/:folderId/versions')
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
    download(
        @Param('versionId', ParseUUIDPipe) id: string,
        @CurrentUser() user: AuthUser,
    ) {
        return this.versions.download(id, user);
    }
}
