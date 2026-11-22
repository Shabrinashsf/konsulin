import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { trim } from '../../../shared/http/transforms';
import { IsDateOnly } from '../../../shared/http/validators';

export class CreateBlackoutDateDto {
    // WIB date range, inclusive (one day: from = to), max 90 days
    @IsDateOnly()
    from: string;

    @IsDateOnly()
    to: string;

    // only visible to the lecturer
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(255)
    reason?: string | null;

    // confirm cancelling affected consultations (BR-10)
    @IsOptional()
    @IsBoolean()
    cancelConsultations?: boolean;
}
