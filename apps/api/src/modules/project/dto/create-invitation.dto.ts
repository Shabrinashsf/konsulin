import { IsUUID } from 'class-validator';

export class CreateInvitationDto {
    // student id
    @IsUUID()
    studentId: string;
}
