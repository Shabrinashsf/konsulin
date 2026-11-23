import { Text } from '../../../shared/http/validators';
import { IsOptional } from 'class-validator';

export class AcceptProposalDto {
    // lecturer only, when accepting a student's proposal
    @IsOptional()
    @Text(255)
    location?: string;
}
