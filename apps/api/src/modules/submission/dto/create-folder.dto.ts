import { Transform } from 'class-transformer';
import {
    IsOptional,
    IsString,
    IsUUID,
    Length,
    MaxLength,
} from 'class-validator';
import { trim } from '../../../shared/http/transforms';
import { IsDateTime } from '../../../shared/http/validators';

export class CreateFolderDto {
    @Transform(trim)
    @IsString()
    @Length(1, 200)
    title: string;

    // empty clears it
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2000)
    description?: string | null;

    // lecturer only, required on individual projects
    @IsOptional()
    @IsUUID()
    studentId?: string;

    // lecturer only, ISO date-time with offset; null clears it
    @IsOptional()
    @IsDateTime()
    deadlineAt?: string | null;
}
