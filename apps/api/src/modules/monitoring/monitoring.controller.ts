import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
    type AuthUser,
    CurrentUser,
    Roles,
} from '../../shared/auth/auth.decorators';
import { MonitoringQueryDto } from './dto/monitoring-query.dto';
import { MonitoringService } from './monitoring.service';

@ApiTags('Monitoring')
@ApiBearerAuth()
@Roles('lecturer')
@Controller('monitoring')
export class MonitoringController {
    constructor(private readonly monitoring: MonitoringService) {}

    // -- GET /monitoring/students -> my students and their progress
    @Get('students')
    students(@CurrentUser() user: AuthUser, @Query() q: MonitoringQueryDto) {
        return this.monitoring.students(user.id, q);
    }
}
