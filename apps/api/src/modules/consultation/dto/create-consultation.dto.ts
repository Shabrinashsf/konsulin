import { Transform } from 'class-transformer';
import {
    IsEnum,
    IsOptional,
    IsString,
    Length,
    MaxLength,
} from 'class-validator';
import { ConsultationMode } from '../../../generated/prisma/client';
import { trim } from '../../../shared/http/transforms';
import { IsDateOnly } from '../../../shared/http/validators';
import { Text } from './consultation-body';

export class CreateConsultationDto {
    // WIB date the student asks for
    @IsDateOnly()
    requestedDate: string;

    @Transform(trim)
    @IsString()
    @Length(3, 200)
    topic: string;

    @Text(5000)
    agenda: string;

    @IsEnum(ConsultationMode)
    mode: ConsultationMode;

    // optional note for the lecturer
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    note?: string | null;
}
