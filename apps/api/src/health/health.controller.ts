import { Controller, Get } from '@nestjs/common';
import { Public } from '../shared/auth/auth.decorators';
import {
    APP_TIMEZONE,
    toJakartaDate,
    toJakartaTime,
} from '../shared/time/time';
import { ApiTags } from '@nestjs/swagger';
import { ApiDataResponse } from '../shared/http/api-docs';
import { HealthResponseDto } from './health-response.dto';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
    // check with the server time in UTC and WIB
    @Get()
    @ApiDataResponse(HealthResponseDto)
    check() {
        const now = new Date();
        return {
            status: 'ok',
            timezone: APP_TIMEZONE,
            time: now.toISOString(),
            local: { date: toJakartaDate(now), time: toJakartaTime(now) },
        };
    }
}
