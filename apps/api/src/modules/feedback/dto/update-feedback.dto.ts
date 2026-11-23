import { Text } from '../../../shared/http/validators';

// revision items cannot change once created
export class UpdateFeedbackDto {
    @Text(10000)
    content: string;
}
