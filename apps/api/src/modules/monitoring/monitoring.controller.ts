import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
    type AuthUser,
    CurrentUser,
    Roles,
} from '../../shared/auth/auth.decorators';
import { MonitoringQueryDto } from './dto/monitoring-query.dto';
import { MonitoringService } from './monitoring.service';
import { ApiErrors, ApiPageResponse } from '../../shared/http/api-docs';
import { MonitoredStudentResponseDto } from './dto/monitoring-response.dto';

@ApiTags('Monitoring')
@ApiBearerAuth()
@ApiErrors('UNAUTHORIZED')
@Roles('lecturer')
@Controller('monitoring')
export class MonitoringController {
    constructor(private readonly monitoring: MonitoringService) {}

    // -- GET /monitoring/students -> my students and their progress
    @Get('students')
    @ApiPageResponse(MonitoredStudentResponseDto)
    @ApiErrors('VALIDATION', 'ROLE', 'PROJECT_NOT_FOUND')
    students(@CurrentUser() user: AuthUser, @Query() q: MonitoringQueryDto) {
        return this.monitoring.students(user.id, q);
    }
}
