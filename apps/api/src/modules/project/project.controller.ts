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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectController {
    constructor(private readonly projects: ProjectService) {}

    // -- GET /projects -> list of Lecture/Student project
    @Get()
    list(@CurrentUser() user: AuthUser, @Query() q: ProjectQueryDto) {
        return this.projects.list(user, q);
    }

    // -- POST /projects -> make a project
    @Roles('lecturer')
    @Post()
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
        return this.projects.create(user.id, dto);
    }

    // -- GET /projects/:projectId -> detail of a Lecture/Student project
    @Get(':projectId')
    get(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
    ) {
        return this.projects.get(projectId, user);
    }

    // -- PATCH /project/:projectId -> change a project
    @Roles('lecturer')
    @Patch(':projectId')
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
    async remove(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
    ) {
        await this.projects.remove(projectId, user.id);
    }

    // -- GET /projects/:projectId/members -> member list of a project
    @Get(':projectId/members')
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
    async removeMember(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Param('studentId', ParseUUIDPipe) studentId: string,
    ) {
        await this.projects.removeMember(projectId, user.id, studentId);
    }
}
