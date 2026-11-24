import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import {
    type AuthUser,
    CurrentUser,
    Roles,
} from '../../shared/auth/auth.decorators';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { MemberQueryDto } from './dto/member-query.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
    ApiDataResponse,
    ApiErrors,
    ApiPageResponse,
} from '../../shared/http/api-docs';
import {
    MemberResponseDto,
    ProjectDetailResponseDto,
    ProjectResponseDto,
} from './dto/project-response.dto';

@ApiTags('Projects')
@ApiBearerAuth()
@ApiErrors('UNAUTHORIZED')
@Controller('projects')
export class ProjectController {
    constructor(private readonly projects: ProjectService) {}

    // -- GET /projects -> list of Lecture/Student project
    @Get()
    @ApiPageResponse(ProjectResponseDto)
    @ApiErrors('VALIDATION')
    list(@CurrentUser() user: AuthUser, @Query() q: ProjectQueryDto) {
        return this.projects.list(user, q);
    }

    // -- POST /projects -> make a project
    @Roles('lecturer')
    @Post()
    @ApiDataResponse(ProjectResponseDto, 201)
    @ApiErrors('VALIDATION', 'ROLE', 'INVALID_DATE_RANGE')
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
        return this.projects.create(user.id, dto);
    }

    // -- GET /projects/:projectId -> detail of a Lecture/Student project
    @Get(':projectId')
    @ApiDataResponse(ProjectDetailResponseDto)
    @ApiErrors('VALIDATION', 'PROJECT_NOT_FOUND')
    get(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
    ) {
        return this.projects.get(projectId, user);
    }

    // -- PATCH /project/:projectId -> change a project
    @Roles('lecturer')
    @Patch(':projectId')
    @ApiDataResponse(ProjectResponseDto)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'PROJECT_NOT_FOUND',
        'INVALID_DATE_RANGE',
        'PROJECT_TYPE_LOCKED',
    )
    update(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Body() dto: UpdateProjectDto,
    ) {
        return this.projects.update(projectId, user.id, dto);
    }

    // -- DELETE /projects/:projectId -> soft delete a project
    @Roles('lecturer')
    @Delete(':projectId')
    @HttpCode(204)
    @ApiNoContentResponse()
    @ApiErrors('VALIDATION', 'ROLE', 'PROJECT_NOT_FOUND')
    async remove(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
    ) {
        await this.projects.remove(projectId, user.id);
    }

    // -- GET /projects/:projectId/members -> member list of a project
    @Get(':projectId/members')
    @ApiPageResponse(MemberResponseDto)
    @ApiErrors('VALIDATION', 'PROJECT_NOT_FOUND')
    listMembers(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Query() q: MemberQueryDto,
    ) {
        return this.projects.listMembers(projectId, user, q);
    }

    // -- DELETE /projects/:projectId/members/:studentId -> drop a student (it's history stil exists)
    @Roles('lecturer')
    @Delete(':projectId/members/:studentId')
    @HttpCode(204)
    @ApiNoContentResponse()
    @ApiErrors('VALIDATION', 'ROLE', 'PROJECT_NOT_FOUND', 'MEMBER_NOT_FOUND')
    async removeMember(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Param('studentId', ParseUUIDPipe) studentId: string,
    ) {
        await this.projects.removeMember(projectId, user.id, studentId);
    }
}
