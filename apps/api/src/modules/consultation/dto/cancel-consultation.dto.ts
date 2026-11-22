import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { trim } from '../../../shared/http/transforms';

export class CancelConsultationDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(5000)
    reason?: string | null;
}
