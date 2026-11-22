import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../shared/auth/auth.decorators';
import { type ProjectRow, ProjectRepository } from './project.repository';

// policy project access, not an owner or a member -> 404
@Injectable()
export class ProjectAccessService {
    constructor(private readonly projects: ProjectRepository) {}

    // check whether user can see the project
    async getVisibleProject(projectId: string, user: AuthUser) {
        return orFail(await this.projects.findVisible(projectId, user));
    }

    // check whether user is an owner of the project
    async getOwnedProject(projectId: string, lecturerId: string) {
        return orFail(await this.projects.findOwned(projectId, lecturerId));
    }
}

function orFail(project: ProjectRow | null) {
    if (!project) {
        throw new NotFoundException({
            message: 'Project tidak ditemukan',
            code: 'PROJECT_NOT_FOUND',
        });
    }
    return project;
}
