import { Text } from '../../../shared/http/validators';

export class RejectConsultationDto {
    @Text(5000)
    reason: string;
}
