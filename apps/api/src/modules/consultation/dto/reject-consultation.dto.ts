import { Text } from './consultation-body';

export class RejectConsultationDto {
    @Text(5000)
    reason: string;
}
