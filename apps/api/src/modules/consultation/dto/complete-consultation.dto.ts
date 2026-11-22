import { Text } from './consultation-body';

export class CompleteConsultationDto {
    // logbook summary
    @Text(5000)
    summary: string;
}
