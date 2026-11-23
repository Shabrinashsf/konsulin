import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { trim } from '../../../shared/http/transforms';

export class UploadVersionDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2000)
    note?: string;
}
