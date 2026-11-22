import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { StudyProgramController } from './study-program.controller';
import { StudyProgramService } from './study-program.service';

@Module({
    imports: [ProjectModule],
    controllers: [AuthController, StudyProgramController, StudentController],
    providers: [AuthService, StudyProgramService, StudentService],
})
export class IdentityModule {}
