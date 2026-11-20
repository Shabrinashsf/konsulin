import { IsIn, IsOptional } from 'class-validator';
import { DEGREES, type Degree } from '../degree';

export class StudyProgramQueryDto {
    @IsOptional() @IsIn(DEGREES) degree?: Degree;
}
