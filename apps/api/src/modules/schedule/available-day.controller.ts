import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../../shared/auth/auth.decorators';
import { AvailableDayService } from './available-day.service';
import { AvailableDaysQueryDto } from './dto/available-days-query.dto';

@ApiTags('Schedule')
@ApiBearerAuth()
@Controller('projects/:projectId/available-days')
export class AvailableDayController {
    constructor(private readonly availableDays: AvailableDayService) {}

    // -- GET /projects/:projectId/available-days -> dates the lecturer can be requested on
    @Get()
    list(
        @CurrentUser() user: AuthUser,
        @Param('projectId', ParseUUIDPipe) projectId: string,
        @Query() q: AvailableDaysQueryDto,
    ) {
        return this.availableDays.list(projectId, user, q);
    }
}
