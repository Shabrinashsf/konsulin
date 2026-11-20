import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { StudyProgramController } from './study-program.controller';
import { StudyProgramService } from './study-program.service';

@Module({
    controllers: [AuthController, StudyProgramController, StudentController],
    providers: [AuthService, StudyProgramService, StudentService],
    exports: [StudentService],
})
export class IdentityModule {}
