import { Module } from '@nestjs/common';
import { InvitationController } from './invitation.controller';
import { InvitationRepository } from './invitation.repository';
import { InvitationService } from './invitation.service';
import { ProjectAccessService } from './project-access.service';
import { ProjectController } from './project.controller';
import { ProjectRepository } from './project.repository';
import { ProjectService } from './project.service';

@Module({
    controllers: [ProjectController, InvitationController],
    providers: [
        ProjectRepository,
        InvitationRepository,
        ProjectAccessService,
        ProjectService,
        InvitationService,
    ],
    exports: [ProjectAccessService],
})
export class ProjectModule {}
