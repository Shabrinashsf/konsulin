import {
    Body,
    Controller,
    Delete,
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
import { InvitationService } from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationQueryDto } from './dto/invitation-query.dto';
import { RespondInvitationDto } from './dto/respond-invitation.dto';
import {
    ApiDataResponse,
    ApiErrors,
    ApiPageResponse,
} from '../../shared/http/api-docs';
import { InvitationResponseDto } from './dto/project-response.dto';

@ApiTags('Invitations')
@ApiBearerAuth()
@ApiErrors('UNAUTHORIZED')
@Controller()
export class InvitationController {
    constructor(private readonly invitations: InvitationService) {}

    // -- GET /projects/:projectId/invitations -> list project invitation
    @Roles('lecturer')
    @Get('projects/:projectId/invitations')
    @ApiPageResponse(InvitationResponseDto)
    @ApiErrors('VALIDATION', 'ROLE', 'PROJECT_NOT_FOUND')
    listForProject(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Query() q: InvitationQueryDto,
    ) {
        return this.invitations.listForProject(projectId, user.id, q);
    }

    // -- POST /projects/:projectId/invitations -> send invitation
    @Roles('lecturer')
    @Post('projects/:projectId/invitations')
    @ApiDataResponse(InvitationResponseDto, 201)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'PROJECT_NOT_FOUND',
        'STUDENT_NOT_FOUND',
        'DEGREE_MISMATCH',
        'ALREADY_MEMBER',
        'INVITATION_ALREADY_PENDING',
    )
    create(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Body() dto: CreateInvitationDto,
    ) {
        return this.invitations.create(projectId, user.id, dto.studentId);
    }

    // -- DELETE /projects/:projectId/Invitations/:invitationId -> revoke pending invitation
    @Roles('lecturer')
    @Delete('projects/:projectId/invitations/:invitationId')
    @ApiDataResponse(InvitationResponseDto)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'PROJECT_NOT_FOUND',
        'INVITATION_NOT_FOUND',
        'INVITATION_EXPIRED',
        'INVITATION_NOT_PENDING',
    )
    revoke(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Param('invitationId', ParseUUIDPipe) invitationId: string,
    ) {
        return this.invitations.revoke(projectId, user.id, invitationId);
    }

    // -- GET /invitations/me -> my invitations
    @Roles('student')
    @Get('invitations/me')
    @ApiPageResponse(InvitationResponseDto)
    @ApiErrors('VALIDATION', 'ROLE')
    listMine(@CurrentUser() user: AuthUser, @Query() q: InvitationQueryDto) {
        return this.invitations.listMine(user.id, q);
    }

    // -- POST /invitations/:invitationId/respond -> accept or decline a invitation
    @Roles('student')
    @Post('invitations/:invitationId/respond')
    @HttpCode(200)
    @ApiDataResponse(InvitationResponseDto)
    @ApiErrors(
        'VALIDATION',
        'ROLE',
        'INVITATION_NOT_FOUND',
        'INVITATION_EXPIRED',
        'INVITATION_NOT_PENDING',
    )
    respond(
        @CurrentUser() user: AuthUser,
        @Param('invitationId', ParseUUIDPipe) invitationId: string,
        @Body() dto: RespondInvitationDto,
    ) {
        return this.invitations.respond(invitationId, user.id, dto.action);
    }
}
