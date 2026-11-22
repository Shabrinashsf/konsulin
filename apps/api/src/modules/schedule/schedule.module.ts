import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { AvailableDayController } from './available-day.controller';
import { AvailableDayService } from './available-day.service';
import { BlackoutDateController } from './blackout-date.controller';
import { BlackoutDateRepository } from './blackout-date.repository';
import { BlackoutDateService } from './blackout-date.service';

@Module({
    imports: [ProjectModule],
    controllers: [BlackoutDateController, AvailableDayController],
    providers: [
        BlackoutDateRepository,
        BlackoutDateService,
        AvailableDayService,
    ],
})
export class ScheduleModule {}
