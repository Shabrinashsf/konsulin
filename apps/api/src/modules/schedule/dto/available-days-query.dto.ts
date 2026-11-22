import { IsDateOnly } from '../../../shared/http/validators';

export class AvailableDaysQueryDto {
    // WIB date range, inclusive, at most 42 days (calendar grid)
    @IsDateOnly()
    from: string;

    @IsDateOnly()
    to: string;
}
