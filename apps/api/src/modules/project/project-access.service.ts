import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../shared/auth/auth.decorators';
import { type ProjectRow, ProjectRepository } from './project.repository';
import { apiError } from '../../shared/http/errors';

// policy project access, not an owner or a member -> 404
@Injectable()
export class ProjectAccessService {
    constructor(private readonly projects: ProjectRepository) {}

    // check whether user can see the project
    async getVisibleProject(projectId: string, user: AuthUser) {
        return orFail(await this.projects.findVisible(projectId, user));
    }

    // current member with an active account
    isMember(projectId: string, studentId: string) {
        return this.projects.isMember(projectId, studentId);
    }

    // check whether user is an owner of the project
    async getOwnedProject(projectId: string, lecturerId: string) {
        return orFail(await this.projects.findOwned(projectId, lecturerId));
    }
}

function orFail(project: ProjectRow | null) {
    if (!project) {
        throw apiError('PROJECT_NOT_FOUND');
    }
    return project;
}
