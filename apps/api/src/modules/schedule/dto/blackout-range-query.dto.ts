import { IsDateOnly } from '../../../shared/http/validators';

export class BlackoutRangeQueryDto {
    // WIB date range, inclusive
    @IsDateOnly()
    from: string;

    @IsDateOnly()
    to: string;
}
