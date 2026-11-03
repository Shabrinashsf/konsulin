import { Controller } from '@nestjs/common';
import { HealthService } from './health.service';
import { Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

    @Get()
    check() {
        return this.healthService.check();
    }
}
