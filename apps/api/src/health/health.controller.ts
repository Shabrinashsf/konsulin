import { Controller, Get } from '@nestjs/common';
import {
    APP_TIMEZONE,
    toJakartaDate,
    toJakartaTime,
} from '../shared/time/time';

@Controller('health')
export class HealthController {
    @Get()
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
