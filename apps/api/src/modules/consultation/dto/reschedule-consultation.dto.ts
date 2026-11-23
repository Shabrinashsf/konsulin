import { IsEnum, IsOptional } from 'class-validator';
import { ConsultationMode } from '../../../generated/prisma/client';
import { IsDateTime, Text } from '../../../shared/http/validators';

export class RescheduleConsultationDto {
    @IsDateTime()
    startAt: string;

    @IsDateTime()
    endAt: string;

    @IsOptional()
    @Text(255)
    location?: string;

    @IsOptional()
    @IsEnum(ConsultationMode)
    mode?: ConsultationMode;
}
