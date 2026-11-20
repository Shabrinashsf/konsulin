import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { StudyProgramController } from './study-program.controller';
import { StudyProgramService } from './study-program.service';

@Module({
    controllers: [StudyProgramController, StudentController],
    providers: [StudyProgramService, StudentService],
    exports: [StudentService],
})
export class IdentityModule {}
