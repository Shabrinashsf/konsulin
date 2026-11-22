import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { ConsultationController } from './consultation.controller';
import { ConsultationRepository } from './consultation.repository';
import { ConsultationService } from './consultation.service';

@Module({
    imports: [ProjectModule],
    controllers: [ConsultationController],
    providers: [ConsultationRepository, ConsultationService],
})
export class ConsultationModule {}
