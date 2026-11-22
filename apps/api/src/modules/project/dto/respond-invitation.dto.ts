import { IsIn } from 'class-validator';

export class RespondInvitationDto {
    @IsIn(['accept', 'decline'])
    action: 'accept' | 'decline';
}
