import { IsOptional } from 'class-validator';
import { Text } from './consultation-body';

export class AcceptProposalDto {
    // lecturer only, when accepting a student's proposal
    @IsOptional()
    @Text(255)
    location?: string;
}
