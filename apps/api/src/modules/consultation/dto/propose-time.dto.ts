import { IsEnum, IsOptional } from 'class-validator';
import { ConsultationMode } from '../../../generated/prisma/client';
import { IsDateTime } from '../../../shared/http/validators';
import { Text } from './consultation-body';

// a time proposal; location/mode only from the lecturer
export class ProposeTimeDto {
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
