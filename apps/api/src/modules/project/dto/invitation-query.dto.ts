import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/http/pagination-query.dto';
import { INVITATION_VIEWS, type InvitationView } from '../invitation-state';

export class InvitationQueryDto extends PaginationQueryDto {
    // project invitation status
    @IsOptional()
    @IsIn(INVITATION_VIEWS)
    status?: InvitationView;
}
