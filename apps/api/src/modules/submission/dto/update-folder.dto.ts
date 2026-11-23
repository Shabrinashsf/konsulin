import { Transform } from 'class-transformer';
import {
    IsOptional,
    IsString,
    Length,
    MaxLength,
    ValidateIf,
} from 'class-validator';
import { trim } from '../../../shared/http/transforms';
import { IsDateTime, isPresent } from '../../../shared/http/validators';

// the track owner (studentId) cannot change
export class UpdateFolderDto {
    // null is rejected
    @ValidateIf(isPresent)
    @Transform(trim)
    @IsString()
    @Length(1, 200)
    title?: string;

    // empty or null clears it
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2000)
    description?: string | null;

    // lecturer only; null clears it
    @IsOptional()
    @IsDateTime()
    deadlineAt?: string | null;
}
