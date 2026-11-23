import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringRepository } from './monitoring.repository';
import { MonitoringService } from './monitoring.service';

@Module({
    imports: [ProjectModule],
    controllers: [MonitoringController],
    providers: [MonitoringRepository, MonitoringService],
})
export class MonitoringModule {}
