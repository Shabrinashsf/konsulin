import type { ProjectType } from '../../generated/prisma/client';
import type { Degree } from '../identity/degree';

export type TrackMode = 'individual' | 'shared';

export interface ProjectTypeRule {
    label: string;
    requiredDegree: Degree | null;
    trackMode: TrackMode;
}

export const PROJECT_TYPE_RULES = {
    s1_thesis_proposal: {
        label: 'Proposal Tugas Akhir',
        requiredDegree: 'S1',
        trackMode: 'individual',
    },
    s1_thesis: {
        label: 'Tugas Akhir',
        requiredDegree: 'S1',
        trackMode: 'individual',
    },
    s2_thesis_proposal: {
        label: 'Proposal Tesis',
        requiredDegree: 'S2',
        trackMode: 'individual',
    },
    s2_thesis: {
        label: 'Tesis',
        requiredDegree: 'S2',
        trackMode: 'individual',
    },
    s3_dissertation_proposal: {
        label: 'Proposal Disertasi',
        requiredDegree: 'S3',
        trackMode: 'individual',
    },
    s3_dissertation: {
        label: 'Disertasi',
        requiredDegree: 'S3',
        trackMode: 'individual',
    },
    research: {
        label: 'Riset',
        requiredDegree: null,
        trackMode: 'shared',
    },
    publication: {
        label: 'Publikasi Ilmiah',
        requiredDegree: null,
        trackMode: 'shared',
    },
    competition: {
        label: 'Lomba',
        requiredDegree: null,
        trackMode: 'shared',
    },
    external_project: {
        label: 'Project Luar',
        requiredDegree: null,
        trackMode: 'shared',
    },
} as const satisfies Record<ProjectType, ProjectTypeRule>;

export const isIndividual = (type: ProjectType) =>
    PROJECT_TYPE_RULES[type].trackMode === 'individual';

export const PROJECT_TYPES = Object.keys(PROJECT_TYPE_RULES) as ProjectType[];

// change degree (S1/S2/S3) to a list of valid project type for that degree, ex: S1 -> 's1_thesis_proposal', 's1_thesis'
export const typesForDegree = (degree: Degree) =>
    PROJECT_TYPES.filter(
        (t) => PROJECT_TYPE_RULES[t].requiredDegree === degree,
    );

// check whether a student with x degree can join the project with a y project type
export const canJoin = (type: ProjectType, studentDegree: Degree) => {
    const required = PROJECT_TYPE_RULES[type].requiredDegree;
    return required === null || required === studentDegree;
};
