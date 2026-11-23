import { Text } from '../../../shared/http/validators';

export class CompleteConsultationDto {
    // logbook summary
    @Text(5000)
    summary: string;
}
