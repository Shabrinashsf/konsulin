import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../shared/auth/auth.decorators';
import { type ProjectRow, ProjectRepository } from './project.repository';
import { notFound } from '../../shared/http/http-exception.filter';

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
        throw notFound('PROJECT_NOT_FOUND', 'Project tidak ditemukan');
    }
    return project;
}
