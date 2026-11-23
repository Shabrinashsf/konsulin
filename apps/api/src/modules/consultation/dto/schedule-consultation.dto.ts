import { Transform } from 'class-transformer';
import { IsEnum, IsString, IsUUID, Length } from 'class-validator';
import { ConsultationMode } from '../../../generated/prisma/client';
import { trim } from '../../../shared/http/transforms';
import { IsDateTime, Text } from '../../../shared/http/validators';

// lecturer schedules directly → approved
export class ScheduleConsultationDto {
    @IsUUID()
    studentId: string;

    @IsDateTime()
    startAt: string;

    @IsDateTime()
    endAt: string;

    @Transform(trim)
    @IsString()
    @Length(3, 200)
    topic: string;

    @Text(5000)
    agenda: string;

    @IsEnum(ConsultationMode)
    mode: ConsultationMode;

    @Text(255)
    location: string;
}
